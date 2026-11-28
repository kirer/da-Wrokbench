    function iterationRequirements(state, iterationId) {
      return (state?.requirements ?? []).filter(item => item.iterationId === iterationId)
    }

    function requirementWeight(status) {
      switch (status) {
        case 'released':
        case 'done': return 1
        case 'test_passed':
        case 'frozen': return 0.85
        case 'testing': return 0.6
        case 'dev_done': return 0.5
        case 'in_progress': return 0.35
        case 'scheduled': return 0.2
        case 'pending_review': return 0.1
        default: return 0
      }
    }

    function requirementsProgress(requirements) {
      if (requirements.length === 0) return 0
      const score = requirements.reduce((sum, item) => sum + requirementWeight(item.status), 0)
      return Math.round((score / requirements.length) * 100)
    }

    function iterationPhaseLabel(iteration, requirements) {
      if (iteration.status === 'planning') return '规划中'
      if (iteration.status === 'done') return '已封板'
      if (requirements.length === 0) return '规划中'
      if (requirements.every(item => ['released', 'done'].includes(item.status))) return '已封板'
      if (requirements.some(item => ['testing', 'test_failed', 'test_passed', 'frozen'].includes(item.status))) return '测试'
      if (requirements.some(item => ['in_progress', 'dev_done'].includes(item.status))) return '开发'
      if (requirements.some(item => item.status === 'pending_review')) return '评审'
      if (requirements.some(item => ['designing', 'changes_requested'].includes(item.designStatus))) return '设计'
      return '需求'
    }

    function iterationRisk(requirements) {
      const failed = requirements.filter(item =>
        item.status === 'test_failed' ||
        (item.devTasks ?? []).some(task => task.pipelineStatus === 'failed')).length
      const design = requirements.filter(item =>
        item.inScope !== false && !['delivered', 'not_needed'].includes(item.designStatus)).length
      const changed = requirements.filter(item => item.designUpdatedAt).length
      const parts = []
      if (failed > 0) parts.push(`测试 ${failed}`)
      if (design > 0) parts.push(`设计 ${design}`)
      if (changed > 0) parts.push(`变更 ${changed}`)
      return { count: failed + design + changed, text: parts.join(' · ') || '—' }
    }

    function Avatar({ name, size = 18 }) {
      const text = String(name ?? '?').trim().slice(0, 1) || '?'
      let hash = 0
      for (const ch of String(name ?? '')) hash = (hash * 31 + ch.codePointAt(0)) % 997
      const variant = (hash % 6) + 1
      const style = size === 18 ? undefined : { width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(9, size - 9)}px` }
      return h('span', {
        className: `avatar sm av-${variant} dsh-wb-avatar`,
        style,
        title: name || '',
        'aria-hidden': 'true',
      }, text)
    }

    function IterationKpis({ state, entries }) {
      const activeEntries = entries.filter(entry => entry.iteration.status === 'in_progress')
      const active = activeEntries.length
      const total = entries.reduce((sum, entry) => sum + entry.requirements.length, 0)
      const month = monthKey()
      const closedEntries = entries.filter(entry =>
        entry.iteration.status === 'done' &&
        monthOf(entry.iteration.closedAt ?? entry.iteration.endDate) === month)
      const risk = entries.reduce((sum, entry) => sum + iterationRisk(entry.requirements).count, 0)
      const undelivered = entries.reduce((sum, entry) => sum + entry.requirements.filter(item =>
        item.inScope !== false && !['delivered', 'not_needed'].includes(item.designStatus)).length, 0)
      const failed = entries.reduce((sum, entry) => sum + entry.requirements.filter(item => item.status === 'test_failed').length, 0)
      const scheduled = entries.reduce((sum, entry) => sum + entry.requirements.filter(item => item.status === 'scheduled').length, 0)
      const doing = entries.reduce((sum, entry) => sum + entry.requirements.filter(item => ['in_progress', 'dev_done', 'testing'].includes(item.status)).length, 0)
      return h('div', { className: 'kpis' },
        h('div', { className: 'kpi' },
          h('div', { className: 'lab' }, h(DesignIcon, { name: 'dot', size: 12, className: 'ic', style: { color: 'var(--primary)' } }), '进行中迭代'),
          h('div', { className: 'v' }, String(active)),
          h('div', { className: 'd' }, activeEntries.map(entry => entry.iteration.shortCode ?? entry.iteration.code).join(' · ') || '暂无进行中迭代'),
        ),
        h('div', { className: 'kpi' },
          h('div', { className: 'lab' }, h(DesignIcon, { name: 'iter', size: 12, className: 'ic', style: { color: 'var(--text-3)' } }), '需求总数'),
          h('div', { className: 'v' }, String(total)),
          h('div', { className: 'd' }, `已排期 ${scheduled} · 进行中 ${doing}`),
        ),
        h('div', { className: 'kpi' },
          h('div', { className: 'lab' }, h(DesignIcon, { name: 'check-circle', size: 12, className: 'ic', style: { color: 'var(--green)' } }), '本月封板'),
          h('div', { className: 'v' }, String(closedEntries.length)),
          h('div', { className: 'd' }, closedEntries.length > 0 ? closedEntries.map(entry => entry.iteration.name).join(' · ') : '还没有封板迭代'),
        ),
        h('div', { className: 'kpi' },
          h('div', { className: 'lab' }, h(DesignIcon, { name: 'alert', size: 12, className: 'ic', style: { color: 'var(--amber)' } }), '风险项'),
          h('div', { className: 'v' }, String(risk)),
          h('div', { className: 'd' }, risk > 0 ? `设计未交付 ${undelivered} · 测试阻塞 ${failed}` : '暂无风险'),
        ),
      )
    }

    function IterationListView({ state, query, onQuery, filter, onFilter, onOpen, onCreate, onOpenMy, onOpenSkills, canCreate, hasProject = true }) {
      const projectId = state.project?.id ?? state.currentProjectId ?? null
      const uid = state.currentUser.id
      const normalized = query.trim().toLowerCase()
      // 重算成本集中在两次过滤 + 逐迭代统计：用 useMemo 隔离，避免弹窗/toast 等
      // 无关状态变化时把整张列表重新算一遍。
      const entries = useMemo(() => [...(state.iterations ?? [])]
        .filter(iteration => iteration.archived !== true)
        // 导航是 项目 → 迭代 → 需求：迭代列表只展示当前项目下的迭代。
        .filter(iteration => projectId === null || iteration.projectId === projectId)
        .map(iteration => ({ iteration, requirements: iterationRequirements(state, iteration.id) })),
        [state, projectId])
      const visible = useMemo(() => entries.filter(({ iteration, requirements }) => {
        if (normalized !== '' && !`${iteration.code} ${iteration.name}`.toLowerCase().includes(normalized)) return false
        if (filter === 'mine') {
          return iteration.ownerId === uid || requirements.some(requirement =>
            requirement.ownerId === uid ||
            requirement.designerId === uid ||
            requirement.testerId === uid ||
            (requirement.reviewerIds ?? []).includes(uid) ||
            (requirement.devTasks ?? []).some(task => task.assigneeId === uid))
        }
        if (filter === 'active') return iteration.status === 'in_progress'
        if (filter === 'done') return iteration.status === 'done'
        return true
      }), [entries, normalized, filter, uid])
      const ordered = visible

      return h('div', { className: 'page' },
        h('div', { className: 'home-links' },
          h('button', { className: 'home-link', type: 'button', onClick: onOpenMy },
            h(DesignIcon, { name: 'workbench' }),
            h('span', { className: 'home-link-body' },
              h('b', null, '我的工作台'),
              h('span', null, '需求、设计任务、待办合成一份清单'),
            ),
            h(DesignIcon, { name: 'chev-right', className: 'chev' }),
          ),
          h('button', { className: 'home-link', type: 'button', onClick: onOpenSkills },
            h(DesignIcon, { name: 'skills' }),
            h('span', { className: 'home-link-body' },
              h('b', null, '技能'),
              h('span', null, '团队技能与个人技能，按角色可用'),
            ),
            h(DesignIcon, { name: 'chev-right', className: 'chev' }),
          ),
        ),
        h(IterationKpis, { state, entries }),
        h('div', { className: 'toolbar' },
          h('div', { className: 'seg' },
            [['all', '全部'], ['mine', '我参与的'], ['active', '进行中'], ['done', '已封板']].map(([key, label]) =>
              h('button', {
                key,
                type: 'button',
                className: filter === key ? 'active' : '',
                onClick: () => onFilter(key),
              }, label)),
          ),
          h('div', { className: 'spacer' }),
          canCreate ? h('button', { className: 'btn btn-sm btn-primary', type: 'button', onClick: onCreate },
            h(DesignIcon, { name: 'plus' }), '新建迭代') : null,
        ),
        ordered.length === 0
          ? h('div', { className: 'empty-page' },
              h(DesignIcon, { name: normalized !== '' ? 'search' : 'iter', size: 28 }),
              h('b', null, normalized !== '' ? '没有匹配的迭代' : hasProject ? '这个项目还没有迭代' : '还没有项目'),
              h('span', null, normalized !== ''
                ? '换一个关键词或筛选条件。'
                : hasProject
                  ? (canCreate ? '点右上「新建迭代」开始。' : '等负责人创建迭代后再来。')
                  : '先在左上角项目菜单新建项目。'),
            )
          : h('div', { className: 'table-wrap' },
              h('table', { className: 'table', style: { minWidth: '920px' } },
                h('thead', null, h('tr', null,
                  h('th', { style: { width: '120px' } }, '编号'),
                  h('th', null, '迭代名称'),
                  h('th', { style: { width: '130px' } }, '当前阶段'),
                  h('th', { style: { width: '150px' } }, '起止'),
                  h('th', { style: { width: '92px' } }, '负责人'),
                  h('th', { style: { width: '66px' } }, '需求'),
                  h('th', { style: { width: '130px' } }, '进度'),
                  h('th', { style: { width: '120px' } }, '风险'),
                )),
                h('tbody', null,
                  ordered.map(({ iteration, requirements }, index) => {
                    const owner = state.users.find(user => user.id === iteration.ownerId)
                    const phase = iterationPhaseLabel(iteration, requirements)
                    const progress = requirementsProgress(requirements)
                    const risk = iterationRisk(requirements)
                    const inScope = requirements.filter(item => item.inScope !== false).length
                    return h('tr', {
                      key: iteration.id,
                      className: index === 0 ? 'active' : '',
                      onClick: () => onOpen(iteration.id),
                    },
                      h('td', { className: 'td-code' }, iteration.code),
                      h('td', null,
                        h('a', {
                          className: 'rk',
                          href: '#',
                          onClick: event => { event.preventDefault(); onOpen(iteration.id) },
                        }, iteration.name),
                      ),
                      h('td', null, h(DesignChip, { tone: phaseChipTone(phase), glyph: phase === '已封板' ? '✓' : phase === '规划中' ? '○' : '◐' }, phase)),
                      h('td', { className: 'mono', style: { fontSize: '12px', color: 'var(--text-3)' } }, `${shortDay(iteration.startDate)} → ${shortDay(iteration.endDate)}`),
                      h('td', null, h('span', { className: 'assignee' },
                        h(Avatar, { name: owner?.name ?? iteration.ownerId }),
                        h('span', { className: 'nm' }, owner?.name ?? iteration.ownerId),
                      )),
                      h('td', null, h('span', { className: 'mono', style: { color: inScope > 0 ? 'var(--text)' : 'var(--text-3)' } }, String(inScope))),
                      h('td', null, h('div', { className: 'row gap-3' },
                        h('div', { className: `progress${progress >= 100 ? ' green' : ''}`, style: { flex: 1 } },
                          h('span', { style: { width: `${Math.min(100, progress)}%` } })),
                        h('span', { className: 'tiny mono muted' }, `${progress}%`),
                      )),
                      h('td', null, risk.count > 0
                        ? h(DesignChip, { tone: 'warn', glyph: '◷', title: risk.text }, risk.text)
                        : h('span', { className: 'muted tiny' }, '—')),
                    )
                  }),
                ),
              ),
            ),
      )
    }

    function phaseRows(requirements) {
      const total = requirements.length
      const pending = requirements.filter(item => ['pending_review', 'draft', 'changes_requested'].includes(item.status)).length
      const reviewedStatus = new Set(['approved', 'scheduled', 'backlog', 'in_progress', 'dev_done', 'testing', 'test_failed', 'test_passed', 'frozen', 'released', 'done'])
      const reviewed = requirements.filter(item =>
        reviewedStatus.has(item.status) || (item.reviews ?? []).some(review => review.decision === 'approved')).length
      const designReady = requirements.filter(item => ['delivered', 'not_needed'].includes(item.designStatus)).length
      const designing = requirements.filter(item => ['designing', 'changes_requested'].includes(item.designStatus)).length
      const devTasks = requirements.flatMap(item => item.devTasks ?? [])
      const devDone = devTasks.filter(task => task.status === 'done').length
      const devDoing = devTasks.filter(task => task.status === 'in_progress').length
      const testRuns = requirements.flatMap(item => item.testRuns ?? [])
      const testDone = testRuns.filter(run => run.status === 'passed' || run.status === 'failed').length
      const released = requirements.filter(item => ['released', 'done'].includes(item.status)).length
      const pct = (a, b) => b === 0 ? 0 : Math.round((a / b) * 100)
      return [
        { label: '需求与评审', meta: `${reviewed}/${total} 已评审`, pct: pct(reviewed, total), tone: pending > 0 ? 'progress' : total > 0 ? 'done' : 'idle' },
        { label: '设计', meta: `${designReady}/${total} 已交付/无需`, pct: pct(designReady, total), tone: designing > 0 ? 'progress' : designReady === total && total > 0 ? 'done' : 'idle' },
        { label: '开发', meta: `${devDone}/${devTasks.length} 端完成`, pct: pct(devDone, devTasks.length), tone: devDoing > 0 ? 'progress' : devTasks.length > 0 && devDone === devTasks.length ? 'done' : 'idle' },
        { label: '测试', meta: `${testDone}/${testRuns.length} 轮完成`, pct: pct(testDone, testRuns.length), tone: testRuns.some(run => run.status === 'running') ? 'progress' : testRuns.length > 0 && testDone === testRuns.length ? 'done' : 'idle' },
        { label: '封板', meta: `${released}/${total} 已发布`, pct: pct(released, total), tone: released === total && total > 0 ? 'done' : 'idle' },
      ]
    }

    function devTaskChipMeta(task) {
      if (!task) return { tone: 'idle', glyph: '○', label: '未开始' }
      if (task.status === 'done') return { tone: 'done', glyph: '✓', label: '已完成' }
      if (task.status === 'in_progress') return { tone: 'prog', glyph: '◐', label: '开发中' }
      if (task.status === 'assigned') return { tone: 'warn', glyph: '◷', label: '已指派' }
      return { tone: 'idle', glyph: '○', label: '未开始' }
    }

    function testChipMeta(run) {
      if (!run) return { tone: 'idle', glyph: '○', label: '测试未开始' }
      if (run.status === 'passed') return { tone: 'done', glyph: '✓', label: '测试通过' }
      if (run.status === 'failed') return { tone: 'block', glyph: '!', label: '测试不通过' }
      return { tone: 'prog', glyph: '◐', label: '测试中' }
    }

    function shortDay(value) {
      const time = Date.parse(value)
      if (Number.isNaN(time)) return '待定'
      const date = new Date(time)
      return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    // 人天保留一位小数，整数不带 .0（4 人天，不是 4.0 人天）。
    function dayCount(value) {
      const rounded = Math.round(value * 10) / 10
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
    }

    function phaseDateText(start, end, left, width) {
      const startTime = Date.parse(start)
      const endTime = Date.parse(end)
      if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return '待定'
      const at = fraction => shortDay(new Date(startTime + (endTime - startTime) * fraction).toISOString())
      const from = at(left / 100)
      const to = at(Math.min(100, (left + width) / 100))
      return from === to ? from : `${from}→${to}`
    }

    // 和服务端 delete_requirement 同一条规则：只有早期状态、且没有下游记录时才能删；
    // 按钮提前隐藏，别让人点进 409。
    function requirementDeletable(requirement) {
      const early = ['creating', 'create_failed', 'draft', 'pending_review', 'changes_requested'].includes(requirement.status)
      if (!early) return false
      return !(requirement.designerId
        || requirement.testerId
        || (requirement.designVersions ?? []).length > 0
        || (requirement.reviews ?? []).length > 0
        || (requirement.devTasks ?? []).some(task => task.assigneeId))
    }

    function RequirementCard({ requirement, state, onOpen, onOpenSession, onOpenDesign, onDelete }) {
      const owner = state.users.find(user => user.id === requirement.ownerId)
      const designer = requirement.designerId ? state.users.find(user => user.id === requirement.designerId) : null
      const grouped = groupedPlatforms(state.platforms ?? [], state.platformGroups ?? [], requirement.platformIds)
      const allPlatforms = (state.platforms ?? []).filter(item => item.active !== false)
      const included = new Set(requirement.platformIds ?? [])
      const excluded = allPlatforms.filter(item => !included.has(item.id))
      const testRun = (requirement.testRuns ?? [])[(requirement.testRuns ?? []).length - 1]
      const tester = requirement.testerId ? state.users.find(user => user.id === requirement.testerId) : null
      const test = testChipMeta(testRun)
      // 测试和设计一样，有人负责之前先把「待认领」摆出来，别只写一个没信息的「测试」。
      const testChip = !testRun && !tester && (requirement.versions ?? []).length > 0 && !['released', 'done'].includes(requirement.status)
        ? { tone: 'warn', glyph: '◇', label: '测试待认领' }
        : test
      const testChipLabel = testChip.label === '测试待认领' ? '测试待认领' : '测试'
      const published = (requirement.versions ?? []).length > 0
      // 整张需求卡都可以点：标题、平台、底部都会跳到需求全量。
      // 键盘入口保留在标题链接上，卡片本身不再重复一个 tab 停留点。
      return h('article', {
        className: 'req-card',
        onClick: () => onOpen(requirement.id),
      },
        h('div', { className: 'rc-hd' },
          h('span', { className: 'rc-code' }, requirement.code),
          h(StatusChip, { kind: 'req', value: requirement.status }),
          published && requirement.designUpdatedAt ? h(DesignChip, { tone: 'warn', glyph: '◷', className: 'design-updated' }, '设计已更新') : null,
          requirement.ownerId === state.currentUser?.id && typeof onDelete === 'function' && requirementDeletable(requirement)
            ? h('button', {
                className: 'rc-del',
                type: 'button',
                title: '删除需求',
                'aria-label': `删除需求 ${requirement.code}`,
                onClick: event => {
                  event.preventDefault()
                  event.stopPropagation()
                  onDelete(requirement)
                },
              }, h(DesignIcon, { name: 'trash', size: 15 }))
            : null,
        ),
        h('a', { className: 'rc-title', href: '#', onClick: event => { event.preventDefault(); event.stopPropagation(); onOpen(requirement.id) } }, requirement.title),
        h('div', { className: 'row wrap', style: { gap: '4px', margin: '8px 0' } },
          published ? h(StatusChip, { kind: 'design', value: requirement.designStatus }) : null,
          grouped.length === 0
            ? h(DesignChip, { tone: 'idle', glyph: '○' }, '未设置平台')
            : grouped.map(entry => h('span', { className: 'mxg', key: entry.group.id },
                h('span', { className: 'gl2' }, `${entry.group.name} ${entry.items.length}`),
                entry.items.map(item => {
                  const task = (requirement.devTasks ?? []).find(candidate => candidate.platformId === item.id)
                  const meta = devTaskChipMeta(task)
                  return h(DesignChip, {
                    key: item.id,
                    tone: meta.tone,
                    glyph: meta.glyph,
                    title: `${item.name} ${meta.label}`,
                  }, item.shortName ?? item.name)
                }),
              )),
          h(DesignChip, { tone: testChip.tone, glyph: testChip.glyph, title: testChip.label }, testChipLabel),
          requirement.release ? h(DesignChip, { tone: 'done', glyph: '▲' }, requirement.release.version) : null,
          excluded.length > 0
            ? h('span', { className: 'mna2', title: `不涉及：${excluded.map(item => item.name).join('、')}` }, `不涉及 ${excluded.length}`)
            : null,
        ),
        h('div', { className: 'rc-ft' },
          h('span', { className: 'assignee' },
            h(Avatar, { name: owner?.name ?? requirement.ownerId }),
            designer !== null ? h(Avatar, { name: designer.name }) : null,
            tester !== null ? h(Avatar, { name: tester.name }) : null,
          ),
          h('span', { className: 'tiny muted' }, `${owner?.name ?? '—'} ${relativeTime(requirement.updatedAt)}更新`),
        ),
      )
    }

    function recentRequirementActivity(state, requirements) {
      const events = []
      for (const requirement of requirements) {
        const owner = state.users.find(user => user.id === requirement.ownerId)
        const latestDesign = (requirement.designVersions ?? [])[(requirement.designVersions ?? []).length - 1]
        if (latestDesign) {
          events.push({ at: latestDesign.at, who: latestDesign.by, text: `${requirement.code} 交付了设计 d${latestDesign.version}`, sub: latestDesign.summary || '设计交付' })
        }
        const latestVersion = (requirement.versions ?? [])[(requirement.versions ?? []).length - 1]
        if (latestVersion) {
          events.push({ at: latestVersion.at, who: owner?.id ?? requirement.ownerId, text: `${requirement.code} 提交了需求 v${latestVersion.version}`, sub: latestVersion.summary || '需求提交' })
        }
        const latestReview = (requirement.reviews ?? [])[(requirement.reviews ?? []).length - 1]
        if (latestReview) {
          events.push({ at: latestReview.at, who: latestReview.by, text: `${requirement.code} 评审${REVIEW_DECISION_LABELS[latestReview.decision] ?? latestReview.decision}`, sub: latestReview.comment || '评审记录' })
        }
        for (const task of requirement.devTasks ?? []) {
          if (task.finishedAt) events.push({ at: task.finishedAt, who: task.assigneeId, text: `${requirement.code} ${platformName(state.platforms, task.platformId)} 开发完成`, sub: task.mrUrl ? '已提交 MR' : '开发任务' })
        }
        const latestTest = (requirement.testRuns ?? [])[(requirement.testRuns ?? []).length - 1]
        if (latestTest) {
          events.push({ at: latestTest.finishedAt ?? latestTest.startedAt, who: latestTest.by, text: `${requirement.code} 测试${TEST_STATUS_LABELS[latestTest.status] ?? latestTest.status}`, sub: latestTest.note || '测试记录' })
        }
      }
      return events
        .filter(event => typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at)))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 7)
    }

    // 层级导航：迭代列表 › 2026-S13 › S13-001 › 会话 › 画布。
    // 祖先层都能点回，当前层加粗；「迭代列表」永远回到扁平列表。
    function Breadcrumbs({ items }) {
      return h('nav', { className: 'dsh-wb-crumbs', 'aria-label': '层级导航' },
        items.map((item, index) => {
          const last = index === items.length - 1
          const className = `${last || typeof item.onClick !== 'function' ? 'cur' : 'step'}${item.mono ? ' mono' : ''}`
          return h(react.Fragment, { key: item.key ?? `${index}-${item.label}` },
            index > 0 ? h(DesignIcon, { name: 'chev-right', className: 'sep' }) : null,
            last || typeof item.onClick !== 'function'
              ? h('span', { className, 'aria-current': last ? 'page' : undefined }, item.label)
              : h('button', { className, type: 'button', onClick: item.onClick }, item.label),
          )
        }),
      )
    }

    function IterationDetailView({ state, requirements, onCreateRequirement, onOpenSettings, canCreate, canConfig, onOpenRequirement, onOpenSession, onOpenDesign, onReload, onToast }) {
      const [reqFilter, setReqFilter] = useState('all')
      const [deleteTarget, setDeleteTarget] = useState(null)
      const [deleting, setDeleting] = useState(false)
      const iteration = state.iteration
      const owner = state.users.find(user => user.id === iteration.ownerId)
      const inScope = requirements.filter(item => item.inScope !== false)
      const phase = iterationPhaseLabel(iteration, inScope)
      const progress = requirementsProgress(inScope)
      const risk = iterationRisk(requirements)
      const rows = phaseRows(inScope)
      const designReady = requirements.filter(item => ['delivered', 'not_needed'].includes(item.designStatus)).length
      const activity = recentRequirementActivity(state, requirements)
      // 「待评审」只数真的提交了、等评审的需求；草稿和退回重写还没到评审这一步。
      const pendingReview = requirements.filter(item => item.status === 'pending_review')
      const doing = requirements.filter(item => ['in_progress', 'dev_done', 'testing'].includes(item.status))
      const visible = reqFilter === 'review' ? pendingReview : reqFilter === 'active' ? doing : requirements
      const removeRequirement = async () => {
        if (deleteTarget === null || deleting) return
        setDeleting(true)
        try {
          const result = await api(`requirements/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
          const failures = Array.isArray(result?.sessionDeleteFailures) ? result.sessionDeleteFailures.length : 0
          const folderFailures = Array.isArray(result?.folderDeleteFailures) ? result.folderDeleteFailures.length : 0
          const problems = [failures > 0 ? `${failures} 个相关会话` : '', folderFailures > 0 ? `${folderFailures} 个本机目录` : ''].filter(Boolean)
          onToast?.(problems.length > 0
            ? `${deleteTarget.code} 已删除；${problems.join('、')}未能清理`
            : `${deleteTarget.code} 已删除，相关会话和本机文件已清理`, problems.length > 0)
          setDeleteTarget(null)
          onReload?.()
        } catch (reason) {
          onToast?.(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setDeleting(false)
        }
      }
      const windows = {
        '需求与评审': { left: 0, width: 12 },
        '设计': { left: 12, width: 21 },
        '开发': { left: 27, width: 45 },
        '测试': { left: 73, width: 21 },
        '封板': { left: 96, width: 4 },
      }
      const axis = [0, 33, 66, 100].map(fraction => {
        const startTime = Date.parse(iteration.startDate)
        const endTime = Date.parse(iteration.endDate)
        if (Number.isNaN(startTime) || Number.isNaN(endTime)) return '待定'
        return shortDay(new Date(startTime + (endTime - startTime) * (fraction / 100)).toISOString())
      })
      return h('div', { className: 'page' },
        h('div', { className: 'head-card' },
          h('div', { className: 'lft' },
            h('div', { className: 'code-line' },
              h('a', { className: 'code', href: '#', onClick: event => event.preventDefault() }, iteration.code),
              h(DesignChip, { tone: phaseChipTone(phase), glyph: phase === '已封板' ? '✓' : phase === '规划中' ? '○' : '◐' }, phase),
              risk.count > 0 ? h(DesignChip, { tone: 'warn', glyph: '◷' }, risk.text) : null,
            ),
            h('h1', null, iteration.name),
            h('div', { className: 'head-meta' },
              h('span', { className: 'it' }, '负责人 ', h('span', { className: 'assignee' },
                h(Avatar, { name: owner?.name ?? iteration.ownerId }), h('b', null, owner?.name ?? iteration.ownerId))),
              h('span', { className: 'it' }, h(DesignIcon, { name: 'lock', size: 13 }), `范围锁定 · ${inScope.length} 需求`),
              h('span', { className: 'it' }, h(DesignIcon, { name: 'calendar', size: 13 }), `${iteration.startDate || '待定'} → ${iteration.endDate || '待定'}`),
            ),
          ),
          h('div', { className: 'page-actions', style: { marginLeft: 'auto' } },
            canConfig ? h('button', { className: 'btn btn-sm btn-ghost', type: 'button', onClick: onOpenSettings }, '迭代设置') : null,
          ),
        ),
        h('div', { className: 'with-aside' },
          h('div', null,
            h('div', { className: 'tl-wrap' },
              h('div', { className: 'tl-head' },
                h('span'),
                h('div', { className: 'axis' }, axis.map((label, index) => h('span', { key: index }, label))),
                h('span', null, '计划'),
              ),
              h('div', { className: 'timeline' },
                rows.map(row => {
                  const window = windows[row.label] ?? { left: 0, width: 10 }
                  const barClass = row.tone === 'done' ? 'green' : row.tone === 'progress' ? '' : 'idle'
                  return h('div', { className: 'tl-row', key: row.label },
                    h('div', { className: 'tl-name' },
                      h('span', { className: `chip chip--${row.tone === 'done' ? 'done' : row.tone === 'progress' ? 'prog' : 'idle'}`, style: { height: '16px', padding: '0 5px' } },
                        h('span', { className: 'gl' }, row.tone === 'done' ? '✓' : row.tone === 'progress' ? '◐' : '○')),
                      row.label,
                    ),
                    h('div', { className: 'tl-track' },
                      h('span', {
                        className: `tl-bar ${barClass}`,
                        title: row.meta,
                        style: { left: `${window.left}%`, width: `${window.width}%` },
                      }, row.tone === 'progress' && window.width >= 15 ? row.meta : ''),
                    ),
                    h('div', { className: 'tl-date' }, phaseDateText(iteration.startDate, iteration.endDate, window.left, window.width)),
                  )
                }),
              ),
              h('div', { className: 'summary-line' },
                h(DesignChip, { tone: designReady === requirements.length && requirements.length > 0 ? 'done' : 'prog', glyph: designReady === requirements.length ? '✓' : '◐' }, `设计 ${designReady}/${requirements.length} 交付`),
                h(DesignChip, { tone: doing.length > 0 ? 'prog' : 'idle', glyph: doing.length > 0 ? '◐' : '○' }, `开发/测试 ${doing.length}/${requirements.length}`),
                h(DesignChip, { tone: risk.count > 0 ? 'warn' : 'idle', glyph: risk.count > 0 ? '◷' : '○' }, risk.count > 0 ? risk.text : '无风险'),
                h('span', { className: 'badge', style: { marginLeft: 'auto' } },
                  h(DesignIcon, { name: 'branch', size: 11 }), '设计与开发轨道重叠（无固定阶段依赖）'),
              ),
            ),
            h('div', { className: 'section-hd', style: { marginTop: 0 } },
              h('span', { className: 't' }, '需求'),
              h('span', { className: 'n' }, String(requirements.length)),
              h('div', { className: 'r' },
                h('div', { className: 'seg' },
                  [['all', '全部'], ['review', `待评审 ${pendingReview.length}`], ['active', `进行中 ${doing.length}`]].map(([key, label]) =>
                    h('button', { key, type: 'button', className: reqFilter === key ? 'active' : '', onClick: () => setReqFilter(key) }, label)),
                ),
                canCreate ? h('button', { className: 'btn btn-sm btn-primary', type: 'button', onClick: onCreateRequirement },
                  h(DesignIcon, { name: 'plus' }), '新建需求') : null,
              ),
            ),
            h('p', { className: 'tiny muted', style: { margin: '-4px 0 14px' } },
              '每张需求卡只看', h('b', null, '设计状态'), '和涉及平台的进展；能认领的位置直接点「认领」，写文档、提交、变更在',
              h('b', null, '会话'), '里由 skill 完成。点标题进入「需求全量」。'),
            visible.length === 0
              ? h('div', { className: 'empty-page' },
                  h(DesignIcon, { name: 'iter', size: 28 }),
                  h('b', null, requirements.length === 0 ? '迭代还没有需求' : '当前筛选下没有需求'),
                  h('span', null, requirements.length === 0 ? (canCreate ? '点「新建需求」，只填名称，其他交给会话里的 skill。' : '等产品创建需求后再来。') : '换一个筛选条件看看。'),
                )
              : h('div', { className: 'mindmap' },
                  visible.map(requirement => h('div', { className: 'branch', key: requirement.id },
                    h(RequirementCard, {
                      requirement,
                      state,
                      onOpen: onOpenRequirement,
                      onOpenSession,
                      onOpenDesign,
                      onDelete: target => setDeleteTarget(target),
                    }),
                  )),
                ),
          ),
          h('aside', { className: 'aside-col' },
            h('div', { className: 'card' },
              h('div', { className: 'card-hd' },
                h('span', { className: 't' }, '活动日志'),
                h('span', { className: 'r' }, h('span', { className: 'tiny muted' }, `${activity.length} 条`)),
              ),
              h('div', { className: 'card-bd', style: { padding: '6px 0' } },
                activity.length === 0
                  ? h('div', { className: 'tiny muted', style: { padding: '12px 14px' } }, '还没有活动记录。')
                  : activity.slice(0, 5).map((event, index) => {
                      const user = state.users.find(item => item.id === event.who)
                      return h('div', { className: 'log-item', key: `${event.at}-${index}` },
                        h(Avatar, { name: user?.name ?? event.who }),
                        h('div', { className: 'c' },
                          h('div', { className: 'l1' }, h('b', null, user?.name ?? event.who), ' ', event.text),
                          h('div', { className: 'l2' }, `${relativeTime(event.at)} · ${event.sub}`),
                        ),
                      )
                    }),
              ),
            ),
            h('div', { className: 'card', style: { padding: '13px 14px' } },
              h('div', { className: 'tiny muted', style: { marginBottom: '8px' } }, '整体进度'),
              h('div', { className: 'row gap-3' },
                h('div', { className: `progress${progress >= 100 ? ' green' : ''}`, style: { flex: 1 } }, h('span', { style: { width: `${Math.min(100, progress)}%` } })),
                h('span', { className: 'tiny mono muted' }, `${progress}%`),
              ),
            ),
          ),
        ),
        deleteTarget !== null
          ? h(ConfirmDialog, {
              title: '删除需求',
              confirmLabel: '删除需求',
              busy: deleting,
              onConfirm: () => { void removeRequirement() },
              onClose: () => { if (!deleting) setDeleteTarget(null) },
            }, `删除 ${deleteTarget.code}「${deleteTarget.title}」？删除后不能恢复，相关会话和本机需求目录（原型、设计稿）也会一起删除。`)
          : null,
      )
    }

    // 需求页的小缩略图：用真实页面 iframe 按卡片宽度等比缩小，不再画线框占位。
    function DesignThumbFrame({ src, title }) {
      const box = useRef(null)
      const [scale, setScale] = useState(0.075)
      const [loaded, setLoaded] = useState(false)
      useEffect(() => {
        const node = box.current
        if (node === null) return undefined
        const update = () => {
          const width = node.clientWidth
          if (width > 0) setScale(width / 1440)
        }
        update()
        if (typeof ResizeObserver === 'undefined') {
          window.addEventListener('resize', update)
          return () => window.removeEventListener('resize', update)
        }
        const observer = new ResizeObserver(update)
        observer.observe(node)
        return () => observer.disconnect()
      }, [])
      if (src === '') {
        return h('div', { className: 'wf' }, h('i'), h('i'), h('i'))
      }
      return h('div', { className: 'dsh-wb-shot-frame', ref: box },
        loaded ? null : h('div', { className: 'dsh-wb-thumb-skel', 'aria-hidden': 'true' }),
        h('iframe', {
          src,
          title,
          loading: 'lazy',
          onLoad: () => setLoaded(true),
          sandbox: 'allow-scripts allow-forms allow-modals',
          referrerPolicy: 'no-referrer',
          style: { width: '1440px', height: '1000px', transform: `scale(${scale})` },
        }),
      )
    }

    // 缩略图放大查看：只在打开时挂载，才能只在弹层存在期间锁滚动/接管焦点。
    function ShotPreviewDialog({ shot, onClose }) {
      const modal = useModalBehavior(onClose)
      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-shot-dialog', ...modal.dialogProps },
          h('div', { className: 'dsh-wb-shot-dialog-head' },
            h('b', { id: modal.titleId }, shot.name),
            shot.note !== '' ? h('span', { className: 'tiny muted', title: shot.note, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, shot.note) : null,
            h('button', { className: 'btn btn-sm btn-ghost', type: 'button', style: { marginLeft: 'auto' }, onClick: onClose }, '关闭'),
          ),
          h('div', { className: 'dsh-wb-shot-dialog-body' },
            shot.kind === 'image'
              ? h('img', { src: shot.src, alt: shot.name })
              : h('iframe', {
                  src: shot.src,
                  title: shot.name,
                  sandbox: 'allow-scripts allow-forms allow-modals',
                  referrerPolicy: 'no-referrer',
                }),
          ),
        ),
      )
    }

    function RequirementPageView({ ctx, state, requirement, onOpenPrototype, onOpenDesignCanvas, onJoinRequirement, onResetDesign, prototypeVersionFocus = null, onPrototypeVersionFocusDone = null }) {
      usePreviewTickets([requirement.id])
      // 需求页的缩略图直接在弹层里放大看，不再依赖会话右栏。
      const [shotPreview, setShotPreview] = useState(null)
      // 「认领」：卡片还是待认领、本人又能接这个位置时，状态徽标换成认领按钮。
      const [claimTarget, setClaimTarget] = useState(null)
      const [claimBusy, setClaimBusy] = useState(false)
      const [claimError, setClaimError] = useState('')
      const [resetDesignOpen, setResetDesignOpen] = useState(false)
      const [resetDesignBusy, setResetDesignBusy] = useState(false)
      const [resetDesignError, setResetDesignError] = useState('')
      const iteration = (state.iterations ?? []).find(item => item.id === requirement.iterationId)
      const artifacts = Array.isArray(requirement.artifacts) ? requirement.artifacts : []
      const designArtifacts = artifacts.filter(artifact => artifact.kind === 'design')
      // 设计卡先看设计师本机 design/（写到磁盘就更新），服务端交付附件只作兜底。
      const designDelivered = requirement.designStatus === 'delivered'
        || (requirement.designVersions ?? []).length > 0
      // 原型和设计稿是两条独立轨道：prototype/ 是产品原型，design/ 与
      // 服务端设计附件才是设计交付。需求全量页的「原型」卡必须读产品原型，
      // 不能拿设计稿数量冒充，否则生成原型后始终显示 0 屏。
      const prototypeFiles = Array.isArray(requirement.prototypeFiles) ? requirement.prototypeFiles : []
      // 设计师本机的 design/ 稿子：写到磁盘就能上卡片，不用等交付上传。
      const designFiles = Array.isArray(requirement.designFiles) ? requirement.designFiles : []
      const prototypeArtifacts = artifacts.filter(artifact =>
        artifact.kind === 'prototype'
        && typeof artifact.name === 'string'
        && /\.html?$/i.test(artifact.name))
      // 提交需求时固化的原型版本；平时改原型只会更新「最新」，不会新增版本。
      const prototypeVersions = (Array.isArray(requirement.prototypeVersions) ? requirement.prototypeVersions : [])
        .slice()
        .sort((a, b) => Number(a.version) - Number(b.version))
      const [prototypeVersion, setPrototypeVersion] = useState(null)
      const [designVersion, setDesignVersion] = useState(null)
      // 两张卡的版本行各自展开/收起，互不影响。
      const [prototypeVersionsOpen, setPrototypeVersionsOpen] = useState(false)
      const [designVersionsOpen, setDesignVersionsOpen] = useState(false)
      useEffect(() => {
        setPrototypeVersion(null)
        setDesignVersion(null)
        setPrototypeVersionsOpen(false)
        setDesignVersionsOpen(false)
      }, [requirement.id])
      // 画布版本面板里点了「提交定格」的版本：回到需求页时把原型卡直接切到那一版。
      useEffect(() => {
        if (prototypeVersionFocus === null) return
        setPrototypeVersion(prototypeVersionFocus.version)
        if (typeof onPrototypeVersionFocusDone === 'function') onPrototypeVersionFocusDone()
      }, [prototypeVersionFocus])
      const owner = state.users.find(user => user.id === requirement.ownerId)
      const designer = requirement.designerId ? state.users.find(user => user.id === requirement.designerId) : null
      const tester = requirement.testerId ? state.users.find(user => user.id === requirement.testerId) : null
      const versions = requirement.versions ?? []
      const designVersions = requirement.designVersions ?? []
      const devTasks = requirement.devTasks ?? []
      const estimateTotal = devTasks.reduce((sum, task) => sum + (typeof task.estimateDays === 'number' ? task.estimateDays : 0), 0)
      const testRuns = requirement.testRuns ?? []
      const latestTest = testRuns[testRuns.length - 1] ?? null
      const testReportArtifacts = artifacts.filter(artifact => artifact.kind === 'test-report')
      const grouped = groupedPlatforms(state.platforms ?? [], state.platformGroups ?? [], requirement.platformIds)
      // 涉及端不再按组展示：所有端拉平成一个网格，卡片大小一致。
      const endPlatforms = grouped.flatMap(entry => entry.items)
      const document = requirement.document ?? null
      const latestVersion = versions[versions.length - 1] ?? null
      const docSummary = String(document?.summary ?? '').trim() || String(latestVersion?.summary ?? '').trim()
      const docBody = String(document?.body ?? '').trim()
      // 需求正文常常一大段：超过预览高度就默认收起，先让第一屏看到总述，
      // 需要细读时点标题行的「展开全文」。用实际高度判断，短文档不显示按钮。
      const DOC_PREVIEW_HEIGHT = 220
      const docBodyRef = useRef(null)
      const [docExpanded, setDocExpanded] = useState(false)
      const [docOverflowing, setDocOverflowing] = useState(false)
      useLayoutEffect(() => {
        const node = docBodyRef.current
        if (node === null) return undefined
        const measure = () => setDocOverflowing(node.scrollHeight > DOC_PREVIEW_HEIGHT + 24)
        measure()
        if (typeof ResizeObserver !== 'function') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
      }, [docSummary, docBody, document?.acceptanceCriteria, requirement.id])
      useEffect(() => { setDocExpanded(false) }, [requirement.id])
      const shortName = name => String(name ?? '').split(/[\\/]/).pop()
      // 需求文档里的「## 原型页面 / ## 设计页面」清单：每屏一行，形如
      // `1. 01-xxx.html — 页面名：说明`。把它贴到对应缩略图下面，开发看图时
      // 立刻知道这一屏覆盖什么需求，而不是只看到文件名。
      const pageNotes = section => {
        const notes = new Map()
        let active = false
        for (const raw of docBody.split('\n')) {
          const line = raw.trim()
          if (/^#{1,6}\s/.test(line)) { active = line.replace(/^#{1,6}\s*/, '').includes(section); continue }
          if (!active) continue
          const match = line.match(/^\d+[.、]\s*([^\s—–:：]+)\s*[—–:：]\s*(.+)$/)
          if (match) notes.set(shortName(match[1]), match[2].trim())
        }
        return notes
      }
      const prototypeNotes = pageNotes('原型页面')
      const designNotes = pageNotes('设计页面')
      const previewableDesign = designArtifacts.filter(artifact =>
        typeof artifact.name === 'string'
        && (/\.html?$/i.test(artifact.name) || /^image\//i.test(String(artifact.contentType || ''))))
      // 版本归属以交付记录里的附件 id 为准：上传时的 designVersion 标记只是
      // 历史兼容，旧数据里它可能是上一版（上传发生在落版本之前）。
      const latestDesignRecord = designVersions.reduce((a, b) => (Number(b.version) || 0) > (Number(a?.version) || 0) ? b : a, null)
      const latestDesignIds = new Set(Array.isArray(latestDesignRecord?.artifactIds) ? latestDesignRecord.artifactIds : [])
      const currentDesignArtifacts = previewableDesign.filter(artifact => latestDesignIds.has(artifact.id))
      const designPreviewArtifacts = (currentDesignArtifacts.length > 0 ? currentDesignArtifacts : previewableDesign).slice(0, 3)
      const readyPreviewUrl = params => {
        const entry = previewTickets.get(requirement.id)
        if (entry === undefined || entry.expiresAt <= Date.now()) return ''
        return designPreviewUrl(requirement.id, params)
      }
      const designPreviewUrlFor = artifact => readyPreviewUrl({ artifactId: artifact.id, name: artifact.name })
      const firstDesignPreviewUrl = designPreviewArtifacts.length > 0 ? designPreviewUrlFor(designPreviewArtifacts[0]) : ''
      // 设计版本每次交付定格一份，附件在交付时归入 dN；打开历史版本只看附件，不碰本机 design/。
      const designVersionList = designVersions.map(version => {
        const ids = new Set(Array.isArray(version.artifactIds) ? version.artifactIds : [])
        return {
          version: version.version,
          label: `d${version.version}`,
          at: version.at,
          items: previewableDesign
            .filter(artifact => ids.has(artifact.id))
            .map(artifact => ({
              key: `d${version.version}-${artifact.id}`,
              name: shortName(artifact.name),
              path: '',
              src: designPreviewUrlFor(artifact),
              kind: /^image\//i.test(String(artifact.contentType || '')) ? 'image' : 'html',
              slot: 'design',
              version: version.version,
            })),
        }
      })
      // 原型和设计稿一样以服务端附件为主：产品本机生成后自动同步，其他角色
      // 不用拿着产品的目录也能看到同一份原型。本机文件只作为旧数据兜底。
      const latestPrototypeArtifacts = new Map()
      for (const artifact of prototypeArtifacts) latestPrototypeArtifacts.set(shortName(artifact.name), artifact)
      // 打开原型画布要本机绝对路径：服务端附件只有 prototype/xxx.html，按需求文件夹拼回去。
      const localPathOf = relative => {
        if (typeof relative !== 'string' || relative === '') return ''
        if (relative.startsWith('/')) return relative
        const folder = String(requirement.folderPath ?? '').replace(/\/+$/, '')
        return folder === '' ? '' : `${folder}/${relative.replace(/^\/+/, '')}`
      }
      const prototypeItems = latestPrototypeArtifacts.size > 0
        ? [...latestPrototypeArtifacts.values()].map(artifact => ({
            key: artifact.id,
            name: shortName(artifact.name),
            path: localPathOf(artifact.name),
            src: readyPreviewUrl({ artifactId: artifact.id, name: artifact.name }),
            kind: 'html',
            slot: 'prototype',
            version: null,
            updatedAt: artifact.createdAt,
            note: prototypeNotes.get(shortName(artifact.name)) ?? '',
          }))
        : prototypeFiles.map(file => ({
            key: file.relativePath ?? file.name,
            name: shortName(file.name ?? file.relativePath ?? '原型'),
            path: file.path ?? localPathOf(file.relativePath ?? ''),
            src: file.relativePath ? readyPreviewUrl({ path: file.relativePath }) : '',
            kind: 'html',
            local: true,
            updatedAt: file.updatedAt,
            note: prototypeNotes.get(shortName(file.name ?? file.relativePath)) ?? '',
          }))
      // 提交时固化的原型版本：每版引用提交那一刻的附件，历史版本只读。
      const prototypeVersionList = prototypeVersions.map(version => ({
        version: version.version,
        label: `v${version.version}`,
        at: version.createdAt,
        items: (Array.isArray(version.files) ? version.files : [])
          .map(file => prototypeArtifacts.find(artifact => artifact.id === file.artifactId))
          .filter(Boolean)
          .map(artifact => ({
            key: `v${version.version}-${artifact.id}`,
            name: shortName(artifact.name),
            path: '',
            src: readyPreviewUrl({ artifactId: artifact.id, name: artifact.name }),
            kind: 'html',
            slot: 'prototype',
            version: version.version,
          })),
      }))
      // 本机正在做的设计稿优先，交付附件只作兜底（其他角色和旧数据没有本机目录）。
      const designItems = designFiles.length > 0
        ? designFiles.map(file => ({
            key: file.relativePath ?? file.path ?? file.name,
            name: shortName(file.name ?? file.relativePath ?? '设计稿'),
            path: file.path ?? localPathOf(file.relativePath ?? ''),
            src: file.relativePath ? readyPreviewUrl({ path: file.relativePath }) : '',
            kind: 'html',
            local: true,
            note: designNotes.get(shortName(file.name ?? file.relativePath)) ?? '',
          }))
        : designPreviewArtifacts.map(artifact => ({
            key: artifact.id,
            name: shortName(artifact.name),
            path: localPathOf(artifact.name),
            src: designPreviewUrlFor(artifact),
            kind: /^image\//i.test(String(artifact.contentType || '')) ? 'image' : 'html',
            slot: 'design',
            version: null,
            note: designNotes.get(shortName(artifact.name)) ?? '',
          }))
      const selectedDesignVersion = designVersion === null
        ? null
        : designVersionList.find(item => item.version === designVersion) ?? null
      // 选历史设计版本时只读：缩略图换成那一版的交付附件，本机 design/ 不动。
      const displayedDesignItems = (selectedDesignVersion === null ? designItems : selectedDesignVersion.items).slice(0, 3)
      const selectedPrototypeVersion = prototypeVersion === null
        ? null
        : prototypeVersions.find(item => item.version === prototypeVersion) ?? null
      // 选历史版本时只读：附件还是提交那一刻的那几份，点击只在弹层里放大。
      const versionedPrototypeItems = selectedPrototypeVersion === null
        ? null
        : (Array.isArray(selectedPrototypeVersion.files) ? selectedPrototypeVersion.files : [])
            .map(file => prototypeArtifacts.find(artifact => artifact.id === file.artifactId))
            .filter(Boolean)
            .map(artifact => ({
              key: `v-${artifact.id}`,
              name: shortName(artifact.name),
              path: '',
              src: readyPreviewUrl({ artifactId: artifact.id, name: artifact.name }),
              kind: 'html',
              updatedAt: selectedPrototypeVersion.createdAt,
              note: prototypeNotes.get(shortName(artifact.name)) ?? '',
            }))
      const displayedPrototypeItems = versionedPrototypeItems ?? prototypeItems
      const prototypeScreens = displayedPrototypeItems.length
      // 页面跑在 dsh-app://app 里，链接用本机 DSH 的 http origin，右键复制仍有意义。
      const hostOrigin = (() => {
        try {
          const base = window.__DSH_TRANSPORT__?.streamBaseUrl
          return base ? new URL(base).origin : window.location.origin
        } catch (_) { return window.location.origin }
      })()
      const browserHref = src => {
        try { return new URL(src, hostOrigin).toString() } catch (_) { return src }
      }
      // 缩略图点开后在弹层里看整页：不再依赖会话右栏。
      const shotTile = ({ key, name, src, kind, note = '', onActivate = undefined }) => {
        const open = (event) => {
          if (event !== undefined) event.preventDefault()
          if (src === '') return
          setShotPreview({ key, name, src, kind, note })
        }
        const activate = typeof onActivate === 'function'
          ? (event) => { if (event !== undefined) event.preventDefault(); onActivate() }
          : open
        const inCanvas = typeof onActivate === 'function'
        const openTitle = inCanvas ? `打开画布 · ${name}` : `放大查看 ${name}`
        return h('div', { className: 'shot', key },
        h('div', { className: 'img is-live' },
          src === ''
            ? h('div', { className: 'wf' }, h('i'), h('i'), h('i'))
            : kind === 'image'
              ? h('img', { src, alt: name, loading: 'lazy' })
              : h(DesignThumbFrame, { src, title: name }),
          src !== ''
            ? h('a', {
                className: 'shot-open',
                href: inCanvas ? '#' : browserHref(src),
                target: inCanvas ? undefined : '_blank',
                rel: 'noopener noreferrer',
                title: openTitle,
                'aria-label': openTitle,
                onClick: activate,
                onAuxClick: activate,
              })
            : null,
        ),
        h('div', { className: 'cap' },
          h('span', { className: 'shot-name', title: name }, name),
          src !== ''
            ? h('a', {
                className: 'shot-link',
                href: inCanvas ? '#' : browserHref(src),
                target: inCanvas ? undefined : '_blank',
                rel: 'noopener noreferrer',
                onClick: activate,
                onAuxClick: activate,
              }, '打开')
            : null,
        ),
        note !== '' ? h('div', { className: 'shot-note', title: note }, note) : null,
      ) }
      const logs = []
      for (const version of versions) logs.push({ at: version.at, who: requirement.ownerId, text: `提交需求总述 v${version.version}`, sub: version.summary || '需求提交' })
      for (const version of designVersions) logs.push({ at: version.at, who: version.by ?? requirement.designerId, text: `交付设计 d${version.version}`, sub: version.summary || '设计交付' })
      for (const review of requirement.reviews ?? []) logs.push({ at: review.at, who: review.by, text: `${REVIEW_DECISION_LABELS[review.decision] ?? review.decision}需求 v${review.version ?? versions.length}`, sub: review.comment || '评审记录' })
      for (const task of devTasks) {
        if (task.startedAt) logs.push({ at: task.startedAt, who: task.assigneeId, text: `${platformName(state.platforms, task.platformId)} 开始开发`, sub: DEV_STATUS_LABELS[task.status] ?? task.status })
        if (task.finishedAt) logs.push({ at: task.finishedAt, who: task.assigneeId, text: `${platformName(state.platforms, task.platformId)} 开发完成`, sub: task.mrUrl ? '已提交 MR' : '开发任务' })
      }
      for (const run of testRuns) logs.push({ at: run.finishedAt ?? run.startedAt, who: run.by, text: `测试${TEST_STATUS_LABELS[run.status] ?? run.status}`, sub: run.note || '测试记录' })
      if (requirement.release?.at) logs.push({ at: requirement.release.at, who: requirement.release.by ?? requirement.ownerId, text: `发布 ${requirement.release.version}`, sub: '已发布' })
      const sortedLogs = logs
        .filter(event => typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at)))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 6)
      // 参与者卡片：一人一张卡（开发按端一张），卡里装这个人的会话状态和工作面入口。
      // 会话记录可能属于别人（sessionId 为空，代表本机打不开他的会话）；
      // 卡片仍要把这条记录显示出来，只有「进入会话」需要有可用的 sessionId。
      const sessionFor = (types, personId) => (requirement.sessions ?? [])
        .filter(session => session.archived !== true
          && types.includes(session.type)
          && (personId === undefined || session.createdBy === personId))
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0] ?? null
      const designSession = sessionFor(['design'])
      // 测试还没有轮次时，先把进入过测试会话的人显示出来；否则测试卡永远只有「未开始」。
      const testSession = sessionFor(['test'])
      // 草稿还没有发布：只展示总述、产品卡片和需求日志；
      // 发布（提交出 v1）之后，才按涉及的端和人出现设计、开发、测试卡片。
      const published = (requirement.versions ?? []).length > 0
      const rolePerson = (person, fallback = '待认领') => person
        ? h('span', { className: 'assignee' }, h(Avatar, { name: person.name }), person.name)
        : h('span', { className: 'muted' }, fallback)
      // 工作面入口收成卡片右上角的一个图标，会话统一在右侧会话坞里，不再单独放按钮。
      const cornerAction = (label, onClick, disabled = false) => h('button', {
        className: 'pcorner',
        type: 'button',
        title: label,
        'aria-label': label,
        disabled,
        onClick,
      }, h(DesignIcon, { name: 'panel', size: 14 }))
      // 版本行和缩略图的「打开」都进画布：本机有文件直接开；只有服务端附件的
      // （历史版本、别人的设计稿）先把那一版落成本机快照，再让画布按目录打开。
      const openCanvasItem = (item, canvasOpener) => {
        if (typeof canvasOpener !== 'function') return
        if (item.local === true && item.path !== '') return canvasOpener({ path: item.path, name: item.name })
        void api('versions/materialize', {
          method: 'POST',
          // 带上本机推导出的路径：本机有这个文件就用本机的（可继续编辑），没有才落快照。
          body: JSON.stringify({ requirementId: requirement.id, kind: item.slot, version: item.version ?? null, localPath: item.path }),
        }).then(body => {
          if (typeof body?.path !== 'string' || body.path === '') return
          canvasOpener({ path: body.path, name: typeof body.name === 'string' && body.name !== '' ? body.name : item.name })
        }).catch(reason => console.warn('[dsh-workbench] 版本快照生成失败', reason))
      }
      // 卡片底部的版本行：原型按提交定格、设计按交付定格，都能展开看版本号和定格时间。
      // 点一行切缩略图（历史版本只读），「打开」直接看那一版的第一屏。
      const versionRow = ({ id, label, versions, selected, onSelect, latestItems, canvasOpener, expanded, onToggle }) => {
        const current = selected === null ? null : versions.find(item => item.version === selected) ?? null
        const openable = items => items.find(item =>
          item.local === true ? item.path !== '' : typeof item.slot === 'string') ?? null
        const row = ({ key, tag, meta, item, onPick, onOpen, active, title }) => h('div', {
          className: `vf-row${active ? ' is-on' : ''}`,
          key,
        },
          h('button', { className: 'vf-pick', type: 'button', onClick: onPick, title },
            h('span', { className: 'vf-tag' }, tag),
            h('span', { className: 'vf-meta' }, meta),
          ),
          item !== null
            ? h('button', {
                className: 'vf-open',
                type: 'button',
                title: `在画布中打开 ${item.name}`,
                onClick: onOpen,
              }, h(DesignIcon, { name: 'external', size: 11 }), '打开')
            : null,
        )
        return h('div', { className: `vf${expanded ? ' is-open' : ''}`, key: id },
          h('button', {
            className: 'vf-head',
            type: 'button',
            'aria-expanded': expanded ? 'true' : 'false',
            onClick: onToggle,
          },
            h(DesignIcon, { name: 'history', size: 12 }),
            h('span', { className: 'vf-name' }, label),
            h('span', { className: 'vf-count' }, `${versions.length} 个版本`),
            current !== null ? h('span', { className: 'vf-on' }, `${current.label} · 只读`) : null,
            h(DesignIcon, { name: 'chev-down', size: 12, className: 'vf-chev' }),
          ),
          // 收起时用 0fr 网格行高留一口气，展开才有高度动画；内容始终挂着，避免闪。
          h('div', { className: 'vf-wrap', inert: expanded ? undefined : 'true' },
            h('div', { className: 'vf-clip' },
              h('div', { className: 'vf-list' },
                row({
                  key: 'latest',
                  tag: '最新',
                  meta: latestItems.length > 0 ? `${latestItems.length} 屏` : '还没有文件',
                  item: openable(latestItems),
                  onPick: () => onSelect(null),
                  onOpen: () => openCanvasItem(openable(latestItems), canvasOpener),
                  active: selected === null,
                  title: '切到最新',
                }),
                [...versions].reverse().map(version => {
                  const target = openable(version.items)
                  return row({
                    key: version.version,
                    tag: version.label,
                    meta: `${version.items.length} 屏 · ${relativeTime(version.at)}`,
                    item: target,
                    onPick: () => onSelect(version.version),
                    onOpen: () => openCanvasItem(target, canvasOpener),
                    active: selected === version.version,
                    title: `${version.label} · ${version.at}`,
                  })
                }),
              ),
            ),
          ),
        )
      }
      // 卡片底部操作条：文字动作放这里，比塞进右上角图标更好认，也方便以后加别的操作。
      const roleCard = ({ key, icon, role, person, fallback = '待认领', chip = null, corner = null, body, actions = null, versions = null }) => h('div', { className: 'pcard', key },
        h('div', { className: 'phead' },
          h('span', { className: 'prole' }, h(DesignIcon, { name: icon, size: 13 }), role),
          rolePerson(person, fallback),
          chip !== null ? h('span', { className: 'pchip' }, chip) : null,
          corner,
        ),
        h('div', { className: 'pbody' }, body),
        Array.isArray(actions) && actions.length > 0 ? h('div', { className: 'pfoot' }, actions) : null,
        versions !== null ? h('div', { className: 'pfoot is-vers' }, versions) : null,
      )
      // GitLab 没配置时，服务端写出的是演示 MR/流水线地址，点开是 example.com：
      // 只标注成演示数据，不给假链接。
      const gitlabLive = state.gitlabConfigured === true
      const devCard = (platform) => {
        const task = devTasks.find(candidate => candidate.platformId === platform.id)
        const meta = devTaskChipMeta(task)
        const estimateDays = typeof task?.estimateDays === 'number' ? task.estimateDays : null
        const startedTime = Date.parse(task?.startedAt ?? '')
        const usedDays = Number.isFinite(startedTime)
          ? Math.max(0, ((task.finishedAt ? Date.parse(task.finishedAt) : Date.now()) - startedTime) / 86400000)
          : null
        const assignee = task?.assigneeId ? state.users.find(user => user.id === task.assigneeId) : null
        const mrUrl = safeHttpUrl(task?.mrUrl)
        const pipelineUrl = safeHttpUrl(task?.pipelineUrl)
        const mrHref = gitlabLive ? mrUrl : ''
        const pipelineHref = gitlabLive ? pipelineUrl : ''
        // 卡片上直接写清卡在哪：流水线失败、设计没交付、需求没批、没人认领。
        const blockers = []
        if (task?.pipelineStatus === 'failed') blockers.push(h(DesignChip, { key: 'pipeline', tone: 'block', glyph: '!' }, '流水线失败'))
        if (!['delivered', 'not_needed'].includes(requirement.designStatus)) blockers.push(h(DesignChip, { key: 'design', tone: 'warn' }, '设计未交付'))
        if (!['approved', 'scheduled', 'in_progress', 'dev_done', 'testing', 'test_failed', 'test_passed'].includes(requirement.status)) {
          blockers.push(h(DesignChip, { key: 'review', tone: 'idle' }, '需求未通过评审'))
        }
        if (task === undefined || !task.assigneeId) blockers.push(h(DesignChip, { key: 'claim', tone: 'idle' }, '待认领'))
        if (task?.status === 'done' && !task.mrUrl) blockers.push(h(DesignChip, { key: 'mr', tone: 'warn' }, '未提交 MR'))
        const timing = task?.startedAt || task?.finishedAt
          ? `${relativeTime(task.startedAt ?? task.finishedAt)}`
          : iteration?.startDate && iteration?.endDate
            ? `计划 ${shortDay(iteration.startDate)} → ${shortDay(iteration.endDate)}`
            : '未排期'
        return roleCard({
          key: `dev-${platform.id}`,
          icon: 'branch',
          role: `开发 · ${platform.name}`,
          person: assignee,
          fallback: '待认领',
          chip: claimablePlatform(platform)
            ? h('button', {
                className: 'pclaim',
                type: 'button',
                onClick: () => openClaimDialog({ kind: 'dev', platformId: platform.id, label: `开发 · ${platform.name}` }),
              }, '认领')
            : h(DesignChip, { tone: meta.tone, glyph: meta.glyph }, meta.label),
          body: h('dl', { className: 'kv2' },
            h('dt', null, '时间'),
            h('dd', null, timing),
            estimateDays === null ? null : h('dt', null, '估时'),
            estimateDays === null ? null : h('dd', null,
              `估 ${dayCount(estimateDays)} 人天`
              + (usedDays === null ? '' : ` · 已用 ${dayCount(Math.max(usedDays, 0.1))} 天`),
            ),
            h('dt', null, '关键产物'),
            h('dd', null,
              mrHref !== ''
                ? h('a', {
                    className: 'dsh-wb-mrlink',
                    href: mrHref,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: '打开 GitLab MR',
                  }, h(DesignIcon, { name: 'branch', size: 12 }), 'MR !' + (mrHref.match(/merge_requests\/(\d+)/)?.[1] ?? ''))
                : mrUrl !== ''
                  ? h('span', { className: 'dsh-wb-mrlink', title: 'GitLab 未配置，这是演示数据' }, h(DesignIcon, { name: 'branch', size: 12 }), 'MR（演示）')
                  : task?.status === 'done' ? '开发完成（未提交 MR）' : '等待开发产物',
              pipelineHref !== ''
                ? h('a', {
                    className: 'dsh-wb-mrlink',
                    href: pipelineHref,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: 'GitLab 流水线',
                  }, h(DesignIcon, { name: 'check-circle', size: 12 }), '流水线')
                : pipelineUrl !== ''
                  ? h('span', { className: 'dsh-wb-mrlink', title: 'GitLab 未配置，这是演示数据' }, h(DesignIcon, { name: 'check-circle', size: 12 }), '流水线（演示）')
                  : null,
              task?.branch ? h('span', { className: 'dsh-wb-branch', title: '开发分支' }, task.branch) : null,
            ),
            h('dt', null, '依赖/阻塞'),
            h('dd', null, blockers.length > 0 ? blockers : '无'),
          ),
        })
      }
      // 认领入口长在卡片上：卡片还是「待认领」、本人又能接这个位置时，
      // 右上角的状态徽标换成「认领」按钮；确认后卡片写成本人并打开会话。
      const me = state.currentUser
      const myRoles = me.roles ?? []
      const myActiveRole = me.activeRole || myRoles[0] || ''
      const myPlatformIds = [...(me.platforms ?? []), ...(me.activePlatformIds ?? [])]
      const claimStatusOpen = !['creating', 'create_failed', 'frozen', 'released', 'done'].includes(requirement.status)
      const claimDevStatus = ['approved', 'scheduled', 'in_progress', 'dev_done', 'test_failed', 'test_passed'].includes(requirement.status)
      const claimablePlatform = platform => {
        if (!published || !claimDevStatus || typeof onJoinRequirement !== 'function') return false
        if (myActiveRole !== 'dev' || !myRoles.includes('dev')) return false
        if ((me.platforms ?? []).length > 0 && !myPlatformIds.includes(platform.id)) return false
        const task = devTasks.find(candidate => candidate.platformId === platform.id)
        return task === undefined || (!task.assigneeId && task.status !== 'done')
      }
      const claimableDesign = published && claimStatusOpen
        && typeof onJoinRequirement === 'function'
        && myActiveRole === 'design' && myRoles.includes('design')
        && !requirement.designerId
        && !['not_needed', 'delivered'].includes(requirement.designStatus)
      // 测试负责人：开发做完到测试收尾之间可以认领；提交时也可以直接指定。
      const claimTestStatus = ['dev_done', 'testing', 'test_failed', 'test_passed'].includes(requirement.status)
      const claimableTest = published && claimTestStatus
        && typeof onJoinRequirement === 'function'
        && myActiveRole === 'qa' && myRoles.includes('qa')
        && !requirement.testerId
      const openClaimDialog = target => {
        setClaimTarget(target)
        setClaimError('')
      }
      const confirmClaim = () => {
        if (claimBusy || claimTarget === null) return
        setClaimBusy(true)
        setClaimError('')
        Promise.resolve(onJoinRequirement(requirement, {
          kind: claimTarget.kind,
          platformId: claimTarget.kind === 'dev' ? claimTarget.platformId : undefined,
        }))
          .then(() => setClaimTarget(null))
          .catch(reason => setClaimError(reason instanceof Error ? reason.message : String(reason)))
          .finally(() => setClaimBusy(false))
      }
      // 删除设计只处理还没交付的稿子；已交付的版本留给返工流程，避免抽走开发依据。
      const canResetDesign = published
        && (requirement.designStatus === 'unclaimed' || requirement.designStatus === 'designing')
        && designVersions.length === 0
        && (requirement.designerId === state.currentUser.id
          || (state.currentUser.roles ?? []).some(role => role === 'lead' || role === 'admin'))
        && (requirement.designerId != null || designItems.length > 0)
        && typeof onResetDesign === 'function'
      const confirmResetDesign = () => {
        if (resetDesignBusy || !canResetDesign) return
        setResetDesignBusy(true)
        setResetDesignError('')
        Promise.resolve(onResetDesign(requirement))
          .then(() => setResetDesignOpen(false))
          .catch(reason => setResetDesignError(reason instanceof Error ? reason.message : String(reason)))
          .finally(() => setResetDesignBusy(false))
      }
      return h('div', { className: 'page' },
        h('div', { className: 'rf-head' },
          h('div', { className: 'lft' },
            h('div', { className: 'l1' },
              h('span', { className: 'code' }, requirement.code),
              h(StatusChip, { kind: 'req', value: requirement.status }),
              published && requirement.designUpdatedAt ? h(DesignChip, { tone: 'warn', glyph: '◷' }, '设计已更新') : null,
            ),
            h('h1', null, requirement.title),
            h('div', { className: 'rf-meta' },
              h('span', { className: 'it' }, '项目 ', h('b', null, state.project?.name ?? '—')),
              h('span', { className: 'it' }, '迭代 ', h('b', null, iteration ? `${iteration.code} ${iteration.name}` : '未归属')),
              h('span', { className: 'it' }, '产品 ', h('span', { className: 'assignee' }, h(Avatar, { name: owner?.name ?? requirement.ownerId }), h('b', null, owner?.name ?? requirement.ownerId))),
              published
                ? h('span', { className: 'it' }, '设计 ', designer ? h('span', { className: 'assignee' }, h(Avatar, { name: designer.name }), h('b', null, designer.name)) : h('span', { className: 'muted' }, requirement.designStatus === 'not_needed' ? '无需设计' : '待认领'))
                : null,
              // 没人认领 / 无需设计时，下一行的状态徽标还是同一句话，别摆两遍。
              published && designer
                ? h('span', { className: 'it' }, '设计状态 ', h(StatusChip, { kind: 'design', value: requirement.designStatus }))
                : null,
              estimateTotal > 0
                ? h('span', { className: 'it' }, '估时 ', h('b', null, `${dayCount(estimateTotal)} 人天`))
                : null,
              h('span', { className: 'it' }, '更新 ', h('b', null, relativeTime(requirement.updatedAt))),
            ),
          ),
        ),
        h('div', { className: 'banner banner--info', style: { marginBottom: '16px' } },
          h(DesignIcon, { name: 'lock' }),
          h('span', null, '这是需求的沉淀视图，只有', h('b', null, '已提交 / 已交付'), '的版本在这里；草稿留在本地不出现。认领可以直接在卡片上点，其余写操作在会话里由 skill 完成。'),
        ),
        h('div', { className: 'req-top' },
          h('div', { className: 'dcard2' },
            h('div', { className: 'ch' },
              h(DesignIcon, { name: 'file' }),
              h('span', { className: 't' }, '总述'),
              h('span', { className: 'r' },
                versions.length > 0
                  ? h('span', { className: 'badge badge--live' }, `需求 v${versions.length} · 最新`)
                  : h('span', { className: 'badge' }, '尚无版本'),
                docOverflowing
                  ? h('button', {
                      className: 'doc-toggle',
                      type: 'button',
                      'aria-expanded': docExpanded ? 'true' : 'false',
                      onClick: () => setDocExpanded(value => !value),
                    }, docExpanded ? '收起' : '展开全文', h(DesignIcon, { name: 'chev-down', size: 12 }))
                  : null,
              ),
            ),
            h('div', {
              className: `spec-line doc-body${docOverflowing && !docExpanded ? ' is-clipped' : ''}`,
              ref: docBodyRef,
              style: docOverflowing && !docExpanded ? { maxHeight: `${DOC_PREVIEW_HEIGHT}px` } : undefined,
            },
              docSummary !== '' ? h('div', { className: 'spec-item' }, h('b', null, '总述：'), h(MarkdownText, { text: docSummary })) : null,
              docBody !== '' ? h('div', { className: 'spec-item' }, h('b', null, '正文：'), h(MarkdownText, { text: docBody })) : null,
              document?.acceptanceCriteria ? h('div', { className: 'spec-item' }, h('b', null, '验收：'), h(MarkdownText, { text: document.acceptanceCriteria })) : null,
              docSummary === '' && docBody === '' && !document?.acceptanceCriteria
                ? h('p', { className: 'muted' }, '还没有提交需求总述。产品在会话里完成梳理后，这里会出现沉淀版本。')
                : null,
            ),
            h('div', { className: 'sub-label' }, h(DesignIcon, { name: 'history', size: 13 }), '需求版本历史'),
            h('div', null,
              versions.length === 0
                ? h('div', { className: 'tiny muted' }, '暂无版本。')
                : [...versions].slice(-3).reverse().map((version, index) => h('div', { className: 'vline', key: `${version.version}-${version.at}` },
                    h('span', { className: 'v' }, `v${version.version}`),
                    h('span', { className: 'd' }, version.summary || '无说明'),
                    index === 0 ? h('span', { className: 'badge', style: { marginLeft: 'auto' } }, '最新') : null,
                  )),
            ),
          ),
          h('div', { className: 'dcard2' },
            h('div', { className: 'ch' },
              h(DesignIcon, { name: 'history' }),
              h('span', { className: 't' }, '需求日志'),
              h('span', { className: 'r tiny muted' }, '谁在什么时候做了什么'),
            ),
            h('div', { className: 'card-bd', style: { padding: '6px 0' } },
              sortedLogs.length === 0
                ? h('div', { className: 'tiny muted', style: { padding: '12px 14px' } }, '还没有提交或交付记录。')
                : sortedLogs.map((event, index) => {
                    const user = state.users.find(item => item.id === event.who)
                    return h('div', { className: 'log-item', key: `${event.at}-${index}` },
                      h(Avatar, { name: user?.name ?? event.who }),
                      h('div', { className: 'c' },
                        h('div', { className: 'l1' }, h('b', null, user?.name ?? event.who), ' ', event.text),
                        h('div', { className: 'l2' }, `${relativeTime(event.at)} · ${event.sub}`),
                      ),
                    )
                  }),
            ),
          ),
        ),
        h('div', { className: 'cardwall' },
          // 产品：自己的会话 + 原型画布。
          roleCard({
            key: 'role-product',
            icon: 'file',
            role: '产品',
            person: owner,
            fallback: '—',
            chip: h(StatusChip, { kind: 'req', value: requirement.status }),
            body: [
              prototypeScreens === 0
                ? h('div', { className: 'narep', style: { margin: 0 } }, h(DesignIcon, { name: 'workbench' }), prototypeVersion === null ? '原型还没开始；需求文档确认后，让 AI 出第一版。' : '这个版本没有原型文件。')
                : h('div', { className: 'shot3' },
                    displayedPrototypeItems.slice(0, 3).map(item => shotTile({
                      key: item.key,
                      name: item.name,
                      src: item.src,
                      kind: item.kind,
                      note: item.note,
                      // 原型「打开」一律进画布：本机有文件开本机的，只有附件就先落快照。
                      onActivate: typeof onOpenPrototype === 'function'
                        ? () => openCanvasItem(item, onOpenPrototype)
                        : undefined,
                    })),
                  ),
            ],
            corner: cornerAction('打开原型画布', () => {
              const first = prototypeItems[0] ?? null
              if (first !== null) openCanvasItem(first, onOpenPrototype)
            }, prototypeItems.length === 0),
            versions: prototypeVersionList.length === 0 ? null : versionRow({
              id: 'prototype-versions',
              label: '原型版本',
              versions: prototypeVersionList,
              selected: prototypeVersion,
              onSelect: setPrototypeVersion,
              latestItems: prototypeItems,
              canvasOpener: onOpenPrototype,
              expanded: prototypeVersionsOpen,
              onToggle: () => setPrototypeVersionsOpen(value => !value),
            }),
          }),
          // 设计：自己的会话 + 设计画布；设计稿「打开」也进设计画布。
          published ? roleCard({
            key: 'role-design',
            icon: 'package',
            role: '设计',
            person: designer,
            fallback: requirement.designStatus === 'not_needed' ? '无需设计' : '待认领',
            chip: claimableDesign
              ? h('button', {
                  className: 'pclaim',
                  type: 'button',
                  onClick: () => openClaimDialog({ kind: 'design', label: '设计' }),
                }, '认领')
              // 抬头已经写了「待认领」，这里说工作状态，别重复同一个词
              : requirement.designStatus === 'unclaimed'
                ? h(DesignChip, { tone: 'idle', glyph: '○' }, '未开始')
                : h(StatusChip, { kind: 'design', value: requirement.designStatus }),
            body: [
              displayedDesignItems.length === 0
                ? h('div', { className: 'narep', style: { margin: 0 } }, h(DesignIcon, { name: 'package' }), designDelivered ? '已交付，但还没有可预览文件。' : '设计还没开始，在会话里梳理页面后开始做。')
                : h('div', { className: 'shot3' },
                    displayedDesignItems.map(item => shotTile({
                      key: item.key,
                      name: item.name,
                      src: item.src,
                      kind: item.kind,
                      note: item.note,
                      // 设计稿「打开」也进设计画布：别人的稿子本机没有，先落快照。
                      onActivate: typeof onOpenDesignCanvas === 'function'
                        ? () => openCanvasItem(item, onOpenDesignCanvas)
                        : undefined,
                    })),
                  ),
              requirement.designUpdatedAt ? h('div', { className: 'tiny', style: { color: 'var(--amber)' } }, '设计晚于开发更新，需评估返工。') : null,
            ],
            actions: canResetDesign
              ? [h('button', {
                  className: 'pact is-danger',
                  type: 'button',
                  key: 'reset-design',
                  onClick: () => {
                    setResetDesignError('')
                    setResetDesignOpen(true)
                  },
                }, h(DesignIcon, { name: 'trash', size: 13 }), '删除设计')]
              : null,
            corner: typeof onOpenDesignCanvas === 'function'
              ? cornerAction('打开设计画布', () => {
                  const first = designItems.find(item => item.path !== '')
                  if (first) onOpenDesignCanvas({ path: first.path, name: first.name })
                  // 设计师还没有设计稿：铺一张空白画布，别只给开始页。别人点开仍是开始页。
                  else if (state.currentUser.id !== requirement.designerId) onOpenDesignCanvas(null)
                  else void api('design/blank-canvas', {
                    method: 'POST',
                    body: JSON.stringify({ requirementId: requirement.id, kind: 'design' }),
                  }).then(body => onOpenDesignCanvas(
                    typeof body?.path === 'string' && body.path !== ''
                      ? { path: body.path, name: '_canvas.html' }
                      : null,
                  )).catch(() => onOpenDesignCanvas(null))
                }, designSession === null && designItems.length === 0 && !designDelivered)
              : null,
            versions: designVersionList.length === 0 ? null : versionRow({
              id: 'design-versions',
              label: '设计版本',
              versions: designVersionList,
              selected: designVersion,
              onSelect: setDesignVersion,
              latestItems: designItems,
              canvasOpener: onOpenDesignCanvas,
              expanded: designVersionsOpen,
              onToggle: () => setDesignVersionsOpen(value => !value),
            }),
          }) : null,
          published ? endPlatforms.map(devCard) : null,
          published && endPlatforms.length === 0
            ? h('div', { className: 'narep', style: { margin: 0 } }, h(DesignIcon, { name: 'minus' }), '未设置涉及平台。')
            : null,
          // 测试：测试会话 + 测试轮次/证据，后续再加测试列表工作面。
          published ? roleCard({
            key: 'role-test',
            icon: 'shield',
            role: '测试',
            person: tester
              ?? (latestTest ? state.users.find(user => user.id === latestTest.by) ?? null : null)
              ?? (testSession?.createdBy ? state.users.find(user => user.id === testSession.createdBy) ?? null : null),
            fallback: '待认领',
            chip: claimableTest
              ? h('button', {
                  className: 'pclaim',
                  type: 'button',
                  onClick: () => openClaimDialog({ kind: 'test', label: '测试' }),
                }, '认领')
              : latestTest
                ? h(DesignChip, { tone: latestTest.status === 'passed' ? 'done' : latestTest.status === 'failed' ? 'block' : 'warn', glyph: latestTest.status === 'passed' ? '✓' : latestTest.status === 'failed' ? '!' : '◷' }, `测试${TEST_STATUS_LABELS[latestTest.status] ?? latestTest.status}`)
                : h(DesignChip, { tone: 'idle', glyph: '○' }, '未开始测试'),
            body: [
              h('div', { className: 'pstat' },
                h('b', null, `${testRuns.length} 轮测试`),
                h('span', { className: 'tiny muted' }, `证据 ${testReportArtifacts.length} 份`),
              ),
              latestTest === null
                ? h('div', { className: 'narep', style: { margin: 0 } }, h(DesignIcon, { name: 'shield' }), '还没有测试记录。QA 在测试会话里开始一轮后，这里显示结论和证据。')
                : h('div', { className: 'spec-line' },
                    h('div', { className: 'spec-item' }, h('b', null, '最新一轮：'), h(MarkdownText, { text: `${TEST_STATUS_LABELS[latestTest.status] ?? latestTest.status} · ${relativeTime(latestTest.finishedAt ?? latestTest.startedAt)}${latestTest.note ? `\n\n${latestTest.note}` : ''}` })),
                    testRuns.length > 1 ? h('div', { className: 'spec-item' }, h('b', null, '测试轮次：'), `${testRuns.length} 轮`) : null,
                  ),
            ],
          }) : null,
        ),
        !published
          ? h('div', { className: 'narep', style: { marginTop: '12px' } },
              h(DesignIcon, { name: 'file' }), '需求还没有发布；提交出第一版后，这里会出现设计、开发和测试卡片。')
          : null,
        claimTarget !== null
          ? h(ConfirmDialog, {
              title: '认领这个任务？',
              confirmLabel: '认领并开始',
              busy: claimBusy,
              onClose: () => { if (!claimBusy) setClaimTarget(null) },
              onConfirm: confirmClaim,
            },
            h('p', null, `确认后「${claimTarget.label}」会落到你名下，卡片显示你的名字，并打开你在这条需求上的会话。`),
            claimError !== ''
              ? h('p', { className: 'pclaim-error' }, claimError)
              : null,
          )
          : null,
        resetDesignOpen
          ? h(ConfirmDialog, {
              title: '删除设计',
              confirmLabel: '删除设计',
              busy: resetDesignBusy,
              onClose: () => { if (!resetDesignBusy) setResetDesignOpen(false) },
              onConfirm: confirmResetDesign,
            },
            h('p', null, `删除 ${requirement.code} 的设计？会清空本机 design/ 里的设计稿、释放${designer?.name ?? '当前设计负责人'}的认领，并归档这次设计会话；旧对话仍保留在 DSH 会话历史里。`),
            resetDesignError !== ''
              ? h('p', { className: 'pclaim-error' }, resetDesignError)
              : null,
          )
          : null,
        shotPreview !== null
          ? h(ShotPreviewDialog, { shot: shotPreview, onClose: () => setShotPreview(null) })
          : null,
      )
    }

    function MyWorkbenchView({ state, filter, onFilter, onOpenRequirement, onOpenSession, onOpenDesign }) {
      const uid = state.currentUser.id
      const projectId = state.project?.id ?? state.currentProjectId ?? null
      // 我的工作台跟着当前项目走，切项目后只看这个项目里的待办。
      // 过滤全部需求是最贵的一步，用 useMemo 隔离，避免无关重渲染反复算。
      const mine = useMemo(() => {
        const projectIterations = new Set((state.iterations ?? [])
          .filter(iteration => projectId === null || iteration.projectId === projectId)
          .map(iteration => iteration.id))
        return (state.requirements ?? []).filter(requirement =>
          projectIterations.has(requirement.iterationId)
        ).filter(requirement =>
          requirement.ownerId === uid ||
          requirement.designerId === uid ||
          requirement.testerId === uid ||
          (requirement.reviewerIds ?? []).includes(uid) ||
          (requirement.devTasks ?? []).some(task => task.assigneeId === uid) ||
          (requirement.sessions ?? []).some(session => session.createdBy === uid))
      }, [state, projectId, uid])
      const todoOf = (requirement) => {
        if (requirement.designerId === uid && requirement.designStatus === 'changes_requested') return { tone: 'block', glyph: '!', label: '设计被退回' }
        if (requirement.designerId === uid && !['delivered', 'not_needed'].includes(requirement.designStatus)) return { tone: 'warn', glyph: '◷', label: '设计待交付' }
        if (requirement.testerId === uid && ['dev_done', 'testing'].includes(requirement.status)) return { tone: 'warn', glyph: '◷', label: '测试待完成' }
        if (requirement.testerId === uid && requirement.status === 'test_failed') return { tone: 'block', glyph: '!', label: '测试未通过' }
        if ((requirement.reviewerIds ?? []).includes(uid) && requirement.status === 'pending_review') return { tone: 'warn', glyph: '◷', label: '待你评审' }
        if (requirement.ownerId === uid && requirement.status === 'draft') return { tone: 'idle', glyph: '○', label: '需求待提交' }
        if (requirement.ownerId === uid && requirement.status === 'changes_requested') return { tone: 'block', glyph: '!', label: '需求被退回' }
        return null
      }
      const visible = mine.filter(requirement => {
        if (filter === 'requirement') return requirement.ownerId === uid || (requirement.reviewerIds ?? []).includes(uid)
        if (filter === 'design') return requirement.designerId === uid
        if (filter === 'todo') return todoOf(requirement) !== null
        return true
      })
      const month = monthKey()
      const monthDone = mine.filter(requirement =>
        requirement.release && monthOf(requirement.release.at) === month)
      const active = mine.filter(requirement => !['released', 'done', 'draft'].includes(requirement.status))
      // 列表筛选、顶部数字和每行的待办标签必须用同一套判断，否则“待我处理 3 个”点进去只有 2 条。
      const todo = mine.filter(requirement => todoOf(requirement) !== null)
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      const delivered = mine.filter(requirement => {
        if (!['released', 'done', 'test_passed'].includes(requirement.status)) return false
        const at = Date.parse(requirement.release?.at ?? requirement.updatedAt ?? '')
        return Number.isFinite(at) && at >= cutoff
      })
      const roleChips = (requirement) => {
        const roles = []
        if (requirement.ownerId === uid) roles.push('产品')
        if (requirement.designerId === uid) roles.push('设计')
        if ((requirement.reviewerIds ?? []).includes(uid)) roles.push('评审')
        if ((requirement.devTasks ?? []).some(task => task.assigneeId === uid)) roles.push('开发')
        if (requirement.testerId === uid) roles.push('测试')
        return roles.length === 0 ? ['关注'] : roles
      }
      return h('div', { className: 'page' },
        h('p', { className: 'filter-note' }, '需求、设计任务、待办合并为一份清单，按需求去重——一眼看清「这条需求里我是谁、要做什么」。'),
        h('div', { className: 'statbar' },
          h('div', { className: 'st' },
            h('div', { className: 'lab' }, h(DesignIcon, { name: 'check-circle' }), '本月完成'),
            h('div', { className: 'v' }, String(monthDone.length), h('small', null, `需求 ${monthDone.filter(item => item.ownerId === uid).length} · 设计 ${monthDone.filter(item => item.designerId === uid).length}`)),
            h('div', { className: 'd' }, monthDone.length > 0 ? `涉及 ${new Set(monthDone.map(item => item.iterationId)).size} 个迭代` : '本月还没有完成项'),
          ),
          h('div', { className: 'st' },
            h('div', { className: 'lab' }, h(DesignIcon, { name: 'dot' }), '进行中'),
            h('div', { className: 'v' }, String(active.length), h('small', null, `需求 ${active.filter(item => item.ownerId === uid).length} · 设计 ${active.filter(item => item.designerId === uid).length}`)),
            h('div', { className: 'd' }, active.length > 0 ? `都在 ${[...new Set(active.map(item => (state.iterations ?? []).find(iteration => iteration.id === item.iterationId)?.code).filter(Boolean))].join(' / ') || '当前迭代'}` : '暂无进行中'),
          ),
          h('div', { className: 'st' },
            h('div', { className: 'lab' }, h(DesignIcon, { name: 'clock' }), '待我处理'),
            h('div', { className: 'v' }, String(todo.length)),
            h('div', { className: 'd' }, todo.length > 0 ? `待评审 ${todo.filter(item => item.status === 'pending_review').length} · 设计 ${todo.filter(item => item.designerId === uid).length}` : '都处理完了'),
          ),
          h('div', { className: 'st' },
            h('div', { className: 'lab' }, h(DesignIcon, { name: 'target' }), '近 30 天完成'),
            h('div', { className: 'v' }, String(delivered.length), h('small', null, '项')),
            h('div', { className: 'd' }, '已发布 / 已完成 / 测试通过'),
          ),
        ),
        h('div', { className: 'toolbar' },
          h('div', { className: 'seg' },
            [['all', `全部 ${mine.length}`], ['requirement', `需求 ${mine.filter(item => item.ownerId === uid || (item.reviewerIds ?? []).includes(uid)).length}`], ['design', `设计任务 ${mine.filter(item => item.designerId === uid).length}`], ['todo', `待我处理 ${todo.length}`]].map(([key, label]) =>
              h('button', { key, type: 'button', className: filter === key ? 'active' : '', onClick: () => onFilter(key) }, label)),
          ),
          h('div', { className: 'spacer' }),
          h('span', { className: 'tiny muted' }, `按迭代 · ${[...new Set(mine.map(item => item.iterationId))].length} 个`),
        ),
        visible.length === 0
          ? h('div', { className: 'empty-page' },
              h(DesignIcon, { name: filter === 'todo' ? 'check-circle' : 'workbench', size: 28 }),
              h('b', null, filter === 'todo' ? '暂无待办' : '这里还没有你要处理的事'),
              h('span', null, filter === 'todo' ? '都处理完了。' : '等需求指派或设计任务分配后再来。'),
            )
          : h('div', { className: 'worklist' },
              visible.map(requirement => {
                const owner = state.users.find(user => user.id === requirement.ownerId)
                const designer = requirement.designerId ? state.users.find(user => user.id === requirement.designerId) : null
                const todoMeta = todoOf(requirement)
                const statusKind = requirement.designerId === uid ? 'design' : 'req'
                const statusValue = statusKind === 'design' ? requirement.designStatus : requirement.status
                const statusMap = statusKind === 'design' ? DESIGN_STATUS : REQ_STATUS
                const statusMeta = statusMap[statusValue] ?? { label: statusValue, tone: 'idle', glyph: '·' }
                const sub = designer ? `${designer.name} 设计 · ${relativeTime(requirement.designUpdatedAt ?? requirement.updatedAt)}更新` : `${owner?.name ?? '—'} 负责 · ${relativeTime(requirement.updatedAt)}更新`
                return h('div', { className: 'witem', key: requirement.id },
                  h('span', { className: 'wcode' }, requirement.code),
                  h('div', { className: 'wmain' },
                    h('a', { className: 'wname', href: '#', onClick: event => { event.preventDefault(); onOpenRequirement(requirement.id) } }, requirement.title),
                    h('div', { className: 'wsub' }, sub),
                  ),
                  h('div', { className: 'wroles' }, roleChips(requirement).map(role => h(DesignChip, { key: role, tone: 'plain' }, role))),
                  h(DesignChip, { tone: designTone(statusMeta.tone), glyph: statusMeta.glyph, className: 'wstat' }, statusMeta.label),
                  todoMeta
                    ? h(DesignChip, { tone: todoMeta.tone, glyph: todoMeta.glyph, className: 'wtodo' }, todoMeta.label)
                    : h('span', { className: 'wtodo tiny muted' }, '无待办'),
                  requirement.sessionId
                    ? h('button', {
                        className: `wgo btn btn-sm${todoMeta ? ' btn-primary' : ''}`,
                        type: 'button',
                        onClick: () => requirement.designerId === uid && onOpenDesign ? onOpenDesign(requirement) : (onOpenSession ? onOpenSession(requirement.sessionId) : onOpenRequirement(requirement.id)),
                      }, requirement.designerId === uid ? '设计会话' : '进入会话')
                    : h('button', { className: 'wgo btn btn-sm btn-ghost', type: 'button', onClick: () => onOpenRequirement(requirement.id) }, '查看需求'),
                )
              }),
            ),
      )
    }

    function NotificationsView({ state, onOpenRequirement, onReload, onToast }) {
      const [busy, setBusy] = useState(false)
      const [filter, setFilter] = useState('all')
      const items = Array.isArray(state.notifications) ? state.notifications : []
      const unread = state.unreadNotificationCount ?? items.filter(item => item.read !== true).length
      // 服务端的通知类型是 requirement.* / design.* / iteration.* 这样的点分命名，
      // 老数据里还有 design_updated 这种下划线写法：统一成点分再分类。
      const kindOf = item => String(item.type ?? item.kind ?? '').replace(/_/g, '.')
      const category = (item) => {
        const kind = kindOf(item)
        if (!/^(requirement|design)\./.test(kind)) return 'system'
        if (/(assigned|claimed|requested|submitted|failed|reopened)$/.test(kind)) return 'assign'
        if (/(updated|changed|moved|delivered|reviewed|passed|started|finished)$/.test(kind)) return 'change'
        return 'system'
      }
      const filtered = useMemo(() => (filter === 'all' ? items : filter === 'unread'
        ? items.filter(item => item.read !== true)
        : items.filter(item => category(item) === filter)), [items, filter])
      const markAll = async () => {
        if (busy) return
        setBusy(true)
        try {
          await api('notifications/read', { method: 'POST', body: '{}' })
          await onReload()
        } catch (reason) {
          onToast(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setBusy(false)
        }
      }
      const open = async (item) => {
        if (item.read !== true) {
          try {
            await api('notifications/read', { method: 'POST', body: JSON.stringify({ ids: [item.id] }) })
            await onReload()
          } catch (_) { /* 读取失败不阻塞跳转 */ }
        }
        if (item.requirementId) onOpenRequirement(item.requirementId)
      }
      const iconFor = (item) => {
        const kind = kindOf(item)
        if (/deliver/.test(kind)) return { name: 'package', color: 'var(--violet)' }
        if (/(failed|rejected|changes)/.test(kind)) return { name: 'alert', color: 'var(--red)' }
        if (/(assigned|claimed|requested|submitted)/.test(kind)) return { name: 'clock', color: 'var(--amber)' }
        if (/(updated|changed|moved)/.test(kind)) return { name: 'edit', color: 'var(--amber)' }
        if (/^(iteration|platform|project|skill|integration)\.|(frozen|unfrozen|released)/.test(kind)) return { name: 'check-circle', color: 'var(--text-3)' }
        return { name: 'bell', color: 'var(--text-2)' }
      }
      return h('div', { className: 'page' },
        h('div', { className: 'toolbar' },
          h('div', { className: 'seg' },
            [['all', '全部'], ['unread', `未读 ${unread}`], ['assign', '待我处理'], ['change', '变更'], ['system', '系统']].map(([key, label]) =>
              h('button', { key, type: 'button', className: filter === key ? 'active' : '', onClick: () => setFilter(key) }, label)),
          ),
          h('div', { className: 'spacer' }),
          items.length > 0 ? h('button', { className: 'btn btn-sm', type: 'button', disabled: busy || unread === 0, onClick: () => { void markAll() } },
            busy ? '处理中…' : '全部标为已读') : null,
        ),
        filtered.length === 0
          ? h('div', { className: 'empty-page' },
              h(DesignIcon, { name: 'bell', size: 28 }),
              h('b', null, items.length === 0 ? '没有通知' : '这个筛选下没有通知'),
              h('span', null, items.length === 0 ? '有指派 / 变更时会提醒。' : '换一个筛选看看。'),
            )
          : h('div', { className: 'card' },
              h('div', { className: 'card-bd', style: { padding: 0 } },
                filtered.map(item => {
                  const icon = iconFor(item)
                  return h('div', {
                    className: `notif${item.read === true ? '' : ' unread'}`,
                    key: item.id,
                    role: 'button',
                    tabIndex: 0,
                    style: { cursor: item.requirementId ? 'pointer' : 'default' },
                    onClick: () => { void open(item) },
                    onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void open(item) } },
                  },
                    h('span', { className: 'ico', style: { color: icon.color } }, h(DesignIcon, { name: icon.name })),
                    h('div', { className: 'c' },
                      h('div', { className: 't' }, h('b', null, item.title)),
                      h('div', { className: 's' }, h('span', null, item.body || '—')),
                    ),
                    h('div', { className: 'rt' },
                      h('span', { className: 'time' }, relativeTime(item.at)),
                      item.requirementId ? h(DesignIcon, { name: 'chev-right', className: 'chev', 'aria-hidden': 'true' }) : null,
                    ),
                  )
                }),
              ),
            ),
      )
    }

