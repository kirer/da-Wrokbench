import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGE-ERROR', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERROR', m.text()) })
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(700) }
const login = page.getByRole('button', { name: /李四[\s\S]*进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(2200) }
await page.getByRole('row', { name: /2026-S11/ }).first().click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: '订单列表筛选与空态优化（仿真 11/22 22:48）', exact: true }).first().click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: '进入会话', exact: true }).first().click()
await page.waitForTimeout(5000)
const d = page.getByRole('button', { name: /^设计交付 \d+$/ }).first()
console.log('delivery', await d.innerText(), await d.count())
await d.click()
await page.waitForTimeout(4500)
console.log('tabs', (await page.locator('[role="tab"]').allInnerTexts().catch(() => [])).join(' | '))
console.log('gallery', (await page.locator('.dsh-wb-gallery-body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 700))
const frames = []
for (const f of page.frames()) { if (f !== page.mainFrame()) frames.push({ url: f.url(), text: (await f.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160) }) }
console.log('frames', JSON.stringify(frames))
await page.screenshot({ path: '/Users/kirer/projects/da-Workbench/poc/deploy/dsh-sim/screenshots/container-lisi-delivery.png' })
await browser.close()
