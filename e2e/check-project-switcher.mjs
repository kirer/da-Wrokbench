#!/usr/bin/env node
/**
 * 项目切换回归：顶栏品牌位 → 项目菜单 → 新建 / 切换 / 重命名。
 *
 * 前置：DSH 桌面端已开 9222，插件已安装；服务端在 127.0.0.1:3210。
 * 首次运行会留下一个空项目「测试项目」（没有删除项目的接口），后续运行复用它；
 * 想彻底清掉就重置工作台测试数据。脚本结束时切回「研发项目」，并把名字改回原样。
 */
import { chromium } from 'playwright'

const SHOT = (name) => `/Users/kirer/projects/da-Workbench/e2e/screenshots/project-${name}.png`
const pageErrors = []
const consoleErrors = []

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
if (!context) throw new Error('没有可用的桌面端上下文')
const page = context.pages().find(candidate => candidate.url().startsWith('dsh-app://'))
if (!page) throw new Error('没有找到 dsh-app:// 页面')
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
await page.bringToFront()

const text = async selector => (await page.locator(selector).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
const projectName = () => text('.plugnac-project-name')

async function waitFor(fn, label, timeout = 20000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeout) {
    try {
      last = await fn()
      if (last) return last
    } catch (error) { last = error }
    await page.waitForTimeout(400)
  }
  throw new Error(`等待超时：${label}（最后结果：${last instanceof Error ? last.message : last}）`)
}

async function readState() {
  return page.evaluate(async () => {
    const token = window.localStorage.getItem('dshWorkbenchAuthToken') || ''
    const response = await fetch('/dsh-workbench/api/state', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error(`state HTTP ${response.status}`)
    return response.json()
  })
}

async function openWorkbench() {
  const ready = async () => (await page.locator('.plugnac-project-btn').isVisible().catch(() => false))
    || (await page.locator('.user-row').count()) > 0
  if (!(await ready())) {
    const entry = page.getByRole('button', { name: '研发工作台', exact: true }).first()
    if (await entry.isVisible().catch(() => false)) {
      await entry.click().catch(() => {})
      await page.waitForTimeout(1500)
    }
  }
  if ((await page.locator('.user-row').count()) > 0) {
    await page.locator('.user-row').filter({ hasText: '张三' }).first().click()
    await page.getByRole('button', { name: '以「张三」身份进入' }).click()
    await page.waitForTimeout(2500)
  }
  await page.locator('.plugnac-project-btn').waitFor({ state: 'visible', timeout: 25000 })
}

async function switchIdentity(name) {
  await openWorkbench()
  const state = await readState().catch(() => null)
  if (state?.currentUser?.name === name) return
  await page.getByRole('link', { name: '设置' }).click()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await waitFor(async () => (await page.locator('.user-row').count()) > 0, '退出后出现登录用户')
  await page.locator('.user-row').filter({ hasText: name }).first().click()
  await page.getByRole('button', { name: `以「${name}」身份进入` }).click()
  await waitFor(async () => (await page.locator('.user-row').count()) === 0, `${name} 登录提交`)
  await page.waitForTimeout(1200)
  await openWorkbench()
  const after = await readState()
  if (after.currentUser?.name !== name) throw new Error(`身份切换失败，当前是 ${after.currentUser?.name}`)
  console.log(`身份：${name}`)
}

async function openMenu() {
  if (!(await page.locator('.dsh-wb-project-menu').isVisible().catch(() => false))) {
    await page.locator('.plugnac-project-btn').click()
  }
  await page.locator('.dsh-wb-project-menu').waitFor({ state: 'visible', timeout: 5000 })
}

async function closeMenu() {
  if (await page.locator('.dsh-wb-project-menu').isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
}

async function switchTo(name) {
  await openMenu()
  await page.locator('.dsh-wb-project-item').filter({ hasText: name }).first().click()
  await waitFor(async () => (await projectName()) === name, `切换项目到 ${name}`)
  await page.waitForTimeout(900)
}

async function renameCurrent(name) {
  await openMenu()
  await page.locator('.dsh-wb-project-action').filter({ hasText: '重命名当前项目' }).click()
  const input = page.locator('.dsh-wb-dialog input').first()
  await input.waitFor({ state: 'visible', timeout: 5000 })
  await input.fill(name)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await waitFor(async () => (await projectName()) === name, `重命名项目为 ${name}`)
  await page.waitForTimeout(700)
}

await switchIdentity('张三')
console.log('项目入口：', await projectName())

// 1. 菜单内容
await openMenu()
const menu = await text('.dsh-wb-project-menu')
console.log('菜单：', menu)
if (!menu.includes('研发项目')) throw new Error('项目菜单里没有「研发项目」')
if (!menu.includes('新建项目')) throw new Error('负责人看不到「新建项目」')
await page.screenshot({ path: SHOT('menu') })
await closeMenu()

// 2. 新建项目（重复运行时复用）→ 自动切换 → 空迭代列表
await openMenu()
const reuse = await page.locator('.dsh-wb-project-item').filter({ hasText: '测试项目' }).count() > 0
await closeMenu()
if (reuse) {
  console.log('复用已有测试项目')
  await switchTo('测试项目')
} else {
  await openMenu()
  await page.locator('.dsh-wb-project-action').filter({ hasText: '新建项目' }).click()
  const dialogInput = page.locator('.dsh-wb-dialog input').first()
  await dialogInput.waitFor({ state: 'visible', timeout: 5000 })
  await dialogInput.fill('测试项目')
  await page.locator('.dsh-wb-dialog input').nth(1).fill('项目切换回归用')
  await page.getByRole('button', { name: '创建项目', exact: true }).click()
  await waitFor(async () => (await projectName()) === '测试项目', '新建项目后自动切换')
  await page.waitForTimeout(1200)
}
const emptyText = await text('.dsh-wb-design .scroll')
console.log('空项目页：', emptyText.slice(0, 240))
if (!emptyText.includes('这个项目还没有迭代')) throw new Error('测试项目应显示空迭代列表')
await page.screenshot({ path: SHOT('created-empty') })

// 3. 切回研发项目 → 迭代列表恢复
await switchTo('研发项目')
const backText = await text('.dsh-wb-design .scroll')
console.log('切回后：', backText.slice(0, 240))
if (!backText.includes('2026-S13')) throw new Error('切回研发项目后应看到 2026-S13 迭代')
if (backText.includes('测试项目 ·')) throw new Error('切回后页面仍显示测试项目')
await page.screenshot({ path: SHOT('switched-back') })

// 4. 重命名当前项目并改回
await renameCurrent('研发项目改名')
if (!(await text('.page-sub')).includes('研发项目改名')) throw new Error('重命名后页头没有跟着变')
await page.screenshot({ path: SHOT('renamed') })
await renameCurrent('研发项目')
console.log('最终项目：', await projectName())

if (pageErrors.length > 0) throw new Error(`页面异常：${pageErrors.join(' | ')}`)
if (consoleErrors.length > 0) console.log('console error（可能来自宿主）:', consoleErrors.slice(0, 5))
console.log('OK 项目切换验证通过')

// 桌面端测完把身份还给脚本开始时的用户，别改变用户当前视图。
await switchIdentity('李四')
await browser.close()
