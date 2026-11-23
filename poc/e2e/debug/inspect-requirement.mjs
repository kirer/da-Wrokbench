import { chromium } from 'playwright'

const url = process.argv[2]
const code = process.argv[3] || 'S11-019'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' })
const page = await context.newPage()
await page.goto(url)
await page.waitForTimeout(2500)

const entry = page.getByRole('button', { name: '研发工作台' }).first()
await entry.click()
await page.waitForTimeout(1000)
const profile = page.locator('button.dsh-wb-userchip').first()
if (await profile.isVisible().catch(() => false)) {
  await profile.click()
  const logout = page.getByRole('button', { name: '退出登录' })
  if (await logout.isVisible().catch(() => false)) {
    await logout.click()
    await page.waitForTimeout(600)
  }
}
const login = page.getByRole('button', { name: /王五[\s\S]*进入/ }).first()
if (await login.isVisible().catch(() => false)) {
  await login.click()
  await page.waitForTimeout(1200)
}

const row = page.locator('button.dsh-wb-row').filter({ hasText: code }).first()
await row.waitFor()
await row.click()
await page.waitForTimeout(1000)
const detail = await page.locator('.dsh-wb-detail').innerText()
console.log('--- detail ---')
console.log(detail.slice(0, 4000))
await page.screenshot({ path: `../deploy/dsh-sim/screenshots/${code}-detail.png`, fullPage: true })

const designButton = page.getByRole('button', { name: '打开需求与设计' }).first()
if (await designButton.isVisible().catch(() => false)) {
  await designButton.click()
  await page.waitForTimeout(2500)
  const text = await page.locator('body').innerText()
  console.log('--- after design open ---')
  console.log(text.slice(0, 3000))
  await page.screenshot({ path: `../deploy/dsh-sim/screenshots/${code}-design.png`, fullPage: false })
}
await browser.close()
