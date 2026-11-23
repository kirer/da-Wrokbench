#!/usr/bin/env node
/**
 * 把设计目录里的每个 HTML 屏幕截成 PNG，供仿真上传为设计预览图。
 * 用法：node deploy/dsh-sim/capture-previews.mjs <html目录>
 * 复用 e2e 的 Playwright；禁用 JS，只截静态画面。
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const requireFromE2E = createRequire(path.join(HERE, '..', '..', 'e2e', 'package.json'))
const { chromium } = requireFromE2E('playwright')

const dir = process.argv[2]
if (!dir) {
  console.error('用法：node capture-previews.mjs <html目录>')
  process.exit(2)
}

const htmlFiles = fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.html')).sort()
if (htmlFiles.length === 0) {
  console.error('目录里没有 HTML 文件')
  process.exit(1)
}

const browser = await chromium.launch()
try {
  for (const file of htmlFiles) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
    })
    await page.goto(pathToFileURL(path.join(dir, file)).href)
    await page.waitForTimeout(250)
    const output = path.join(dir, `${path.basename(file, path.extname(file))}.png`)
    await page.screenshot({ path: output, fullPage: true })
    console.log(output)
    await page.close()
  }
} finally {
  await browser.close()
}
