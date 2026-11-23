#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const specs = JSON.parse(fs.readFileSync(path.join(HERE, 'requirements.json'), 'utf8'))
const outDir = path.join(HERE, 'prompts')
fs.mkdirSync(outDir, { recursive: true })

// 详细规格写进需求活文档（seed-documents.mjs），会话里只说“做什么、写哪、几屏”。
// 低保真/高保真的通用规则放在工作台的 design-start 技能里，不再逐条打进提示词。

for (const spec of specs) {
  const productPages = spec.prototypeScreens.map((screen, index) => `${index + 1}. ${screen.file} — ${screen.name}`).join('\n')
  const product = `/design-start

需求：${spec.code}「${spec.title}」，迭代 ${spec.iteration}，平台 trade-server、web。
需求简报已经写进工作台活文档，先调用 workbench_design_context 读取，不要让我再重复描述。
按文档「## 原型页面」里的清单，在需求文件夹的 prototype/ 下生成 ${spec.prototypeScreens.length} 屏低保真产品原型，一屏一个 HTML：
${productPages}
只写 prototype/，不要写 design/，不要调用交付工具。右侧「需求」面板会自动显示这些页面。最后只回复文件名和一句说明。`
  fs.writeFileSync(path.join(outDir, `${spec.code}-product.txt`), product)

  const designPages = spec.designScreens.map((screen, index) => `${index + 1}. ${screen.file} — ${screen.name}`).join('\n')
  const design = `/design-start

需求：${spec.code}「${spec.title}」，迭代 ${spec.iteration}。
先调用 workbench_design_context 读取需求文档和 prototype/ 里的产品原型（只作信息结构参考，不要修改 prototype/）。
按文档「## 设计页面」里的清单，在需求文件夹的 design/ 下生成 ${spec.designScreens.length} 屏高保真 UI 设计稿，一屏一个 HTML：
${designPages}
视觉方向见 wb-ui-design 技能：温暖纸白背景 + 深绿色主色，细边框卡片，克制的阴影，真实中文文案；单文件、内联 CSS/JS，不引用外部资源。
完成后调用 workbench_deliver_design，requirement 用 ${spec.code}，summary 用「${spec.code} 首版高保真设计 d1」。只回复文件名和交付结果。`
  fs.writeFileSync(path.join(outDir, `${spec.code}-design.txt`), design)
}
console.log(`wrote ${specs.length * 2} short prompts to ${outDir}`)
