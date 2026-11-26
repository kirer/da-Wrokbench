// 会话开场白 / 引导消息的正文。输入框不再预填，需求编号、平台和描述要点
// 都放在这条 assistant 消息里，产品直接照着描述即可。
export function greetingMessageText(body) {
  const clean = (value, max) => typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : ''
  const kind = body.kind === 'design' ? 'design' : 'requirement'
  const code = clean(body.code, 40)
  const title = clean(body.title, 120)
  const platforms = clean(body.platforms, 200)
  const prototypes = Number.isInteger(body.prototypes) ? Math.min(Math.max(body.prototypes, 0), 999) : 0
  const briefed = body.briefed === true
  // 同一个需求，不同角色开的会话要做的事不一样：负责人评审排期、开发认领开工、
  // 测试出结论、产品写需求。开场白跟着当前身份走，别让负责人去做原型。
  const role = clean(body.role, 20)
  const status = clean(body.status, 40)
  const round = Number.isInteger(body.round) ? Math.max(body.round, 0) : 0
  const reviewers = clean(body.reviewers, 200)
  // 平台在数据里是「服务端组 · 交易服务端；前端组 · Web」这种分组写法，
  // 说话时只留端名：交易服务端、Web。
  const platformPhrase = platforms
    .split(/[；;]/)
    .map(part => part.split('·').pop().trim())
    .filter(Boolean)
    .join('、')
  const subject = title !== ''
    ? (code !== '' ? `「${title}」（${code}）` : `「${title}」`)
    : (code !== '' ? code : '这条需求')
  const lines = []
  if (kind === 'design') {
    const scope = platformPhrase === '' ? '' : `要做的端有${platformPhrase}，`
    const prototypeLine = prototypes > 0
      ? `产品原型已经出了 ${prototypes} 屏。`
      : '产品原型还没出，这次直接按需求描述来设计。'
    lines.push(
      `这是${subject}的设计会话。${scope}${prototypeLine}`,
      '',
      '说说你想要的样子：给谁看、什么感觉、有没有可以参考的，或者直接指哪一屏哪里要改。想到哪写到哪。',
      '',
      '比如可以这样说：',
      '',
      '「整体清爽一点，主色用品牌蓝，课程卡片把适龄和剩余名额放在显眼位置，移动端优先。」',
      '',
      '说清楚后，我按 /design-start 的做法一屏一个 HTML 写进这条需求的 design/，写完点设计卡右上角「打开设计画布」就能看。',
    )
  } else if (role === 'lead' || role === 'admin') {
    const progress = status === 'pending_review'
      ? (round > 0
          ? `v${round} 已经提交，正等评审${reviewers !== '' ? `，会签人：${reviewers}` : ''}。`
          : '正等评审。')
      : status === 'changes_requested'
        ? '上一版被退回了，等产品改完重新提交。'
        : status === 'draft' || status === 'creating' || status === ''
          ? '产品还在整理文档，还没提交评审。'
          : '评审已经通过了，接下来是排期、指派开发这些事。'
    lines.push(
      platformPhrase === '' ? `这是${subject}。` : `这是${subject}，要做的端有${platformPhrase}。`,
      '',
      `${progress}评审直接说结论就行，比如：`,
      '',
      '「通过，意见：三屏原型覆盖了需求，同意进入开发」',
      '',
      '「退回：筛选无结果的空态还缺分级放宽建议，改完再提交」',
      '',
      '会签都通过后，回一句「排期 11-27 到 12-01，交易服务端 3 人天、Web 2 人天」就能定下计划和估时；要改会签人说「把会签人改成王五」。',
    )
  } else if (role === 'dev') {
    lines.push(
      platformPhrase === '' ? `这是${subject}的开发会话。` : `这是${subject}的开发会话，要做的端有${platformPhrase}。`,
      '',
      '开工就说「认领 Web 开发」或者「开始 Web 开发」，我会记下真实开工时间；开始前先跟我确认设计交付没有。',
      '',
      '写完说「完成 Web 开发、提测」，所有端都完成，需求就转给测试。',
    )
  } else if (role === 'qa') {
    lines.push(
      platformPhrase === '' ? `这是${subject}的测试会话。` : `这是${subject}的测试会话，涉及${platformPhrase}。`,
      '',
      '开发提测后说「开始测试」；有结论就说「测试通过」，或者「不通过：缺陷链接贴这里」。',
      '',
      '不通过我会通知开发和产品，修好之后你再测一轮就行。',
    )
  } else if (briefed) {
    lines.push(
      platformPhrase === '' ? `这是${subject}。` : `这是${subject}，要做的端有${platformPhrase}。`,
      '',
      '需求简报在活文档里，我能读到，不用再重复一遍。想补什么、改什么直接说，比如“名额满了报名按钮置灰”“没登录点报名先跳登录”。',
      '',
      '确认文档没问题后，回一句“开始做原型”，这是第二步：我按 /req-design 一屏一个 HTML 写进这条需求的 prototype/，写完点产品卡右上角「打开原型画布」就能看。',
    )
  } else {
    lines.push(
      platformPhrase === '' ? `这是${subject}。` : `这是${subject}，要做的端有${platformPhrase}。`,
      '',
      '我们分两步：第一步把需求聊清楚，我整理成需求文档；你确认文档后，第二步再出原型。先不用急着想页面。',
      '',
      '像平时跟同事讲需求那样说就行：谁在用、现在哪儿不顺手、你希望他们能做成什么。想到哪写到哪，不用凑格式，也不用一次说完。',
      '',
      '比如可以这样说：',
      '',
      '「家长选课时看不到适龄、上课形式和剩余名额，只能一个个点进去问客服。希望列表能按年龄和班型筛选，点进详情就能直接报名。」',
      '',
      '页面、状态、异常一时想不到没关系，我会顺着问。讲完后我先写进需求文档、复述一遍和你对齐，确认后再说原型。',
    )
  }
  return lines.join('\n')
}
