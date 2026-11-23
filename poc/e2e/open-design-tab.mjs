import { chromium } from 'playwright'
const url = process.argv[2]
const name = process.argv[3] || '李四'
const tag = process.argv[4] || 'now'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE-ERROR', msg.text()) })
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(800) }
const login = page.getByRole('button', { name: new RegExp(`${name}[\\s\\S]*进入`) }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(2200) }
await page.getByRole('row', { name: /2026-S11/ }).first().click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: '会员积分改版', exact: true }).first().click()
await page.waitForTimeout(700)
console.log('page actions', (await page.locator('.dsh-wb-detail-actions').innerText().catch(() => '')).replace(/\s+/g, ' '))
const enter = page.getByRole('button', { name: '进入会话', exact: true })
if (await enter.count()) await enter.first().click()
else await page.getByRole('button', { name: '打开需求侧栏', exact: true }).first().click()
await page.waitForTimeout(3500)
console.log('requirement tab', (await page.locator('.dsh-wb-canvas-pane').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500))
await page.screenshot({ path: `/Users/kirer/projects/da-Workbench/poc/deploy/dsh-sim/screenshots/${tag}-requirement.png` })
const designButton = page.getByRole('button', { name: /^设计交付 \d+$/ }).first()
console.log('design button count', await designButton.count())
if (await designButton.count()) { await designButton.click(); await page.waitForTimeout(4000) }
console.log('body tail', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(-1400))
console.log('frames', page.frames().map(f => f.url()))
const frameTexts = []
for (const frame of page.frames()) {
  if (frame === page.mainFrame()) continue
  try { frameTexts.push({ url: frame.url(), text: (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 240) }) } catch {}
}
console.log('frameTexts', JSON.stringify(frameTexts))
console.log('design pane', await page.locator('.dsh-wb-canvas-pane').count(), 'tabs', (await page.locator('[role="tab"]').allInnerTexts().catch(() => [])).join(' | '))
await page.screenshot({ path: `/Users/kirer/projects/da-Workbench/poc/deploy/dsh-sim/screenshots/${tag}-design.png` })
await browser.close()
