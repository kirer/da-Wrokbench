#!/usr/bin/env node
/**
 * 层级导航回归：首页 › 2026-S13 › S13-001 › 原型。
 *
 * 覆盖：
 *   1. 迭代详情 / 需求总述 / 原型画布 三层的面包屑与祖先回跳；
 *   2. 需求页右侧会话坞常驻（没有头部、不能关），任何角色都在；
 *   3. 原型「打开」直接进画布：产品可编辑，其他角色同一画布只读；
 *   4. 「我的工作台」切回「首页」时恢复上次位置（含画布层）；
 *   5. DSH 侧栏收起后贴边时，顶栏让开 macOS 红绿灯（is-flush-left）。
 *
 * 前置：DSH 桌面端已开 9222，插件已安装；服务端在 127.0.0.1:3210。
 */
import { chromium } from 'playwright'

const SHOT = name => `/Users/kirer/projects/da-Workbench/e2e/screenshots/nav-${name}.png`
const pageErrors = []
const consoleErrors = []

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
if (!context) throw new Error('没有可用的桌面端上下文')
const page = context.pages().find(candidate => candidate.url().startsWith('dsh-app://'))
if (!page) throw new Error('没有找到 dsh-app:// 页面')
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
await page.bringToFront()

async function waitFor(fn, label, timeout = 25000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeout) {
    try {
      last = await fn()
      if (last) return last
    } catch (error) { last = error }
    await page.waitForTimeout(300)
  }
  throw new Error(`等待超时：${label}（最后结果：${last instanceof Error ? last.message : last}）`)
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

async function openWorkbench() {
  if (!(await page.locator('.plugnac-project-btn').isVisible().catch(() => false))) {
    const entry = page.getByRole('button', { name: '研发工作台', exact: true }).first()
    if (await entry.isVisible().catch(() => false)) {
      await entry.click().catch(() => {})
      await page.waitForTimeout(1500)
    }
  }
  if ((await page.locator('.user-row').count()) > 0) {
    const name = await page.evaluate(async () => {
      const token = window.localStorage.getItem('dshWorkbenchAuthToken') || ''
      if (!token) return '张三'
      const response = await fetch('/dsh-workbench/api/state', { headers: { authorization: `Bearer ${token}` } }).catch(() => null)
      return response?.ok ? (await response.json()).currentUser?.name ?? '张三' : '张三'
    })
    await page.locator('.user-row').filter({ hasText: name }).first().click()
    await page.getByRole('button', { name: `以「${name}」身份进入` }).click()
    await page.waitForTimeout(2500)
  }
  await page.locator('.plugnac-project-btn').waitFor({ state: 'visible', timeout: 30000 })
}

async function switchIdentity(name) {
  await openWorkbench()
  const state = await readState().catch(() => null)
  if (state?.currentUser?.name === name) return
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await waitFor(async () => (await page.locator('.user-row').count()) > 0, '退出后出现登录用户')
  await page.locator('.user-row').filter({ hasText: name }).first().click()
  await page.getByRole('button', { name: `以「${name}」身份进入` }).click()
  await waitFor(async () => (await page.locator('.user-row').count()) === 0, `${name} 登录提交`)
  await page.waitForTimeout(1500)
  await openWorkbench()
  const after = await readState()
  if (after.currentUser?.name !== name) throw new Error(`身份切换失败，当前是 ${after.currentUser?.name}`)
  console.log(`身份：${name}`)
}

const crumbState = () => page.evaluate(() => {
  const nav = document.querySelector('.topbar .dsh-wb-crumbs')
  if (!nav) return null
  return {
    steps: [...nav.querySelectorAll('.step')].map(el => el.innerText.trim()),
    cur: nav.querySelector('.cur')?.innerText.trim() ?? '',
    stage: Boolean(document.querySelector('.dsh-wb-stage')),
    dock: Boolean(document.querySelector('.dsh-wb-dock')),
    dockHead: Boolean(document.querySelector('.dsh-wb-dock-head')),
  }
})

async function clickCrumb(label) {
  const buttons = await page.locator('.dsh-wb-crumbs .step').all()
  for (const button of buttons) {
    if ((await button.innerText()).trim() === label) { await button.click(); return }
  }
  throw new Error(`没有可点的面包屑：${label}（现有：${(await crumbState())?.steps.join(' / ')}）`)
}

async function expectCrumb(expected, label) {
  const state = await waitFor(async () => {
    const current = await crumbState()
    if (current === null) return null
    const ok = current.cur === expected.cur
      && JSON.stringify(current.steps) === JSON.stringify(expected.steps)
    return ok ? current : null
  }, label)
  console.log(`${label}：${state.steps.join(' › ')} › ${state.cur}`)
  return state
}

async function openIterationDetail(code) {
  await page.locator('.table-wrap table tbody tr').filter({ hasText: code }).first().waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('.table-wrap table tbody tr').filter({ hasText: code }).first().click()
  await page.locator('.head-card').waitFor({ state: 'visible', timeout: 15000 })
}

async function backToList() {
  const home = page.locator('.dsh-wb-crumbs .step').filter({ hasText: /^首页$/ }).first()
  if (await home.isVisible().catch(() => false)) await home.click()
  await page.locator('.table-wrap table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })
}

async function openRequirementCard(code) {
  const card = page.locator('.req-card').filter({ hasText: code }).first()
  await card.waitFor({ state: 'visible', timeout: 15000 })
  await card.locator('.rc-title').click()
  await page.locator('.rf-head').waitFor({ state: 'visible', timeout: 15000 })
}

// 原型卡片的「打开」直接进画布（不是弹大图，也不是跳到别的页面）。
async function openPrototypeCanvas() {
  const link = page.locator('.shot3 .shot-link').first()
  await link.waitFor({ state: 'visible', timeout: 20000 })
  await link.click()
  await page.locator('.dsh-wb-stage').waitFor({ state: 'visible', timeout: 25000 })
}

const canvasState = () => page.evaluate(() => {
  const stage = document.querySelector('.dsh-wb-stage')
  if (!stage) return null
  const studio = stage.querySelector('.dsh-wb-canvas-studio')
  const display = selector => {
    const el = studio?.querySelector(selector)
    return el ? getComputedStyle(el).display : 'absent'
  }
  return {
    readonly: studio?.classList.contains('dsh-wb-canvas-readonly') ?? null,
    dockDisplay: display('.ddp-dock'),
    topRightDisplay: display('.ddp-top .tr'),
    actionDisplay: display('.ddp-act'),
    topText: (stage.querySelector('.ddp-top')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 90),
  }
})

const iterationCode = '2026-S13'

// 0. 重载页面拿到最新 client.js，回到首页。
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(1200)
await openWorkbench()
await switchIdentity('李四')
await backToList()
await expectCrumb({ steps: [], cur: '首页' }, '首页层级')

// 层级导航栏在所有页面固定在同一个纵向位置。
const contextTop = () => page.evaluate(() => Math.round(document.querySelector('.topbar .dsh-wb-crumbs').getBoundingClientRect().top))
const barTop = await contextTop()
const assertBarTop = async label => {
  const top = await waitFor(async () => {
    const now = await contextTop()
    return now === barTop ? now : null
  }, `${label}层级栏位置`)
  return top
}

const state = await readState()
const projectIterationIds = new Set((state.iterations ?? [])
  .filter(iteration => iteration.code === iterationCode)
  .map(iteration => iteration.id))
const hasPrototype = requirement => (requirement.prototypeFiles ?? []).length > 0
const target = (state.requirements ?? []).find(requirement =>
  projectIterationIds.has(requirement.iterationId)
  && hasPrototype(requirement)
  && requirement.sessionId
  && requirement.ownerId === state.currentUser.id)
  ?? (state.requirements ?? []).find(requirement =>
    projectIterationIds.has(requirement.iterationId)
    && hasPrototype(requirement)
    && requirement.sessionId)
if (!target) throw new Error(`迭代 ${iterationCode} 里没有带原型文件的需求，无法验证画布层`)
const isOwner = target.ownerId === state.currentUser.id
const isDesigner = Boolean(target.designerId) && target.designerId === state.currentUser.id
console.log(`身份：${state.currentUser.name}；画布用例需求：${target.code} ${target.title}（${isOwner ? '负责人' : '非负责人'}）`)

// 1. 迭代详情：首页 › 2026-S13
await openIterationDetail(iterationCode)
const iterationCrumbs = await expectCrumb({ steps: ['首页'], cur: iterationCode }, '迭代详情层级')
if (iterationCrumbs.dock || iterationCrumbs.stage) throw new Error('迭代详情不应有会话坞或画布')
await assertBarTop('迭代详情')
await page.screenshot({ path: SHOT('crumb-iteration') })

// 2. 根节点回扁平列表
await clickCrumb('首页')
await page.locator('.table-wrap table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })
await expectCrumb({ steps: [], cur: '首页' }, '根节点回列表')
await assertBarTop('首页')
console.log('面包屑根节点 → 首页 OK')

// 3. 点需求卡停在需求总述：右侧会话坞常驻，但不进画布
await openIterationDetail(iterationCode)
await openRequirementCard(target.code)
await page.waitForTimeout(800)
if (await page.locator('.dsh-wb-stage').count() > 0) throw new Error('点需求卡不应直接进画布')
const overviewCrumbs = await expectCrumb({ steps: ['首页', iterationCode], cur: target.code }, '需求总述层级')
if (!overviewCrumbs.dock) throw new Error('需求总述右侧会话坞应该常驻')
if (overviewCrumbs.dockHead) throw new Error('会话坞不应该再有头部')
await assertBarTop('需求总述')
// 参与者卡片墙：产品/设计/测试各一张卡，卡底是各自的工作面入口。
const wallRoles = await page.evaluate(() => [...document.querySelectorAll('.cardwall .pcard .prole')]
  .map(el => el.innerText.trim()))
for (const role of ['产品', '设计', '测试']) {
  if (!wallRoles.some(text => text.startsWith(role))) throw new Error(`卡片墙缺少「${role}」卡（现有：${wallRoles.join(' / ')}）`)
}
console.log('参与者卡片：', wallRoles.join(' / '))
await page.screenshot({ path: SHOT('crumb-overview') })

// 3b. 设计卡的工作面：产品/其他角色看设计画布只读，设计负责人可编辑。
const designButton = page.getByRole('button', { name: '打开设计画布' })
if (await designButton.count() > 0 && !(await designButton.isDisabled())) {
  await designButton.click()
  await page.locator('.dsh-wb-stage').waitFor({ state: 'visible', timeout: 25000 })
  await expectCrumb({ steps: ['首页', iterationCode, target.code], cur: '设计' }, '设计画布层级')
  const designCanvas = await canvasState()
  if (designCanvas.readonly !== !isDesigner) {
    throw new Error(`设计画布只读状态不对：readonly=${designCanvas.readonly}，设计负责人=${isDesigner}`)
  }
  await clickCrumb(target.code)
  await waitFor(async () => (await crumbState())?.stage === false, '退出设计画布')
} else {
  console.log('设计画布未启用（还没有设计会话/设计稿），跳过')
}

// 4. 原型「打开」→ 同一张画布；产品可编辑
await openPrototypeCanvas()
const canvasCrumbs = await expectCrumb({
  steps: ['首页', iterationCode, target.code],
  cur: '原型',
}, '原型画布层级')
if (!canvasCrumbs.dock) throw new Error('画布层里会话坞应该还在')
await assertBarTop('原型画布')
// 画布工具栏自己的「返回」已经去掉，回上层统一走顶栏下的层级导航。
await page.locator('.dsh-wb-stage .ddp-top').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => {})
const canvasToolbar = await page.evaluate(() =>
  (document.querySelector('.dsh-wb-stage .ddp-top')?.innerText ?? '').replace(/\s+/g, ' ').trim())
if (/返回/.test(canvasToolbar)) throw new Error(`画布工具栏不该再有返回按钮：${canvasToolbar}`)
const editableCanvas = await canvasState()
if (isOwner) {
  if (editableCanvas.readonly !== false) throw new Error('产品（负责人）打开原型应为可编辑画布')
  if (editableCanvas.dockDisplay === 'none') throw new Error('可编辑画布不应收起底部工具坞')
} else if (editableCanvas.readonly !== true) {
  throw new Error('非负责人打开原型应为只读画布')
}
await page.screenshot({ path: SHOT('canvas') })

// 5. 画布 → 需求总述：画布收起，会话坞还在
await clickCrumb(target.code)
await waitFor(async () => (await crumbState())?.stage === false, '退出画布')
const backToOverview = await expectCrumb({ steps: ['首页', iterationCode], cur: target.code }, '画布回需求总述')
if (!backToOverview.dock) throw new Error('回到需求总述后会话坞应该还在')
await page.locator('.rf-head').waitFor({ state: 'visible', timeout: 15000 })

// 6. 需求总述 → 迭代详情
await clickCrumb(iterationCode)
await page.locator('.head-card').waitFor({ state: 'visible', timeout: 15000 })
await expectCrumb({ steps: ['首页'], cur: iterationCode }, '需求总述回迭代')

// 7. 首页入口：需求总述 → 首页 → 我的工作台 → 首页
await openRequirementCard(target.code)
await backToList()
await page.locator('.home-link').filter({ hasText: '我的工作台' }).click()
await page.waitForTimeout(800)
await expectCrumb({ steps: ['首页'], cur: '我的工作台' }, '我的工作台层级')
await page.getByRole('button', { name: '首页', exact: true }).click()
await page.locator('.table-wrap table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })
await expectCrumb({ steps: [], cur: '首页' }, '需求总述回首页')

// 8. 首页入口：画布层 → 首页 → 我的工作台 → 首页
await openPrototypeCanvas()
await backToList()
await page.locator('.home-link').filter({ hasText: '我的工作台' }).click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: '首页', exact: true }).click()
await page.locator('.table-wrap table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })
await expectCrumb({ steps: [], cur: '首页' }, '画布回首页')
console.log('画布 → 首页 → 我的工作台 → 首页 OK')

// 9. 回列表，测红绿灯与宿主按钮让位
await clickCrumb('首页')
await page.locator('.table-wrap table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })

const measureShell = () => page.evaluate(() => {
  const root = document.querySelector('.dsh-wb-design')
  const topbar = document.querySelector('.dsh-wb-design .topbar')
  return {
    left: root ? Math.round(root.getBoundingClientRect().left) : null,
    flush: root?.classList.contains('is-flush-left') ?? false,
    paddingLeft: topbar ? getComputedStyle(topbar).paddingLeft : null,
    background: topbar ? getComputedStyle(topbar).backgroundColor : null,
  }
})

const before = await measureShell()
console.log('侧栏展开：', JSON.stringify(before))
if (before.flush) throw new Error('侧栏展开时不应让位红绿灯')
if (before.paddingLeft !== '20px') throw new Error(`侧栏展开时顶栏左边距应为 20px，实际 ${before.paddingLeft}`)

const collapsed = await page.evaluate(() => {
  const button = [...document.querySelectorAll('button[aria-label]')]
    .find(el => /收起侧边栏/.test(el.getAttribute('aria-label') ?? ''))
  if (!button) return false
  button.click()
  return true
})
if (!collapsed) throw new Error('没有找到「收起侧边栏」按钮')
const flush = await waitFor(async () => {
  const now = await measureShell()
  return now.flush ? now : null
}, '侧栏收起后顶栏让位红绿灯')
if (flush.paddingLeft !== '180px') throw new Error(`贴边时顶栏左边距应为 180px，实际 ${flush.paddingLeft}`)
if (!(flush.left < 40)) throw new Error(`贴边时插件左边界应接近 0，实际 ${flush.left}`)
console.log('侧栏收起：', JSON.stringify(flush))
await page.screenshot({ path: SHOT('flush-left') })

// 宿主贴边后露出的「打开侧边栏 / 新建会话」必须看得见也点得到。
const hostButtons = await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')]
  .filter(el => /打开侧边栏|新建会话/.test(el.getAttribute('aria-label') ?? ''))
  .map(el => {
    const rect = el.getBoundingClientRect()
    return { aria: el.getAttribute('aria-label'), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
  })
  .filter(item => item.w > 0 && item.x >= 0))
const expandButton = hostButtons.find(item => item.aria === '打开侧边栏')
if (!expandButton) throw new Error('侧栏收起后没有可见的「打开侧边栏」按钮')
const hit = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y)
  return el?.closest('button')?.getAttribute('aria-label') ?? `${el?.tagName}.${String(el?.className).slice(0, 40)}`
}, { x: Math.round(expandButton.x + expandButton.w / 2), y: Math.round(expandButton.y + expandButton.h / 2) })
if (hit !== '打开侧边栏') throw new Error(`展开按钮被顶栏挡住，点击位置命中 ${hit}`)
console.log('宿主按钮：', JSON.stringify(hostButtons))

// 真点一下（不是脚本里 click()），确认宿主按钮可用。
await page.mouse.click(expandButton.x + expandButton.w / 2, expandButton.y + expandButton.h / 2)
await waitFor(async () => {
  const now = await measureShell()
  return !now.flush && now.paddingLeft === '20px' ? now : null
}, '点宿主展开按钮后恢复顶栏边距')
console.log('点宿主「打开侧边栏」恢复侧栏 OK')

// 10. 换成非负责人（设计）：原型「打开」还是同一张画布，但只读。
await switchIdentity('王五')
await backToList()
await openIterationDetail(iterationCode)
await openRequirementCard(target.code)
const outsiderOverview = await crumbState()
if (!outsiderOverview.dock) throw new Error('非负责人进需求总述，会话坞也应该常驻')
await openPrototypeCanvas()
const readonlyCrumbs = await expectCrumb({ steps: ['首页', iterationCode, target.code], cur: '原型' }, '非负责人画布层级')
if (!readonlyCrumbs.dock) throw new Error('非负责人画布层会话坞应该还在')
const readonlyCanvas = await canvasState()
if (readonlyCanvas.readonly !== true) throw new Error('非负责人打开原型应为只读画布')
for (const [key, value] of Object.entries({
  底部工具坞: readonlyCanvas.dockDisplay,
  右上外观导出: readonlyCanvas.topRightDisplay,
  屏头操作: readonlyCanvas.actionDisplay,
})) {
  if (value !== 'none' && value !== 'absent') throw new Error(`只读画布不应显示${key}（display=${value}）`)
}
console.log('只读画布工具栏：', JSON.stringify(readonlyCanvas))
await page.screenshot({ path: SHOT('canvas-readonly') })
await switchIdentity('李四')

if (pageErrors.length > 0) throw new Error(`页面异常：${pageErrors.join(' | ')}`)
if (consoleErrors.length > 0) console.log('console error（可能来自宿主）:', consoleErrors.slice(0, 5))
console.log('OK 面包屑、位置记忆、原型画布与红绿灯让位验证通过')
await browser.close()
