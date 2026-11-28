import { saveLocal } from './local.js'
import { serverJson } from './server.js'

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const SKILLS = [
  // 每个身份只加载自己前缀的技能；管理员看全部。技能名和斜杠命令同名，
  // 用户在产品/设计/开发/测试/负责人会话里看到的是一套干净的动作集合。
  {
    name: 'req-start',
    roles: ['product'],
    description: '开始一条需求或提出变更：把产品口述的背景、目标、范围、用户故事和验收标准整理成需求活文档；调用 workbench_update_document。',
    whenToUse: '产品描述新需求、改需求、补充验收标准，或评审退回后要改需求时',
    content: [
      '# 开始需求 / 提出变更',
      '',
      '1. 先调用 `workbench_requirement_status` 确认需求编号、状态和已有文档；当前会话已绑定需求时不用传编号。',
      '2. 把用户口述的内容整理成需求文档，调用 `workbench_update_document`：',
      '   - `summary`：一句话说明这次要解决的问题和范围。',
      '   - `body`：背景、目标、范围（做什么 / 不做什么）、用户故事、交互流程、数据与接口说明。',
      '   - `acceptanceCriteria`：逐条编号的验收标准，开发和测试直接引用。',
      '3. 变更时只改受影响的部分，保留其余内容；文档版本会自动递增。',
      '4. 不确定这次涉及哪些端时，调用 `workbench_experience` 用标题和文档找相似历史需求，看它们涉及的端和参与人，给出建议和理由；用户确认后，提交时用 `platformIds` 修正范围。没有相似历史就直说，不要编。',
      '5. 这一步只整理文档，不出原型。即使用户在一条消息里把需求和“出原型”一起说了，也先停在文档确认：复述文档要点、列出待确认项，等用户确认后再进入 `/req-design`。',
      '6. 确认后提示下一步：原型用 `/req-design`，发布用 `/req-submit`。不要替用户提交。',
      '7. 只汇报工具返回的文档版本号；不要编造未保存的内容。',
      '',
      '权限：产品/负责人/管理员可以编辑；创建中的需求要等创建完成。',
    ].join('\n'),
  },
  {
    name: 'req-design',
    roles: ['product'],
    description: '为需求做或改产品原型（低保真）：按屏写进需求文件夹的 prototype/；原型的版本在提交需求时固化。',
    whenToUse: '产品要求做原型、改原型、补一屏界面，或在需求会话里讨论页面结构时',
    content: [
      '# 做 / 改产品原型',
      '',
      '这是需求流程的第二步：先确认需求文档已经和用户对齐。文档还是空的、用户刚提了新变更、或你还没向用户复述过文档要点时，先用 `/req-start` 整理并等确认，不要直接出原型。',
      '',
      '1. 调用 `workbench_design_context`（当前会话已绑定需求时不用传编号），拿到需求状态、平台、需求文件夹的相对位置和已有原型文件。',
      '2. 一屏一个 HTML，写进需求文件夹的 `prototype/`（用工具输出里的那个相对目录，不是会话工作目录下的 `prototype/`）。',
      '3. 先看已有文件再改，避免覆盖用户手改的内容；文件名用中文语义化名字（如 `明细列表.html`、`筛选面板.html`），不要用 `points-list` 这种英文名，也不带序号。不要用本机绝对路径去猜需求文件夹。',
      '4. 写完不要调用 `wb_preview_page`、`wb_check_design`、`wb_look_design`，也不要打开独立预览面板：工作台会自动把 prototype/ 里的页面显示在需求页的产品卡片上，点「打开原型画布」就能看。',
      '5. 只写 prototype/，不要写 design/，不要调用交付工具。',
      '6. 只汇报改动文件、取舍和剩余问题；不要编造原型状态。',
      '',
      '## 低保真规则',
      '- 每屏是一份「原型 + 需求说明」的双栏文档：左边是可点的低保真界面，右边是需求说明栏；不能只有界面，也不能只有说明。',
      '- 右栏固定包含：背景与目标（压成 1-2 行）、本屏范围（入口和本屏要解决的事）、角色与权限、字段与业务规则、验收标准，最后保留 4-5 条「关键交互标注」。只写与本屏相关的条目，不要把整篇需求文档复制到每一屏。',
      '- 右栏沿用关键交互标注的样式：白底、1px 深灰边框、浅灰标题条、编号方块；章节标题固定为「需求说明」「关键交互标注」，接口字段和规则可直接用两列表格。',
      '- 原型是给团队看信息结构、流程和状态的，不是成品 UI。白底、1px 深灰边框、浅灰填充、系统字体，只用黑白灰。',
      '- 正文优先用灰色占位条或 XXXX，不要写满真实业务长文案；不要品牌色、照片、图标库、阴影、渐变、精致圆角、插画。',
      '- 每屏顶部标注「需求编号 · 低保真原型 序号/总数」和页面名；左侧界面内用编号标注关键交互，编号与右栏「关键交互标注」一一对应。',
      '- 单文件、内联 CSS/JS，不引用外部资源；桌面按 1440 宽设计；不要写绝对路径。',
      '',
      '## 版本',
      '原型平时随文件改动自动刷新，不单独记版本；用户用 `/req-submit` 提交需求时，工作台会把当前 prototype/ 固化成和需求同号的版本（v1、v2…），历史版本保留。所以先改完再提交。',
      '',
      '权限：产品/负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'req-submit',
    roles: ['product'],
    description: '提交需求进入评审，并把当前原型固化成对应版本；待评审中也能再提交成新版本。调用 workbench_submit_requirement。',
    whenToUse: '用户要求提交需求、发布给团队评审、在已提交的需求上做变更再出一版、重新提交修改后的需求时',
    content: [
      '# 提交需求 / 提交变更',
      '',
      '1. 从用户消息或当前会话里确定需求编号和状态；当前会话已绑定需求时不用传。',
      '   待评审中也能再提交：相当于在这版需求上做变更，会生成下一个版本（如 v2），评审按最新一版重新开始，上一版的会签记录保留但不再计数。',
      '2. 范围确认（每次提交前都要问一次，不要直接提交）：先调用 `workbench_assignment_options`，它会给出当前涉及端、设计状态、相似历史需求和每人的平台经验/当前未完成开发数；需要更细的经历时调用 `workbench_experience`。据此判断这条需求可能涉及哪些端：相似历史需求反复用到的端可以提出来建议补上；当前端没有历史支撑、用户也没提的，不要编。然后复述给用户，明确问两句：这些端都要吗，有没有不需要的？这条需求需要设计交付吗？用户确认后才把变化传进提交工具；用户没提就不要改，不要替用户删端或标「无需设计」。',
      '3. 分工建议：按设计、各端开发、测试各给一个建议，优先推荐在相似需求或该平台做过、当前未完成开发数少的人，一句话说明理由（做过什么 + 手上几件）。明确问用户：按建议指派、换人、还是都不指定。',
      '4. 用户确认后调用 `workbench_submit_requirement`：',
      '   - `summary` 写一句本次提交/变更摘要。',
      '   - `platformIds`：用户明确要改涉及端时传完整平台 id 列表（整体替换）；不改就省略。已经有开发任务时不能再改。',
      '   - `designNotNeeded`：用户明确说不需要设计交付时传 `true`；要把「无需设计」改回来传 `false`；不改就省略。',
      '   - `assignments` 只放用户明确选的人：`designerId`、`testerId`、`dev: [{ platformId, assigneeId }]`。用户说不用指定任何人时整个省略，不要替用户决定。',
      '5. 提交会把当前 `prototype/` 原型固化成和需求同号的版本（v1、v2…），历史版本保留；原型还没做过也可以提交，只是没有原型版本。',
      '6. 提交后需求进入待评审，会签人会收到提醒。只汇报工具返回的编号、状态、版本号和分工。',
      '7. 评审退回后：先 `/req-start` 改文档、`/req-design` 改原型，再 `/req-submit` 重新提交 vN。',
      '',
      '权限：产品/负责人/管理员可以提交；变更中的需求需要创建人或有排期权限的人提交。',
    ].join('\n'),
  },
  {
    name: 'design-claim',
    roles: ['design'],
    description: '认领研发工作台中的设计任务；调用 workbench_claim_design 工具。',
    whenToUse: '设计人员要求认领某条需求的设计时',
    content: [
      '# 认领设计',
      '',
      '1. 确定需求编号（如 S11-004）。',
      '2. 调用 `workbench_claim_design`。',
      '3. 只汇报工具返回的结果；不要编造设计状态。',
      '',
      '权限：设计/负责人/管理员可以认领；已有其他设计负责人时会被拒绝。',
    ].join('\n'),
  },
  {
    name: 'design-start',
    roles: ['design'],
    description: '开始或继续高保真设计：读取需求和产品原型，一屏一个 HTML 写进需求文件夹的 design/；写完在设计卡片上打开画布。',
    whenToUse: '用户要求做高保真设计稿、继续设计、改设计稿时',
    content: [
      '# 开始 / 继续高保真设计',
      '',
      '1. 调用 `workbench_design_context`（当前会话已绑定需求时不用传编号），拿到需求状态、平台、需求文件夹的相对位置和已有文件。',
      '2. 加载 `ui-design` 技能，按需求文档和 `prototype/` 的信息结构做设计：一屏一个 HTML 写进需求文件夹的 `design/`（需求文件夹里已有设计文件时就放它旁边）。',
      '3. 设计未认领且当前身份是设计时，调用 `workbench_claim_design`。',
      '4. 先看已有文件再改，避免覆盖用户手改的内容；文件名用中文语义化名字（如 `明细列表.html`、`筛选面板.html`），不要用英文名，也不带序号。不要用本机绝对路径去猜需求文件夹，以工具给的相对位置为准。',
      '5. 不要调用 `wb_preview_page`、`wb_check_design`、`wb_look_design`，也不要打开画布自带的独立预览面板：design/ 里的页面会自动显示在设计卡片上，点「打开设计画布」就能看。ui-design 技能里要求 preview / check 的步骤在本工作台里跳过。',
      '6. 需要视觉自查时按 ui-design 技能的「自查」清单读源文件检查；最多三轮。',
      '7. 设计稿完成后提示用户在会话里用 `/design-deliver` 交付；不要自行调用交付工具，除非用户明确要求交付。',
      '8. 只汇报改动文件、取舍和剩余问题；不要编造设计状态。',
      '',
      '## 高保真规则',
      '- 使用真实中文文案、贴近业务的数据、明确的层级/留白/状态/操作。',
      '- 不引用外部图片、字体或图标库；需要图片时用内联 SVG 或 data URL。',
      '- 单文件、内联 CSS/JS；桌面按 1440 宽设计。',
      '',
      '权限：设计/负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'design-deliver',
    roles: ['design'],
    description: '交付当前需求的设计：记录设计版本与文件，把设计状态改为已交付；调用 workbench_deliver_design。',
    whenToUse: '设计人员或负责人要求交付设计、设计完成、提交设计稿时',
    content: [
      '# 交付设计',
      '',
      '1. 调用 `workbench_design_context` 确认需求文件夹和设计文件。',
      '2. 调用 `workbench_deliver_design`，`summary` 写一句本次交付摘要，`files` 传相对需求文件夹的路径（如 design/01-overview.html，别带需求目录名；省略时自动扫描）。路径写错导致文件没附上时交付会直接报错，不会产生空版本。',
      '3. 只汇报工具返回的结果；不要自己编造设计版本或交付状态。',
      '',
      '开发开始后交付或二次交付会自动标记“设计已更新”，并通知开发负责人。',
      '',
      '权限：设计/负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'dev-start',
    roles: ['dev'],
    description: '认领并开始某个平台的开发，记录真实开发开始时间；调用 workbench_dev_action(action=claim/start)。',
    whenToUse: '用户要求开始开发、认领开发任务、继续开发时',
    content: [
      '# 开始开发',
      '',
      '1. 确定需求和平台。',
      '2. 未指派时先调用 `workbench_dev_action` 的 `claim`；已指派时直接 `start`。',
      '3. `start` 会记录真实开发开始时间，之后交付的设计会标记“设计已更新”。',
      '4. 开始前提醒用户确认设计是否已交付。',
      '',
      '权限：开发/负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'dev-finish',
    roles: ['dev'],
    description: '完成某个平台的开发并提测；调用 workbench_dev_action(action=finish)。',
    whenToUse: '用户要求完成开发、提测、提交 MR 时',
    content: [
      '# 完成开发',
      '',
      '1. 确认需求和平台。',
      '2. 调用 `workbench_dev_action`，`action` 传 `finish`。',
      '3. 所有平台完成后需求进入「待测试」，并通知测试人员。',
      '4. 测试不通过需要重新开发时，调用 `workbench_dev_action`，`action` 传 `reopen`。',
      '',
      '权限：开发/负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'test-verify',
    roles: ['qa'],
    description: '测试开始、通过或不通过；调用 workbench_test_action。',
    whenToUse: '用户要求开始测试、提交测试结论、记录测试缺陷时',
    content: [
      '# 测试验证',
      '',
      '1. 确认需求已进入待测试；测试负责人还没人认领时，先 `claim` 认领。',
      '2. `start` 开始测试；`pass` 记录通过；`fail` 记录不通过和缺陷链接。',
      '3. 不通过会通知开发负责人和需求负责人；修复后重新 `start`。',
      '4. 全部通过后才能冻结。',
      '',
      '权限：测试/负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'lead-review',
    roles: ['lead'],
    description: '评审一个待评审需求：通过后进入已通过，退回后进入待修改；支持多人会签。调用 workbench_review_requirement。',
    whenToUse: '用户要求评审需求、通过/退回需求、给需求提评审意见时',
    content: [
      '# 评审需求',
      '',
      '1. 确定需求编号；需要时先调用 `workbench_requirement_status` 确认是否为「待评审」。',
      '2. 向用户确认评审结论（通过 / 退回）和评审意见；不要替用户做决定。',
      '3. 调用 `workbench_review_requirement`，`decision` 传 `approve` 或 `reject`。',
      '4. 多人会签时，提示还有哪些会签人未确认；全部通过后才进入已通过。',
      '5. 通过后提示可以继续排期（`/lead-schedule`）；退回后提示产品修改并重新 `/req-submit`。',
      '',
      '权限：会签人/负责人/管理员；不能评审自己提交的需求。',
    ].join('\n'),
  },
  {
    name: 'lead-reviewers',
    roles: ['lead'],
    description: '设置需求会签人；调用 workbench_set_reviewers。',
    whenToUse: '用户要求设置会签人、增加评审人、改成多人评审时',
    content: [
      '# 设置会签人',
      '',
      '1. 确定需求编号和会签人用户 id 列表。',
      '2. 调用 `workbench_set_reviewers`。',
      '3. 只有待评审阶段可以设置；所有人通过后需求才进入已通过。',
      '',
      '权限：负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'lead-schedule',
    roles: ['lead'],
    description: '给已通过评审的需求排期：设置计划开始/结束日期，用户给了按端估时就一起填（人天）；调用 workbench_schedule_requirement。',
    whenToUse: '用户要求排期、调整需求计划时间、定开始/结束日期时',
    content: [
      '# 需求排期',
      '',
      '1. 确定需求编号；需要时先调用 `workbench_requirement_status` 确认已通过、在本期范围内。',
      '2. 向用户确认计划开始和结束日期（YYYY-MM-DD）；可以只改一端。',
      '3. 用户给出按端估时（人天）时，在 estimates 里传 [{ platformId, days }]；没给就不传，不要自己编。',
      '4. 调用 `workbench_schedule_requirement`。',
      '5. 只汇报工具返回的计划日期、估时和状态。',
      '',
      '示例：「排期 11-27 到 12-01，交易服务端 3 人天、Web 2 人天」。',
      '',
      '权限：负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'lead-scope',
    roles: ['lead'],
    description: '调整需求的本期范围：纳入本期或移出到暂缓；调用 workbench_scope_requirement。',
    whenToUse: '用户要求把需求纳入/移出本期、调整迭代范围、暂缓需求时',
    content: [
      '# 调整需求范围',
      '',
      '1. 确定需求编号，向用户确认纳入还是移出，以及原因。',
      '2. 调用 `workbench_scope_requirement`。',
      '3. 范围调整会记录在需求变更历史里。',
      '',
      '权限：负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'lead-move',
    roles: ['lead'],
    description: '把需求移动到另一个迭代并重新编号；调用 workbench_move_requirement。',
    whenToUse: '用户要求把需求挪到别的迭代、下期再做、跨迭代调整时',
    content: [
      '# 跨迭代移动',
      '',
      '1. 确认需求编号和目标迭代。',
      '2. 调用 `workbench_move_requirement`。',
      '3. 服务端会按目标迭代短码重新编号，并通知需求负责人。',
      '4. 已发布需求不允许移动。',
      '',
      '权限：负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'lead-assign-dev',
    roles: ['lead'],
    description: '按平台指派开发负责人；调用 workbench_dev_action(action=assign)。',
    whenToUse: '用户要求分配开发、指定某端负责人时',
    content: [
      '# 指派开发',
      '',
      '1. 确定需求、平台和开发负责人用户 id。',
      '2. 调用 `workbench_dev_action`，`action` 传 `assign`，传 `platformId` 和 `assigneeId`。',
      '3. 被指派的人也可以在自己的会话里用 `workbench_dev_action` 的 `claim`、`start` 自行认领并开始开发。',
      '',
      '权限：负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'lead-iteration-plan',
    roles: ['lead'],
    description: '查看当前迭代的需求排期概览，并协助做评审、排期、范围调整和会签设置。',
    whenToUse: '用户要求看迭代排期、过一遍本期需求、调整迭代计划时',
    content: [
      '# 迭代排期',
      '',
      '1. 调用 `workbench_iteration_status`（不传参数时取当前迭代）。',
      '2. 先给用户简短概览，只列有内容的项：待评审、未排期、范围外、设计未认领、设计已更新、测试不通过。空的分组不要逐条列出（“设计未认领：无”容易被读成设计没人认领），没提到的就是没有。',
      '3. 询问用户要调整哪些需求；不要一次性批量改动，也不要替用户做评审结论。',
      '4. 按用户确认逐条调用评审、排期、范围、会签工具。',
      '',
      '权限：负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'lead-iteration-edit',
    roles: ['lead'],
    description: '修改迭代名称/阶段/状态/日期/会签人，或归档恢复迭代；调用 workbench_iteration_update。',
    whenToUse: '用户要求编辑迭代、结束迭代、归档迭代、恢复迭代、调整默认会签人时',
    content: [
      '# 迭代管理',
      '',
      '1. 确认目标迭代。',
      '2. 调用 `workbench_iteration_update`，按用户要求传名称、阶段、状态、日期、会签人或 `archived`。',
      '3. 归档前提醒用户：归档后迭代从切换列表隐藏，历史需求保留。',
      '',
      '权限：负责人/管理员。',
    ].join('\n'),
  },
  {
    name: 'lead-release',
    roles: ['lead'],
    description: '测试通过后冻结、解冻和发布；调用 workbench_release_action。',
    whenToUse: '用户要求冻结需求、发布上线、解冻需求时',
    content: [
      '# 冻结与发布',
      '',
      '1. 确认需求已测试通过。',
      '2. `freeze` 冻结；`release` 发布并传版本号；`unfreeze` 解冻回到测试通过。',
      '3. 只汇报服务端返回的状态和版本号。',
      '',
      '权限：负责人/管理员。',
    ].join('\n'),
  },
]

export const BUILTIN_SKILL_NAMES = new Set(SKILLS.map(skill => skill.name))

export const WORKBENCH_SKILL_PROVIDER = 'dsh-workbench-roles'

// 团队技能库里已发布的技能；syncPublishedSkills 启动时拉一次，按 rolePacks
// 过滤后一起出现在技能目录里。空 rolePacks 表示所有身份都能用。
// 团队技能按登录 token（≈用户）分桶缓存：同一个 BFF 进程被多个用户共用时，
// 以前用一个全局 Map 会被后一个用户覆盖、串号。这里按 token 隔离，最多保留 16 个桶。
export const publishedSkillsByToken = new Map()
const MAX_SKILL_TOKENS = 16
const emptySkillMap = new Map()
function publishedSkillsForCurrent() {
  const token = activeWorkbenchUser.token
  if (typeof token !== 'string' || token === '') return emptySkillMap
  return publishedSkillsByToken.get(token) ?? emptySkillMap
}

// 当前使用这个 DSH 的工作台身份。桌面端通常一人一号；身份和当前角色由
// makeRoute 在每个已登录请求上更新，角色一变就刷新技能目录和斜杠命令。
export let activeWorkbenchUser = { userId: null, role: '', token: null }

export const workbenchRoleListeners = new Set()

export let workbenchSkillsControl = null

export function roleFromWorkbenchUser(user) {
  const roles = Array.isArray(user?.roles)
    ? user.roles.filter(role => typeof role === 'string' && role !== '')
    : []
  const active = typeof user?.activeRole === 'string' ? user.activeRole : ''
  if (active !== '' && roles.includes(active)) return active
  return roles[0] ?? ''
}

export function currentWorkbenchRole(local) {
  if (activeWorkbenchUser.role !== '') return activeWorkbenchUser.role
  return typeof local?.lastRole === 'string' ? local.lastRole : ''
}

export function onWorkbenchRoleChange(listener) {
  workbenchRoleListeners.add(listener)
  return () => workbenchRoleListeners.delete(listener)
}

export function noteActiveWorkbenchUser(local, user, token = activeWorkbenchUser.token ?? null) {
  if (!user || typeof user.id !== 'string' || user.id === '') return
  const role = roleFromWorkbenchUser(user)
  // 留住这个账号的登录令牌：团队技能同步要用真实身份去取，按可见范围过滤。
  const previous = activeWorkbenchUser
  // 第一次拿到登录令牌也要算“变了”：启动时的同步没有身份，要等第一个登录请求补上。
  // 必须与旧值比较后再赋值，否则先写 token 再判 null 会永远为 false，漏掉首次补令牌。
  const changed = previous.userId !== user.id
    || previous.role !== role
    || (token !== null && token !== previous.token)
    || previous.token === null
  activeWorkbenchUser = { userId: user.id, role, token }
  if (local.lastUserId !== user.id || local.lastRole !== role) {
    local.lastUserId = user.id
    local.lastRole = role
    try { saveLocal(local) } catch { /* 持久化失败不影响请求 */ }
  }
  if (!changed) return
  for (const listener of workbenchRoleListeners) {
    try { listener(role) } catch { /* 单个监听失败不影响其它监听 */ }
  }
}

// 管理员可以用全部身份的技能和命令；其他人只看到自己当前身份的那一套。
export function roleCanUse(role, roles) {
  return role === 'admin' || (Array.isArray(roles) && roles.includes(role))
}

export function publishedSkillVisible(skill, role) {
  if (role === 'admin') return true
  if (!Array.isArray(skill.rolePacks) || skill.rolePacks.length === 0) return true
  return skill.rolePacks.includes(role)
}

export function skillCandidate(skill, locator) {
  return {
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'runtime',
    provider: WORKBENCH_SKILL_PROVIDER,
    rank: 250,
    locator,
  }
}

export function roleSkillCandidates(role) {
  const candidates = []
  for (const skill of SKILLS) {
    if (!roleCanUse(role, skill.roles)) continue
    candidates.push(skillCandidate(skill, { kind: 'builtin', name: skill.name }))
  }
  for (const skill of publishedSkillsForCurrent().values()) {
    if (!publishedSkillVisible(skill, role)) continue
    candidates.push(skillCandidate(skill, { kind: 'published', name: skill.name }))
  }
  return candidates
}

export function skillDefinitionFor(candidate) {
  const name = typeof candidate?.name === 'string' ? candidate.name : ''
  const locator = candidate?.locator
  if (locator?.kind === 'builtin') {
    const skill = SKILLS.find(item => item.name === name)
    if (!skill) return undefined
    return {
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'runtime',
      provider: WORKBENCH_SKILL_PROVIDER,
      content: skill.content,
    }
  }
  const skill = publishedSkillsForCurrent().get(name)
  if (!skill) return undefined
  return {
    name: skill.name,
    description: skill.description,
    whenToUse: '团队技能库中已审核发布的技能',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'runtime',
    provider: WORKBENCH_SKILL_PROVIDER,
    content: skill.content,
  }
}

export function invalidateWorkbenchSkills() {
  try { workbenchSkillsControl?.invalidate?.() } catch { /* 目录失效失败不影响请求 */ }
}

export function registerSkills(ctx, local) {
  ctx.inject(['skills'], (sub) => {
    try {
      sub.skills.registerProvider((control) => {
        workbenchSkillsControl = control
        return {
          name: WORKBENCH_SKILL_PROVIDER,
          list: async () => roleSkillCandidates(currentWorkbenchRole(local)),
          get: async (candidate) => skillDefinitionFor(candidate),
        }
      })
    } catch (reason) {
      ctx.logger?.warn?.(`[dsh-workbench] 注册角色技能提供方失败：${reason instanceof Error ? reason.message : String(reason)}`)
    }
  })
  const offRoleChange = onWorkbenchRoleChange(() => {
    invalidateWorkbenchSkills()
    // 身份变了，可见的团队技能范围也变了（负责人能看到的和别人不同），重新拉一次。
    void syncPublishedSkills(ctx, local)
  })
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => offRoleChange, 'dsh-workbench: 身份变化时刷新技能目录')
  }
}

export async function syncPublishedSkills(ctx, local) {
  try {
    // 以当前登录账号的身份取：服务端按“负责人看全部、其他人看团队 + 自己的”过滤。
    // 以前写死 actor=admin，依赖演示数据里恰好有个叫 admin 的账号，真实部署会 401。
    const token = activeWorkbenchUser.token
    if (typeof token !== 'string' || token === '') return
    const data = await serverJson('/skills/published', { token })
    const bucket = new Map()
    for (const skill of data.skills || []) {
      if (!skill || typeof skill.name !== 'string' || skill.name === '') continue
      if (BUILTIN_SKILL_NAMES.has(skill.name)) continue
      bucket.set(skill.name, {
        name: skill.name,
        description: String(skill.description ?? ''),
        rolePacks: Array.isArray(skill.rolePacks) ? skill.rolePacks : [],
        content: String(skill.content ?? ''),
      })
    }
    publishedSkillsByToken.set(token, bucket)
    // 分桶按插入序淘汰最旧的，避免账号切换多了无限增长。
    if (publishedSkillsByToken.size > MAX_SKILL_TOKENS) {
      const oldest = publishedSkillsByToken.keys().next()
      if (!oldest.done) publishedSkillsByToken.delete(oldest.value)
    }
    invalidateWorkbenchSkills()
  } catch (reason) {
    ctx.logger?.warn?.(`[dsh-workbench] 团队技能同步失败：${reason instanceof Error ? reason.message : String(reason)}`)
  }
}
