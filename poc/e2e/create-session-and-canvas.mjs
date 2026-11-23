import { chromium } from 'playwright'
const url = process.argv[2]
const name = process.argv[3] || '李四'
const tag = process.argv[4] || 'now'
const sessionType = process.argv[5] || '需求'
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
await page.waitForTimeout(700)
await page.getByRole('button', { name: '会员积分改版', exact: true }).first().click()
await page.waitForTimeout(700)
console.log('detail actions', (await page.locator('.dsh-wb-actions').innerText().catch(() => '')).replace(/\s+/g, ' '))
await page.getByRole('button', { name: '新建会话' }).first().click()
await page.waitForTimeout(500)
const dialog = page.locator('.dsh-wb-dialog')
console.log('dialog', (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 500))
const typeButton = page.getByRole('button', { name: `${sessionType}会话`, exact: true })
if (await typeButton.count()) await typeButton.first().click()
await page.getByRole('button', { name: '创建会话', exact: true }).click()
await page.waitForTimeout(5500)
console.log('body', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(-2200))
console.log('frames', page.frames().map(f => f.url()))
console.log('canvas', await page.locator('.dsh-wb-canvas-pane').count(), await page.locator('.dsh-wb-canvas-studio').count())
const frameTexts = []
for (const frame of page.frames()) {
  if (frame === page.mainFrame()) continue
  try { frameTexts.push({ url: frame.url(), text: (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) }) } catch {}
}
console.log('frameTexts', JSON.stringify(frameTexts))
await page.screenshot({ path: `/Users/kirer/projects/da-Workbench/poc/deploy/dsh-sim/screenshots/${tag}.png` })
await browser.close()
