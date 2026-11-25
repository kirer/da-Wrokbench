#!/usr/bin/env node
/**
 * 「在线教育」全流程回归（结构层，不调用模型）。
 *
 * 流程：
 *   1. 张三（负责人）新建项目「在线教育」；
 *   2. 张三新建迭代「初始化项目」（编码 EDU-2026-11，开始日期=今天，结束日期留空）；
 *   3. 李四（产品）建两个需求：
 *        - 「课程列表」：空需求，不出原型，停在草稿；
 *        - 「课程详情与报名」：需求说明由产品会话写进活文档，走完整生命周期；
 *   4. 王五（设计）进入需求，验证认领设计后才开设计会话、打开设计画布；
 *   5. 孙八 / 赵六（开发）进入需求，验证在对应端的卡片上认领并开开发会话；
 *   6. 钱七（测试）进入需求，验证自动开测试会话；
 *   7. 产品提交 → 负责人评审通过 → 负责人纳入范围（当前等价于“发布”）；
 *   8. 记录当前缺失：需求评审没有页面入口、工作量评估没有字段、
 *      发布时不能指定端和人（端在创建需求时按产品身份默认，认领靠接口/技能）。
 *
 * 脚本只点界面 / 读接口，不写 prototype/ 或 design/ 产物。
 * 需要真实生成原型时，在需求会话里手动发提示词，或跑 desktop-s13.mjs。
 *
 * 用法：
 *   bash tools/reset-workbench-test-data.sh      # 先清空测试数据（会退出/重开桌面端）
 *   node e2e/check-online-education.mjs          # 跑结构全流程
 *   node e2e/check-online-education.mjs --reset  # 清空后直接跑
 *
 * 前置：服务端 127.0.0.1:3210；DSH 桌面端开 9222；插件已安装。
 * 证据：runtime/test-evidence/online-education-<时间>/
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const RESET_SCRIPT = path.join(REPO, 'tools', 'reset-workbench-test-data.sh')

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--reset') out.reset = true
    else if (arg === '--no-launch') out.noLaunch = true
    else if (arg.startsWith('--cdp=')) out.cdp = arg.slice(6)
    else if (arg.startsWith('--server=')) out.server = arg.slice(9)
    else if (arg.startsWith('--evidence=')) out.evidence = arg.slice(11)
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
  server: cli.server || process.env.WORKBENCH_SERVER_URL || 'http://127.0.0.1:3210',
  evidence: cli.evidence || path.join(REPO, 'runtime', 'test-evidence', `online-education-${stamp}`),
}
const PROJECT = '在线教育'
const ITERATION = { code: 'EDU-2026-11', name: '初始化项目' }
const R_EMPTY = { title: '课程列表' }
const R_FULL = {
  title: '课程详情与报名',
  brief: [
    '背景：家长在课程列表里看不到课程适龄、上课形式和剩余名额，咨询量大。',
    '目标：一屏看懂课程信息并完成报名，报名后收到确认和上课提醒。',
    '页面：1) 课程详情（封面、适龄、老师、课时、名额、价格）；2) 报名确认（学员信息、支付方式）；3) 报名成功。',
    '状态：默认、名额已满、支付失败、未登录。',
    '验收：信息完整可扫读；名额为 0 时按钮置灰并给替代课程；支付失败可重试；报名成功给出上课时间。',
  ].join('\n'),
}
const USERS = {
  张三: 'zhangsan',
  李四: 'lisi',
  王五: 'wangwu',
  赵六: 'zhaoliu',
  孙八: 'sunba',
  钱七: 'qianqi',
}
const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD，本地时区

fs.mkdirSync(cfg.evidence, { recursive: true })
const steps = []
let page = null

function log(...args) {
  console.log('[在线教育]', ...args)
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(cfg.evidence, name), JSON.stringify(value, null, 2) + '\n')
}

function writeText(name, value) {
  fs.writeFileSync(path.join(cfg.evidence, name), String(value))
}

async function shot(name) {
  const file = path.join(cfg.evidence, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false }).catch(() => {})
  return file
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function runStep(name, fn) {
  const startedAt = Date.now()
  log(`▶ ${name}`)
  try {
    const detail = await fn()
    const item = { name, ok: true, ms: Date.now() - startedAt, detail: detail ?? null }
    steps.push(item)
    log(`✓ ${name}（${Math.round(item.ms / 1000)}s）`)
    return detail
  } catch (error) {
    const item = { name, ok: false, ms: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }
    steps.push(item)
    log(`✗ ${name}：${item.error}`)
    await shot(`失败-${steps.length}-${name.replace(/[\\/:*?"<>|\s]+/g, '-')}`)
    throw error
  }
}

async function connect() {
  const deadline = Date.now() + 60000
  let last = null
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(cfg.cdp)
      const context = browser.contexts()[0]
      if (!context) throw new Error('没有可用的桌面端上下文')
      const found = context.pages().find(candidate => candidate.url().startsWith('dsh-app://'))
      if (!found) throw new Error('没有找到 dsh-app:// 页面')
      found.on('pageerror', error => log('页面异常：', error.message))
      return { browser, page: found }
    } catch (error) {
      last = error
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }
  throw new Error(`连不上桌面端 CDP ${cfg.cdp}：${last instanceof Error ? last.message : last}`)
}

async function waitFor(fn, label, timeout = 30000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeout) {
    try {
      last = await fn()
      if (last) return last
    } catch (error) { last = error }
    await page.waitForTimeout(350)
  }
  throw new Error(`等待超时：${label}（最后结果：${last instanceof Error ? last.message : last}）`)
}

async function bodyText() {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ')
}

async function readState() {
  return page.evaluate(async () => {
    const token = window.localStorage.getItem('dshWorkbenchAuthToken') || ''
    const response = await fetch('/dsh-workbench/api/state', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error(`state HTTP ${response.status}`)
    return response.json()
  })
}

async function waitState(predicate, label, timeout = 30000) {
  return waitFor(async () => {
    const state = await readState()
    return predicate(state) ? state : null
  }, label, timeout)
}

async function apiPost(pathname, body = {}) {
  return page.evaluate(async ({ pathname, body }) => {
    const token = window.localStorage.getItem('dshWorkbenchAuthToken') || ''
    const response = await fetch(`/dsh-workbench/api/${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}: ${text.slice(0, 300)}`)
    return JSON.parse(text)
  }, { pathname, body })
}

const loginRows = () => page.locator('.user-row').count()

async function loginAs(name) {
  const row = page.locator('.user-row').filter({ hasText: name }).first()
  await row.waitFor({ state: 'visible', timeout: 20000 })
  await row.click()
  await page.getByRole('button', { name: `以「${name}」身份进入` }).click()
  await waitFor(async () => (await loginRows()) === 0, `${name} 登录提交`, 20000)
  await page.waitForTimeout(1200)
}

async function returnToWorkbench() {
  if (await page.locator('.plugnac-project-btn').isVisible().catch(() => false)) return
  if ((await loginRows()) > 0) return
  const entry = page.getByRole('button', { name: '研发工作台', exact: true }).first()
  if (await entry.isVisible().catch(() => false)) {
    await entry.click().catch(() => {})
    await page.waitForTimeout(1200)
  }
  await page.locator('.plugnac-project-btn').waitFor({ state: 'visible', timeout: 30000 })
}

async function ensureIdentity(name) {
  if ((await loginRows()) > 0) {
    await loginAs(name)
    await returnToWorkbench()
  }
  const state = await readState().catch(() => null)
  if (state?.currentUser?.name === name) return
  if (state === null) throw new Error(`读取不到当前身份，等待超时（目标 ${name}）`)
  log(`切换身份：${state.currentUser?.name ?? '未知'} → ${name}`)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await waitFor(async () => (await loginRows()) > 0, '退出后出现登录用户', 20000)
  await loginAs(name)
  await returnToWorkbench()
  const after = await readState()
  if (after.currentUser?.name !== name) throw new Error(`身份切换失败，当前是 ${after.currentUser?.name}`)
  log(`身份：${name}`)
}

const projectName = async () => (await page.locator('.plugnac-project-name').innerText().catch(() => '')).trim()

async function openProjectMenu() {
  if (!(await page.locator('.dsh-wb-project-menu').isVisible().catch(() => false))) {
    await page.locator('.plugnac-project-btn').click()
  }
  await page.locator('.dsh-wb-project-menu').waitFor({ state: 'visible', timeout: 8000 })
}

async function selectProject(name) {
  await returnToWorkbench()
  if ((await projectName()) === name) return
  await openProjectMenu()
  const item = page.locator('.dsh-wb-project-item').filter({ hasText: name }).first()
  await item.waitFor({ state: 'visible', timeout: 10000 })
  await item.click()
  await waitFor(async () => (await projectName()) === name, `切换到项目 ${name}`, 20000)
  await page.waitForTimeout(800)
}

async function ensureProject(name) {
  await returnToWorkbench()
  await openProjectMenu()
  const existing = await page.locator('.dsh-wb-project-item').filter({ hasText: name }).count()
  if (existing > 0) {
    await page.keyboard.press('Escape')
    await selectProject(name)
    return { created: false }
  }
  await page.locator('.dsh-wb-project-action').filter({ hasText: '新建项目' }).click()
  const dialog = page.getByRole('dialog').last()
  await dialog.locator('input').first().waitFor({ state: 'visible', timeout: 8000 })
  await dialog.locator('input').first().fill(name)
  await dialog.locator('input').nth(1).fill('在线教育全流程回归')
  await dialog.getByRole('button', { name: '创建项目', exact: true }).click()
  await waitFor(async () => (await projectName()) === name, `新建项目 ${name}`, 25000)
  await page.waitForTimeout(1200)
  return { created: true }
}

async function openIterationList() {
  await returnToWorkbench()
  // 顶栏面包屑的根节点就是首页；已经在首页时它是当前层，不用点。
  const root = page.locator('.dsh-wb-crumbs .step').filter({ hasText: /^首页$/ }).first()
  if (await root.isVisible().catch(() => false)) await root.click()
  await page.waitForTimeout(450)
}

async function openIteration(code) {
  await openIterationList()
  const row = page.locator('.table-wrap table tbody tr').filter({ hasText: code }).first()
  await row.waitFor({ state: 'visible', timeout: 15000 })
  await row.click()
  await page.locator('.head-card').waitFor({ state: 'visible', timeout: 15000 })
}

async function createIteration(iteration) {
  await openIterationList()
  await page.getByRole('button', { name: '新建迭代', exact: true }).click()
  const dialog = page.getByRole('dialog').last()
  await dialog.getByPlaceholder('迭代编码，例如 2026-S12').fill(iteration.code)
  await dialog.getByPlaceholder('迭代名称，例如 双十二会员增长').fill(iteration.name)
  await dialog.locator('input[type="date"]').nth(0).fill(today)
  await dialog.getByRole('button', { name: '创建迭代', exact: true }).click()
  const state = await waitState(
    value => (value.iterations || []).some(item => item.code === iteration.code && item.name === iteration.name),
    `迭代 ${iteration.code} 创建`,
    30000,
  )
  const created = state.iterations.find(item => item.code === iteration.code)
  assert(created.startDate === today, `迭代开始日期应为 ${today}，实际 ${created.startDate}`)
  assert(!created.endDate, `迭代结束日期应留空，实际 ${created.endDate}`)
  log(`迭代已创建：${created.code} ${created.name}，开始 ${created.startDate}，结束 ${created.endDate || '未设置'}`)
  return created
}

async function createRequirement({ title, brief = '' }) {
  await openIteration(ITERATION.code)
  await page.getByRole('button', { name: '新建需求', exact: true }).click()
  const dialog = page.getByRole('dialog').last()
  await dialog.getByPlaceholder('例如：会员积分改版').fill(title)
  await dialog.getByRole('button', { name: '创建需求', exact: true }).click()
  const state = await waitState(
    value => {
      const item = (value.requirements || []).find(requirement => requirement.title === title)
      if (!item) return false
      if (item.status === 'creating' || item.status === 'create_failed') return false
      if (!item.folderPath) return false
      return true
    },
    `需求「${title}」创建完成`,
    90000,
  )
  const created = state.requirements.find(item => item.title === title)
  assert(created.folderPath, `需求「${title}」没有 folderPath`)
  if (brief !== '') {
    // 新建弹窗只收名称；需求说明由产品在会话里说、模型写进活文档。
    // 结构脚本不调用模型，这里用接口模拟这一步，后面的断言按同样的数据走。
    const firstLine = brief.split('\n').map(line => line.trim()).find(line => line !== '') ?? brief.slice(0, 120)
    await apiPost(`requirements/${encodeURIComponent(created.id)}/document`, {
      summary: firstLine.slice(0, 300),
      body: brief,
    })
    const refreshed = await readState()
    const saved = refreshed.requirements.find(item => item.id === created.id)
    assert(saved?.document?.body?.includes('背景：'), `需求「${title}」的需求说明没有写进活文档`)
  }
  // 创建完成后插件会切到这条需求页；等标题真的换过来，避免跟在 onCreated 后面抢导航。
  await waitFor(async () => (
    (await page.locator('.rf-head h1').innerText().catch(() => '')).trim() === title
  ), `需求页切到「${title}」`, 30000)
  log(`需求已创建：${created.code} ${created.title}`)
  return created
}

async function openRequirement(title) {
  const card = page.locator('.req-card').filter({ hasText: title }).first()
  await card.waitFor({ state: 'visible', timeout: 15000 })
  await card.locator('.rc-title').click()
  await page.locator('.rf-head').waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('.cardwall').waitFor({ state: 'visible', timeout: 15000 })
}

async function waitOwnSession(requirementId, type, userId, label) {
  return waitState(value => {
    const requirement = (value.requirements || []).find(item => item.id === requirementId)
    return (requirement?.sessions || []).some(session => (
      session.archived !== true
      && session.type === type
      && session.createdBy === userId
      && typeof session.sessionId === 'string'
      && session.sessionId !== ''
    ))
  }, label, 90000).then(value => (value.requirements || []).find(item => item.id === requirementId))
}

async function waitDockChat(label) {
  await waitFor(async () => (
    await page.locator('.dsh-wb-dock [data-composer-input="true"]:visible').count()
  ) > 0, label, 60000)
}

function requirementOf(state, title) {
  return (state.requirements || []).find(item => item.title === title) ?? null
}

async function main() {
  if (cli.reset) {
    log('先清空测试数据…')
    const result = spawnSync('bash', [RESET_SCRIPT], { stdio: 'inherit', env: process.env })
    if (result.status !== 0) throw new Error(`清空测试数据失败（退出码 ${result.status}）`)
  }

  const connected = await connect()
  page = connected.page
  await page.bringToFront()
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1500)
  await returnToWorkbench().catch(async () => {
    if ((await loginRows()) > 0) await loginAs('张三')
    await returnToWorkbench()
  })

  await runStep('1. 张三新建项目「在线教育」', async () => {
    await ensureIdentity('张三')
    const result = await ensureProject(PROJECT)
    const state = await readState()
    assert(state.project?.name === PROJECT, `当前项目应为 ${PROJECT}，实际 ${state.project?.name}`)
    await openIterationList()
    const homeLinks = await page.locator('.home-link').allInnerTexts()
    assert(homeLinks.length === 2, `首页应有两个入口，实际 ${homeLinks.length} 个`)
    assert(homeLinks.some(text => text.includes('我的工作台')), `首页缺少「我的工作台」入口：${homeLinks.join(' | ')}`)
    assert(homeLinks.some(text => text.includes('技能')), `首页缺少「技能」入口：${homeLinks.join(' | ')}`)
    await shot('01-项目-在线教育')
    return { created: result.created, projectId: state.project?.id }
  })

  await runStep('2. 张三新建迭代「初始化项目」', async () => {
    await ensureIdentity('张三')
    const iteration = await createIteration(ITERATION)
    await shot('02-迭代-初始化项目')
    return { id: iteration.id, code: iteration.code, startDate: iteration.startDate, endDate: iteration.endDate ?? '' }
  })

  await runStep('3. 李四建两个需求（一个空需求、一个完整需求）', async () => {
    await ensureIdentity('李四')
    await selectProject(PROJECT)
    const empty = await createRequirement(R_EMPTY)
    await returnToWorkbench()
    const full = await createRequirement(R_FULL)
    await returnToWorkbench()
    const state = await readState()
    const savedEmpty = requirementOf(state, R_EMPTY.title)
    const savedFull = requirementOf(state, R_FULL.title)
    assert(savedEmpty.status === 'draft', `空需求应停在草稿，实际 ${savedEmpty.status}`)
    assert((savedEmpty.versions || []).length === 0, '空需求不应有提交版本')
    assert(savedFull.document?.body?.includes('验收：'), '完整需求缺少验收标准')
    assert(savedFull.sessionId, '完整需求创建后应有产品会话')
    await shot('03-需求已创建')
    return {
      empty: { id: savedEmpty.id, code: savedEmpty.code, status: savedEmpty.status },
      full: { id: savedFull.id, code: savedFull.code, status: savedFull.status, platforms: savedFull.platformIds },
    }
  })

  const stateAfterCreate = await readState()
  const full = requirementOf(stateAfterCreate, R_FULL.title)
  const empty = requirementOf(stateAfterCreate, R_EMPTY.title)
  assert(full && empty, '找不到刚创建的两个需求')

  await runStep('4. 草稿需求：只显示总述和产品卡片', async () => {
    await ensureIdentity('李四')
    await selectProject(PROJECT)
    await openIteration(ITERATION.code)
    await openRequirement(R_FULL.title)
    const wall = (await page.locator('.page .req-top, .page .cardwall').allInnerTexts()).join(' ').replace(/\s+/g, ' ')
    for (const expected of ['总述', '产品', '李四']) {
      assert(wall.includes(expected), `卡片墙缺少「${expected}」：${wall.slice(0, 300)}`)
    }
    const participantCards = await page.locator('.pcard').count()
    assert(participantCards === 1, `未发布需求只该有产品一张参与者卡，实际 ${participantCards} 张`)
    assert(!wall.includes('开发 ·'), `未发布需求不应出现开发卡片：${wall.slice(0, 400)}`)
    assert(!wall.includes('设计 待认领'), '未发布需求不应出现设计卡片')
    const pendingNote = await page.locator('.narep').filter({ hasText: '需求还没有发布' }).count()
    assert(pendingNote > 0, '未发布需求没有显示“发布后才出现卡片”的提示')
    const head = await page.locator('.rf-head').innerText()
    assert(!head.includes('设计'), `未发布需求的页头不应显示设计状态：${head.slice(0, 300)}`)
    await waitDockChat('产品会话坞打开')
    await waitFor(async () => {
      const text = await page.locator('.dsh-wb-dock').innerText()
      return text.includes('像平时跟同事讲需求那样说') || text.includes('需求简报在活文档里')
    }, '会话上方出现引导消息', 20000)
    const dockText = await page.locator('.dsh-wb-dock').innerText()
    assert(dockText.includes(R_FULL.title), `引导消息没有带需求标题：${dockText.slice(0, 400)}`)
    assert(dockText.includes('要做的端有'), `引导消息没有带平台：${dockText.slice(0, 400)}`)
    const composerText = await page.locator('.dsh-wb-dock [data-composer-input="true"]:visible').first().innerText()
    assert(composerText.trim() === '', `会话输入框不应预填模板：${composerText.slice(0, 160)}`)
    const fullNow = requirementOf(await readState(), R_FULL.title)
    assert((fullNow.sessions || []).some(session => session.archived !== true && session.type === 'requirement' && session.createdBy === USERS['李四']),
      '完整需求缺少产品会话记录')
    await shot('04-草稿-只有产品卡片')
    return { participantCards, wall: wall.slice(0, 500), head: head.slice(0, 300) }
  })

  await runStep('5. 产品提交 → 负责人评审通过（发布）', async () => {
    // 需求评审目前只有接口和 /lead-review 技能，没有需求页入口；这里直接用接口。
    await ensureIdentity('李四')
    await apiPost(`requirements/${encodeURIComponent(full.id)}/submit`, { summary: '课程详情与报名 v1' })
    const pending = await waitState(value => requirementOf(value, R_FULL.title)?.status === 'pending_review',
      '需求提交待评审', 20000)
    const versionCount = (requirementOf(pending, R_FULL.title).versions || []).length

    await ensureIdentity('张三')
    await apiPost(`requirements/${encodeURIComponent(full.id)}/review`, { decision: 'approve', comment: '结构清楚，可以排期' })
    // 评审全部通过时服务端会同时把需求纳入本期范围，不再需要单独调 scope。
    const approved = await waitState(value => {
      const item = requirementOf(value, R_FULL.title)
      return item && item.status === 'approved' && item.inScope === true
    }, '负责人评审通过并纳入范围', 20000)
    const releasedRequirement = requirementOf(approved, R_FULL.title)
    assert((releasedRequirement.reviews || []).length >= 1, '评审记录没有落库')

    // 发布后回到需求页：设计、开发、测试卡片这时才应该出现。
    await selectProject(PROJECT)
    await openIteration(ITERATION.code)
    await openRequirement(R_FULL.title)
    await waitFor(async () => (await page.locator('.pcard').count()) >= 4, '发布后出现参与者卡片', 20000)
    const wall = (await page.locator('.cardwall').innerText()).replace(/\s+/g, ' ')
    for (const expected of ['设计', '开发 ·', '测试']) {
      assert(wall.includes(expected), `发布后卡片墙缺少「${expected}」：${wall.slice(0, 400)}`)
    }
    const releasedHead = await page.locator('.rf-head').innerText()
    assert(releasedHead.includes('设计状态'), `发布后页头应显示设计状态：${releasedHead.slice(0, 300)}`)
    writeJson('state-released.json', releasedRequirement)
    await shot('05-需求已评审发布')
    return {
      versions: versionCount,
      status: releasedRequirement.status,
      inScope: releasedRequirement.inScope,
      reviews: (releasedRequirement.reviews || []).length,
    }
  })

  await runStep('6. 设计师进入需求：加入需求、认领设计、开设计会话', async () => {
    await ensureIdentity('王五')
    await selectProject(PROJECT)
    await openIteration(ITERATION.code)
    await openRequirement(R_FULL.title)
    // 卡片墙上没有王五：不显示会话坞；设计卡右上角的状态徽标是「认领」。
    const beforeJoin = requirementOf(await readState(), R_FULL.title)
    assert(!(beforeJoin.sessions || []).some(session => session.type === 'design' && session.createdBy === USERS['王五']),
      '认领前不该有王五的设计会话')
    assert((await page.locator('.dsh-wb-dock').count()) === 0, '未加入这条需求时不应显示会话坞')
    const designCard = page.locator('.cardwall .pcard').filter({
      has: page.locator('.prole', { hasText: '设计' }),
    }).first()
    const designClaim = designCard.locator('.pclaim')
    await designClaim.waitFor({ state: 'visible', timeout: 20000 })
    assert((await designCard.innerText()).includes('待认领'), '认领前设计卡应显示待认领')
    await designClaim.click()
    const designDialog = page.locator('.dsh-wb-confirm-dialog')
    await designDialog.waitFor({ state: 'visible', timeout: 10000 })
    assert((await designDialog.innerText()).includes('认领'), '没有出现认领确认框')
    await shot('06-设计师-认领设计')
    await designDialog.getByRole('button', { name: '认领并开始' }).click()
    const withSession = await waitOwnSession(full.id, 'design', USERS['王五'], '王五的设计会话创建')
    await waitDockChat('设计会话坞打开')
    await waitFor(async () => (await page.locator('.dsh-wb-dock').innerText()).includes('说说你想要的样子'),
      '设计会话上方出现引导消息', 20000)
    const designDockText = await page.locator('.dsh-wb-dock').innerText()
    assert(designDockText.includes(R_FULL.title), `设计引导没有带需求标题：${designDockText.slice(0, 400)}`)
    const designComposer = await page.locator('.dsh-wb-dock [data-composer-input="true"]:visible').first().innerText()
    assert(designComposer.trim() === '', `设计会话输入框不应预填模板：${designComposer.slice(0, 160)}`)
    const designRecord = (withSession.sessions || []).find(session => (
      session.type === 'design' && session.createdBy === USERS['王五']
    ))
    assert(designRecord, '没有找到设计会话记录')
    writeJson('design-session.json', designRecord)

    const claimedRequirement = withSession
    assert(claimedRequirement.designerId === USERS['王五'], '加入需求后设计应认领给王五')
    assert(claimedRequirement.designStatus !== 'not_needed', '设计状态不应是无需设计')

    await waitFor(async () => (
      (await page.locator('.cardwall').innerText()).includes('王五')
    ), '认领后设计卡片显示王五', 20000)
    const wall = (await page.locator('.cardwall').innerText()).replace(/\s+/g, ' ')

    const designButton = page.locator('.pcard .pcorner[aria-label="打开设计画布"]').first()
    await designButton.waitFor({ state: 'visible', timeout: 10000 })
    assert(!(await designButton.isDisabled()), '认领后「打开设计画布」不应置灰')
    await designButton.click()
    await page.locator('.dsh-wb-stage').waitFor({ state: 'visible', timeout: 25000 })
    const crumb = await page.evaluate(() => ({
      steps: [...document.querySelectorAll('.dsh-wb-crumbs .step')].map(el => el.innerText.trim()),
      cur: document.querySelector('.dsh-wb-crumbs .cur')?.innerText.trim() ?? '',
    }))
    assert(crumb.cur === '设计', `设计画布面包屑当前层应为「设计」，实际「${crumb.cur}」`)
    await shot('06-设计师-设计画布')
    return { designSessionId: designRecord.designSessionId ?? designRecord.sessionId, designerId: claimedRequirement.designerId, crumb }
  })

  await runStep('7. 开发进入需求：加入需求并按端认领、开开发会话', async () => {
    const claims = [
      { name: '孙八', userId: USERS['孙八'], platformId: 'web', platformName: 'Web' },
      { name: '赵六', userId: USERS['赵六'], platformId: 'trade-server', platformName: '交易服务端' },
    ]
    for (const item of claims) {
      await ensureIdentity(item.name)
      await selectProject(PROJECT)
      await openIteration(ITERATION.code)
      await openRequirement(R_FULL.title)
      // 没有自己的卡片：本人负责、还没人认领的端，卡片右上角是「认领」。
      const devCard = page.locator('.cardwall .pcard').filter({
        has: page.locator('.prole', { hasText: item.platformName }),
      }).first()
      await devCard.waitFor({ state: 'visible', timeout: 20000 })
      assert((await devCard.innerText()).includes('待认领'), `${item.name} 认领前「${item.platformName}」应显示待认领`)
      assert((await page.locator('.dsh-wb-dock').count()) === 0, `${item.name} 未认领时不应显示会话坞`)
      await devCard.locator('.pclaim').click()
      const dialog = page.locator('.dsh-wb-confirm-dialog')
      await dialog.waitFor({ state: 'visible', timeout: 10000 })
      await dialog.getByRole('button', { name: '认领并开始' }).click()
      const withSession = await waitOwnSession(full.id, 'dev', item.userId, `${item.name}的开发会话创建`)
      await waitDockChat(`${item.name} 的开发会话坞打开`)
      const devRecord = (withSession.sessions || []).find(session => (
        session.type === 'dev' && session.createdBy === item.userId
      ))
      assert(devRecord, `${item.name} 没有开发会话记录`)
      const task = (withSession.devTasks || []).find(candidate => candidate.platformId === item.platformId)
      assert(task?.assigneeId === item.userId, `${item.name} 加入后应认领 ${item.platformId}`)
      await waitFor(async () => (
        (await page.locator('.cardwall').innerText()).includes(item.name)
      ), `${item.name} 加入后开发卡片显示负责人`, 20000)
      await shot(`07-${item.name}-开发卡片`)
      log(`${item.name} 已加入并认领 ${item.platformId}`)
    }
    const state = await readState()
    const saved = requirementOf(state, R_FULL.title)
    writeJson('dev-tasks.json', saved.devTasks)
    return { tasks: saved.devTasks.map(task => ({ platformId: task.platformId, assigneeId: task.assigneeId, status: task.status })) }
  })

  await runStep('8. 测试进入需求：自动开测试会话', async () => {
    await ensureIdentity('钱七')
    await selectProject(PROJECT)
    await openIteration(ITERATION.code)
    await openRequirement(R_FULL.title)
    const withSession = await waitOwnSession(full.id, 'test', USERS['钱七'], '钱七的测试会话自动创建')
    await waitDockChat('测试会话坞打开')
    const wall = (await page.locator('.cardwall').innerText()).replace(/\s+/g, ' ')
    assert(wall.includes('测试'), '需求页没有测试卡片')
    const testRecord = (withSession.sessions || []).find(session => (
      session.type === 'test' && session.createdBy === USERS['钱七']
    ))
    assert(testRecord, '没有找到测试会话记录')
    await shot('08-测试-卡片墙')
    return { testSessionId: testRecord.sessionId }
  })

  await runStep('9. 空需求保持草稿，不产生版本和原型', async () => {
    await ensureIdentity('李四')
    const state = await readState()
    const saved = requirementOf(state, R_EMPTY.title)
    assert(saved.status === 'draft', `空需求应保持草稿，实际 ${saved.status}`)
    assert((saved.versions || []).length === 0, '空需求不应有提交版本')
    assert((saved.prototypeFiles || []).length === 0, '空需求不应有原型文件')
    await selectProject(PROJECT)
    await openIteration(ITERATION.code)
    await openRequirement(R_EMPTY.title)
    const wall = (await page.locator('.cardwall').innerText()).replace(/\s+/g, ' ')
    assert(wall.includes('原型 0 屏'), `空需求卡片应显示「原型 0 屏」：${wall.slice(0, 300)}`)
    await shot('09-空需求')
    return { status: saved.status, prototypeFiles: 0, versions: 0 }
  })

  await runStep('10. 记录当前缺口（评审入口 / 工作量评估 / 发布指定端人）', async () => {
    const state = await readState()
    const saved = requirementOf(state, R_FULL.title)
    const hasWorkloadField = Object.keys(saved).some(key => /workload|estimate|estimation/i.test(key))
    const wall = await bodyText()
    writeJson('gaps.json', {
      reviewApiOnly: true,
      reviewUiEntry: false,
      workloadField: hasWorkloadField,
      publishPlatformScope: false,
      publishPeopleScope: false,
      note: '当前发布只能提交 + 评审 + 纳入范围；涉及端在创建需求时按产品身份默认，人员认领走 dev-claim / design-claim。',
    })
    assert(!hasWorkloadField, '需求模型里出现了工作量字段，测试预期需要更新')
    assert(!/工作量评估/.test(wall), '需求页出现了工作量评估入口，测试预期需要更新')
    return {
      reviewUiEntry: false,
      workloadField: false,
      publishPlatformScope: false,
      publishPeopleScope: false,
    }
  })

  await ensureIdentity('李四')
  await page.waitForTimeout(500)
  await connected.browser.close()
}

function buildReport({ ok, error, startedAt, finishedAt }) {
  const lines = []
  lines.push('# 在线教育全流程回归')
  lines.push('')
  lines.push(`- 结果：**${ok ? '通过' : '失败'}**`)
  lines.push(`- 开始：${startedAt}`)
  lines.push(`- 结束：${finishedAt}`)
  lines.push(`- 服务端：${cfg.server}`)
  lines.push(`- 桌面端 CDP：${cfg.cdp}`)
  lines.push(`- 证据：${path.relative(REPO, cfg.evidence)}`)
  lines.push('')
  lines.push('## 步骤')
  lines.push('')
  lines.push('| # | 步骤 | 结果 | 耗时 | 说明 |')
  lines.push('| --- | --- | --- | --- | --- |')
  steps.forEach((item, index) => {
    const detail = item.ok
      ? (item.detail == null ? '' : (typeof item.detail === 'string' ? item.detail : JSON.stringify(item.detail))).slice(0, 180)
      : String(item.error || '').split('\n')[0]
    lines.push(`| ${index + 1} | ${item.name} | ${item.ok ? '通过' : '失败'} | ${Math.round(item.ms / 1000)}s | ${detail.replaceAll('|', '/')} |`)
  })
  if (error) {
    lines.push('')
    lines.push('## 失败')
    lines.push('')
    lines.push('```')
    lines.push(String(error))
    lines.push('```')
  }
  lines.push('')
  lines.push('## 当前缺口')
  lines.push('')
  lines.push('- 需求评审：接口和 `/req-review` 技能可用，需求页没有评审入口。')
  lines.push('- 工作量评估：需求模型里没有字段，页面也没有入口。')
  lines.push('- 发布指定范围：不能指定端和人员；端在创建需求时按产品身份默认，人员靠认领。')
  lines.push('- 真实原型 / 设计稿生成不在此脚本内，见 `e2e/desktop-s13.mjs`。')
  lines.push('')
  return lines.join('\n')
}

const startedAt = new Date().toISOString()
let exitCode = 0
let failure = ''
try {
  await main()
} catch (error) {
  exitCode = 1
  failure = error instanceof Error ? (error.stack || error.message) : String(error)
  log('失败：', failure)
} finally {
  const finishedAt = new Date().toISOString()
  const report = buildReport({ ok: exitCode === 0, error: failure, startedAt, finishedAt })
  writeText('report.md', report)
  writeJson('report.json', { ok: exitCode === 0, startedAt, finishedAt, error: failure, steps, evidence: cfg.evidence })
  log(`报告：${path.join(cfg.evidence, 'report.md')}`)
}
process.exit(exitCode)
