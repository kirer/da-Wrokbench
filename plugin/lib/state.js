import fs from 'node:fs'
import path from 'node:path'
import { slugTitle, saveLocal, localUser, baseDirFor, assertLocalFolderInside, safeSegment, PROTOTYPE_DIR, DESIGN_DIR, listDesignFiles, listPrototypeFiles } from './local.js'

// ---------------------------------------------------------------------------
// State decoration: merge server records with local folders + DSH session IDs
// ---------------------------------------------------------------------------

export function iterationOf(state, requirement) {
  return (state.iterations || []).find(item => item.id === requirement.iterationId) || state.iteration
}

export function folderPathFor(localState, baseDir, state, requirement) {
  const stored = localState.folders[requirement.id]
  if (typeof stored === 'string' && stored.trim() !== '') {
    // 旧版本只校验写入时的字符串边界；升级后文件可能被替换成符号链接，
    // 或 local.json 被手工改到工作台外。读取时重新验证，坏映射回退到规范目录。
    try { return assertLocalFolderInside(baseDir, stored, '需求目录') } catch { /* fall through */ }
  }
  const iteration = iterationOf(state, requirement)
  if (!iteration) return ''
  const iterationDir = path.join(baseDir, safeSegment(iteration.code, '未命名迭代'))
  const titled = path.join(iterationDir, slugTitle(requirement.title))
  // 兼容旧数据：早期目录是「编号-名称」。新目录优先；旧目录仍然存在时继续用它，
  // 避免升级后找不到已有的原型和设计稿。
  const legacy = path.join(iterationDir, `${safeSegment(requirement.code, 'REQ')}-${slugTitle(requirement.title)}`)
  try {
    if (fs.existsSync(titled)) return titled
    if (fs.existsSync(legacy)) return legacy
  } catch { /* fall through */ }
  return titled
}

export function decorateRequirement(localState, baseDir, state, requirement) {
  const folderPath = folderPathFor(localState, baseDir, state, requirement)
  const sessions = (Array.isArray(requirement.sessions) ? requirement.sessions : []).map(record => {
    const mapped = localState.sessions[record.id]
    return {
      ...record,
      sessionId: mapped?.dshSessionId ?? null,
      workspaceId: mapped?.workspaceId ?? null,
      folderPath: mapped?.folderPath ?? folderPath,
      local: mapped !== undefined,
      // 同事的会话也能定位（dshSessions 兜底），但「打开会话」应优先落在自己
      // 这条会话上，否则会跳到别人的会话里。
      own: localState.dshSessions?.[mapped?.dshSessionId] !== undefined,
    }
  })
  let primary = null
  if (requirement.primarySessionId) {
    primary = sessions.find(item => (
      item.id === requirement.primarySessionId && item.sessionId && item.archived !== true
    )) || null
  }
  if (primary === null) primary = sessions.find(item => item.own && item.sessionId && item.archived !== true) || null
  if (primary === null) primary = sessions.find(item => item.sessionId && item.archived !== true) || null
  const decorated = {
    ...requirement,
    folderPath,
    prototypePath: folderPath === '' ? null : path.join(folderPath, PROTOTYPE_DIR),
    designPath: folderPath === '' ? null : path.join(folderPath, DESIGN_DIR),
    // 卡片和需求页要显示本机原型/设计稿数量；只读目录，不读文件内容。
    prototypeFiles: folderPath === '' ? [] : listPrototypeFiles(folderPath, baseDir),
    designFiles: folderPath === '' ? [] : listDesignFiles(folderPath, baseDir),
    sessions,
    sessionId: primary?.sessionId ?? null,
    workspaceId: primary?.workspaceId ?? null,
  }
  if (folderPath !== '') attachDesignScreens(decorated)
  return decorated
}

export function decorateState(data, local, userId) {
  const localState = localUser(local, userId)
  const baseDir = baseDirFor(local, userId)
  const state = {
    ...data,
    baseDir,
    requirements: [],
  }
  state.iterationDir = state.iteration ? path.join(baseDir, safeSegment(state.iteration.code, '未命名迭代')) : baseDir
  state.requirements = (data.requirements || []).map(requirement => decorateRequirement(localState, baseDir, state, requirement))
  return state
}

export function findMappedRecord(local, userId, dshSessionId) {
  if (typeof dshSessionId !== 'string' || dshSessionId === '') return null
  const user = local.users[userId]
  const own = user?.dshSessions?.[dshSessionId] ?? null
  if (own !== null) return own
  // 同事的会话也能读：开发想看看设计会话、测试想看开发会话时，映射在对方名下。
  // 只借用 recordId 定位需求，路径和附件仍然按当前用户自己的本机目录解析。
  for (const other of Object.values(local.users)) {
    const record = other?.dshSessions?.[dshSessionId]
    if (typeof record === 'string' && record !== '') return record
  }
  return null
}

export function findSessionOwner(local, dshSessionId) {
  if (typeof dshSessionId !== 'string' || dshSessionId === '') return null
  for (const [userId, user] of Object.entries(local.users)) {
    if (user?.sessionUsers?.[dshSessionId] === userId) return userId
    if (user?.sessionUsers?.[dshSessionId] === true) return userId
    if (user?.dshSessions?.[dshSessionId]) return userId
  }
  return null
}

// 需求删除后清掉本机保存的会话映射和资料目录映射。DSH 会话本身由调用方
// 删除；这里只返回需要删除的 DSH 会话 ID，不碰任何会话日志文件。
// 需求目录里放的是原型、设计稿和测试证据；需求删了，这些文件就成了孤儿。
// 只删「目录名和这条需求对得上」的目录（用户手工改过名或改过路径的不动），
// 并且必须落在工作台顶级文件夹内。`state` 是删除前的快照，用来按迭代推导规范目录；
// 推导只对删除人自己做，且同迭代里没有同名需求时才做，避免误删别人的同名目录。
export function removeRequirementFolders(local, requirement, state, actorId) {
  const slug = slugTitle(requirement.title ?? '')
  const code = typeof requirement.code === 'string' ? safeSegment(requirement.code, '') : ''
  // 同名需求会得到「标题 (2)」这样的目录名（ensureRequirementFolder 的 unique），
  // 早期版本则是「编号-标题」。
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`^${escaped} \\(\\d+\\)$`),
    ...(code === '' ? [] : [new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${escaped}$`)]),
  ]
  const matches = (name) => name === slug || patterns.some(pattern => pattern.test(name))
  // 别的需求还占着同一个目录时不能删（同名冲突或手工映射）。
  const claimedByOthers = new Set()
  for (const user of Object.values(local.users)) {
    for (const [id, value] of Object.entries(user?.folders ?? {})) {
      if (id !== requirement.id && typeof value === 'string' && value !== '') claimedByOthers.add(path.resolve(value))
    }
  }
  const removed = []
  const failures = []
  const seen = new Set()
  const removeOne = (target) => {
    if (seen.has(target)) return
    seen.add(target)
    if (!fs.existsSync(target)) return
    try {
      fs.rmSync(target, { recursive: true, force: true })
      removed.push(target)
    } catch (reason) {
      failures.push({ path: target, error: reason instanceof Error ? reason.message : String(reason) })
    }
  }
  // 同迭代里还有同名需求时，推导出的规范目录可能属于别人（同名会自动加「 (2)」，
  // 但删除后编号会重排），这种情况只信 folders 映射。
  const sameNameInIteration = (state?.requirements ?? []).some(item => (
    item.id !== requirement.id
    && item.iterationId === requirement.iterationId
    && slugTitle(item.title ?? '') === slug
  ))
  for (const userId of Object.keys(local.users)) {
    const localState = localUser(local, userId)
    const baseDir = baseDirFor(local, userId)
    const candidates = []
    const stored = localState.folders?.[requirement.id]
    if (typeof stored === 'string' && stored.trim() !== '') candidates.push(stored)
    // 老数据没有 folders 映射：按迭代目录 + 标题（或「编号-标题」）推导。
    // 只对删除人自己的目录做推导，别人的本机目录不归这次删除管。
    if (userId === actorId && state !== null && state !== undefined && !sameNameInIteration) {
      try {
        const derived = folderPathFor(localState, baseDir, state, requirement)
        if (derived !== '') candidates.push(derived)
      } catch { /* 推导失败就只清映射里的那个 */ }
    }
    for (const candidate of candidates) {
      let target
      try {
        target = assertLocalFolderInside(baseDir, candidate, '需求目录')
      } catch (reason) {
        failures.push({ path: candidate, error: reason instanceof Error ? reason.message : String(reason) })
        continue
      }
      if (!matches(path.basename(target)) || claimedByOthers.has(path.resolve(target))) continue
      removeOne(target)
    }
  }
  return { removed, failures }
}

export function forgetRequirementLocalState(local, requirement) {
  const recordIds = new Set((requirement.sessions ?? []).map(record => record.id))
  const dshSessionIds = new Set()
  for (const user of Object.values(local.users)) {
    if (user === null || typeof user !== 'object') continue
    for (const recordId of recordIds) {
      const mapping = user.sessions?.[recordId]
      if (mapping?.dshSessionId) dshSessionIds.add(mapping.dshSessionId)
      if (user.sessions) delete user.sessions[recordId]
    }
    if (user.folders) delete user.folders[requirement.id]
    if (user.prototypeSync) delete user.prototypeSync[requirement.id]
    if (user.prototypeMirror) delete user.prototypeMirror[requirement.id]
    if (user.testSync) delete user.testSync[requirement.id]
  }
  for (const user of Object.values(local.users)) {
    if (user === null || typeof user !== 'object') continue
    for (const dshSessionId of dshSessionIds) {
      if (user.dshSessions) delete user.dshSessions[dshSessionId]
      if (user.sessionOwners) delete user.sessionOwners[dshSessionId]
      if (user.sessionUsers) delete user.sessionUsers[dshSessionId]
      if (user.greetedSessions) delete user.greetedSessions[dshSessionId]
    }
  }
  saveLocal(local)
  return [...dshSessionIds]
}

// 设计稿以团队服务端保存的交付产物为准：设计师本机文件只在本人界面上补充，
// 其他角色也能看到同一份原型和预览图。
export function attachDesignScreens(requirement) {
  const artifacts = Array.isArray(requirement.artifacts) ? requirement.artifacts : []
  const localFiles = Array.isArray(requirement.designFiles) ? requirement.designFiles : []
  const localNames = new Set(localFiles.map(file => file.name))
  const screens = localFiles.map(file => ({
    source: 'local',
    kind: 'html',
    name: file.name,
    relativePath: file.relativePath,
    updatedAt: file.updatedAt,
    size: file.size,
  }))
  for (const artifact of artifacts) {
    if (artifact.kind !== 'design' || typeof artifact.name !== 'string') continue
    if (!/\.html?$/i.test(artifact.name)) continue
    if (localNames.has(path.basename(artifact.name))) continue
    if (screens.some(screen => screen.name === artifact.name)) continue
    screens.push({
      source: 'server',
      kind: 'html',
      name: artifact.name,
      artifactId: artifact.id,
      version: artifact.designVersion ?? null,
      updatedAt: artifact.createdAt,
      size: artifact.size,
    })
  }
  const images = artifacts
    .filter(artifact => artifact.kind === 'design' && typeof artifact.name === 'string')
    .filter(artifact => /^image\//i.test(String(artifact.contentType || '')))
    .filter(artifact => !/\.html?$/i.test(artifact.name))
    .map(artifact => ({
      source: 'server',
      kind: 'image',
      name: artifact.name,
      artifactId: artifact.id,
      version: artifact.designVersion ?? null,
      updatedAt: artifact.createdAt,
      size: artifact.size,
    }))
  requirement.designScreens = screens
  requirement.designImages = images
}
