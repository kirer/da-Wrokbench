import { chromium } from 'playwright'

const url = process.argv[2]
const identity = process.argv[3] || '李四'
const tag = process.argv[4] || 'lisi'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' })
const page = await context.newPage()
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

await page.goto(url)
await page.waitForTimeout(2600)
await page.getByRole('button', { name: '研发工作台' }).first().click()
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
  await page.waitForTimeout(1400)
}

const row = page.locator('button.dsh-wb-row').filter({ hasText: 'S11-019' }).first()
await row.waitFor()
await row.click()
await page.waitForTimeout(900)

const buttons = await page.locator('button').allInnerTexts()
console.log('--- buttons ---')
console.log(buttons.filter(text => text.trim() !== '').map(text => text.replace(/\s+/g, ' ').slice(0, 40)).join(' | '))

const reqButton = page.getByRole('button', { name: '打开需求', exact: true }).first()
if (await reqButton.isVisible().catch(() => false)) {
  await reqButton.click()
} else {
  console.log('open-requirement button not visible')
}
await page.waitForTimeout(3500)
const rightPane = page.locator('.dsh-wb-design').first()
if (await rightPane.isVisible().catch(() => false)) {
  const text = (await rightPane.innerText()).replace(/\s+/g, ' ')
  console.log('--- requirement tab text ---')
  console.log(text.slice(0, 500))
} else {
  console.log('requirement tab not visible')
}
await page.screenshot({ path: `../deploy/dsh-sim/screenshots/split-${tag}-requirement.png` })

const designButton = page.getByRole('button', { name: /^打开设计/ }).first()
const designButtonVisible = await designButton.isVisible().catch(() => false)
const designButtonEnabled = designButtonVisible ? await designButton.isEnabled().catch(() => false) : false
console.log('design button', { visible: designButtonVisible, enabled: designButtonEnabled })
if (designButtonVisible && designButtonEnabled) {
  await designButton.click()
} else {
  const more = page.getByRole('button', { name: '更多工具' }).first()
  if (await more.isVisible().catch(() => false)) {
    await more.click()
    await page.waitForTimeout(500)
    const designGuide = page.getByRole('button', { name: /^设计/ }).first()
    if (await designGuide.isVisible().catch(() => false)) await designGuide.click()
  }
}
await page.waitForTimeout(4500)

const gallery = page.locator('.dsh-wb-gallery').first()
if (await gallery.isVisible().catch(() => false)) {
  const text = (await gallery.innerText()).replace(/\s+/g, ' ')
  console.log('--- design tab text ---')
  console.log(text.slice(0, 700))
  const items = await page.locator('.dsh-wb-gallery-item-name').allInnerTexts()
  console.log('screens', JSON.stringify(items))
  const frame = page.locator('iframe.dsh-wb-gallery-frame').first()
  if (await frame.isVisible().catch(() => false)) {
    const frameText = await frame.contentFrame().locator('body').innerText().catch(reason => `ERR ${reason.message}`)
    console.log('--- iframe text ---')
    console.log(String(frameText).replace(/\s+/g, ' ').slice(0, 400))
  } else {
    console.log('no iframe (image preview or error)')
  }
} else {
  console.log('design gallery not visible')
}
await page.screenshot({ path: `../deploy/dsh-sim/screenshots/split-${tag}-design.png` })
console.log('--- console errors ---')
console.log(errors.slice(0, 6).join('\n'))
await browser.close()
