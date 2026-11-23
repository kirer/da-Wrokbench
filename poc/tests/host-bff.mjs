#!/usr/bin/env node
// DSH host BFF 回归测试：同源 Cookie、身份转发、本地文件夹校验、代理白名单。
// 依赖已构建的 server/target/debug/dsh-workbench-server；会启动临时 Rust 服务端。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BIN = process.env.BIN ?? path.join(ROOT, 'server', 'target', 'debug', 'dsh-workbench-server')
const PORT = Number(process.env.HOST_TEST_PORT ?? 3213)
const BASE = `http://127.0.0.1:${PORT}`
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-workbench-bff-'))
const DB = path.join(TMP, 'workbench.db')
const DSH_HOME = path.join(TMP, 'dsh')
const WORKBENCH_BASE = path.join(TMP, 'workbench')
const LOG = path.join(TMP, 'server.log')

let pass = 0
let fail = 0
let serverChild = null
let bff = null

function ok(label) {
  pass += 1
  console.log(`  ✓ ${label}`)
}

function bad(label, detail = '') {
  fail += 1
  console.error(`  ✗ ${label}${detail ? `：${detail}` : ''}`)
}

function check(label, condition, detail = '') {
  if (condition) ok(label)
  else bad(label, detail)
}

function jsonFetch(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, bff.base)
    const body = options.body === undefined ? null : JSON.stringify(options.body)
    const headers = { ...(options.headers ?? {}) }
    if (body !== null) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = Buffer.byteLength(body)
    }
    if (options.cookie) headers.cookie = options.cookie
    const req = http.request({
      host: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method ?? 'GET',
      headers,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let data = null
        try { data = JSON.parse(text) } catch { data = null }
        const rawCookies = res.headers['set-cookie'] ?? []
        const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies]
        const auth = cookies.find((item) => item.startsWith('dsh-workbench-auth='))
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          text,
          cookie: auth ? auth.split(';')[0] : null,
          setCookie: auth ?? '',
        })
      })
    })
    req.on('error', reject)
    if (body !== null) req.write(body)
    req.end()
  })
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`临时服务端未就绪，日志：${fs.readFileSync(LOG, 'utf8')}`)
}

async function stopServer() {
  if (serverChild === null) return
  serverChild.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000)
    serverChild.once('exit', () => { clearTimeout(timer); resolve() })
  })
  serverChild = null
}

try {
  fs.mkdirSync(WORKBENCH_BASE, { recursive: true })
  const logFd = fs.openSync(LOG, 'w')
  serverChild = spawn(BIN, [], {
    env: {
      ...process.env,
      APP_ENV: 'development',
      PORT: String(PORT),
      DATABASE_PATH: DB,
      WORKBENCH_BIND_ADDR: '127.0.0.1',
    },
    stdio: ['ignore', logFd, logFd],
  })
  await waitForServer()

  process.env.DSH_HOME = DSH_HOME
  process.env.DSH_WORKBENCH_BASE = WORKBENCH_BASE
  process.env.WORKBENCH_SERVER_URL = BASE
  process.env.WORKBENCH_INTERNAL_TOKEN = 'dsh-workbench-poc-internal-token'

  const mod = await import('../index.js')
  const local = mod.__test.loadLocal()
  const handler = mod.__test.makeRoute(local)
  const server = http.createServer((req, res) => { handler(req, res) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  bff = { server, base: `http://127.0.0.1:${server.address().port}` }

  console.log('== 健康与公开接口 ==')
  const health = await jsonFetch('/dsh-workbench/api/health')
  check('健康检查返回 200', health.status === 200, `HTTP ${health.status}`)
  check('健康检查不泄漏本机路径与密钥', !/localFile|baseDir|internalToken/i.test(health.text), health.text)

  const config = await jsonFetch('/dsh-workbench/api/auth/config')
  check('mock 登录配置可读取', config.status === 200 && config.data?.provider === 'mock')
  check('公开配置不含服务端密钥', !/secret|token/i.test(JSON.stringify(config.data ?? {})), JSON.stringify(config.data))

  console.log('== 登录与 Cookie ==')
  const anonymous = await jsonFetch('/dsh-workbench/api/state')
  check('未登录访问 state 返回 401', anonymous.status === 401, `HTTP ${anonymous.status}`)

  const browserLoginHeaders = { origin: bff.base, 'sec-fetch-site': 'same-origin' }
  const lisiLogin = await jsonFetch('/dsh-workbench/api/auth/mock', { method: 'POST', headers: browserLoginHeaders, body: { userId: 'lisi' } })
  check('mock 登录成功', lisiLogin.status === 200 && lisiLogin.data?.user?.id === 'lisi', lisiLogin.text)
  check('登录 Cookie 为 HttpOnly + SameSite=Lax', /HttpOnly/.test(lisiLogin.setCookie) && /SameSite=Lax/.test(lisiLogin.setCookie), lisiLogin.setCookie)
  check('浏览器登录响应不回传 JWT', lisiLogin.data?.token === undefined, lisiLogin.text)
  const desktopLogin = await jsonFetch('/dsh-workbench/api/auth/mock', { method: 'POST', body: { userId: 'lisi' } })
  check('桌面端登录响应带回 JWT', typeof desktopLogin.data?.token === 'string' && desktopLogin.data.token !== '', desktopLogin.text)
  const lisiCookie = lisiLogin.cookie

  const lisiState = await jsonFetch('/dsh-workbench/api/state', { cookie: lisiCookie })
  check('登录后 state 返回 200', lisiState.status === 200, `HTTP ${lisiState.status}`)
  check('state 使用本机顶级文件夹', lisiState.data?.baseDir === WORKBENCH_BASE, lisiState.data?.baseDir)
  const requirements = lisiState.data?.requirements ?? []
  check('需求带本机目录', requirements.length > 0 && requirements.every((item) => String(item.folderPath).startsWith(WORKBENCH_BASE)))

  console.log('== 会话认领与防串号 ==')
  const sessionId = `bff-test-${Date.now()}`
  const claim = await jsonFetch('/dsh-workbench/api/sessions/claim', {
    method: 'POST', cookie: lisiCookie, body: { sessionId }, headers: { origin: bff.base },
  })
  check('本人可认领 DSH 会话', claim.status === 200, claim.text)
  const localAfter = JSON.parse(fs.readFileSync(mod.__test.localFile(), 'utf8'))
  check('认领会话写入本机会话映射', localAfter.users?.lisi?.sessionUsers?.[sessionId] === 'lisi')
  check('local.json 权限为 600', (fs.statSync(mod.__test.localFile()).mode & 0o777) === 0o600)

  const zhangsanLogin = await jsonFetch('/dsh-workbench/api/auth/mock', { method: 'POST', headers: browserLoginHeaders, body: { userId: 'zhangsan' } })
  const leadCreate = await jsonFetch('/dsh-workbench/api/requirements', {
    method: 'POST', cookie: zhangsanLogin.cookie, headers: browserLoginHeaders, body: { title: '负责人不应能建需求' },
  })
  check('负责人不能新建需求', leadCreate.status === 403, `HTTP ${leadCreate.status}`)
  const productCreate = await jsonFetch('/dsh-workbench/api/requirements', {
    method: 'POST', cookie: lisiCookie, headers: browserLoginHeaders, body: { title: '产品可以新建需求' },
  })
  check('产品可以新建需求', productCreate.status === 201, `HTTP ${productCreate.status}`)
  const productState = await jsonFetch('/dsh-workbench/api/state', { cookie: lisiCookie })
  const createdRequirement = (productState.data?.requirements ?? []).find(item => item.title === '产品可以新建需求')
  check(
    '需求目录按名称命名，不带编号',
    String(createdRequirement?.folderPath ?? '').endsWith('/产品可以新建需求'),
    createdRequirement?.folderPath ?? '',
  )
  const sessionRoot = path.join(WORKBENCH_BASE, 'ITER-TEST')
  const artifactDir = path.join(sessionRoot, '资料目录')
  fs.mkdirSync(sessionRoot, { recursive: true })
  const sessionRecord = await jsonFetch(`/dsh-workbench/api/requirements/${encodeURIComponent(createdRequirement.id)}/sessions`, {
    method: 'POST',
    cookie: lisiCookie,
    headers: browserLoginHeaders,
    body: {
      type: 'requirement',
      label: '需求会话',
      dshSessionId: 'bff-dsh-session',
      workspaceId: 'bff-workspace',
      folderPath: sessionRoot,
      requirementFolder: artifactDir,
    },
  })
  check(
    '会话可挂在迭代目录、资料目录单独记录',
    sessionRecord.status === 200
      && sessionRecord.data?.requirement?.folderPath === artifactDir
      && (sessionRecord.data?.requirement?.sessions ?? []).some(item => item.folderPath === sessionRoot),
    sessionRecord.text,
  )
  const crossClaim = await jsonFetch('/dsh-workbench/api/sessions/claim', {
    method: 'POST', cookie: zhangsanLogin.cookie, body: { sessionId }, headers: { origin: bff.base },
  })
  check('其他账号不能认领已归属会话', crossClaim.status === 403, `HTTP ${crossClaim.status}`)
  const tooLong = await jsonFetch('/dsh-workbench/api/sessions/claim', {
    method: 'POST', cookie: lisiCookie, body: { sessionId: 'x'.repeat(201) }, headers: { origin: bff.base },
  })
  check('超长会话 ID 被拒绝', tooLong.status === 400, `HTTP ${tooLong.status}`)

  console.log('== 会话开场白 ==')
  const greetAnonymous = await jsonFetch('/dsh-workbench/api/session-greeting', {
    method: 'POST', body: { sessionId },
  })
  check('未登录不能写入开场白', greetAnonymous.status === 401, `HTTP ${greetAnonymous.status}`)
  const greetUnmapped = await jsonFetch('/dsh-workbench/api/session-greeting', {
    method: 'POST', cookie: lisiCookie, body: { sessionId: `unmapped-${Date.now()}` }, headers: { origin: bff.base },
  })
  check('未归属当前账号的会话不写开场白', greetUnmapped.status === 403, `HTTP ${greetUnmapped.status}`)
  const greetOffline = await jsonFetch('/dsh-workbench/api/session-greeting', {
    method: 'POST', cookie: lisiCookie, body: { sessionId: 'bff-dsh-session' }, headers: { origin: bff.base },
  })
  check('会话没在 DSH 里打开时不写开场白', greetOffline.status === 409, `HTTP ${greetOffline.status}`)

  console.log('== CSRF 与代理边界 ==')
  const forged = await jsonFetch('/dsh-workbench/api/sessions/claim', {
    method: 'POST', cookie: lisiCookie, body: { sessionId: 'bff-forged' }, headers: { origin: 'http://evil.example' },
  })
  check('跨站写请求被拒绝', forged.status === 403, `HTTP ${forged.status}`)
  const crossSite = await jsonFetch('/dsh-workbench/api/sessions/claim', {
    method: 'POST', cookie: lisiCookie, body: { sessionId: 'bff-cross-site' }, headers: { 'sec-fetch-site': 'cross-site' },
  })
  check('Sec-Fetch-Site 跨站写请求被拒绝', crossSite.status === 403, `HTTP ${crossSite.status}`)
  const webhook = await jsonFetch('/dsh-workbench/api/webhooks/gitlab', { cookie: lisiCookie })
  check('浏览器代理禁止访问 webhooks', webhook.status === 403, `HTTP ${webhook.status}`)
  const put = await jsonFetch('/dsh-workbench/api/state', { method: 'PUT', cookie: lisiCookie, body: {} })
  check('代理只允许 GET/HEAD/POST', put.status === 405, `HTTP ${put.status}`)

  console.log('== 预览票据 ==')
  const ticketAnonymous = await jsonFetch('/dsh-workbench/api/preview-ticket', {
    method: 'POST', body: { requirementId: 'req-x' },
  })
  check('未登录不能换预览票据', ticketAnonymous.status === 401, `HTTP ${ticketAnonymous.status}`)
  const ticketBad = await jsonFetch('/dsh-workbench/api/preview-ticket', {
    method: 'POST', cookie: lisiCookie, body: {}, headers: { origin: bff.base },
  })
  check('缺少需求 ID 时拒绝换票', ticketBad.status === 400, `HTTP ${ticketBad.status}`)
  const ticketOk = await jsonFetch('/dsh-workbench/api/preview-ticket', {
    method: 'POST', cookie: lisiCookie, body: { requirementId: createdRequirement.id }, headers: { origin: bff.base },
  })
  const ticket = ticketOk.data?.tickets?.[createdRequirement.id]
  check('登录后可按需求换预览票据', ticketOk.status === 200 && typeof ticket === 'string' && ticket.length > 20, ticketOk.text)
  const forgedPreview = await jsonFetch(`/dsh-workbench/api/design-preview?requirementId=${encodeURIComponent(createdRequirement.id)}&path=prototype%2Fx.html&ticket=forged`)
  check('伪造票据读不了预览', forgedPreview.status === 401, `HTTP ${forgedPreview.status}`)
  const crossPreview = await jsonFetch(`/dsh-workbench/api/design-preview?requirementId=req-other&path=prototype%2Fx.html&ticket=${encodeURIComponent(String(ticket))}`)
  check('票据不能读别的需求', crossPreview.status === 403, `HTTP ${crossPreview.status}`)

  console.log('== 空白画布 ==')
  const blankAnonymous = await jsonFetch('/dsh-workbench/api/design/blank-canvas', {
    method: 'POST', body: { requirementId: createdRequirement.id },
  })
  check('未登录不能创建空白画布', blankAnonymous.status === 401, `HTTP ${blankAnonymous.status}`)
  const blankBad = await jsonFetch('/dsh-workbench/api/design/blank-canvas', {
    method: 'POST', cookie: lisiCookie, body: {}, headers: { origin: bff.base },
  })
  check('缺少需求 ID 时拒绝创建空白画布', blankBad.status === 400, `HTTP ${blankBad.status}`)
  const blank = await jsonFetch('/dsh-workbench/api/design/blank-canvas', {
    method: 'POST', cookie: lisiCookie, body: { requirementId: createdRequirement.id }, headers: { origin: bff.base },
  })
  check(
    '登录后按需求创建空白画布',
    blank.status === 200 && path.basename(String(blank.data?.path ?? '')) === '_canvas.html' && fs.existsSync(String(blank.data?.path ?? '')),
    blank.text,
  )
  const blueprint = await jsonFetch('/dsh-workbench/api/design/blank-canvas', {
    method: 'POST', cookie: lisiCookie, body: { requirementId: createdRequirement.id, kind: 'design' }, headers: { origin: bff.base },
  })
  const blueprintPath = String(blueprint.data?.path ?? '')
  check(
    '设计会话也能创建空白画布，落在 design/',
    blueprint.status === 200 && path.basename(blueprintPath) === '_canvas.html' && path.basename(path.dirname(blueprintPath)) === 'design',
    blueprint.text,
  )
  const blankState = await jsonFetch('/dsh-workbench/api/state', { cookie: lisiCookie })
  const blankRequirement = (blankState.data?.requirements ?? []).find(item => item.id === createdRequirement.id)
  check('空白画布不计入原型页面', (blankRequirement?.prototypeFiles ?? []).length === 0, JSON.stringify(blankRequirement?.prototypeFiles))
  check('空白画布不计入设计稿', (blankRequirement?.designFiles ?? []).length === 0, JSON.stringify(blankRequirement?.designFiles))

  console.log('== 本地文件夹边界 ==')
  const outside = await jsonFetch('/dsh-workbench/api/folders/ensure', {
    method: 'POST', cookie: lisiCookie, body: { parent: os.tmpdir(), name: 'escape' }, headers: { origin: bff.base },
  })
  check('禁止在顶级文件夹外建需求目录', outside.status === 403, `HTTP ${outside.status}`)
  const iterationDir = path.join(WORKBENCH_BASE, 'ITER-TEST')
  fs.mkdirSync(iterationDir, { recursive: true })
  const traversal = await jsonFetch('/dsh-workbench/api/folders/ensure', {
    method: 'POST', cookie: lisiCookie, body: { parent: iterationDir, name: '../escape' }, headers: { origin: bff.base },
  })
  const realBase = fs.realpathSync(WORKBENCH_BASE)
  const traversalPath = String(traversal.data?.path ?? '')
  check(
    '目录名穿越被消解在工作台内',
    traversal.status === 200 && (traversalPath.startsWith(WORKBENCH_BASE) || traversalPath.startsWith(realBase)),
    traversal.text,
  )
  const topLevel = await jsonFetch('/dsh-workbench/api/folders/ensure', {
    method: 'POST', cookie: lisiCookie, body: { parent: WORKBENCH_BASE, name: 'ITER-TOP' }, headers: { origin: bff.base },
  })
  check(
    '允许在顶级文件夹下建迭代目录',
    topLevel.status === 200 && path.basename(String(topLevel.data?.path ?? '')) === 'ITER-TOP',
    topLevel.text,
  )
  const sameName1 = await jsonFetch('/dsh-workbench/api/folders/ensure', {
    method: 'POST', cookie: lisiCookie, body: { parent: iterationDir, name: '同名需求', unique: true }, headers: { origin: bff.base },
  })
  const sameName2 = await jsonFetch('/dsh-workbench/api/folders/ensure', {
    method: 'POST', cookie: lisiCookie, body: { parent: iterationDir, name: '同名需求', unique: true }, headers: { origin: bff.base },
  })
  check(
    '同名需求目录自动加序号',
    sameName1.status === 200 && sameName2.status === 200
      && path.basename(String(sameName1.data?.path ?? '')) === '同名需求'
      && path.basename(String(sameName2.data?.path ?? '')) === '同名需求 (2)',
    `${sameName1.text} ${sameName2.text}`,
  )
  const rootFolder = await jsonFetch('/dsh-workbench/api/onboarding/complete', {
    method: 'POST', cookie: lisiCookie, body: { topLevelFolder: '/', platformIds: [], activeRole: null }, headers: { origin: bff.base },
  })
  check('禁止把文件系统根目录设为顶级文件夹', rootFolder.status === 403, `HTTP ${rootFolder.status}`)

  console.log()
  if (fail !== 0) {
    console.error(`失败 ${fail} 项，通过 ${pass} 项`)
    process.exitCode = 1
  } else {
    console.log(`全部通过（${pass} 项）`)
  }
} finally {
  if (bff !== null) await new Promise((resolve) => bff.server.close(resolve))
  await stopServer()
  fs.rmSync(TMP, { recursive: true, force: true })
}
