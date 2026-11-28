    // ---------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------

    function platformName(platforms, id) {
      const platform = platforms.find(item => item.id === id)
      return platform === undefined ? id : platform.shortName
    }

    function groupedPlatforms(platforms, groups, ids) {
      const set = new Set(Array.isArray(ids) ? ids : [])
      return [...groups]
        .sort((a, b) => a.order - b.order)
        .map(group => ({
          group,
          items: platforms.filter(platform => platform.groupId === group.id && set.has(platform.id)),
        }))
        .filter(entry => entry.items.length > 0)
    }

    function designTone(tone) {
      if (tone === 'success') return 'done'
      if (tone === 'business') return 'prog'
      if (tone === 'warn') return 'warn'
      if (tone === 'error') return 'block'
      return 'idle'
    }

    function StatusChip({ kind, value }) {
      const map = kind === 'design' ? DESIGN_STATUS : REQ_STATUS
      const meta = map[value] || { label: value || '未知', tone: 'idle', glyph: '·' }
      // 只保留新版语义类名（dsh-wb-chip--*），去掉会覆盖它的旧 chip--* 双轨类名，
      // 让状态色跟随宿主主题（浅色下也更协调）。
      return h('span', { className: `dsh-wb-chip dsh-wb-chip--${meta.tone}` },
        h('span', { className: 'gl g' }, meta.glyph),
        meta.label,
      )
    }

    function DesignChip({ tone = 'idle', glyph, children, title, className = '', style }) {
      return h('span', { className: `chip chip--${tone}${className === '' ? '' : ' ' + className}`, title, style },
        glyph === undefined ? null : h('span', { className: 'gl' }, glyph),
        children,
      )
    }

    function phaseChipTone(label) {
      if (label === '已封板') return 'done'
      if (label === '规划中') return 'idle'
      if (label === '评审') return 'warn'
      return 'prog'
    }

    const SESSION_TYPE_LABELS = { requirement: '需求', design: '设计', review: '评审', dev: '开发', test: '测试' }
    const ITERATION_STATUS_LABELS = { planning: '规划中', in_progress: '进行中', done: '已结束' }
    const DEV_STATUS_LABELS = { unassigned: '未指派', assigned: '已指派', in_progress: '开发中', done: '已完成' }
    const TEST_STATUS_LABELS = { running: '测试中', passed: '通过', failed: '不通过' }
    const SKILL_STATUS_LABELS = { active: '已启用', pending_review: '待审核', changes_requested: '已退回', archived: '已归档' }
    const SKILL_SCOPE_LABELS = { global: '团队技能', personal: '个人技能' }
    const REVIEW_DECISION_LABELS = { approved: '通过', rejected: '退回' }

    function sessionTypeLabel(type) {
      return SESSION_TYPE_LABELS[type] ?? '需求'
    }

    function safeHttpUrl(value) {
      if (typeof value !== 'string' || value.trim() === '') return ''
      try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : ''
      } catch {
        return ''
      }
    }

    function relativeTime(value) {
      const time = Date.parse(value)
      if (Number.isNaN(time)) return '—'
      const delta = Date.now() - time
      if (delta < -60_000) return new Date(time).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      if (delta < 60_000) return '刚刚'
      if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
      if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
      const sameYear = new Date(time).getFullYear() === new Date().getFullYear()
      return new Date(time).toLocaleDateString('zh-CN', { ...(sameYear ? {} : { year: 'numeric' }), month: '2-digit', day: '2-digit' })
    }

    // 用本地月份，而不是 toISOString() 的 UTC 月份：中国时区每月 1 日 8 点前，
    // UTC 还停在上个月，会把“本月完成 / 本月封板”算错。
    function monthKey(date = new Date()) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }

    // 服务端时间都是 UTC ISO；按本地月份比较，和 monthKey 同一口径。
    function monthOf(value) {
      const date = new Date(String(value ?? ''))
      return Number.isNaN(date.getTime()) ? '' : monthKey(date)
    }

    function slugTitle(title) {
      return String(title).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 48)
    }

    async function ensureChildDirectory(parent, name, options = {}) {
      // The web surface has no native directory picker (`directory-picker/unavailable`),
      // so folder creation goes through the host half, which runs on the same machine.
      const body = await api('folders/ensure', {
        method: 'POST',
        body: JSON.stringify({ parent, name, unique: options.unique === true }),
      })
      return body.path
    }

    function splitDirectory(dirPath) {
      const normalized = String(dirPath ?? '').replace(/\/+$/, '')
      const cut = normalized.lastIndexOf('/')
      if (cut <= 0 || cut === normalized.length - 1) return null
      return { parent: normalized.slice(0, cut), name: normalized.slice(cut + 1) }
    }

    async function ensureIterationWorkspace(ctx, iterationDir, requirement) {
      // 需求会话直接挂在迭代目录（如 workbench/436）的工作区里，不再给每条需求
      // 单建一个工作区/文件夹；DSH 对同一路径幂等复用已登记的工作区。
      const split = splitDirectory(iterationDir)
      if (split !== null) await ensureChildDirectory(split.parent, split.name)
      try {
        const workspace = await ctx.workspaces.create({ path: iterationDir })
        return { workspaceId: workspace.workspaceId, folderPath: iterationDir }
      } catch (reason) {
        if (reason?.rpcError?.code !== 'workspace/invalid-path') throw reason
        // 退路：迭代目录无法作为工作区时，才建「迭代编码-需求名称」目录。
        const name = `${split?.name ?? '迭代'}-${slugTitle(requirement.title)}`
        const folderPath = await ensureChildDirectory(iterationDir, name, { unique: true })
        const workspace = await ctx.workspaces.create({ path: folderPath })
        return { workspaceId: workspace.workspaceId, folderPath }
      }
    }

    async function finishRequirementCreation(ctx, requirement, state, brief = '') {
      const iterationDir = String(state.iterationDir ?? state.baseDir).replace(/\/+$/, '')
      const baseDir = String(state.baseDir ?? '').replace(/\/+$/, '')
      // 会话落在迭代目录下，标题就是需求名称；需求自己的原型/设计资料目录由右栏按需创建。
      const ensured = iterationDir === baseDir
        ? { workspaceId: null, folderPath: baseDir }
        : await ensureIterationWorkspace(ctx, iterationDir, requirement)
      let workspaceId = ensured.workspaceId
      const folderPath = ensured.folderPath
      if (!workspaceId) {
        const workspace = await ctx.workspaces.create({ path: baseDir })
        workspaceId = workspace.workspaceId
      }
      const sessionId = await ctx.sessions.create({ workspaceId })
      await ctx.sessions.using(sessionId, { source: 'workbench' }, async (reference) => {
        const result = await reference.binding.session.rename(requirement.title)
        if (result.ok !== true) throw new Error(result.error?.message || '会话标题设置失败')
      })
      // 服务端只保存会话记录，不保存 DSH 会话 ID 和本机路径；两者由 host 半端写进本机映射。
      const recorded = await api(`requirements/${encodeURIComponent(requirement.id)}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'requirement',
          label: '需求会话',
          dshSessionId: sessionId,
          workspaceId,
          folderPath,
        }),
      })
      const body = await api(`requirements/${encodeURIComponent(requirement.id)}/bind`, {
        method: 'POST',
        body: JSON.stringify({ sessionRecordId: recorded.session.id }),
      })
      let saved = body.requirement
      const text = String(brief ?? '').trim()
      if (text !== '') {
        // 需求简报直接写进活文档：会话里不用再让用户重复一遍，模型读文档即可。
        try {
          const firstLine = text.split('\n').map(line => line.trim())
            .find(line => line !== '' && !line.startsWith('#')) ?? text.slice(0, 120)
          const document = await api(`requirements/${encodeURIComponent(requirement.id)}/document`, {
            method: 'POST',
            body: JSON.stringify({ summary: firstLine.slice(0, 300), body: text }),
          })
          saved = document.requirement ?? saved
        } catch (reason) {
          console.warn('[dsh-workbench] 需求简报保存失败', reason)
        }
      }
      // 输入框不再预填模板；进入会话时由 RequirementGreeting 在对话上方写引导。
      return { requirement: saved, sessionId, folderPath, workspaceId }
    }

    async function markCreationFailed(requirement, reason) {
      try {
        await api(`requirements/${encodeURIComponent(requirement.id)}/create-failed`, {
          method: 'POST',
          body: JSON.stringify({ error: reason instanceof Error ? reason.message : String(reason) }),
        })
      } catch (_) { /* the requirement is already unusable; the next poll shows it */ }
    }

