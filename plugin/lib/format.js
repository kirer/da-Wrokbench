export function actorLabel(state, actorId) {
  return state.users.find(user => user.id === actorId)?.name ?? actorId
}

export function platformNames(state, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return '未设置平台'
  return ids
    .map(id => state.platforms.find(platform => platform.id === id)?.shortName ?? id)
    .join('、')
}

export const EXPERIENCE_ROLE_LABELS = {
  product: '产品',
  design: '设计',
  dev: '开发',
  qa: '测试',
  lead: '负责人',
  admin: '管理员',
}

export function experienceRoleLabel(role) {
  return EXPERIENCE_ROLE_LABELS[role] ?? role
}

// 相似需求只读标题和文档，不把整份正文塞进请求。
export function experienceQuery(requirement) {
  const document = requirement?.document ?? {}
  return [requirement?.title, document.summary, document.body]
    .filter(value => typeof value === 'string' && value.trim() !== '')
    .join('\n')
    .slice(0, 3000)
}

export function experienceHint(user) {
  if (!user) return ''
  const platforms = (user.platforms ?? [])
    .map(item => `${item.name} ${item.requirements} 个`)
    .join('、')
  const open = user.openTasks > 0 ? `，未完成 ${user.openTasks}` : ''
  return platforms !== '' ? `，经验：${platforms}${open}` : open
}

export function formatExperience(data, requirement) {
  const matches = Array.isArray(data?.matches) ? data.matches : []
  const users = (Array.isArray(data?.users) ? data.users : []).slice(0, 12)
  const lines = [requirement ? `经验参考：${requirement.code}「${requirement.title}」` : '经验参考', '']
  if (matches.length === 0) {
    lines.push('相似历史需求：没有找到。')
  } else {
    lines.push('相似历史需求：')
    for (const match of matches) {
      const platforms = (match.platforms ?? []).map(item => item.name).join('、') || '未设置'
      const contributors = (match.contributors ?? [])
        .map(item => `${item.name}（${experienceRoleLabel(item.role)}${item.platform ? `·${item.platform}` : ''}）`)
        .join('、') || '无记录'
      lines.push(`- ${match.code}「${match.title}」涉及 ${platforms}；参与：${contributors}${match.summary ? `；${match.summary}` : ''}`)
    }
  }
  lines.push('', '人员经验：')
  if (users.length === 0) {
    lines.push('- 还没有可参考的参与记录。')
  } else {
    for (const user of users) {
      const platforms = (user.platforms ?? []).map(item => `${item.name} ${item.requirements} 个`).join('、')
      const recent = (user.recent ?? [])[0]
      const recentText = recent ? `；最近 ${recent.code}「${recent.title}」${recent.platform ? `（${recent.platform}）` : ''}` : ''
      lines.push(
        `- ${user.name}（${(user.roles ?? []).map(experienceRoleLabel).join('/') || '—'}）：`
        + `${platforms || '暂无平台记录'}，共 ${user.requirements} 个需求${user.projects > 0 ? `、${user.projects} 个项目` : ''}`
        + `，当前未完成开发 ${user.openTasks}${recentText}`,
      )
    }
  }
  return lines.join('\n')
}

export function sessionTypeLabel(type) {
  if (type === 'design') return '设计'
  if (type === 'review') return '评审'
  if (type === 'dev') return '开发'
  if (type === 'test') return '测试'
  return '需求'
}

export function statusLabel(status) {
  return ({
    draft: '草稿',
    creating: '创建中',
    create_failed: '创建失败',
    pending_review: '待评审',
    changes_requested: '待修改',
    approved: '已通过',
    scheduled: '已排期',
    backlog: '已暂缓',
    in_progress: '开发中',
    dev_done: '待测试',
    testing: '测试中',
    test_failed: '测试不通过',
    test_passed: '测试通过',
    frozen: '已冻结',
    released: '已发布',
    done: '已完成',
    cancelled: '已取消',
  })[status] ?? status
}

// 设计状态和测试结论在数据里是英文枚举；给人和模型看的一行摘要要写成中文。
export const DESIGN_STATUS_LABELS = {
  not_needed: '无需设计',
  unclaimed: '设计待认领',
  designing: '设计中',
  delivered: '设计已交付',
  changes_requested: '设计待修改',
}

export const TEST_RUN_LABELS = {
  running: '测试中',
  passed: '测试通过',
  failed: '测试不通过',
}

export function designStatusLabel(status) {
  return DESIGN_STATUS_LABELS[status] ?? status
}

export const DEV_TASK_STATUS_LABELS = {
  unassigned: '待指派',
  assigned: '已指派',
  in_progress: '开发中',
  done: '已完成',
}

export function devTaskStatusLabel(status) {
  return DEV_TASK_STATUS_LABELS[status] ?? status
}

// 工具和命令回执里的动作名写成中文，不把 assign / pass 这类枚举值直接甩给人。
export const ACTION_LABELS = {
  assign: '指派开发',
  claim: '认领',
  start: '开始',
  finish: '完成开发',
  reopen: '重新打开开发',
  pass: '判定测试通过',
  fail: '判定测试不通过',
  freeze: '冻结',
  unfreeze: '解冻',
  release: '发布',
  complete: '完成验收',
  cancel: '取消需求',
}

export function actionLabel(action) {
  return ACTION_LABELS[action] ?? action
}

export function platformLabel(state, platformId) {
  return state.platforms.find(item => item.id === platformId)?.shortName ?? platformId
}

// 按 id 找人名；找不到时返回 null，由调用方决定显示什么。
export function userName(state, userId) {
  if (typeof userId !== 'string' || userId === '') return null
  return state.users.find(user => user.id === userId)?.name ?? null
}

export function testRunLabel(status) {
  return TEST_RUN_LABELS[status] ?? status
}

export function requirementSummaryLine(state, requirement) {
  const iteration = (state.iterations || []).find(item => item.id === requirement.iterationId)
  const dates = requirement.plannedStartDate || requirement.plannedEndDate
    ? `，计划 ${requirement.plannedStartDate ?? '待定'} ~ ${requirement.plannedEndDate ?? '待定'}`
    : ''
  const dev = Array.isArray(requirement.devTasks) && requirement.devTasks.length > 0
    ? `，开发 ${requirement.devTasks.filter(task => task.status === 'done').length}/${requirement.devTasks.length}`
    : ''
  const latestTest = Array.isArray(requirement.testRuns) && requirement.testRuns.length > 0
    ? `，测试 ${testRunLabel(requirement.testRuns[requirement.testRuns.length - 1].status)}`
    : ''
  return `${requirement.code}「${requirement.title}」：${statusLabel(requirement.status)}`
    + `${requirement.inScope ? '（本期）' : '（范围外）'}${dates}${dev}${latestTest}`
    + `，设计 ${designStatusLabel(requirement.designStatus)}${requirement.designUpdatedAt ? '（已更新）' : ''}`
    + `，负责人 ${state.users.find(user => user.id === requirement.ownerId)?.name ?? requirement.ownerId}`
    + `，平台 ${platformNames(state, requirement.platformIds)}`
    + (iteration ? `，迭代 ${iteration.code}` : '')
}
