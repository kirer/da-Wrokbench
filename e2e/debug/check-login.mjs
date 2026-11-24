import { chromium } from 'playwright'
const url = process.argv[2]
const out = process.argv[3] || '/tmp/design-login-check'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE-ERROR', msg.text()) })
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(800) }
await page.screenshot({ path: `${out}.png` })
console.log((await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,700))
await browser.close()
