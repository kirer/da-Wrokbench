import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()
page.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()) })
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const entry = page.getByRole('button', { name: /研发工作台/ }).first()
if (await entry.isVisible().catch(()=>false)) { await entry.click(); await page.waitForTimeout(1000) }
console.log('login-visible', await page.getByRole('button', { name: /王五[\s\S]*进入/ }).first().isVisible().catch(()=>false))
const login = page.getByRole('button', { name: /王五[\s\S]*进入/ }).first()
if (await login.isVisible().catch(()=>false)) { await login.click(); await page.waitForTimeout(2500) }
const state = await page.evaluate(async () => { const r = await fetch('/dsh-workbench/api/state', { cache: 'no-store' }); return { status: r.status, body: await r.json().catch(() => null) } })
console.log('stateStatus', state.status, 'user', state.body?.user?.id, state.body?.user?.name)
for (const req of state.body?.requirements ?? []) {
  if (String(req.code).startsWith('S11-01')) console.log('REQ', req.code, req.title, 'folder', req.folderPath, 'design', (req.designFiles||[]).map(f=>f.relativePath), 'proto', (req.prototypeFiles||[]).map(f=>f.relativePath), 'session', req.sessionId, 'sessions', (req.sessions||[]).map(s=>[s.id,s.type,s.local,s.sessionId]))
}
await browser.close()
