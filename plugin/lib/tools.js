import path from 'node:path'
import { httpError } from './util.js'
import { localUser, baseDirFor, listDesignFiles, listPrototypeFiles } from './local.js'
import { serverAs } from './server.js'
import { findMappedRecord } from './state.js'
import { platformNames, experienceQuery, experienceHint, formatExperience, statusLabel, designStatusLabel, devTaskStatusLabel, actionLabel, userName, testRunLabel, requirementSummaryLine } from './format.js'
import { actorIdFromExec, stateFor, requirementForExec, requirementFolder, ensureRequirementFolderFor, prepareDesignDelivery, submitRequirementNow, actionOnRequirement, iterationFromState } from './ops.js'

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

export function toolOutput(text) {
  return { text }
}

export function defineTool(name, description, parameters, execute) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: String(value.text ?? '') }],
    },
    execute,
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function registerTools(ctx, local) {
  ctx.inject(['tools'], (sub) => {
    sub.tools.register(defineTool(
      'workbench_submit_requirement',
      '提交研发工作台中的需求，进入待评审；待评审中也能再提交（相当于变更，生成 v2、v3…，评审按最新一版重新开始）。提交前先用 workbench_assignment_options 给出设计/开发/测试分工建议并让用户选择，assignments 只放用户明确选的人；用户说不用指定就省略。提交前还要跟用户确认涉及端和是否需要设计：只有用户明确说要改端、或说这条需求不需要设计时，才传 platformIds / designNotNeeded。参数 requirement 可省略：当前会话已绑定需求时自动取会话对应的需求。仅在用户明确要求提交需求/送评审时调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号，例如 S11-008；省略则取当前会话绑定的需求' },
          summary: { type: 'string', description: '本次提交摘要' },
          platformIds: {
            type: 'array',
            description: '用户明确确认后的涉及端平台 id 列表（如 ["web"]），会整体替换当前范围；不传表示不改',
            items: { type: 'string' },
          },
          designNotNeeded: { type: 'boolean', description: '用户明确说这条需求不需要设计交付时传 true；传 false 撤销无需设计；不传表示不改' },
          assignments: {
            type: 'object',
            description: '提交时定下的分工，都省略就留待认领',
            additionalProperties: false,
            properties: {
              designerId: { type: 'string', description: '设计负责人用户 id' },
              testerId: { type: 'string', description: '测试负责人用户 id' },
              dev: {
                type: 'array',
                description: '各端开发负责人',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    platformId: { type: 'string', description: '平台 id，例如 trade-server / web' },
                    assigneeId: { type: 'string', description: '开发负责人用户 id' },
                  },
                  required: ['platformId', 'assigneeId'],
                },
              },
            },
          },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { state, requirement } = await requirementForExec(local, actorId, args, exec)
        const result = await submitRequirementNow(local, actorId, state, requirement, args?.summary, args?.platformIds, args?.designNotNeeded, args?.assignments)
        const saved = result.requirement
        const prototypeVersions = saved.prototypeVersions ?? []
        const frozen = prototypeVersions.length > 0
          ? `，原型固化为 v${prototypeVersions[prototypeVersions.length - 1].version}`
          : ''
        const assigned = []
        if (saved.designerId) assigned.push(`设计 ${state.users.find(user => user.id === saved.designerId)?.name ?? saved.designerId}`)
        for (const task of saved.devTasks ?? []) {
          if (!task.assigneeId) continue
          const platform = state.platforms.find(item => item.id === task.platformId)?.shortName ?? task.platformId
          assigned.push(`${platform} ${state.users.find(user => user.id === task.assigneeId)?.name ?? task.assigneeId}`)
        }
        if (saved.testerId) assigned.push(`测试 ${state.users.find(user => user.id === saved.testerId)?.name ?? saved.testerId}`)
        return toolOutput(
          `已提交 ${saved.code}「${saved.title}」，当前状态：${statusLabel(saved.status)}（v${saved.versions.length}${frozen}）。`
          + `涉及端：${platformNames(state, saved.platformIds)}；设计：${designStatusLabel(saved.designStatus)}。`
          + `分工：${assigned.length > 0 ? assigned.join('、') : '未指定，留给团队认领'}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_assignment_options',
      '提交需求前给范围与分工建议用：先给出相似历史需求（用来判断涉及端），再列出可以指派的设计、各端开发、测试人员（带用户 id、平台经验、当前未完成开发数）。只读；用户说不用指定任何人时就不要传给提交工具。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { state, requirement } = await requirementForExec(local, actorId, args, exec)
        // 经验只用来排序和给理由，拿不到也不影响分工建议。
        let experience = null
        try {
          experience = await serverAs(actorId, '/experience', 'POST', {
            query: experienceQuery(requirement),
            exclude: requirement.id,
            limit: 3,
          })
        } catch { /* 经验接口失败时退回纯角色/平台匹配 */ }
        const historyOf = id => (experience?.users ?? []).find(user => user.id === id) ?? null
        const rolesOf = user => (Array.isArray(user.roles) ? user.roles : [])
        const canPlan = user => rolesOf(user).some(role => role === 'lead' || role === 'admin')
        const active = (state.users ?? []).filter(user => user.active !== false)
        const line = user => `${user.name}（id ${user.id}${canPlan(user) ? '，负责人' : ''}${experienceHint(historyOf(user.id))}）`
        const design = active.filter(user => rolesOf(user).includes('design') || canPlan(user))
        const test = active.filter(user => rolesOf(user).includes('qa') || canPlan(user))
        const nameOf = id => state.users.find(user => user.id === id)?.name ?? id
        const current = []
        if (requirement.designerId) current.push(`设计 ${nameOf(requirement.designerId)}`)
        for (const task of requirement.devTasks ?? []) {
          if (!task.assigneeId) continue
          const platform = state.platforms.find(item => item.id === task.platformId)?.shortName ?? task.platformId
          current.push(`${platform} ${nameOf(task.assigneeId)}`)
        }
        if (requirement.testerId) current.push(`测试 ${nameOf(requirement.testerId)}`)
        const devLines = (requirement.platformIds ?? []).map(platformId => {
          const platform = state.platforms.find(item => item.id === platformId)
          const users = active.filter(user => {
            if (!(rolesOf(user).includes('dev') || canPlan(user))) return false
            if (canPlan(user)) return true
            const owned = Array.isArray(user.platforms) ? user.platforms : []
            return owned.length === 0 || owned.includes(platformId)
          })
          return `开发 · ${platform?.name ?? platformId}：${users.length > 0 ? users.map(line).join('、') : '暂无可指派的人'}`
        })
        const similar = (experience?.matches ?? []).map(match => {
          const platforms = (match.platforms ?? []).map(item => item.name).join('、') || '未设置'
          const people = (match.contributors ?? [])
            .map(item => `${item.name}${item.platform ? `·${item.platform}` : ''}`)
            .join('、')
          return `- ${match.code}「${match.title}」涉及 ${platforms}${people ? `；参与：${people}` : ''}`
        })
        return toolOutput(
          `${requirement.code}「${requirement.title}」涉及端：${platformNames(state, requirement.platformIds)}；`
          + `设计：${designStatusLabel(requirement.designStatus)}。\n`
          + (similar.length > 0
            ? `相似历史需求（用来判断涉及端，确认不需要的端再改）：\n${similar.join('\n')}\n`
            : '相似历史需求：没有找到。\n')
          + `可指派的人（提交时把 id 放进 assignments）：\n`
          + `设计：${requirement.designStatus === 'not_needed' ? '无需设计，不用指派' : design.length > 0 ? design.map(line).join('、') : '暂无可指派的人'}\n`
          + `${devLines.join('\n')}\n`
          + `测试：${test.length > 0 ? test.map(line).join('、') : '暂无可指派的人'}\n`
          + `当前分工：${current.length > 0 ? current.join('、') : '未指定，留给团队认领'}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_experience',
      '查询团队经验：根据一段需求描述找出相似的历史需求、它们涉及的端和参与人，并汇总每个人的项目/需求经历、平台经验和当前未完成开发任务数。用来推荐涉及端和合适的人。参数 requirement 可省略：当前会话已绑定需求时自动取；query 可省略，默认用需求标题和文档。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          query: { type: 'string', description: '用来找相似需求的一段描述；省略时用需求标题+文档' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const explicit = typeof args?.requirement === 'string' && args.requirement.trim() !== ''
        let query = typeof args?.query === 'string' ? args.query.trim() : ''
        let requirement = null
        if (explicit || query === '') {
          const resolved = await requirementForExec(local, actorId, args, exec)
          requirement = resolved.requirement
          if (query === '') query = experienceQuery(requirement)
        }
        const data = await serverAs(actorId, '/experience', 'POST', {
          query,
          exclude: requirement?.id ?? undefined,
          limit: 5,
        })
        return toolOutput(formatExperience(data, requirement))
      },
    ))

    sub.tools.register(defineTool(
      'workbench_update_document',
      '更新研发工作台需求的活文档（摘要、正文、验收标准）。仅在用户明确要求编写或更新需求文档时调用。参数 requirement 可省略：当前会话已绑定需求时自动取会话对应的需求。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          summary: { type: 'string', description: '需求摘要' },
          body: { type: 'string', description: '需求正文：背景、目标、范围、用户故事、交互流程、数据/接口说明等' },
          acceptanceCriteria: { type: 'string', description: '验收标准，建议逐条编号' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const payload = {}
        if (typeof args?.summary === 'string') payload.summary = args.summary
        if (typeof args?.body === 'string') payload.body = args.body
        if (typeof args?.acceptanceCriteria === 'string') payload.acceptanceCriteria = args.acceptanceCriteria
        const result = await actionOnRequirement(local, actorId, args, exec, 'document', payload)
        return toolOutput(`已更新 ${result.requirement.code}「${result.requirement.title}」的需求文档（v${result.requirement.document.version}）。`)
      },
    ))

    sub.tools.register(defineTool(
      'workbench_claim_design',
      '认领研发工作台中的设计任务，把设计状态改为设计中并记录当前设计人员。参数 requirement 可省略：当前会话已绑定需求时自动取会话对应的需求。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'design-claim', {})
        return toolOutput(`已认领 ${result.requirement.code}「${result.requirement.title}」的设计。`)
      },
    ))

    sub.tools.register(defineTool(
      'workbench_requirement_status',
      '查询研发工作台中一个需求的完整状态：需求/设计状态、范围、排期、评审、各平台开发任务、测试与发布。参数 requirement 可省略：当前会话已绑定需求时自动取会话对应的需求。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { state, requirement } = await requirementForExec(local, actorId, args, exec)
        const dev = (requirement.devTasks || []).length === 0
          ? '无'
          : requirement.devTasks.map(task => {
            const platform = state.platforms.find(item => item.id === task.platformId)?.shortName ?? task.platformId
            const owner = task.assigneeId ? state.users.find(user => user.id === task.assigneeId)?.name ?? task.assigneeId : '未指派'
            return `${platform} ${devTaskStatusLabel(task.status)}（${owner}）`
          }).join('；')
        const latestTest = (requirement.testRuns || []).length === 0
          ? '无'
          : requirement.testRuns[requirement.testRuns.length - 1]
        return toolOutput(
          `${requirementSummaryLine(state, requirement)}。\n`
          + `需求版本 v${requirement.versions.length}，设计版本 d${requirement.designVersions.length}，`
          + `设计人员 ${userName(state, requirement.designerId) ?? '未认领'}，测试人员 ${userName(state, requirement.testerId) ?? '未认领'}，会话 ${requirement.sessions.length} 个。\n`
          + `开发：${dev}\n`
          + `测试：${latestTest === '无' ? '无' : `${testRunLabel(latestTest.status)}${latestTest.note ? `（${latestTest.note}）` : ''}`}\n`
          + (requirement.release ? `发布：${requirement.release.version}（${requirement.release.at}）` : '发布：未发布'),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_design_context',
      '开始或继续一个需求的设计前调用：返回需求状态、设计状态、平台、需求文件夹（不存在时按需求名创建）和已有 HTML 文件。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { state, requirement } = await requirementForExec(local, actorId, args, exec)
        const baseDir = baseDirFor(local, actorId)
        const folder = ensureRequirementFolderFor(local, actorId, state, requirement)
        const files = listDesignFiles(folder, baseDir)
        const fileText = files.length === 0
          ? '无'
          : files.slice(0, 20).map(file => file.relativePath).join('、')
        const prototypes = listPrototypeFiles(folder, baseDir)
        const prototypeText = prototypes.length === 0
          ? '无'
          : prototypes.slice(0, 12).map(file => file.relativePath).join('、')
        // 只说相对会话工作目录的位置，不把本机绝对路径送进模型上下文；模型按这个
        // 相对路径就能写文件，不用再翻源码或猜目录。
        const dshSessionId = exec?.agent?.session?.id
        const recordId = typeof dshSessionId === 'string' && dshSessionId !== ''
          ? findMappedRecord(local, actorId, dshSessionId)
          : null
        const sessionRecord = recordId === null
          ? null
          : (requirement.sessions ?? []).find(item => item.id === recordId) ?? null
        const sessionFolder = recordId === null
          ? ''
          : localUser(local, actorId).sessions?.[recordId]?.folderPath ?? ''
        const relative = sessionFolder === '' ? '' : path.relative(sessionFolder, folder)
        const folderHint = relative !== '' && !path.isAbsolute(relative)
          ? `「${relative}」（相对当前会话工作目录）`
          : `「${path.basename(folder)}」`
        const isDesign = sessionRecord?.type === 'design'
        return toolOutput(
          `${requirement.code}「${requirement.title}」：需求状态 ${statusLabel(requirement.status)}，设计状态 ${requirement.designStatus}，`
          + `设计人员 ${requirement.designerId ?? '未认领'}，平台 ${platformNames(state, requirement.platformIds)}。\n`
          + `需求文件夹：${folderHint}，已在本机创建。\n`
          + `已有原型（${prototypes.length}${isDesign ? '，prototype/ 只作为需求参考，不参与设计交付' : ''}）：${prototypeText}。\n`
          + `已有设计文件（${files.length}）：${fileText}。\n`
          + (isDesign
            ? '这是设计会话：先加载 ui-design 技能；设计稿写进该需求文件夹的 design/（一屏一个 HTML），'
              + '不要覆盖 prototype/ 里的需求原型。需求页的设计画布会自动跟随 design/ 的文件刷新；'
              + '不要调用 wb_preview_page / wb_check_design / wb_look_design，也不要打开画布自带的独立预览面板。'
              + '交付时调用 workbench_deliver_design。'
            : '这是需求会话：做产品原型，一屏一个 HTML 写进该需求文件夹的 prototype/（相对路径见上），'
              + '不要写 design/，不要调用交付工具。写完后由用户在需求页产品卡右上角「打开原型画布」查看。'),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_deliver_design',
      '交付研发工作台中的设计：把设计状态改为已交付并记录设计版本。开发开始后交付会标记“设计已更新”。仅在用户明确要求交付设计/设计完成时调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          summary: { type: 'string', description: '本次设计交付摘要' },
          files: { type: 'array', items: { type: 'string' }, description: '相对需求文件夹的设计文件路径（如 design/01-overview.html）；省略时自动扫描' },
          artifactIds: { type: 'array', items: { type: 'string' }, description: '额外纳入本次设计版本的服务端附件 ID（如已上传的预览图）' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { state, requirement } = await requirementForExec(local, actorId, args, exec)
        const folder = requirementFolder(local, actorId, state, requirement)
        const { files, upload, pendingArtifactIds } = await prepareDesignDelivery(
          local, actorId, state, requirement, folder, args?.files,
        )
        const requested = Array.isArray(args?.artifactIds)
          ? args.artifactIds.filter(id => typeof id === 'string')
          : []
        const artifactIds = [...new Set([...upload.artifactIds, ...pendingArtifactIds, ...requested])]
        const result = await serverAs(actorId, `/requirements/${encodeURIComponent(requirement.id)}/design-deliver`, 'POST', {
          summary: args?.summary,
          files,
          artifactIds,
        })
        const latest = result.requirement.designVersions[result.requirement.designVersions.length - 1]
        return toolOutput(
          `已交付 ${result.requirement.code}「${result.requirement.title}」的设计（d${result.requirement.designVersions.length}），`
          + `状态：设计已交付。设计文件：${latest.files.join('、') || '未记录'}。`
          + (latest.artifactIds?.length ? `本次设计版本包含 ${latest.artifactIds.length} 个服务端文件。` : '')
          + (result.requirement.designUpdatedAt ? '开发已开始，已标记“设计已更新”。' : '')
          + (upload.warnings.length ? `上传提示：${upload.warnings.join('；')}` : ''),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_review_requirement',
      '评审研发工作台中的需求：decision=approve 通过，decision=reject 退回待修改。多人会签时必须全部通过。只有待评审的需求可以评审；仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          decision: { type: 'string', enum: ['approve', 'reject'], description: 'approve 通过；reject 退回修改' },
          comment: { type: 'string', description: '评审意见' },
        },
        required: ['decision'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'review', {
          decision: args?.decision,
          comment: args?.comment,
        })
        const waiting = result.requirement.reviewerIds.length > 0
          ? `会签人 ${result.requirement.reviewerIds.length} 位。`
          : ''
        return toolOutput(
          `已${result.review.decision === 'approved' ? '通过' : '退回'}评审 ${result.requirement.code}「${result.requirement.title}」，`
          + `当前状态：${statusLabel(result.requirement.status)}。${waiting}`
          + (result.requirement.inScope ? '已纳入本期范围。' : '当前不在本期范围。'),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_set_reviewers',
      '设置需求的会签人：只有待评审阶段可设置，所有人通过后需求才进入已通过。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          userIds: { type: 'array', items: { type: 'string' }, description: '会签人用户 id 列表' },
        },
        required: ['userIds'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'reviewers', {
          userIds: Array.isArray(args?.userIds) ? args.userIds : [],
        })
        const state = await stateFor(actorId)
        return toolOutput(
          `${result.requirement.code} 的会签人已设置为：${result.requirement.reviewerIds.map(id => userName(state, id) ?? id).join('、') || '无（单人评审）'}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_schedule_requirement',
      '给评审通过的需求排期：设置计划开始/结束日期（YYYY-MM-DD），可以只改一端；用户给出按端估时（人天）时一起填。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          startDate: { type: 'string', description: '计划开始日期 YYYY-MM-DD' },
          endDate: { type: 'string', description: '计划结束日期 YYYY-MM-DD' },
          estimates: {
            type: 'array',
            description: '按端估时（人天），只在用户明确给出估时时传，例如 [{ platformId: "trade-server", days: 3 }]',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['platformId', 'days'],
              properties: {
                platformId: { type: 'string', description: '平台 id，例如 trade-server / web' },
                days: { type: 'number', description: '估时人天，可带小数' },
                startDate: { type: 'string', description: '该端计划开始日期 YYYY-MM-DD（可选）' },
                endDate: { type: 'string', description: '该端计划结束日期 YYYY-MM-DD（可选）' },
                dependsOn: { type: 'array', items: { type: 'string' }, description: '该端依赖的其他平台 id（可选），用于联调先后' },
              },
            },
          },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'schedule', {
          startDate: args?.startDate,
          endDate: args?.endDate,
          estimates: Array.isArray(args?.estimates) ? args.estimates : [],
        })
        const state = await stateFor(actorId)
        const estimates = (result.requirement.devTasks ?? [])
          .filter(task => typeof task.estimateDays === 'number')
        const estimateText = estimates.length > 0
          ? `估时：${estimates.map(task => `${state.platforms.find(platform => platform.id === task.platformId)?.shortName ?? task.platformId} ${task.estimateDays} 人天`).join('、')}。`
          : ''
        return toolOutput(
          `已排期 ${result.requirement.code}「${result.requirement.title}」：`
          + `${result.requirement.plannedStartDate ?? '待定'} ~ ${result.requirement.plannedEndDate ?? '待定'}，`
          + `当前状态：${statusLabel(result.requirement.status)}。${estimateText}`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_scope_requirement',
      '调整需求的本期范围：inScope=true 纳入本期，inScope=false 移出到暂缓。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          inScope: { type: 'boolean', description: 'true 纳入本期；false 移出本期' },
          reason: { type: 'string', description: '范围调整原因' },
        },
        required: ['inScope'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const result = await actionOnRequirement(local, actorId, args, exec, 'scope', {
          inScope: args?.inScope,
          reason: args?.reason,
        })
        return toolOutput(
          `已把 ${result.requirement.code}「${result.requirement.title}」${result.requirement.inScope ? '纳入本期范围' : '移出本期范围（暂缓）'}，`
          + `当前状态：${statusLabel(result.requirement.status)}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_dev_action',
      '开发阶段操作：assign 按平台指派开发负责人（需 assigneeId）；claim 认领平台开发；start 开始开发（记录真实开发开始时间）；finish 完成开发（接了 GitLab 时创建合并请求）；reopen 重新打开开发。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          action: { type: 'string', enum: ['assign', 'claim', 'start', 'finish', 'reopen'], description: '开发操作' },
          platformId: { type: 'string', description: '平台 id，例如 trade-server / web / ios' },
          assigneeId: { type: 'string', description: 'assign 时的开发负责人用户 id' },
          note: { type: 'string', description: '完成开发备注' },
          actualDays: { type: 'number', description: 'finish 时填写实际投入人天（可选，不填按开始到完成时间推算）' },
          blockedReason: { type: 'string', description: 'finish 时填写阻塞原因/超时说明（可选，用于估时偏差复盘）' },
        },
        required: ['action', 'platformId'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const action = String(args?.action ?? '')
        const platformId = String(args?.platformId ?? '')
        const base = { platformId }
        let path = ''
        let body = base
        if (action === 'assign') {
          path = 'dev-assign'
          body = { ...base, assigneeId: args?.assigneeId }
        } else if (action === 'claim') {
          path = 'dev-claim'
        } else if (action === 'start') {
          path = 'dev-start'
        } else if (action === 'finish') {
          path = 'dev-finish'
          body = { ...base, note: args?.note, actualDays: args?.actualDays, blockedReason: args?.blockedReason }
        } else if (action === 'reopen') {
          path = 'dev-reopen'
        } else {
          throw httpError(400, 'action 只能是 assign / claim / start / finish / reopen')
        }
        const result = await actionOnRequirement(local, actorId, args, exec, path, body)
        const task = result.requirement.devTasks.find(item => item.platformId === platformId)
        const assignee = action === 'assign' ? userName(await stateFor(actorId), args?.assigneeId) : null
        return toolOutput(
          `已${actionLabel(action)}：${result.requirement.code}「${result.requirement.title}」的 ${platformId}`
          + (action === 'assign' && assignee ? `，开发负责人 ${assignee}` : '')
          + `。任务状态 ${task ? devTaskStatusLabel(task.status) : '未知'}，需求状态 ${statusLabel(result.requirement.status)}。`
          + (task?.estimateDays != null && task?.actualDays != null
            ? ` 估时 ${task.estimateDays} 人天 / 实际 ${task.actualDays} 人天。`
            : '')
          + (task?.blockedReason ? ` 阻塞：${task.blockedReason}。` : '')
          + (task?.mrUrl ? ` MR：${task.mrUrl}` : ''),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_test_action',
      '测试阶段操作：claim 认领测试负责人；start 开始测试；pass 测试通过；fail 测试不通过并记录缺陷。仅测试/负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          action: { type: 'string', enum: ['claim', 'start', 'pass', 'fail'], description: '测试操作' },
          note: { type: 'string', description: '测试结论说明' },
          bugUrl: { type: 'string', description: '测试不通过时的缺陷链接' },
        },
        required: ['action'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const action = String(args?.action ?? '')
        let path = ''
        let body = { note: args?.note, bugUrl: args?.bugUrl }
        if (action === 'claim') {
          path = 'test-claim'
          body = {}
        } else if (action === 'start') {
          path = 'test-start'
          body = {}
        } else if (action === 'pass') {
          path = 'test-pass'
        } else if (action === 'fail') {
          path = 'test-fail'
        } else {
          throw httpError(400, 'action 只能是 claim / start / pass / fail')
        }
        const result = await actionOnRequirement(local, actorId, args, exec, path, body)
        return toolOutput(
          `已对 ${result.requirement.code}「${result.requirement.title}」${action === 'claim' ? '认领测试' : action === 'start' ? '开始测试' : actionLabel(action)}，`
          + `当前状态：${statusLabel(result.requirement.status)}。`
          + (args?.bugUrl ? ` 缺陷：${args.bugUrl}` : ''),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_release_action',
      '发布阶段操作：freeze 测试通过后冻结；unfreeze 解冻；release 发布并记录版本号；complete 发布后完成验收（进入已完成）；cancel 取消/废弃需求。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          action: { type: 'string', enum: ['freeze', 'unfreeze', 'release', 'complete', 'cancel'], description: '发布/终态操作' },
          version: { type: 'string', description: 'release 时的版本号，例如 v1.2.0' },
        },
        required: ['action'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const action = String(args?.action ?? '')
        if (!['freeze', 'unfreeze', 'release', 'complete', 'cancel'].includes(action)) {
          throw httpError(400, 'action 只能是 freeze / unfreeze / release / complete / cancel')
        }
        const result = await actionOnRequirement(local, actorId, args, exec, action, {
          version: args?.version,
        })
        return toolOutput(
          `已${actionLabel(action)} ${result.requirement.code}「${result.requirement.title}」，`
          + `当前状态：${statusLabel(result.requirement.status)}。`
          + (result.requirement.release ? ` 发布版本：${result.requirement.release.version}。` : ''),
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_overview',
      '查看跨项目的人员负载总览：每个成员在手的开发任务数、估时人天与负责需求数。只读。',
      { type: 'object', additionalProperties: false, properties: {} },
      async (_args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const data = await serverAs(actorId, '/overview')
        const users = Array.isArray(data?.overview?.users) ? data.overview.users : []
        if (users.length === 0) return toolOutput('当前没有需要展示的人员负载。')
        const totals = data?.overview?.totals ?? {}
        const lines = users
          .slice(0, 40)
          .map((item) => `${item.name}：在手 ${item.openTasks} 个任务 / ${item.openEstimateDays} 人天，负责需求 ${item.ownedRequirements} 个`)
        return toolOutput(
          `人员负载总览（共 ${totals.requirements ?? 0} 条需求，在手任务 ${totals.openTasks ?? 0} 个）：\n${lines.join('\n')}`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_version_diff',
      '对比需求两个提交版本之间的差异：正文、验收标准、摘要与原型屏增删。只读。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          from: { type: 'integer', description: '旧版本号' },
          to: { type: 'integer', description: '新版本号' },
        },
        required: ['from', 'to'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { requirement } = await requirementForExec(local, actorId, args, exec)
        const from = Number(args?.from)
        const to = Number(args?.to)
        if (!Number.isInteger(from) || !Number.isInteger(to)) {
          throw httpError(400, 'from / to 需要是整数版本号')
        }
        const data = await serverAs(
          actorId,
          `/requirements/${encodeURIComponent(requirement.id)}/versions/diff?from=${from}&to=${to}`,
        )
        const diff = data?.diff ?? {}
        const doc = diff.document ?? {}
        const screens = diff.prototypeScreens ?? {}
        const tag = (a, b) => (a === b ? '（无变化）' : '（有变化）')
        return toolOutput([
          `${requirement.code} 版本对比 v${from} → v${to}`,
          `摘要${tag(diff.versionSummary?.from, diff.versionSummary?.to)}`,
          `正文${tag(doc.body?.from, doc.body?.to)}`,
          `验收标准${tag(doc.acceptanceCriteria?.from, doc.acceptanceCriteria?.to)}`,
          `原型屏新增：${(screens.added ?? []).join('、') || '无'}；删除：${(screens.removed ?? []).join('、') || '无'}`,
        ].join('\n'))
      },
    ))

    sub.tools.register(defineTool(
      'workbench_gitlab_retry',
      '某个开发任务的 GitLab 同步失败后手动重试：branch 重建分支 / mr 补建合并请求 / pipeline 同步流水线。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          platformId: { type: 'string', description: '平台 id，例如 trade-server' },
          action: { type: 'string', enum: ['branch', 'mr', 'pipeline'], description: '重试动作，默认 branch' },
        },
        required: ['platformId'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { requirement } = await requirementForExec(local, actorId, args, exec)
        const platformId = String(args?.platformId ?? '').trim()
        if (platformId === '') throw httpError(400, '缺少 platformId')
        const action = String(args?.action ?? 'branch')
        const data = await serverAs(
          actorId,
          `/requirements/${encodeURIComponent(requirement.id)}/gitlab-retry`,
          'POST',
          { platformId, action },
        )
        const detail = data?.branch
          ? `分支：${data.branch}`
          : data?.mrUrl
            ? `合并请求：${data.mrUrl}`
            : data?.status
              ? `流水线：${data.status}`
              : ''
        return toolOutput(`已重试 ${requirement.code} 的 GitLab ${action}。${detail}`)
      },
    ))

    sub.tools.register(defineTool(
      'workbench_move_requirement',
      '把需求移动到另一个迭代，服务端会按目标迭代重新编号。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement: { type: 'string', description: '需求编号；省略则取当前会话绑定的需求' },
          iteration: { type: 'string', description: '目标迭代 id、编码或短码，例如 2026-S12' },
        },
        required: ['iteration'],
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const { requirement } = await requirementForExec(local, actorId, args, exec)
        const iterationRef = String(args?.iteration ?? '').trim()
        const state = await stateFor(actorId)
        const iteration = iterationFromState(state, iterationRef)
        if (!iteration) throw httpError(404, `找不到迭代「${iterationRef}」`)
        const result = await serverAs(actorId, `/iterations/${encodeURIComponent(iteration.id)}/move-requirement`, 'POST', {
          requirement: requirement.id,
        })
        return toolOutput(
          `已把 ${requirement.code}「${requirement.title}」移动到 ${iteration.code}，新编号 ${result.requirement.code}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_iteration_update',
      '迭代管理：修改名称/阶段/状态/日期/会签人，或 archive/restore 归档恢复。仅负责人/管理员可调用。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          iteration: { type: 'string', description: '迭代 id、编码或短码；省略取当前迭代' },
          name: { type: 'string', description: '迭代名称' },
          phase: { type: 'string', description: '迭代阶段，例如 需求 / 设计 / 开发 / 测试' },
          status: { type: 'string', enum: ['planning', 'in_progress', 'done'], description: '迭代状态' },
          startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
          endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          reviewerIds: { type: 'array', items: { type: 'string' }, description: '默认会签人用户 id' },
          archived: { type: 'boolean', description: 'true 归档；false 恢复' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const state = await stateFor(actorId)
        const iteration = iterationFromState(state, args?.iteration)
        if (!iteration) throw httpError(404, `找不到迭代「${args?.iteration ?? ''}」`)
        if (typeof args?.archived === 'boolean') {
          const result = await serverAs(
            actorId,
            `/iterations/${encodeURIComponent(iteration.id)}/${args.archived ? 'archive' : 'restore'}`,
            'POST',
            {},
          )
          return toolOutput(`迭代 ${iteration.code} 已${args.archived ? '归档' : '恢复'}。`)
        }
        const result = await serverAs(actorId, `/iterations/${encodeURIComponent(iteration.id)}`, 'POST', {
          name: args?.name,
          phase: args?.phase,
          status: args?.status,
          startDate: args?.startDate,
          endDate: args?.endDate,
          reviewerIds: args?.reviewerIds,
        })
        return toolOutput(
          `迭代 ${result.iteration.code}「${result.iteration.name}」已更新：`
          + `状态 ${result.iteration.status}，${result.iteration.startDate || '待定'} ~ ${result.iteration.endDate || '待定'}。`,
        )
      },
    ))

    sub.tools.register(defineTool(
      'workbench_iteration_status',
      '查看迭代概览：需求状态、范围、设计、开发、测试、计划日期和负责人。只读。不传 iteration 时取当前用户选中的迭代。',
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          iteration: { type: 'string', description: '迭代编码或 id；省略则取当前用户选中的迭代' },
        },
      },
      async (args, exec) => {
        const actorId = actorIdFromExec(local, exec)
        const state = await stateFor(actorId)
        const iteration = iterationFromState(state, args?.iteration)
        if (!iteration) throw httpError(404, `找不到迭代「${args?.iteration}」`)
        const requirements = state.requirements.filter(item => item.iterationId === iteration.id)
        const inScope = requirements.filter(item => item.inScope)
        const pending = requirements.filter(item => item.status === 'pending_review')
        const outside = requirements.filter(item => !item.inScope)
        const dev = requirements.filter(item => item.status === 'in_progress')
        const test = requirements.filter(item => ['dev_done', 'testing', 'test_failed'].includes(item.status))
        const lines = requirements.length === 0
          ? ['（还没有需求）']
          : [...requirements]
            .sort((a, b) => a.code.localeCompare(b.code))
            .map(item => `- ${requirementSummaryLine(state, item)}`)
        return toolOutput(
          `迭代 ${iteration.code}「${iteration.name}」：${iteration.startDate || '待定'} ~ ${iteration.endDate || '待定'}，`
          + `需求 ${requirements.length} 个，本期 ${inScope.length} 个，待评审 ${pending.length} 个，范围外 ${outside.length} 个，`
          + `开发中 ${dev.length} 个，待测试/测试中 ${test.length} 个。\n`
          + lines.join('\n'),
        )
      },
    ))
  })
}
