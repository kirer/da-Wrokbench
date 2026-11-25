#!/usr/bin/env node
/**
 * 2026-S13 桌面端真实绘制回归（一个迭代、两个需求、原型 + 设计稿全链路）。
 *
 * 原则：脚本只做登录、建数据、发提示词、点击、读文件、截图；
 * 绝不写 prototype/ 或 design/ 里的产物。产物必须由桌面端会话里的模型生成。
 *
 * 用法：
 *   node e2e/desktop-s13.mjs --preflight          # 只检查环境、登录与基线，不改数据
 *   node e2e/desktop-s13.mjs --prepare            # 只建迭代与两个需求，停在提示词（不调用模型）
 *   node e2e/desktop-s13.mjs --verify             # 只验证已有交付（跨角色预览、作品、缩略图），不调用模型
 *   node e2e/desktop-s13.mjs --reset              # 先清空测试数据并重启服务端/桌面端，再跑全流程
 *   node e2e/desktop-s13.mjs                      # 假定数据已清空、桌面端已开 9222，直接跑
 *   node e2e/desktop-s13.mjs --allow-dirty        # 允许非种子基线（只适合排查）
 *
 * 前置：
 *   - 服务端 http://127.0.0.1:3210 正常，种子基线为 2 迭代 / 9 需求
 *   - DSH 桌面端已安装 dsh-workbench，并以 --remote-debugging-port=9222 启动
 *   - e2e/node_modules 里有 playwright
 *
 * 证据：runtime/test-evidence/2026-S13-<时间>/（截图、状态、文件清单、报告）
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const HOME = os.homedir()
const RESET_SCRIPT = path.join(REPO, 'tools', 'reset-workbench-test-data.sh')

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--reset') out.reset = true
    else if (arg === '--preflight') out.preflight = true
    else if (arg === '--prepare') out.prepare = true
    else if (arg === '--verify') out.verify = true
    else if (arg === '--no-launch') out.noLaunch = true
    else if (arg === '--allow-dirty') out.allowDirty = true
    else if (arg.startsWith('--timeout=')) out.timeout = Number(arg.slice(10))
    else if (arg.startsWith('--evidence=')) out.evidence = arg.slice(11)
    else if (arg.startsWith('--iteration=')) out.iteration = arg.slice(12)
    else if (arg.startsWith('--cdp=')) out.cdp = arg.slice(6)
    else throw new Error(`未知参数：${arg}（用 --help 查看）`)
  }
  return out
}

const cli = parseArgs(process.argv.slice(2))
if (cli.help) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''))
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
const cfg = {
  cdp: cli.cdp || process.env.CDP_URL || 'http://127.0.0.1:9222',
  server: process.env.WORKBENCH_SERVER_URL || 'http://127.0.0.1:3210',
  baseDir: process.env.WORKBENCH_BASE || path.join(HOME, 'DSH-Workbench'),
  iteration: { code: cli.iteration || '2026-S13', name: '积分体验优化' },
  turnTimeoutMs: Math.max(60, cli.timeout || Number(process.env.S13_TURN_TIMEOUT || 900)) * 1000,
  deliverTimeoutMs: 5 * 60 * 1000,
  preflightOnly: Boolean(cli.preflight),
  prepareOnly: Boolean(cli.prepare),
  verifyOnly: Boolean(cli.verify),
  allowDirty: Boolean(cli.allowDirty),
  noLaunch: Boolean(cli.noLaunch),
  evidence: cli.evidence || path.join(REPO, 'runtime', 'test-evidence', `2026-S13-${stamp}`),
}

const USERS = { 张三: 'zhangsan', 李四: 'lisi', 王五: 'wangwu' }
const ITERATION = cfg.iteration
const REQUIREMENTS = [
  {
    key: 'r1',
    code: 'S13-001',
    title: '积分明细页改版',
    platform: '前端组 · Web（1440）',
    prototypeScreens: 3,
    designScreens: 3,
    brief: [
      '背景：会员反馈积分明细看不懂，抵扣和过期时间不清晰。',
      '目标：一屏内看懂每笔积分的来源、消耗和过期时间，支持按类型筛选。',
      '页面：1) 明细列表（余额、本月获取/消耗、类型筛选、分页）；2) 筛选面板展开态；3) 无记录空态。',
      '状态：加载、空、筛选无结果、过期积分置灰并说明。',
      '验收：获取/消耗/过期可区分；筛选可多选；空态有引导；金额与时间格式统一。',
    ].join('\n'),
    flow: '积分明细列表 → 类型筛选 → 空态',
    states: '默认、加载、空、筛选无结果、过期积分置灰并说明',
    visual: '品牌蓝 #2563EB + 中性灰，信息密度中高，金额与积分用等宽数字',
  },
  {
    key: 'r2',
    code: 'S13-002',
    title: '积分兑换结果页',
    platform: '前端组 · 小程序（375）',
    prototypeScreens: 2,
    designScreens: 2,
    brief: [
      '背景：兑换失败时用户不知道为什么，客服重复咨询多。',
      '目标：兑换后明确告知结果和下一步。',
      '页面：1) 兑换成功（余额变化、预计到账、查看订单）；2) 库存不足/失败（原因、替代商品、返回）。',
      '端：微信小程序，375 宽。',
      '验收：成功与失败状态清晰；失败给可执行建议；不引用外部图片。',
    ].join('\n'),
    flow: '积分兑换成功 → 库存不足/失败',
    states: '默认、加载、成功、失败',
    visual: '小程序 375，品牌蓝 + 成功绿 / 警示橙，圆角适中，主按钮拇指可达',
  },
]

// ---------------------------------------------------------------------------
// 日志、证据、报告
// ---------------------------------------------------------------------------

fs.mkdirSync(cfg.evidence, { recursive: true })
const logFile = path.join(cfg.evidence, 'run.log')
const results = []
let stepNo = 0
let currentPage = null
const consoleErrors = []
const pageErrors = []
const authNoise = []
const warnings = []

function log(...args) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${args.join(' ')}`
  console.log(line)
  fs.appendFileSync(logFile, line + '\n')
}

function slug(name) {
  return String(name).replace(/[^\w一-龥-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(cfg.evidence, name), JSON.stringify(value, null, 2) + '\n')
}

function writeText(name, value) {
  fs.writeFileSync(path.join(cfg.evidence, name), String(value))
}

async function shot(page, name) {
  const file = path.join(cfg.evidence, `${String(stepNo).padStart(2, '0')}-${slug(name)}.png`)
  try {
    await page.screenshot({ path: file })
    return path.relative(REPO, file)
  } catch (error) {
    log('截图失败', name, error.message)
    return ''
  }
}

async function runStep(name, fn) {
  stepNo += 1
  const started = Date.now()
  log(`▶ ${stepNo}. ${name}`)
  try {
    const detail = await fn()
    const ms = Date.now() - started
    results.push({ step: stepNo, name, ok: true, ms, detail: detail ?? null })
    log(`✓ ${stepNo}. ${name}（${Math.round(ms / 1000)}s）`)
    return detail
  } catch (error) {
    const ms = Date.now() - started
    const failureShot = currentPage ? await shot(currentPage, `FAILED-${name}`) : ''
    results.push({ step: stepNo, name, ok: false, ms, error: error && error.stack ? error.stack : String(error), shot: failureShot })
    log(`✗ ${stepNo}. ${name}（${Math.round(ms / 1000)}s）：${error && error.message ? error.message : error}`)
    throw error
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ---------------------------------------------------------------------------
// 通用等待
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(fn, { label = '条件', timeout = 20000, interval = 400 } = {}) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeout) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(interval)
  }
  const suffix = lastError ? `；最后错误：${lastError.message}` : ''
  throw new Error(`等待超时：${label}（${Math.round(timeout / 1000)}s）${suffix}`)
}

// ---------------------------------------------------------------------------
// 桌面端连接与会话
// ---------------------------------------------------------------------------

async function cdpUp() {
  try {
    const res = await fetch(`${cfg.cdp}/json/version`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

function desktopAppRunning() {
  const res = spawnSync('osascript', ['-e', 'application "DeepSeek Harness" is running'], { encoding: 'utf8' })
  return res.status === 0 && res.stdout.trim() === 'true'
}

async function ensureCdp() {
  if (await cdpUp()) return
  if (cfg.noLaunch) throw new Error(`桌面端没有开放调试端口 ${cfg.cdp}（--no-launch 不允许自动启动）`)
  if (desktopAppRunning()) {
    throw new Error('桌面端已在运行但没有调试端口。请先退出桌面端，或直接加 --reset 重开。')
  }
  log('启动 DSH 桌面端（调试端口 9222）')
  spawnSync('open', ['-n', '-a', 'DeepSeek Harness', '--args', '--remote-debugging-port=9222'])
  await waitFor(cdpUp, { label: '桌面端调试端口', timeout: 45000, interval: 600 })
}

async function connect() {
  await ensureCdp()
  const browser = await chromium.connectOverCDP(cfg.cdp)
  const context = browser.contexts()[0]
  const page = await waitFor(
    () => context.pages().find((candidate) => candidate.url().startsWith('dsh-app://')),
    { label: 'DSH 应用页面', timeout: 30000 },
  )
  page.setDefaultTimeout(20000)
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'warning' && text.includes('[dsh-workbench]')) warnings.push(text)
    if (msg.type() !== 'error') return
    // 登录前 /dsh-workbench/api/* 的 401 是已知噪声，单独记录，不算回归失败
    if (text.includes('401') && /dsh-workbench\/api\/(state|requirement)/.test(text)) {
      authNoise.push(text)
      return
    }
    // Chromium 对 401 响应的控制台文案不带请求路径（Failed to load resource ... 401），
    // 同样归入登录前噪声；真断了鉴权，后续 waitState 会直接超时，不会漏判。
    if (/Failed to load resource.*401|status of 401/.test(text)) {
      authNoise.push(text)
      return
    }
    const location = msg.location()?.url || ''
    consoleErrors.push(location ? `${text} @ ${location}` : text)
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  currentPage = page
  return page
}

// ---------------------------------------------------------------------------
// 工作台 UI
// ---------------------------------------------------------------------------

const composerLocator = (page) => page.locator('[data-composer-input="true"]:visible').last()
const sendButton = (page) => page.locator('button[aria-label="发送消息"]:visible').first()

async function bodyText(page) {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ')
}

async function loginRows(page) {
  return page.locator('.user-row').count()
}

async function loginAs(page, name) {
  const row = page.locator('.user-row').filter({ hasText: name }).first()
  await row.waitFor({ state: 'visible', timeout: 20000 })
  await row.click()
  await page.getByRole('button', { name: `以「${name}」身份进入` }).click()
  await waitFor(async () => (await loginRows(page)) === 0, { label: `${name} 登录提交`, timeout: 20000 })
  const text = await bodyText(page)
  if (/首次使用接下来|选择职能与平台/.test(text) && !(await page.locator('.dsh-wb-crumbs').isVisible().catch(() => false))) {
    throw new Error('登录后出现首次引导，脚本不会自动配置身份与文件夹')
  }
  await returnToWorkbench(page)
  const state = await waitState(page, (value) => value.currentUser && value.currentUser.name === name, `${name} 当前身份`)
  assert(state.currentUser.id === USERS[name], `当前身份应为 ${name}，实际 ${state.currentUser.name}`)
  log(`已切换到 ${name}`)
}

async function panelReady(page) {
  if (await page.locator('.dsh-wb-crumbs').isVisible().catch(() => false)) return true
  if ((await loginRows(page)) > 0) return true
  return false
}

async function currentIdentity(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.dropdown-trigger')
    return (el?.innerText || '').replace(/\s+/g, ' ').trim()
  })
}

// 打开研发工作台面板。桌面端刚启动时侧边栏可能还没渲染完；
// 只点一次「研发工作台」，之后等面板出现，避免连点把面板又关掉。
async function returnToWorkbench(page) {
  if (await panelReady(page)) return
  await waitFor(async () => {
    if (await panelReady(page)) return true
    const entry = page.getByRole('button', { name: '研发工作台', exact: true }).first()
    if (await entry.isVisible().catch(() => false)) {
      await entry.click().catch(() => {})
      await page.waitForTimeout(1000)
    }
    return panelReady(page)
  }, { label: '打开研发工作台面板', timeout: 30000, interval: 900 })
}

async function goHome(page) {
  // 首页是面包屑的根节点；已经在首页时它是当前层，没有可点的按钮。
  const home = page.getByRole('button', { name: '首页', exact: true })
  if (await home.isVisible().catch(() => false)) await home.click()
  await page.waitForTimeout(350)
}

async function ensureUser(page, name) {
  await returnToWorkbench(page)
  if ((await loginRows(page)) > 0) {
    await loginAs(page, name)
    return
  }
  const identity = await currentIdentity(page)
  if (identity.includes(name)) return
  const state = await readState(page).catch(() => null)
  if (state && state.currentUser && state.currentUser.name === name) return
  log(`切换身份：${(state && state.currentUser && state.currentUser.name) || identity || '未知'} → ${name}`)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await waitFor(async () => (await loginRows(page)) > 0, { label: '登录页', timeout: 20000 })
  await loginAs(page, name)
}

async function openIteration(page, name) {
  await returnToWorkbench(page)
  await goHome(page)
  const link = page.getByRole('link', { name, exact: true }).first()
  await link.waitFor({ state: 'visible', timeout: 15000 })
  await link.click()
  // 「新建需求」只有产品/管理员看得到，不能当加载完成的标志。
  await waitFor(async () => (await bodyText(page)).includes('整体进度'), { label: `迭代 ${name} 详情` })
}

async function openRequirement(page, title) {
  const link = page.getByRole('link', { name: title, exact: true }).first()
  await link.waitFor({ state: 'visible', timeout: 15000 })
  await link.click()
  await waitFor(async () => (await bodyText(page)).includes('返回迭代'), { label: `需求 ${title} 详情` })
}

async function waitSessionPanel(page, label) {
  await waitFor(async () => {
    const text = await bodyText(page)
    return text.includes('会话面板') && text.includes('需求说明')
  }, { label, timeout: 30000 })
}

async function setComposerText(page, text) {
  const input = composerLocator(page)
  await input.waitFor({ state: 'visible', timeout: 30000 })
  await page.evaluate((value) => navigator.clipboard.writeText(value), text)
  await input.click()
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Meta+V')
  await waitFor(async () => (await input.innerText()).includes(text.split('\n')[0].slice(0, 12)), {
    label: '提示词写入输入框',
    timeout: 15000,
  })
}

async function completionCount(page) {
  return page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((button) => /已完成，用时/.test(button.innerText || '')).length)
}

async function turnRunning(page) {
  return (await page.locator('button[aria-label="停止生成"]:visible').count()) > 0
}

async function runTurn(page, { prompt = null, label, timeout = cfg.turnTimeoutMs } = {}) {
  if (prompt !== null) await setComposerText(page, prompt)
  const before = await completionCount(page)
  const send = sendButton(page)
  await send.waitFor({ state: 'visible', timeout: 20000 })
  await send.click()
  const started = Date.now()
  let lastText = ''
  await waitFor(async () => {
    const text = await bodyText(page)
    lastText = text
    const count = await completionCount(page)
    const running = await turnRunning(page)
    const canSend = await sendButton(page).isVisible().catch(() => false)
    if (!running && canSend && count > before) return true
    if (!running && canSend && count === before && /请求失败|生成失败|模型调用失败|网络错误/.test(text)) {
      throw new Error(`模型执行失败：${text.slice(-400)}`)
    }
    if (count > before && running) return false
    return false
  }, { label: `${label} 完成`, timeout, interval: 1000 })
  const ms = Date.now() - started
  await page.waitForTimeout(1500)
  log(`  ${label} 用时 ${Math.round(ms / 1000)}s`)
  return { ms, textTail: lastText.slice(-2000) }
}

async function sessionTranscript(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('.tnXGgG_scroll')
    const main = document.querySelector('main')
    return (scroll?.innerText || main?.innerText || document.body.innerText || '').slice(-12000)
  })
}

// ---------------------------------------------------------------------------
// 服务端状态 / 作品
// ---------------------------------------------------------------------------

async function readState(page) {
  return page.evaluate(async () => {
    const token = window.localStorage.getItem('dshWorkbenchAuthToken') || ''
    const res = await fetch('/dsh-workbench/api/state', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`state HTTP ${res.status}`)
    return res.json()
  })
}

async function waitState(page, predicate, label, timeout = 25000) {
  return waitFor(async () => {
    const state = await readState(page)
    return predicate(state) ? state : null
  }, { label, timeout, interval: 800 })
}

function findRequirement(state, code) {
  return (state.requirements || []).find((item) => item.code === code)
}

async function readWorks(page) {
  return page.evaluate(async () => {
    const res = await fetch('/dsh-workbench/canvas/works')
    if (!res.ok) throw new Error(`works HTTP ${res.status}`)
    return res.json()
  })
}

async function thumbStatus(page, id) {
  return page.evaluate(async (workId) => {
    const res = await fetch(`/dsh-workbench/canvas/workthumb?id=${encodeURIComponent(workId)}`)
    return { status: res.status, type: res.headers.get('content-type') || '' }
  }, id)
}

// ---------------------------------------------------------------------------
// 文件检查（只读，不写产物）
// ---------------------------------------------------------------------------

function htmlScreens(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => /\.html?$/i.test(name) && !name.startsWith('.') && !name.startsWith('_'))
      .sort()
  } catch {
    return []
  }
}

function auditScreens(dir, files) {
  return files.map((name) => {
    const html = fs.readFileSync(path.join(dir, name), 'utf8')
    const external = /<(?:img|script|link|iframe|source)\b[^>]*(?:src|href)\s*=\s*["']https?:/i.test(html)
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''
    const mtimeMs = fs.statSync(path.join(dir, name)).mtimeMs
    return { name, bytes: Buffer.byteLength(html), external, title: title.trim(), mtimeMs }
  })
}

function assertScreens(label, dir, expected) {
  const files = htmlScreens(dir)
  assert(files.length >= expected, `${label}：${dir} 里只有 ${files.length} 屏 HTML，期望至少 ${expected} 屏`)
  const audit = auditScreens(dir, files)
  const tooSmall = audit.filter((item) => item.bytes < 400)
  assert(tooSmall.length === 0, `${label}：疑似空文件 ${tooSmall.map((item) => item.name).join(', ')}`)
  const external = audit.filter((item) => item.external)
  assert(external.length === 0, `${label}：引用了外部资源 ${external.map((item) => item.name).join(', ')}`)
  return { dir, files, audit }
}

// 产物必须是本轮模型写的：文件 mtime 不能早于本轮开始（留 5 秒时钟容差）
function assertFresh(label, audit, turnStartedAt) {
  const stale = audit.filter((item) => item.mtimeMs < turnStartedAt - 5000)
  assert(stale.length === 0,
    `${label}：这些屏不是本轮生成的（mtime 早于本轮开始）：${stale.map((item) => item.name).join(', ')}`)
}

async function waitScreens(dir, expected, label, timeout = 90000) {
  return waitFor(() => {
    const files = htmlScreens(dir)
    return files.length >= expected ? files : null
  }, { label, timeout, interval: 1000 })
}

// ---------------------------------------------------------------------------
// 业务步骤
// ---------------------------------------------------------------------------

async function preflight(page) {
  await returnToWorkbench(page)
  await ensureUser(page, '张三')
  const health = await fetch(`${cfg.server}/health`).then((res) => res.json())
  assert(health.ok === true, `服务端 /health 不正常：${JSON.stringify(health)}`)
  writeJson('server-health.json', health)

  const state = await readState(page)
  writeJson('state-before.json', state)
  assert(state.baseDir, '状态里没有 baseDir')
  assert(
    path.resolve(state.baseDir) === path.resolve(cfg.baseDir),
    `桌面端的顶级文件夹是 ${state.baseDir}，脚本期望 ${cfg.baseDir}（可用 WORKBENCH_BASE 覆盖）`,
  )
  assert(state.currentUser && state.currentUser.id === USERS['张三'], '当前身份不是张三')

  const iterations = state.iterations || []
  const requirements = state.requirements || []
  if (cfg.verifyOnly) {
    const iteration = iterations.find((item) => item.code === ITERATION.code)
    assert(iteration, `没有 ${ITERATION.code} 迭代，先跑全流程`)
    const mine = requirements.filter((item) => item.iterationId === iteration.id)
    assert(mine.length >= REQUIREMENTS.length, `${ITERATION.code} 下只有 ${mine.length} 个需求`)
  } else if (!cfg.allowDirty) {
    assert(iterations.length === 2, `基线应为 2 个迭代，实际 ${iterations.length} 个；先跑 --reset 清空数据`)
    assert(requirements.length === 9, `基线应为 9 个需求，实际 ${requirements.length} 个；先跑 --reset 清空数据`)
    assert(!iterations.some((item) => item.code === ITERATION.code), `迭代 ${ITERATION.code} 已存在；先跑 --reset`)
  }
  log(`预检通过：${iterations.length} 迭代 / ${requirements.length} 需求，baseDir=${state.baseDir}`)
  return { state }
}

async function createIteration(page) {
  await ensureUser(page, '张三')
  await returnToWorkbench(page)
  await goHome(page)
  await page.getByRole('button', { name: '新建迭代', exact: true }).click()
  const dialog = page.getByRole('dialog').last()
  await dialog.getByPlaceholder('迭代编码，例如 2026-S12').fill(ITERATION.code)
  await dialog.getByPlaceholder('迭代名称，例如 双十二会员增长').fill(ITERATION.name)
  await dialog.getByRole('button', { name: '创建迭代', exact: true }).click()
  let state = await waitState(
    page,
    (value) => (value.iterations || []).some((item) => item.code === ITERATION.code && item.name === ITERATION.name),
    `迭代 ${ITERATION.code} 创建`,
  )
  const iteration = state.iterations.find((item) => item.code === ITERATION.code)
  await page.waitForTimeout(800)
  const screenshot = await shot(page, `迭代-${ITERATION.code}`)
  writeJson('iteration.json', iteration)
  log(`迭代已创建：${iteration.code} ${iteration.name}（${iteration.id}）`)
  return { iteration, screenshot }
}

async function createRequirementWithPrototype(page, requirement, { send = true } = {}) {
  await ensureUser(page, '李四')
  await openIteration(page, ITERATION.name)
  await page.getByRole('button', { name: '新建需求', exact: true }).click()
  const dialog = page.getByRole('dialog').last()
  await dialog.getByPlaceholder('例如：会员积分改版').fill(requirement.title)
  await dialog.getByPlaceholder(/需求简报（可选）/).fill(requirement.brief)
  await dialog.getByRole('button', { name: '创建需求', exact: true }).click()

  const input = composerLocator(page)
  await input.waitFor({ state: 'visible', timeout: 40000 })
  await waitFor(async () => (await input.innerText()).includes('/design-start'), {
    label: `${requirement.title} 需求会话预填提示词`,
    timeout: 30000,
  })
  const draft = await input.innerText()
  writeText(`draft-${requirement.code}-requirement.txt`, draft)
  assert(draft.includes('workbench_design_context'), '需求会话没有带简报提示词（workbench_design_context）')
  assert(draft.includes('prototype/'), '需求会话提示词没有指向 prototype/')
  await waitSessionPanel(page, `${requirement.code} 需求会话面板`)

  let state = await waitState(
    page,
    (value) => (value.requirements || []).some((item) => item.code === requirement.code && item.title === requirement.title),
    `需求 ${requirement.code} 创建`,
  )
  const created = findRequirement(state, requirement.code)
  assert(created.document && created.document.body.includes('背景：'), '需求简报没有写进活文档')
  assert(created.folderPath, '需求没有 folderPath')

  await shot(page, `${requirement.code}-需求会话就绪`)
  if (!send) return { requirement: created, turn: null, prototype: null }
  const turnStartedAt = Date.now()
  const turn = await runTurn(page, { label: `${requirement.code} 原型生成` })
  writeText(`transcript-${requirement.code}-prototype.txt`, await sessionTranscript(page))

  const files = await waitScreens(created.prototypePath, requirement.prototypeScreens, `${requirement.code} 原型文件`)
  const audit = assertScreens(`${requirement.code} 原型`, created.prototypePath, requirement.prototypeScreens)
  assertFresh(`${requirement.code} 原型`, audit.audit, turnStartedAt)
  writeJson(`prototype-${requirement.code}.json`, { ...audit, files })
  await shot(page, `${requirement.code}-原型画布`)

  await waitFor(async () => (await page.locator('.dsh-wb-design-canvas:visible').count()) > 0, {
    label: `${requirement.code} 原型画布挂载`,
    timeout: 30000,
  })
  await shot(page, `${requirement.code}-原型画布-有屏`)

  state = await readState(page)
  const refreshed = findRequirement(state, requirement.code)
  writeJson(`state-${requirement.code}-after-prototype.json`, refreshed)
  return { requirement: refreshed, turn, prototype: audit }
}

async function openDesignSession(page, requirement) {
  await ensureUser(page, '王五')
  await openIteration(page, ITERATION.name)
  await openRequirement(page, requirement.title)
  await page.getByTitle('为这条需求新建需求、设计、开发或测试会话').click()
  const dialog = page.locator('.dsh-wb-dialog').last()
  await dialog.getByRole('button', { name: '设计会话', exact: true }).click()
  await dialog.getByRole('button', { name: '创建会话', exact: true }).click()

  const input = composerLocator(page)
  await input.waitFor({ state: 'visible', timeout: 40000 })
  // 预填模板（client 的 requestDraftInitialization）是产品行为，失败只 console.warn。
  // 回归的主要输入是随后脚本整体替换的完整设计提示词，所以模板缺失只记警告，不判失败。
  const seeded = await waitFor(async () => {
    const text = await input.innerText()
    return text.includes('/design-start') ? text : ''
  }, { label: `${requirement.code} 设计会话预填提示词`, timeout: 15000 }).catch(() => '')
  if (seeded) {
    writeText(`draft-${requirement.code}-design.txt`, seeded)
  } else {
    log(`⚠ ${requirement.code} 设计会话没有预填模板，继续用脚本提示词`)
    writeText(`draft-${requirement.code}-design.txt`, `[未预填] 输入框内容：${await input.innerText()}\n`)
  }
  await waitSessionPanel(page, `${requirement.code} 设计会话面板`)
  return { input, seeded: Boolean(seeded) }
}

// 右侧面板的「设计」标签可能被切到「需求」或被关掉；断言画布前先把它切回来。
async function ensureDesignTab(page, label) {
  const tab = page.getByRole('tab').filter({ hasText: /^设计\s*$/ }).first()
  if (await tab.isVisible().catch(() => false)) {
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click()
  } else {
    const open = page.getByRole('button', { name: /打开设计右栏/ }).first()
    if (await open.isVisible().catch(() => false)) await open.click()
  }
  await waitFor(async () => (await page.locator('.dsh-wb-design-canvas:visible').count()) > 0, {
    label: `${label}设计画布挂载`,
    timeout: 30000,
  })
}

async function createDesign(page, requirement) {
  await openDesignSession(page, requirement)

  // 右侧「设计」面板只有在需求被当前设计师认领后才从只读预览切成可编辑画布。
  // /design-start 技能虽然要求模型认领，但模型可能跳过；这里用产品自带的 /design-claim 先认领。
  await runTurn(page, { prompt: '/design-claim', label: `${requirement.code} 认领设计`, timeout: 180000 })
  const claimedState = await waitState(page, (value) => {
    const item = findRequirement(value, requirement.code)
    return item && item.designerId === USERS['王五']
  }, `${requirement.code} 设计认领落库`, 60000)
  writeJson(`state-${requirement.code}-claimed.json`, findRequirement(claimedState, requirement.code))
  await ensureDesignTab(page, `${requirement.code} 认领后的`)
  await shot(page, `${requirement.code}-设计画布-已认领`)

  const prompt = [
    '/design-start',
    `需求：${requirement.code}「${requirement.title}」`,
    `平台：${requirement.platform}`,
    `产品原型：prototype/ 下已有 ${requirement.prototypeActual ?? requirement.prototypeScreens} 屏，先读取原型和对齐信息结构，再出高保真稿。`,
    '设计已由王五认领，直接开始，不需要再认领。',
    '',
    '先补全这次的设计要求，再直接出高保真设计稿：',
    `- 要设计的页面 / 流程：${requirement.flow}`,
    `- 关键状态：${requirement.states}`,
    `- 视觉方向：${requirement.visual}`,
    `- 端与交付范围：${requirement.platform}，${requirement.designScreens} 屏，一屏一个 HTML`,
    '',
    '本轮只写设计稿，不要调用交付工具；写完等我确认后再 /design-deliver。',
    '补全后请加载 ui-design 技能，一屏一个 HTML 写进这条需求的设计目录 design/，沿用原型里的信息结构和验收标准。',
    '右侧「设计」面板会自动显示 design/ 里的页面；不要调用画布的 preview / check 工具。',
  ].join('\n')
  writeText(`prompt-${requirement.code}-design.txt`, prompt)

  await shot(page, `${requirement.code}-设计会话就绪`)
  const turnStartedAt = Date.now()
  const turn = await runTurn(page, { prompt, label: `${requirement.code} 设计稿生成` })
  writeText(`transcript-${requirement.code}-design.txt`, await sessionTranscript(page))

  let state = await waitState(page, (value) => {
    const item = findRequirement(value, requirement.code)
    return item && item.designerId === USERS['王五']
  }, `${requirement.code} 设计认领`, 120000)
  const claimed = findRequirement(state, requirement.code)
  assert(['claimed', 'designing', 'delivered'].includes(claimed.designStatus), `设计状态异常：${claimed.designStatus}`)

  const files = await waitScreens(claimed.designPath, requirement.designScreens, `${requirement.code} 设计文件`)
  const audit = assertScreens(`${requirement.code} 设计稿`, claimed.designPath, requirement.designScreens)
  assertFresh(`${requirement.code} 设计稿`, audit.audit, turnStartedAt)
  writeJson(`design-${requirement.code}.json`, { ...audit, files })
  await ensureDesignTab(page, `${requirement.code} 生成后的`)
  await shot(page, `${requirement.code}-设计画布`)

  const canvasPane = page.locator('.dsh-wb-design-canvas:visible').last()
  const canvasText = await canvasPane.innerText().catch(() => '')
  assert(!/手机预览|设计市场|灵感/.test(canvasText), '设计画布里仍然出现已裁剪的入口（手机预览/设计市场/灵感）')
  for (const name of ['首页', '画布', '外观', '体检', '导出']) {
    assert(await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().isVisible().catch(() => false),
      `设计画布缺少「${name}」入口`)
  }
  await shot(page, `${requirement.code}-设计画布-有屏`)
  await page.getByRole('button', { name: /^体检/ }).first().click().catch(() => {})
  await page.waitForTimeout(2500)
  await shot(page, `${requirement.code}-设计画布-体检`)
  await page.keyboard.press('Escape').catch(() => {})

  const deliverTurn = await runTurn(page, { prompt: '/design-deliver', label: `${requirement.code} 设计交付`, timeout: cfg.deliverTimeoutMs })
  writeText(`transcript-${requirement.code}-deliver.txt`, await sessionTranscript(page))

  state = await waitState(page, (value) => {
    const item = findRequirement(value, requirement.code)
    return item && item.designStatus === 'delivered' && (item.designVersions || []).length > 0
  }, `${requirement.code} 交付落库`, 120000)
  const delivered = findRequirement(state, requirement.code)
  const versions = delivered.designVersions || []
  assert(versions[versions.length - 1].by === USERS['王五'], `设计交付人应为王五，实际 ${versions[versions.length - 1].by}`)
  assert((delivered.designFiles || []).length >= requirement.designScreens,
    `${requirement.code} 服务端只有 ${(delivered.designFiles || []).length} 个设计文件，期望至少 ${requirement.designScreens}`)
  const designArtifacts = (delivered.artifacts || []).filter((artifact) => (
    artifact.kind === 'design' && /\.html?$/i.test(String(artifact.name || ''))
  ))
  assert(designArtifacts.length >= requirement.designScreens,
    `${requirement.code} 服务端只有 ${designArtifacts.length} 个设计稿产物，跨角色预览会缺屏`)
  writeJson(`state-${requirement.code}-delivered.json`, delivered)
  await shot(page, `${requirement.code}-设计已交付`)
  return { requirement: delivered, turn, deliverTurn, design: audit, version: versions[versions.length - 1] }
}

async function verifyDeliverySurfaces(page, created) {
  await ensureUser(page, '李四')
  await openIteration(page, ITERATION.name)
  await openRequirement(page, created.title)

  await waitFor(async () => {
    const text = await bodyText(page)
    return text.includes('设计已交付') && text.includes('王五')
  }, { label: `${created.code} 需求详情显示设计已交付`, timeout: 30000 })

  const detailText = await bodyText(page)
  const componentMatch = detailText.match(/设计组件\s*·\s*(\d+)\s*屏\s*·\s*(\d+)\s*个可预览/)
  assert(componentMatch, '需求详情没有显示设计组件屏数')
  assert(Number(componentMatch[1]) >= created.designScreens,
    `${created.code} 设计组件只有 ${componentMatch[1]} 屏，期望至少 ${created.designScreens}`)
  writeText(`requirement-detail-${created.code}.txt`, await bodyText(page))
  await shot(page, `${created.code}-需求详情-设计已交付`)

  await page.getByRole('button', { name: '在设计右栏打开', exact: true }).first().click()
  await waitFor(async () => (await page.locator('.dsh-wb-readonly:visible').count()) > 0, {
    label: `${created.code} 只读设计预览`,
    timeout: 30000,
  })
  const readonly = page.locator('.dsh-wb-readonly:visible').last()
  const previewFrames = readonly.locator('iframe')
  const previewCount = await previewFrames.count()
  assert(previewCount >= created.designScreens,
    `${created.code} 只读预览只有 ${previewCount} 屏，期望至少 ${created.designScreens}`)
  const previewSrcs = await previewFrames.evaluateAll((frames) => frames.map((frame) => frame.getAttribute('src') || ''))
  assert(previewSrcs.every((src) => src.includes('design-preview')),
    `${created.code} 只读预览没有走 design-preview：${previewSrcs.slice(0, 2).join(' | ')}`)
  const paneText = await readonly.innerText().catch(() => '')
  assert(!/手机预览|设计市场|灵感/.test(paneText), '只读预览里仍然出现已裁剪的入口（手机预览/设计市场/灵感）')
  // 交付预览必须自带样式：同目录 CSS 要在服务端预览路由里内联，否则 iframe 会被 CSP 拦成无样式 HTML。
  const firstSrc = (await previewFrames.first().getAttribute('src')) || ''
  const previewFrame = await waitFor(
    () => page.frames().find((frame) => frame.url() === new URL(firstSrc, page.url()).href),
    { label: `${created.code} 只读预览首屏加载`, timeout: 15000 },
  )
  await previewFrame.waitForLoadState('load').catch(() => {})
  const previewAudit = await previewFrame.evaluate(() => ({
    stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
    inlined: document.querySelectorAll('style[data-preview-asset]').length,
  }))
  writeJson(`preview-audit-${created.code}.json`, previewAudit)
  assert(previewAudit.stylesheets === 0,
    `${created.code} 只读预览还有 ${previewAudit.stylesheets} 个未内联的样式表，交付稿会无样式或被 CSP 拦截`)
  await shot(page, `${created.code}-设计只读预览`)

  const works = await readWorks(page)
  writeJson(`works-${created.code}.json`, works)
  const relevant = (works.works || []).filter((work) => (
    work.dir === created.prototypePath || work.dir === created.designPath
  ))
  const designWork = relevant.find((work) => work.dir === created.designPath)
  const prototypeWork = relevant.find((work) => work.dir === created.prototypePath)
  assert(prototypeWork, `${created.code} 的原型目录没有进入我的作品`)
  assert(designWork, `${created.code} 的设计目录没有进入我的作品`)
  assert(prototypeWork.screens >= created.prototypeScreens,
    `原型作品只有 ${prototypeWork.screens} 屏，期望至少 ${created.prototypeScreens}`)
  assert(designWork.screens >= created.designScreens,
    `设计作品只有 ${designWork.screens} 屏，期望至少 ${created.designScreens}`)

  const thumb = await waitFor(async () => {
    const latest = (await readWorks(page)).works || []
    const item = latest.find((work) => work.dir === created.designPath)
    return item && item.thumb ? item : null
  }, { label: `${created.code} 设计缩略图`, timeout: 60000, interval: 1500 })
  const thumbResult = await thumbStatus(page, thumb.id)
  assert(thumbResult.status === 200 && /^image\//.test(thumbResult.type),
    `设计缩略图不可用：HTTP ${thumbResult.status} ${thumbResult.type}`)
  writeJson(`works-thumb-${created.code}.json`, thumbResult)

  return { detailText, works: relevant }
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

function buildReport({ ok, error, startedAt, finishedAt, context }) {
  const lines = []
  lines.push('# 2026-S13 桌面端真实绘制回归')
  lines.push('')
  lines.push(`- 结果：**${ok ? '通过' : '失败'}**`)
  lines.push(`- 开始：${startedAt}`)
  lines.push(`- 结束：${finishedAt}`)
  lines.push(`- 证据：${path.relative(REPO, cfg.evidence)}`)
  lines.push(`- 服务端：${cfg.server}；桌面端 CDP：${cfg.cdp}`)
  lines.push(`- 顶级文件夹：${cfg.baseDir}`)
  lines.push('')
  lines.push('## 步骤')
  lines.push('')
  lines.push('| # | 步骤 | 结果 | 耗时 | 说明 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const item of results) {
    const detail = item.ok
      ? (item.detail == null ? '' : (typeof item.detail === 'string' ? item.detail : JSON.stringify(item.detail))).slice(0, 160)
      : String(item.error || '').split('\n')[0]
    lines.push(`| ${item.step} | ${item.name} | ${item.ok ? '通过' : '失败'} | ${Math.round((item.ms || 0) / 1000)}s | ${detail.replace(/\|/g, '/')} |`)
  }
  if (context && context.requirements) {
    lines.push('')
    lines.push('## 产物')
    lines.push('')
    lines.push('| 需求 | 原型 | 设计 | 设计版本 |')
    lines.push('| --- | --- | --- | --- |')
    for (const item of context.requirements) {
      const proto = item.prototype ? `${item.prototype.files.length} 屏：${item.prototype.files.join('、')}` : '—'
      const design = item.design ? `${item.design.files.length} 屏：${item.design.files.join('、')}` : '—'
      const version = item.version ? `d${item.version.version}（${item.version.by}）` : '—'
      lines.push(`| ${item.code} ${item.title} | ${proto.replace(/\|/g, '/')} | ${design.replace(/\|/g, '/')} | ${version} |`)
    }
  }
  lines.push('')
  lines.push('## 控制台')
  lines.push('')
  lines.push(`- 未过滤的 console error：${consoleErrors.length} 条`)
  lines.push(`- pageerror：${pageErrors.length} 条`)
  lines.push(`- 登录前 401 已知噪声：${authNoise.length} 条`)
  lines.push(`- dsh-workbench 控制台警告：${warnings.length} 条`)
  if (warnings.length) {
    lines.push('')
    lines.push('```text')
    lines.push(...warnings.slice(0, 20))
    lines.push('```')
  }
  if (consoleErrors.length) {
    lines.push('')
    lines.push('```text')
    lines.push(...consoleErrors.slice(0, 20))
    lines.push('```')
  }
  if (pageErrors.length) {
    lines.push('')
    lines.push('```text')
    lines.push(...pageErrors.slice(0, 20))
    lines.push('```')
  }
  if (error) {
    lines.push('')
    lines.push('## 失败原因')
    lines.push('')
    lines.push('```text')
    lines.push(String(error && error.stack ? error.stack : error))
    lines.push('```')
  }
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date().toISOString()
  let error = null
  let context = null
  let page = null
  try {
    if (cli.reset) {
      log('运行数据重置脚本')
      const reset = spawnSync('bash', [RESET_SCRIPT], { stdio: 'inherit' })
      assert(reset.status === 0, '数据重置脚本失败了')
    }

    page = await connect()
    await runStep('预检：服务端、桌面端、数据基线', () => preflight(page))

    if (cfg.preflightOnly) {
      log('--preflight：预检完成，不创建测试数据')
    } else if (cfg.prepareOnly) {
      await runStep('创建迭代 2026-S13', () => createIteration(page))
      context = { requirements: [] }
      for (const requirement of REQUIREMENTS) {
        await runStep(`${requirement.code} 创建需求（不发送提示词）`, async () => {
          const result = await createRequirementWithPrototype(page, requirement, { send: false })
          context.requirements.push({ ...requirement, prototype: null })
          return `${requirement.code} 已创建，预填提示词就绪`
        })
      }
      await runStep(`${REQUIREMENTS[0].code} 创建设计会话（不发送提示词）`, async () => {
        const opened = await openDesignSession(page, REQUIREMENTS[0])
        await shot(page, `${REQUIREMENTS[0].code}-设计会话就绪`)
        return `${REQUIREMENTS[0].code} 设计会话已创建${opened.seeded ? '，预填提示词就绪' : '，预填模板缺失（仅记录）'}`
      })
      log('--prepare：只创建需求与设计会话并停在提示词；继续前请先重置数据')
    } else if (cfg.verifyOnly) {
      const state = await readState(page)
      assert((state.iterations || []).some((item) => item.code === ITERATION.code), `没有 ${ITERATION.code} 迭代，先跑全流程`)
      context = { requirements: [] }
      for (const requirement of REQUIREMENTS) {
        const item = findRequirement(state, requirement.code)
        assert(item, `没有 ${requirement.code}`)
        const entry = {
          ...requirement,
          prototypePath: path.join(item.folderPath, 'prototype'),
          designPath: path.join(item.folderPath, 'design'),
        }
        await runStep(`${requirement.code} 跨角色预览、我的作品与画布`, async () => {
          const result = await verifyDeliverySurfaces(page, entry)
          context.requirements.push({ ...entry, surfaces: result })
          return `${requirement.code} 设计组件与作品校验通过`
        })
      }
      writeJson('state-after.json', await readState(page))
      log('--verify：只验证已有交付，不生成、不写产物')
    } else {
      await runStep('创建迭代 2026-S13', () => createIteration(page))
      context = { requirements: [] }

      for (const requirement of REQUIREMENTS) {
        await runStep(`${requirement.code} 创建需求并真实生成原型`, async () => {
          const result = await createRequirementWithPrototype(page, requirement)
          context.requirements.push({ ...requirement, prototype: result.prototype })
          return `${requirement.code} 原型 ${result.prototype.files.length} 屏`
        })
      }

      for (const requirement of REQUIREMENTS) {
        const entry = context.requirements.find((item) => item.code === requirement.code)
        await runStep(`${requirement.code} 真实生成设计稿并 /design-deliver`, async () => {
          const result = await createDesign(page, { ...requirement, prototypeActual: entry.prototype?.files.length })
          entry.design = result.design
          entry.version = result.version
          return `${requirement.code} 设计 ${result.design.files.length} 屏，d${result.version.version}`
        })
      }

      for (const requirement of REQUIREMENTS) {
        const entry = context.requirements.find((item) => item.code === requirement.code)
        await runStep(`${requirement.code} 跨角色预览、我的作品与画布`, async () => {
          const result = await verifyDeliverySurfaces(page, {
            ...requirement,
            prototypePath: entry.prototype.dir,
            designPath: entry.design.dir,
          })
          entry.surfaces = result
          return `${requirement.code} 设计组件与作品校验通过`
        })
      }

      const finalState = await readState(page)
      writeJson('state-after.json', finalState)
      assert((finalState.iterations || []).some((item) => item.code === ITERATION.code), '最终状态里没有 2026-S13')
    }

    const pageErrorsNow = pageErrors.length
    assert(pageErrorsNow === 0, `页面出现 ${pageErrorsNow} 个 JS 异常：${pageErrors.slice(0, 3).join(' | ')}`)
  } catch (reason) {
    error = reason
  } finally {
    const finishedAt = new Date().toISOString()
    const ok = error === null
    writeJson('console.json', { consoleErrors, pageErrors, authNoise, warnings })
    writeText('report.md', buildReport({ ok, error, startedAt, finishedAt, context }))
    writeJson('report.json', {
      ok,
      startedAt,
      finishedAt,
      config: { ...cfg },
      results,
      requirements: context ? context.requirements.map((item) => ({
        code: item.code,
        title: item.title,
        prototype: item.prototype ? { dir: item.prototype.dir, files: item.prototype.files } : null,
        design: item.design ? { dir: item.design.dir, files: item.design.files } : null,
        version: item.version || null,
      })) : [],
      consoleErrors,
      pageErrors,
      authNoise,
      warnings,
      error: error ? String(error.stack || error) : null,
    })
    log(`报告：${path.join(path.relative(REPO, cfg.evidence), 'report.md')}`)
    if (!ok) log(`失败：${error && error.message ? error.message : error}`)
    process.exit(ok ? 0 : 1)
  }
}

await main()
