import { chromium } from 'playwright'
const url = process.argv[2]
const name = process.argv[3] || '李四'
const tag = process.argv[4] || 'now'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(()=>false)) { await entry.click(); await page.waitForTimeout(1000) }
const login = page.getByRole('button', { name: new RegExp(`${name}[\\s\\S]*进入`) }).first()
if (await login.isVisible().catch(()=>false)) { await login.click(); await page.waitForTimeout(2200) }
console.log('after body', (await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,1400))
await page.screenshot({ path: `/Users/kirer/projects/da-Workbench/deploy/dsh-sim/screenshots/${tag}.png` })
await browser.close()
