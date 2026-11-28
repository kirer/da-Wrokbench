    function canvasTargetSatisfied(current, targetPath) {
      const target = current && current.target
      if (!target || target.kind !== 'file') return false
      const file = typeof target.file === 'string' ? target.file : ''
      const root = typeof target.root === 'string' ? target.root : ''
      if (file === targetPath) return true
      // targetPath 是目录时，只要当前打开的是这个目录里的真实页面就算到位；
      // 仍停在 _canvas.html 占位页时必须继续 open，才能从空白切到第一屏。
      if (root === targetPath && file !== '') {
        const name = file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1)
        if (name !== '' && !name.startsWith('_')) return true
      }
      return false
    }

    function useCanvasTarget(sid, targetPath) {
      const [error, setError] = useState('')
      const [opening, setOpening] = useState(false)
      // 画布没打开时页面上的「重试」：换一个 attempt 让下面的 effect 重跑一次。
      const [attempt, setAttempt] = useState(0)
      const generation = useRef(0)
      useEffect(() => {
        const runId = generation.current + 1
        generation.current = runId
        setError('')
        setOpening(false)
        if (typeof sid !== 'string' || sid === '') return undefined
        if (typeof targetPath !== 'string' || targetPath === '') {
          // 开始页：关掉这个会话残留的预览（别的会话看过的设计），否则首页出不来。
          let alive = true
          void (async () => {
            try {
              const response = await fetch(`${DS_API}state?session=${encodeURIComponent(sid)}`, { cache: 'no-store' })
              if (!response.ok) return
              const current = await response.json()
              if (!current || !current.target) return
              if (!alive) return
              await fetch(`${DS_API}close`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ session: sid }),
              })
            } catch (_) { /* 关不掉就让首页照常显示 */ }
          })()
          return () => { alive = false }
        }
        let alive = true
        const run = async () => {
          try {
            const response = await fetch(`${DS_API}state?session=${encodeURIComponent(sid)}`, { cache: 'no-store' })
            if (!response.ok) throw new Error(`设计服务返回 ${response.status}`)
            const current = await response.json()
            if (!alive || runId !== generation.current) return
            if (canvasTargetSatisfied(current, targetPath)) return
            setOpening(true)
            await openDesignFile(sid, targetPath)
          } catch (reason) {
            if (alive && runId === generation.current) setError(reason instanceof Error ? reason.message : String(reason))
          } finally {
            if (runId === generation.current) setOpening(false)
          }
        }
        void run()
        return () => {
          alive = false
          if (generation.current === runId) generation.current += 1
        }
      }, [sid, targetPath, attempt])
      const retry = useCallback(() => setAttempt(value => value + 1), [])
      return { error, opening, retry }
    }

    // 旧的输入框模板：现在不再预填，只用来识别并清掉老会话里留下的草稿。
    function designDescriptionPrompt(requirement, state) {
      const platforms = groupedPlatforms(state?.platforms ?? [], state?.platformGroups ?? [], requirement.platformIds)
        .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
        .join('；')
      const prototypes = requirement.prototypeFiles?.length ?? 0
      return [
        '/design-start',
        '',
        `需求：${requirement.code}「${requirement.title}」`,
        `平台：${platforms || '未设置'}`,
        prototypes > 0 ? `产品原型：prototype/ 已有 ${prototypes} 屏` : '产品原型：还没有，按需求描述直接设计',
        '',
        '先补全这次的设计要求：',
        '- 要设计的页面 / 流程：',
        '- 关键状态（默认、加载、空、错误、权限）：',
        '- 视觉方向（品牌色、参考、信息密度）：',
        '- 端与交付范围：',
        '',
        '补全后按 /design-start 技能在 design/ 直接产出高保真设计稿，再用 /design-deliver 交付。',
      ].join('\n')
    }

    // 旧的输入框模板（有简报）：只用于识别并清掉老会话里留下的草稿。
    function briefedRequirementPrompt(requirement, state) {
      const platforms = groupedPlatforms(state?.platforms ?? [], state?.platformGroups ?? [], requirement.platformIds)
        .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
        .join('；')
      return [
        '/design-start',
        '',
        `需求：${requirement.code}「${requirement.title}」`,
        `平台：${platforms || '未设置'}`,
        '',
        '需求简报已经在活文档里（workbench_design_context 可读），不要让我再重复描述。',
        '按 /design-start 技能在 prototype/ 直接产出产品原型；页面清单没写全时按文档目标补全关键状态。',
      ].join('\n')
    }

    // 旧的输入框模板（无简报）：只用于识别并清掉老会话里留下的草稿。
    // 需求会话产出的是产品原型（prototype/），高保真设计稿走设计会话（design/），两边不要混。
    function requirementDescriptionPrompt(requirement, state) {
      const platforms = groupedPlatforms(state?.platforms ?? [], state?.platformGroups ?? [], requirement.platformIds)
        .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
        .join('；')
      return [
        '/design-start',
        '',
        `需求：${requirement.code}「${requirement.title}」`,
        `平台：${platforms || '未设置'}`,
        '',
        '先补全这段需求描述：',
        '- 背景与要解决的问题：',
        '- 核心场景与用户路径：',
        '- 关键页面 / 主要流程：',
        '- 状态与边界（空态、异常、权限）：',
        '- 验收标准：',
        '',
        '补全后按 /design-start 技能在 prototype/ 直接产出产品原型。',
      ].join('\n')
    }

    // 更早的需求描述模板（带「目标用户」），同样只用于识别并清掉自动填入的草稿。
    function legacyRequirementDescriptionPrompt(requirement, state) {
      const platforms = groupedPlatforms(state?.platforms ?? [], state?.platformGroups ?? [], requirement.platformIds)
        .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
        .join('；')
      return [
        '/design-start',
        '',
        `需求：${requirement.code}「${requirement.title}」`,
        `平台：${platforms || '未设置'}`,
        '',
        '我先描述需求（补全下面几项后发送）：',
        '- 目标用户：',
        '- 核心场景：',
        '- 关键页面 / 流程：',
        '- 状态与边界：',
        '- 验收标准：',
        '',
        '请按我补全后的描述直接做产品原型：一屏一个 HTML 写进 prototype/，右侧「需求」面板会自动显示这些页面。',
      ].join('\n')
    }

    const promptRefreshed = new Set()
    const flatText = text => String(text ?? '').replace(/\s+/g, ' ').trim()

    // 曾经自动填进输入框的模板。现在不再预填，只用来识别并清掉老会话里留下的草稿。
    function seededPromptTemplates(requirement, state) {
      return [
        requirementDescriptionPrompt(requirement, state),
        briefedRequirementPrompt(requirement, state),
        designDescriptionPrompt(requirement, state),
        legacyRequirementDescriptionPrompt(requirement, state),
      ]
    }

    // 需求会话开场白：会话还空白时，请宿主往会话日志里写一条真实的 assistant
    // 消息，把需求编号、平台和要补的信息放在对话上方；输入框保持为空。
    // 不发模型请求；写一次之后由 session.blank 收起。
    const greetingRequested = new Set()
    const greetingUpgraded = new Set()
    function RequirementGreeting({ session, input, inputActions, ctx }) {
      const sid = typeof session?.sessionId === 'string' ? session.sessionId : ''
      // 这个插槽是会话作用域的，顺手把宿主给的输入门面留给画布用（见 inputActionsFor）。
      useSessionInputActions(sid, inputActions)
      // 开场白只需要“这个会话有没有需求”；会话不空白后不再轮询，避免和右栏重复。
      const { requirement } = useRequirementForSession(sid, { poll: session?.blank === true })
      const { state } = useWorkbench()
      const design = requirement?.sessions?.find?.(item => item.type === 'design' && item.sessionId === sid)
      const inputApi = input?.requestDraftInitialization !== undefined ? input : ctx.conversation?.input
      const isDesign = design !== undefined && design !== null
      const latest = useRef({ requirement, state })
      latest.current = { requirement, state }
      const stateReady = state !== null && state !== undefined
      // 老会话输入框里可能还留着自动填入的模板：识别出来后清空，引导已经在对话上方。
      // 用户改过的草稿不会匹配模板，不会被清掉。
      const draftText = typeof input?.draft === 'string' ? input.draft : ''
      useEffect(() => {
        if (sid === '' || !requirement || draftText === '') return undefined
        const init = typeof input?.requestDraftInitialization === 'function'
          ? input
          : inputApi?.requestDraftInitialization !== undefined ? inputApi : null
        if (init === null) return undefined
        const flatDraft = flatText(draftText)
        if (!seededPromptTemplates(requirement, state).some(template => flatText(template) === flatDraft)) return undefined
        const key = `${sid}:clear-seeded-prompt`
        if (promptRefreshed.has(key)) return undefined
        promptRefreshed.add(key)
        let disposed = false
        void Promise.resolve()
          .then(() => ctx.sessions.using(sid, { source: 'workbench' }, async (reference) => {
            if (disposed) return
            const result = init.requestDraftInitialization(reference.binding, {
              prompt: '',
              clearPreviousDraft: true,
            })
            if (result !== 'applied') {
              promptRefreshed.delete(key)
              console.warn('[dsh-workbench] 自动填入的输入框模板没有清掉：', result)
            }
          }))
          .catch((reason) => {
            promptRefreshed.delete(key)
            console.warn('[dsh-workbench] 输入框模板清理失败', reason)
          })
        return () => { disposed = true }
      }, [sid, requirement, draftText, state, input, inputApi, ctx])
      const blank = requirement !== null && requirement !== undefined && session?.blank === true
        && (input?.phase === undefined || input.phase === 'plain')
      useEffect(() => {
        if (!blank || sid === '' || !requirement || !stateReady) return undefined
        const key = `${sid}:${isDesign ? 'design' : 'requirement'}`
        if (greetingRequested.has(key)) return undefined
        greetingRequested.add(key)
        let disposed = false
        let succeeded = false
        let attempt = 0
        let timer = 0
        const send = () => {
          const current = latest.current
          const req = current.requirement
          if (req === null || req === undefined) return
          const platforms = groupedPlatforms(current.state?.platforms ?? [], current.state?.platformGroups ?? [], req.platformIds)
            .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
            .join('；')
          const briefed = String(req.document?.summary ?? '').trim() !== ''
            || String(req.document?.body ?? '').trim() !== ''
          attempt += 1
          void api('session-greeting', {
            method: 'POST',
            body: JSON.stringify({
              sessionId: sid,
              kind: isDesign ? 'design' : 'requirement',
              code: req.code,
              title: req.title,
              platforms,
              briefed,
              prototypes: req.prototypeFiles?.length ?? 0,
              // 开场白跟着当前身份走：负责人看评审排期，开发看认领开工，测试看结论。
              role: current.state?.currentUser?.activeRole ?? '',
              status: req.status ?? '',
              round: (req.versions ?? []).length,
              reviewers: (req.reviewerIds ?? [])
                .map(id => (current.state?.users ?? []).find(user => user.id === id)?.name ?? id)
                .join('、'),
            }),
          }).then(() => {
            succeeded = true
            // 消息已经写进日志，让会话列表投影刷新 blank 状态，界面从空白首页切到对话记录。
            if (!disposed && typeof ctx.sessions?.refreshProjections === 'function') {
              ctx.sessions.refreshProjections(sid).catch(() => {})
            }
          }, (reason) => {
            if (disposed) return
            if (attempt < 8) {
              timer = setTimeout(send, attempt < 3 ? 900 : 1800)
            } else {
              greetingRequested.delete(key)
              console.warn('[dsh-workbench] session greeting failed', reason)
            }
          })
        }
        // 会话刚打开时认领和 Agent 可能还没准备好；多试几次，卸载时把占位放开。
        timer = setTimeout(send, 600)
        return () => {
          disposed = true
          clearTimeout(timer)
          if (!succeeded) greetingRequested.delete(key)
        }
      }, [blank, sid, isDesign, ctx, stateReady])
      // 老会话的开场白只有一句“请描述你的需求”，没有编号、平台和描述要点。
      // 会话不是空白时请宿主补一条带这些信息的引导消息；已经有真实对话的会跳过。
      useEffect(() => {
        if (blank || sid === '' || !requirement || !stateReady) return undefined
        const key = `${sid}:greeting-upgrade-v2`
        if (greetingUpgraded.has(key)) return undefined
        greetingUpgraded.add(key)
        let disposed = false
        const current = latest.current
        const req = current.requirement
        if (req === null || req === undefined) return undefined
        const platforms = groupedPlatforms(current.state?.platforms ?? [], current.state?.platformGroups ?? [], req.platformIds)
          .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
          .join('；')
        const briefed = String(req.document?.summary ?? '').trim() !== ''
          || String(req.document?.body ?? '').trim() !== ''
        void api('session-greeting', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: sid,
            kind: isDesign ? 'design' : 'requirement',
            code: req.code,
            title: req.title,
            platforms,
            briefed,
            prototypes: req.prototypeFiles?.length ?? 0,
            role: current.state?.currentUser?.activeRole ?? '',
            status: req.status ?? '',
            round: (req.versions ?? []).length,
            reviewers: (req.reviewerIds ?? [])
              .map(id => (current.state?.users ?? []).find(user => user.id === id)?.name ?? id)
              .join('、'),
            upgrade: true,
          }),
        }).then(() => {
          if (!disposed && typeof ctx.sessions?.refreshProjections === 'function') {
            ctx.sessions.refreshProjections(sid).catch(() => {})
          }
        }, (reason) => {
          greetingUpgraded.delete(key)
          console.warn('[dsh-workbench] session greeting upgrade skipped', reason)
        })
        return () => { disposed = true }
      }, [blank, sid, requirement, isDesign, ctx, stateReady])
      return null
    }

    // 工作台的作品（按迭代分组）：喂给画布的首页上的「接着做」和「需求原型」。
    // kind 决定只看哪一边：需求面板只列 prototype/，设计画布只列 design/，原型和设计稿不混在一起。
    // thumbKey 变化（预览票据换好）时重算，缩略图地址才会带上票据。
    function workSessionId(requirement, kind) {
      if (kind === 'design') {
        const design = (Array.isArray(requirement.sessions) ? requirement.sessions : [])
          .find(session => session.archived !== true
            && session.type === 'design' && typeof session.sessionId === 'string' && session.sessionId !== '')
        return design ? design.sessionId : ''
      }
      return typeof requirement.sessionId === 'string' ? requirement.sessionId : ''
    }

    function startWorkGroups(state, thumbKey, kind = 'prototype') {
      const groups = []
      for (const iteration of (state?.iterations ?? [])) {
        // 归档迭代也要出现在开始页：用户需要按迭代回看历史原型/设计稿。
        const works = []
        for (const requirement of iterationRequirements(state, iteration.id)) {
          const items = kind === 'design'
            ? (Array.isArray(requirement.designScreens) ? requirement.designScreens : [])
            : (Array.isArray(requirement.prototypeFiles) ? requirement.prototypeFiles : [])
          if (items.length === 0) continue
          works.push({
            id: requirement.id,
            code: requirement.code,
            title: requirement.title,
            screens: items.length,
            updatedAt: items[0].updatedAt,
            // 设计作品要打开设计会话；以前一律用需求主会话，点开会跑到错误的面板。
            sessionId: workSessionId(requirement, kind),
            thumb: designPreviewUrl(requirement.id, items[0]),
          })
        }
        if (works.length > 0) groups.push({ iteration, works })
      }
      void thumbKey
      return groups
    }

    function DesignStudioCanvas({ sid, ctx, targetPath, kind = 'prototype', currentWorkId = '', inputActions = undefined, onBack = null, readOnly = false, requirementVersions = [], onOpenRequirementVersion = null, onOpenWork = null }) {
      const studio = useDesignStudio()
      // 从工作台中间打开时没有插槽 props，改用开场白那里留下的门面。
      const fallbackInputActions = useMemo(() => inputActionsFor(sid), [sid])
      const actions = inputActions !== undefined ? inputActions : fallbackInputActions
      const t = useMemo(() => (studio.runtime ? studio.runtime.makeT(ctx) : key => key), [studio.runtime, ctx])
      const { error, opening, retry: retryCanvas } = useCanvasTarget(sid, targetPath)
      const { state } = useWorkbench()
      const workIds = useMemo(() => {
        const ids = []
        for (const iteration of (state?.iterations ?? [])) {
          if (iteration.archived === true) continue
          for (const requirement of iterationRequirements(state, iteration.id)) {
            const count = kind === 'design'
              ? (requirement.designScreens?.length ?? 0)
              : (requirement.prototypeFiles?.length ?? 0)
            if (count > 0) ids.push(requirement.id)
          }
        }
        return ids
      }, [state, kind])
      // 首页缩略图走同源 design-preview：先把这些需求的预览票据换好，卡片才会出图。
      const thumbKey = usePreviewTickets(workIds)
      const groups = useMemo(() => startWorkGroups(state, thumbKey, kind), [state, thumbKey, kind])
      const openWork = useCallback((work) => {
        // 工作台内嵌画布：点作品就在工作台里打开这条需求，不把用户弹到宿主的会话面板。
        if (typeof onOpenWork === 'function' && typeof work?.id === 'string' && work.id !== '') {
          onOpenWork(work)
          return
        }
        if (typeof work?.sessionId !== 'string' || work.sessionId === '') {
          publishCommandToast({ seq: ++commandToastSeq, name: kind === 'design' ? '设计稿' : '原型', kind: 'info', text: kind === 'design' ? '这条需求还没有设计会话，先在设计会话里交付设计稿。' : '这条需求还没有可进入的需求会话。' })
          return
        }
        try { ctx.uiWorkspace.openSession(work.sessionId) } catch (reason) { console.warn('[dsh-workbench] open session failed', reason) }
      }, [ctx, kind, onOpenWork])
      if (studio.error) {
        return h('div', { className: 'dsh-wb-design-msg' },
          h('b', null, '设计画布加载失败'),
          studio.error instanceof Error ? studio.error.message : String(studio.error),
          h('button', {
            className: 'dsh-wb-btn dsh-wb-btn--sm',
            type: 'button',
            onClick: () => { if (designStudioRetry !== null) designStudioRetry() },
          }, '重试'),
        )
      }
      if (!studio.runtime) {
        return h('div', { className: 'dsh-wb-design-msg' }, h('span', { className: 'dsh-wb-spinner' }), '正在加载画布…')
      }
      return h('div', { className: `dsh-wb-design-canvas dsh-wb-canvas-studio${readOnly ? ' dsh-wb-canvas-readonly' : ''}` },
        opening ? h('div', { className: 'dsh-wb-canvas-loading' }, '正在打开画布…') : null,
        error !== '' ? h('div', { className: 'dsh-wb-canvas-error' },
          h('b', null, '画布没有打开'),
          error,
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: retryCanvas }, '重试'),
        ) : null,
        // inputActions 是宿主的输入门面：画布的画笔画标注、点选元素、
        // 样式修改都靠它“发到对话”，不传就只能退回复制。
        h(studio.runtime.PreviewTab, { sid, t, works: groups, worksKind: kind, currentWorkId, onOpenWork: openWork, inputActions: actions, onBack, requirementVersions, onOpenRequirementVersion }),
      )
    }

    // 预览票据：沙箱 iframe 带不上 Authorization（桌面端登录靠 localStorage 的
    // Bearer），所以先按需求换一张短期票据，再把票据拼进 iframe 的 src。
    const previewTickets = new Map() // requirementId -> { ticket, expiresAt }
    const previewTicketSubs = new Set()
    let previewTicketInFlight = null
    let previewTicketQueued = new Set()

    function notifyPreviewTickets() {
      for (const sub of previewTicketSubs) {
        try { sub() } catch (_) { /* 组件已经卸载 */ }
      }
    }

    function fetchPreviewTickets(ids) {
      for (const id of ids) previewTicketQueued.add(id)
      if (previewTicketInFlight !== null) return previewTicketInFlight
      previewTicketInFlight = (async () => {
        try {
          while (previewTicketQueued.size > 0) {
            const batch = [...previewTicketQueued].slice(0, 50)
            for (const id of batch) previewTicketQueued.delete(id)
            const body = await api('preview-ticket', {
              method: 'POST',
              body: JSON.stringify({ requirementIds: batch }),
            })
            const now = Date.now()
            const ttl = Number(body.expiresIn) > 0 ? Number(body.expiresIn) * 1000 : 120000
            for (const [id, ticket] of Object.entries(body.tickets ?? {})) {
              previewTickets.set(id, { ticket, expiresAt: now + ttl })
            }
            notifyPreviewTickets()
          }
        } catch (reason) {
          console.warn('[dsh-workbench] 预览票据获取失败', reason)
        } finally {
          previewTicketInFlight = null
        }
      })()
      return previewTicketInFlight
    }

    // 页面里要预览哪些需求就声明哪些：缺票据或快过期时自动换一张。
    function usePreviewTickets(requirementIds) {
      const key = (requirementIds ?? []).filter(id => typeof id === 'string' && id !== '').join('|')
      const [rev, bump] = useState(0)
      useEffect(() => {
        const ids = (requirementIds ?? []).filter(id => typeof id === 'string' && id !== '')
        if (ids.length === 0) return undefined
        const sub = () => bump(n => n + 1)
        previewTicketSubs.add(sub)
        let alive = true
        let timer = 0
        const schedule = () => {
          if (!alive) return
          const now = Date.now()
          const expiries = ids
            .map(id => previewTickets.get(id)?.expiresAt)
            .filter(value => Number.isFinite(value))
          // 票据 120 秒过期，提前 30 秒换；换失败就 30 秒后再试，不能让画布永久空白。
          const hold = expiries.length > 0
            ? Math.max(5000, Math.min(...expiries) - now - 30000)
            : 30000
          timer = setTimeout(refresh, Math.min(hold, 30000))
        }
        const refresh = () => {
          timer = 0
          if (!alive) return
          const now = Date.now()
          const missing = ids.filter((id) => {
            const entry = previewTickets.get(id)
            return entry === undefined || entry.expiresAt - now < 30000
          })
          if (missing.length === 0) { schedule(); return }
          void fetchPreviewTickets(missing).finally(schedule)
        }
        refresh()
        return () => {
          alive = false
          clearTimeout(timer)
          previewTicketSubs.delete(sub)
        }
      }, [key])
      // 返回值带上 rev：票据到手后依赖它的地方会重算，缩略图地址才会换成带票据的。
      return `${key}#${rev}`
    }

    function designPreviewUrl(requirementId, item) {
      if (!requirementId || !item) return ''
      const params = new URLSearchParams({ requirementId })
      const relativePath = item.relativePath || item.path
      if (item.artifactId) params.set('artifactId', item.artifactId)
      else if (relativePath) params.set('path', relativePath)
      else return ''
      const entry = previewTickets.get(requirementId)
      if (entry !== undefined && entry.expiresAt > Date.now()) params.set('ticket', entry.ticket)
      return `${API}design-preview?${params.toString()}`
    }

    // DSH 输入框原生支持粘贴图片，但没有显式的「草稿图」入口。这里补一个：
    // 选图后构造一次粘贴事件交给 DSH 自己的 file intake，附件草稿的创建、
    // 预览、删除仍然完全走宿主逻辑，插件不额外存文件。
    function ComposerDraftImage() {
      const fileRef = useRef(null)
      const onPick = (event) => {
        const file = event.target.files && event.target.files[0] ? event.target.files[0] : null
        event.target.value = ''
        if (file === null) return
        if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
          publishCommandToast({ seq: ++commandToastSeq, name: '草稿图', kind: 'error', text: '只支持 PNG、JPEG、WebP、GIF 图片。' })
          return
        }
        const editor = document.querySelector('[data-lexical-editor="true"]')
        if (editor === null) {
          publishCommandToast({ seq: ++commandToastSeq, name: '草稿图', kind: 'error', text: '没找到聊天输入框，先打开一个会话。' })
          return
        }
        try {
          const transfer = new DataTransfer()
          transfer.items.add(file)
          let paste
          try {
            paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
          } catch {
            paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
            Object.defineProperty(paste, 'clipboardData', { value: transfer })
          }
          editor.focus()
          editor.dispatchEvent(paste)
          publishCommandToast({ seq: ++commandToastSeq, name: '草稿图', kind: 'info', text: '草稿图已放进输入框，补一句说明再发送。' })
        } catch (reason) {
          console.warn('[dsh-workbench] 草稿图放进输入框失败', reason)
          publishCommandToast({ seq: ++commandToastSeq, name: '草稿图', kind: 'error', text: '没能放进输入框，也可以直接把图片拖进输入框。' })
        }
      }
      return h('span', { className: 'dsh-wb-draftimg' },
        h('button', {
          className: 'dsh-wb-draftimg-btn',
          type: 'button',
          title: '添加草稿图（图片）',
          'aria-label': '添加草稿图',
          onClick: () => { if (fileRef.current !== null) fileRef.current.click() },
        }, h(DesignIcon, { name: 'upload', size: 14 })),
        h('input', {
          ref: fileRef,
          type: 'file',
          accept: 'image/png,image/jpeg,image/webp,image/gif',
          style: { display: 'none' },
          onChange: onPick,
        }),
      )
    }

    function CommandToast() {
      const toasts = useToasts()
      if (!Array.isArray(toasts) || toasts.length === 0) return null
      return h('div', { className: 'dsh-wb-toast-queue', 'aria-live': 'polite', 'aria-atomic': 'false' },
        toasts.map((toast) => h('div', {
          key: toast.seq,
          className: `dsh-wb-toast dsh-wb-command-toast${toast.kind === 'error' ? ' is-error' : ''}`,
          role: toast.kind === 'error' ? 'alert' : 'status',
        },
          h('button', { className: 'dsh-wb-toast-close', type: 'button', 'aria-label': '关闭提示', onClick: () => dismissToast(toast.seq) }, '×'),
          h('div', { className: 'dsh-wb-command-toast-head' },
            toast.name ? h('code', null, `/${toast.name}`) : null,
            h('span', null, toast.kind === 'error' ? '出错了' : '已完成'),
          ),
          h('div', { className: 'dsh-wb-command-toast-body' }, toast.text || '（无输出）'),
          toast.detail
            ? h('details', { className: 'dsh-wb-toast-detail' },
                h('summary', null, '详情'),
                h('div', null, toast.detail))
            : null,
        )),
      )
    }

    // ---------------------------------------------------------------------
    // Icons
    // ---------------------------------------------------------------------

    function WorkbenchIcon({ size = 20, active = false }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { opacity: active ? 1 : 0.86 },
        'aria-hidden': 'true',
      },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }),
        h('path', { d: 'M8 4v16M8 9h13' }),
        h('path', { d: 'M12 13h5M12 16.5h3.5' }),
      )
    }

    // ---------------------------------------------------------------------
    // Apply
    // ---------------------------------------------------------------------

