import { chromium } from 'playwright'

// 不在仓库里保存 DSH 访问令牌：令牌等同登录态，提交后必须轮换。
// 用法：
//   DSH_URL_LISI='http://127.0.0.1:3301/?token=…' \
//   DSH_URL_WANGWU='http://127.0.0.1:3303/?token=…' \
//   node e2e/check-cookie-isolation.mjs
const LISI = process.env.DSH_URL_LISI ?? ''
const WANGWU = process.env.DSH_URL_WANGWU ?? ''
if (!LISI || !WANGWU) {
  console.error('缺少 DSH_URL_LISI / DSH_URL_WANGWU；不要把手动登录的 token URL 写进仓库。')
  process.exit(2)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' })

async function openWorkbench(url, identity) {
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
  const login = page.getByRole('button', { name: new RegExp(`${identity}[\\s\\S]*进入`) }).first()
  if (await login.isVisible().catch(() => false)) {
    await login.click()
    await page.waitForTimeout(1200)
  }
  await page.locator('button.dsh-wb-userchip').waitFor()
  return page
}

const lisiPage = await openWorkbench(LISI, '李四')
const lisiBefore = (await lisiPage.locator('button.dsh-wb-userchip').first().innerText()).replace(/\s+/g, ' ')
const wangwuPage = await openWorkbench(WANGWU, '王五')
const wangwuText = (await wangwuPage.locator('button.dsh-wb-userchip').first().innerText()).replace(/\s+/g, ' ')
await lisiPage.reload()
await lisiPage.waitForTimeout(1800)
const entry = lisiPage.getByRole('button', { name: '研发工作台' }).first()
if (await entry.isVisible().catch(() => false)) await entry.click()
await lisiPage.waitForTimeout(800)
const lisiAfter = (await lisiPage.locator('button.dsh-wb-userchip').first().innerText()).replace(/\s+/g, ' ')

console.log(JSON.stringify({ lisiBefore, wangwuText, lisiAfter, isolated: lisiAfter.includes('李四') && wangwuText.includes('王五') }, null, 2))
await browser.close()
