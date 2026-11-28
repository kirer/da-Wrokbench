import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { API_PREFIX, AUTH_COOKIE, AUTH_STATE_COOKIE, IS_PRODUCTION, ALLOW_REMOTE_BFF } from './config.js'
import { greetingMessageText } from './greeting.js'
import { httpError } from './util.js'
import { defaultBaseDir, refreshLocal, saveLocal, localUser, baseDirFor, ensureBaseDir, isInside, assertNoSymlinkBetween, assertLocalFolderInside, safeSegment, resolveAndCreateTopFolder, ensureRequirementFolder, PROTOTYPE_DIR, DESIGN_DIR, BLANK_CANVAS_NAME, BLANK_CANVAS_HTML, BLANK_DESIGN_HTML, listDesignFiles, removeLocalDesignFiles, listDesignSupportFiles, attachWorkingFolders, unsafeBaseDirReason } from './local.js'
import { serverState, serverRaw, serverJson, serverAs, authConfig, withoutLocalPaths, serverStream } from './server.js'
import { PREVIEW_TICKET_TTL_MS, mintPreviewTicket, verifyPreviewTicket, parseCookies, serializeCookie, appendCookie, json, readJson, requestOrigin, redirect, htmlPage, assertSameOrigin, safeReturnTo, tokenFromRequest, authSessionCache, invalidateAuthSessionsForUser, isBinaryBuffer, sessionFromRequest, isLoopbackRequest, remoteAllowedRoute, issueAuthCookie } from './http.js'
import { folderPathFor, decorateRequirement, decorateState, findMappedRecord, findSessionOwner, removeRequirementFolders, forgetRequirementLocalState, attachDesignScreens } from './state.js'
import { syncWorkspaceFiles, requirementFolder, ensureRequirementFolderFor, DESIGN_PREVIEW_TYPES, inlinePreviewAssets, sendDesignPreview, codeBrowserDenied, CODE_PREVIEW_MAX_BYTES, uploadDesignArtifacts, PROTOTYPE_ARTIFACT_KIND } from './ops.js'
import { noteActiveWorkbenchUser, syncPublishedSkills } from './skills.js'

// 版本快照目录（~/.dsh/cache/dsh-workbench/versions/）会随每次预览不断增长，
// 之前只在覆盖同一版本时清理，从不清已删除/长期未访问的目录。这里按小时节流地
// 清掉超过 7 天没碰过的快照，并回收变空的需求目录。
let lastVersionsPruneAt = 0
function pruneVersionsCache(maxAgeMs = 7 * 24 * 3600 * 1000) {
  const now = Date.now()
  if (now - lastVersionsPruneAt < 60 * 60 * 1000) return
  lastVersionsPruneAt = now
  const root = path.join(os.homedir(), '.dsh', 'cache', 'dsh-workbench', 'versions')
  let entries
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return }
  for (const reqDir of entries) {
    if (!reqDir.isDirectory()) continue
    const reqPath = path.join(root, reqDir.name)
    let sub
    try { sub = fs.readdirSync(reqPath, { withFileTypes: true }) } catch { continue }
    let remaining = 0
    for (const item of sub) {
      if (!item.isDirectory()) continue
      const itemPath = path.join(reqPath, item.name)
      try {
        if (now - fs.statSync(itemPath).mtimeMs > maxAgeMs) {
          fs.rmSync(itemPath, { recursive: true, force: true })
          continue
        }
      } catch { /* 单个目录异常不影响其它 */ }
      remaining += 1
    }
    if (remaining === 0) { try { fs.rmdirSync(reqPath) } catch { /* 非空或已删除 */ } }
  }
}

// 工作区文件同步会扫目录、可能上传附件；放到后台跑，别拖慢 /state 的响应。
// 同一用户同时只保留一个同步任务，避免被高频轮询打爆。
const workspaceSyncInFlight = new Set()
function scheduleWorkspaceSync(userId, data, local) {
  if (workspaceSyncInFlight.has(userId)) return
  workspaceSyncInFlight.add(userId)
  void syncWorkspaceFiles(userId, data, local)
    .catch((reason) => console.warn('[dsh-workbench] 后台工作区同步失败', reason))
    .finally(() => workspaceSyncInFlight.delete(userId))
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    throw httpError(400, '路径参数编码不合法')
  }
}

export function makeRoute(local, hostCtx = null) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    try {
      assertSameOrigin(req)
      refreshLocal(local)
      if (!ALLOW_REMOTE_BFF && !isLoopbackRequest(req) && !remoteAllowedRoute(route)) {
        return json(res, 403, { error: '本机工作台接口只允许通过 127.0.0.1/localhost 访问' })
      }
      // ---- public auth surface -------------------------------------------------
      if (req.method === 'GET' && route === '/health') {
        const server = await serverRaw('/health')
        if (!server.ok) {
          return json(res, 503, { ok: false, plugin: 'dsh-workbench', error: '团队服务端不可用' })
        }
        return json(res, 200, {
          ok: true,
          plugin: 'dsh-workbench',
          // 容器里的 DSH 网页经宿主机端口访问时，画布的随机预览端口在容器内，
          // 浏览器直接连不上；画布改用服务端打包的 srcdoc 预览。
          remotePreview: process.env.WORKBENCH_REMOTE_PREVIEW === '1'
            || String(process.env.DSH_WORKBENCH_BASE || '').startsWith('/workbench'),
          server: { ok: true, version: server.data?.version ?? null, database: server.data?.database ?? null },
        })
      }
      if (req.method === 'GET' && route === '/auth/config') {
        const config = await authConfig()
        return json(res, 200, isLoopbackRequest(req) ? config : withoutLocalPaths(config))
      }
      if (req.method === 'POST' && route === '/auth/mock') {
        if (IS_PRODUCTION) return json(res, 404, { error: 'Mock 登录未启用' })
        const body = await readJson(req)
        const result = await serverRaw('/auth/mock', { method: 'POST', body: { userId: body.userId } })
        if (!result.ok) return json(res, result.status, result.data)
        return json(res, 200, issueAuthCookie(req, res, result.data))
      }
      if (req.method === 'GET' && route === '/auth/session') {
        const session = await sessionFromRequest(req, local)
        const localRequest = isLoopbackRequest(req)
        if (session !== null) {
          const payload = { ...session.payload, authenticated: true }
          return json(res, 200, localRequest ? payload : withoutLocalPaths(payload))
        }
        let provider = 'mock'
        try { provider = (await authConfig()).provider || 'mock' } catch { /* server down */ }
        return json(res, 200, {
          authenticated: false,
          provider,
          ...(localRequest ? { defaultBaseDir: defaultBaseDir() } : {}),
        })
      }
      if (req.method === 'POST' && route === '/auth/logout') {
        const token = tokenFromRequest(req)
        if (token !== '') {
          authSessionCache.delete(token)
          // 只清 Cookie 不吊销，等于让被复制的 token 在 TTL 内继续有效（默认 7 天）。
          // 服务端把 jti 记进吊销集合；这里失败也不阻塞登出，本地照常清凭证。
          try {
            await serverRaw('/auth/logout', { method: 'POST', token })
          } catch (reason) {
            console.warn('[dsh-workbench] server logout failed', reason instanceof Error ? reason.message : reason)
          }
        }
        appendCookie(res, serializeCookie(AUTH_COOKIE, '', 0))
        return json(res, 200, { ok: true })
      }
      if (req.method === 'GET' && route === '/auth/dingtalk/start') {
        let config
        try { config = await authConfig() } catch (reason) {
          return htmlPage(res, 502, '团队服务端不可用', reason instanceof Error ? reason.message : String(reason))
        }
        if (config.provider !== 'dingtalk') return json(res, 404, { error: '钉钉登录未启用' })
        const clientId = config.dingtalk?.clientId || String(process.env.DINGTALK_CLIENT_ID || '').trim()
        if (clientId === '') return htmlPage(res, 500, '钉钉登录未配置', '服务端缺少 DINGTALK_CLIENT_ID。')
        const origin = requestOrigin(req)
        const state = crypto.randomBytes(16).toString('hex')
        const returnTo = safeReturnTo(req, url.searchParams.get('returnTo'))
        const redirectUri = process.env.WORKBENCH_PUBLIC_URL
          ? new URL(`${API_PREFIX}/auth/dingtalk/callback`, process.env.WORKBENCH_PUBLIC_URL).toString()
          : `${origin}${API_PREFIX}/auth/dingtalk/callback`
        appendCookie(res, serializeCookie(AUTH_STATE_COOKIE, JSON.stringify({ state, returnTo, redirectUri }), 600))
        const authUrl = new URL(process.env.DINGTALK_AUTH_URL || 'https://login.dingtalk.com/oauth2/auth')
        authUrl.searchParams.set('client_id', clientId)
        authUrl.searchParams.set('redirect_uri', redirectUri)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('scope', 'openid')
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('prompt', 'consent')
        return redirect(res, authUrl.toString())
      }
      if (req.method === 'GET' && route === '/auth/dingtalk/callback') {
        let saved = null
        try { saved = JSON.parse(parseCookies(req)[AUTH_STATE_COOKIE] || 'null') } catch { saved = null }
        appendCookie(res, serializeCookie(AUTH_STATE_COOKIE, '', 0))
        if (!saved || saved.state !== url.searchParams.get('state')) {
          return htmlPage(res, 400, '钉钉登录状态失效', '请返回工作台重新发起登录。')
        }
        const code = url.searchParams.get('code') || ''
        if (code === '') return htmlPage(res, 400, '钉钉登录失败', '没有收到授权码。')
        const result = await serverRaw('/auth/dingtalk/exchange', {
          method: 'POST',
          body: { code, redirectUri: saved.redirectUri },
        })
        if (!result.ok) {
          return htmlPage(res, result.status, '钉钉登录失败', result.data?.error || `HTTP ${result.status}`)
        }
        issueAuthCookie(req, res, result.data)
        return redirect(res, `${requestOrigin(req)}${safeReturnTo(req, saved.returnTo)}`)
      }

      // ---- authenticated -------------------------------------------------------
      // design-preview 走 iframe：沙箱里的请求带不上 Authorization（桌面端靠
      // localStorage 的 Bearer），也不能读父页面的 localStorage。所以它接受一次性
      // 的预览票据（短时、绑定用户与需求），其余接口仍然只认 Cookie / Bearer。
      const previewTicket = req.method === 'GET' && route === '/design-preview'
        ? verifyPreviewTicket(url.searchParams.get('ticket') || '')
        : null
      const session = previewTicket === null ? await sessionFromRequest(req, local) : null
      if (previewTicket === null && session === null) {
        return json(res, 401, { error: '请先在工作台登录', code: 'unauthorized' })
      }
      const userId = previewTicket === null ? session.user.id : previewTicket.userId
      // 技能和斜杠命令跟着“当前使用工作台的账号 + 当前身份”走；预览票据
      // 没有登录身份，不参与切换。
      if (previewTicket === null) noteActiveWorkbenchUser(local, session.user, session.token)

      // 页面里的缩略图 iframe 先来换预览票据：短时、绑定用户与需求，只能读 design-preview。
      // 一次最多换 50 条需求（开始页一屏的作品数远小于这个量）。
      if (req.method === 'POST' && route === '/preview-ticket') {
        const body = await readJson(req)
        const ids = Array.isArray(body.requirementIds) ? body.requirementIds : [body.requirementId]
        const unique = [...new Set(ids.filter(id => typeof id === 'string' && id.trim() !== '').map(id => id.trim()))]
        if (unique.length === 0) return json(res, 400, { error: '缺少需求 ID' })
        if (unique.length > 50) return json(res, 400, { error: '一次最多换 50 条需求的预览票据' })
        const tickets = {}
        for (const id of unique) tickets[id] = mintPreviewTicket(userId, id, session.token)
        return json(res, 200, { tickets, expiresIn: PREVIEW_TICKET_TTL_MS / 1000 })
      }

      // 设计稿预览：工作台自己的同源路由，不依赖画布的随机端口预览服务。
      // 交付版本从团队服务端取，本机文件从当前用户的需求文件夹取，都只读、只允许文本/图片。
      if (req.method === 'GET' && route === '/design-preview') {
        const requirementId = url.searchParams.get('requirementId') || ''
        if (requirementId === '') return json(res, 400, { error: '缺少需求 ID' })
        if (previewTicket !== null && previewTicket.requirementId !== requirementId) {
          return json(res, 403, { error: '预览票据不适用于这条需求' })
        }
        const token = previewTicket !== null ? previewTicket.token : session.token
        const artifactId = url.searchParams.get('artifactId') || ''
        if (artifactId !== '') {
          const data = await serverJson(`/artifacts/${encodeURIComponent(artifactId)}`, { token })
          const artifact = data.artifact
          // 测试报告也是需求内的只读交付物，需求页要在 iframe 里预览它，
          // 和设计稿/原型走同一个沙箱路由。
          const previewableKind = artifact && (
            artifact.kind === 'design'
            || artifact.kind === PROTOTYPE_ARTIFACT_KIND
            || artifact.kind === 'test-report'
          )
          if (!previewableKind || artifact.requirementId !== requirementId) {
            return json(res, 404, { error: '预览文件不存在或不属于这个需求' })
          }
          const content = typeof data.content === 'string' ? data.content : ''
          let buffer = artifact.encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8')
          if (/\.html?$/i.test(String(artifact.name || ''))) {
            try {
              buffer = Buffer.from(await inlinePreviewAssets(buffer.toString('utf8'), artifact, token, requirementId), 'utf8')
            } catch (reason) {
              console.warn('[dsh-workbench] preview asset inline failed', reason)
            }
          }
          return sendDesignPreview(res, buffer, artifact.name, artifact.contentType)
        }
        const relativePath = url.searchParams.get('path') || ''
        if (relativePath === '' || path.isAbsolute(relativePath)) {
          return json(res, 400, { error: '缺少合法的文件路径' })
        }
        const stateData = await serverState(token)
        const baseRequirement = (stateData.requirements || []).find(item => item.id === requirementId)
        if (!baseRequirement) return json(res, 404, { error: '需求不存在或无权访问' })
        const baseDir = baseDirFor(local, userId)
        const folder = folderPathFor(localUser(local, userId), baseDir, stateData, baseRequirement)
        if (folder === '') return json(res, 404, { error: '需求目录不存在' })
        const target = path.resolve(folder, relativePath)
        // 只允许读这条需求文件夹内的文件，不能借 ../ 读到同一顶级文件夹下
        // 其他需求、.env、数据库备份或用户私钥。
        if (!isInside(folder, target)) return json(res, 403, { error: '文件不在需求目录内' })
        if (DESIGN_PREVIEW_TYPES[path.extname(target).toLowerCase()] === undefined) {
          return json(res, 415, { error: '不支持预览这个文件类型' })
        }
        try {
          assertNoSymlinkBetween(folder, target)
          const real = fs.realpathSync(target)
          const realBase = fs.realpathSync(baseDir)
          if (!isInside(realBase, real)) return json(res, 403, { error: '文件不在工作台目录内' })
          const stat = fs.statSync(real)
          if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return json(res, 413, { error: '设计文件不存在或超过 2 MB' })
          const buffer = fs.readFileSync(real)
          return sendDesignPreview(res, buffer, real, null)
        } catch {
          return json(res, 404, { error: '本机没有这个设计文件' })
        }
      }

      // 需求页的开发卡片：只读浏览需求目录（各端仓库就在需求目录下）。只列文件名和
      // 大小，不返回 .git / node_modules / .local 等目录，也不允许越出需求目录。
      if (req.method === 'GET' && (route === '/requirement-files' || route === '/requirement-file')) {
        const requirementId = url.searchParams.get('requirementId') || ''
        const relative = url.searchParams.get('path') || ''
        if (requirementId === '') return json(res, 400, { error: '缺少需求 ID' })
        const stateData = await serverState(session.token)
        const baseRequirement = (stateData.requirements || []).find(item => item.id === requirementId)
        if (!baseRequirement) return json(res, 404, { error: '需求不存在' })
        const baseDir = baseDirFor(local, userId)
        const folder = folderPathFor(localUser(local, userId), baseDir, stateData, baseRequirement)
        if (folder === '' || !fs.existsSync(folder)) return json(res, 404, { error: '需求目录不存在' })
        if (codeBrowserDenied(relative)) {
          return json(res, 404, { error: '这个路径不开放浏览' })
        }
        const target = path.resolve(folder, relative)
        if (!isInside(folder, target)) return json(res, 403, { error: '路径不在需求目录内' })
        // 路径本身合规不代表目标合规：仓库里可能有一个指向 .env 的普通链接目录。
        // 按真实路径再判一次，目录列表和单文件读取都覆盖到。
        try {
          const realTarget = fs.realpathSync(target)
          const relativeReal = path.relative(fs.realpathSync(folder), realTarget).split(path.sep).join('/')
          if (codeBrowserDenied(relativeReal)) return json(res, 404, { error: '这个路径不开放浏览' })
        } catch {
          return json(res, 404, { error: '路径读不到' })
        }
        try {
          assertNoSymlinkBetween(folder, target)
          const real = fs.realpathSync(target)
          const realBase = fs.realpathSync(baseDir)
          if (!isInside(realBase, real)) return json(res, 403, { error: '路径不在工作台目录内' })
          if (route === '/requirement-file') {
            const stat = fs.statSync(real)
            if (!stat.isFile()) return json(res, 400, { error: '不是文件' })
            if (stat.size > CODE_PREVIEW_MAX_BYTES) {
              return json(res, 413, { error: `文件超过 ${Math.round(CODE_PREVIEW_MAX_BYTES / 1000)} KB，不在这里预览` })
            }
            const buf = fs.readFileSync(real)
            const binary = isBinaryBuffer(buf)
            return json(res, 200, {
              path: relative,
              name: path.basename(real),
              size: stat.size,
              binary,
              content: binary ? '' : buf.toString('utf8'),
            })
          }
          const stat = fs.statSync(real)
          if (!stat.isDirectory()) return json(res, 400, { error: '不是目录' })
          const allEntries = fs.readdirSync(real, { withFileTypes: true })
            .filter(entry => !codeBrowserDenied(entry.name))
            .map((entry) => {
              const full = path.join(real, entry.name)
              let size = 0
              let updatedAt = ''
              try {
                const item = fs.statSync(full)
                size = item.size
                updatedAt = item.mtime.toISOString()
              } catch { /* 读不到大小就不显示 */ }
              return { name: entry.name, dir: entry.isDirectory(), size, updatedAt }
            })
            .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
          const truncated = allEntries.length > 500
          const entries = truncated ? allEntries.slice(0, 500) : allEntries
          return json(res, 200, {
            path: relative,
            relativePath: path.relative(baseDir, real).split(path.sep).join('/'),
            entries,
            truncated,
            totalCount: allEntries.length,
          })
        } catch {
          return json(res, 404, { error: '路径读不到' })
        }
      }

      // 浏览器在打开某个 DSH 会话时认领它。之后这个会话里的工具/命令只代表
      // 认领人执行；换一个账号打开同一个会话会被拒绝，避免串号。
      if (req.method === 'POST' && route === '/sessions/claim') {
        const body = await readJson(req)
        const dshSessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        if (dshSessionId === '' || dshSessionId.length > 200) {
          return json(res, 400, { error: '缺少合法的会话 ID' })
        }
        // 只接受已经绑定了工作台需求的 DSH 会话。否则知道别人某个会话 ID 就能
        // 把它认到自己名下，之后该会话里的工具调用都以认领人身份执行。
        const bound = Object.values(local.users || {}).some(user => (
          typeof user?.dshSessions?.[dshSessionId] === 'string'
        ))
        if (!bound) {
          return json(res, 404, { error: '这个会话还没有绑定工作台需求，不能认领' })
        }
        const owner = findSessionOwner(local, dshSessionId)
        if (owner !== null && owner !== userId) {
          return json(res, 403, { error: '这个会话已经属于其他工作台账号，不能切换身份' })
        }
        localUser(local, userId).sessionUsers[dshSessionId] = userId
        saveLocal(local)
        return json(res, 200, { ok: true, userId })
      }

      // 需求会话的开场白 / 引导消息：写进会话日志，成为一条真实的 assistant
      // 消息。输入框不再预填，编号、平台和描述要点都放在这条消息里。
      // 新会话写成 self-contained 的 turn 1 并当场收尾；老会话（开场白还是
      // 1.0 的一句话）在用户还没真正用过时补一条 turn 2 的引导消息。
      if (req.method === 'POST' && route === '/session-greeting') {
        const GREETING_TURN = 1
        const body = await readJson(req)
        const dshSessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        if (dshSessionId === '' || dshSessionId.length > 200) {
          return json(res, 400, { error: '缺少合法的会话 ID' })
        }
        const localState = localUser(local, userId)
        if (localState.sessionUsers[dshSessionId] !== userId) {
          return json(res, 403, { error: '会话还没有归属当前工作台账号' })
        }
        // 只有绑定了需求/设计记录的会话才需要开场白；普通 DSH 聊天即使被认领，
        // 也不应该收到“请描述你的需求”。
        if (typeof localState.dshSessions?.[dshSessionId] !== 'string') {
          return json(res, 403, { error: '会话没有绑定工作台需求' })
        }
        const greeted = localState.greetedSessions[dshSessionId]
        const upgrade = body.upgrade === true
        // 3 = 按角色写过的引导；2 = 旧版引导（需求会话一律产品口吻，负责人/开发/
        // 测试看到的是“开始做原型”）；true = 更早的一句话开场白。
        // 旧口吻的引导趁会话还没被用过补一条对的开场白，用过的不打断。
        const roleUpgrade = upgrade && greeted === 2
          && ['lead', 'admin', 'dev', 'qa'].includes(String(body.role ?? ''))
        if (greeted === 3 || (greeted === 2 && !roleUpgrade) || (greeted === true && !upgrade)) {
          return json(res, 200, { ok: true, skipped: 'greeted' })
        }
        const live = typeof hostCtx?.get === 'function' ? hostCtx.get('sessions')?.get?.(dshSessionId) : undefined
        if (live === undefined || live === null) {
          return json(res, 409, { error: '会话还没有在 DSH 里打开' })
        }
        const agents = typeof hostCtx?.get === 'function' ? hostCtx.get('agents') : undefined
        const agent = agents?.get?.(dshSessionId)
        let boundary = null
        try { boundary = agents?.turnBoundaryOf?.(live) ?? null } catch { boundary = null }
        // 正在跑或还有没结束的轮次时不动日志，等下次打开再试。
        if (boundary !== null && boundary.openTurnStartSeq !== null) {
          return json(res, 200, { ok: true, skipped: 'started' })
        }
        const message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: [{ type: 'text', text: greetingMessageText(body) }],
          source: { kind: 'model', provider: 'dsh-workbench', model: 'workbench-greeting' },
        }
        if (greeted === true || roleUpgrade) {
          // 老版开场白只有“请描述你的需求”，旧版引导又都是产品口吻。会话还没被
          // 用户用过时补一条对当前角色有意义的引导；角色口吻的纠正（marker 2）
          // 即使会话已经聊过也要补，否则负责人会一直停在“开始做原型”上。
          if (!agent || agent.phase?.kind !== 'idle') {
            return json(res, 409, { error: '会话的 Agent 还没准备好' })
          }
          const previousTurn = Number.isInteger(agent.phase.lastTurn) ? agent.phase.lastTurn : 0
          if (previousTurn > 1 && greeted === true) {
            localState.greetedSessions[dshSessionId] = 3
            try { saveLocal(local) } catch { /* 下次打开再判断，不写坏日志 */ }
            return json(res, 200, { ok: true, skipped: 'started' })
          }
          const nextTurn = Math.max(2, previousTurn + 1)
          // 先落盘标记，避免并发请求重复补同一条消息。
          localState.greetedSessions[dshSessionId] = 3
          try {
            saveLocal(local)
          } catch (reason) {
            localState.greetedSessions[dshSessionId] = greeted
            return json(res, 500, { error: `引导消息标记保存失败：${reason instanceof Error ? reason.message : String(reason)}` })
          }
          try {
            live.append([
              ['turn/start', { turn: nextTurn }],
              ['step/start', { turn: nextTurn, step: 1 }],
              ['assistant/message', { turn: nextTurn, step: 1, message, stream: [] }, { surfaceOp: 'append' }],
              ['step/end', { turn: nextTurn, step: 1 }],
              ['turn/end', { turn: nextTurn, reason: { kind: 'completed' } }],
            ])
            agent.phase.lastTurn = nextTurn
          } catch (reason) {
            return json(res, 500, {
              error: `引导消息写入失败：${reason instanceof Error ? reason.message : String(reason)}`,
              retryable: false,
            })
          }
          return json(res, 200, { ok: true, upgraded: true })
        }
        // 新会话：已经有真实轮次的不再补开场白（用户已经发过消息了）。
        if (boundary !== null && boundary.lastTurn !== 0) {
          return json(res, 200, { ok: true, skipped: 'started' })
        }
        let blank = null
        try {
          blank = hostCtx.get('sessionQuery')?.getListMetadata?.(live)?.blank ?? null
        } catch { blank = null }
        if (blank === false) return json(res, 200, { ok: true, skipped: 'started' })
        if (!agent || agent.phase?.kind !== 'idle' || agent.phase.lastTurn !== 0) {
          return json(res, 409, { error: '会话的 Agent 还没准备好' })
        }
        // 先确认能推进 Agent 的轮次边界；写不了就不写开场白，免得日志合法但下一条消息撞 turn 1。
        const previousTurn = agent.phase.lastTurn
        let canBump = false
        try {
          agent.phase.lastTurn = GREETING_TURN
          canBump = agent.phase.lastTurn === GREETING_TURN
        } catch { canBump = false } finally {
          // 探测失败也必须恢复，否则 lastTurn 会停在 1，下一条用户消息直接撞轮次。
          try { agent.phase.lastTurn = previousTurn } catch { /* ignore */ }
        }
        if (!canBump) return json(res, 501, { error: '当前 DSH 版本不支持写入开场白' })
        // DSH 的会话重放要求 surface 的第一条是受保护的 system/message，否则
        // 用户第一条消息触发的 system/message 会让整份日志被判为损坏
        // （SessionFormatError: system/message requires a protected first surface head）。
        // 手工开场白是 assistant 开头，所以先补一条最小的 system 头；真正完整的
        // 系统提示词仍由 DSH 在下一个 turn 追加，模型侧只会多一行工作台说明。
        const surfaceHead = {
          id: crypto.randomUUID(),
          role: 'system',
          content: [{ type: 'text', text: '<workbench_session>研发工作台会话由工作台插件初始化。</workbench_session>' }],
          source: { kind: 'system-prompt', sections: [] },
        }
        // 先落盘“尝试过”标记：如果 append 只写进去一半，宁可这次没有开场白，
        // 也不能重试再写一个 turn 1（DSH 重放校验会直接判定会话日志损坏）。
        localState.greetedSessions[dshSessionId] = 3
        try {
          saveLocal(local)
        } catch (reason) {
          delete localState.greetedSessions[dshSessionId]
          return json(res, 500, { error: `开场白标记保存失败：${reason instanceof Error ? reason.message : String(reason)}` })
        }
        try {
          live.append([
            ['turn/start', { turn: GREETING_TURN }],
            ['step/start', { turn: GREETING_TURN, step: 1 }],
            ['system/message', { turn: GREETING_TURN, step: 1, message: surfaceHead }, { surfaceOp: 'append' }],
            ['assistant/message', { turn: GREETING_TURN, step: 1, message, stream: [] }, { surfaceOp: 'append' }],
            ['step/end', { turn: GREETING_TURN, step: 1 }],
            ['turn/end', { turn: GREETING_TURN, reason: { kind: 'completed' } }],
          ])
          agent.phase.lastTurn = GREETING_TURN
        } catch (reason) {
          return json(res, 500, {
            error: `开场白写入失败：${reason instanceof Error ? reason.message : String(reason)}`,
            retryable: false,
          })
        }
        return json(res, 200, { ok: true })
      }

      if (req.method === 'GET' && route === '/state') {
        ensureBaseDir(local, userId)
        const data = await serverState(session.token)
        scheduleWorkspaceSync(userId, data, local)
        return json(res, 200, decorateState(data, local, userId))
      }

      // SSE 事件流：把团队服务端的事件流管道透传给浏览器（同源 Cookie 鉴权）。
      if (req.method === 'GET' && route === '/events/stream') {
        const controller = new AbortController()
        let upstream
        try {
          upstream = await serverStream('/events/stream', { token: session.token, signal: controller.signal })
        } catch (reason) {
          return json(res, 502, { error: `事件流连接失败：${reason instanceof Error ? reason.message : String(reason)}` })
        }
        if (upstream.status !== 200) {
          let detail = ''
          try { detail = await upstream.text() } catch (_) { /* 忽略 */ }
          return json(res, 502, { error: `事件流上游返回 ${upstream.status}`, detail: detail.slice(0, 300) })
        }
        res.writeHead(upstream.status, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        })
        if (typeof res.flushHeaders === 'function') res.flushHeaders()
        if (upstream.body === null) { res.end(); return }
        const streamBody = Readable.fromWeb(upstream.body)
        streamBody.on('error', () => { try { res.end() } catch (_) { /* 忽略 */ } })
        req.on('close', () => { controller.abort(); try { streamBody.destroy() } catch (_) { /* 忽略 */ } })
        streamBody.pipe(res)
        return
      }

      if (req.method === 'GET' && route === '/requirement') {
        const dshSessionId = url.searchParams.get('sessionId') ?? ''
        const recordId = findMappedRecord(local, userId, dshSessionId)
        if (recordId === null) return json(res, 200, { requirement: null })
        // 一次 /state 就够了：需求、用户、平台都在里面，不必再单独查 by-session。
        // 原型同步由 /state 轮询按用户限流统一处理，这里不再每次请求都扫目录。
        const stateData = await serverState(session.token)
        const localState = localUser(local, userId)
        const baseDir = baseDirFor(local, userId)
        const serverRequirement = (stateData.requirements || []).find(item => (
          item.id === recordId
          || (item.sessions || []).some(record => record.id === recordId)
          || item.primarySessionId === recordId
        ))
        if (!serverRequirement) return json(res, 200, { requirement: null })
        // 不阻塞接口返回：工作区同步转后台（与 /state 一致），首次可能暂缺本机文件列表，下一轮同步补齐。
        scheduleWorkspaceSync(userId, { requirements: [serverRequirement] }, local)
        const requirement = decorateRequirement(localState, baseDir, stateData, serverRequirement)
        requirement.designFiles = listDesignFiles(requirement.folderPath, baseDir)
        attachWorkingFolders(requirement, baseDir)
        attachDesignScreens(requirement)
        return json(res, 200, { requirement })
      }

      if (req.method === 'POST' && route === '/onboarding/precheck') {
        const body = await readJson(req)
        const folder = typeof body.folder === 'string' ? body.folder.trim() : ''
        if (folder === '') return json(res, 200, { valid: false, reason: '请填写一个文件夹路径' })
        const resolved = path.resolve(folder)
        const reason = unsafeBaseDirReason(resolved)
        if (reason !== '') return json(res, 200, { valid: false, reason })
        const exists = fs.existsSync(resolved)
        let writable = true
        if (exists) {
          try { fs.accessSync(resolved, fs.constants.W_OK) } catch { writable = false }
        }
        const hasHistory = Object.values(local.users ?? {}).some(item => (
          typeof item.topLevelFolder === 'string' && item.topLevelFolder !== '' && path.resolve(item.topLevelFolder) === resolved
        ))
        return json(res, 200, { valid: writable, reason: writable ? '' : '目录不可写', exists, writable, hasHistory })
      }

      if (req.method === 'POST' && route === '/onboarding/complete') {
        const body = await readJson(req)
        const folder = resolveAndCreateTopFolder(body.topLevelFolder, local, userId)
        // 先让服务端确认身份/平台组合，再写本机顶级文件夹；否则服务端拒绝时
        // 本机映射已经切走，旧需求目录会全部从 /state 里消失。
        const result = await serverJson('/onboarding/complete', {
          method: 'POST',
          token: session.token,
          body: {
            activeRole: body.activeRole ?? null,
            platformIds: Array.isArray(body.platformIds) ? body.platformIds : [],
            folderConfigured: true,
          },
        })
        const localState = localUser(local, userId)
        localState.topLevelFolder = folder
        saveLocal(local)
        authSessionCache.delete(session.token)
        invalidateAuthSessionsForUser(userId)
        return json(res, 200, {
          ...result,
          user: {
            ...result.user,
            onboarding: { ...(result.user?.onboarding || {}), topLevelFolder: folder },
          },
          baseDir: folder,
          iterationDir: path.join(folder, safeSegment((await serverJson('/state', { token: session.token })).iteration?.code ?? '', '未命名迭代')),
        })
      }

      if (req.method === 'POST' && route === '/folders/ensure') {
        const body = await readJson(req)
        const folderPath = ensureRequirementFolder(body.parent, body.name, local, userId, body.unique === true)
        return json(res, 200, { path: folderPath })
      }

      // 新建需求后需求页画布立刻有一张空白画布：在需求目录的 prototype/ 下放一个 _ 开头的
      // 占位 HTML，画布打开它就有画布（外观 / 体检 / 导出 / 版本都在）。
      // 真正的原型写进 prototype/ 后，画布会切到原型目录，这张占位页不会再出现。
      if (req.method === 'POST' && route === '/design/blank-canvas') {
        const body = await readJson(req)
        const requirementId = typeof body.requirementId === 'string' ? body.requirementId.trim() : ''
        if (requirementId === '') return json(res, 400, { error: '缺少需求 ID' })
        const kind = body.kind === 'design' ? 'design' : 'prototype'
        const dirName = kind === 'design' ? DESIGN_DIR : PROTOTYPE_DIR
        const html = kind === 'design' ? BLANK_DESIGN_HTML : BLANK_CANVAS_HTML
        const stateData = await serverState(session.token)
        const baseRequirement = (stateData.requirements || []).find(item => item.id === requirementId)
        if (!baseRequirement) return json(res, 404, { error: '需求不存在或无权访问' })
        const baseDir = baseDirFor(local, userId)
        const folder = ensureRequirementFolderFor(local, userId, stateData, baseRequirement)
        if (folder === '') return json(res, 403, { error: '需求目录不在工作台内' })
        try {
          assertLocalFolderInside(baseDir, folder, '需求目录')
          const canvasDir = path.join(folder, dirName)
          fs.mkdirSync(canvasDir, { recursive: true })
          assertNoSymlinkBetween(folder, canvasDir)
          const realBase = fs.realpathSync(baseDir)
          const realCanvas = fs.realpathSync(canvasDir)
          if (!isInside(realBase, realCanvas)) return json(res, 403, { error: '画布目录不在工作台内' })
          const file = path.join(realCanvas, BLANK_CANVAS_NAME)
          try {
            // wx：lstat 与 write 之间若有人把目标换成符号链接，这里会 EEXIST 而不是跟随写入。
            fs.writeFileSync(file, html, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
          } catch (reason) {
            if (reason?.code !== 'EEXIST') throw reason
            const stat = fs.lstatSync(file)
            if (!stat.isFile() || stat.isSymbolicLink()) return json(res, 403, { error: '画布文件不是普通文件' })
          }
          const realFile = fs.realpathSync(file)
          if (!isInside(realCanvas, realFile)) return json(res, 403, { error: '画布文件不在需求目录内' })
          return json(res, 200, { path: realFile, kind })
        } catch (reason) {
          const status = Number.isInteger(reason?.status) ? reason.status : 500
          return json(res, status, { error: `空白画布创建失败：${reason instanceof Error ? reason.message : String(reason)}` })
        }
      }

      // 在画布里打开某一版原型 / 设计：画布只认本机页面，先把那一版的附件落成
      // 本机快照目录（~/.dsh/cache/…/versions/），再把目录路径交给画布。
      // 版本不可变，快照可以反复覆盖；「最新」也走这里，供没有本机文件的人看。
      if (req.method === 'POST' && route === '/versions/materialize') {
        pruneVersionsCache()
        const body = await readJson(req)
        const requirementId = typeof body.requirementId === 'string' ? body.requirementId.trim() : ''
        const kind = body.kind === 'design' ? 'design' : 'prototype'
        const version = Number.isInteger(body.version) ? body.version : null
        if (requirementId === '' || requirementId.length > 200) return json(res, 400, { error: '缺少需求 ID' })
        if (version !== null && (version < 1 || version > 10000)) return json(res, 400, { error: '版本号不合法' })
        const stateData = await serverState(session.token)
        const requirement = (stateData.requirements || []).find(item => item.id === requirementId)
        if (!requirement) return json(res, 404, { error: '需求不存在或无权访问' })
        // 本机有这个文件就直接用本机的：产品的原型、设计师的设计稿要能接着画，
        // 不能打开缓存里的只读快照。只有本机没有（历史版本、别人的设计稿）才落快照。
        const localPath = typeof body.localPath === 'string' ? body.localPath : ''
        if (localPath !== '' && version === null) {
          try {
            const folder = requirementFolder(local, userId, stateData, requirement)
            const target = path.resolve(localPath)
            if (folder !== '' && isInside(folder, target)) {
              const real = fs.realpathSync(target)
              if (isInside(fs.realpathSync(folder), real) && fs.statSync(real).isFile()) {
                return json(res, 200, { path: real, name: path.basename(real) })
              }
            }
          } catch { /* 本机没有就继续走快照 */ }
        }
        const artifacts = Array.isArray(requirement.artifacts) ? requirement.artifacts : []
        let picked = []
        if (kind === 'prototype') {
          const versions = Array.isArray(requirement.prototypeVersions) ? requirement.prototypeVersions : []
          const record = version === null ? null : versions.find(item => item.version === version)
          if (version !== null && !record) return json(res, 404, { error: '版本不存在' })
          if (record) {
            const wanted = new Set((Array.isArray(record.files) ? record.files : []).map(file => file.artifactId))
            picked = artifacts.filter(artifact => wanted.has(artifact.id))
          } else {
            // 「最新」按文件名取最后一次上传，和卡片缩略图的取法一致。
            const latest = new Map()
            for (const artifact of artifacts) {
              if (artifact.kind !== 'prototype' || !/\.html?$/i.test(String(artifact.name || ''))) continue
              latest.set(path.posix.basename(String(artifact.name)), artifact)
            }
            picked = [...latest.values()]
          }
        } else {
          const versions = Array.isArray(requirement.designVersions) ? requirement.designVersions : []
          const record = version === null
            ? versions.reduce((a, b) => (Number(b.version) > Number(a?.version ?? 0) ? b : a), null)
            : versions.find(item => item.version === version)
          if (version !== null && !record) return json(res, 404, { error: '版本不存在' })
          // 版本归属只认交付记录里的附件 id（上传时的 designVersion 标记在旧
          // 数据里可能落到上一版上）；没有版本记录时才把草稿附件算作「最新」。
          const ids = new Set(Array.isArray(record?.artifactIds) ? record.artifactIds : [])
          picked = artifacts.filter(artifact =>
            artifact.kind === 'design'
            && (ids.has(artifact.id) || (record === null && !artifact.designVersion)))
        }
        const root = path.join(os.homedir(), '.dsh', 'cache', 'dsh-workbench', 'versions', safeSegment(requirementId, 'req'))
        const dir = path.join(root, `${kind}-${version === null ? 'latest' : version}`)
        try {
          // 版本不会变；先清掉旧快照，免得「最新」里留下已经不存在的文件。
          fs.rmSync(dir, { recursive: true, force: true })
          fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
          let firstHtml = ''
          let firstAny = ''
          for (const artifact of picked) {
            const name = path.posix.basename(String(artifact.name || ''))
            if (name === '' || name.startsWith('.') || name.includes('\\') || name.includes('/')) continue
            const data = await serverJson(`/artifacts/${encodeURIComponent(artifact.id)}`, { token: session.token })
            const content = typeof data?.content === 'string' ? data.content : ''
            if (content === '') continue
            const buffer = artifact.encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8')
            const target = path.join(dir, name)
            if (!isInside(dir, target)) continue
            fs.writeFileSync(target, buffer, { mode: 0o600 })
            if (firstAny === '') firstAny = name
            if (firstHtml === '' && /\.html?$/i.test(name)) firstHtml = name
          }
          if (firstAny === '') return json(res, 404, { error: '这个版本没有可预览的文件' })
          return json(res, 200, { path: dir, name: firstHtml !== '' ? firstHtml : firstAny })
        } catch (reason) {
          const status = Number.isInteger(reason?.status) ? reason.status : 500
          return json(res, status, { error: `版本快照生成失败：${reason instanceof Error ? reason.message : String(reason)}` })
        }
      }

      if (req.method === 'POST' && route === '/requirements') {
        const body = await readJson(req)
        const result = await serverRaw('/requirements', { method: 'POST', token: session.token, body })
        return json(res, result.status, result.data)
      }

      // 删除需求：服务端负责权限和级联数据；本机再清掉会话映射和需求目录
      // （原型、设计稿、测试证据），并尽力把相关 DSH 会话一起删除。
      // 本机清理失败不回滚服务端删除，返回失败项供前端提示。
      const requirementDeleteMatch = /^\/requirements\/([^/]+)$/.exec(route)
      if (req.method === 'DELETE' && requirementDeleteMatch) {
        const id = decodeRoutePart(requirementDeleteMatch[1])
        // 删除前先取一次状态：老数据没有 folders 映射时，要按迭代目录推导需求目录。
        const beforeState = await serverState(session.token, { fresh: true }).catch(() => null)
        const result = await serverAs(userId, `/requirements/${encodeURIComponent(id)}`, 'DELETE')
        const deleted = result?.requirement ?? { id, sessions: [] }
        // 先删目录：folders 映射马上会被 forgetRequirementLocalState 清掉。
        const folderCleanup = removeRequirementFolders(local, deleted, beforeState, userId)
        const dshSessionIds = forgetRequirementLocalState(local, deleted)
        const sessionDeleteFailures = []
        const registry = typeof hostCtx?.get === 'function' ? hostCtx.get('workspaceRegistry') : undefined
        if (registry && typeof registry.deleteSession === 'function') {
          for (const dshSessionId of dshSessionIds) {
            try {
              await registry.deleteSession(dshSessionId)
            } catch (reason) {
              sessionDeleteFailures.push({
                sessionId: dshSessionId,
                error: reason instanceof Error ? reason.message : String(reason),
              })
            }
          }
        } else if (dshSessionIds.length > 0) {
          sessionDeleteFailures.push({ sessionId: '', error: '没有找到可用的会话删除服务' })
        }
        return json(res, 200, {
          ...result,
          deletedSessions: Math.max(0, dshSessionIds.length - sessionDeleteFailures.length),
          sessionDeleteFailures,
          deletedFolders: folderCleanup.removed,
          folderDeleteFailures: folderCleanup.failures,
        })
      }

      const sessionMatch = /^\/requirements\/([^/]+)\/sessions$/.exec(route)
      if (req.method === 'POST' && sessionMatch) {
        const id = decodeRoutePart(sessionMatch[1])
        const body = await readJson(req)
        const localState = localUser(local, userId)
        const dshSessionId = typeof body.dshSessionId === 'string' ? body.dshSessionId : ''
        const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null
        const folderPath = typeof body.folderPath === 'string' && body.folderPath.trim() !== '' ? body.folderPath : null
        // 需求资料目录（原型/设计稿）与会话工作区可能不同：新流程会话挂在迭代
        // 目录下，资料目录由 requirementFolder 单独记录。
        const requirementFolder = typeof body.requirementFolder === 'string' && body.requirementFolder.trim() !== ''
          ? body.requirementFolder
          : null
        // 本机能做的校验全部放在服务端调用之前：先建服务端记录再校验，
        // 校验一失败就会在服务端留下一条没有本机映射的孤儿会话记录。
        if (dshSessionId.length > 200 || (workspaceId !== null && workspaceId.length > 200) || (folderPath !== null && folderPath.length > 2000) || (requirementFolder !== null && requirementFolder.length > 2000)) {
          return json(res, 400, { error: '会话映射字段过长' })
        }
        if (dshSessionId !== '') {
          const owner = findSessionOwner(local, dshSessionId)
          if (owner !== null && owner !== userId) {
            return json(res, 403, { error: '这个 DSH 会话已属于其他账号，不能重复绑定' })
          }
        }
        const base = baseDirFor(local, userId)
        for (const [folder, label] of [[folderPath, '需求文件夹'], [requirementFolder, '需求资料目录']]) {
          if (folder === null) continue
          try {
            assertLocalFolderInside(base, folder, label)
          } catch (reason) {
            return json(res, reason?.status ?? 403, { error: reason instanceof Error ? reason.message : `${label}不合法` })
          }
        }
        const result = await serverJson(`/requirements/${encodeURIComponent(id)}/sessions`, {
          method: 'POST',
          token: session.token,
          body: { type: body.type, label: body.label },
        })
        const record = result.session
        if (record && record.id) {
          if (dshSessionId !== '') {
            localState.sessions[record.id] = { dshSessionId, workspaceId, folderPath }
            localState.dshSessions[dshSessionId] = record.id
            localState.sessionOwners[dshSessionId] = record.id
            localState.sessionUsers[dshSessionId] = userId
          }
          // 只有显式给出资料目录时才覆盖需求文件夹映射；新流程把会话放进
          // 迭代目录，不能让迭代目录冒充需求的资料目录。
          if (requirementFolder) localState.folders[id] = requirementFolder
          saveLocal(local)
        }
        const stateData = await serverState(session.token, { fresh: true })
        const requirement = decorateRequirement(localState, baseDirFor(local, userId), stateData, result.requirement)
        return json(res, 200, { ...result, requirement })
      }

      const unbindMatch = /^\/requirements\/([^/]+)\/sessions\/([^/]+)\/unbind$/.exec(route)
      if (req.method === 'POST' && unbindMatch) {
        const recordId = decodeRoutePart(unbindMatch[2])
        const localState = localUser(local, userId)
        const mapping = localState.sessions[recordId]
        if (mapping && typeof mapping.dshSessionId === 'string') {
          delete localState.dshSessions[mapping.dshSessionId]
          delete localState.sessionOwners[mapping.dshSessionId]
          delete localState.sessionUsers[mapping.dshSessionId]
          // 解绑后重新绑定到同一 DSH 会话时应能重新收到开场白（如果它仍是空会话）。
          delete localState.greetedSessions[mapping.dshSessionId]
        }
        delete localState.sessions[recordId]
        saveLocal(local)
        return json(res, 200, { ok: true })
      }

      const deliverMatch = /^\/requirements\/([^/]+)\/design-deliver$/.exec(route)
      if (req.method === 'POST' && deliverMatch) {
        const id = decodeRoutePart(deliverMatch[1])
        const body = await readJson(req)
        const localState = localUser(local, userId)
        const baseDir = baseDirFor(local, userId)
        let files = Array.isArray(body.files) ? body.files : []
        let folder = ''
        try {
          folder = assertLocalFolderInside(baseDir, localState.folders[id], '需求目录')
        } catch { /* 旧需求可能没有映射，下面按服务端迭代/标题推导 */ }
        if (folder === '') {
          const stateData = await serverState(session.token, { fresh: true })
          const baseRequirement = (stateData.requirements || []).find(item => item.id === id)
          if (baseRequirement) folder = folderPathFor(localState, baseDir, stateData, baseRequirement)
        }
        if (files.length === 0 && folder) {
          files = listDesignFiles(folder, baseDir).map(file => file.relativePath)
        }
        // 版本文件列表只记 HTML 屏；样式/脚本等支持文件也上传，供跨角色预览内联相对引用。
        const supportFiles = folder ? listDesignSupportFiles(folder, baseDir) : []
        const upload = await uploadDesignArtifacts(
          userId,
          folder,
          baseDir,
          id,
          [...new Set([...files, ...supportFiles])],
        )
        const result = await serverJson(`/requirements/${encodeURIComponent(id)}/design-deliver`, {
          method: 'POST',
          token: session.token,
          body: { summary: body.summary, files, artifactIds: upload.artifactIds },
        })
        return json(res, 200, { ...result, uploadWarnings: upload.warnings })
      }

      // 删除尚未交付的设计：先让服务端释放认领、清设计附件、归档设计会话，
      // 成功后再清本机 design/，避免服务端拒绝时先把本机稿子删了。
      const resetMatch = /^\/requirements\/([^/]+)\/design-reset$/.exec(route)
      if (req.method === 'POST' && resetMatch) {
        const id = decodeRoutePart(resetMatch[1])
        const localState = localUser(local, userId)
        const baseDir = baseDirFor(local, userId)
        let folder = ''
        try {
          folder = assertLocalFolderInside(baseDir, localState.folders[id], '需求目录')
        } catch { /* 旧需求可能没有映射，下面按迭代/标题推导 */ }
        if (folder === '') {
          const above = await serverState(session.token, { fresh: true })
          const baseRequirement = (above.requirements || []).find(item => item.id === id)
          if (baseRequirement) folder = folderPathFor(localState, baseDir, above, baseRequirement)
        }
        const result = await serverJson(`/requirements/${encodeURIComponent(id)}/design-reset`, {
          method: 'POST',
          token: session.token,
          body: {},
        })
        const cleanup = folder === '' ? { warnings: [] } : removeLocalDesignFiles(folder, baseDir)
        const stateData = await serverState(session.token)
        const requirement = decorateRequirement(localState, baseDir, stateData, result.requirement)
        return json(res, 200, { ...result, requirement, warnings: cleanup.warnings })
      }

      // ---- generic proxy -------------------------------------------------------
      const method = req.method || 'GET'
      // DELETE 只用于删除需求和附件，服务端有独立的权限与状态校验。
      if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(method)) {
        return json(res, 405, { error: '不支持的请求方法' })
      }
      if (/^\/(auth|webhooks)(\/|$)/.test(route)) {
        return json(res, 403, { error: '这个接口不允许通过浏览器代理访问' })
      }
      const body = method === 'GET' || method === 'HEAD' ? undefined : await readJson(req)
      const result = await serverRaw(`${route}${url.search}`, {
        method,
        token: session.token,
        body,
      })
      if (result.ok && method === 'POST') {
        const userMatch = /^\/admin\/users\/([^/]+)$/.exec(route)
        if (userMatch) {
          invalidateAuthSessionsForUser(decodeRoutePart(userMatch[1]))
        } else if (route.startsWith('/skills')) {
          void syncPublishedSkills(hostCtx, local)
        }
      }
      return json(res, result.status, result.data)
    } catch (error) {
      // 只有我们自己抛的 httpError 才能原样回给浏览器。fs/path 抛出的错误里带
      // 本机绝对路径（比如 ENOENT /Users/kirer/...），不能直接透出。
      if (Number.isInteger(error?.status)) {
        return json(res, error.status, { error: error instanceof Error ? error.message : String(error) })
      }
      console.error('[dsh-workbench] unhandled route error', route, error)
      return json(res, 500, { error: '本机工作台处理请求失败，详情见宿主日志' })
    }
  }
}
