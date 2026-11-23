import { test, expect } from '@playwright/test'

const DSH_URL = process.env.DSH_URL || ''

test.skip(DSH_URL === '', '设置 DSH_URL（dsh web 打印的带 token 地址）后运行 UI E2E')

async function openWorkbench(page, identity) {
  await page.goto(DSH_URL)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1200)

  const expand = page.getByRole('button', { name: '打开侧边栏' })
  if (await expand.isVisible().catch(() => false)) await expand.click()

  const entry = page.getByRole('button', { name: '研发工作台' }).first()
  await entry.waitFor({ state: 'visible' })
  await entry.click()
  await page.waitForTimeout(600)

  const heading = page.getByRole('heading', { name: '研发工作台' })
  const login = page.getByRole('button', { name: new RegExp(`${identity}[\\s\\S]*进入`) }).first()
  const profile = page.locator('button.dsh-wb-userchip').first()

  // 已有工作台 Cookie 但身份不对时，先从个人设置退出。
  if (await profile.isVisible().catch(() => false)) {
    await profile.click()
    const logout = page.getByRole('button', { name: '退出登录' })
    if (await logout.isVisible().catch(() => false)) await logout.click()
    await page.waitForTimeout(400)
  }
  if (await login.isVisible().catch(() => false)) {
    await login.click()
  }
  await heading.waitFor()
  await expect(page.locator('button.dsh-wb-userchip')).toContainText(identity)
}

test('工作台首页、需求详情、活文档与团队文件', async ({ page }) => {
  await openWorkbench(page, '李四')
  await expect(page.locator('button.dsh-wb-row').first()).toBeVisible()
  await page.screenshot({ path: 'screenshots/workbench-dashboard.png', fullPage: false })

  const row = page.locator('button.dsh-wb-row').filter({ hasText: 'S11-001' }).first()
  await row.click()
  await expect(page.locator('.dsh-wb-detail')).toContainText('会员积分改版')
  await expect(page.locator('.dsh-wb-doc')).toContainText('需求文档')
  await expect(page.locator('.dsh-wb-artifacts')).toContainText('团队文件')
  await expect(page.locator('.dsh-wb-upload')).toContainText('上传附件')
  await page.screenshot({ path: 'screenshots/workbench-requirement-detail.png', fullPage: true })
})

test('通知按需求聚合', async ({ page }) => {
  await openWorkbench(page, '张三')
  await page.locator('button.dsh-wb-iconbtn').filter({ hasText: '通知' }).click()
  await expect(page.locator('.dsh-wb-popover')).toBeVisible()
  await expect(page.locator('.dsh-wb-notif-group').first()).toContainText('全部')
  await expect(page.locator('.dsh-wb-notif').first()).toBeVisible()
  await page.locator('.dsh-wb-notif-group').nth(1).click()
  await expect(page.locator('.dsh-wb-notif-group.is-active')).toHaveCount(1)
  await page.screenshot({ path: 'screenshots/workbench-notifications.png' })
})

test('管理员后台', async ({ page }) => {
  await openWorkbench(page, '管理员')
  await page.getByRole('button', { name: '管理', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('用户与角色')
  await expect(page.getByRole('dialog')).toContainText('钉钉同步')
  await expect(page.getByRole('dialog')).toContainText('集成状态')
  await expect(page.getByRole('dialog')).toContainText('审计事件')
  await page.screenshot({ path: 'screenshots/workbench-admin.png' })
})

test('右侧需求与设计画布（会话归属人）', async ({ page }) => {
  await openWorkbench(page, '张三')
  const row = page.locator('button.dsh-wb-row').filter({ hasText: 'S11-001' }).first()
  await row.click()
  const enter = page.getByRole('button', { name: '进入会话' })
  if (await enter.isDisabled()) {
    // 换机或服务端重置后，本机可能没有这个需求的会话映射；现场建一个设计会话。
    await page.getByRole('button', { name: '新建会话' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(`新建会话 · S11-001`)
    await dialog.getByRole('button', { name: '创建会话' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 30000 })
  } else {
    await enter.click()
  }
  const tab = page.getByRole('tab', { name: /需求/ }).first()
  await tab.waitFor({ state: 'visible' })
  await expect(page.locator('.dsh-wb-notice.is-error')).toHaveCount(0)
  await expect(page.locator('.dsh-wb-design-canvas')).toBeVisible()
  // 右侧栏是滑入动画；等宽度稳定后再截图，否则截到动画中的窄条。
  await page.waitForTimeout(1200)
  const pane = await page.locator('.dsh-wb-design-canvas').boundingBox()
  expect(pane?.width ?? 0).toBeGreaterThan(250)
  await page.screenshot({ path: 'screenshots/workbench-design-pane.png' })
})
