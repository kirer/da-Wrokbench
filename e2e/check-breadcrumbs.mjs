#!/usr/bin/env node
/**
 * 层级导航回归：迭代列表 › 2026-S13 › S13-001 › 会话 › 画布。
 *
 * 覆盖：
 *   1. 迭代详情 / 需求总览 / 会话 / 画布 四层的面包屑与祖先回跳；
 *   2. 「我的工作台」切回「迭代列表」时恢复上次位置（含画布层）；
 *   3. DSH 侧栏收起后贴边时，顶栏让开 macOS 红绿灯（is-flush-left）。
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

const crumbState = () => page.evaluate(() => {
  const nav = document.querySelector('.dsh-wb-contextbar .dsh-wb-crumbs')
  if (!nav) return null
  return {
    steps: [...nav.querySelectorAll('.step')].map(el => el.innerText.trim()),
    cur: nav.querySelector('.cur')?.innerText.trim() ?? '',
    stage: Boolean(document.querySelector('.dsh-wb-stage')),
    dock: Boolean(document.querySelector('.dsh-wb-dock')),
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
  await page.getByRole('link', { name: '迭代列表', exact: true }).click()
  await page.locator('.table-wrap table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })
}

async function openRequirementCard(code) {
  const card = page.locator('.req-card').filter({ hasText: code }).first()
  await card.waitFor({ state: 'visible', timeout: 15000 })
  await card.locator('.rc-title').click()
}

const iterationCode = '2026-S13'

// 0. 重载页面拿到最新 client.js，回到迭代列表。
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(1200)
await openWorkbench()
await backToList()
await expectCrumb({ steps: [], cur: '迭代列表' }, '迭代列表层级')

// 层级导航栏在所有页面固定在同一个纵向位置。
const contextTop = () => page.evaluate(() => Math.round(document.querySelector('.dsh-wb-contextbar').getBoundingClientRect().top))
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
const target = (state.requirements ?? []).find(requirement =>
  projectIterationIds.has(requirement.iterationId)
  && (requirement.sessions ?? []).some(session => session.own === true && session.sessionId))
if (!target) throw new Error(`迭代 ${iterationCode} 里没有当前用户的会话，无法验证画布层`)
console.log(`身份：${state.currentUser.name}；画布用例需求：${target.code} ${target.title}`)

// 1. 迭代详情：迭代列表 › 2026-S13
await openIterationDetail(iterationCode)
const iterationCrumbs = await expectCrumb({ steps: ['迭代列表'], cur: iterationCode }, '迭代详情层级')
if (iterationCrumbs.dock || iterationCrumbs.stage) throw new Error('迭代详情不应有会话坞或画布')
await assertBarTop('迭代详情')
await page.screenshot({ path: SHOT('crumb-iteration') })

// 2. 根节点回扁平列表
await clickCrumb('迭代列表')
await page.locator('.table-wrap table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })
await expectCrumb({ steps: [], cur: '迭代列表' }, '根节点回列表')
await assertBarTop('迭代列表')
console.log('面包屑根节点 → 迭代列表 OK')

// 3. 点需求卡先停在需求总述，不直接进会话/画布
await openIterationDetail(iterationCode)
await openRequirementCard(target.code)
await page.locator('.rf-head').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(800)
if (await page.locator('.dsh-wb-stage').count() > 0) throw new Error('点需求卡不应直接进画布')
const overviewCrumbs = await expectCrumb({ steps: ['迭代列表', iterationCode], cur: target.code }, '需求总述层级')
if (overviewCrumbs.dock) throw new Error('点需求卡应停在需求总述，不自动打开会话坞')
await assertBarTop('需求总述')
await page.screenshot({ path: SHOT('crumb-overview') })

// 4. 需求总述 → 画布
await page.getByRole('button', { name: '进入画布' }).click()
await page.locator('.dsh-wb-stage').waitFor({ state: 'visible', timeout: 25000 })
const canvasCrumbs = await expectCrumb({
  steps: ['迭代列表', iterationCode, target.code, '会话'],
  cur: '画布',
}, '画布层级')
if (!canvasCrumbs.dock) throw new Error('画布层里会话坞应该还开着')
await assertBarTop('画布')
// 画布工具栏自己的「返回」已经去掉，回上层统一走顶栏下的层级导航。
await page.locator('.dsh-wb-stage .ddp-top').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => {})
const canvasToolbar = await page.evaluate(() =>
  (document.querySelector('.dsh-wb-stage .ddp-top')?.innerText ?? '').replace(/\s+/g, ' ').trim())
if (/返回/.test(canvasToolbar)) throw new Error(`画布工具栏不该再有返回按钮：${canvasToolbar}`)
await page.screenshot({ path: SHOT('crumb-canvas') })

// 5. 画布 → 会话：画布收起，需求总览 + 会话坞
await clickCrumb('会话')
await waitFor(async () => (await crumbState())?.stage === false, '退出画布')
const sessionCrumbs = await expectCrumb({
  steps: ['迭代列表', iterationCode, target.code],
  cur: '会话',
}, '会话层级')
if (!sessionCrumbs.dock) throw new Error('会话层里会话坞应该开着')
await page.locator('.rf-head').waitFor({ state: 'visible', timeout: 15000 })
await page.screenshot({ path: SHOT('crumb-session') })

// 6. 会话 → 需求总述：会话坞收起
await clickCrumb(target.code)
await waitFor(async () => (await crumbState())?.dock === false, '收起会话坞')
const backToOverview = await expectCrumb({ steps: ['迭代列表', iterationCode], cur: target.code }, '会话回需求总述')
if (backToOverview.stage) throw new Error('需求总述不应有画布')

// 7. 需求总述 → 迭代详情
await clickCrumb(iterationCode)
await page.locator('.head-card').waitFor({ state: 'visible', timeout: 15000 })
await expectCrumb({ steps: ['迭代列表'], cur: iterationCode }, '需求总述回迭代')

// 8. 位置记忆：需求总述 → 我的工作台 → 迭代列表，回到需求总述
await openRequirementCard(target.code)
await page.locator('.rf-head').waitFor({ state: 'visible', timeout: 15000 })
await page.getByRole('link', { name: '我的工作台' }).click()
await page.waitForTimeout(800)
await expectCrumb({ steps: [], cur: '我的工作台' }, '我的工作台层级')
await page.getByRole('link', { name: '迭代列表', exact: true }).click()
await page.locator('.rf-head').waitFor({ state: 'visible', timeout: 10000 })
await expectCrumb({ steps: ['迭代列表', iterationCode], cur: target.code }, '位置记忆（需求总述）')

// 9. 位置记忆：画布层 → 我的工作台 → 迭代列表，直接回画布
await page.getByRole('button', { name: '进入画布' }).click()
await page.locator('.dsh-wb-stage').waitFor({ state: 'visible', timeout: 25000 })
await page.getByRole('link', { name: '我的工作台' }).click()
await page.waitForTimeout(800)
await page.getByRole('link', { name: '迭代列表', exact: true }).click()
await page.locator('.dsh-wb-stage').waitFor({ state: 'visible', timeout: 20000 })
await expectCrumb({ steps: ['迭代列表', iterationCode, target.code, '会话'], cur: '画布' }, '位置记忆（画布）')
console.log('我的工作台 → 迭代列表 恢复画布位置 OK')

// 10. 回列表，测红绿灯与宿主按钮让位
await clickCrumb('迭代列表')
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

if (pageErrors.length > 0) throw new Error(`页面异常：${pageErrors.join(' | ')}`)
if (consoleErrors.length > 0) console.log('console error（可能来自宿主）:', consoleErrors.slice(0, 5))
console.log('OK 面包屑、位置记忆与红绿灯让位验证通过')
await browser.close()
