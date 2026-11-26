import fs from 'node:fs'
import path from 'node:path'
import { httpError } from './util.js'
import { slugTitle, refreshLocal, saveLocal, localUser, baseDirFor, isInside, assertNoSymlinkBetween, assertLocalFolderInside, safeSegment, ensureRequirementFolder, PROTOTYPE_DIR, listHtmlFiles, listDesignFiles, listPrototypeFiles, listDesignSupportFiles } from './local.js'
import { SYNC_INTERVAL_MS, lastSyncAt, serverState, serverJson, serverAs, previewAssetCache } from './server.js'
import { iterationOf, folderPathFor, findMappedRecord, findSessionOwner } from './state.js'

// 返回 true 表示这次真的跑了同步；写操作后调用 force 让新上传的文件立刻可见。
export async function syncWorkspaceFiles(userId, data, local, force = false) {
  const last = lastSyncAt.get(userId) ?? 0
  if (!force && Date.now() - last < SYNC_INTERVAL_MS) return false
  lastSyncAt.set(userId, Date.now())
  const localState = localUser(local, userId)
  const baseDir = baseDirFor(local, userId)
  // 同步失败不影响工作台本身：卡片仍可从服务端附件预览。
  let wrote = false
  for (const step of [syncOwnPrototypes, mirrorPrototypesForUser, syncOwnTestReports]) {
    const result = await step(userId, data, local, localState, baseDir).catch((reason) => {
      console.warn('[dsh-workbench] workspace file sync failed', reason)
      return false
    })
    if (result === true) wrote = true
  }
  // 原型 / 测试报告的水位由各自的同步函数保存；镜像记录是在这里写的，写完落盘，
  // 重启后才能接着上次的位置继续。
  if (wrote) saveLocal(local)
  return true
}

export function actorIdFromExec(local, exec) {
  refreshLocal(local)
  const sessionId = exec?.agent?.session?.id
  if (typeof sessionId === 'string' && sessionId !== '') {
    const owner = findSessionOwner(local, sessionId)
    if (owner !== null) return owner
  }
  throw httpError(401, '当前会话还没有绑定工作台身份。请从研发工作台的迭代里进入需求，在需求页打开一次这个会话。')
}

export async function stateFor(actorId) {
  return serverAs(actorId, '/state')
}

export async function requirementForExec(local, actorId, args, exec) {
  const explicit = typeof args?.requirement === 'string' ? args.requirement.trim() : ''
  const state = await stateFor(actorId)
  let requirement = null
  if (explicit !== '') {
    requirement = state.requirements.find(item => (
      item.id === explicit
      || item.code.toLowerCase() === explicit.toLowerCase()
      || item.sessions.some(session => session.id === explicit || session.sessionId === explicit)
    )) ?? null
  } else {
    const dshSessionId = exec?.agent?.session?.id
    const recordId = dshSessionId ? findMappedRecord(local, actorId, dshSessionId) : null
    if (recordId !== null) {
      requirement = state.requirements.find(item => (
        item.primarySessionId === recordId
        || item.sessions.some(session => session.id === recordId)
      )) ?? null
    }
  }
  if (requirement === null) {
    throw httpError(explicit === '' ? 400 : 404,
      explicit === ''
        ? '请给出需求编号，例如 S11-008；或者在一个已绑定需求的会话里调用'
        : `找不到需求「${explicit}」`)
  }
  return { state, requirement }
}

export function requirementFolder(local, actorId, state, requirement) {
  return folderPathFor(localUser(local, actorId), baseDirFor(local, actorId), state, requirement)
}

// 需求会话的工作目录是迭代目录，原型/设计资料放在同名的需求子目录里。旧数据
// 没有 folders 映射时按需创建并记下；同名需求用「 (2)」这类目录名区分，避免
// 两条需求把原型写到同一个目录。
export function ensureRequirementFolderFor(local, actorId, state, requirement) {
  const baseDir = baseDirFor(local, actorId)
  const localState = localUser(local, actorId)
  try {
    const existing = requirementFolder(local, actorId, state, requirement)
    const ownedByOther = existing !== '' && Object.entries(localState.folders).some(([id, pathValue]) => (
      id !== requirement.id && typeof pathValue === 'string' && path.resolve(pathValue) === path.resolve(existing)
    ))
    if (existing !== '' && !ownedByOther && fs.existsSync(existing)) {
      assertLocalFolderInside(baseDir, existing, '需求目录')
      if (localState.folders[requirement.id] !== existing) {
        localState.folders[requirement.id] = existing
        saveLocal(local)
      }
      return existing
    }
  } catch { /* 坏映射或路径越界时按规范目录重建 */ }
  const iteration = iterationOf(state, requirement)
  const parent = iteration === null || iteration === undefined
    ? baseDir
    : path.join(baseDir, safeSegment(iteration.code, '未命名迭代'))
  const folder = ensureRequirementFolder(parent, slugTitle(requirement.title), local, actorId, true)
  localState.folders[requirement.id] = folder
  saveLocal(local)
  return folder
}

export const DESIGN_PREVIEW_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

// 设计稿/原型常把样式拆在同目录的 tokens.css / app.css 里。design-preview 是
// 单文件路由，浏览器按相对路径请求会落到 /dsh-workbench/api/ 下拿不到文件，
// 预览就成了无样式 HTML。这里把同需求、同目录的本地样式和脚本内联进页面，
// 只读、只内联同一需求内的文本附件，不碰外部地址。
export const PREVIEW_ASSET_CACHE_TTL_MS = 20_000

export async function previewArtifactsFor(requirementId, token) {
  // 键里带上 token：不同的人对同一需求看到的附件范围可以不同，不能共用一份缓存。
  const key = `${token}:${requirementId}`
  const cached = previewAssetCache.get(key)
  if (cached !== undefined && Date.now() - cached.at < PREVIEW_ASSET_CACHE_TTL_MS) {
    return cached.artifacts
  }
  const stateData = await serverState(token)
  const requirement = (stateData.requirements || []).find(item => item.id === requirementId)
  const artifacts = Array.isArray(requirement?.artifacts) ? requirement.artifacts : []
  previewAssetCache.set(key, { at: Date.now(), artifacts })
  return artifacts
}

export function previewAssetRef(dir, ref) {
  const clean = String(ref || '').trim().split('#')[0].split('?')[0]
  if (clean === '' || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(clean)) return ''
  const joined = path.posix.normalize(path.posix.join(dir, clean))
  if (joined === '' || joined === '..' || joined.startsWith('../')) return ''
  return joined
}

export async function readPreviewAsset(artifact, token) {
  const data = await serverJson(`/artifacts/${encodeURIComponent(artifact.id)}`, { token })
  const content = typeof data.content === 'string' ? data.content : ''
  if (artifact.encoding === 'base64') return Buffer.from(content, 'base64').toString('utf8')
  return content
}

export async function inlinePreviewAssets(html, artifact, token, requirementId) {
  if (!/<link\b[^>]*stylesheet/i.test(html) && !/<script\b[^>]*\bsrc\s*=/i.test(html)) return html
  let artifacts = []
  try {
    artifacts = await previewArtifactsFor(requirementId, token)
  } catch (reason) {
    console.warn('[dsh-workbench] preview assets unavailable', reason)
    return html
  }
  const dir = path.posix.dirname(String(artifact.name || '').replace(/\\/g, '/'))
  const byName = new Map()
  for (const item of artifacts) {
    const name = String(item.name || '').replace(/\\/g, '/')
    if (name !== '' && item.encoding !== 'base64') byName.set(name, item)
  }
  const wanted = new Set()
  const linkRe = /<link\b[^>]*>/gi
  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi
  let match
  while ((match = linkRe.exec(html)) !== null) {
    if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(match[0])) continue
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(match[0])?.[1] || ''
    const ref = previewAssetRef(dir, href)
    if (ref !== '' && byName.has(ref)) wanted.add(ref)
  }
  while ((match = scriptRe.exec(html)) !== null) {
    const ref = previewAssetRef(dir, match[1])
    if (ref !== '' && byName.has(ref)) wanted.add(ref)
  }
  const contents = new Map()
  await Promise.all([...wanted].map(async (ref) => {
    try {
      contents.set(ref, await readPreviewAsset(byName.get(ref), token))
    } catch (_) { /* 缺文件就保留原标签，页面自己会给出失败提示 */ }
  }))
  let out = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(tag)) return tag
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || ''
    const ref = previewAssetRef(dir, href)
    if (ref === '' || !contents.has(ref)) return tag
    return `<style data-preview-asset="${ref.replace(/"/g, '&quot;')}">\n${contents.get(ref)}\n</style>`
  })
  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
    const ref = previewAssetRef(dir, src)
    if (ref === '' || !contents.has(ref)) return tag
    return `<script>\n${contents.get(ref)}\n</script>`
  })
  return out
}

export function sendDesignPreview(res, buffer, name, declaredType) {
  const ext = path.extname(String(name || '')).toLowerCase()
  const passiveDeclared = new Set([
    'text/html', 'text/css', 'text/plain', 'text/markdown',
    'text/javascript', 'application/javascript',
    'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  ])
  let type = DESIGN_PREVIEW_TYPES[ext]
  if (type === undefined) {
    const declared = String(declaredType || '').split(';')[0].trim().toLowerCase()
    if (passiveDeclared.has(declared)) type = declared
  }
  if (type === undefined) {
    res.statusCode = 415
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: '不支持预览这个文件类型' }))
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', type)
  res.setHeader('content-length', buffer.length)
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('cross-origin-resource-policy', 'same-origin')
  if (/text\/html|text\/css|javascript|image\/svg/i.test(type)) {
    // 原型是别人写的 HTML：放进沙箱源里跑，拿不到工作台会话，也不许加载外部资源、
    // 提交表单或借 base 标签改解析地址。
    res.setHeader('content-security-policy', "sandbox allow-scripts allow-forms allow-modals; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'; object-src 'none'")
  }
  res.end(buffer)
}

// 交付设计时把本机设计文件正文上传到团队服务端，这样其他设备也能看到同一份
// 设计稿。单文件限制 1.5 MB，只上传文本类设计资产；失败不阻断交付。
export const DESIGN_UPLOAD_MAX_BYTES = 1_500_000

// 测试报告是自包含 HTML，内嵌截图后常超过 1.5 MB（S22-002 就是 1.7 MB），
// 按设计稿的上限同步不上去。服务端文本上限 4 MB，这里留一点余量。
export const TEST_REPORT_MAX_BYTES = 3_900_000

// 需求页只读浏览需求目录时跳过的大型/敏感目录，避免把 node_modules 或
// .git 整个翻出来，也避免把 .local 凭据显示在界面里。
export const CODE_BROWSER_SKIP = new Set(['.git', 'node_modules', '.local', '.DS_Store', 'dist', 'target', '.next', '.cache'])

// 目录列表和单文件读取必须用同一套拒绝规则：只过滤列表等于没过滤，
// 直接请求路径仍能拿到 .env / .git/config / *.pem 的明文。
export const CODE_BROWSER_DENY_EXT = new Set([
  '.pem', '.key', '.p12', '.pfx', '.crt', '.cer', '.der', '.keystore', '.jks', '.p8',
  '.sqlite', '.sqlite3', '.db',
])

// 少数点开头的文件是开发时确实要看、又不含凭据的，单独放行。
export const CODE_BROWSER_ALLOW_DOTFILES = new Set([
  '.gitignore', '.gitattributes', '.editorconfig', '.dockerignore',
  '.env.example', '.env.sample', '.env.template',
])

export function codeBrowserDenied(relativePath) {
  const segments = String(relativePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(segment => segment !== '' && segment !== '.')
  if (segments.some(segment => segment === '..')) return true
  for (const segment of segments) {
    if (CODE_BROWSER_SKIP.has(segment)) return true
    // 点开头的文件/目录（.env、.npmrc、.netrc、.git-credentials、.ssh 等）一律不开放。
    if (segment.startsWith('.') && !CODE_BROWSER_ALLOW_DOTFILES.has(segment)) return true
  }
  const name = segments[segments.length - 1] || ''
  return CODE_BROWSER_DENY_EXT.has(path.extname(name).toLowerCase())
}

export const CODE_PREVIEW_MAX_BYTES = 200_000

export const DESIGN_UPLOAD_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

// 交付设计前的统一准备：扫描设计文件与支持文件、上传成附件，并带上此前已上传
// 但还没归入任何设计版本的设计附件。工具（workbench_deliver_design）和
// 斜杠命令（/design-now deliver）都走这里，两边交付的结果才一致。
export async function prepareDesignDelivery(local, actorId, state, requirement, folder, requestedFiles) {
  const baseDir = baseDirFor(local, actorId)
  let files = Array.isArray(requestedFiles) ? requestedFiles.filter(file => typeof file === 'string') : []
  if (files.length === 0) {
    files = listDesignFiles(folder, baseDir).map(file => file.relativePath)
  }
  // 版本文件列表只记 HTML 屏；样式/脚本等支持文件也上传，供跨角色预览内联相对引用。
  const supportFiles = listDesignSupportFiles(folder, baseDir)
  const upload = await uploadDesignArtifacts(
    actorId,
    folder,
    baseDir,
    requirement.id,
    [...new Set([...files, ...supportFiles])],
  )
  // 交付前已经上传、但还没归入任何设计版本的设计附件（例如预览图），
  // 默认一并纳入本次交付，避免它们散落在团队文件里。
  const pendingArtifactIds = (requirement.artifacts ?? [])
    .filter(artifact => artifact.kind === 'design' && !artifact.designVersion)
    .map(artifact => artifact.id)
  // 显式给了文件路径就必须都真的附上：路径写错（多带了一层目录）时不能悄悄
  // 交付一个附件为空的版本，直接报错让 agent 按需求文件夹的相对路径重交。
  if (Array.isArray(requestedFiles) && requestedFiles.length > 0) {
    const uploadedReal = new Set(upload.uploadedPaths)
    const missing = []
    for (const file of [...new Set(files)]) {
      let real = ''
      try { real = fs.realpathSync(path.resolve(folder, file)) } catch { /* 找不到就是没附上 */ }
      if (real === '' || !uploadedReal.has(real)) missing.push(file)
    }
    if (missing.length > 0) {
      const reasons = upload.warnings.filter(text => missing.some(file => text.startsWith(`${file}：`)))
      throw httpError(
        400,
        `设计文件没有附上：${missing.join('、')}。文件路径要相对需求文件夹（例如 design/01-xxx.html），改对后重新交付。`
        + (reasons.length > 0 ? `原因：${reasons.join('；')}` : ''),
      )
    }
  }
  return { files, upload, pendingArtifactIds }
}

export async function uploadDesignArtifacts(userId, folder, baseDir, requirementId, files) {
  const artifactIds = []
  // 实际上传成功的真实路径：交付时要拿它核对显式给出的文件是不是都附上了。
  const uploadedPaths = []
  const warnings = []
  if (typeof folder !== 'string' || folder === '' || !Array.isArray(files) || files.length === 0) {
    return { artifactIds, uploadedPaths, warnings }
  }
  let realFolder
  try {
    realFolder = fs.realpathSync(folder)
    const realBase = fs.realpathSync(baseDir)
    if (!isInside(realBase, realFolder)) {
      return { artifactIds, uploadedPaths, warnings: ['需求文件夹不在工作台目录内，已跳过设计稿上传'] }
    }
  } catch {
    return { artifactIds, uploadedPaths, warnings: ['需求文件夹不存在，已跳过设计稿上传'] }
  }
  if (files.length > 30) {
    warnings.push(`设计稿共 ${files.length} 个文件，单次交付最多上传前 30 个`)
  }
  for (const relativePath of files.slice(0, 30)) {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') continue
    const ext = path.extname(relativePath).toLowerCase()
    const contentType = DESIGN_UPLOAD_TYPES[ext]
    if (!contentType) {
      warnings.push(`${relativePath}：不支持的文件类型，未上传`)
      continue
    }
    try {
      const target = path.resolve(realFolder, relativePath)
      assertNoSymlinkBetween(realFolder, target)
      const real = fs.realpathSync(target)
      if (!isInside(realFolder, real)) throw new Error('文件不在需求文件夹内')
      const stat = fs.statSync(real)
      if (!stat.isFile()) throw new Error('不是普通文件')
      if (stat.size > DESIGN_UPLOAD_MAX_BYTES) throw new Error('文件超过 1.5 MB')
      const content = fs.readFileSync(real, 'utf8')
      const result = await serverAs(userId, `/requirements/${encodeURIComponent(requirementId)}/artifacts`, 'POST', {
        name: path.relative(realFolder, real).split(path.sep).join('/'),
        contentType,
        content,
        kind: 'design',
      })
      if (result?.artifact?.id) {
        artifactIds.push(result.artifact.id)
        uploadedPaths.push(real)
      }
    } catch (reason) {
      warnings.push(`${relativePath}：${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }
  return { artifactIds, uploadedPaths, warnings }
}

// 产品原型同步：产品同学的原型只写在自己的顶级目录里，评审/设计/开发/测试
// 的本机没有这些文件，需求全量页就会显示「原型 0 屏」。产品侧把 prototype/
// 下的文件自动上传成服务端附件（kind=prototype），其他角色的 host 再把最新
// 版本镜像到自己的 prototype/ 目录；这样原型和设计稿一样全员可见。
export const PROTOTYPE_ARTIFACT_KIND = 'prototype'

export const TEST_REPORT_ARTIFACT_KIND = 'test-report'

// listPrototypeFiles 的 relativePath 已经相对需求目录（含 prototype/），
// 再拼一次 PROTOTYPE_DIR 会得到 prototype/prototype/… 的重复前缀。
export function prototypeArtifactName(relativePath) {
  const normalized = String(relativePath).split(path.sep).join('/')
  return normalized.startsWith(`${PROTOTYPE_DIR}/`) ? normalized : `${PROTOTYPE_DIR}/${normalized}`
}

export async function uploadPrototypeArtifacts(userId, folder, baseDir, requirementId, files) {
  const uploaded = []
  const failed = []
  const warnings = []
  if (typeof folder !== 'string' || folder === '' || !Array.isArray(files) || files.length === 0) {
    return { uploaded, failed, warnings }
  }
  let realFolder
  try {
    realFolder = fs.realpathSync(folder)
    const realBase = fs.realpathSync(baseDir)
    if (!isInside(realBase, realFolder)) {
      return { uploaded, failed, warnings: ['需求文件夹不在工作台目录内，已跳过原型同步'] }
    }
  } catch {
    return { uploaded, failed, warnings: ['需求文件夹不存在，已跳过原型同步'] }
  }
  if (files.length > 30) {
    warnings.push(`原型共 ${files.length} 个文件，单次最多同步 30 个`)
  }
  for (const file of files.slice(0, 30)) {
    const relativePath = file?.relativePath
    if (typeof relativePath !== 'string' || relativePath.trim() === '') continue
    const stamp = `${file.size}:${file.updatedAt}`
    const contentType = DESIGN_UPLOAD_TYPES[path.extname(relativePath).toLowerCase()]
    if (!contentType) continue
    try {
      const target = path.resolve(realFolder, relativePath)
      assertNoSymlinkBetween(realFolder, target)
      const real = fs.realpathSync(target)
      if (!isInside(realFolder, real)) throw new Error('文件不在需求文件夹内')
      const stat = fs.statSync(real)
      if (!stat.isFile()) throw new Error('不是普通文件')
      if (stat.size > DESIGN_UPLOAD_MAX_BYTES) throw new Error('文件超过 1.5 MB')
      const content = fs.readFileSync(real, 'utf8')
      const result = await serverAs(userId, `/requirements/${encodeURIComponent(requirementId)}/artifacts`, 'POST', {
        name: prototypeArtifactName(relativePath),
        contentType,
        content,
        kind: PROTOTYPE_ARTIFACT_KIND,
      })
      if (result?.artifact?.id) {
        uploaded.push({ relativePath, stamp, artifact: result.artifact })
      }
    } catch (reason) {
      failed.push({ relativePath, stamp })
      warnings.push(`${relativePath}：${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }
  return { uploaded, failed, warnings }
}

// 只有需求的产品负责人本机有原型文件；其他人的 /state 不该触发上传。
export async function syncOwnPrototypes(userId, data, local, localState, baseDir) {
  const requirements = Array.isArray(data.requirements) ? data.requirements : []
  if (localState.prototypeSync === undefined || localState.prototypeSync === null) localState.prototypeSync = {}
  let dirty = false
  for (const requirement of requirements) {
    if (requirement.ownerId !== userId) continue
    if (requirement.status === 'frozen' || requirement.status === 'released' || requirement.status === 'done') continue
    let folder = ''
    try { folder = folderPathFor(localState, baseDir, data, requirement) } catch { continue }
    if (folder === '' || !fs.existsSync(folder)) continue
    const files = listPrototypeFiles(folder, baseDir)
    const sync = localState.prototypeSync[requirement.id] ?? {}
    if (files.length === 0 && Object.keys(sync).length === 0) continue
    if (files.length === 0 && !fs.existsSync(path.join(folder, PROTOTYPE_DIR))) continue
    // 提交时固化过的原型版本要留着，本机删文件/改名字都不能把它清掉。
    const versionedArtifacts = new Set(
      (Array.isArray(requirement.prototypeVersions) ? requirement.prototypeVersions : [])
        .flatMap(version => (Array.isArray(version.files) ? version.files : []).map(file => file.artifactId)),
    )
    const localPaths = new Set(files.map(file => file.relativePath))
    const stale = Object.keys(sync).filter(relativePath => !localPaths.has(relativePath))
    for (const relativePath of stale) {
      const name = prototypeArtifactName(relativePath)
      // 同一个屏每次同步都会追加一份附件，旧名字下面可能压着好几版，全部删掉。
      const artifacts = (requirement.artifacts ?? []).filter(item =>
        item.kind === PROTOTYPE_ARTIFACT_KIND && item.name === name && !versionedArtifacts.has(item.id))
      if (artifacts.length === 0) { delete sync[relativePath]; dirty = true; continue }
      try {
        for (const artifact of artifacts) {
          await serverAs(userId, `/artifacts/${encodeURIComponent(artifact.id)}`, 'DELETE')
          if (Array.isArray(requirement.artifacts)) {
            requirement.artifacts = requirement.artifacts.filter(item => item.id !== artifact.id)
          }
        }
        delete sync[relativePath]
        dirty = true
      } catch {
        // 服务端拒绝了（例如需求已冻结）就留着，下次 /state 再试。
      }
    }
    localState.prototypeSync[requirement.id] = sync
    const pending = files.filter((file) => {
      const stamp = `${file.size}:${file.updatedAt}`
      return sync[file.relativePath] !== stamp && sync[file.relativePath] !== `failed:${stamp}`
    })
    if (pending.length === 0) continue
    const result = await uploadPrototypeArtifacts(userId, folder, baseDir, requirement.id, pending)
    if (result.warnings.length > 0) console.warn('[dsh-workbench] 原型同步跳过部分文件', result.warnings)
    for (const item of result.uploaded) {
      sync[item.relativePath] = item.stamp
      if (Array.isArray(requirement.artifacts)) requirement.artifacts.push(item.artifact)
      else requirement.artifacts = [item.artifact]
    }
    for (const item of result.failed) {
      sync[item.relativePath] = `failed:${item.stamp}`
    }
    // 同一屏多次同步会在服务端压出多份同名附件；原型以最新一份为准，
    // 旧版本删掉，免得附件列表被历史版本撑大。
    for (const item of result.uploaded) {
      const name = prototypeArtifactName(item.relativePath)
      const older = (requirement.artifacts ?? []).filter(artifact =>
        artifact.kind === PROTOTYPE_ARTIFACT_KIND && artifact.name === name && artifact.id !== item.artifact.id && !versionedArtifacts.has(artifact.id))
      for (const artifact of older) {
        try {
          await serverAs(userId, `/artifacts/${encodeURIComponent(artifact.id)}`, 'DELETE')
          requirement.artifacts = requirement.artifacts.filter(entry => entry.id !== artifact.id)
        } catch {
          // 删除失败不影响本次上传；下次同步会再清理。
        }
      }
    }
    localState.prototypeSync[requirement.id] = sync
    dirty = true
  }
  if (dirty) saveLocal(local)
}

// 提交时把当前原型固化成版本：先同步产品本机的 prototype/，再把每个屏的
// 最新附件 ID 传给服务端；服务端按提交版本号记一份快照。
export function prototypeSubmitFiles(requirement) {
  const latest = new Map()
  for (const artifact of requirement.artifacts ?? []) {
    if (artifact.kind !== PROTOTYPE_ARTIFACT_KIND) continue
    if (typeof artifact.name !== 'string' || artifact.name === '') continue
    latest.set(artifact.name, artifact.id)
  }
  return [...latest.entries()].map(([name, artifactId]) => ({ name, artifactId }))
}

export async function submitRequirementNow(local, actorId, state, requirement, summary, platformIds, designNotNeeded, assignments) {
  try {
    await syncOwnPrototypes(actorId, state, local, localUser(local, actorId), baseDirFor(local, actorId))
  } catch {
    // 原型同步失败不阻断提交：先把需求送上评审，下一次 /state 还会重试同步。
  }
  let latest = requirement
  try {
    const fresh = await stateFor(actorId)
    latest = fresh.requirements.find(item => item.id === requirement.id) ?? requirement
  } catch { /* 用当前快照 */ }
  return serverAs(actorId, `/requirements/${encodeURIComponent(requirement.id)}/submit`, 'POST', {
    summary: typeof summary === 'string' && summary.trim() !== '' ? summary.trim() : undefined,
    prototype: prototypeSubmitFiles(latest),
    // 范围只在用户明确要改时才传；不传就沿用需求当前值。
    platformIds: Array.isArray(platformIds) && platformIds.length > 0 ? platformIds : undefined,
    designNotNeeded: typeof designNotNeeded === 'boolean' ? designNotNeeded : undefined,
    // 分工只在用户明确选了人时才传；不传就是都留待认领。
    assignments: assignments && typeof assignments === 'object' ? assignments : undefined,
  })
}

// 测试报告和原型一样只存在测试同学本机。需求页要把报告给产品和负责人看，
// 所以在测试同学的 /state 里把 evidence/TEST-REPORT.html 同步成服务端附件。
// 只同步本人跑过测试的需求，其他需求不会把无关文件传上去。
export function listTestReportFiles(folderPath) {
  const evidenceDir = path.join(folderPath, 'evidence')
  return listHtmlFiles(evidenceDir, folderPath, folderPath)
    .filter(file => /^TEST-REPORT\.html?$/i.test(file.name))
}

export async function uploadTestReportArtifacts(userId, folder, baseDir, requirementId, files) {
  const uploaded = []
  const failed = []
  const warnings = []
  let realFolder
  try {
    realFolder = fs.realpathSync(folder)
    const realBase = fs.realpathSync(baseDir)
    if (!isInside(realBase, realFolder)) return { uploaded, failed, warnings: ['需求文件夹不在工作台目录内，已跳过测试报告同步'] }
  } catch {
    return { uploaded, failed, warnings: ['需求文件夹不存在，已跳过测试报告同步'] }
  }
  for (const file of files.slice(0, 4)) {
    const relativePath = file?.relativePath
    if (typeof relativePath !== 'string' || relativePath.trim() === '') continue
    const stamp = `${file.size}:${file.updatedAt}`
    const contentType = DESIGN_UPLOAD_TYPES[path.extname(relativePath).toLowerCase()]
    if (!contentType) continue
    try {
      const target = path.resolve(realFolder, relativePath)
      assertNoSymlinkBetween(realFolder, target)
      const real = fs.realpathSync(target)
      if (!isInside(realFolder, real)) throw new Error('文件不在需求文件夹内')
      const stat = fs.statSync(real)
      if (!stat.isFile()) throw new Error('不是普通文件')
      if (stat.size > TEST_REPORT_MAX_BYTES) throw new Error('文件超过 3.9 MB')
      const content = fs.readFileSync(real, 'utf8')
      const result = await serverAs(userId, `/requirements/${encodeURIComponent(requirementId)}/artifacts`, 'POST', {
        name: relativePath.split(path.sep).join('/'),
        contentType,
        content,
        kind: TEST_REPORT_ARTIFACT_KIND,
      })
      if (result?.artifact?.id) uploaded.push({ relativePath, stamp, artifact: result.artifact })
    } catch (reason) {
      failed.push({ relativePath, stamp })
      warnings.push(`${relativePath}：${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }
  return { uploaded, failed, warnings }
}

export async function syncOwnTestReports(userId, data, local, localState, baseDir) {
  const requirements = Array.isArray(data.requirements) ? data.requirements : []
  if (localState.testSync === undefined || localState.testSync === null) localState.testSync = {}
  let dirty = false
  for (const requirement of requirements) {
    // 冻结/发布之后服务端不再接受新附件，测试报告只能赶在冻结前同步；
    // 这里跳过能避免每次 /state 都重试一轮注定失败的请求。
    if (requirement.status === 'frozen' || requirement.status === 'released' || requirement.status === 'done') continue
    const runs = Array.isArray(requirement.testRuns) ? requirement.testRuns : []
    if (!runs.some(run => run.by === userId)) continue
    let folder = ''
    try { folder = folderPathFor(localState, baseDir, data, requirement) } catch { continue }
    if (folder === '' || !fs.existsSync(folder)) continue
    const files = listTestReportFiles(folder)
    if (files.length === 0) continue
    const sync = localState.testSync[requirement.id] ?? {}
    const pending = files.filter((file) => {
      const stamp = `${file.size}:${file.updatedAt}`
      return sync[file.relativePath] !== stamp && sync[file.relativePath] !== `failed:${stamp}`
    })
    if (pending.length === 0) continue
    const result = await uploadTestReportArtifacts(userId, folder, baseDir, requirement.id, pending)
    if (result.warnings.length > 0) console.warn('[dsh-workbench] 测试报告同步跳过部分文件', result.warnings)
    for (const item of result.uploaded) {
      sync[item.relativePath] = item.stamp
      if (Array.isArray(requirement.artifacts)) requirement.artifacts.push(item.artifact)
      else requirement.artifacts = [item.artifact]
      // 同一份测试报告只保留最新版本，避免每次重跑报告附件反复堆积。
      const uploadedName = item.artifact.name
      const older = (requirement.artifacts ?? []).filter(artifact =>
        artifact.kind === TEST_REPORT_ARTIFACT_KIND && artifact.name === uploadedName && artifact.id !== item.artifact.id)
      for (const artifact of older) {
        try {
          await serverAs(userId, `/artifacts/${encodeURIComponent(artifact.id)}`, 'DELETE')
          requirement.artifacts = requirement.artifacts.filter(entry => entry.id !== artifact.id)
        } catch { /* 下次再清 */ }
      }
    }
    for (const item of result.failed) {
      sync[item.relativePath] = `failed:${item.stamp}`
    }
    localState.testSync[requirement.id] = sync
    dirty = true
  }
  if (dirty) saveLocal(local)
}

// 非产品角色从服务端取最新原型附件，落到自己的 prototype/ 目录，需求页画布和
// 卡片都按本机文件工作。只写缺失或大小不同的文件，不删多余文件。
// 返回这次是否往本机写了文件；调用方据此决定要不要保存本机状态。
export async function mirrorPrototypesForUser(userId, data, localState, baseDir) {
  const requirements = Array.isArray(data.requirements) ? data.requirements : []
  let wrote = false
  for (const requirement of requirements) {
    if (requirement.ownerId === userId) continue
    const artifacts = (requirement.artifacts || []).filter(artifact =>
      artifact.kind === PROTOTYPE_ARTIFACT_KIND
      && typeof artifact.name === 'string'
      && /\.html?$/i.test(artifact.name)
      && path.posix.basename(artifact.name) !== '')
    if (artifacts.length === 0) continue
    let folder = ''
    try { folder = folderPathFor(localState, baseDir, data, requirement) } catch { continue }
    if (folder === '') continue
    const latest = new Map()
    for (const artifact of artifacts) latest.set(path.posix.basename(artifact.name), artifact)
    if (localState.prototypeMirror === undefined || localState.prototypeMirror === null) localState.prototypeMirror = {}
    const mirrored = localState.prototypeMirror[requirement.id] ?? {}
    for (const [name, artifact] of latest) {
      if (name.includes('/') || name.includes('\\') || name.startsWith('.')) continue
      const dir = path.join(folder, PROTOTYPE_DIR)
      const target = path.join(dir, name)
      if (!isInside(folder, target)) continue
      try {
        // assertNoSymlinkBetween 只查目录段；target 自身如果是指向 ~/.zshrc 的链接，
        // writeFileSync 会顺着链接写出去。最后一级也要单独判。
        let targetIsLink = false
        try {
          targetIsLink = fs.lstatSync(target).isSymbolicLink()
        } catch { /* 不存在就是普通新建 */ }
        if (targetIsLink) continue
        if (fs.existsSync(target)) {
          const stat = fs.statSync(target)
          // 大小相同还不够：改了内容但字节数没变的文件（例如只改了一个字符）也要更新。
          // 以“上次镜像写入的附件 id”为准，附件换了就重写。
          if (stat.isFile() && mirrored[name] === artifact.id) continue
        }
        const result = await serverAs(userId, `/artifacts/${encodeURIComponent(artifact.id)}`)
        const content = result?.content
        if (typeof content !== 'string') continue
        assertNoSymlinkBetween(folder, dir)
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
        // mkdir -p 之后 target 仍可能是并发/预置的链接；写之前按真实父目录再确认一次。
        const realDir = fs.realpathSync(dir)
        if (!isInside(fs.realpathSync(folder), realDir)) continue
        fs.writeFileSync(
          target,
          artifact.encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8'),
          { mode: 0o600 },
        )
        mirrored[name] = artifact.id
        if (localState.prototypeMirror[requirement.id] !== mirrored) localState.prototypeMirror[requirement.id] = mirrored
        wrote = true
      } catch { /* 单个文件失败不阻断其它原型同步 */ }
    }
  }
  return wrote
}

export function requirementIdForAction(local, actorId, args, exec) {
  return requirementForExec(local, actorId, args, exec).then(({ requirement }) => requirement.id)
}

export async function actionOnRequirement(local, actorId, args, exec, action, body) {
  const id = await requirementIdForAction(local, actorId, args, exec)
  const result = await serverAs(actorId, `/requirements/${encodeURIComponent(id)}/${action}`, 'POST', body)
  return result
}

export function iterationFromState(state, reference) {
  const ref = typeof reference === 'string' ? reference.trim().toLowerCase() : ''
  if (ref === '') return state.iteration
  return (state.iterations || []).find(item => (
    item.id.toLowerCase() === ref
    || item.code.toLowerCase() === ref
    || item.shortCode.toLowerCase() === ref
  ))
}
