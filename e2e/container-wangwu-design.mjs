import { chromium } from 'playwright'
const url = process.argv[2]
const tag = process.argv[3] || 'container-wangwu-design'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE-ERROR', msg.text()) })
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(800) }
const login = page.getByRole('button', { name: /王五[\s\S]*进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(2200) }
await page.getByRole('row', { name: /2026-S11/ }).first().click()
await page.waitForTimeout(900)
const card = page.locator('.dsh-wb-reqcard').filter({ hasText: '仿真 11/22 22:48' }).first()
const cardCount = await card.count()
console.log('cardCount', cardCount)
let designButton = card.getByRole('button', { name: /^设计/ }).first()
if (!(await designButton.isVisible().catch(() => false))) {
  await card.getByRole('button', { name: /订单列表筛选与空态优化/ }).first().click()
  await page.waitForTimeout(800)
  console.log('detail actions', (await page.locator('.dsh-wb-detail-actions').innerText().catch(() => '')).replace(/\s+/g, ' '))
  designButton = page.getByRole('button', { name: /^设计$/ }).first()
}
console.log('designButtonVisible', await designButton.isVisible().catch(() => false))
await designButton.click()
await page.waitForTimeout(6000)
console.log('tabs', (await page.locator('[role="tab"]').allInnerTexts().catch(() => [])).join(' | '))
console.log('selected', (await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => [])).join(' | '))
console.log('pane', (await page.locator('.dsh-wb-canvas-pane').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 700))
const frameTexts = []
for (const frame of page.frames()) {
  if (frame === page.mainFrame()) continue
  try { frameTexts.push({ url: frame.url(), text: (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 260) }) } catch {}
}
console.log('frames', JSON.stringify(frameTexts))
await page.screenshot({ path: `/Users/kirer/projects/da-Workbench/deploy/dsh-sim/screenshots/${tag}.png` })
await browser.close()
