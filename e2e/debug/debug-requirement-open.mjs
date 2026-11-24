import { chromium } from 'playwright'
const url = process.argv[2]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(800) }
const login = page.getByRole('button', { name: /李四[\s\S]*进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(2200) }
await page.getByRole('row', { name: /2026-S11/ }).first().click()
await page.waitForTimeout(700)
const titles = page.getByRole('button', { name: '会员积分改版', exact: true })
console.log('title count', await titles.count())
for (let i = 0; i < await titles.count(); i++) {
  console.log('title', i, await titles.nth(i).evaluate(el => el.outerHTML.slice(0, 300)))
}
await titles.first().click()
await page.waitForTimeout(1500)
console.log('body tail', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(-1000))
console.log('page head', await page.locator('.dsh-wb-page-head').count(), 'detail', await page.locator('.dsh-wb-detail').count())
await page.screenshot({ path: '/Users/kirer/projects/da-Workbench/deploy/dsh-sim/screenshots/debug-req-open.png' })
await browser.close()
