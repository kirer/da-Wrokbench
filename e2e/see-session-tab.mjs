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
await page.waitForTimeout(900)
const sessionButtons = page.getByRole('button', { name: '会话', exact: true })
console.log('session buttons', await sessionButtons.count())
if (await sessionButtons.count()) { await sessionButtons.first().click(); await page.waitForTimeout(3000) }
console.log('body', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 2200))
console.log('iframes', page.frames().map(f => f.url()))
await page.screenshot({ path: `/Users/kirer/projects/da-Workbench/deploy/dsh-sim/screenshots/${tag}.png` })
await browser.close()
