import { chromium } from 'playwright'
const url = process.argv[2]
const out = process.argv[3] || '/tmp/onboarding-check'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE-ERROR', msg.text()) })
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.route('**/dsh-workbench/api/auth/session', async route => {
  const response = await route.fetch()
  const body = await response.json().catch(() => null)
  if (body && body.user) {
    body.user.onboarding = { ...(body.user.onboarding || {}), completedAt: null, completed: false }
  }
  await route.fulfill({ response, json: body })
})
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2400)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(700) }
const row = page.locator('.user-row').filter({ hasText: '李四' }).first()
if (await row.isVisible().catch(() => false)) { await row.click(); await page.waitForTimeout(150) }
const login = page.getByRole('button', { name: /身份进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(1600) }
await page.screenshot({ path: `${out}-1.png`, fullPage: false })
console.log('step1', (await page.locator('.dsh-wb-design').innerText().catch(()=>'NO ROOT')).replace(/\s+/g,' ').slice(0,700))
for (const [n, label] of [[2, '下一步'], [3, '下一步']]) {
  const btn = page.getByRole('button', { name: label }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click(); await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}-${n}.png`, fullPage: false })
    console.log(`step${n}`, (await page.locator('.dsh-wb-design').innerText().catch(()=>'NO ROOT')).replace(/\s+/g,' ').slice(0,700))
  } else { console.log('no next button at', n) }
}
await browser.close()
