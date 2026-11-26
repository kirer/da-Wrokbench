import fs from 'node:fs'
import crypto from 'node:crypto'
import { AUTH_COOKIE, IS_PRODUCTION } from './config.js'
import { httpError, escapeHtml } from './util.js'
import { defaultBaseDir, saveLocal, localUser, baseDirFor } from './local.js'
import { serverRaw } from './server.js'

// ---------------------------------------------------------------------------
// HTTP helpers / auth cookies
// ---------------------------------------------------------------------------

// 预览票据：内存里的一张短期票，绑定 用户 + 需求 + 当时的登录 token。
// 只用来让沙箱 iframe 读 design-preview，不落盘、不写日志，过期即失效。
export const PREVIEW_TICKET_TTL_MS = 120 * 1000

export const PREVIEW_TICKET_MAX = 200

export const previewTickets = new Map()

export function sweepPreviewTickets(now) {
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

export function mintPreviewTicket(userId, requirementId, token) {
  const now = Date.now()
  sweepPreviewTickets(now)
  const ticket = crypto.randomBytes(24).toString('base64url')
  previewTickets.set(ticket, { userId, requirementId, token, expiresAt: now + PREVIEW_TICKET_TTL_MS })
  return ticket
}

export function verifyPreviewTicket(ticket) {
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

export function parseCookies(req) {
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

export function serializeCookie(name, value, maxAge) {
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

export function appendCookie(res, cookie) {
  const current = res.getHeader('set-cookie')
  if (current === undefined) res.setHeader('set-cookie', [cookie])
  else if (Array.isArray(current)) res.setHeader('set-cookie', [...current, cookie])
  else res.setHeader('set-cookie', [String(current), cookie])
}

export function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(payload))
  res.end(payload)
}

export const MAX_JSON_BYTES = 8 * 1024 * 1024

export function readJson(req) {
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

export const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function trustedHostname(rawHost) {
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

export function requestOrigin(req) {
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

export function redirect(res, location) {
  res.statusCode = 302
  res.setHeader('location', location)
  res.end()
}

export function htmlPage(res, status, title, detail) {
  const safeTitle = escapeHtml(title)
  const payload = `<!doctype html><meta charset="utf-8"><title>${safeTitle}</title><body style="font-family:system-ui;padding:40px;max-width:680px"><h1>${safeTitle}</h1><p>${escapeHtml(detail)}</p></body>`
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(payload)
}

// 浏览器写请求必须是同源。SameSite=Lax 已经挡住大部分 CSRF；这里再加一层
// Origin / Sec-Fetch-Site 校验，避免反向代理或旧浏览器上的边界情况。
export function assertSameOrigin(req) {
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
  // Origin: "null" 不只来自桌面端，沙箱 iframe、file:// 页面也会发它。只有
  // 同时没有 Referer 和 Sec-Fetch-* 时才按桌面端放行（桌面壳转发时会剥掉这些头）。
  if (origin === 'null' && (!isDesktopClient(req) || req.headers['sec-fetch-site'] !== undefined)) {
    throw httpError(403, '跨站写请求已被拒绝')
  }
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== '' && site !== 'same-origin' && site !== 'none') {
    throw httpError(403, '跨站写请求已被拒绝')
  }
}

export function safeReturnTo(req, raw) {
  const origin = requestOrigin(req)
  try {
    const candidate = new URL(typeof raw === 'string' && raw !== '' ? raw : '/', origin)
    if (candidate.origin !== origin) return '/'
    return `${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return '/'
  }
}

export function tokenFromRequest(req) {
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
export const AUTH_SESSION_CACHE_MS = 5_000

export const AUTH_SESSION_CACHE_MAX = 200

export const authSessionCache = new Map()

export function invalidateAuthSessionsForUser(targetUserId) {
  if (!targetUserId) {
    authSessionCache.clear()
    return
  }
  for (const [cachedToken, entry] of authSessionCache.entries()) {
    if (entry?.payload?.user?.id === targetUserId) {
      authSessionCache.delete(cachedToken)
    }
  }
}

export function isBinaryBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return false
  const sampleLen = Math.min(buf.length, 8192)
  let suspicious = 0
  for (let i = 0; i < sampleLen; i += 1) {
    const b = buf[i]
    if (b === 0) return true
    if (b < 7 || (b > 14 && b < 32 && b !== 27)) suspicious += 1
  }
  return suspicious / sampleLen > 0.15
}

export async function sessionFromRequest(req, local) {
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

export function isLoopbackRequest(req) {
  const raw = req.socket?.remoteAddress
  // 取不到地址时必须按「非本机」处理：以前 fail-open，Unix socket 或某些代理
  // 场景下会把远端当成 127.0.0.1，直接放开全部本机路径接口。
  if (typeof raw !== 'string' || raw === '') return false
  const address = raw.replace(/^::ffff:/i, '').toLowerCase()
  return address === '127.0.0.1' || address === '::1'
}

// 登录相关页面可以由反向代理从远端访问；其余接口会读写本机路径、DSH 会话映射
// 和预览票据，只允许本机回环。容器/局域网场景需显式设置 WORKBENCH_ALLOW_REMOTE_BFF=1。
export function remoteAllowedRoute(route) {
  return route === '/health'
    || route === '/auth/config'
    || route === '/auth/session'
    || route === '/auth/logout'
    || route.startsWith('/auth/dingtalk/')
}

export function isDesktopClient(req) {
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

export function issueAuthCookie(req, res, payload) {
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
