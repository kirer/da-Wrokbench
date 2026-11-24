import { chromium } from 'playwright'
const url = process.argv[2]
const tag = process.argv[3] || 'now'
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
await page.waitForTimeout(700)
await page.getByRole('button', { name: '会员积分改版', exact: true }).first().click()
await page.waitForTimeout(700)
console.log('page actions', (await page.locator('.dsh-wb-detail-actions').innerText().catch(() => '')).replace(/\s+/g, ' '))
await page.getByRole('button', { name: '进入会话', exact: true }).first().click()
await page.waitForTimeout(5500)
console.log('tabs', (await page.locator('[role="tab"]').allInnerTexts().catch(() => [])).join(' | '))
console.log('selected', (await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => [])).join(' | '))
console.log('body tail', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(-1200))
const frameTexts = []
for (const frame of page.frames()) {
  if (frame === page.mainFrame()) continue
  try { frameTexts.push({ url: frame.url(), text: (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 180) }) } catch {}
}
console.log('frameTexts', JSON.stringify(frameTexts))
await page.screenshot({ path: `/Users/kirer/projects/da-Workbench/deploy/dsh-sim/screenshots/${tag}.png` })
await browser.close()
