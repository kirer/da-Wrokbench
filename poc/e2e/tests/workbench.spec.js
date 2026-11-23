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

  const row = page.locator('.user-row').filter({ hasText: identity }).first()
  await expect(row).toBeVisible()
  await row.click()
  await page.getByRole('button', { name: new RegExp(`以「${identity}」身份进入`) }).click()

  await expect(page.locator('.dsh-wb-design .plugnac')).toBeVisible()
  const identityButton = page.locator('.dsh-wb-design .topbar > button.dropdown-trigger')
  await expect(identityButton).toContainText('当前身份')
  const avatar = identityButton.locator('.avatar').first()
  if (await avatar.isVisible().catch(() => false)) {
    await expect(avatar).toHaveText(identity.slice(0, 1))
  }
}

test('迭代列表、需求详情与活文档', async ({ page }) => {
  await openWorkbench(page, '李四')
  await expect(page.locator('.table tbody tr').first()).toBeVisible()
  await page.screenshot({ path: 'screenshots/workbench-iterations.png', fullPage: false })

  const iteration = page.locator('.table tbody tr').filter({ hasText: '2026-S11' }).first()
  await iteration.click()
  await expect(page.locator('.rc-title').first()).toBeVisible()
  await page.screenshot({ path: 'screenshots/workbench-iteration-detail.png', fullPage: false })

  const requirement = page.locator('.rc-title').filter({ hasText: '会员积分改版' }).first()
  await requirement.click()
  await expect(page.locator('.rf-head')).toContainText('会员积分改版')
  await expect(page.locator('.cardwall')).toContainText('总述')
  await expect(page.locator('.endsec').first()).toContainText('负责人')
  await page.screenshot({ path: 'screenshots/workbench-requirement.png', fullPage: true })
})

test('我的工作台与通知中心', async ({ page }) => {
  await openWorkbench(page, '李四')
  await page.locator('.plugnac a').filter({ hasText: '我的工作台' }).click()
  await expect(page.locator('.statbar')).toContainText('本月完成')
  await expect(page.locator('.worklist .witem').first()).toBeVisible()
  await page.screenshot({ path: 'screenshots/workbench-my.png', fullPage: false })

  await page.locator('.plugnac a').filter({ hasText: '通知' }).click()
  await expect(page.locator('.notif').first()).toBeVisible()
  await expect(page.locator('.page-title')).toContainText('通知中心')
  await page.screenshot({ path: 'screenshots/workbench-notifications.png', fullPage: false })
})

test('技能库筛选、详情与新建表单', async ({ page }) => {
  await openWorkbench(page, '李四')
  await page.locator('.plugnac a').filter({ hasText: '技能库' }).click()
  await expect(page.locator('.skill-layout')).toBeVisible()
  await expect(page.locator('.skill-list .srow').first()).toBeVisible()
  const first = page.locator('.skill-list .srow').first()
  await first.click()
  await expect(page.locator('.detail')).toContainText('内容预览')
  await expect(page.locator('.detail')).toContainText('版本历史')
  await page.screenshot({ path: 'screenshots/workbench-skills.png', fullPage: false })

  await page.getByRole('button', { name: '新建技能' }).click()
  await expect(page.locator('.detail .detail-hd')).toContainText('新建技能')
  await page.getByRole('button', { name: '取消' }).first().click()
  await expect(page.locator('.detail .detail-hd')).not.toContainText('新建技能')
})

test('设置页与管理员后台', async ({ page }) => {
  await openWorkbench(page, '管理员')
  await page.locator('.plugnac a').filter({ hasText: '设置' }).click()
  await expect(page.locator('.settings-layout')).toBeVisible()
  await expect(page.locator('.set-sec').first()).toContainText('身份与平台')
  await page.screenshot({ path: 'screenshots/workbench-settings.png', fullPage: false })

  await page.getByRole('button', { name: '用户与权限' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('用户与角色')
  await expect(dialog).toContainText('钉钉同步')
  await expect(dialog).toContainText('集成状态')
  await expect(dialog).toContainText('审计事件')
  await page.screenshot({ path: 'screenshots/workbench-admin.png', fullPage: false })
})

test('右侧需求侧栏与设计画布', async ({ page }) => {
  await openWorkbench(page, '张三')
  const iteration = page.locator('.table tbody tr').filter({ hasText: '2026-S11' }).first()
  await iteration.click()
  const requirement = page.locator('.rc-title').filter({ hasText: '会员积分改版' }).first()
  await requirement.click()

  const side = page.getByRole('button', { name: '需求侧栏' })
  if (await side.isVisible().catch(() => false)) {
    await side.click()
  } else {
    await page.getByRole('button', { name: '进入会话' }).click()
  }
  const tab = page.getByRole('tab', { name: /需求/ }).first()
  await tab.waitFor({ state: 'visible' })
  await expect(page.locator('.dsh-wb-notice.is-error')).toHaveCount(0)
  await expect(page.locator('.dsh-wb-design-canvas')).toBeVisible()
  await page.waitForTimeout(1200)
  const pane = await page.locator('.dsh-wb-design-canvas').boundingBox()
  expect(pane?.width ?? 0).toBeGreaterThan(250)
  await page.screenshot({ path: 'screenshots/workbench-design-pane.png', fullPage: false })
})
