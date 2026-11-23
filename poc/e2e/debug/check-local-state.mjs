import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(() => false)) { await entry.click(); await page.waitForTimeout(800) }
const login = page.getByRole('button', { name: /李四[\s\S]*进入/ }).first()
if (await login.isVisible().catch(() => false)) { await login.click(); await page.waitForTimeout(2200) }
const result = await page.evaluate(async () => {
  const response = await fetch('/dsh-workbench/api/state', { cache: 'no-store' })
  return { status: response.status, body: await response.json() }
})
console.log('status', result.status, 'baseDir', result.body?.baseDir)
for (const req of result.body?.requirements ?? []) {
  if (req.code === 'S11-001') console.log(JSON.stringify({ code: req.code, folderPath: req.folderPath, designPath: req.designPath, prototypePath: req.prototypePath, design: (req.designFiles ?? []).map(f => f.relativePath), prototype: (req.prototypeFiles ?? []).map(f => f.relativePath), sessionId: req.sessionId }, null, 2))
}
await browser.close()
