export const API_PREFIX = '/dsh-workbench/api'

// 同一台机器上跑多个 DSH 实例（例如多角色仿真容器）时，浏览器 Cookie
// 不区分端口；给每个实例一个后缀，避免在一个端口登录后串到其他实例。
export function authCookieSuffix() {
  const raw = String(process.env.WORKBENCH_COOKIE_SUFFIX || '').trim().toLowerCase()
  if (raw === '') return ''
  const safe = raw.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  return safe === '' ? '' : `-${safe}`
}

export const AUTH_COOKIE = `dsh-workbench-auth${authCookieSuffix()}`

export const AUTH_STATE_COOKIE = `dsh-workbench-oauth-state${authCookieSuffix()}`

export const SERVER_URL = String(process.env.WORKBENCH_SERVER_URL || 'http://127.0.0.1:3210').replace(/\/+$/, '')

export const INTERNAL_TOKEN = String(process.env.WORKBENCH_INTERNAL_TOKEN || 'dsh-workbench-poc-internal-token')

// 与 Rust 服务端保持一致：只有 development/dev/test 算开发环境，其他值
// （包括 production、staging、拼写错误）都按生产处理，避免绕过默认密钥检查。
export const APP_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase()

export const IS_PRODUCTION = !['development', 'dev', 'test'].includes(APP_ENV)

export const ALLOW_REMOTE_BFF = envFlag(process.env.WORKBENCH_ALLOW_REMOTE_BFF)

export const LOCAL_VERSION = 1

if (IS_PRODUCTION && INTERNAL_TOKEN === 'dsh-workbench-poc-internal-token') {
  throw new Error('生产环境必须设置 WORKBENCH_INTERNAL_TOKEN，并与 Rust 服务端保持一致')
}

export function envFlag(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}
