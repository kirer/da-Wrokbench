import { httpError } from './util.js'
import { serverAs } from './server.js'
import { findMappedRecord } from './state.js'
import { statusLabel, actionLabel, userName, requirementSummaryLine } from './format.js'
import { actorIdFromExec, stateFor, requirementFolder, prepareDesignDelivery, submitRequirementNow, iterationFromState } from './ops.js'
import { currentWorkbenchRole, onWorkbenchRoleChange, roleCanUse } from './skills.js'

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export async function commandRequirementRef(local, actorId, agent, explicit) {
  const value = String(explicit ?? '').trim()
  if (value !== '') return value
  const dshSessionId = agent?.session?.id
  if (typeof dshSessionId !== 'string' || dshSessionId === '') {
    throw httpError(400, '请在已绑定需求的会话里调用，或给出需求编号')
  }
  const recordId = findMappedRecord(local, actorId, dshSessionId)
  if (recordId === null) {
    throw httpError(400, '当前会话还没有绑定需求，请给出需求编号')
  }
  const data = await serverAs(actorId, `/requirements/by-session/${encodeURIComponent(recordId)}`)
  if (!data.requirement) {
    throw httpError(404, '当前会话关联的需求不存在')
  }
  return data.requirement.id
}

// 斜杠命令也按身份隔离：每个身份只出现一个 *-now 直达命令，动作和同名
// 技能一一对应，但不经过模型。技能负责“帮我把事做了”，命令负责“立刻做”。
export const COMMANDS = [
  {
    name: 'req-now',
    roles: ['product'],
    description: '产品直达：submit 提交需求（固化当前原型版本）/ status 查看需求状态',
    hint: 'submit|status [需求编号]',
    async run(local, { agent, rawInput }) {
      const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
      const action = parts.shift() ?? ''
      const actorId = actorIdFromExec(local, { agent })
      if (action === 'submit') {
        const { state, requirement } = await commandStateAndRequirement(local, actorId, agent, parts.shift() ?? '')
        const result = await submitRequirementNow(local, actorId, state, requirement)
        const versions = result.requirement.prototypeVersions ?? []
        const version = versions.length > 0 ? `，原型已固化为 v${versions[versions.length - 1].version}` : ''
        return { kind: 'success', text: `已提交 ${result.requirement.code}「${result.requirement.title}」（v${result.requirement.versions.length}）${version}。` }
      }
      if (action === 'status') {
        const { state, requirement } = await commandStateAndRequirement(local, actorId, agent, parts.shift() ?? '')
        return { kind: 'success', text: commandStatusText(state, requirement) }
      }
      return { kind: 'error', text: '用法：/req-now submit|status [需求编号]' }
    },
  },
  {
    name: 'design-now',
    roles: ['design'],
    description: '设计直达：claim 认领 / deliver 交付 / status 查看状态',
    hint: 'claim|deliver|status [需求编号]',
    async run(local, { agent, rawInput }) {
      const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
      const action = parts.shift() ?? ''
      const actorId = actorIdFromExec(local, { agent })
      if (action === 'claim') {
        const { requirement } = await commandStateAndRequirement(local, actorId, agent, parts.shift() ?? '')
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(requirement.id)}/design-claim`, 'POST', {})
        return { kind: 'success', text: `已认领 ${result.requirement.code} 的设计。` }
      }
      if (action === 'deliver') {
        const { state, requirement } = await commandStateAndRequirement(local, actorId, agent, parts.shift() ?? '')
        const folder = requirementFolder(local, actorId, state, requirement)
        // 和交付工具走同一套：只传文件名不上传，别的角色在需求页看不到设计稿。
        const { files, upload, pendingArtifactIds } = await prepareDesignDelivery(
          local, actorId, state, requirement, folder, [],
        )
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(requirement.id)}/design-deliver`, 'POST', {
          files,
          artifactIds: [...new Set([...upload.artifactIds, ...pendingArtifactIds])],
        })
        const warning = upload.warnings.length > 0 ? ` ${upload.warnings.length} 个支持文件未能上传，预览可能缺少样式。` : ''
        return { kind: 'success', text: `已交付 ${result.requirement.code} 的设计（d${result.requirement.designVersions.length}）。${warning}` }
      }
      if (action === 'status') {
        const { state, requirement } = await commandStateAndRequirement(local, actorId, agent, parts.shift() ?? '')
        return { kind: 'success', text: commandStatusText(state, requirement) }
      }
      return { kind: 'error', text: '用法：/design-now claim|deliver|status [需求编号]' }
    },
  },
  {
    name: 'dev-now',
    roles: ['dev'],
    description: '开发直达：claim|start|finish|reopen 平台 [说明] / status 查看状态',
    hint: 'claim|start|finish|reopen 平台 [说明]',
    async run(local, { agent, rawInput }) {
      const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
      const action = parts.shift() ?? ''
      const actorId = actorIdFromExec(local, { agent })
      if (action === 'status') {
        const { state, requirement } = await commandStateAndRequirement(local, actorId, agent, parts.shift() ?? '')
        return { kind: 'success', text: commandStatusText(state, requirement) }
      }
      const platformId = parts.shift() ?? ''
      if (!['claim', 'start', 'finish', 'reopen'].includes(action) || platformId === '') {
        return { kind: 'error', text: '用法：/dev-now claim|start|finish|reopen 平台 [说明]' }
      }
      const ref = await commandRequirementRef(local, actorId, agent, '')
      const body = action === 'finish' ? { platformId, note: parts.join(' ') } : { platformId }
      const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/dev-${action}`, 'POST', body)
      return { kind: 'success', text: `已${actionLabel(action)}：${result.requirement.code} 的 ${platformId}，需求状态 ${statusLabel(result.requirement.status)}。` }
    },
  },
  {
    name: 'test-now',
    roles: ['qa'],
    description: '测试直达：claim|start|pass|fail [说明] / status 查看状态',
    hint: 'claim|start|pass|fail [说明]',
    async run(local, { agent, rawInput }) {
      const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
      const action = parts.shift() ?? ''
      const actorId = actorIdFromExec(local, { agent })
      if (action === 'status') {
        const { state, requirement } = await commandStateAndRequirement(local, actorId, agent, parts.shift() ?? '')
        return { kind: 'success', text: commandStatusText(state, requirement) }
      }
      if (!['claim', 'start', 'pass', 'fail'].includes(action)) {
        return { kind: 'error', text: '用法：/test-now claim|start|pass|fail [说明]' }
      }
      const ref = await commandRequirementRef(local, actorId, agent, '')
      const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/test-${action}`, 'POST', {
        note: parts.join(' '),
      })
      return { kind: 'success', text: `已${action === 'claim' ? '认领测试' : action === 'start' ? '开始测试' : actionLabel(action)}，${result.requirement.code} 当前状态 ${statusLabel(result.requirement.status)}。` }
    },
  },
  {
    name: 'lead-now',
    roles: ['lead'],
    description: '负责人直达：review / schedule / scope / release / assign-dev / iteration / status',
    hint: 'review|schedule|scope|release|assign-dev|iteration|status ...',
    async run(local, { agent, rawInput }) {
      const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean)
      const action = parts.shift() ?? ''
      const actorId = actorIdFromExec(local, { agent })
      if (action === 'iteration') {
        const iterRef = parts.shift() ?? ''
        const state = await stateFor(actorId)
        const iteration = iterationFromState(state, iterRef)
        if (!iteration) return { kind: 'error', text: `找不到迭代「${iterRef}」` }
        const requirements = state.requirements.filter(item => item.iterationId === iteration.id)
        const inScope = requirements.filter(item => item.inScope).length
        const pending = requirements.filter(item => item.status === 'pending_review').length
        return {
          kind: 'success',
          text: `迭代 ${iteration.code}「${iteration.name}」：需求 ${requirements.length} 个，本期 ${inScope} 个，待评审 ${pending} 个。\n`
            + [...requirements].sort((a, b) => a.code.localeCompare(b.code))
              .map(item => `- ${requirementSummaryLine(state, item)}`)
              .join('\n'),
        }
      }
      if (action === 'review') {
        let explicit = ''
        if (parts.length > 0 && !['approve', 'reject', '通过', '退回'].includes(parts[0])) explicit = parts.shift()
        const ref = await commandRequirementRef(local, actorId, agent, explicit)
        const decisionText = parts.shift() ?? ''
        const decision = ['approve', '通过'].includes(decisionText)
          ? 'approve'
          : ['reject', '退回'].includes(decisionText)
            ? 'reject'
            : ''
        if (decision === '') return { kind: 'error', text: '用法：/lead-now review [需求编号] approve|reject [评审意见]' }
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/review`, 'POST', {
          decision,
          comment: parts.join(' '),
        })
        return { kind: 'success', text: `已${result.review.decision === 'approved' ? '通过' : '退回'} ${result.requirement.code}，当前状态：${statusLabel(result.requirement.status)}。` }
      }
      if (action === 'schedule') {
        let explicit = ''
        if (parts.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) explicit = parts.shift()
        const ref = await commandRequirementRef(local, actorId, agent, explicit)
        const startDate = parts.shift() ?? ''
        const endDate = parts.shift() ?? ''
        const estimates = []
        while (parts.length > 0) {
          const match = /^([A-Za-z0-9-]+)=(\d+(?:\.\d+)?)$/.exec(parts[0])
          if (!match) break
          estimates.push({ platformId: match[1], days: Number(match[2]) })
          parts.shift()
        }
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/schedule`, 'POST', { startDate, endDate, estimates })
        return { kind: 'success', text: `已排期 ${result.requirement.code}：${result.requirement.plannedStartDate ?? '待定'} ~ ${result.requirement.plannedEndDate ?? '待定'}${estimates.length > 0 ? `，估时 ${estimates.map(item => `${item.platformId} ${item.days} 人天`).join('、')}` : ''}。` }
      }
      if (action === 'scope') {
        let explicit = ''
        if (parts.length > 0 && !['in', 'out', '纳入', '移出'].includes(parts[0])) explicit = parts.shift()
        const ref = await commandRequirementRef(local, actorId, agent, explicit)
        const scopeText = parts.shift() ?? ''
        const inScope = ['in', '纳入'].includes(scopeText)
          ? true
          : ['out', '移出'].includes(scopeText)
            ? false
            : null
        if (inScope === null) return { kind: 'error', text: '用法：/lead-now scope [需求编号] in|out [原因]' }
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/scope`, 'POST', {
          inScope,
          reason: parts.join(' '),
        })
        return { kind: 'success', text: `已把 ${result.requirement.code} ${result.requirement.inScope ? '纳入本期范围' : '移出本期范围（暂缓）'}。` }
      }
      if (action === 'release') {
        const sub = parts.shift() ?? ''
        if (!['freeze', 'unfreeze', 'release'].includes(sub)) {
          return { kind: 'error', text: '用法：/lead-now release freeze|unfreeze|release [版本号]' }
        }
        const ref = await commandRequirementRef(local, actorId, agent, '')
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/${sub}`, 'POST', {
          version: parts.join(' '),
        })
        return { kind: 'success', text: `已执行 ${sub}，${result.requirement.code} 当前状态 ${statusLabel(result.requirement.status)}。` }
      }
      if (action === 'assign-dev') {
        const platformId = parts.shift() ?? ''
        const assigneeId = parts.shift() ?? ''
        if (platformId === '' || assigneeId === '') {
          return { kind: 'error', text: '用法：/lead-now assign-dev 平台 开发用户' }
        }
        const ref = await commandRequirementRef(local, actorId, agent, '')
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(ref)}/dev-assign`, 'POST', { platformId, assigneeId })
        const assignee = userName(await stateFor(actorId), assigneeId) ?? assigneeId
        return { kind: 'success', text: `已把 ${result.requirement.code} 的 ${platformId} 指派给 ${assignee}。` }
      }
      if (action === 'status') {
        const { state, requirement } = await commandStateAndRequirement(local, actorId, agent, parts.shift() ?? '')
        return { kind: 'success', text: commandStatusText(state, requirement) }
      }
      return { kind: 'error', text: '用法：/lead-now review|schedule|scope|release|assign-dev|iteration|status ...' }
    },
  },
]

export async function commandStateAndRequirement(local, actorId, agent, explicit) {
  const ref = await commandRequirementRef(local, actorId, agent, explicit)
  const state = await stateFor(actorId)
  const requirement = state.requirements.find(item => item.code.toLowerCase() === ref.toLowerCase() || item.id === ref)
  if (!requirement) throw httpError(404, `找不到需求「${ref}」`)
  return { state, requirement }
}

export function commandStatusText(state, requirement) {
  return `${requirementSummaryLine(state, requirement)}。\n`
    + `需求 v${requirement.versions.length}，原型版本 ${(requirement.prototypeVersions ?? []).length}，设计 d${requirement.designVersions.length}，`
    + `开发 ${requirement.devTasks.filter(task => task.status === 'done').length}/${requirement.devTasks.length}，`
    + `会话 ${requirement.sessions.length} 个。`
}

export function registerCommands(ctx, local) {
  ctx.inject(['commands'], (sub) => {
    let disposers = []
    const sync = () => {
      for (const dispose of disposers) {
        try { dispose() } catch { /* 已卸载 */ }
      }
      disposers = []
      const role = currentWorkbenchRole(local)
      for (const definition of COMMANDS) {
        if (!roleCanUse(role, definition.roles)) continue
        try {
          disposers.push(sub.commands.register({
            name: definition.name,
            description: definition.description,
            input: { hint: definition.hint },
            handler: async (invocation) => {
              try {
                // 命令面板可能停留在旧身份上：执行前再按当前身份挡一次。
                if (!roleCanUse(currentWorkbenchRole(local), definition.roles)) {
                  return { kind: 'error', text: `当前身份没有 /${definition.name}，请先切换到对应身份。` }
                }
                return await definition.run(local, invocation)
              } catch (reason) {
                return { kind: 'error', text: reason instanceof Error ? reason.message : String(reason) }
              }
            },
          }))
        } catch (reason) {
          ctx.logger?.warn?.(`[dsh-workbench] 注册命令 /${definition.name} 失败：${reason instanceof Error ? reason.message : String(reason)}`)
        }
      }
    }
    sync()
    const offRoleChange = onWorkbenchRoleChange(sync)
    if (typeof sub.effect === 'function') {
      sub.effect(() => offRoleChange, 'dsh-workbench: 身份变化时切换斜杠命令')
    }
  })
}
