#!/usr/bin/env node
/**
 * 多角色 DSH 仿真驱动的完整剧本：
 *   1. 在 kiri 上启动 6 个 headless DSH 容器（每个容器都装了 dsh-workbench 插件）；
 *   2. 每个容器用 Hy4 Flash（http://127.0.0.1:3425，容器内走 host.docker.internal:3425）跑一个角色；
 *   3. 通过团队服务端的内部接口建一条需求，把各角色的 DSH 会话绑定到需求会话记录；
 *   4. 让角色用自己的会话依次完成：提交 → 评审 → 排期/指派 → 设计 → 开发 → 测试 → 冻结发布。
 *
 * 用法：
 *   node deploy/dsh-sim/run-sim.mjs                # 重建容器，全新跑一遍
 *   node deploy/dsh-sim/run-sim.mjs --keep         # 复用容器和已有 DSH 会话
 *   node deploy/dsh-sim/run-sim.mjs --resume S11-018  # 从中断处继续一个已有需求
 *
 * 环境变量：
 *   SIM_DOCKER_CONTEXT     默认 kiri
 *   SIM_IMAGE              默认 dsh-workbench-sim:0.1.0
 *   SIM_SERVER_URL         宿主机访问的服务端地址，默认 http://127.0.0.1:3210
 *   SIM_CONTAINER_SERVER   容器内访问的服务端地址，默认 http://host.docker.internal:3210
 *   WORKBENCH_INTERNAL_TOKEN 默认 dsh-workbench-poc-internal-token
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUNS_DIR = path.join(HERE, 'runs')
const REPORT_FILE = path.join(HERE, 'last-run.md')

const argv = process.argv.slice(2)
const hasFlag = name => argv.includes(`--${name}`)
const flagValue = name => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}
const RESUME_CODE = flagValue('resume')
const FRESH = !hasFlag('keep') && RESUME_CODE === undefined

const CONTEXT = process.env.SIM_DOCKER_CONTEXT || 'kiri'
const IMAGE = process.env.SIM_IMAGE || 'dsh-workbench-sim:0.1.0'
const SERVER = trimSlash(process.env.SIM_SERVER_URL || 'http://127.0.0.1:3210')
const CONTAINER_SERVER = trimSlash(process.env.SIM_CONTAINER_SERVER || 'http://host.docker.internal:3210')
const TOKEN = process.env.WORKBENCH_INTERNAL_TOKEN || 'dsh-workbench-poc-internal-token'
const PROFILE = 'workbench-sim'
const LOCAL_PATH = '/home/node/.dsh/cache/dsh-workbench-poc/local.json'

const ROLES = [
  { id: 'lisi', name: '李四', duty: '产品经理' },
  { id: 'zhangsan', name: '张三', duty: '研发负责人' },
  { id: 'wangwu', name: '王五', duty: '设计师' },
  { id: 'zhaoliu', name: '赵六', duty: '服务端开发' },
  { id: 'sunba', name: '孙八', duty: '前端开发' },
  { id: 'qianqi', name: '钱七', duty: '测试' },
]
const roleById = Object.fromEntries(ROLES.map(role => [role.id, role]))

const sessions = {}        // role id -> DSH session id
const stepLog = []         // 供最后生成报告
const startedAt = new Date()

main().catch(error => {
  console.error(`\n仿真中断：${error.message}`)
  if (error.stack) fs.writeFileSync(path.join(RUNS_DIR, 'error.log'), `${error.stack}\n`)
  process.exitCode = 1
})

async function main() {
  fs.mkdirSync(RUNS_DIR, { recursive: true })
  banner()
  ensureImage()
  ensureContainers()
  verifyContainers()
  await bootstrapSessions()

  if (RESUME_CODE !== undefined) {
    const scenario = await resumeScenario(RESUME_CODE)
    writeRoleMappings(scenario)
    await resumeScenarioSteps(scenario)
    const resumed = await getRequirement(scenario.requirement.id)
    const reportFile = await writeReport(scenario, resumed)
    printFinalState(resumed)
    log(`\n完整运行记录：${path.relative(process.cwd(), reportFile)}`)
    return
  }

  const scenario = await setupScenario()
  writeRoleMappings(scenario)

  await playScenario(scenario)

  const finalRequirement = await getRequirement(scenario.requirement.id)
  if (finalRequirement.status !== 'released') {
    throw new Error(`剧本结束但需求状态是 ${finalRequirement.status}，预期 released`)
  }
  const reportFile = await writeReport(scenario, finalRequirement)
  printFinalState(finalRequirement)
  log(`\n完整运行记录：${path.relative(process.cwd(), reportFile)}`)
  log(`容器 ${ROLES.map(role => `dsh-sim-${role.id}`).join('、')} 保持运行中。`)
}

// ---------------------------------------------------------------------------
// 容器
// ---------------------------------------------------------------------------

function ensureImage() {
  const result = docker(['image', 'inspect', IMAGE, '--format', '{{.Id}}'])
  if (result.status !== 0) {
    throw new Error(`找不到镜像 ${IMAGE}，先执行 bash deploy/dsh-sim/build.sh kiri ${IMAGE}`)
  }
  log(`镜像 ${IMAGE} 已就绪`)
}

function ensureContainers() {
  for (const role of ROLES) {
    const name = containerName(role)
    const existing = dockerOk(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']).trim()
    if (existing !== '') {
      if (FRESH) {
        dockerOk(['rm', '-f', name])
        log(`已移除旧容器 ${name}`)
      } else {
        const running = dockerOk(['inspect', '-f', '{{.State.Running}}', name]).trim()
        if (running !== 'true') dockerOk(['start', name])
        log(`复用容器 ${name}`)
        continue
      }
    }
    dockerOk([
      'run', '-d', '--name', name,
      '-e', `DSH_WORKBENCH_BASE=/workbench/${role.id}`,
      '-e', `WORKBENCH_SERVER_URL=${CONTAINER_SERVER}`,
      '-e', `WORKBENCH_INTERNAL_TOKEN=${TOKEN}`,
      '-e', 'MAGPIE_GATEWAY_KEY=local',
      '--label', 'dsh-workbench-sim=1',
      IMAGE,
    ])
    log(`已启动容器 ${name}（${role.name} · ${role.duty}）`)
  }
}

function verifyContainers() {
  for (const role of ROLES) {
    const name = containerName(role)
    const version = dockerOk(['exec', name, 'dsh', '--version']).trim()
    const plugin = docker(['exec', name, 'test', '-f', '/opt/dsh-workbench/index.js'])
    const profile = docker(['exec', name, 'test', '-d', '/home/node/.dsh/profiles/workbench-sim'])
    if (plugin.status !== 0 || profile.status !== 0) {
      throw new Error(`${name} 内没有安装好 dsh-workbench 插件或 workbench-sim profile`)
    }
    log(`${name}: dsh ${version}，插件与 profile 已安装`)
  }
}

// ---------------------------------------------------------------------------
// DSH 会话
// ---------------------------------------------------------------------------

async function bootstrapSessions() {
  for (const role of ROLES) {
    const existing = reusedSession(role)
    if (existing !== null) {
      sessions[role.id] = existing
      log(`${role.name} 复用 DSH 会话 ${existing}`)
      continue
    }
    const outcome = runAgent(role, `${role.id}-bootstrap`, '只回复 OK，不要调用任何工具。')
    if (!outcome.session) throw new Error(`${role.name} 的引导会话没有返回 sessionId`)
    sessions[role.id] = outcome.session
    log(`${role.name} 新建 DSH 会话 ${outcome.session}`)
  }
}

function reusedSession(role) {
  const data = readLocal(role)
  const map = data?.users?.[role.id]?.sessionUsers
  if (!map || typeof map !== 'object') return null
  for (const [sessionId, userId] of Object.entries(map)) {
    if (userId === role.id && typeof sessionId === 'string' && sessionId !== '') return sessionId
  }
  return null
}

function readLocal(role) {
  const result = docker(['exec', containerName(role), 'cat', LOCAL_PATH])
  if (result.status !== 0) return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

function writeRoleMappings(scenario) {
  for (const role of ROLES) {
    const sessionId = sessions[role.id]
    const recordId = scenario.records[role.id]
    if (!sessionId || !recordId) throw new Error(`${role.name} 缺少会话或需求会话记录`)
    const data = readLocal(role) || { version: 1, users: {} }
    if (!data.users || typeof data.users !== 'object') data.users = {}
    const previous = data.users[role.id] || {}
    data.users[role.id] = {
      topLevelFolder: `/workbench/${role.id}`,
      folders: previous.folders || {},
      // 工作台 UI 用 sessions[需求会话记录 id] 判断“本机有没有这条需求的会话”；
      // headless 仿真也要补上，否则“进入会话 / 打开需求与设计”会是灰的。
      sessions: {
        ...(previous.sessions || {}),
        [recordId]: { dshSessionId: sessionId, workspaceId: null, folderPath: null },
      },
      dshSessions: { ...(previous.dshSessions || {}), [sessionId]: recordId },
      sessionOwners: { ...(previous.sessionOwners || {}), [sessionId]: recordId },
      sessionUsers: { ...(previous.sessionUsers || {}), [sessionId]: role.id },
    }
    const payload = JSON.stringify(data, null, 2)
    const result = docker(
      ['exec', '-i', containerName(role), 'sh', '-c',
        `mkdir -p /home/node/.dsh/cache/dsh-workbench-poc && cat > ${LOCAL_PATH} && chmod 600 ${LOCAL_PATH}`],
      { input: payload },
    )
    if (result.status !== 0) {
      throw new Error(`写入 ${role.name} 的 local.json 失败：${(result.stderr || '').trim()}`)
    }
    log(`${role.name}: 会话 ${sessionId} → 需求会话记录 ${recordId}`)
  }
}

// ---------------------------------------------------------------------------
// 剧本
// ---------------------------------------------------------------------------

async function setupScenario() {
  const stamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const created = await api('lisi', 'POST', '/requirements', { title: `订单列表筛选与空态优化（仿真 ${stamp}）` })
  let requirement = created.requirement
  log(`李四创建需求 ${requirement.code}「${requirement.title}」`)

  const requirementSession = await recordSession(requirement.id, 'lisi', 'requirement', '产品需求会话')
  requirement = (await api('lisi', 'POST', `/requirements/${encodeURIComponent(requirement.id)}/bind`, {
    sessionRecordId: requirementSession.id,
  })).requirement
  if (requirement.status !== 'draft') throw new Error(`绑定后需求状态是 ${requirement.status}，预期 draft`)

  const records = {
    lisi: requirementSession.id,
    zhangsan: (await recordSession(requirement.id, 'zhangsan', 'review', '负责人评审会话')).id,
    wangwu: (await recordSession(requirement.id, 'wangwu', 'design', '设计会话')).id,
    zhaoliu: (await recordSession(requirement.id, 'zhaoliu', 'dev', 'trade-server 开发会话')).id,
    sunba: (await recordSession(requirement.id, 'sunba', 'dev', 'web 开发会话')).id,
    qianqi: (await recordSession(requirement.id, 'qianqi', 'test', '测试会话')).id,
  }
  log(`需求会话已绑定：${Object.entries(records).map(([role, id]) => `${role}=${id.slice(-6)}`).join('，')}`)
  return { requirement, records }
}

async function recordSession(requirementId, actor, kind, label) {
  const result = await api(actor, 'POST', `/requirements/${encodeURIComponent(requirementId)}/sessions`, {
    type: kind,
    label,
  })
  return result.session
}

const REQUIREMENT_DOC = {
  summary: '订单列表支持状态、关键词、下单时间组合筛选，补齐加载、空态和错误提示；覆盖 trade-server 与 web。',
  body: [
    '## 背景',
    '订单列表当前只有「全部 / 待付款 / 待发货 / 已完成」四个标签，无法组合筛选；订单量大时客服需要反复翻页，筛选无结果时页面只显示空白表格。',
    '',
    '## 目标',
    '- 客服可以在一个页面内按状态、关键词和下单时间组合筛选订单。',
    '- 筛选无结果时给出明确解释和「清除筛选」动作。',
    '- 保持现有标签页、订单详情和分页行为不变。',
    '',
    '## 范围',
    '- trade-server：GET /orders 支持 status、keyword、startDate、endDate、page、pageSize；返回 items、total、page、pageSize。',
    '- web：订单列表增加筛选区、已选条件 chips、加载骨架屏、空态和错误提示。',
    '',
    '## 不做',
    '- 不改订单详情页；不做导出、自定义列和批量操作。',
    '',
    '## 用户故事',
    '- 作为客服，我可以按「待发货 + 近 7 天」筛选，快速找到需要催发的订单。',
    '- 作为运营，我在筛选无结果时能看到原因，并一键清除筛选。',
    '',
    '## 交互流程',
    '1. 进入订单列表，默认展示全部订单（每页 20 条）。',
    '2. 选择状态、输入关键词、选择日期范围，点「查询」。',
    '3. 有结果时展示「共 N 条」和已选条件 chips；无结果时展示空态。',
    '4. 点「清除筛选」恢复默认列表。',
    '',
    '## 数据与接口',
    'GET /orders?status=&keyword=&startDate=&endDate=&page=&pageSize=',
    '响应：{ items, total, page, pageSize }',
  ].join('\n'),
  acceptanceCriteria: [
    'AC1 默认进入订单列表展示全部订单，每页 20 条，分页可正常切换。',
    'AC2 状态、关键词、日期范围可以组合筛选，查询后 URL 保留筛选参数，刷新不丢失。',
    'AC3 有结果时展示「共 N 条」和已选条件 chips，chips 可单独移除并重新查询。',
    'AC4 无结果时展示空态插画、「没有符合条件的订单」说明和「清除筛选」按钮，点击后恢复默认列表。',
    'AC5 加载中展示骨架屏，结果返回后不出现布局跳动。',
    'AC6 trade-server 对非法状态或日期返回 400；web 展示可读的错误提示并可重试。',
    'AC7 原有标签页、订单详情跳转和分页行为不受影响。',
  ].join('\n'),
}

function documentPrompt(code, title) {
  return `你是产品经理李四（用户 id lisi）。需求 ${code}「${title}」已创建，当前会话已绑定，状态是草稿。\n`
    + '请只做一件事：调用 workbench_update_document，把下面的需求文档写入这个需求。\n'
    + `summary 用：「${REQUIREMENT_DOC.summary}」\n`
    + 'body 用（三引号只用于分隔，不要写进参数）：\n"""\n'
    + `${REQUIREMENT_DOC.body}\n"""\n`
    + 'acceptanceCriteria 用（三引号只用于分隔，不要写进参数）：\n"""\n'
    + `${REQUIREMENT_DOC.acceptanceCriteria}\n"""\n`
    + '原样写入，不要省略；不要提交需求，不要调用其他工具。'
}

function designPrompt(code) {
  return `请继续 ${code} 的设计工作。\n`
    + '1. 先调用 skill 加载 ui-design 技能；再调用 workbench_design_context 获取需求文件夹（形如 /workbench/wangwu/···）。\n'
    + '2. 在需求文件夹里创建三个屏幕（目录不存在就先 mkdir -p）：\n'
    + '   - list-default.html：订单列表默认态。顶栏「订单中心」；筛选区含关键词输入框、状态下拉（全部/待付款/待发货/已完成）、日期范围、重置/查询按钮；4 行示例订单表格；底部分页。\n'
    + '   - list-filtered.html：已筛选态。筛选区显示已选条件 chips（待发货、近 7 天），顶部「共 2 条」，表格 2 行结果。\n'
    + '   - list-empty.html：空态。筛选条件「已完成 · 近 7 天」，表格区域展示空态插画、「没有符合条件的订单」、说明和「清除筛选」按钮。\n'
    + '3. 再创建 design-notes.md：设计说明，包含页面结构、状态覆盖、颜色/字号/间距、响应式与可访问性要点。\n'
    + '要求：三个 HTML 都是单文件、内联 CSS/JS、不使用任何外部资源；中文文案；主色 #2f6fed；按 1440 宽桌面后台设计；风格干净克制。\n'
    + '完成后只回复创建的文件列表，不要交付，也不要调用其他工作台工具。'
}

const DESIGN_CORRECTION = '上一次设计稿不完整。需要 list-default.html、list-filtered.html、list-empty.html 三个屏幕和 design-notes.md。'
  + '请先调用 workbench_design_context 确认需求文件夹，再补齐缺少的文件；每个 HTML 单文件、内联 CSS，不用外部资源。完成后只回复文件列表。'

async function playScenario(scenario) {
  const code = scenario.requirement.code
  const id = scenario.requirement.id

  await step('lisi', 'lisi-write-doc', {
    prompt: documentPrompt(code, scenario.requirement.title),
    correction: `${documentPrompt(code, scenario.requirement.title)}\n上一次没有写入成功。请只调用 workbench_update_document，不要提交需求。`,
    expect: async () => {
      const requirement = await getRequirement(id)
      const document = requirement.document ?? {}
      return document.version >= 1
        && String(document.body || '').includes('## 背景')
        && String(document.acceptanceCriteria || '').includes('AC7')
    },
    expectLabel: '需求文档已写入',
  })

  await step('lisi', 'lisi-submit', {
    prompt: `你是研发部产品经理李四（用户 id lisi）。需求 ${code}「${scenario.requirement.title}」已经创建，当前会话已绑定这个需求，状态是草稿。\n`
      + '请只做一件事：调用 workbench_submit_requirement 提交需求送评审。summary 参数用：'
      + '「首版：订单列表支持按状态筛选，补齐空态与加载态；范围覆盖 trade-server 与 web」。\n不要调用其他写操作。',
    correction: `上一次没有把需求提交成功。现在只调用 workbench_submit_requirement，summary 用「首版：订单列表支持按状态筛选，补齐空态与加载态；范围覆盖 trade-server 与 web」。`,
    expect: async () => (await getRequirement(id)).status === 'pending_review',
    expectLabel: '待评审',
  })

  await step('zhangsan', 'zhangsan-review', {
    prompt: `你是研发负责人张三（用户 id zhangsan），是需求 ${code} 的会签人。需求现在待评审。\n`
      + '请只做一件事：调用 workbench_review_requirement，decision 用 approve，comment 用「范围与平台明确，同意进入本期」。',
    correction: `上一次没有完成评审。现在只调用 workbench_review_requirement，decision=approve，comment 用「范围与平台明确，同意进入本期」。`,
    expect: async () => (await getRequirement(id)).status === 'approved',
    expectLabel: '已通过',
  })

  await step('zhangsan', 'zhangsan-schedule', {
    prompt: `需求 ${code} 已通过评审。请只做一件事：调用 workbench_schedule_requirement，startDate 用 2026-12-01，endDate 用 2026-12-15。`,
    correction: `上一次没有排期成功。现在只调用 workbench_schedule_requirement，startDate=2026-12-01，endDate=2026-12-15。`,
    expect: async () => (await getRequirement(id)).status === 'scheduled',
    expectLabel: '已排期',
  })

  await step('zhangsan', 'zhangsan-assign-server', {
    prompt: `请只做一件事：调用 workbench_dev_action，action 用 assign，platformId 用 trade-server，assigneeId 用 zhaoliu，把 ${code} 的服务端开发指派给赵六。`,
    correction: `上一次没有指派成功。现在只调用 workbench_dev_action，action=assign，platformId=trade-server，assigneeId=zhaoliu。`,
    expect: async () => devTask(id, 'trade-server', task => task.assigneeId === 'zhaoliu'),
    expectLabel: 'trade-server 已指派 zhaoliu',
  })

  await step('zhangsan', 'zhangsan-assign-web', {
    prompt: `请只做一件事：调用 workbench_dev_action，action 用 assign，platformId 用 web，assigneeId 用 sunba，把 ${code} 的 Web 开发指派给孙八。`,
    correction: `上一次没有指派成功。现在只调用 workbench_dev_action，action=assign，platformId=web，assigneeId=sunba。`,
    expect: async () => devTask(id, 'web', task => task.assigneeId === 'sunba'),
    expectLabel: 'web 已指派 sunba',
  })

  await step('wangwu', 'wangwu-claim-design', {
    prompt: `你是设计师王五（用户 id wangwu）。需求 ${code} 已排期，设计还未认领。\n`
      + '请只做一件事：调用 workbench_claim_design 认领这个需求的设计。',
    correction: '上一次没有认领成功。现在只调用 workbench_claim_design 认领当前需求的设计。',
    expect: async () => (await getRequirement(id)).designStatus === 'designing',
    expectLabel: '设计中',
  })

  await step('wangwu', 'wangwu-write-design', {
    prompt: designPrompt(code),
    correction: DESIGN_CORRECTION,
    expect: async () => designDeliverable('wangwu', code).ok,
    expectLabel: '三屏设计稿与设计说明已生成',
  })

  const previewIds = await publishDesignPreviews('wangwu', await getRequirement(id))
  if (previewIds.length > 0) log(`已上传 ${previewIds.length} 张设计预览图（会纳入本次设计版本）`)
  else log('没有生成设计预览图，跳过')

  await step('wangwu', 'wangwu-deliver-design', {
    prompt: '请只做一件事：调用 workbench_deliver_design 交付当前需求的设计，summary 用「订单列表筛选与空态设计稿 d1」。',
    correction: '上一次没有交付成功。现在只调用 workbench_deliver_design，summary 用「订单列表筛选与空态设计稿 d1」。',
    expect: async () => (await getRequirement(id)).designStatus === 'delivered',
    expectLabel: '设计已交付',
  })

  await step('zhaoliu', 'zhaoliu-dev-start', {
    prompt: `你是服务端开发赵六（用户 id zhaoliu）。需求 ${code} 的 trade-server 开发任务已经指派给你。\n`
      + '请只做一件事：调用 workbench_dev_action，action 用 start，platformId 用 trade-server。',
    correction: '上一次没有开始成功。现在只调用 workbench_dev_action，action=start，platformId=trade-server。',
    expect: async () => devTask(id, 'trade-server', task => task.status === 'in_progress'),
    expectLabel: 'trade-server 开发中',
  })

  await step('zhaoliu', 'zhaoliu-dev-finish', {
    prompt: '请只做一件事：调用 workbench_dev_action，action 用 finish，platformId 用 trade-server，'
      + 'note 用「/orders 支持 status 过滤，补充索引与空结果分页，单测通过」。',
    correction: '上一次没有完成开发。现在只调用 workbench_dev_action，action=finish，platformId=trade-server，note 用「/orders 支持 status 过滤，补充索引与空结果分页，单测通过」。',
    expect: async () => devTask(id, 'trade-server', task => task.status === 'done'),
    expectLabel: 'trade-server 已完成',
  })

  await step('sunba', 'sunba-dev-start', {
    prompt: `你是前端开发孙八（用户 id sunba）。需求 ${code} 的 web 开发任务已经指派给你。\n`
      + '请只做一件事：调用 workbench_dev_action，action 用 start，platformId 用 web。',
    correction: '上一次没有开始成功。现在只调用 workbench_dev_action，action=start，platformId=web。',
    expect: async () => devTask(id, 'web', task => task.status === 'in_progress'),
    expectLabel: 'web 开发中',
  })

  await step('sunba', 'sunba-dev-finish', {
    prompt: '请只做一件事：调用 workbench_dev_action，action 用 finish，platformId 用 web，'
      + 'note 用「订单列表接入状态筛选与空态组件，交互走查通过」。',
    correction: '上一次没有完成开发。现在只调用 workbench_dev_action，action=finish，platformId=web，note 用「订单列表接入状态筛选与空态组件，交互走查通过」。',
    expect: async () => (await getRequirement(id)).status === 'dev_done',
    expectLabel: '待测试',
  })

  await step('qianqi', 'qianqi-test-start', {
    prompt: `你是测试钱七（用户 id qianqi）。需求 ${code} 的服务端与 Web 开发都已完成，现在待测试。\n`
      + '请只做一件事：调用 workbench_test_action，action 用 start。',
    correction: '上一次没有开始测试。现在只调用 workbench_test_action，action=start。',
    expect: async () => (await getRequirement(id)).status === 'testing',
    expectLabel: '测试中',
  })

  await step('qianqi', 'qianqi-test-pass', {
    prompt: '请只做一件事：调用 workbench_test_action，action 用 pass，'
      + 'note 用「筛选组合、空态与加载态验证通过，无阻塞缺陷」。',
    correction: '上一次没有提交测试结论。现在只调用 workbench_test_action，action=pass，note 用「筛选组合、空态与加载态验证通过，无阻塞缺陷」。',
    expect: async () => (await getRequirement(id)).status === 'test_passed',
    expectLabel: '测试通过',
  })

  await publishTestReport(await getRequirement(id))
  log('钱七已上传测试报告 test-report.md')

  await step('zhangsan', 'zhangsan-freeze', {
    prompt: `需求 ${code} 已测试通过。请只做一件事：调用 workbench_release_action，action 用 freeze。`,
    correction: '上一次没有冻结成功。现在只调用 workbench_release_action，action=freeze。',
    expect: async () => (await getRequirement(id)).status === 'frozen',
    expectLabel: '已冻结',
  })

  await step('zhangsan', 'zhangsan-release', {
    prompt: '请只做一件事：调用 workbench_release_action，action 用 release，version 用 v1.0.0。',
    correction: '上一次没有发布成功。现在只调用 workbench_release_action，action=release，version=v1.0.0。',
    expect: async () => (await getRequirement(id)).status === 'released',
    expectLabel: '已发布',
  })
}

// ---------------------------------------------------------------------------
// 断点续跑：容器和 DSH 会话都还在，按服务端当前状态补齐剩余步骤。
// ---------------------------------------------------------------------------

async function resumeScenario(code) {
  const state = await api('admin', 'GET', '/state')
  const requirement = (state.requirements || []).find(item => item.code.toLowerCase() === code.toLowerCase())
  if (!requirement) throw new Error(`服务端找不到需求 ${code}`)
  const records = {}
  for (const session of requirement.sessions || []) {
    if (session.archived || !session.createdBy) continue
    if (!records[session.createdBy]) records[session.createdBy] = session.id
  }
  for (const role of ROLES) {
    if (!records[role.id]) throw new Error(`需求 ${code} 缺少 ${role.name} 的会话记录，无法续跑`)
  }
  log(`续跑 ${requirement.code}「${requirement.title}」，当前状态 ${requirement.status}`)
  return { requirement, records }
}

async function resumeScenarioSteps(scenario) {
  const code = scenario.requirement.code
  const id = scenario.requirement.id
  const current = () => getRequirement(id)

  if (((await current()).document?.version ?? 0) === 0) {
    await step('lisi', 'lisi-write-doc', {
      prompt: documentPrompt(code, scenario.requirement.title),
      correction: `${documentPrompt(code, scenario.requirement.title)}\n上一次没有写入成功。请只调用 workbench_update_document，不要提交需求。`,
      expect: async () => {
        const requirement = await current()
        return (requirement.document?.version ?? 0) >= 1
          && String(requirement.document?.body || '').includes('## 背景')
      },
      expectLabel: '需求文档已写入',
    })
  }

  if ((await current()).designStatus === 'unclaimed') {
    await step('wangwu', 'wangwu-claim-design', {
      prompt: `请只做一件事：调用 workbench_claim_design 认领 ${code} 的设计。`,
      correction: '上一次没有认领成功。现在只调用 workbench_claim_design 认领当前需求的设计。',
      expect: async () => (await current()).designStatus === 'designing',
      expectLabel: '设计中',
    })
  }
  if ((await current()).designStatus !== 'delivered') {
    if (!designDeliverable('wangwu', code).ok) {
      await step('wangwu', 'wangwu-write-design', {
        prompt: designPrompt(code),
        correction: DESIGN_CORRECTION,
        expect: async () => designDeliverable('wangwu', code).ok,
        expectLabel: '三屏设计稿与设计说明已生成',
      })
    }
    const previewIds = await publishDesignPreviews('wangwu', await current())
    if (previewIds.length > 0) log(`已上传 ${previewIds.length} 张设计预览图（会纳入本次设计版本）`)
    await step('wangwu', 'wangwu-deliver-design', {
      prompt: '请只做一件事：调用 workbench_deliver_design 交付当前需求的设计，summary 用「订单列表筛选与空态设计稿 d1」。',
      correction: '上一次没有交付成功。现在只调用 workbench_deliver_design，summary 用「订单列表筛选与空态设计稿 d1」。',
      expect: async () => (await current()).designStatus === 'delivered',
      expectLabel: '设计已交付',
    })
  }

  const devSteps = [
    { role: 'zhaoliu', platformId: 'trade-server', note: '/orders 支持 status 过滤，补充索引与空结果分页，单测通过' },
    { role: 'sunba', platformId: 'web', note: '订单列表接入状态筛选与空态组件，交互走查通过' },
  ]
  for (const item of devSteps) {
    const task = await devTaskOf(id, item.platformId)
    if (!task || task.status === 'done') continue
    if (task.status !== 'in_progress') {
      await step(item.role, `${item.role}-dev-start`, {
        prompt: `请只做一件事：调用 workbench_dev_action，action 用 start，platformId 用 ${item.platformId}。`,
        correction: `上一次没有开始成功。现在只调用 workbench_dev_action，action=start，platformId=${item.platformId}。`,
        expect: async () => devTask(id, item.platformId, value => value.status === 'in_progress'),
        expectLabel: `${item.platformId} 开发中`,
      })
    }
    await step(item.role, `${item.role}-dev-finish`, {
      prompt: `请只做一件事：调用 workbench_dev_action，action 用 finish，platformId 用 ${item.platformId}，note 用「${item.note}」。`,
      correction: `上一次没有完成开发。现在只调用 workbench_dev_action，action=finish，platformId=${item.platformId}，note 用「${item.note}」。`,
      expect: async () => devTask(id, item.platformId, value => value.status === 'done'),
      expectLabel: `${item.platformId} 已完成`,
    })
  }

  let requirement = await current()
  if (requirement.status === 'dev_done') {
    await step('qianqi', 'qianqi-test-start', {
      prompt: `需求 ${code} 已开发完成。请只做一件事：调用 workbench_test_action，action 用 start。`,
      correction: '上一次没有开始测试。现在只调用 workbench_test_action，action=start。',
      expect: async () => (await current()).status === 'testing',
      expectLabel: '测试中',
    })
  }
  if ((await current()).status === 'testing') {
    await step('qianqi', 'qianqi-test-pass', {
      prompt: '请只做一件事：调用 workbench_test_action，action 用 pass，note 用「筛选组合、空态与加载态验证通过，无阻塞缺陷」。',
      correction: '上一次没有提交测试结论。现在只调用 workbench_test_action，action=pass，note 用「筛选组合、空态与加载态验证通过，无阻塞缺陷」。',
      expect: async () => (await current()).status === 'test_passed',
      expectLabel: '测试通过',
    })
  }
  if (['test_passed', 'frozen', 'released'].includes((await current()).status)) {
    await publishTestReport(await current())
  }
  if ((await current()).status === 'test_passed') {
    await step('zhangsan', 'zhangsan-freeze', {
      prompt: `需求 ${code} 已测试通过。请只做一件事：调用 workbench_release_action，action 用 freeze。`,
      correction: '上一次没有冻结成功。现在只调用 workbench_release_action，action=freeze。',
      expect: async () => (await current()).status === 'frozen',
      expectLabel: '已冻结',
    })
  }
  if ((await current()).status === 'frozen') {
    await step('zhangsan', 'zhangsan-release', {
      prompt: '请只做一件事：调用 workbench_release_action，action 用 release，version 用 v1.0.0。',
      correction: '上一次没有发布成功。现在只调用 workbench_release_action，action=release，version=v1.0.0。',
      expect: async () => (await current()).status === 'released',
      expectLabel: '已发布',
    })
  }
  if ((await current()).status !== 'released') {
    throw new Error(`续跑结束但需求状态是 ${(await current()).status}，预期 released`)
  }
}

async function devTaskOf(requirementId, platformId) {
  const requirement = await getRequirement(requirementId)
  return (requirement.devTasks || []).find(item => item.platformId === platformId)
}

async function step(roleId, tag, { prompt, correction, expect, expectLabel }) {
  const role = roleById[roleId]
  divider(`${role.name} · ${tag}`)
  let attempts = 0
  let outcome = runAgent(role, tag, prompt)
  attempts += 1
  let ok = await expect()
  if (!ok && correction) {
    log(`未达到预期（${expectLabel}），补发一次明确指令`)
    outcome = runAgent(role, `${tag}-retry`, correction)
    attempts += 1
    ok = await expect()
  }
  if (!ok) throw new Error(`${role.name} 的 ${tag} 没有达到预期状态：${expectLabel}`)
  stepLog.push({
    role: roleId, roleName: role.name, tag,
    toolCalls: outcome.toolCalls.map(call => call.tool),
    finalText: outcome.finalText,
    elapsedMs: outcome.elapsedMs,
    attempts,
  })
  log(`✓ ${expectLabel}（${outcome.toolCalls.map(call => call.tool).join(', ') || '无工具调用'}，${(outcome.elapsedMs / 1000).toFixed(1)}s）`)
}

// ---------------------------------------------------------------------------
// 团队服务端接口
// ---------------------------------------------------------------------------

async function api(actor, method, route, body) {
  const response = await fetch(`${SERVER}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-workbench-internal-token': TOKEN,
      'x-workbench-actor': actor,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = {}
  if (text.trim() !== '') {
    try { data = JSON.parse(text) } catch { data = { error: text } }
  }
  if (!response.ok) {
    throw new Error(`${method} ${route} → HTTP ${response.status}：${data.error || text.slice(0, 200)}`)
  }
  return data
}

async function getRequirement(requirementId) {
  const state = await api('admin', 'GET', '/state')
  const requirement = state.requirements.find(item => item.id === requirementId)
  if (!requirement) throw new Error(`服务端找不到需求 ${requirementId}`)
  return requirement
}

async function devTask(requirementId, platformId, predicate) {
  const requirement = await getRequirement(requirementId)
  const task = (requirement.devTasks || []).find(item => item.platformId === platformId)
  return Boolean(task) && predicate(task)
}

async function designFileAppears(roleId, requirementCode) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (designFileCount(roleId, requirementCode) > 0) return true
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  return false
}

function designFileCount(roleId, requirementCode) {
  return designFiles(roleId, requirementCode).filter(file => file.endsWith('.html')).length
}

function designFiles(roleId, requirementCode) {
  const result = docker(['exec', `dsh-sim-${roleId}`, 'sh', '-c',
    `find /workbench/${roleId} -type f -path "*/${requirementCode}-*" \\( -name "*.html" -o -name "*.md" \\) 2>/dev/null | sort`])
  if (result.status !== 0) return []
  return result.stdout.split('\n').map(line => line.trim()).filter(Boolean)
}

function designDeliverable(roleId, requirementCode) {
  const files = designFiles(roleId, requirementCode)
  const html = files.filter(file => file.endsWith('.html'))
  const notes = files.filter(file => file.endsWith('design-notes.md'))
  return { ok: html.length >= 3 && notes.length >= 1, html, notes, files }
}

async function publishDesignPreviews(roleId, requirement) {
  const htmlFiles = designFiles(roleId, requirement.code)
    .filter(file => file.endsWith('.html'))
    .slice(0, 4)
  if (htmlFiles.length === 0) return []
  const existing = new Set((requirement.artifacts ?? []).map(artifact => artifact.name))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sim-previews-'))
  const copied = []
  for (const [index, file] of htmlFiles.entries()) {
    const target = path.join(tmp, `${String(index + 1).padStart(2, '0')}-${path.basename(file)}`)
    const result = docker(['cp', `dsh-sim-${roleId}:${file}`, target])
    if (result.status !== 0) {
      log(`跳过预览图 ${path.basename(file)}：${oneLine(result.stderr, 120)}`)
      continue
    }
    copied.push(target)
  }
  if (copied.length === 0) return []
  const capture = spawnSync(process.execPath, [path.join(HERE, 'capture-previews.mjs'), tmp], {
    encoding: 'utf8',
    timeout: 180 * 1000,
  })
  if (capture.status !== 0) {
    log(`预览图生成失败，跳过：${oneLine(capture.stderr || capture.stdout, 160)}`)
    return []
  }
  const ids = []
  for (const name of fs.readdirSync(tmp).filter(file => file.endsWith('.png')).sort()) {
    const artifactName = `previews/${name.replace(/^\d+-/, '')}`
    if (existing.has(artifactName)) continue
    const content = fs.readFileSync(path.join(tmp, name)).toString('base64')
    const result = await api('wangwu', 'POST', `/requirements/${encodeURIComponent(requirement.id)}/artifacts`, {
      name: artifactName,
      contentType: 'image/png',
      encoding: 'base64',
      content,
      kind: 'design',
    })
    if (result?.artifact?.id) ids.push(result.artifact.id)
  }
  return ids
}

async function publishTestReport(requirement) {
  if ((requirement.artifacts ?? []).some(artifact => artifact.name === 'test-report.md')) return
  const content = [
    `# ${requirement.code} 测试报告`,
    '',
    '- 测试人：钱七',
    '- 环境：web 1440×900；trade-server 本地',
    '- 范围：订单列表筛选、空态、加载态、错误提示',
    '',
    '## 用例与结果',
    '| 编号 | 场景 | 结果 |',
    '| --- | --- | --- |',
    '| T1 | 默认列表与分页 | 通过 |',
    '| T2 | 状态 + 关键词组合筛选 | 通过 |',
    '| T3 | 日期范围筛选与 URL 参数 | 通过 |',
    '| T4 | 空态与清除筛选 | 通过 |',
    '| T5 | 加载骨架屏与布局稳定 | 通过 |',
    '| T6 | 非法日期/状态错误提示 | 通过 |',
    '',
    '## 结论',
    '筛选组合、空态与加载态验证通过，无阻塞缺陷；原有标签页与订单详情跳转正常。',
  ].join('\n')
  await api('qianqi', 'POST', `/requirements/${encodeURIComponent(requirement.id)}/artifacts`, {
    name: 'test-report.md',
    contentType: 'text/markdown; charset=utf-8',
    content,
    kind: 'test-report',
  })
}

// ---------------------------------------------------------------------------
// DSH 进程
// ---------------------------------------------------------------------------

function runAgent(role, tag, prompt) {
  const name = containerName(role)
  const execArgs = [
    'dsh', '--profile', PROFILE, 'headless', '--json',
    '--permission-mode', 'danger-full-access', '--approval-policy', 'never',
  ]
  const sessionId = sessions[role.id]
  if (sessionId) execArgs.push('--session-id', sessionId)
  execArgs.push(prompt)

  const started = Date.now()
  const result = docker(['exec', name, ...execArgs])
  const elapsedMs = Date.now() - started
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  fs.writeFileSync(path.join(RUNS_DIR, `${tag}.ndjson`), stdout)
  fs.writeFileSync(path.join(RUNS_DIR, `${tag}.stderr.log`), stderr)

  const events = parseEvents(stdout)
  const errorEvent = events.find(event => event.type === 'error')
  const sessionEvent = events.find(event => event.type === 'session')
  if (sessionEvent?.sessionId) sessions[role.id] = sessionEvent.sessionId
  const finalEvent = [...events].reverse().find(event => event.type === 'final')
  const toolCalls = events.filter(event => event.type === 'tool_call')
  const toolResults = events.filter(event => event.type === 'tool_result')
  const okStatuses = new Set(['completed', 'ok', 'success'])
  const failedTools = toolResults.filter(event => event.status && !okStatuses.has(event.status))

  if (errorEvent) {
    if (/unknown session|not found|was recorded in/i.test(errorEvent.message || '')) {
      log('DSH 会话不可用，重新引导一个会话')
      sessions[role.id] = undefined
      const boot = runAgent(role, `${tag}-bootstrap`, '只回复 OK，不要调用任何工具。')
      if (!boot.session) throw new Error('重新引导会话失败')
      sessions[role.id] = boot.session
      return runAgent(role, tag, prompt)
    }
    throw new Error(`${role.name} 的 DSH 运行失败：${errorEvent.message}`)
  }
  if (result.status !== 0 && !finalEvent) {
    throw new Error(`${role.name} 的 DSH 退出码 ${result.status}：${tail(stderr, 3)}`)
  }
  if (failedTools.length > 0) {
    log(`工具失败：${failedTools.map(event => tail(String(event.result || ''), 1)).join('；')}`)
  }

  const finalText = String(finalEvent?.text || '').trim()
  const callLabel = toolCalls.map(call => call.tool).join(', ') || '无工具调用'
  log(`→ ${role.name} 调用 [${callLabel}]`)
  if (finalText) log(`  ${tail(finalText, 2)}`)
  return { session: sessions[role.id], events, toolCalls, toolResults, finalText, elapsedMs }
}

function parseEvents(stdout) {
  const events = []
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue
    try { events.push(JSON.parse(line)) } catch { /* 忽略非 JSON 行 */ }
  }
  return events
}

// ---------------------------------------------------------------------------
// 输出与报告
// ---------------------------------------------------------------------------

function printFinalState(requirement) {
  const dev = (requirement.devTasks || [])
    .map(task => `${task.platformId}:${task.status}${task.assigneeId ? `(${task.assigneeId})` : ''}`)
    .join('  ')
  log('\n最终状态')
  log(`  需求：${requirement.code}「${requirement.title}」`)
  log(`  状态：${requirement.status}，本期：${requirement.inScope ? '是' : '否'}`)
  log(`  版本：v${requirement.versions.length}，设计：${requirement.designStatus} d${(requirement.designVersions || []).length}`)
  log(`  开发：${dev}`)
  log(`  测试：${(requirement.testRuns || []).map(run => run.status).join(', ') || '无'}`)
  log(`  发布：${requirement.release ? `${requirement.release.version} @ ${requirement.release.at}` : '无'}`)
  log(`  排期：${requirement.plannedStartDate || '待定'} ~ ${requirement.plannedEndDate || '待定'}`)
}

async function writeReport(scenario, requirement) {
  const notifications = {}
  for (const role of ROLES) {
    const state = await api(role.id, 'GET', '/state')
    notifications[role.id] = state.notifications.filter(item => item.requirementId === requirement.id).length
  }
  const lines = []
  lines.push(`# 多角色仿真运行记录`)
  lines.push('')
  lines.push(`- 开始时间：${startedAt.toISOString()}`)
  lines.push(`- 结束时间：${new Date().toISOString()}`)
  lines.push(`- Docker context：${CONTEXT}`)
  lines.push(`- 镜像：${IMAGE}`)
  lines.push(`- 模型：Hy4 Flash（容器内 http://host.docker.internal:3425/v1，model auto/hy4flash-free）`)
  lines.push(`- 需求：${requirement.code}「${requirement.title}」`)
  lines.push(`- 最终状态：**${requirement.status}**`)
  lines.push('')
  lines.push('## 角色与容器')
  lines.push('')
  lines.push('| 角色 | 容器 | DSH 会话 | 需求会话记录 | 本需求通知 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const role of ROLES) {
    lines.push(`| ${role.name}（${role.id}，${role.duty}） | dsh-sim-${role.id} | ${sessions[role.id] || '-'} | ${scenario.records[role.id] || '-'} | ${notifications[role.id]} |`)
  }
  lines.push('')
  lines.push('## 剧本步骤')
  lines.push('')
  lines.push('| 步骤 | 角色 | 工具调用 | 耗时 | 角色结论 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const entry of stepLog) {
    lines.push(`| ${entry.tag} | ${entry.roleName} | ${entry.toolCalls.join('、') || '无'} | ${(entry.elapsedMs / 1000).toFixed(1)}s | ${oneLine(entry.finalText, 80)} |`)
  }
  lines.push('')
  lines.push('## 角色输出摘录')
  lines.push('')
  for (const entry of stepLog) {
    lines.push(`### ${entry.roleName} · ${entry.tag}`)
    lines.push('')
    lines.push(`工具：${entry.toolCalls.join('、') || '无'}`)
    lines.push('')
    lines.push(`> ${oneLine(entry.finalText, 500) || '（无文本输出）'}`)
    lines.push('')
  }
  lines.push('## 最终需求状态')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify({
    code: requirement.code,
    title: requirement.title,
    status: requirement.status,
    inScope: requirement.inScope,
    planned: [requirement.plannedStartDate, requirement.plannedEndDate],
    versions: (requirement.versions || []).map(version => ({ version: version.version, summary: version.summary, by: version.by })),
    design: {
      status: requirement.designStatus,
      designerId: requirement.designerId,
      versions: (requirement.designVersions || []).map(version => ({ version: version.version, summary: version.summary, files: version.files, by: version.by })),
    },
    devTasks: (requirement.devTasks || []).map(task => ({
      platformId: task.platformId,
      status: task.status,
      assigneeId: task.assigneeId,
      branch: task.branch,
      mrUrl: task.mrUrl,
      pipeline: task.pipelineStatus,
      note: task.note,
    })),
    testRuns: (requirement.testRuns || []).map(run => ({ status: run.status, by: run.by, note: run.note })),
    release: requirement.release,
    reviews: (requirement.reviews || []).map(review => ({ decision: review.decision, by: review.by, comment: review.comment })),
  }, null, 2))
  lines.push('```')
  fs.writeFileSync(REPORT_FILE, `${lines.join('\n')}\n`)
  return REPORT_FILE
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function docker(args, options = {}) {
  return spawnSync('docker', ['--context', CONTEXT, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 25 * 60 * 1000,
    ...options,
  })
}

function dockerOk(args, options = {}) {
  const result = docker(args, options)
  if (result.error) throw new Error(`docker ${args.join(' ')} 失败：${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} 失败：${tail(`${result.stderr || ''}${result.stdout || ''}`, 4)}`)
  }
  return result.stdout || ''
}

function containerName(role) {
  return `dsh-sim-${role.id}`
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function oneLine(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function tail(text, lines = 3) {
  const parts = String(text || '').trim().split('\n')
  return parts.slice(-lines).join('\n')
}

function log(message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  console.log(`[${time}] ${message}`)
}

function divider(title) {
  console.log(`\n──── ${title} ────`)
}

function banner() {
  console.log('DSH 多角色仿真')
  console.log(`  context=${CONTEXT}  image=${IMAGE}`)
  console.log(`  server=${SERVER}（容器内 ${CONTAINER_SERVER}）`)
  console.log(`  角色=${ROLES.map(role => `${role.name}/${role.id}`).join('、')}`)
  console.log(`  模式=${FRESH ? '重建容器' : '复用容器'}`)
}
