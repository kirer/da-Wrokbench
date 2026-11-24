import { chromium } from 'playwright'

const url = process.argv[2]
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' })
const page = await context.newPage()
await page.goto(url)
await page.waitForTimeout(2500)

const entry = page.getByRole('button', { name: '研发工作台' }).first()
await entry.click()
await page.waitForTimeout(1200)
const login = page.getByRole('button', { name: /王五[\s\S]*进入/ }).first()
if (await login.isVisible().catch(() => false)) {
  await login.click()
  await page.waitForTimeout(1500)
}
const chip = page.locator('button.dsh-wb-userchip').first()
await chip.waitFor()
await chip.click()
await page.locator('.dsh-wb-dialog').waitFor()
await page.waitForTimeout(500)

const result = await page.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const s = getComputedStyle(el)
    const names = [
      '--dsw-alias-brand-primary',
      '--dsw-alias-button-primary-fill',
      '--dsw-alias-button-primary-hover',
      '--dsw-alias-label-on-color',
      '--dsw-alias-label-primary',
      '--dsw-alias-label-inverse',
      '--dsw-alias-label-on-brand',
    ]
    const vars = {}
    for (const name of names) vars[name] = s.getPropertyValue(name).trim()
    return {
      text: (el.innerText || '').trim().slice(0, 20),
      background: s.backgroundColor,
      color: s.color,
      border: s.borderColor,
      vars,
    }
  }
  const whiteButtons = [...document.querySelectorAll('button')]
    .map(el => ({ el, s: getComputedStyle(el) }))
    .filter(({ s, el }) => s.backgroundColor === 'rgb(255, 255, 255)' && (el.innerText || '').trim() !== '')
    .slice(0, 5)
    .map(({ el, s }) => ({ text: (el.innerText || '').trim().slice(0, 30), color: s.color, bg: s.backgroundColor, cls: el.className?.toString().slice(0, 60) }))
  return {
    chipOn: read('.dsh-wb-dialog .dsh-wb-auth-chip.is-on'),
    primary: read('.dsh-wb-dialog .dsh-wb-btn--primary'),
    whiteButtons,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
  }
})
console.log(JSON.stringify(result, null, 2))
await page.screenshot({ path: '../deploy/dsh-sim/screenshots/settings-dark.png', fullPage: false })
await browser.close()
