// 构建脚本：把 src/ 下的样式、图标与主逻辑拼成单文件 client.js（宿主加载方式不变）。
// 目前是确定性拼接（产物与拆分前逐字节一致）；后续可平滑换成 esbuild 打包。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (name) => fs.readFileSync(path.join(here, 'src', name), 'utf8')
let out = read('main.template.js')
const parts = {
  '/*__DESIGN_CSS__*/': 'css-design.js',
  '/*__DESIGN_LOGIN_CSS__*/': 'css-login.js',
  '/*__DESIGN_ICONS__*/': 'icons.js',
  '/*__CSS__*/': 'css-pages.js',
  '/*__MD_ICONS__*/': 'markdown-icons.js',
  '/*__DATA__*/': 'data-layer.js',
  '/*__HELPERS__*/': 'helpers.js',
  '/*__DIALOGS__*/': 'dialogs.js',
  '/*__PAGES__*/': 'pages-auth-settings.js',
  '/*__PAGES2__*/': 'pages-iteration-requirement.js',
  '/*__WBPAGE__*/': 'workbench-page.js',
  '/*__CANVAS__*/': 'canvas-session.js',
  '/*__SESSION__*/': 'session-admin.js',
}
for (const [token, file] of Object.entries(parts)) {
  out = out.split(token).join(read(file).replace(/\n$/, ''))
}
fs.writeFileSync(path.join(here, 'client.js'), out)
console.log('built client.js from src/')
