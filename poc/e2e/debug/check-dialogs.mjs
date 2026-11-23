import { chromium } from 'playwright'
const url = process.argv[2]
const out = process.argv[3] || '/tmp/dialog'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('pageerror', err => console.log('PAGE-ERROR', err.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(700) }
const row = page.locator('.user-row').filter({ hasText: '张三' }).first()
if (await row.isVisible().catch(() => false)) { await row.click(); await page.waitForTimeout(150) }
const login = page.getByRole('button', { name: /身份进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(1800) }
const shot = async (name) => { await page.screenshot({ path: `${out}-${name}.png` }); console.log(name, await page.getByRole('dialog').innerText().then(t=>t.replace(/\s+/g,' ').slice(0,300)).catch(()=>'NO DIALOG')) }
const click = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.isVisible().catch(()=>false)) { await b.click(); await page.waitForTimeout(500); return true } return false }
if (await click('新建迭代')) { await shot('iteration'); await page.getByRole('dialog').getByRole('button',{name:'取消'}).click(); await page.waitForTimeout(300) }
const nav = page.locator('.plugnac a').filter({ hasText: '迭代列表' }).first()
if (await nav.isVisible().catch(()=>false)) { await nav.click(); await page.waitForTimeout(500) }
const iter = page.locator('.table tbody tr').filter({ hasText: '2026-S11' }).first()
if (await iter.isVisible().catch(()=>false)) { await iter.click(); await page.waitForTimeout(700)
  if (await click('新建需求')) { await shot('requirement'); await page.getByRole('dialog').getByRole('button',{name:'取消'}).click(); await page.waitForTimeout(300) }
  const rc = page.locator('.rc-title').first()
  if (await rc.isVisible().catch(()=>false)) { await rc.click(); await page.waitForTimeout(700)
    if (await click('新建会话')) { await shot('session'); await page.getByRole('dialog').getByRole('button',{name:'取消'}).click(); await page.waitForTimeout(300) }
  }
}
await page.locator('.plugnac a').filter({ hasText: '设置' }).click(); await page.waitForTimeout(700)
if (await click('用户与权限')) { await shot('admin'); await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
if (await click('管理平台配置')) { await shot('platform') }
await browser.close()
