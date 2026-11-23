import { chromium } from 'playwright'
const url = process.argv[2]
const out = process.argv[3] || '/tmp/design-check'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE-ERROR', msg.text()) })
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(800) }
const row = page.locator('.user-row').filter({ hasText: '李四' }).first()
if (await row.isVisible().catch(() => false)) { await row.click(); await page.waitForTimeout(200) }
const login = page.getByRole('button', { name: /身份进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(2500) }
await page.screenshot({ path: `${out}-iterations.png`, fullPage: false })
console.log('iterations', (await page.locator('.dsh-wb-design').innerText().catch(()=>'NO ROOT')).replace(/\s+/g,' ').slice(0,800))
const firstRow = page.locator('.table tbody tr').first()
if (await firstRow.isVisible().catch(() => false)) {
  await firstRow.click(); await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}-detail.png`, fullPage: false })
  console.log('detail', (await page.locator('.dsh-wb-design').innerText().catch(()=>'NO ROOT')).replace(/\s+/g,' ').slice(0,800))
  const rc = page.locator('.rc-title').first()
  if (await rc.isVisible().catch(() => false)) {
    await rc.click(); await page.waitForTimeout(1200)
    await page.screenshot({ path: `${out}-requirement.png`, fullPage: false })
    console.log('requirement', (await page.locator('.dsh-wb-design').innerText().catch(()=>'NO ROOT')).replace(/\s+/g,' ').slice(0,800))
  }
}
const my = page.locator('.plugnac a').filter({ hasText: '我的工作台' }).first()
if (await my.isVisible().catch(() => false)) {
  await my.click(); await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}-my.png`, fullPage: false })
  console.log('my', (await page.locator('.dsh-wb-design').innerText().catch(()=>'NO ROOT')).replace(/\s+/g,' ').slice(0,800))
}
const nf = page.locator('.plugnac a').filter({ hasText: '通知' }).first()
if (await nf.isVisible().catch(() => false)) {
  await nf.click(); await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}-notifications.png`, fullPage: false })
  console.log('notif', (await page.locator('.dsh-wb-design').innerText().catch(()=>'NO ROOT')).replace(/\s+/g,' ').slice(0,800))
}
const skills = page.locator('.plugnac a').filter({ hasText: '技能库' }).first()
if (await skills.isVisible().catch(() => false)) {
  await skills.click(); await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}-skills.png`, fullPage: false })
  console.log('skills', (await page.locator('.dsh-wb-design').innerText().catch(()=>'NO ROOT')).replace(/\s+/g,' ').slice(0,900))
}
const settings = page.locator('.plugnac a').filter({ hasText: '设置' }).first()
if (await settings.isVisible().catch(() => false)) {
  await settings.click(); await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}-settings.png`, fullPage: false })
}
await browser.close()
