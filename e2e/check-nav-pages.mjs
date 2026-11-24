import { chromium } from 'playwright'
const url = process.argv[2]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE-ERROR', msg.text()) })
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(800) }
const login = page.getByRole('button', { name: /李四[\s\S]*进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(2200) }
await page.getByRole('button', { name: '我的工作台', exact: true }).click()
await page.waitForTimeout(900)
console.log('my', (await page.locator('.dsh-wb-content').innerText()).replace(/\s+/g, ' ').slice(0, 700))
await page.screenshot({ path: '/Users/kirer/projects/da-Workbench/deploy/dsh-sim/screenshots/lisi-my-workbench.png' })
await page.getByRole('button', { name: /^通知/ }).first().click()
await page.waitForTimeout(900)
console.log('notifications', (await page.locator('.dsh-wb-content').innerText()).replace(/\s+/g, ' ').slice(0, 600))
await page.screenshot({ path: '/Users/kirer/projects/da-Workbench/deploy/dsh-sim/screenshots/lisi-notifications.png' })
await browser.close()
