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

  const lisiLogin = await jsonFetch('/dsh-workbench/api/auth/mock', { method: 'POST', body: { userId: 'lisi' } })
  check('mock 登录成功', lisiLogin.status === 200 && lisiLogin.data?.user?.id === 'lisi', lisiLogin.text)
  check('登录 Cookie 为 HttpOnly + SameSite=Lax', /HttpOnly/.test(lisiLogin.setCookie) && /SameSite=Lax/.test(lisiLogin.setCookie), lisiLogin.setCookie)
  check('登录响应不回传 JWT', lisiLogin.data?.token === undefined, lisiLogin.text)
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

  const zhangsanLogin = await jsonFetch('/dsh-workbench/api/auth/mock', { method: 'POST', body: { userId: 'zhangsan' } })
  const crossClaim = await jsonFetch('/dsh-workbench/api/sessions/claim', {
    method: 'POST', cookie: zhangsanLogin.cookie, body: { sessionId }, headers: { origin: bff.base },
  })
  check('其他账号不能认领已归属会话', crossClaim.status === 403, `HTTP ${crossClaim.status}`)
  const tooLong = await jsonFetch('/dsh-workbench/api/sessions/claim', {
    method: 'POST', cookie: lisiCookie, body: { sessionId: 'x'.repeat(201) }, headers: { origin: bff.base },
  })
  check('超长会话 ID 被拒绝', tooLong.status === 400, `HTTP ${tooLong.status}`)

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
