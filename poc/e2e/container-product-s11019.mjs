import { chromium } from 'playwright'
const url = process.argv[2]
const tag = process.argv[3] || 'now'
const title = '订单列表筛选与空态优化（仿真 11/22 22:48）'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE-ERROR', msg.text()) })
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(800) }
const login = page.getByRole('button', { name: /李四[\s\S]*进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(2200) }
await page.getByRole('row', { name: /2026-S11/ }).first().click()
await page.waitForTimeout(700)
const cardTitle = page.getByRole('button', { name: title, exact: true }).first()
console.log('card count', await cardTitle.count())
await cardTitle.click()
await page.waitForTimeout(700)
console.log('actions', (await page.locator('.dsh-wb-detail-actions').innerText().catch(() => '')).replace(/\s+/g, ' '))
await page.getByRole('button', { name: '进入会话', exact: true }).first().click()
await page.waitForTimeout(5500)
console.log('pane', (await page.locator('.dsh-wb-canvas-pane').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500))
const frameTexts = []
for (const frame of page.frames()) {
  if (frame === page.mainFrame()) continue
  try { frameTexts.push({ url: frame.url(), text: (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220) }) } catch {}
}
console.log('frames', JSON.stringify(frameTexts))
await page.screenshot({ path: `/Users/kirer/projects/da-Workbench/poc/deploy/dsh-sim/screenshots/${tag}.png` })
await browser.close()
