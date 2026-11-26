import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { LOCAL_VERSION } from './config.js'
import { httpError } from './util.js'

export let baseDirOverride = null

export function dshHome() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh')
  return path.resolve(home)
}

export function localFile() {
  return path.join(dshHome(), 'cache', 'dsh-workbench-poc', 'local.json')
}

export function unsafeBaseDirReason(value) {
  const resolved = path.resolve(value)
  if (resolved === path.parse(resolved).root) return '不能使用文件系统根目录'
  const home = path.resolve(os.homedir())
  if (resolved === home) return '不能直接使用用户主目录'
  // 不只拒绝这些目录本身，也拒绝它们的子目录：把顶级文件夹设成
  // ~/.ssh/keys 会把私钥目录暴露给预览和文件夹接口。
  const sensitive = ['.ssh', '.dsh', '.aws', '.config', '.gnupg', '.kube', '.docker']
    .map(name => path.join(home, name))
  if (sensitive.some(dir => isInside(dir, resolved))) return '不能使用用户主目录下的配置/密钥目录'
  return ''
}

export function defaultBaseDir() {
  const raw = baseDirOverride !== null
    ? baseDirOverride
    : process.env.DSH_WORKBENCH_BASE && process.env.DSH_WORKBENCH_BASE.trim() !== ''
      ? path.resolve(process.env.DSH_WORKBENCH_BASE)
      : path.join(os.homedir(), 'DSH-Workbench')
  const reason = unsafeBaseDirReason(raw)
  if (reason !== '') throw new Error(`工作台顶级文件夹不安全：${reason}（${raw}）`)
  return raw
}

export function slugTitle(title) {
  return safeSegment(title, '未命名需求').slice(0, 48)
}

// ---------------------------------------------------------------------------
// Local-only state: top-level folder + DSH session mapping. Never sent to the
// team server (the server only knows "folder configured" and session records).
// ---------------------------------------------------------------------------

export function emptyLocalUser() {
  return {
    topLevelFolder: null,
    folders: {},
    sessions: {},
    dshSessions: {},
    sessionOwners: {},
    // DSH 会话 -> 用户。会话第一次从工作台打开时由浏览器带 Cookie 认领；
    // 工具/命令只按这个映射解析身份，不再使用进程级“最后登录用户”。
    sessionUsers: {},
    // 已经写过开场白的会话：只在本机记录，避免重复往会话日志里追加消息。
    greetedSessions: {},
    // 产品原型同步水位：相对路径 -> "size:updatedAt"。原型写在产品本机目录，
    // 同步成服务端附件后其他角色才看得到，详见 syncOwnPrototypes。
    prototypeSync: {},
    // 同事原型的本机镜像水位：需求 id -> { 文件名: 附件 id }。记录本机这份文件
    // 对应服务端的哪个附件，附件换了就重写，不再只靠文件大小判断。
    prototypeMirror: {},
    testSync: {},
  }
}

export function normalizeLocal(raw) {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  data.version = LOCAL_VERSION
  if (!data.users || typeof data.users !== 'object' || Array.isArray(data.users)) data.users = {}
  if (typeof data.lastUserId !== 'string') data.lastUserId = ''
  if (typeof data.lastRole !== 'string') data.lastRole = ''
  for (const userId of Object.keys(data.users)) {
    const user = data.users[userId]
    if (!user || typeof user !== 'object' || Array.isArray(user)) data.users[userId] = emptyLocalUser()
    else {
      const base = emptyLocalUser()
      const plainObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
      data.users[userId] = {
        ...base,
        ...user,
        topLevelFolder: typeof user.topLevelFolder === 'string' && user.topLevelFolder.trim() !== '' ? user.topLevelFolder : null,
        folders: plainObj(user.folders),
        sessions: plainObj(user.sessions),
        dshSessions: plainObj(user.dshSessions),
        sessionOwners: plainObj(user.sessionOwners),
        sessionUsers: plainObj(user.sessionUsers),
        greetedSessions: plainObj(user.greetedSessions),
        prototypeSync: plainObj(user.prototypeSync),
        prototypeMirror: plainObj(user.prototypeMirror),
        testSync: plainObj(user.testSync),
      }
    }
  }
  return data
}

export function loadLocal() {
  const file = localFile()
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    // 合法 JSON 也可能是数组/标量；直接 spread 会写出 `[]` 并丢掉全部映射。
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('local.json 顶层不是对象')
    }
    if (parsed.users !== undefined && (!parsed.users || typeof parsed.users !== 'object' || Array.isArray(parsed.users))) {
      throw new Error('local.json 的 users 不是对象')
    }
    return normalizeLocal(parsed)
  } catch (reason) {
    if (fs.existsSync(file)) {
      console.error('[dsh-workbench] local.json 结构无效，已备份并重建', reason)
      try { fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* best effort */ }
    }
    return normalizeLocal(null)
  }
}

export let localStamp = 0

// 同一台机器可能跑多个 DSH 进程（headless/容器/桌面），local.json 不是单写者。
// 每次读写前按 mtime 重新载入，避免一个进程用旧映射把另一个进程刚写入的会话覆盖掉。
export function refreshLocal(local) {
  try {
    const stat = fs.statSync(localFile())
    if (stat.mtimeMs === localStamp) return
    const fresh = loadLocal()
    for (const key of Object.keys(local)) delete local[key]
    Object.assign(local, fresh)
    localStamp = stat.mtimeMs
  } catch { /* 文件不存在或暂时不可读：保留当前内存状态 */ }
}

export function saveLocal(data) {
  const file = localFile()
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
  try { fs.chmodSync(file, 0o600) } catch { /* best effort */ }
  try { localStamp = fs.statSync(file).mtimeMs } catch { localStamp = 0 }
}

export function localUser(data, userId) {
  if (!data.users[userId]) data.users[userId] = emptyLocalUser()
  return data.users[userId]
}

export function baseDirFor(local, userId) {
  const user = localUser(local, userId)
  if (user.topLevelFolder !== null && user.topLevelFolder !== undefined && user.topLevelFolder !== '') {
    const stored = path.resolve(user.topLevelFolder)
    if (unsafeBaseDirReason(stored) === '') return stored
  }
  return defaultBaseDir()
}

export function ensureBaseDir(local, userId) {
  const dir = baseDirFor(local, userId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function isInside(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

// 目录穿越和符号链接是 host 侧最容易被忽略的边界：路径字符串在 base 内，
// 但中间某一级 symlink 可能指向外部。这里逐级 lstat，存在 symlink 就拒绝。
export function assertNoSymlinkBetween(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  if (!isInside(resolvedRoot, resolvedTarget)) {
    throw httpError(403, '路径不在允许的工作台目录内')
  }
  const relative = path.relative(resolvedRoot, resolvedTarget)
  if (relative === '') return
  let current = resolvedRoot
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    let stat
    try { stat = fs.lstatSync(current) } catch (reason) {
      if (reason && reason.code === 'ENOENT') return
      throw reason
    }
    if (stat.isSymbolicLink()) throw httpError(403, '路径中包含符号链接，已拒绝访问')
  }
}

export const WINDOWS_RESERVED_SEGMENT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export function assertLocalFolderInside(base, value, label = '目录') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, `缺少${label}`)
  }
  const resolved = path.resolve(value)
  if (!isInside(base, resolved)) throw httpError(403, `${label}必须位于本机顶级文件夹内`)
  assertNoSymlinkBetween(base, resolved)
  if (fs.existsSync(resolved)) {
    let realBase
    let realTarget
    try {
      realBase = fs.realpathSync(base)
      realTarget = fs.realpathSync(resolved)
    } catch {
      throw httpError(403, `${label}无法解析真实路径`)
    }
    if (!isInside(realBase, realTarget)) throw httpError(403, `${label}的真实路径不在工作台内`)
  }
  return resolved
}

export function safeSegment(value, fallback = '未命名') {
  let cleaned = String(value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    // Windows 不接受尾随空格/点，也不接受 CON、NUL、COM1 这类设备名。
    // 目录还会在 macOS/Linux 上被共享，所以统一按最严格规则处理。
    cleaned = cleaned.replace(/[. ]+$/g, '').trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return fallback
  if (WINDOWS_RESERVED_SEGMENT.test(cleaned)) cleaned = `_${cleaned}`
  return cleaned
}

export function resolveAndCreateTopFolder(input, local, userId) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (raw === '') throw httpError(400, '顶级文件夹不能为空')
  const expanded = raw === '~'
    ? os.homedir()
    : raw.startsWith('~/')
      ? path.join(os.homedir(), raw.slice(2))
      : raw
  const resolved = path.resolve(expanded)
  const unsafe = unsafeBaseDirReason(resolved)
  if (unsafe !== '') throw httpError(403, `顶级文件夹不安全：${unsafe}`)
  const allowedRoots = [os.homedir(), defaultBaseDir(), baseDirFor(local, userId)]
  const containingRoot = allowedRoots.find(root => isInside(root, resolved))
  if (containingRoot === undefined) throw httpError(403, '顶级文件夹必须位于本机用户目录内')
  // 从真正包含目标的根开始逐级查符号链接；不能用 os.homedir() 硬锚定，
  // 否则 DSH_WORKBENCH_BASE 指向 /workbench 这类家目录外路径时会被误拒。
  assertNoSymlinkBetween(containingRoot, resolved)
  fs.mkdirSync(resolved, { recursive: true })
  if (!fs.statSync(resolved).isDirectory()) throw httpError(400, '顶级文件夹路径不是目录')
  // mkdir 之后再按真实路径校验一次，覆盖“目标是已存在的 symlink”这种情况。
  const real = fs.realpathSync(resolved)
  const realAllowed = allowedRoots.some(root => {
    try { return isInside(fs.realpathSync(root), real) } catch { return false }
  })
  if (!realAllowed) throw httpError(403, '顶级文件夹的真实路径不在允许范围内')
  return real
}

export function freeSiblingPath(parent, name) {
  const direct = path.join(parent, name)
  if (!fs.existsSync(direct)) return direct
  const stem = name.replace(/ \(\d+\)$/, '')
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parent, `${stem} (${index})`)
    if (!fs.existsSync(candidate)) return candidate
  }
  throw httpError(409, '同名需求目录过多，请换一个名称')
}

export function ensureRequirementFolder(parent, name, local, userId, unique = false) {
  if (typeof parent !== 'string' || parent.trim() === '') throw httpError(400, '缺少父目录')
  if (typeof name !== 'string' || name.trim() === '') throw httpError(400, '缺少目录名')
  const base = baseDirFor(local, userId)
  const resolvedParent = path.resolve(parent)
  // 允许直接在顶级文件夹下创建迭代目录（迭代目录同时是需求会话的工作区）；
  // 更深的目录仍必须落在工作台范围内。
  if (!isInside(base, resolvedParent)) {
    throw httpError(403, '需求目录只能建在工作台顶级文件夹内')
  }
  assertNoSymlinkBetween(base, resolvedParent)
  const safeName = safeSegment(name, '')
  if (safeName === '') throw httpError(400, '目录名为空或非法')
  // 需求根目录按名称冲突自动加「 (2)」；prototype/design 等固定子目录直接复用。
  const target = unique ? freeSiblingPath(resolvedParent, safeName) : path.join(resolvedParent, safeName)
  fs.mkdirSync(target, { recursive: true })
  const realBase = fs.realpathSync(base)
  const realTarget = fs.realpathSync(target)
  if (!isInside(realBase, realTarget)) throw httpError(403, '需求目录的真实路径不在工作台内')
  // 返回与 base 同一坐标系的路径，而不是真实路径：顶级文件夹自己可能位于符号链接
  // 之后（macOS 的 /var -> /private/var、外接盘），返回真实路径会让后续
  // “是否在顶级文件夹内”的字符串比较全部误判成越界。上面的真实路径校验已经做过。
  return target
}

export const DESIGN_FILE_SKIP = new Set(['node_modules', '.git', '.dsh', 'exports', 'refs', 'dist', 'build', 'prototype', 'design'])

export const PROTOTYPE_DIR = 'prototype'

export const DESIGN_DIR = 'design'

// 新建需求后需求页画布先摆一张空白画布。文件名以 _ 开头，画布和工作台扫描
// 都把它当草稿忽略，真正开始做原型后不会混进「原型作品」列表。
export const BLANK_CANVAS_NAME = '_canvas.html'

export const BLANK_CANVAS_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>空白画布</title>
<style>
html,body{height:100%;margin:0}
body{display:grid;place-items:center;background:#fff;color:#8a8f98;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.blank{text-align:center}
.blank b{display:block;font-size:15px;font-weight:600;color:#5f6672}
.blank span{display:block;margin-top:6px;font-size:12px;color:#9aa0aa}
</style>
</head>
<body><div class="blank"><b>空白画布</b><span>在会话里描述需求，第一屏会出现在这里。</span></div></body>
</html>
`

export const BLANK_DESIGN_HTML = BLANK_CANVAS_HTML.replace(
  '在会话里描述需求，第一屏会出现在这里。',
  '在设计会话里描述设计稿，第一屏会出现在这里。',
)

export function listHtmlFiles(dirPath, baseDir, relativeBase) {
  if (typeof dirPath !== 'string' || dirPath.trim() === '') return []
  const root = path.resolve(dirPath)
  if (!isInside(baseDir, root)) return []
  let realBase
  let realRoot
  let realRelativeBase
  try {
    realBase = fs.realpathSync(baseDir)
    realRoot = fs.realpathSync(root)
    realRelativeBase = fs.realpathSync(relativeBase ?? root)
  } catch {
    return []
  }
  if (!isInside(realBase, realRoot) || !isInside(realBase, realRelativeBase)) return []
  const files = []
  const walk = (dir, depth) => {
    if (depth > 2) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      // 和画布一致：. 开头是隐藏文件，_ 开头是草稿 / 空白画布占位，都不算一屏。
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!DESIGN_FILE_SKIP.has(entry.name)) walk(full, depth + 1)
        continue
      }
      if (!entry.isFile() || !/\.html?$/i.test(entry.name)) continue
      try {
        const real = fs.realpathSync(full)
        if (!isInside(realRoot, real)) continue
        const stat = fs.statSync(real)
        files.push({
          name: entry.name,
          path: real,
          relativePath: path.relative(realRelativeBase, real),
          updatedAt: stat.mtime.toISOString(),
          size: stat.size,
        })
      } catch { /* 读不到或指向外部就跳过 */ }
    }
  }
  walk(realRoot, 0)
  return files.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

// 需求根目录保留给早期需求（设计稿直接放在根上）；新需求的设计稿在 design/，
// 原型在 prototype/。两个目录分开扫描，原型不会混进设计交付里。
export function listDesignFiles(folderPath, baseDir) {
  const local = listHtmlFiles(folderPath, baseDir, folderPath)
  const dedicated = listHtmlFiles(path.join(folderPath, DESIGN_DIR), baseDir, folderPath)
  const seen = new Set(dedicated.map(file => file.relativePath))
  return [...dedicated, ...local.filter(file => !seen.has(file.relativePath))]
}

export function listPrototypeFiles(folderPath, baseDir) {
  return listHtmlFiles(path.join(folderPath, PROTOTYPE_DIR), baseDir, folderPath)
}

// 删除设计：清掉本机 design/（含样式素材）和需求根目录里的遗留设计稿。
// design/ 是目录就整目录删，符号链接只删链接本身；根目录只删 HTML 屏，不动文档。
export function removeLocalDesignFiles(folderPath, baseDir) {
  const warnings = []
  let realBase
  let realFolder
  try {
    realBase = fs.realpathSync(baseDir)
    realFolder = fs.realpathSync(folderPath)
  } catch {
    return { warnings }
  }
  if (!isInside(realBase, realFolder)) return { warnings }
  const designDir = path.join(realFolder, DESIGN_DIR)
  try {
    const stat = fs.lstatSync(designDir)
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(designDir)
    } else if (stat.isDirectory()) {
      const realDesign = fs.realpathSync(designDir)
      if (!isInside(realFolder, realDesign)) throw new Error('设计目录不在需求目录内')
      fs.rmSync(realDesign, { recursive: true, force: true })
    }
  } catch (reason) {
    if (reason?.code !== 'ENOENT') {
      warnings.push(`清空 design/ 失败：${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }
  for (const file of listHtmlFiles(folderPath, baseDir, folderPath)) {
    try {
      const real = fs.realpathSync(file.path)
      if (isInside(realFolder, real)) fs.unlinkSync(real)
    } catch (reason) {
      warnings.push(`删除 ${file.relativePath} 失败：${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }
  return { warnings }
}

// 设计稿的样式/脚本/小图常和 HTML 放在同一目录；交付时一起上传成附件，
// 跨角色预览才能把 <link href="tokens.css"> 这类相对引用内联进页面。
export const DESIGN_SUPPORT_EXT = new Set(['.css', '.js', '.mjs', '.json', '.svg', '.md', '.txt'])

export function listDesignSupportFiles(folderPath, baseDir) {
  const files = []
  let realBase
  let realFolder
  try {
    realBase = fs.realpathSync(baseDir)
    realFolder = fs.realpathSync(folderPath)
  } catch {
    return files
  }
  if (!isInside(realBase, realFolder)) return files
  const collect = (dir, depth) => {
    let real
    try { real = fs.realpathSync(dir) } catch { return }
    if (!isInside(realFolder, real)) return
    let entries
    try { entries = fs.readdirSync(real, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      const full = path.join(real, entry.name)
      if (entry.isDirectory()) {
        if (depth > 0 && !DESIGN_FILE_SKIP.has(entry.name)) collect(full, depth - 1)
        continue
      }
      if (!entry.isFile() || !DESIGN_SUPPORT_EXT.has(path.extname(entry.name).toLowerCase())) continue
      try {
        const fileReal = fs.realpathSync(full)
        if (!isInside(real, fileReal)) continue
        files.push(path.relative(realFolder, fileReal).split(path.sep).join('/'))
      } catch { /* 单个文件读不到就跳过 */ }
    }
  }
  collect(path.join(realFolder, DESIGN_DIR), 2)
  // 兼容旧需求：设计稿直接放在需求根目录，同目录样式也算交付支持文件。
  collect(realFolder, 0)
  return [...new Set(files)]
}

export function attachWorkingFolders(requirement, baseDir) {
  if (typeof requirement.folderPath !== 'string' || requirement.folderPath === '') {
    requirement.prototypePath = null
    requirement.designPath = null
    requirement.prototypeFiles = []
    return requirement
  }
  requirement.prototypePath = path.join(requirement.folderPath, PROTOTYPE_DIR)
  requirement.designPath = path.join(requirement.folderPath, DESIGN_DIR)
  requirement.prototypeFiles = listPrototypeFiles(requirement.folderPath, baseDir)
  return requirement
}

export function setBaseDir(dir) {
  baseDirOverride = path.resolve(dir)
}
