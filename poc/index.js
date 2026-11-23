/**
 * dsh-workbench — host half.
 *
 * 架构：
 *   - Rust 团队服务端（server/）保存共享协作数据：用户、平台、迭代、需求、
 *     评审、排期、设计版本、开发/测试/发布、技能、通知与事件。
 *   - DSH host 插件只做 BFF：同源 Cookie 鉴权、转发团队服务端、保存本机
 *     顶级文件夹与 DSH 会话映射、创建本地目录、挂载 Design Studio 画布。
 *   - 会话里的工具/技能通过内部令牌代表当前用户调用团队服务端。
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// 改造自 dsh-design-studio@0.29.0（MIT）：host 半端并入工作台插件，右侧栏由工作台统一注册。
import * as designStudio from './design-studio/lib/index.js'
import * as designStudioSkill from './design-studio/lib/skill.js'

export const name = 'dsh-workbench'
// webServer 只在 web profile 存在；headless/CLI profile 仍可挂载工具、技能和命令。
export const inject = []

const API_PREFIX = '/dsh-workbench/api'

// 同一台机器上跑多个 DSH 实例（例如多角色仿真容器）时，浏览器 Cookie
// 不区分端口；给每个实例一个后缀，避免在一个端口登录后串到其他实例。
function authCookieSuffix() {
  const raw = String(process.env.WORKBENCH_COOKIE_SUFFIX || '').trim().toLowerCase()
  if (raw === '') return ''
  const safe = raw.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  return safe === '' ? '' : `-${safe}`
}

const AUTH_COOKIE = `dsh-workbench-auth${authCookieSuffix()}`
const AUTH_STATE_COOKIE = `dsh-workbench-oauth-state${authCookieSuffix()}`
const SERVER_URL = String(process.env.WORKBENCH_SERVER_URL || 'http://127.0.0.1:3210').replace(/\/+$/, '')
const INTERNAL_TOKEN = String(process.env.WORKBENCH_INTERNAL_TOKEN || 'dsh-workbench-poc-internal-token')
// 与 Rust 服务端保持一致：只有 development/dev/test 算开发环境，其他值
// （包括 production、staging、拼写错误）都按生产处理，避免绕过默认密钥检查。
const APP_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase()
const IS_PRODUCTION = !['development', 'dev', 'test'].includes(APP_ENV)
const ALLOW_REMOTE_BFF = envFlag(process.env.WORKBENCH_ALLOW_REMOTE_BFF)
const LOCAL_VERSION = 1

if (IS_PRODUCTION && INTERNAL_TOKEN === 'dsh-workbench-poc-internal-token') {
  throw new Error('生产环境必须设置 WORKBENCH_INTERNAL_TOKEN，并与 Rust 服务端保持一致')
}

function envFlag(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

let baseDirOverride = null

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function iso() {
  return new Date().toISOString()
}

function dshHome() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh')
  return path.resolve(home)
}

function localFile() {
  return path.join(dshHome(), 'cache', 'dsh-workbench-poc', 'local.json')
}

function unsafeBaseDirReason(value) {
  const resolved = path.resolve(value)
  if (resolved === path.parse(resolved).root) return '不能使用文件系统根目录'
  const home = path.resolve(os.homedir())
  if (resolved === home) return '不能直接使用用户主目录'
  // 不只拒绝这些目录本身，也拒绝它们的子目录：把顶级文件夹设成
  // ~/.ssh/keys 会把私钥目录暴露给预览和文件夹接口。
  const sensitive = ['.ssh', '.dsh', '.aws', '.config', '.gnupg', '.kube', '.docker']
    .map(name => path.join(home, name))
  if (sensitive.some(dir => isInside(dir, resolved))) return '不能使用用户主目录下的配置/密钥目录'
  return ''
}

function defaultBaseDir() {
  const raw = baseDirOverride !== null
    ? baseDirOverride
    : process.env.DSH_WORKBENCH_BASE && process.env.DSH_WORKBENCH_BASE.trim() !== ''
      ? path.resolve(process.env.DSH_WORKBENCH_BASE)
      : path.join(os.homedir(), 'DSH-Workbench')
  const reason = unsafeBaseDirReason(raw)
  if (reason !== '') throw new Error(`工作台顶级文件夹不安全：${reason}（${raw}）`)
  return raw
}

function slugTitle(title) {
  return safeSegment(title, '未命名需求').slice(0, 48)
}

// ---------------------------------------------------------------------------
// Local-only state: top-level folder + DSH session mapping. Never sent to the
// team server (the server only knows "folder configured" and session records).
// ---------------------------------------------------------------------------

function emptyLocalUser() {
  return {
    topLevelFolder: null,
    folders: {},
    sessions: {},
    dshSessions: {},
    sessionOwners: {},
    // DSH 会话 -> 用户。会话第一次从工作台打开时由浏览器带 Cookie 认领；
    // 工具/命令只按这个映射解析身份，不再使用进程级“最后登录用户”。
    sessionUsers: {},
    // 已经写过开场白的会话：只在本机记录，避免重复往会话日志里追加消息。
    greetedSessions: {},
  }
}

function normalizeLocal(raw) {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  data.version = LOCAL_VERSION
  if (!data.users || typeof data.users !== 'object') data.users = {}
  for (const userId of Object.keys(data.users)) {
    const user = data.users[userId]
    if (!user || typeof user !== 'object') data.users[userId] = emptyLocalUser()
    else {
      const base = emptyLocalUser()
      data.users[userId] = {
        ...base,
        ...user,
        folders: user.folders && typeof user.folders === 'object' ? user.folders : {},
        sessions: user.sessions && typeof user.sessions === 'object' ? user.sessions : {},
        dshSessions: user.dshSessions && typeof user.dshSessions === 'object' ? user.dshSessions : {},
        sessionOwners: user.sessionOwners && typeof user.sessionOwners === 'object' ? user.sessionOwners : {},
        sessionUsers: user.sessionUsers && typeof user.sessionUsers === 'object' ? user.sessionUsers : {},
        greetedSessions: user.greetedSessions && typeof user.greetedSessions === 'object' ? user.greetedSessions : {},
      }
    }
  }
  return data
}

function loadLocal() {
  const file = localFile()
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    // 合法 JSON 也可能是数组/标量；直接 spread 会写出 `[]` 并丢掉全部映射。
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('local.json 顶层不是对象')
    }
    if (parsed.users !== undefined && (!parsed.users || typeof parsed.users !== 'object' || Array.isArray(parsed.users))) {
      throw new Error('local.json 的 users 不是对象')
    }
    return normalizeLocal(parsed)
  } catch (reason) {
    if (fs.existsSync(file)) {
      console.error('[dsh-workbench] local.json 结构无效，已备份并重建', reason)
      try { fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* best effort */ }
    }
    return normalizeLocal(null)
  }
}

let localStamp = 0

// 同一台机器可能跑多个 DSH 进程（headless/容器/桌面），local.json 不是单写者。
// 每次读写前按 mtime 重新载入，避免一个进程用旧映射把另一个进程刚写入的会话覆盖掉。
function refreshLocal(local) {
  try {
    const stat = fs.statSync(localFile())
    if (stat.mtimeMs === localStamp) return
    const fresh = loadLocal()
    for (const key of Object.keys(local)) delete local[key]
    Object.assign(local, fresh)
    localStamp = stat.mtimeMs
  } catch { /* 文件不存在或暂时不可读：保留当前内存状态 */ }
}

function saveLocal(data) {
  const file = localFile()
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
  try { fs.chmodSync(file, 0o600) } catch { /* best effort */ }
  try { localStamp = fs.statSync(file).mtimeMs } catch { localStamp = 0 }
}

function localUser(data, userId) {
  if (!data.users[userId]) data.users[userId] = emptyLocalUser()
  return data.users[userId]
}

function baseDirFor(local, userId) {
  const user = localUser(local, userId)
  if (user.topLevelFolder !== null && user.topLevelFolder !== undefined && user.topLevelFolder !== '') {
    const stored = path.resolve(user.topLevelFolder)
    if (unsafeBaseDirReason(stored) === '') return stored
  }
  return defaultBaseDir()
}

function ensureBaseDir(local, userId) {
  const dir = baseDirFor(local, userId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function isInside(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

// 目录穿越和符号链接是 host 侧最容易被忽略的边界：路径字符串在 base 内，
// 但中间某一级 symlink 可能指向外部。这里逐级 lstat，存在 symlink 就拒绝。
function assertNoSymlinkBetween(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  if (!isInside(resolvedRoot, resolvedTarget)) {
    throw httpError(403, '路径不在允许的工作台目录内')
  }
  const relative = path.relative(resolvedRoot, resolvedTarget)
  if (relative === '') return
  let current = resolvedRoot
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    let stat
    try { stat = fs.lstatSync(current) } catch (reason) {
      if (reason && reason.code === 'ENOENT') return
      throw reason
    }
    if (stat.isSymbolicLink()) throw httpError(403, '路径中包含符号链接，已拒绝访问')
  }
}

const WINDOWS_RESERVED_SEGMENT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

function assertLocalFolderInside(base, value, label = '目录') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, `缺少${label}`)
  }
  const resolved = path.resolve(value)
  if (!isInside(base, resolved)) throw httpError(403, `${label}必须位于本机顶级文件夹内`)
  assertNoSymlinkBetween(base, resolved)
  if (fs.existsSync(resolved)) {
    let realBase
    let realTarget
    try {
      realBase = fs.realpathSync(base)
      realTarget = fs.realpathSync(resolved)
    } catch {
      throw httpError(403, `${label}无法解析真实路径`)
    }
    if (!isInside(realBase, realTarget)) throw httpError(403, `${label}的真实路径不在工作台内`)
  }
  return resolved
}

function safeSegment(value, fallback = '未命名') {
  let cleaned = String(value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    // Windows 不接受尾随空格/点，也不接受 CON、NUL、COM1 这类设备名。
    // 目录还会在 macOS/Linux 上被共享，所以统一按最严格规则处理。
    cleaned = cleaned.replace(/[. ]+$/g, '').trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return fallback
  if (WINDOWS_RESERVED_SEGMENT.test(cleaned)) cleaned = `_${cleaned}`
  return cleaned
}

function resolveAndCreateTopFolder(input, local, userId) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (raw === '') throw httpError(400, '顶级文件夹不能为空')
  const expanded = raw === '~'
    ? os.homedir()
    : raw.startsWith('~/')
      ? path.join(os.homedir(), raw.slice(2))
      : raw
  const resolved = path.resolve(expanded)
  const unsafe = unsafeBaseDirReason(resolved)
  if (unsafe !== '') throw httpError(403, `顶级文件夹不安全：${unsafe}`)
  const allowedRoots = [os.homedir(), defaultBaseDir(), baseDirFor(local, userId)]
  const containingRoot = allowedRoots.find(root => isInside(root, resolved))
  if (containingRoot === undefined) throw httpError(403, '顶级文件夹必须位于本机用户目录内')
  // 从真正包含目标的根开始逐级查符号链接；不能用 os.homedir() 硬锚定，
  // 否则 DSH_WORKBENCH_BASE 指向 /workbench 这类家目录外路径时会被误拒。
  assertNoSymlinkBetween(containingRoot, resolved)
  fs.mkdirSync(resolved, { recursive: true })
  if (!fs.statSync(resolved).isDirectory()) throw httpError(400, '顶级文件夹路径不是目录')
  // mkdir 之后再按真实路径校验一次，覆盖“目标是已存在的 symlink”这种情况。
  const real = fs.realpathSync(resolved)
  const realAllowed = allowedRoots.some(root => {
    try { return isInside(fs.realpathSync(root), real) } catch { return false }
  })
  if (!realAllowed) throw httpError(403, '顶级文件夹的真实路径不在允许范围内')
  return real
}

function freeSiblingPath(parent, name) {
  const direct = path.join(parent, name)
  if (!fs.existsSync(direct)) return direct
  const stem = name.replace(/ \(\d+\)$/, '')
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parent, `${stem} (${index})`)
    if (!fs.existsSync(candidate)) return candidate
  }
  throw httpError(409, '同名需求目录过多，请换一个名称')
}

function ensureRequirementFolder(parent, name, local, userId, unique = false) {
  if (typeof parent !== 'string' || parent.trim() === '') throw httpError(400, '缺少父目录')
  if (typeof name !== 'string' || name.trim() === '') throw httpError(400, '缺少目录名')
  const base = baseDirFor(local, userId)
  const resolvedParent = path.resolve(parent)
  // 允许直接在顶级文件夹下创建迭代目录（迭代目录同时是需求会话的工作区）；
  // 更深的目录仍必须落在工作台范围内。
  if (!isInside(base, resolvedParent)) {
    throw httpError(403, '需求目录只能建在工作台顶级文件夹内')
  }
  assertNoSymlinkBetween(base, resolvedParent)
  const safeName = safeSegment(name, '')
  if (safeName === '') throw httpError(400, '目录名为空或非法')
  // 需求根目录按名称冲突自动加「 (2)」；prototype/design 等固定子目录直接复用。
  const target = unique ? freeSiblingPath(resolvedParent, safeName) : path.join(resolvedParent, safeName)
  fs.mkdirSync(target, { recursive: true })
  const realBase = fs.realpathSync(base)
  const realTarget = fs.realpathSync(target)
  if (!isInside(realBase, realTarget)) throw httpError(403, '需求目录的真实路径不在工作台内')
  return realTarget
}

const DESIGN_FILE_SKIP = new Set(['node_modules', '.git', '.dsh', 'exports', 'refs', 'dist', 'build', 'prototype', 'design'])
const PROTOTYPE_DIR = 'prototype'
const DESIGN_DIR = 'design'
// 新建需求后右栏先摆一张空白画布。文件名以 _ 开头，Design Studio 和工作台扫描
// 都把它当草稿忽略，真正开始做原型后不会混进「原型作品」列表。
const BLANK_CANVAS_NAME = '_canvas.html'
const BLANK_CANVAS_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>空白画布</title>
<style>
html,body{height:100%;margin:0}
body{display:grid;place-items:center;background:#fff;color:#8a8f98;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.blank{text-align:center}
.blank b{display:block;font-size:15px;font-weight:600;color:#5f6672}
.blank span{display:block;margin-top:6px;font-size:12px;color:#9aa0aa}
</style>
</head>
<body><div class="blank"><b>空白画布</b><span>在会话里描述需求，第一屏会出现在这里。</span></div></body>
</html>
`
const BLANK_DESIGN_HTML = BLANK_CANVAS_HTML.replace(
  '在会话里描述需求，第一屏会出现在这里。',
  '在设计会话里描述设计稿，第一屏会出现在这里。',
)

function listHtmlFiles(dirPath, baseDir, relativeBase) {
  if (typeof dirPath !== 'string' || dirPath.trim() === '') return []
  const root = path.resolve(dirPath)
  if (!isInside(baseDir, root)) return []
  let realBase
  let realRoot
  let realRelativeBase
  try {
    realBase = fs.realpathSync(baseDir)
    realRoot = fs.realpathSync(root)
    realRelativeBase = fs.realpathSync(relativeBase ?? root)
  } catch {
    return []
  }
  if (!isInside(realBase, realRoot) || !isInside(realBase, realRelativeBase)) return []
  const files = []
  const walk = (dir, depth) => {
    if (depth > 2) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      // 和 Design Studio 一致：. 开头是隐藏文件，_ 开头是草稿 / 空白画布占位，都不算一屏。
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!DESIGN_FILE_SKIP.has(entry.name)) walk(full, depth + 1)
        continue
      }
      if (!entry.isFile() || !/\.html?$/i.test(entry.name)) continue
      try {
        const real = fs.realpathSync(full)
        if (!isInside(realRoot, real)) continue
        const stat = fs.statSync(real)
        files.push({
          name: entry.name,
          path: real,
          relativePath: path.relative(realRelativeBase, real),
          updatedAt: stat.mtime.toISOString(),
          size: stat.size,
        })
      } catch { /* 读不到或指向外部就跳过 */ }
    }
  }
  walk(realRoot, 0)
  return files.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

// 需求根目录保留给早期需求（设计稿直接放在根上）；新需求的设计稿在 design/，
// 原型在 prototype/。两个目录分开扫描，原型不会混进设计交付里。
function listDesignFiles(folderPath, baseDir) {
  const local = listHtmlFiles(folderPath, baseDir, folderPath)
  const dedicated = listHtmlFiles(path.join(folderPath, DESIGN_DIR), baseDir, folderPath)
  const seen = new Set(dedicated.map(file => file.relativePath))
  return [...dedicated, ...local.filter(file => !seen.has(file.relativePath))]
}

function listPrototypeFiles(folderPath, baseDir) {
  return listHtmlFiles(path.join(folderPath, PROTOTYPE_DIR), baseDir, folderPath)
}

function attachWorkingFolders(requirement, baseDir) {
  if (typeof requirement.folderPath !== 'string' || requirement.folderPath === '') {
    requirement.prototypePath = null
    requirement.designPath = null
    requirement.prototypeFiles = []
    return requirement
  }
  requirement.prototypePath = path.join(requirement.folderPath, PROTOTYPE_DIR)
  requirement.designPath = path.join(requirement.folderPath, DESIGN_DIR)
  requirement.prototypeFiles = listPrototypeFiles(requirement.folderPath, baseDir)
  return requirement
}

// ---------------------------------------------------------------------------
// Team server client
// ---------------------------------------------------------------------------

async function serverRaw(route, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (options.body !== undefined && headers['content-type'] === undefined) {
    headers['content-type'] = 'application/json'
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`
  } else if (options.actor) {
    headers['x-workbench-internal-token'] = INTERNAL_TOKEN
    headers['x-workbench-actor'] = options.actor
  }
  let response
  try {
    response = await fetch(`${SERVER_URL}${route}`, {
      method: options.method || 'GET',
      headers,
      // 不跟随跳转：内部令牌是机器凭据，不能因为上游返回 3xx 就把它转发到别的主机。
      redirect: 'manual',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(20000),
    })
  } catch (reason) {
    console.error('[dsh-workbench] upstream request failed', route, reason)
    const timeout = reason?.name === 'TimeoutError' || reason?.name === 'AbortError'
    throw httpError(timeout ? 504 : 503, timeout ? '团队服务端响应超时' : '团队服务端不可用')
  }
  if (response.status >= 300 && response.status < 400) {
    throw httpError(502, '团队服务端返回了不允许的跳转')
  }
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > 12 * 1024 * 1024) {
    throw httpError(502, '团队服务端响应过大')
  }
  // 不能先 response.text() 再检查大小：分块/压缩响应会先被完整读进内存。
  const chunks = []
  let total = 0
  if (response.body !== null) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > 12 * 1024 * 1024) {
        await reader.cancel().catch(() => {})
        throw httpError(502, '团队服务端响应过大')
      }
      chunks.push(Buffer.from(value))
    }
  }
  const text = Buffer.concat(chunks).toString('utf8')
  let data = {}
  if (text.trim() !== '') {
    try { data = JSON.parse(text) } catch { data = { error: `团队服务端返回了非 JSON 响应（${response.status}）` } }
  }
  return { status: response.status, ok: response.ok, data }
}

async function serverJson(route, options = {}) {
  const result = await serverRaw(route, options)
  if (!result.ok) {
    throw httpError(result.status, result.data?.error || `团队服务端返回 ${result.status}`)
  }
  return result.data
}

function serverAs(actorId, route, method = 'GET', body) {
  return serverJson(route, { method, actor: actorId, body })
}

async function authConfig() {
  const config = await serverJson('/auth/config')
  return {
    ...config,
    defaultBaseDir: defaultBaseDir(),
  }
}

// 远端（反代/容器）只用于登录，不应拿到宿主机目录。顶级文件夹和每个需求的
// folderPath 都只在本机回环请求里返回。
function withoutLocalPaths(payload) {
  if (payload === null || typeof payload !== 'object') return payload
  const copy = { ...payload }
  delete copy.baseDir
  delete copy.defaultBaseDir
  if (copy.user && typeof copy.user === 'object') {
    copy.user = {
      ...copy.user,
      onboarding: copy.user.onboarding && typeof copy.user.onboarding === 'object'
        ? { ...copy.user.onboarding, topLevelFolder: null }
        : copy.user.onboarding,
    }
  }
  return copy
}

// ---------------------------------------------------------------------------
// HTTP helpers / auth cookies
// ---------------------------------------------------------------------------

// 预览票据：内存里的一张短期票，绑定 用户 + 需求 + 当时的登录 token。
// 只用来让沙箱 iframe 读 design-preview，不落盘、不写日志，过期即失效。
const PREVIEW_TICKET_TTL_MS = 120 * 1000
const PREVIEW_TICKET_MAX = 200
const previewTickets = new Map()

function sweepPreviewTickets(now) {
  for (const [id, entry] of previewTickets) {
    if (entry.expiresAt <= now) previewTickets.delete(id)
  }
  // 超过上限时先丢最早的：票据只是一次预览的通行证，丢了大不了重新换一张。
  while (previewTickets.size > PREVIEW_TICKET_MAX) {
    const oldest = previewTickets.keys().next()
    if (oldest.done) break
    previewTickets.delete(oldest.value)
  }
}

function mintPreviewTicket(userId, requirementId, token) {
  const now = Date.now()
  sweepPreviewTickets(now)
  const ticket = crypto.randomBytes(24).toString('base64url')
  previewTickets.set(ticket, { userId, requirementId, token, expiresAt: now + PREVIEW_TICKET_TTL_MS })
  return ticket
}

function verifyPreviewTicket(ticket) {
  if (typeof ticket !== 'string' || ticket === '') return null
  sweepPreviewTickets(Date.now())
  const entry = previewTickets.get(ticket)
  if (entry === undefined) return null
  if (entry.expiresAt <= Date.now()) {
    previewTickets.delete(ticket)
    return null
  }
  return entry
}

function parseCookies(req) {
  const raw = req.headers.cookie
  if (typeof raw !== 'string' || raw === '') return {}
  const out = {}
  for (const part of raw.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key !== '') {
      try { out[key] = decodeURIComponent(value) } catch { out[key] = value }
    }
  }
  return out
}

function serializeCookie(name, value, maxAge) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  const secure = process.env.WORKBENCH_COOKIE_SECURE === '0'
    ? false
    : process.env.WORKBENCH_COOKIE_SECURE === '1' || IS_PRODUCTION
  if (secure) bits.push('Secure')
  return bits.join('; ')
}

function appendCookie(res, cookie) {
  const current = res.getHeader('set-cookie')
  if (current === undefined) res.setHeader('set-cookie', [cookie])
  else if (Array.isArray(current)) res.setHeader('set-cookie', [...current, cookie])
  else res.setHeader('set-cookie', [String(current), cookie])
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(payload))
  res.end(payload)
}

const MAX_JSON_BYTES = 8 * 1024 * 1024

function readJson(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
      req.resume()
      return reject(httpError(413, '请求体过大'))
    }
    let body = ''
    let size = 0
    let settled = false
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      if (settled) return
      size += Buffer.byteLength(chunk)
      if (size > MAX_JSON_BYTES) {
        settled = true
        // 不销毁连接，先把剩余请求体读完，保证 413 能正常返回。
        body = ''
        req.resume()
        reject(httpError(413, '请求体过大'))
        return
      }
      body += chunk
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      if (body.trim() === '') return resolve({})
      try {
        const parsed = JSON.parse(body)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(httpError(400, '请求体必须是 JSON 对象'))
          return
        }
        resolve(parsed)
      } catch { reject(httpError(400, '请求体不是合法 JSON')) }
    })
    req.on('error', (reason) => { if (!settled) { settled = true; reject(reason) } })
  })
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function trustedHostname(rawHost) {
  // Host 头是客户端可控的：不要用它推导同源目标或 OAuth 回调地址。
  // DSH host 只在本机回环上提供服务；需要额外主机名时显式配置白名单。
  const host = String(rawHost ?? '').split(',')[0].trim()
  if (host === '' || /[\s/@\\]/.test(host) || host.includes('://')) return null
  let hostname = ''
  try {
    hostname = new URL(`http://${host}`).hostname.toLowerCase()
  } catch {
    return null
  }
  if (LOOPBACK_HOSTNAMES.has(hostname)) return host
  const allowed = String(process.env.WORKBENCH_ALLOWED_HOSTS ?? '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.includes(host.toLowerCase()) || allowed.includes(hostname)) return host
  return null
}

function requestOrigin(req) {
  // 反代部署必须显式设置 WORKBENCH_PUBLIC_URL；不要根据客户端可伪造的
  // X-Forwarded-* 推导同源判断和 OAuth 回调地址。
  if (typeof process.env.WORKBENCH_PUBLIC_URL === 'string' && process.env.WORKBENCH_PUBLIC_URL.trim() !== '') {
    try { return new URL(process.env.WORKBENCH_PUBLIC_URL).origin } catch { /* fall through */ }
  }
  const host = trustedHostname(req.headers.host)
  if (host === null) throw httpError(403, 'Host 不受信任，请通过 127.0.0.1/localhost 访问工作台')
  const proto = req.socket && req.socket.encrypted ? 'https' : 'http'
  return `${proto}://${host}`
}

function redirect(res, location) {
  res.statusCode = 302
  res.setHeader('location', location)
  res.end()
}

function htmlPage(res, status, title, detail) {
  const safeTitle = escapeHtml(title)
  const payload = `<!doctype html><meta charset="utf-8"><title>${safeTitle}</title><body style="font-family:system-ui;padding:40px;max-width:680px"><h1>${safeTitle}</h1><p>${escapeHtml(detail)}</p></body>`
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(payload)
}

// 浏览器写请求必须是同源。SameSite=Lax 已经挡住大部分 CSRF；这里再加一层
// Origin / Sec-Fetch-Site 校验，避免反向代理或旧浏览器上的边界情况。
function assertSameOrigin(req) {
  const method = req.method || 'GET'
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  const origin = req.headers.origin
  // 无论 Origin 是什么都先校验 Host：避免 DNS rebinding 把恶意域名解析到
  // 127.0.0.1，再借“看起来同源”的 Host 写入本机会话/文件夹映射。
  const expectedOrigin = requestOrigin(req)
  // 桌面端 DSH 的渲染层跑在 dsh-app://app 自定义协议下（见 dsh-desktop 主进程），
  // 同源 fetch 的 Origin 是 "dsh-app://app"，也可能是字面量 "null"。这些都不是跨站，
  // 放行；只对真正的 http(s) 跨站 Origin 做比对拒绝。下面的 Sec-Fetch-Site 仍会挡住
  // 明确的跨站写请求（cross-site）。
  if (typeof origin === 'string' && /^https?:\/\//i.test(origin)) {
    if (origin !== expectedOrigin) {
      throw httpError(403, '跨站写请求已被拒绝')
    }
  }
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== '' && site !== 'same-origin' && site !== 'none') {
    throw httpError(403, '跨站写请求已被拒绝')
  }
}

function safeReturnTo(req, raw) {
  const origin = requestOrigin(req)
  try {
    const candidate = new URL(typeof raw === 'string' && raw !== '' ? raw : '/', origin)
    if (candidate.origin !== origin) return '/'
    return `${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return '/'
  }
}

function tokenFromRequest(req) {
  const auth = String(req.headers.authorization || '')
  if (/^Bearer\s+/i.test(auth)) {
    const bearer = auth.replace(/^Bearer\s+/i, '').trim()
    if (bearer !== '') return bearer
  }
  const cookie = parseCookies(req)[AUTH_COOKIE]
  return typeof cookie === 'string' && cookie !== '' ? cookie : ''
}

// 每个请求都去服务端换一次身份会把 /state 轮询放大成双倍请求。身份本身在
// JWT TTL 内不变，这里只缓存 5 秒；退出登录时主动清掉对应条目。
const AUTH_SESSION_CACHE_MS = 5_000
const AUTH_SESSION_CACHE_MAX = 200
const authSessionCache = new Map()

async function sessionFromRequest(req, local) {
  // 桌面端渲染层在 dsh-app://app 自定义协议下运行时，Set-Cookie 可能不落地；
  // 因此同时接受 Authorization: Bearer <token>（客户端登录后存 localStorage）。
  // 显式 Bearer 优先于 Cookie：避免浏览器里残留账号 B 的 Cookie 时，
  // 请求却带着账号 A 的 Bearer，静默以 B 的身份执行。
  const token = tokenFromRequest(req)
  if (token === '') return null
  let authPayload = null
  const cached = authSessionCache.get(token)
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    authPayload = cached.payload
  } else {
    if (cached !== undefined) authSessionCache.delete(token)
    const result = await serverRaw('/auth/session', { token })
    if (result.status === 401) return null
    if (!result.ok) {
      const status = result.status >= 500 ? 503 : result.status
      throw httpError(status, result.data?.error || '团队服务端身份校验失败')
    }
    if (result.data?.authenticated !== true) return null
    authPayload = result.data
    authSessionCache.set(token, { payload: authPayload, expiresAt: Date.now() + AUTH_SESSION_CACHE_MS })
    while (authSessionCache.size > AUTH_SESSION_CACHE_MAX) {
      const oldest = authSessionCache.keys().next()
      if (oldest.done) break
      authSessionCache.delete(oldest.value)
    }
  }
  const user = authPayload.user
  if (!user || typeof user.id !== 'string') return null
  const localState = localUser(local, user.id)
  if (!localState.topLevelFolder) {
    // 登录校验不应因为磁盘/权限问题整体失败；目录在真正创建需求时再确保存在。
    try {
      const base = defaultBaseDir()
      fs.mkdirSync(base, { recursive: true })
      localState.topLevelFolder = base
      saveLocal(local)
    } catch { /* 保留 null，后续 baseDirFor 会回退到默认目录 */ }
  }
  const effectiveBase = baseDirFor(local, user.id)
  const payload = {
    ...authPayload,
    user: {
      ...user,
      onboarding: {
        ...(user.onboarding || {}),
        topLevelFolder: effectiveBase,
      },
    },
    baseDir: effectiveBase,
    defaultBaseDir: defaultBaseDir(),
  }
  return { token, payload, user: payload.user }
}

function isLoopbackRequest(req) {
  const raw = req.socket?.remoteAddress
  if (typeof raw !== 'string' || raw === '') return true
  const address = raw.replace(/^::ffff:/i, '').toLowerCase()
  return address === '127.0.0.1' || address === '::1'
}

// 登录相关页面可以由反向代理从远端访问；其余接口会读写本机路径、DSH 会话映射
// 和预览票据，只允许本机回环。容器/局域网场景需显式设置 WORKBENCH_ALLOW_REMOTE_BFF=1。
function remoteAllowedRoute(route) {
  return route === '/health'
    || route === '/auth/config'
    || route === '/auth/session'
    || route === '/auth/logout'
    || route.startsWith('/auth/dingtalk/')
}

function isDesktopClient(req) {
  const origin = req.headers.origin
  const referer = String(req.headers.referer || '')
  // 桌面壳把 dsh-app://app 的请求代理到本地 host 时会删掉 Origin 和
  // Sec-Fetch-Site（见 dsh-desktop 的 forwardWebRequest），页面又带
  // Referrer-Policy: no-referrer，所以桌面请求到这里三个头都没有。
  // 浏览器同源 POST 一定会带 Origin，因此“没有 Origin”就是桌面端。
  // 生产环境走钉钉登录，/auth/mock 不可用，不受这条规则影响。
  if (origin === undefined || origin === '') return true
  return origin === 'dsh-app://app' || origin === 'null' || referer.startsWith('dsh-app://')
}

function issueAuthCookie(req, res, payload) {
  if (typeof payload?.token === 'string' && payload.token !== '') {
    const maxAge = Number.isFinite(Number(payload.expiresIn)) ? Number(payload.expiresIn) : 7 * 24 * 60 * 60
    appendCookie(res, serializeCookie(AUTH_COOKIE, payload.token, maxAge))
  }
  // 浏览器只拿 HttpOnly Cookie，响应体不回传 JWT；桌面端 dsh-app://app 下 Cookie
  // 可能不持久，才把 token 返回给客户端存进 localStorage 并以 Authorization: Bearer 发送。
  if (isDesktopClient(req)) return { ...payload }
  const { token: _token, ...rest } = payload ?? {}
  return rest
}

// ---------------------------------------------------------------------------
// State decoration: merge server records with local folders + DSH session IDs
// ---------------------------------------------------------------------------

function iterationOf(state, requirement) {
  return (state.iterations || []).find(item => item.id === requirement.iterationId) || state.iteration
}

function folderPathFor(localState, baseDir, state, requirement) {
  const stored = localState.folders[requirement.id]
  if (typeof stored === 'string' && stored.trim() !== '') {
    // 旧版本只校验写入时的字符串边界；升级后文件可能被替换成符号链接，
    // 或 local.json 被手工改到工作台外。读取时重新验证，坏映射回退到规范目录。
    try { return assertLocalFolderInside(baseDir, stored, '需求目录') } catch { /* fall through */ }
  }
  const iteration = iterationOf(state, requirement)
  if (!iteration) return ''
  const iterationDir = path.join(baseDir, safeSegment(iteration.code, '未命名迭代'))
  const titled = path.join(iterationDir, slugTitle(requirement.title))
  // 兼容旧数据：早期目录是「编号-名称」。新目录优先；旧目录仍然存在时继续用它，
  // 避免升级后找不到已有的原型和设计稿。
  const legacy = path.join(iterationDir, `${safeSegment(requirement.code, 'REQ')}-${slugTitle(requirement.title)}`)
  try {
    if (fs.existsSync(titled)) return titled
    if (fs.existsSync(legacy)) return legacy
  } catch { /* fall through */ }
  return titled
}

function decorateRequirement(localState, baseDir, state, requirement) {
  const folderPath = folderPathFor(localState, baseDir, state, requirement)
  const sessions = (Array.isArray(requirement.sessions) ? requirement.sessions : []).map(record => {
    const mapped = localState.sessions[record.id]
    return {
      ...record,
      sessionId: mapped?.dshSessionId ?? null,
      workspaceId: mapped?.workspaceId ?? null,
      folderPath: mapped?.folderPath ?? folderPath,
      local: mapped !== undefined,
    }
  })
  let primary = null
  if (requirement.primarySessionId) {
    primary = sessions.find(item => item.id === requirement.primarySessionId && item.sessionId) || null
  }
  if (primary === null) primary = sessions.find(item => item.sessionId) || null
  const decorated = {
    ...requirement,
    folderPath,
    prototypePath: folderPath === '' ? null : path.join(folderPath, PROTOTYPE_DIR),
    designPath: folderPath === '' ? null : path.join(folderPath, DESIGN_DIR),
    // 卡片和右栏要显示本机原型/设计稿数量；只读目录，不读文件内容。
    prototypeFiles: folderPath === '' ? [] : listPrototypeFiles(folderPath, baseDir),
    designFiles: folderPath === '' ? [] : listDesignFiles(folderPath, baseDir),
    sessions,
    sessionId: primary?.sessionId ?? null,
    workspaceId: primary?.workspaceId ?? null,
  }
  if (folderPath !== '') attachDesignScreens(decorated)
  return decorated
}

function decorateState(data, local, userId) {
  const localState = localUser(local, userId)
  const baseDir = baseDirFor(local, userId)
  const state = {
    ...data,
    baseDir,
    requirements: [],
  }
  state.iterationDir = state.iteration ? path.join(baseDir, safeSegment(state.iteration.code, '未命名迭代')) : baseDir
  state.requirements = (data.requirements || []).map(requirement => decorateRequirement(localState, baseDir, state, requirement))
  return state
}

function findMappedRecord(local, userId, dshSessionId) {
  if (typeof dshSessionId !== 'string' || dshSessionId === '') return null
  const user = local.users[userId]
  if (!user) return null
  return user.dshSessions?.[dshSessionId] ?? null
}

function findSessionOwner(local, dshSessionId) {
  if (typeof dshSessionId !== 'string' || dshSessionId === '') return null
  for (const [userId, user] of Object.entries(local.users)) {
    if (user?.sessionUsers?.[dshSessionId] === userId) return userId
    if (user?.sessionUsers?.[dshSessionId] === true) return userId
    if (user?.dshSessions?.[dshSessionId]) return userId
  }
  return null
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    throw httpError(400, '路径参数编码不合法')
  }
}

function makeRoute(local, hostCtx = null) {
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
          // 容器里的 DSH 网页经宿主机端口访问时，Design Studio 的随机预览端口在容器内，
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
        if (token !== '') authSessionCache.delete(token)
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

      // 设计稿预览：工作台自己的同源路由，不依赖 Design Studio 的随机端口预览服务。
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
          if (!artifact || artifact.kind !== 'design' || artifact.requirementId !== requirementId) {
            return json(res, 404, { error: '设计文件不存在或不属于这个需求' })
          }
          const content = typeof data.content === 'string' ? data.content : ''
          const buffer = artifact.encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8')
          return sendDesignPreview(res, buffer, artifact.name, artifact.contentType)
        }
        const relativePath = url.searchParams.get('path') || ''
        if (relativePath === '' || path.isAbsolute(relativePath)) {
          return json(res, 400, { error: '缺少合法的文件路径' })
        }
        const stateData = await serverJson('/state', { token })
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

      // 浏览器在打开某个 DSH 会话时认领它。之后这个会话里的工具/命令只代表
      // 认领人执行；换一个账号打开同一个会话会被拒绝，避免串号。
      if (req.method === 'POST' && route === '/sessions/claim') {
        const body = await readJson(req)
        const dshSessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        if (dshSessionId === '' || dshSessionId.length > 200) {
          return json(res, 400, { error: '缺少合法的会话 ID' })
        }
        const owner = findSessionOwner(local, dshSessionId)
        if (owner !== null && owner !== userId) {
          return json(res, 403, { error: '这个会话已经属于其他工作台账号，不能切换身份' })
        }
        localUser(local, userId).sessionUsers[dshSessionId] = userId
        saveLocal(local)
        return json(res, 200, { ok: true, userId })
      }

      // 需求会话的开场白：写进会话日志，成为一条真实的 assistant 消息。
      // 不用输入框上方的浮层，也不发模型请求。只在会话还没有真正开始（没有
      // 任何 turn）时写一次；写成 self-contained 的 turn 1 并当场收尾。
      // 会话日志要求第一个 turn/start 必须是 turn 1（DSH 重放时会校验），所以
      // 不能写 turn 0。写完把仍空转的 Agent 的 lastTurn 一起推到 1，用户真正
      // 发出的第一条消息才会接在 turn 2，而不是和开场白抢 turn 1。
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
        if (localState.greetedSessions[dshSessionId] === true) {
          return json(res, 200, { ok: true, skipped: 'greeted' })
        }
        const live = typeof hostCtx?.get === 'function' ? hostCtx.get('sessions')?.get?.(dshSessionId) : undefined
        if (live === undefined || live === null) {
          return json(res, 409, { error: '会话还没有在 DSH 里打开' })
        }
        const agents = typeof hostCtx?.get === 'function' ? hostCtx.get('agents') : undefined
        const agent = agents?.get?.(dshSessionId)
        // 已经有真实轮次的会话不再补开场白（用户已经发过消息了）。
        let boundary = null
        try { boundary = agents?.turnBoundaryOf?.(live) ?? null } catch { boundary = null }
        if (boundary !== null && (boundary.openTurnStartSeq !== null || boundary.lastTurn !== 0)) {
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
        const kind = body.kind === 'design' ? 'design' : 'requirement'
        const text = kind === 'design'
          ? '请描述这次要做的设计稿：页面、关键状态和参考风格。\n\n补全后发送，模型会把一屏一个 HTML 写进这条需求的设计目录 design/，右栏画布直接出图。'
          : '请描述你的需求。\n\n补全后发送，模型会把一屏一个 HTML 写进这条需求的原型目录 prototype/，右栏画布直接出图。'
        const message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: [{ type: 'text', text }],
          source: { kind: 'model', provider: 'dsh-workbench', model: 'workbench-greeting' },
        }
        // 先落盘“尝试过”标记：如果 append 只写进去一半，宁可这次没有开场白，
        // 也不能重试再写一个 turn 1（DSH 重放校验会直接判定会话日志损坏）。
        localState.greetedSessions[dshSessionId] = true
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
        const data = await serverJson('/state', { token: session.token })
        return json(res, 200, decorateState(data, local, userId))
      }

      if (req.method === 'GET' && route === '/requirement') {
        const dshSessionId = url.searchParams.get('sessionId') ?? ''
        const recordId = findMappedRecord(local, userId, dshSessionId)
        if (recordId === null) return json(res, 200, { requirement: null })
        const data = await serverJson(`/requirements/by-session/${encodeURIComponent(recordId)}`, { token: session.token })
        if (!data.requirement) return json(res, 200, { requirement: null })
        const baseDir = baseDirFor(local, userId)
        const stateData = await serverJson('/state', { token: session.token })
        const requirement = decorateRequirement(localUser(local, userId), baseDir, stateData, data.requirement)
        requirement.designFiles = listDesignFiles(requirement.folderPath, baseDir)
        attachWorkingFolders(requirement, baseDir)
        attachDesignScreens(requirement)
        return json(res, 200, { requirement })
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

      // 新建需求后右栏立刻有一张空白画布：在需求目录的 prototype/ 下放一个 _ 开头的
      // 占位 HTML，Design Studio 打开它就有画布（外观 / 体检 / 导出 / 版本都在）。
      // 真正的原型写进 prototype/ 后，右栏会切到原型目录，这张占位页不会再出现。
      if (req.method === 'POST' && route === '/design/blank-canvas') {
        const body = await readJson(req)
        const requirementId = typeof body.requirementId === 'string' ? body.requirementId.trim() : ''
        if (requirementId === '') return json(res, 400, { error: '缺少需求 ID' })
        const kind = body.kind === 'design' ? 'design' : 'prototype'
        const dirName = kind === 'design' ? DESIGN_DIR : PROTOTYPE_DIR
        const html = kind === 'design' ? BLANK_DESIGN_HTML : BLANK_CANVAS_HTML
        const stateData = await serverJson('/state', { token: session.token })
        const baseRequirement = (stateData.requirements || []).find(item => item.id === requirementId)
        if (!baseRequirement) return json(res, 404, { error: '需求不存在或无权访问' })
        const baseDir = baseDirFor(local, userId)
        const folder = folderPathFor(localUser(local, userId), baseDir, stateData, baseRequirement)
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

      if (req.method === 'POST' && route === '/requirements') {
        const body = await readJson(req)
        const result = await serverRaw('/requirements', { method: 'POST', token: session.token, body })
        return json(res, result.status, result.data)
      }

      const sessionMatch = /^\/requirements\/([^/]+)\/sessions$/.exec(route)
      if (req.method === 'POST' && sessionMatch) {
        const id = decodeRoutePart(sessionMatch[1])
        const body = await readJson(req)
        const result = await serverJson(`/requirements/${encodeURIComponent(id)}/sessions`, {
          method: 'POST',
          token: session.token,
          body: { type: body.type, label: body.label },
        })
        const localState = localUser(local, userId)
        const record = result.session
        const dshSessionId = typeof body.dshSessionId === 'string' ? body.dshSessionId : ''
        const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null
        const folderPath = typeof body.folderPath === 'string' && body.folderPath.trim() !== '' ? body.folderPath : null
        // 需求资料目录（原型/设计稿）与会话工作区可能不同：新流程会话挂在迭代
        // 目录下，资料目录由 requirementFolder 单独记录。
        const requirementFolder = typeof body.requirementFolder === 'string' && body.requirementFolder.trim() !== ''
          ? body.requirementFolder
          : null
        if (dshSessionId.length > 200 || (workspaceId !== null && workspaceId.length > 200) || (folderPath !== null && folderPath.length > 2000) || (requirementFolder !== null && requirementFolder.length > 2000)) {
          return json(res, 400, { error: '会话映射字段过长' })
        }
        if (dshSessionId !== '') {
          const owner = findSessionOwner(local, dshSessionId)
          if (owner !== null && owner !== userId) {
            return json(res, 403, { error: '这个 DSH 会话已属于其他账号，不能重复绑定' })
          }
        }
        if (folderPath !== null) {
          const base = baseDirFor(local, userId)
          try {
            assertLocalFolderInside(base, folderPath, '需求文件夹')
          } catch (reason) {
            return json(res, reason?.status ?? 403, { error: reason instanceof Error ? reason.message : '需求文件夹不合法' })
          }
        }
        if (requirementFolder !== null) {
          const base = baseDirFor(local, userId)
          try {
            assertLocalFolderInside(base, requirementFolder, '需求资料目录')
          } catch (reason) {
            return json(res, reason?.status ?? 403, { error: reason instanceof Error ? reason.message : '需求资料目录不合法' })
          }
        }
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
        const stateData = await serverJson('/state', { token: session.token })
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
          const stateData = await serverJson('/state', { token: session.token })
          const baseRequirement = (stateData.requirements || []).find(item => item.id === id)
          if (baseRequirement) folder = folderPathFor(localState, baseDir, stateData, baseRequirement)
        }
        if (files.length === 0 && folder) {
          files = listDesignFiles(folder, baseDir).map(file => file.relativePath)
        }
        const upload = await uploadDesignArtifacts(
          userId,
          folder,
          baseDir,
          id,
          files,
        )
        const result = await serverJson(`/requirements/${encodeURIComponent(id)}/design-deliver`, {
          method: 'POST',
          token: session.token,
          body: { summary: body.summary, files, artifactIds: upload.artifactIds },
        })
        return json(res, 200, { ...result, uploadWarnings: upload.warnings })
      }

      // ---- generic proxy -------------------------------------------------------
      const method = req.method || 'GET'
      if (!['GET', 'HEAD', 'POST'].includes(method)) {
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
      return json(res, result.status, result.data)
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500
      return json(res, status, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

function toolOutput(text) {
  return { text }
}

function defineTool(name, description, parameters, execute) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: String(value.text ?? '') }],
    },
    execute,
  }
}

function actorIdFromExec(local, exec) {
  refreshLocal(local)
  const sessionId = exec?.agent?.session?.id
  if (typeof sessionId === 'string' && sessionId !== '') {
    const owner = findSessionOwner(local, sessionId)
    if (owner !== null) return owner
  }
  throw httpError(401, '当前会话还没有绑定工作台身份。请从研发工作台的迭代里“进入会话”，或在右侧“需求”面板打开一次这个会话。')
}

async function stateFor(actorId) {
  return serverAs(actorId, '/state')
}

async function requirementForExec(local, actorId, args, exec) {
  const explicit = typeof args?.requirement === 'string' ? args.requirement.trim() : ''
  const state = await stateFor(actorId)
  let requirement = null
  if (explicit !== '') {
    requirement = state.requirements.find(item => (
      item.id === explicit
      || item.code.toLowerCase() === explicit.toLowerCase()
      || item.sessions.some(session => session.id === explicit || session.sessionId === explicit)
    )) ?? null
  } else {
    const dshSessionId = exec?.agent?.session?.id
    const recordId = dshSessionId ? findMappedRecord(local, actorId, dshSessionId) : null
    if (recordId !== null) {
      requirement = state.requirements.find(item => (
        item.primarySessionId === recordId
        || item.sessions.some(session => session.id === recordId)
      )) ?? null
    }
  }
  if (requirement === null) {
    throw httpError(explicit === '' ? 400 : 404,
      explicit === ''
        ? '请给出需求编号，例如 S11-008；或者在一个已绑定需求的会话里调用'
        : `找不到需求「${explicit}」`)
  }
  return { state, requirement }
}

function actorLabel(state, actorId) {
  return state.users.find(user => user.id === actorId)?.name ?? actorId
}

function platformNames(state, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return '未设置平台'
  return ids
    .map(id => state.platforms.find(platform => platform.id === id)?.shortName ?? id)
    .join('、')
}

function sessionTypeLabel(type) {
  if (type === 'design') return '设计'
  if (type === 'review') return '评审'
  if (type === 'dev') return '开发'
  if (type === 'test') return '测试'
  return '需求'
}

function statusLabel(status) {
  return ({
    draft: '草稿',
    creating: '创建中',
    create_failed: '创建失败',
    pending_review: '待评审',
    changes_requested: '待修改',
    approved: '已通过',
    scheduled: '已排期',
    backlog: '已暂缓',
    in_progress: '开发中',
    dev_done: '待测试',
    testing: '测试中',
    test_failed: '测试不通过',
    test_passed: '测试通过',
    frozen: '已冻结',
    released: '已发布',
    done: '已完成',
  })[status] ?? status
}

function requirementSummaryLine(state, requirement) {
  const iteration = (state.iterations || []).find(item => item.id === requirement.iterationId)
  const dates = requirement.plannedStartDate || requirement.plannedEndDate
    ? `，计划 ${requirement.plannedStartDate ?? '待定'} ~ ${requirement.plannedEndDate ?? '待定'}`
    : ''
  const dev = Array.isArray(requirement.devTasks) && requirement.devTasks.length > 0
    ? `，开发 ${requirement.devTasks.filter(task => task.status === 'done').length}/${requirement.devTasks.length}`
    : ''
  const latestTest = Array.isArray(requirement.testRuns) && requirement.testRuns.length > 0
    ? `，测试 ${requirement.testRuns[requirement.testRuns.length - 1].status}`
    : ''
  return `${requirement.code}「${requirement.title}」：${statusLabel(requirement.status)}`
    + `${requirement.inScope ? '（本期）' : '（范围外）'}${dates}${dev}${latestTest}`
    + `，设计 ${requirement.designStatus}${requirement.designUpdatedAt ? '（已更新）' : ''}`
    + `，负责人 ${state.users.find(user => user.id === requirement.ownerId)?.name ?? requirement.ownerId}`
    + `，平台 ${platformNames(state, requirement.platformIds)}`
    + (iteration ? `，迭代 ${iteration.code}` : '')
}

function requirementFolder(local, actorId, state, requirement) {
  return folderPathFor(localUser(local, actorId), baseDirFor(local, actorId), state, requirement)
}

// 设计稿以团队服务端保存的交付产物为准：设计师本机文件只在本人界面上补充，
// 其他角色也能看到同一份原型和预览图。
function attachDesignScreens(requirement) {
  const artifacts = Array.isArray(requirement.artifacts) ? requirement.artifacts : []
  const localFiles = Array.isArray(requirement.designFiles) ? requirement.designFiles : []
  const localNames = new Set(localFiles.map(file => file.name))
  const screens = localFiles.map(file => ({
    source: 'local',
    kind: 'html',
    name: file.name,
    relativePath: file.relativePath,
    updatedAt: file.updatedAt,
    size: file.size,
  }))
  for (const artifact of artifacts) {
    if (artifact.kind !== 'design' || typeof artifact.name !== 'string') continue
    if (!/\.html?$/i.test(artifact.name)) continue
    if (localNames.has(path.basename(artifact.name))) continue
    if (screens.some(screen => screen.name === artifact.name)) continue
    screens.push({
      source: 'server',
      kind: 'html',
      name: artifact.name,
      artifactId: artifact.id,
      version: artifact.designVersion ?? null,
      updatedAt: artifact.createdAt,
      size: artifact.size,
    })
  }
  const images = artifacts
    .filter(artifact => artifact.kind === 'design' && typeof artifact.name === 'string')
    .filter(artifact => /^image\//i.test(String(artifact.contentType || '')))
    .filter(artifact => !/\.html?$/i.test(artifact.name))
    .map(artifact => ({
      source: 'server',
      kind: 'image',
      name: artifact.name,
      artifactId: artifact.id,
      version: artifact.designVersion ?? null,
      updatedAt: artifact.createdAt,
      size: artifact.size,
    }))
  requirement.designScreens = screens
  requirement.designImages = images
}

const DESIGN_PREVIEW_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function sendDesignPreview(res, buffer, name, declaredType) {
  const ext = path.extname(String(name || '')).toLowerCase()
  const passiveDeclared = new Set([
    'text/html', 'text/css', 'text/plain', 'text/markdown',
    'text/javascript', 'application/javascript',
    'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  ])
  let type = DESIGN_PREVIEW_TYPES[ext]
  if (type === undefined) {
    const declared = String(declaredType || '').split(';')[0].trim().toLowerCase()
    if (passiveDeclared.has(declared)) type = declared
  }
  if (type === undefined) {
    res.statusCode = 415
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: '不支持预览这个文件类型' }))
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', type)
  res.setHeader('content-length', buffer.length)
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('cross-origin-resource-policy', 'same-origin')
  if (/text\/html|text\/css|javascript|image\/svg/i.test(type)) {
    // 原型是别人写的 HTML：放进沙箱源里跑，拿不到工作台会话，也不许加载外部资源、
    // 提交表单或借 base 标签改解析地址。
    res.setHeader('content-security-policy', "sandbox allow-scripts allow-forms allow-modals; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'; object-src 'none'")
  }
  res.end(buffer)
}

// 交付设计时把本机设计文件正文上传到团队服务端，这样其他设备也能看到同一份
// 设计稿。单文件限制 1.5 MB，只上传文本类设计资产；失败不阻断交付。
const DESIGN_UPLOAD_MAX_BYTES = 1_500_000
const DESIGN_UPLOAD_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

async function uploadDesignArtifacts(userId, folder, baseDir, requirementId, files) {
  const artifactIds = []
  const warnings = []
  if (typeof folder !== 'string' || folder === '' || !Array.isArray(files) || files.length === 0) {
    return { artifactIds, warnings }
  }
  let realFolder
  try {
    realFolder = fs.realpathSync(folder)
    const realBase = fs.realpathSync(baseDir)
    if (!isInside(realBase, realFolder)) {
      return { artifactIds, warnings: ['需求文件夹不在工作台目录内，已跳过设计稿上传'] }
    }
  } catch {
    return { artifactIds, warnings: ['需求文件夹不存在，已跳过设计稿上传'] }
  }
  for (const relativePath of files.slice(0, 30)) {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') continue
    const ext = path.extname(relativePath).toLowerCase()
    const contentType = DESIGN_UPLOAD_TYPES[ext]
    if (!contentType) {
      warnings.push(`${relativePath}：不支持的文件类型，未上传`)
      continue
    }
    try {
      const target = path.resolve(realFolder, relativePath)
      assertNoSymlinkBetween(realFolder, target)
      const real = fs.realpathSync(target)
      if (!isInside(realFolder, real)) throw new Error('文件不在需求文件夹内')
      const stat = fs.statSync(real)
      if (!stat.isFile()) throw new Error('不是普通文件')
      if (stat.size > DESIGN_UPLOAD_MAX_BYTES) throw new Error('文件超过 1.5 MB')
      const content = fs.readFileSync(real, 'utf8')
      const result = await serverAs(userId, `/requirements/${encodeURIComponent(requirementId)}/artifacts`, 'POST', {
        name: path.relative(realFolder, real).split(path.sep).join('/'),
        contentType,
        content,
        kind: 'design',
      })
      if (result?.artifact?.id) artifactIds.push(result.artifact.id)
    } catch (reason) {
      warnings.push(`${relativePath}：${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }
  return { artifactIds, warnings }
}

function requirementIdForAction(local, actorId, args, exec) {
  return requirementForExec(local, actorId, args, exec).then(({ requirement }) => requirement.id)
}

async function actionOnRequirement(local, actorId, args, exec, action, body) {
  const id = await requirementIdForAction(local, actorId, args, exec)
  const result = await serverAs(actorId, `/requirements/${encodeURIComponent(id)}/${action}`, 'POST', body)
  return result
}

function iterationFromState(state, reference) {
  const ref = typeof reference === 'string' ? reference.trim().toLowerCase() : ''
  if (ref === '') return state.iteration
  return (state.iterations || []).find(item => (
    item.id.toLowerCase() === ref
    || item.code.toLowerCase() === ref
    || item.shortCode.toLowerCase() === ref
  ))
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function registerTools(ctx, local) {
  ctx.inject(['tools'], (sub) => {
    sub.tools.register(defineTool(
      'workbench_submit_requirement',
      '提交研发工作台中的需求，进入待评审。参数 requirement 可省略：当前会话已绑定需求时自动取会话对应的需求。仅在用户明确要求提交需求/送评审时调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号，例如 S11-008；省略则取当前会话绑定的需求' },
          summary: { type: 'string', description: '本次提交摘要' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'submit', { summary: args?.summary })
        return toolOutput(`已提交 ${result.requirement.code}「${result.requirement.title}」，当前状态：${statusLabel(result.requirement.status)}（v${result.requirement.versions.length}）。`)
      },
    ))

    sub.tools.register(defineTool(
      'workbench_update_document',
      '更新研发工作台需求的活文档（摘要、正文、验收标准）。仅在用户明确要求编写或更新需求文档时调用。参数 requirement 可省略：当前会话已绑定需求时自动取会话对应的需求。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          summary: { type: 'string', description: '需求摘要' },
          body: { type: 'string', description: '需求正文：背景、目标、范围、用户故事、交互流程、数据/接口说明等' },
          acceptanceCriteria: { type: 'string', description: '验收标准，建议逐条编号' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const payload = {}
        if (typeof args?.summary === 'string') payload.summary = args.summary
        if (typeof args?.body === 'string') payload.body = args.body
        if (typeof args?.acceptanceCriteria === 'string') payload.acceptanceCriteria = args.acceptanceCriteria
        const result = await actionOnRequirement(local, actorId, args, exec, 'document', payload)
        return toolOutput(`已更新 ${result.requirement.code}「${result.requirement.title}」的需求文档（v${result.requirement.document.version}）。`)
      },
    ))

    sub.tools.register(defineTool(
      'workbench_claim_design',
      '认领研发工作台中的设计任务，把设计状态改为设计中并记录当前设计人员。参数 requirement 可省略：当前会话已绑定需求时自动取会话对应的需求。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'design-claim', {})
        return toolOutput(`已认领 ${result.requirement.code}「${result.requirement.title}」的设计。`)
      },
    ))

    sub.tools.register(defineTool(
      'workbench_requirement_status',
      '查询研发工作台中一个需求的完整状态：需求/设计状态、范围、排期、评审、各平台开发任务、测试与发布。参数 requirement 可省略：当前会话已绑定需求时自动取会话对应的需求。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { state, requirement } = await requirementForExec(local, actorId, args, exec)
        const dev = (requirement.devTasks || []).length === 0
          ? '无'
          : requirement.devTasks.map(task => {
            const platform = state.platforms.find(item => item.id === task.platformId)?.shortName ?? task.platformId
            const owner = task.assigneeId ? state.users.find(user => user.id === task.assigneeId)?.name ?? task.assigneeId : '未指派'
            return `${platform} ${task.status}(${owner})`
          }).join('；')
        const latestTest = (requirement.testRuns || []).length === 0
          ? '无'
          : requirement.testRuns[requirement.testRuns.length - 1]
        return toolOutput(
          `${requirementSummaryLine(state, requirement)}。\n`
          + `需求版本 v${requirement.versions.length}，设计版本 d${requirement.designVersions.length}，`
          + `设计人员 ${requirement.designerId ?? '未认领'}，会话 ${requirement.sessions.length} 个。\n`
          + `开发：${dev}\n`
          + `测试：${latestTest === '无' ? '无' : `${latestTest.status}${latestTest.note ? `（${latestTest.note}）` : ''}`}\n`
          + (requirement.release ? `发布：${requirement.release.version}（${requirement.release.at}）` : '发布：未发布'),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_design_context',
      '开始或继续一个需求的设计前调用：返回需求状态、设计状态、平台、需求文件夹和已有 HTML 设计文件。只读取，不修改。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { state, requirement } = await requirementForExec(local, actorId, args, exec)
        const baseDir = baseDirFor(local, actorId)
        const folder = requirementFolder(local, actorId, state, requirement)
        const files = listDesignFiles(folder, baseDir)
        const fileText = files.length === 0
          ? '无'
          : files.slice(0, 20).map(file => file.relativePath).join('、')
        const prototypes = listPrototypeFiles(folder, baseDir)
        const prototypeText = prototypes.length === 0
          ? '无'
          : prototypes.slice(0, 12).map(file => file.relativePath).join('、')
        return toolOutput(
          `${requirement.code}「${requirement.title}」：需求状态 ${statusLabel(requirement.status)}，设计状态 ${requirement.designStatus}，`
          + `设计人员 ${requirement.designerId ?? '未认领'}，平台 ${platformNames(state, requirement.platformIds)}。\n`
          + `需求文件夹：${folder ? '已创建（本机，路径不进入模型上下文）' : '尚未创建'}。\n`
          + `已有原型（${prototypes.length}，prototype/ 只作为需求参考，不参与设计交付）：${prototypeText}。\n`
          + `已有设计文件（${files.length}）：${fileText}。\n`
          + '开始设计：先加载 wb-ui-design 技能；设计稿写进这条需求的 design/ 目录（一屏一个 HTML 文件），'
          + '不要覆盖 prototype/ 里的需求原型；'
          + '完成后调用 wb_preview_page 打开第一屏，并用 wb_check_design 自查；交付时调用 workbench_deliver_design。',
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_deliver_design',
      '交付研发工作台中的设计：把设计状态改为已交付并记录设计版本。开发开始后交付会标记“设计已更新”。仅在用户明确要求交付设计/设计完成时调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          summary: { type: 'string', description: '本次设计交付摘要' },
          files: { type: 'array', items: { type: 'string' }, description: '设计文件相对路径；省略时扫描需求文件夹' },
          artifactIds: { type: 'array', items: { type: 'string' }, description: '额外纳入本次设计版本的服务端附件 ID（如已上传的预览图）' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { state, requirement } = await requirementForExec(local, actorId, args, exec)
        const folder = requirementFolder(local, actorId, state, requirement)
        let files = Array.isArray(args?.files) ? args.files : []
        if (files.length === 0) {
          files = listDesignFiles(folder, baseDirFor(local, actorId)).map(file => file.relativePath)
        }
        const upload = await uploadDesignArtifacts(
          actorId,
          folder,
          baseDirFor(local, actorId),
          requirement.id,
          files,
        )
        // 交付前已经上传、但还没归入任何设计版本的设计附件（例如预览图），
        // 默认一并纳入本次交付，避免它们散落在团队文件里。
        const pendingArtifactIds = (requirement.artifacts ?? [])
          .filter(artifact => artifact.kind === 'design' && !artifact.designVersion)
          .map(artifact => artifact.id)
        const requested = Array.isArray(args?.artifactIds)
          ? args.artifactIds.filter(id => typeof id === 'string')
          : []
        const artifactIds = [...new Set([...upload.artifactIds, ...pendingArtifactIds, ...requested])]
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(requirement.id)}/design-deliver`, 'POST', {
          summary: args?.summary,
          files,
          artifactIds,
        })
        const latest = result.requirement.designVersions[result.requirement.designVersions.length - 1]
        return toolOutput(
          `已交付 ${result.requirement.code}「${result.requirement.title}」的设计（d${result.requirement.designVersions.length}），`
          + `状态：设计已交付。设计文件：${latest.files.join('、') || '未记录'}。`
          + (latest.artifactIds?.length ? `本次设计版本包含 ${latest.artifactIds.length} 个服务端文件。` : '')
          + (result.requirement.designUpdatedAt ? '开发已开始，已标记“设计已更新”。' : '')
          + (upload.warnings.length ? `上传提示：${upload.warnings.join('；')}` : ''),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_review_requirement',
      '评审研发工作台中的需求：decision=approve 通过，decision=reject 退回待修改。多人会签时必须全部通过。只有待评审的需求可以评审；仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          decision: { type: 'string', enum: ['approve', 'reject'], description: 'approve 通过；reject 退回修改' },
          comment: { type: 'string', description: '评审意见' },
        },
        required: ['decision'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'review', {
          decision: args?.decision,
          comment: args?.comment,
        })
        const waiting = result.requirement.reviewerIds.length > 0
          ? `会签人 ${result.requirement.reviewerIds.length} 位。`
          : ''
        return toolOutput(
          `已${result.review.decision === 'approved' ? '通过' : '退回'}评审 ${result.requirement.code}「${result.requirement.title}」，`
          + `当前状态：${statusLabel(result.requirement.status)}。${waiting}`
          + (result.requirement.inScope ? '已纳入本期范围。' : '当前不在本期范围。'),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_set_reviewers',
      '设置需求的会签人：只有待评审阶段可设置，所有人通过后需求才进入已通过。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          userIds: { type: 'array', items: { type: 'string' }, description: '会签人用户 id 列表' },
        },
        required: ['userIds'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'reviewers', {
          userIds: Array.isArray(args?.userIds) ? args.userIds : [],
        })
        return toolOutput(
          `${result.requirement.code} 的会签人已设置为：${result.requirement.reviewerIds.join('、') || '无（单人评审）'}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_schedule_requirement',
      '给评审通过的需求排期：设置计划开始/结束日期（YYYY-MM-DD），可以只改一端。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          startDate: { type: 'string', description: '计划开始日期 YYYY-MM-DD' },
          endDate: { type: 'string', description: '计划结束日期 YYYY-MM-DD' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'schedule', {
          startDate: args?.startDate,
          endDate: args?.endDate,
        })
        return toolOutput(
          `已排期 ${result.requirement.code}「${result.requirement.title}」：`
          + `${result.requirement.plannedStartDate ?? '待定'} ~ ${result.requirement.plannedEndDate ?? '待定'}，`
          + `当前状态：${statusLabel(result.requirement.status)}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_scope_requirement',
      '调整需求的本期范围：inScope=true 纳入本期，inScope=false 移出到暂缓。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          inScope: { type: 'boolean', description: 'true 纳入本期；false 移出本期' },
          reason: { type: 'string', description: '范围调整原因' },
        },
        required: ['inScope'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'scope', {
          inScope: args?.inScope,
          reason: args?.reason,
        })
        return toolOutput(
          `已把 ${result.requirement.code}「${result.requirement.title}」${result.requirement.inScope ? '纳入本期范围' : '移出本期范围（暂缓）'}，`
          + `当前状态：${statusLabel(result.requirement.status)}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_dev_action',
      '开发阶段操作：assign 按平台指派开发负责人（需 assigneeId）；claim 认领平台开发；start 开始开发（记录真实开发开始时间）；finish 完成开发（生成 Mock MR/流水线）；reopen 重新打开开发。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          action: { type: 'string', enum: ['assign', 'claim', 'start', 'finish', 'reopen'], description: '开发操作' },
          platformId: { type: 'string', description: '平台 id，例如 trade-server / web / ios' },
          assigneeId: { type: 'string', description: 'assign 时的开发负责人用户 id' },
          note: { type: 'string', description: '完成开发备注' },
        },
        required: ['action', 'platformId'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const action = String(args?.action ?? '')
        const platformId = String(args?.platformId ?? '')
        const base = { platformId }
        let path = ''
        let body = base
        if (action === 'assign') {
          path = 'dev-assign'
          body = { ...base, assigneeId: args?.assigneeId }
        } else if (action === 'claim') {
          path = 'dev-claim'
        } else if (action === 'start') {
          path = 'dev-start'
        } else if (action === 'finish') {
          path = 'dev-finish'
          body = { ...base, note: args?.note }
        } else if (action === 'reopen') {
          path = 'dev-reopen'
        } else {
          throw httpError(400, 'action 只能是 assign / claim / start / finish / reopen')
        }
        const result = await actionOnRequirement(local, actorId, args, exec, path, body)
        const task = result.requirement.devTasks.find(item => item.platformId === platformId)
        return toolOutput(
          `已对 ${result.requirement.code}「${result.requirement.title}」的 ${platformId} 执行 ${action}，`
          + `任务状态 ${task?.status ?? '未知'}，需求状态 ${statusLabel(result.requirement.status)}。`
          + (task?.mrUrl ? ` MR：${task.mrUrl}` : ''),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_test_action',
      '测试阶段操作：start 开始测试；pass 测试通过；fail 测试不通过并记录缺陷。仅测试/负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          action: { type: 'string', enum: ['start', 'pass', 'fail'], description: '测试操作' },
          note: { type: 'string', description: '测试结论说明' },
          bugUrl: { type: 'string', description: '测试不通过时的缺陷链接' },
        },
        required: ['action'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const action = String(args?.action ?? '')
        let path = ''
        let body = { note: args?.note, bugUrl: args?.bugUrl }
        if (action === 'start') {
          path = 'test-start'
          body = {}
        } else if (action === 'pass') {
          path = 'test-pass'
        } else if (action === 'fail') {
          path = 'test-fail'
        } else {
          throw httpError(400, 'action 只能是 start / pass / fail')
        }
        const result = await actionOnRequirement(local, actorId, args, exec, path, body)
        return toolOutput(
          `已对 ${result.requirement.code}「${result.requirement.title}」执行测试 ${action}，`
          + `当前状态：${statusLabel(result.requirement.status)}。`
          + (args?.bugUrl ? ` 缺陷：${args.bugUrl}` : ''),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_release_action',
      '发布阶段操作：freeze 测试通过后冻结；unfreeze 解冻；release 发布并记录版本号。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          action: { type: 'string', enum: ['freeze', 'unfreeze', 'release'], description: '发布操作' },
          version: { type: 'string', description: 'release 时的版本号，例如 v1.2.0' },
        },
        required: ['action'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const action = String(args?.action ?? '')
        if (!['freeze', 'unfreeze', 'release'].includes(action)) {
          throw httpError(400, 'action 只能是 freeze / unfreeze / release')
        }
        const result = await actionOnRequirement(local, actorId, args, exec, action, {
          version: args?.version,
        })
        return toolOutput(
          `已对 ${result.requirement.code}「${result.requirement.title}」执行 ${action}，`
          + `当前状态：${statusLabel(result.requirement.status)}。`
          + (result.requirement.release ? ` 发布版本：${result.requirement.release.version}。` : ''),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_move_requirement',
      '把需求移动到另一个迭代，服务端会按目标迭代重新编号。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          iteration: { type: 'string', description: '目标迭代 id、编码或短码，例如 2026-S12' },
        },
        required: ['iteration'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { requirement } = await requirementForExec(local, actorId, args, exec)
        const iterationRef = String(args?.iteration ?? '').trim()
        const state = await stateFor(actorId)
        const iteration = iterationFromState(state, iterationRef)
        if (!iteration) throw httpError(404, `找不到迭代「${iterationRef}」`)
        const result = await serverAs(actorId, `/iterations/${encodeURIComponent(iteration.id)}/move-requirement`, 'POST', {
          requirement: requirement.id,
        })
        return toolOutput(
          `已把 ${requirement.code}「${requirement.title}」移动到 ${iteration.code}，新编号 ${result.requirement.code}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_iteration_update',
      '迭代管理：修改名称/阶段/状态/日期/会签人，或 archive/restore 归档恢复。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          iteration: { type: 'string', description: '迭代 id、编码或短码；省略取当前迭代' },
          name: { type: 'string', description: '迭代名称' },
          phase: { type: 'string', description: '迭代阶段，例如 需求 / 设计 / 开发 / 测试' },
          status: { type: 'string', enum: ['planning', 'in_progress', 'done'], description: '迭代状态' },
          startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
          endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          reviewerIds: { type: 'array', items: { type: 'string' }, description: '默认会签人用户 id' },
          archived: { type: 'boolean', description: 'true 归档；false 恢复' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const state = await stateFor(actorId)
        const iteration = iterationFromState(state, args?.iteration)
        if (!iteration) throw httpError(404, `找不到迭代「${args?.iteration ?? ''}」`)
        if (typeof args?.archived === 'boolean') {
          const result = await serverAs(
            actorId,
            `/iterations/${encodeURIComponent(iteration.id)}/${args.archived ? 'archive' : 'restore'}`,
            'POST',
            {},
          )
          return toolOutput(`迭代 ${iteration.code} 已${args.archived ? '归档' : '恢复'}。`)
        }
        const result = await serverAs(actorId, `/iterations/${encodeURIComponent(iteration.id)}`, 'POST', {
          name: args?.name,
          phase: args?.phase,
          status: args?.status,
          startDate: args?.startDate,
          endDate: args?.endDate,
          reviewerIds: args?.reviewerIds,
        })
        return toolOutput(
          `迭代 ${result.iteration.code}「${result.iteration.name}」已更新：`
          + `状态 ${result.iteration.status}，${result.iteration.startDate || '待定'} ~ ${result.iteration.endDate || '待定'}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_iteration_status',
      '查看迭代概览：需求状态、范围、设计、开发、测试、计划日期和负责人。只读。不传 iteration 时取当前用户选中的迭代。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          iteration: { type: 'string', description: '迭代编码或 id；省略则取当前用户选中的迭代' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const state = await stateFor(actorId)
        const iteration = iterationFromState(state, args?.iteration)
        if (!iteration) throw httpError(404, `找不到迭代「${args?.iteration}」`)
        const requirements = state.requirements.filter(item => item.iterationId === iteration.id)
        const inScope = requirements.filter(item => item.inScope)
        const pending = requirements.filter(item => item.status === 'pending_review')
        const outside = requirements.filter(item => !item.inScope)
        const dev = requirements.filter(item => item.status === 'in_progress')
        const test = requirements.filter(item => ['dev_done', 'testing', 'test_failed'].includes(item.status))
        const lines = requirements.length === 0
          ? ['（还没有需求）']
          : [...requirements]
            .sort((a, b) => a.code.localeCompare(b.code))
            .map(item => `- ${requirementSummaryLine(state, item)}`)
        return toolOutput(
          `迭代 ${iteration.code}「${iteration.name}」：${iteration.startDate || '待定'} ~ ${iteration.endDate || '待定'}，`
          + `需求 ${requirements.length} 个，本期 ${inScope.length} 个，待评审 ${pending.length} 个，范围外 ${outside.length} 个，`
          + `开发中 ${dev.length} 个，待测试/测试中 ${test.length} 个。\n`
          + lines.join('\n'),
        )
      },
    ))
  })
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const SKILLS = [
  {
    name: 'req-submit',
    description: '提交研发工作台需求，进入待评审；调用 workbench_submit_requirement 工具。',
    whenToUse: '用户要求提交需求、送评审、发起需求评审时',
    content: [
      '# 提交需求',
      '',
      '1. 从用户消息或当前会话标题中确定需求编号（如 S11-008）。',
      '2. 调用 `workbench_submit_requirement`，`summary` 写一句本次提交摘要。',
      '3. 只汇报工具返回的结果；不要自己编造状态。',
      '',
      '权限：产品/负责人/管理员可以提交。',
    ].join('\n'),
  },
  {
    name: 'req-document',
    description: '编写或更新研发工作台需求活文档（摘要、正文、验收标准）；调用 workbench_update_document。',
    whenToUse: '用户要求补需求文档、写验收标准、更新需求说明时',
    content: [
      '# 编写需求文档',
      '',
      '1. 确定需求编号；需要时先调用 `workbench_requirement_status` 确认当前状态。',
      '2. 调用 `workbench_update_document`：',
      '   - `summary`：一句话说明这次要解决的问题和范围。',
      '   - `body`：背景、目标、范围/不做、用户故事、交互流程、数据与接口说明。',
      '   - `acceptanceCriteria`：逐条编号的验收标准，开发与测试直接引用。',
      '3. 只汇报工具返回的文档版本号；不要编造未保存的内容。',
      '',
      '权限：产品/负责人/管理员可以编辑；已创建中的需求需先完成创建。',
    ].join('\n'),
  },
  {
    name: 'design-claim',
    description: '认领研发工作台中的设计任务；调用 workbench_claim_design 工具。',
    whenToUse: '设计人员要求认领某条需求的设计时',
    content: [
      '# 认领设计',
      '',
      '1. 确定需求编号（如 S11-004）。',
      '2. 调用 `workbench_claim_design`。',
      '3. 只汇报工具返回的结果；不要编造设计状态。',
      '',
      '权限：设计/负责人/管理员可以认领；已有其他设计负责人时会被拒绝。',
    ].join('\n'),
  },
  {
    name: 'design-start',
    description: '为当前需求开始或继续做产品原型 / 设计稿：读取需求上下文，按会话类型写入 prototype/ 或 design/，并打开右侧画布。',
    whenToUse: '用户要求为某个需求做原型、开始/继续设计、改原型或改设计稿时',
    content: [
      '# 开始需求的原型 / 设计',
      '',
      '1. 调用 `workbench_design_context`（当前会话已绑定需求时不用传编号），拿到需求状态、平台、需求文件夹和已有文件。',
      '2. 先判断这次要产出什么：',
      '   - 需求会话里描述需求 → 做**产品原型**：一屏一个 HTML 写进 `prototype/`，优先信息结构、关键流程和状态完整，不追求最终视觉。',
      '   - 设计会话里做高保真 → 做**设计稿**：加载 `wb-ui-design` 技能，一屏一个 HTML 写进 `design/`（需求文件夹里已有设计文件时就放它旁边）。',
      '3. 做设计稿且设计未认领、当前身份是设计时，调用 `workbench_claim_design`。',
      '4. 先看已有文件再改，避免覆盖用户手改的内容；文件名不带序号，一屏一个语义化名字。',
      '5. 写完第一屏就调用 `wb_preview_page` 打开它（右侧画布会实时显示），之后改文件自动刷新。',
      '6. 设计稿用 `wb_check_design` 在真实尺寸下自查，需要真实截图时用 `wb_look_design`；最多三轮测量-修复。',
      '7. 只汇报改动文件、取舍和剩余问题；不要编造原型或设计状态。',
      '8. 设计稿完成后提示用户在会话里用 `/design-deliver` 交付；不要自行调用交付工具，除非用户明确要求交付。',
      '',
      '页面文案用中文（除非需求明确是海外业务）；内容紧扣需求范围和平台。',
    ].join('\n'),
  },
  {
    name: 'design-deliver',
    description: '交付当前需求的设计：记录设计版本与文件，把设计状态改为已交付；调用 workbench_deliver_design。',
    whenToUse: '设计人员或负责人要求交付设计、设计完成、提交设计稿时',
    content: [
      '# 交付设计',
      '',
      '1. 调用 `workbench_design_context` 确认需求文件夹和设计文件。',
      '2. 调用 `workbench_deliver_design`，`summary` 写一句本次交付摘要，`files` 传相对路径列表（省略时自动扫描）。',
      '3. 只汇报工具返回的结果；不要自己编造设计版本或交付状态。',
      '',
      '开发开始后交付或二次交付会自动标记“设计已更新”，并通知开发负责人。',
    ].join('\n'),
  },
  {
    name: 'req-review',
    description: '评审一个待评审需求：通过后进入已通过，退回后进入待修改；支持多人会签。调用 workbench_review_requirement。',
    whenToUse: '用户要求评审需求、通过/退回需求、给需求提评审意见时',
    content: [
      '# 评审需求',
      '',
      '1. 确定需求编号；需要时先调用 `workbench_requirement_status` 确认是否为「待评审」。',
      '2. 向用户确认评审结论（通过 / 退回）和评审意见；不要替用户做决定。',
      '3. 调用 `workbench_review_requirement`，`decision` 传 `approve` 或 `reject`。',
      '4. 多人会签时，提示还有哪些会签人未确认；全部通过后才进入已通过。',
      '5. 通过后提示可以继续排期（`/req-schedule`）；退回后提示产品修改并重新 `/req-submit`。',
    ].join('\n'),
  },
  {
    name: 'req-reviewers',
    description: '设置需求会签人；调用 workbench_set_reviewers。',
    whenToUse: '用户要求设置会签人、增加评审人、改成多人评审时',
    content: [
      '# 设置会签人',
      '',
      '1. 确定需求编号和会签人用户 id 列表。',
      '2. 调用 `workbench_set_reviewers`。',
      '3. 只有待评审阶段可以设置；所有人通过后需求才进入已通过。',
    ].join('\n'),
  },
  {
    name: 'req-schedule',
    description: '给已通过评审的需求排期：设置计划开始/结束日期；调用 workbench_schedule_requirement。',
    whenToUse: '用户要求排期、调整需求计划时间、定开始/结束日期时',
    content: [
      '# 需求排期',
      '',
      '1. 确定需求编号；需要时先调用 `workbench_requirement_status` 确认已通过、在本期范围内。',
      '2. 向用户确认计划开始和结束日期（YYYY-MM-DD）；可以只改一端。',
      '3. 调用 `workbench_schedule_requirement`。',
      '4. 只汇报工具返回的计划日期和状态。',
    ].join('\n'),
  },
  {
    name: 'req-scope',
    description: '调整需求的本期范围：纳入本期或移出到暂缓；调用 workbench_scope_requirement。',
    whenToUse: '用户要求把需求纳入/移出本期、调整迭代范围、暂缓需求时',
    content: [
      '# 调整需求范围',
      '',
      '1. 确定需求编号，向用户确认纳入还是移出，以及原因。',
      '2. 调用 `workbench_scope_requirement`。',
      '3. 范围调整会记录在需求变更历史里。',
    ].join('\n'),
  },
  {
    name: 'req-move',
    description: '把需求移动到另一个迭代并重新编号；调用 workbench_move_requirement。',
    whenToUse: '用户要求把需求挪到别的迭代、下期再做、跨迭代调整时',
    content: [
      '# 跨迭代移动',
      '',
      '1. 确认需求编号和目标迭代。',
      '2. 调用 `workbench_move_requirement`。',
      '3. 服务端会按目标迭代短码重新编号，并通知需求负责人。',
      '4. 已发布需求不允许移动。',
    ].join('\n'),
  },
  {
    name: 'iteration-plan',
    description: '查看当前迭代的需求排期概览，并协助做评审、排期、范围调整和会签设置。',
    whenToUse: '用户要求看迭代排期、过一遍本期需求、调整迭代计划时',
    content: [
      '# 迭代排期',
      '',
      '1. 调用 `workbench_iteration_status`（不传参数时取当前迭代）。',
      '2. 先给用户简短概览：待评审、未排期、范围外、设计未认领、设计已更新、测试不通过。',
      '3. 询问用户要调整哪些需求；不要一次性批量改动，也不要替用户做评审结论。',
      '4. 按用户确认逐条调用评审、排期、范围、会签工具。',
    ].join('\n'),
  },
  {
    name: 'iteration-edit',
    description: '修改迭代名称/阶段/状态/日期/会签人，或归档恢复迭代；调用 workbench_iteration_update。',
    whenToUse: '用户要求编辑迭代、结束迭代、归档迭代、恢复迭代、调整默认会签人时',
    content: [
      '# 迭代管理',
      '',
      '1. 确认目标迭代。',
      '2. 调用 `workbench_iteration_update`，按用户要求传名称、阶段、状态、日期、会签人或 `archived`。',
      '3. 归档前提醒用户：归档后迭代从切换列表隐藏，历史需求保留。',
    ].join('\n'),
  },
  {
    name: 'dev-assign',
    description: '按平台指派开发负责人；调用 workbench_dev_action(action=assign)。',
    whenToUse: '用户要求分配开发、指定某端负责人时',
    content: [
      '# 指派开发',
      '',
      '1. 确定需求、平台和开发负责人用户 id。',
      '2. 调用 `workbench_dev_action`，`action` 传 `assign`，传 `platformId` 和 `assigneeId`。',
      '3. 负责人在会话里可用 `/dev-start` 自行认领并开始开发。',
    ].join('\n'),
  },
  {
    name: 'dev-start',
    description: '认领并开始某个平台的开发，记录真实开发开始时间；调用 workbench_dev_action(action=claim/start)。',
    whenToUse: '用户要求开始开发、认领开发任务、继续开发时',
    content: [
      '# 开始开发',
      '',
      '1. 确定需求和平台。',
      '2. 未指派时先调用 `workbench_dev_action` 的 `claim`；已指派时直接 `start`。',
      '3. `start` 会记录真实开发开始时间，之后交付的设计会标记“设计已更新”。',
      '4. 开始前提醒用户确认设计是否已交付。',
    ].join('\n'),
  },
  {
    name: 'dev-finish',
    description: '完成某个平台的开发，生成 Mock MR 与流水线状态；调用 workbench_dev_action(action=finish)。',
    whenToUse: '用户要求完成开发、提测、提交 MR 时',
    content: [
      '# 完成开发',
      '',
      '1. 确认需求和平台。',
      '2. 调用 `workbench_dev_action`，`action` 传 `finish`。',
      '3. 所有平台完成后需求进入「待测试」，并通知测试人员。',
      '4. 测试不通过需要重新开发时，用 `/dev-start` 或 `reopen` 重新打开。',
    ].join('\n'),
  },
  {
    name: 'test-verify',
    description: '测试开始、通过或不通过；调用 workbench_test_action。',
    whenToUse: '用户要求开始测试、提交测试结论、记录测试缺陷时',
    content: [
      '# 测试验证',
      '',
      '1. 确认需求已进入待测试。',
      '2. `start` 开始测试；`pass` 记录通过；`fail` 记录不通过和缺陷链接。',
      '3. 不通过会通知开发负责人和需求负责人；修复后重新 `start`。',
      '4. 全部通过后才能冻结。',
    ].join('\n'),
  },
  {
    name: 'release-freeze',
    description: '测试通过后冻结、解冻和发布；调用 workbench_release_action。',
    whenToUse: '用户要求冻结需求、发布上线、解冻需求时',
    content: [
      '# 冻结与发布',
      '',
      '1. 确认需求已测试通过。',
      '2. `freeze` 冻结；`release` 发布并传版本号；`unfreeze` 解冻回到测试通过。',
      '3. 只汇报服务端返回的状态和版本号。',
    ].join('\n'),
  },
]

const BUILTIN_SKILL_NAMES = new Set(SKILLS.map(skill => skill.name))

function registerSkills(ctx) {
  ctx.inject(['skills'], (sub) => {
    for (const skill of SKILLS) {
      try {
        sub.skills.register({
          name: skill.name,
          description: skill.description,
          whenToUse: skill.whenToUse,
          source: 'runtime',
          invocation: { modelInvocable: true, userInvocable: true },
          content: skill.content,
        })
      } catch (reason) {
        ctx.logger?.warn?.(`[dsh-workbench] 注册技能 ${skill.name} 失败：${reason instanceof Error ? reason.message : String(reason)}`)
      }
    }
  })
}

async function syncPublishedSkills(ctx) {
  try {
    const data = await serverAs('admin', '/skills/published')
    const extras = (data.skills || []).filter(skill => !BUILTIN_SKILL_NAMES.has(skill.name))
    if (extras.length === 0) return
    ctx.inject(['skills'], (sub) => {
      for (const skill of extras) {
        try {
          sub.skills.register({
            name: skill.name,
            description: skill.description,
            whenToUse: '团队技能库中已审核发布的技能',
            source: 'runtime',
            invocation: { modelInvocable: true, userInvocable: true },
            content: skill.content,
          })
        } catch (reason) {
          ctx.logger?.warn?.(`[dsh-workbench] 同步团队技能 ${skill.name} 失败：${reason instanceof Error ? reason.message : String(reason)}`)
        }
      }
    })
  } catch (reason) {
    ctx.logger?.warn?.(`[dsh-workbench] 团队技能同步失败：${reason instanceof Error ? reason.message : String(reason)}`)
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function commandRequirementRef(local, actorId, agent, explicit) {
  const value = String(explicit ?? '').trim()
  if (value !== '') return value
  const dshSessionId = agent?.session?.id
  if (typeof dshSessionId !== 'string' || dshSessionId === '') {
    throw httpError(400, '请在已绑定需求的会话里调用，或给出需求编号')
  }
  const recordId = findMappedRecord(local, actorId, dshSessionId)
  if (recordId === null) {
    throw httpError(400, '当前会话还没有绑定需求，请给出需求编号')
  }
  const data = await serverAs(actorId, `/requirements/by-session/${encodeURIComponent(recordId)}`)
  if (!data.requirement) {
    throw httpError(404, '当前会话关联的需求不存在')
  }
  return data.requirement.id
}

function registerCommands(ctx, local) {
  ctx.inject(['commands'], (sub) => {
    sub.commands.register({
      name: 'wb-submit',
      description: '提交需求（与 /req-submit 技能走同一服务端逻辑）',
      input: { hint: '[需求编号]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const ref = await commandRequirementRef(local, actorId, agent, rawInput)
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/submit`, 'POST', {})
          return { kind: 'success', text: `已提交 ${result.requirement.code}「${result.requirement.title}」，当前状态：${statusLabel(result.requirement.status)}。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-claim',
      description: '认领设计（与 /design-claim 技能走同一服务端逻辑）',
      input: { hint: '[需求编号]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const ref = await commandRequirementRef(local, actorId, agent, rawInput)
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/design-claim`, 'POST', {})
          return { kind: 'success', text: `已认领 ${result.requirement.code} 的设计。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-deliver',
      description: '交付设计（与 /design-deliver 技能走同一服务端逻辑）',
      input: { hint: '[需求编号]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const ref = await commandRequirementRef(local, actorId, agent, rawInput)
          const state = await stateFor(actorId)
          const requirement = state.requirements.find(item => item.code.toLowerCase() === ref.toLowerCase() || item.id === ref)
          if (!requirement) return { kind: 'error', text: `找不到需求「${ref}」` }
          const folder = requirementFolder(local, actorId, state, requirement)
          const files = listDesignFiles(folder, baseDirFor(local, actorId)).map(file => file.relativePath)
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(requirement.id)}/design-deliver`, 'POST', { files })
          return { kind: 'success', text: `已交付 ${result.requirement.code} 的设计（d${result.requirement.designVersions.length}）。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-review',
      description: '评审需求，通过/退回（与 /req-review 技能走同一服务端逻辑）',
      input: { hint: '[需求编号] approve|reject [评审意见]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
          let explicit = ''
          if (parts.length > 0 && !['approve', 'reject', '通过', '退回'].includes(parts[0])) explicit = parts.shift()
          const ref = await commandRequirementRef(local, actorId, agent, explicit)
          const decisionText = parts.shift() ?? ''
          const decision = ['approve', '通过'].includes(decisionText)
            ? 'approve'
            : ['reject', '退回'].includes(decisionText)
              ? 'reject'
              : ''
          if (decision === '') return { kind: 'error', text: '请给出评审结论：approve（通过）或 reject（退回）' }
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/review`, 'POST', {
            decision,
            comment: parts.join(' '),
          })
          return { kind: 'success', text: `已${result.review.decision === 'approved' ? '通过' : '退回'} ${result.requirement.code}，当前状态：${statusLabel(result.requirement.status)}。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-schedule',
      description: '排期（与 /req-schedule 技能走同一服务端逻辑）',
      input: { hint: '[需求编号] 开始日期 结束日期' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
          let explicit = ''
          if (parts.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) explicit = parts.shift()
          const ref = await commandRequirementRef(local, actorId, agent, explicit)
          const startDate = parts.shift() ?? ''
          const endDate = parts.shift() ?? ''
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/schedule`, 'POST', { startDate, endDate })
          return { kind: 'success', text: `已排期 ${result.requirement.code}：${result.requirement.plannedStartDate ?? '待定'} ~ ${result.requirement.plannedEndDate ?? '待定'}。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-scope',
      description: '调整需求本期范围（与 /req-scope 技能走同一服务端逻辑）',
      input: { hint: '[需求编号] in|out [原因]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
          let explicit = ''
          if (parts.length > 0 && !['in', 'out', '纳入', '移出'].includes(parts[0])) explicit = parts.shift()
          const ref = await commandRequirementRef(local, actorId, agent, explicit)
          const scopeText = parts.shift() ?? ''
          const inScope = ['in', '纳入'].includes(scopeText)
            ? true
            : ['out', '移出'].includes(scopeText)
              ? false
              : null
          if (inScope === null) return { kind: 'error', text: '请给出范围：in（纳入）或 out（移出）' }
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/scope`, 'POST', {
            inScope,
            reason: parts.join(' '),
          })
          return { kind: 'success', text: `已把 ${result.requirement.code} ${result.requirement.inScope ? '纳入本期范围' : '移出本期范围（暂缓）'}。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-dev',
      description: '开发操作：assign|claim|start|finish|reopen 平台 [开发用户]',
      input: { hint: 'assign|claim|start|finish|reopen 平台 [开发用户]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
          const action = parts.shift() ?? ''
          const platformId = parts.shift() ?? ''
          if (!['assign', 'claim', 'start', 'finish', 'reopen'].includes(action) || platformId === '') {
            return { kind: 'error', text: '用法：/wb-dev assign|claim|start|finish|reopen 平台 [开发用户]' }
          }
          let body = { platformId }
          if (action === 'assign') body = { platformId, assigneeId: parts.shift() ?? '' }
          if (action === 'finish') body = { platformId, note: parts.join(' ') }
          const ref = await commandRequirementRef(local, actorId, agent, '')
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/dev-${action}`, 'POST', body)
          return { kind: 'success', text: `已对 ${result.requirement.code} 的 ${platformId} 执行 ${action}，需求状态 ${statusLabel(result.requirement.status)}。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-test',
      description: '测试操作：start|pass|fail [说明]',
      input: { hint: 'start|pass|fail [说明]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
          const action = parts.shift() ?? ''
          if (!['start', 'pass', 'fail'].includes(action)) {
            return { kind: 'error', text: '用法：/wb-test start|pass|fail [说明]' }
          }
          const ref = await commandRequirementRef(local, actorId, agent, '')
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/test-${action}`, 'POST', {
            note: parts.join(' '),
          })
          return { kind: 'success', text: `已执行测试 ${action}，${result.requirement.code} 当前状态 ${statusLabel(result.requirement.status)}。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-release',
      description: '发布操作：freeze|unfreeze|release [版本号]',
      input: { hint: 'freeze|unfreeze|release [版本号]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
          const action = parts.shift() ?? ''
          if (!['freeze', 'unfreeze', 'release'].includes(action)) {
            return { kind: 'error', text: '用法：/wb-release freeze|unfreeze|release [版本号]' }
          }
          const ref = await commandRequirementRef(local, actorId, agent, '')
          const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/${action}`, 'POST', {
            version: parts.join(' '),
          })
          return { kind: 'success', text: `已执行 ${action}，${result.requirement.code} 当前状态 ${statusLabel(result.requirement.status)}。` }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-iteration',
      description: '查看当前或指定迭代概览',
      input: { hint: '[迭代编码]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const state = await stateFor(actorId)
          const iteration = iterationFromState(state, String(rawInput || '').trim())
          if (!iteration) return { kind: 'error', text: `找不到迭代「${String(rawInput || '').trim()}」` }
          const requirements = state.requirements.filter(item => item.iterationId === iteration.id)
          const inScope = requirements.filter(item => item.inScope).length
          const pending = requirements.filter(item => item.status === 'pending_review').length
          return {
            kind: 'success',
            text: `迭代 ${iteration.code}「${iteration.name}」：需求 ${requirements.length} 个，本期 ${inScope} 个，待评审 ${pending} 个。\n`
              + [...requirements].sort((a, b) => a.code.localeCompare(b.code))
                .map(item => `- ${requirementSummaryLine(state, item)}`)
                .join('\n'),
          }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })

    sub.commands.register({
      name: 'wb-status',
      description: '查看需求完整状态',
      input: { hint: '[需求编号]' },
      handler: async ({ agent, rawInput }) => {
        try {
          const actorId = actorIdFromExec(local, { agent })
          const ref = await commandRequirementRef(local, actorId, agent, rawInput)
          const state = await stateFor(actorId)
          const requirement = state.requirements.find(item => item.code.toLowerCase() === ref.toLowerCase() || item.id === ref)
          if (!requirement) return { kind: 'error', text: `找不到需求「${ref}」` }
          return {
            kind: 'success',
            text: `${requirementSummaryLine(state, requirement)}。\n`
              + `需求 v${requirement.versions.length}，设计 d${requirement.designVersions.length}，`
              + `开发 ${requirement.devTasks.filter(task => task.status === 'done').length}/${requirement.devTasks.length}，`
              + `会话 ${requirement.sessions.length} 个。`,
          }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })
  })
}

// ---------------------------------------------------------------------------
// Design Studio
// ---------------------------------------------------------------------------

function mountDesignStudio(ctx) {
  const warn = (what, reason) => {
    const text = reason instanceof Error ? reason.message : String(reason)
    try { ctx.logger?.warn?.(`[dsh-workbench] ${what}: ${text}`) } catch { /* ignore */ }
  }
  try {
    ctx.inject(['webServer'], (sub) => {
      try {
        designStudio.apply(sub)
      } catch (reason) {
        warn('Design Studio host 启动失败', reason)
      }
    })
  } catch (reason) {
    warn('Design Studio host 启动失败', reason)
  }
  try {
    designStudioSkill.apply(ctx)
  } catch (reason) {
    warn('Design Studio 技能挂载失败', reason)
  }
  try {
    ctx.inject(['tools'], (sub) => {
      try {
        sub.tools.register({ ...designStudio.previewTool })
        sub.tools.register({
          ...designStudio.checkTool,
          execute: (args, exec) => designStudio.checkTool.execute(args, exec, ctx),
        })
        sub.tools.register({
          ...designStudio.lookTool,
          execute: (args, exec) => designStudio.lookTool.execute(args, exec, ctx),
        })
      } catch (reason) {
        warn('Design Studio 工具挂载失败', reason)
      }
    })
  } catch (reason) {
    warn('Design Studio 工具注入失败', reason)
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export function apply(ctx, config = {}) {
  if (config?.baseDir && String(config.baseDir).trim() !== '') {
    baseDirOverride = path.resolve(String(config.baseDir))
  }
  const local = loadLocal()
  fs.mkdirSync(defaultBaseDir(), { recursive: true })

  mountDesignStudio(ctx)

  ctx.inject(['webServer'], (sub) => {
    sub.effect(() => sub.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: makeRoute(local, sub),
    }), 'dsh-workbench: team-server BFF routes')
  })

  registerTools(ctx, local)
  registerSkills(ctx)
  registerCommands(ctx, local)
  void syncPublishedSkills(ctx)

  ctx.logger?.info?.(`[dsh-workbench] team server: ${SERVER_URL}`)
  ctx.logger?.info?.(`[dsh-workbench] local state: ${localFile()}`)
  ctx.logger?.info?.(`[dsh-workbench] requirement folders: ${defaultBaseDir()}`)
}

// 仅供 tests/host-bff.mjs 使用的内部入口；不属于插件公开 API。
export const __test = { makeRoute, loadLocal, localFile, defaultBaseDir }
