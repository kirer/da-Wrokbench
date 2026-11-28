import { SERVER_URL, INTERNAL_TOKEN } from './config.js'
import { httpError } from './util.js'
import { defaultBaseDir } from './local.js'

// ---------------------------------------------------------------------------
// Team server client
// ---------------------------------------------------------------------------

// /state 是全量数据，浏览器里两个 store（3 秒、2.5 秒）加上每次 /requirement 都会取它。
// 缓存 2 秒把同一时刻的并发请求合并成一次上游调用；任何写操作成功后立即作废。
export const STATE_CACHE_MS = 2000

// 缓存上限：单进程 BFF 长期运行，任何按 token/用户增长的 Map 都必须有上界，
// 否则多账号/多需求场景会持续占内存。超过上限时丢弃最旧的键（Map 保持插入序）。
export function capMap(map, max) {
  while (map.size > max) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }
}

export const STATE_CACHE_MAX = 500
export const LAST_SYNC_MAX = 2000
export const PREVIEW_ASSET_CACHE_MAX = 500

export const stateCache = new Map()

// 原型 / 测试报告的本机同步要扫目录，按用户最多每 10 秒跑一次。
export const SYNC_INTERVAL_MS = 10_000

export const lastSyncAt = new Map()

export function invalidateStateCache() {
  stateCache.clear()
}

export async function serverState(token, options = {}) {
  const cached = stateCache.get(token)
  if (!options.fresh && cached && Date.now() - cached.at < STATE_CACHE_MS) {
    return cached.data
  }
  // 带 If-None-Match 做条件请求：内容没变时服务端回 304，省掉大 JSON 的传输与序列化。
  const headers = {}
  if (!options.fresh && cached && cached.etag) headers['if-none-match'] = cached.etag
  const result = await serverRaw('/state', { token, headers })
  if (result.status === 304 && cached) {
    stateCache.set(token, { at: Date.now(), data: cached.data, etag: cached.etag })
    capMap(stateCache, STATE_CACHE_MAX)
    return cached.data
  }
  if (!result.ok) {
    throw httpError(result.status, result.data?.error || `团队服务端返回 ${result.status}`)
  }
  stateCache.set(token, { at: Date.now(), data: result.data, etag: result.etag })
  capMap(stateCache, STATE_CACHE_MAX)
  return result.data
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20000
// 按路由给更宽的超时：大附件、版本物化、Webhook 回执这类慢接口不该和普通读共用 20 秒。
const ROUTE_TIMEOUTS = [
  [/\/artifacts(?:\/|$)/, 60000],
  [/^\/versions\//, 60000],
  [/^\/webhooks\//, 30000],
  [/\/attachments(?:\/|$)/, 60000],
]
// 组合超时与调用方传入的 AbortSignal：任一触发即取消，支持上游主动取消请求。
function requestSignal(route, options) {
  let timeoutMs = Number(options.timeoutMs)
  if (!(timeoutMs > 0)) {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
    for (const [pattern, ms] of ROUTE_TIMEOUTS) {
      if (pattern.test(route)) { timeoutMs = ms; break }
    }
  }
  const timeout = AbortSignal.timeout(timeoutMs)
  if (options.signal) return AbortSignal.any([timeout, options.signal])
  return timeout
}

export async function serverRaw(route, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
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
      signal: requestSignal(route, options),
    })
  } catch (reason) {
    console.error('[dsh-workbench] upstream request failed', route, reason)
    const timeout = reason?.name === 'TimeoutError' || reason?.name === 'AbortError'
    throw httpError(timeout ? 504 : 503, timeout ? '团队服务端响应超时' : '团队服务端不可用')
  }
  // 304 Not Modified：内容未变，交给上层用缓存（不能当成跳转错误）。
  if (response.status === 304) {
    return { status: 304, ok: false, data: {}, etag: response.headers.get('etag') || '' }
  }
  if (response.status >= 300 && response.status < 400) {
    throw httpError(502, '团队服务端返回了不允许的跳转')
  }
  // 写操作成功：缓存的 /state、附件列表和“刚同步过”的标记都不再可信。
  if (method !== 'GET' && method !== 'HEAD' && response.ok) {
    invalidateStateCache()
    previewAssetCache.clear()
    lastSyncAt.clear()
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
  return { status: response.status, ok: response.ok, data, etag: response.headers.get('etag') || '' }
}

// 打开一个 SSE 流：返回原始 fetch Response，交给上层把 body 管道透传。
export async function serverStream(route, options = {}) {
  const headers = {}
  if (options.token) headers.authorization = `Bearer ${options.token}`
  const response = await fetch(`${SERVER_URL}${route}`, { headers, signal: options.signal })
  return response
}

export async function serverJson(route, options = {}) {
  const result = await serverRaw(route, options)
  if (!result.ok) {
    throw httpError(result.status, result.data?.error || `团队服务端返回 ${result.status}`)
  }
  return result.data
}

export function serverAs(actorId, route, method = 'GET', body) {
  return serverJson(route, { method, actor: actorId, body })
}

export async function authConfig() {
  const config = await serverJson('/auth/config')
  return {
    ...config,
    defaultBaseDir: defaultBaseDir(),
  }
}

// 远端（反代/容器）只用于登录，不应拿到宿主机目录。顶级文件夹和每个需求的
// folderPath 都只在本机回环请求里返回。
export function withoutLocalPaths(payload) {
  if (payload === null || typeof payload !== 'object') return payload
  const copy = { ...payload }
  delete copy.baseDir
  delete copy.defaultBaseDir
  // mock 用户名单是「所有账号 id + 姓名 + 角色」，远端可访问时等于一份账号目录；
  // 只有本机请求才需要它来渲染快速登录。
  delete copy.mock
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

export const previewAssetCache = new Map()
