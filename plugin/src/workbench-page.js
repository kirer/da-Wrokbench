    function WorkbenchPage({ ctx, auth, kit }) {
      const workbench = useWorkbench()
      const [view, setView] = useState('iterations')
      // 记住迭代区最后停在哪一层（列表 / 迭代详情 / 需求），从别的导航切回来时恢复。
      const [workspaceView, setWorkspaceView] = useState('iterations')
      // 右侧会话坞常驻；中间画布只有从原型「打开」时才覆盖上来，并记住打开的是哪个文件。
      const [canvasOpen, setCanvasOpen] = useState(false)
      const [canvasTarget, setCanvasTarget] = useState(null)
      // 中间画布可以是产品原型，也可以是设计画布；两种卡片各自打开自己的工作面。
      const [canvasKind, setCanvasKind] = useState('prototype')
      // 从画布的版本面板跳回需求页时要停在哪个原型版本（提交时定格的那一版）。
      const [prototypeVersionFocus, setPrototypeVersionFocus] = useState(null)
      const [shellNode, setShellNode] = useState(null)
      const [flushLeft, setFlushLeft] = useState(false)
      const [selectedRequirementId, setSelectedRequirementId] = useState(null)
      const [iterationQuery, setIterationQuery] = useState('')
      const [iterationFilter, setIterationFilter] = useState('all')
      const [myFilter, setMyFilter] = useState('all')
      const [dialogOpen, setDialogOpen] = useState(false)
      const [platformOpen, setPlatformOpen] = useState(false)
      const [adminOpen, setAdminOpen] = useState(false)
      const [iterationOpen, setIterationOpen] = useState(false)
      const [iterationManageOpen, setIterationManageOpen] = useState(false)
      const [projectMenuOpen, setProjectMenuOpen] = useState(false)
      const [projectDialog, setProjectDialog] = useState(null)
      // 进入需求页时自动建的会话：记录进度和失败原因，失败后给一次手动重试。
      const [autoSession, setAutoSession] = useState({ status: 'idle', error: '' })
      const [autoSessionTick, setAutoSessionTick] = useState(0)
      const autoSessionKeyRef = useRef('')
      const mountedRef = useRef(true)
      const [retrying, setRetrying] = useState('')
      const [dockWidth, setDockWidth] = useState(readDockWidth)
      const state = workbench.state
      // 会话坞和画布页共用同一条「本机自己的会话」：右边说话，中间出图。
      const selectedRequirement = state === null
        ? null
        : (state.requirements ?? []).find(item => item.id === selectedRequirementId) ?? null
      const dockRecord = state === null ? null : dockSessionOf(selectedRequirement, state.currentUser)
      const dockSessionId = dockRecord?.sessionId ?? ''
      // 没加入这条需求的人没有会话坞；认领 / 加入之后它才出现。
      const dockJoined = state !== null && selectedRequirement !== null
        && requirementJoined(selectedRequirement, state.currentUser)
      const dockWidthRef = useRef(dockWidth)
      const dockDownAt = useRef(0)
      const projectMenuRef = useRef(null)
      const iterationSearchRef = useRef(null)

      useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
      }, [])

      // Cmd/Ctrl+K 聚焦迭代搜索：列表页最常用的「找东西」快捷键。
      useEffect(() => {
        const onKey = (event) => {
          if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
            event.preventDefault()
            setView('iterations')
            requestAnimationFrame(() => iterationSearchRef.current?.focus())
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])

      // 项目下拉：点外面或按 Esc 收起，不用额外铺一层遮罩挡住页面。
      useEffect(() => {
        if (!projectMenuOpen) return undefined
        const onPointerDown = (event) => {
          if (projectMenuRef.current !== null && !projectMenuRef.current.contains(event.target)) {
            setProjectMenuOpen(false)
          }
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setProjectMenuOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [projectMenuOpen])

      // DSH 侧栏收起后，插件会贴到窗口左上角；macOS 的红绿灯会盖住项目入口。
      // 以插件根节点的左边界判断是否贴边，只有桌面端才让出这一块。
      useEffect(() => {
        if (shellNode === null) return undefined
        const measure = () => {
          const left = shellNode.getBoundingClientRect().left
          setFlushLeft(window.location.protocol === 'dsh-app:' && left < 40)
        }
        measure()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        observer?.observe(shellNode)
        window.addEventListener('resize', measure)
        return () => {
          observer?.disconnect()
          window.removeEventListener('resize', measure)
        }
      }, [shellNode])

      useEffect(() => { dockWidthRef.current = dockWidth }, [dockWidth])

      // 键盘调宽（坞在右侧，向左就是变宽）；Home / 双击都回到默认宽度。
      const stepDockWidth = useCallback((delta) => {
        const max = Math.min(DOCK_WIDTH_MAX, Math.round(window.innerWidth * 0.62))
        const next = Math.min(max, Math.max(DOCK_WIDTH_MIN, dockWidthRef.current + delta))
        dockWidthRef.current = next
        setDockWidth(next)
        try { window.localStorage.setItem(DOCK_WIDTH_KEY, String(next)) } catch (_) { /* 本地存储不可用 */ }
      }, [])

      const beginDockResize = useCallback((event) => {
        if (event.button !== undefined && event.button !== 0) return
        // 挡板会盖住第二次 mousedown，原生 dblclick 到不了手柄，双击复位得自己认。
        const now = Date.now()
        const double = now - dockDownAt.current < 350
        dockDownAt.current = now
        if (double) {
          setDockWidth(DOCK_WIDTH_DEFAULT)
          try { window.localStorage.setItem(DOCK_WIDTH_KEY, String(DOCK_WIDTH_DEFAULT)) } catch (_) { /* 本地存储不可用 */ }
          return
        }
        event.preventDefault()
        const pointerId = event.pointerId
        // 画布是 iframe：拖动一旦越过它，指针事件会被 iframe 的文档接走，
        // 父文档既收不到移动也收不到松开。拖动期间铺一层透明挡板，让
        // 指针始终落在父文档里；挡板同时阻止误点画布。
        const shield = document.createElement('div')
        shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:col-resize;background:transparent'
        document.body.appendChild(shield)
        try { shield.setPointerCapture?.(pointerId) } catch (_) { /* 无指针捕获也能靠挡板 */ }
        const startX = event.clientX
        const startWidth = dockWidthRef.current
        let latest = startWidth
        const maxWidth = () => Math.min(DOCK_WIDTH_MAX, Math.round(window.innerWidth * 0.62))
        const onMove = (moveEvent) => {
          latest = Math.min(maxWidth(), Math.max(DOCK_WIDTH_MIN, startWidth + (startX - moveEvent.clientX)))
          setDockWidth(latest)
        }
        const stop = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', stop)
          window.removeEventListener('pointercancel', stop)
          window.removeEventListener('blur', stop)
          try { shield.releasePointerCapture?.(pointerId) } catch (_) { /* 已释放 */ }
          shield.remove()
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
          try { window.localStorage.setItem(DOCK_WIDTH_KEY, String(latest)) } catch (_) { /* 本地存储不可用 */ }
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', stop)
        window.addEventListener('pointercancel', stop)
        window.addEventListener('blur', stop)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }, [])

      const resetDockWidth = useCallback(() => {
        setDockWidth(DOCK_WIDTH_DEFAULT)
        try { window.localStorage.setItem(DOCK_WIDTH_KEY, String(DOCK_WIDTH_DEFAULT)) } catch (_) { /* 本地存储不可用 */ }
      }, [])

      const showToast = useCallback((message, isError) => {
        publishCommandToast({ kind: isError ? 'error' : 'info', text: message })
      }, [])

      const openSession = useCallback((sessionId) => {
        if (typeof sessionId !== 'string' || sessionId === '') return
        // 需求页的会话常驻右侧坞：只把焦点还给坞，不切到 DSH 的会话工作区。
        const dock = document.querySelector('.dsh-wb-dock')
        if (dock !== null) {
          dock.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          const input = dock.querySelector('[data-composer-input="true"]')
          if (input instanceof HTMLElement) input.focus()
          return
        }
        try { ctx.uiWorkspace.openSession(sessionId) } catch (reason) { console.warn('[dsh-workbench] open session failed', reason) }
      }, [ctx])

      const openSessionFor = useCallback((requirement, kind) => {
        const findSession = type => (requirement.sessions ?? []).find(session => session.archived !== true && session.type === type && session.sessionId)?.sessionId
        const type = kind === 'design' || kind === 'test' || kind === 'dev' ? kind : 'requirement'
        openSession(findSession(type) ?? requirement.sessionId)
      }, [openSession])

      // 会话坞里的会话要等状态刷完才出现：加入后等坞挂上再把焦点交进去。
      // 这里只碰坞本身——找不到坞也不能切去 DSH 的会话工作区，否则会离开工作台。
      const pendingDockFocusRef = useRef(false)
      useEffect(() => {
        if (!pendingDockFocusRef.current || dockSessionId === '' || !dockJoined) return
        pendingDockFocusRef.current = false
        const dock = document.querySelector('.dsh-wb-dock')
        if (dock === null) return
        dock.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        const input = dock.querySelector('[data-composer-input="true"]')
        if (input instanceof HTMLElement) input.focus()
      }, [dockSessionId, dockJoined])

      // 加入需求：先认领设计 / 某个端，再准备好本人会话，最后把焦点交给右侧会话坞。
      const joinRequirement = useCallback(async (requirement, target) => {
        const type = target.kind === 'design' ? 'design' : target.kind === 'test' ? 'test' : 'dev'
        const claimed = target.kind === 'design'
          ? await api(`requirements/${encodeURIComponent(requirement.id)}/design-claim`, { method: 'POST', body: '{}' })
          : target.kind === 'test'
            ? await api(`requirements/${encodeURIComponent(requirement.id)}/test-claim`, { method: 'POST', body: '{}' })
            : await api(`requirements/${encodeURIComponent(requirement.id)}/dev-claim`, {
                method: 'POST',
                body: JSON.stringify({ platformId: target.platformId }),
              })
        const updated = claimed.requirement ?? requirement
        // 之前已经有一场本人同类型会话就直接复用，没有才新开一场。
        const existing = (requirement.sessions ?? []).find(session =>
          session.archived !== true && session.type === type && session.own === true
          && typeof session.sessionId === 'string' && session.sessionId !== '')
        let sessionId = existing?.sessionId ?? ''
        let sessionError = null
        try {
          if (sessionId === '') sessionId = (await createRequirementSession(ctx, state, updated, type)).sessionId
        } catch (reason) {
          sessionError = reason instanceof Error ? reason.message : String(reason)
        }
        // 认领已经成功：不管会话建没建好，卡片都要刷新出来；会话失败交给自动重试。
        pendingDockFocusRef.current = true
        await workbench.reload()
        const label = target.kind === 'design' ? '设计' : target.kind === 'test' ? '测试' : `开发 · ${platformName(state.platforms, target.platformId)}`
        if (sessionError !== null) {
          showToast(`已加入 ${requirement.code}，但${label}会话还没准备好：${sessionError}`, true)
          return
        }
        showToast(`已加入 ${requirement.code}，${label}会话已打开`, false)
      }, [ctx, state, workbench, showToast])

      const openRequirement = useCallback(async (requirementId) => {
        if (state === null) return
        const target = (state.requirements ?? []).find(item => item.id === requirementId)
        if (!target) { showToast('这条需求不在当前可见范围', true); return }
        try {
          if (state.iteration === null || target.iterationId !== state.iteration.id) {
            await api(`iterations/${encodeURIComponent(target.iterationId)}/select`, { method: 'POST', body: '{}' })
            await workbench.reload()
          }
          setSelectedRequirementId(requirementId)
          setWorkspaceView('requirement')
          // 点需求卡先进「需求总述」；画布只在点原型「打开」时覆盖上来。
          setCanvasOpen(false)
          setCanvasTarget(null)
          setView('requirement')
        } catch (reason) {
          showToast(reason instanceof Error ? reason.message : String(reason), true)
        }
      }, [state, showToast, workbench])

      const openIteration = useCallback(async (iterationId) => {
        if (state === null) return
        try {
          if (state.iteration === null || iterationId !== state.iteration.id) {
            await api(`iterations/${encodeURIComponent(iterationId)}/select`, { method: 'POST', body: '{}' })
            await workbench.reload()
          }
          setWorkspaceView('iteration')
          setCanvasOpen(false)
          setCanvasTarget(null)
          setView('iteration')
        } catch (reason) {
          showToast(reason instanceof Error ? reason.message : String(reason), true)
        }
      }, [state, showToast, workbench])

      const switchProject = useCallback(async (projectId) => {
        if (state === null) return
        setProjectMenuOpen(false)
        if (projectId === (state.project?.id ?? state.currentProjectId)) return
        const target = (state.projects ?? []).find(project => project.id === projectId)
        try {
          await api(`projects/${encodeURIComponent(projectId)}/select`, { method: 'POST', body: '{}' })
          // 切项目等于换一棵树：先离开详情页，再清掉选中需求、回到迭代列表。
          setView('iterations')
          setWorkspaceView('iterations')
          setSelectedRequirementId(null)
          setCanvasOpen(false)
          setCanvasTarget(null)
          await workbench.reload()
          showToast(`已切换到项目「${target?.name ?? projectId}」`, false)
        } catch (reason) {
          showToast(reason instanceof Error ? reason.message : String(reason), true)
        }
      }, [state, showToast, workbench])

      const handleProjectSubmitted = useCallback(async (project, editing) => {
        if (!editing) {
          // 新建项目后服务端已经把当前项目切过去：直接落到新项目的迭代列表。
          setView('iterations')
          setWorkspaceView('iterations')
          setSelectedRequirementId(null)
          setCanvasOpen(false)
          setCanvasTarget(null)
        }
        await workbench.reload()
      }, [workbench])

      const handleCreated = useCallback(async (requirement) => {
        setDialogOpen(false)
        setSelectedRequirementId(requirement.id)
        setWorkspaceView('requirement')
        setCanvasOpen(false)
        setCanvasTarget(null)
        await workbench.reload()
        setView('requirement')
      }, [workbench])

      const retryCreate = useCallback(async (requirement) => {
        setRetrying(requirement.id)
        try {
          const done = await finishRequirementCreation(ctx, requirement, state)
          showToast(`${done.requirement.code} 已创建`, false)
          await workbench.reload()
        } catch (reason) {
          await markCreationFailed(requirement, reason)
          showToast(reason instanceof Error ? reason.message : String(reason), true)
          await workbench.reload()
        } finally {
          setRetrying('')
        }
      }, [ctx, state, showToast, workbench])

      // 进入需求页不再让用户手动建会话：本人还没有会话时，按当前身份直接开一场。
      useEffect(() => {
        if (view !== 'requirement' || selectedRequirement === null || state === null) return undefined
        if (dockSessionId !== '') {
          // 已经开好会话：清掉上一次的 key，之后会话被归档/替换时还能再自动开一场。
          autoSessionKeyRef.current = ''
          setAutoSession(current => current.status === 'idle' ? current : { status: 'idle', error: '' })
          return undefined
        }
        if (selectedRequirement.status === 'creating' || selectedRequirement.status === 'create_failed') return undefined
        // 不在卡片墙上的同事不预先开会话：先点「加入这条需求」认领，
        // 有了卡片之后再按身份准备会话；否则谁打开看一眼都会多出一场会话。
        if (!requirementJoined(selectedRequirement, state.currentUser)) {
          setAutoSession(current => current.status === 'idle' ? current : { status: 'idle', error: '' })
          return undefined
        }
        // 草稿还没发布：只有产品 / 负责人需要需求会话；设计、开发、测试等发布后再准备。
        const type = sessionTypeForRole(state.currentUser)
        const published = (selectedRequirement.versions ?? []).length > 0
        if (!published && type !== 'requirement') {
          setAutoSession(current => current.status === 'idle' ? current : { status: 'idle', error: '' })
          return undefined
        }
        const key = `${selectedRequirement.id}:${state.currentUser.id}`
        if (autoSessionKeyRef.current === key) return undefined
        autoSessionKeyRef.current = key
        setAutoSession({ status: 'creating', error: '' })
        const code = selectedRequirement.code
        createRequirementSession(ctx, state, selectedRequirement, type)
          .then(async () => {
            if (mountedRef.current) {
              setAutoSession({ status: 'idle', error: '' })
              showToast(`${code} 的${sessionTypeLabel(type)}会话已就绪`, false)
            }
            await workbench.reload()
          })
          .catch((reason) => {
            if (!mountedRef.current) return
            setAutoSession({ status: 'error', error: reason instanceof Error ? reason.message : String(reason) })
          })
        return undefined
      }, [view, selectedRequirement, state, dockSessionId, autoSessionTick, ctx, workbench, showToast])

      // 失败后允许手动重试；成功创建过（key 已记下）就不再自动重来，避免死循环。
      const retryAutoSession = useCallback(() => {
        autoSessionKeyRef.current = ''
        setAutoSession({ status: 'idle', error: '' })
        setAutoSessionTick(tick => tick + 1)
      }, [])

      const openPrototypeCanvas = useCallback((target) => {
        if (target === null || typeof target.path !== 'string' || target.path === '') return
        setCanvasKind('prototype')
        setCanvasOpen(true)
        setCanvasTarget(target)
        setView('requirement')
        setWorkspaceView('requirement')
      }, [])

      // 模型刚往需求目录里写出原型：自动打开原型画布，不用再点右上角的「打开原型画布」。
      // 第一次看到这条需求时只记下已有的文件（老需求不弹）；之后新出现的才弹。
      // 同一次停留里只自动弹一次：用户自己关掉画布后不再抢回来。
      const autoCanvas = useRef({ requirementId: '', opened: false, seen: new Set() })
      useEffect(() => {
        if (view !== 'requirement' || selectedRequirement === null || state === null) return
        if (selectedRequirement.ownerId !== state.currentUser.id) return
        const folder = String(selectedRequirement.folderPath ?? '').replace(/\/+$/, '')
        const artifacts = (selectedRequirement.artifacts ?? []).filter(artifact =>
          artifact.kind === 'prototype'
          && typeof artifact.name === 'string'
          && /\.html?$/i.test(artifact.name))
        const track = autoCanvas.current
        if (track.requirementId !== selectedRequirement.id) {
          autoCanvas.current = {
            requirementId: selectedRequirement.id,
            opened: false,
            seen: new Set(artifacts.map(artifact => artifact.id)),
          }
          return
        }
        const fresh = artifacts.filter(artifact => !track.seen.has(artifact.id))
        if (fresh.length === 0) return
        for (const artifact of fresh) track.seen.add(artifact.id)
        if (track.opened || canvasOpen || folder === '') return
        const first = fresh[0]
        track.opened = true
        openPrototypeCanvas({ path: `${folder}/${first.name.replace(/^\/+/, '')}`, name: first.name })
      }, [view, selectedRequirement, state, canvasOpen, openPrototypeCanvas])

      // 设计卡片的工作面：设计画布。打开到具体设计稿或画布首页都走这里。
      // 画布开始页（或会话里）点开一个作品：切到那条需求的需求页，画布收回。
      const openWorkInside = useCallback((work) => {
        if (typeof work?.id !== 'string' || work.id === '') return
        setSelectedRequirementId(work.id)
        setCanvasOpen(false)
        setCanvasTarget(null)
        setView('requirement')
        setWorkspaceView('requirement')
      }, [])

      const openDesignCanvas = useCallback((target) => {
        setCanvasKind('design')
        setCanvasOpen(true)
        setCanvasTarget(target !== null && typeof target?.path === 'string' && target.path !== '' ? target : null)
        setView('requirement')
        setWorkspaceView('requirement')
      }, [])

      // 设计师刚在 design/ 里写出第一版：像原型一样自动打开设计画布。
      // 第一次看到这条需求只记下已有文件；之后新出现的才弹，同一次停留只弹一次。
      const autoDesignCanvas = useRef({ requirementId: '', opened: false, seen: new Set() })
      useEffect(() => {
        if (view !== 'requirement' || selectedRequirement === null || state === null) return
        if (selectedRequirement.designerId !== state.currentUser.id) return
        if (selectedRequirement.designStatus === 'not_needed') return
        const files = Array.isArray(selectedRequirement.designFiles) ? selectedRequirement.designFiles : []
        const keyOf = file => file.relativePath ?? file.path ?? file.name
        const track = autoDesignCanvas.current
        if (track.requirementId !== selectedRequirement.id) {
          autoDesignCanvas.current = {
            requirementId: selectedRequirement.id,
            opened: false,
            seen: new Set(files.map(keyOf)),
          }
          return
        }
        const fresh = files.filter(file => !track.seen.has(keyOf(file)))
        if (fresh.length === 0) return
        for (const file of fresh) track.seen.add(keyOf(file))
        // 画布已经开着别抢；只有还停在占位页时才切到真实设计稿。
        const placeholder = /(^|[\\/])_canvas\.html$/i.test(String(canvasTarget?.path ?? ''))
        if (track.opened || (canvasOpen && !placeholder)) return
        const first = fresh.find(file => typeof file.path === 'string' && file.path !== '')
        if (first === undefined) return
        track.opened = true
        openDesignCanvas({ path: first.path, name: first.name ?? first.relativePath ?? '设计稿' })
      }, [view, selectedRequirement, state, canvasOpen, canvasTarget, openDesignCanvas])

      // 删除设计后画布里的稿子已经不存在了：收起画布，并让下一轮设计还能自动打开。
      const resetDesign = useCallback(async (requirement) => {
        const body = await api(`requirements/${encodeURIComponent(requirement.id)}/design-reset`, {
          method: 'POST',
          body: '{}',
        })
        autoDesignCanvas.current = { requirementId: '', opened: false, seen: new Set() }
        setCanvasOpen(false)
        setCanvasTarget(null)
        await workbench.reload()
        const warnings = Array.isArray(body?.warnings) ? body.warnings : []
        showToast(
          warnings.length > 0
            ? `${requirement.code} 设计已删除，但本机文件没清干净：${warnings.join('；')}`
            : `${requirement.code} 设计已删除，可以重新认领`,
          warnings.length > 0,
        )
      }, [workbench, showToast])

      // 面包屑层级：迭代列表 → 迭代详情 → 需求总述 → 画布。
      const goIterationList = useCallback(() => {
        setView('iterations')
        setWorkspaceView('iterations')
        setCanvasOpen(false)
        setCanvasTarget(null)
      }, [])

      const goIterationDetail = useCallback(() => {
        setView('iteration')
        setWorkspaceView('iteration')
        setCanvasOpen(false)
        setCanvasTarget(null)
      }, [])

      const goRequirement = useCallback(() => {
        setView('requirement')
        setWorkspaceView('requirement')
        setCanvasOpen(false)
        setCanvasTarget(null)
      }, [])

      // 画布「版本」面板里点了提交定格的版本：关掉画布，回需求页把原型卡切到那一版。
      // 定格的原型在服务端附件里，只能在需求卡上看（只读），画布里看的是本机正在改的文件。
      const openRequirementVersion = useCallback((version) => {
        setCanvasOpen(false)
        setCanvasTarget(null)
        setView('requirement')
        setWorkspaceView('requirement')
        setPrototypeVersionFocus({ version: Number(version) })
      }, [])

      if (workbench.loading && state === null) {
        return h('div', { className: 'dsh-wb-design' },
          h('div', { className: 'shell' },
            h('div', { className: 'scroll' },
              h('div', { className: 'page' },
                h('div', { className: 'empty-page' },
                  h(DesignIcon, { name: 'refresh', size: 28 }),
                  h('b', null, '正在读取工作台'),
                  h('span', null, '正在同步迭代、需求与通知。'),
                ),
              ),
            ),
          ),
        )
      }

      if (state === null) {
        return h('div', { className: 'dsh-wb-design' },
          h('div', { className: 'shell' },
            h('div', { className: 'scroll' },
              h('div', { className: 'page' },
                h('div', { className: 'empty-page' },
                  h(DesignIcon, { name: 'alert', size: 28, style: { color: 'var(--red)' } }),
                  h('b', null, '工作台没有加载出来'),
                  h('span', null, workbench.error ?? '请检查插件服务是否启动'),
                  h('button', { className: 'btn btn-primary', type: 'button', style: { marginTop: '6px' }, onClick: () => { void workbench.reload() } }, '重试'),
                ),
              ),
            ),
          ),
        )
      }

      // 导航是 项目 → 迭代 → 需求：当前项目下没有迭代时 state.iteration 为空，页面仍要能正常渲染。
      const currentProject = state.project ?? (state.projects ?? []).find(project => project.id === state.currentProjectId) ?? null
      const activeIteration = state.iteration ?? null
      const requirements = activeIteration === null
        ? []
        : state.requirements.filter(item => item.iterationId === activeIteration.id)
      const projectIterationCount = (projectId) => (state.iterations ?? [])
        .filter(iteration => iteration.projectId === projectId && iteration.archived !== true).length
      // 新建迭代是负责人/管理员的动作；新建需求是产品/管理员的动作。
      // 负责人只做评审、排期、指派和封板，不再显示「新建需求」。
      const roles = state.currentUser.roles ?? []
      const canCreateIteration = roles.includes('lead') || roles.includes('admin')
      const canCreateRequirement = roles.includes('product') || roles.includes('admin')
      const canConfig = canCreateIteration
      // 右侧会话坞常驻；卡片的工作面在中间打开：产品是原型画布，设计是设计画布。
      // 没有自己的会话时借用对应会话承载画布，不是负责人/设计负责人一律只读。
      const designSessionId = (selectedRequirement?.sessions ?? [])
        .find(session => session.archived !== true
          && session.type === 'design' && typeof session.sessionId === 'string' && session.sessionId !== '')?.sessionId ?? ''
      // 设计会话在别人机器上时 sessionId 为空，借用当前用户的会话来承载只读画布。
      const canvasSid = canvasKind === 'design'
        ? (designSessionId !== ''
            ? designSessionId
            : (dockSessionId !== '' ? dockSessionId : (selectedRequirement?.sessionId ?? '')))
        : (dockSessionId !== '' ? dockSessionId : (selectedRequirement?.sessionId ?? ''))
      const canvasEditable = selectedRequirement !== null
        && state.currentUser.id === (canvasKind === 'design' ? selectedRequirement.designerId : selectedRequirement.ownerId)
      const stageActive = view === 'requirement' && selectedRequirement !== null && canvasOpen
        && (canvasKind === 'design' || canvasTarget !== null)
      const unreadNotifications = state.unreadNotificationCount
        ?? (Array.isArray(state.notifications) ? state.notifications : []).filter(item => item.read !== true).length
      const homeCrumb = { key: 'list', label: '首页', onClick: goIterationList }
      const iterationCrumbs = [
        homeCrumb,
        activeIteration === null
          ? { key: 'iter', label: '迭代未选择' }
          : { key: 'iter', label: activeIteration.code, mono: true },
      ]
      const requirementCrumbs = [
        homeCrumb,
        activeIteration === null
          ? { key: 'iter', label: '迭代未归属' }
          : { key: 'iter', label: activeIteration.code, mono: true, onClick: goIterationDetail },
        {
          key: 'req',
          label: selectedRequirement?.code ?? '需求',
          mono: true,
          onClick: stageActive ? goRequirement : undefined,
        },
      ]
      if (stageActive) {
        requirementCrumbs.push({ key: 'canvas', label: canvasKind === 'design' ? '设计' : '原型' })
      }
      // 顶层页也带上「首页」这一层，顶栏的面包屑在任何页面都能点回去。
      const sectionCrumbs = {
        my: { key: 'my', label: '我的工作台' },
        skills: { key: 'skills', label: '技能' },
        settings: { key: 'settings', label: '设置' },
        notifications: { key: 'notifications', label: '通知' },
      }
      const currentCrumbs = view === 'iteration'
        ? iterationCrumbs
        : view === 'requirement'
          ? requirementCrumbs
          : view === 'iterations'
            ? [homeCrumb]
            : [homeCrumb, sectionCrumbs[view] ?? homeCrumb]
      const requirementMain = selectedRequirement === null
        ? h('div', { className: 'page' },
            h('div', { className: 'empty-page' }, h(DesignIcon, { name: 'inbox', size: 28 }), h('b', null, '需求已不在当前迭代'), h('span', null, '回到首页重新选择。')))
        : h(RequirementPageView, {
            ctx,
            state,
            requirement: selectedRequirement,
            onOpenPrototype: openPrototypeCanvas,
            onOpenDesignCanvas: openDesignCanvas,
            onJoinRequirement: joinRequirement,
            onResetDesign: resetDesign,
            prototypeVersionFocus,
            onPrototypeVersionFocusDone: () => setPrototypeVersionFocus(null),
          })

      return h('div', { className: `dsh-wb-design${flushLeft ? ' is-flush-left' : ''}`, ref: setShellNode },
        h('div', { className: 'shell' },
          workbench.error
            ? h('div', { className: 'dsh-wb-offline-bar', role: 'status' },
                h('span', null, `与服务器连接中断，正在自动重连…（${workbench.error}）`),
                h('button', { type: 'button', className: 'dsh-wb-btn', onClick: () => { void workbench.reload() } }, '立即重连'))
            : null,
          h('header', { className: 'topbar' },
            h('div', { className: 'dsh-wb-drawer-toggles' },
              h('button', {
                type: 'button',
                className: 'dsh-wb-drawer-btn',
                title: '迭代与需求',
                'aria-label': '展开迭代与需求',
                onClick: (event) => event.currentTarget.closest('.dsh-wb-design')?.classList.toggle('drawer-left-open'),
              }, h(DesignIcon, { name: 'iter' })),
              h('button', {
                type: 'button',
                className: 'dsh-wb-drawer-btn',
                title: '详情与对话',
                'aria-label': '展开详情与对话',
                onClick: (event) => event.currentTarget.closest('.dsh-wb-design')?.classList.toggle('drawer-right-open'),
              }, h(DesignIcon, { name: 'inbox' })),
            ),
            h('div', { className: 'plugnac' },
              h('div', { className: 'plugnac-project', ref: projectMenuRef },
                h('button', {
                  className: `plugnac-title plugnac-project-btn${projectMenuOpen ? ' is-open' : ''}`,
                  type: 'button',
                  title: '切换项目',
                  'aria-haspopup': 'menu',
                  'aria-expanded': projectMenuOpen,
                  onClick: () => setProjectMenuOpen(value => !value),
                },
                  h(DesignIcon, { name: 'folder' }),
                  h('span', { className: 'plugnac-project-name' }, currentProject?.name ?? '未选择项目'),
                  h(DesignIcon, { name: 'chev-down', className: 'chev' }),
                ),
                projectMenuOpen
                  ? h('div', { className: 'dsh-wb-project-menu', role: 'menu', 'aria-label': '切换项目' },
                      h('div', { className: 'dsh-wb-project-menu-head' },
                        h('span', null, '项目'),
                        h('span', null, `共 ${(state.projects ?? []).length} 个`),
                      ),
                      (state.projects ?? []).length === 0
                        ? h('div', { className: 'dsh-wb-project-menu-empty' }, '还没有项目')
                        : (state.projects ?? []).map(project => h('button', {
                            key: project.id,
                            className: `dsh-wb-project-item${project.id === state.currentProjectId ? ' is-current' : ''}`,
                            type: 'button',
                            role: 'menuitemradio',
                            'aria-checked': project.id === state.currentProjectId,
                            onClick: () => { void switchProject(project.id) },
                          },
                            h('span', { className: 'dsh-wb-project-check' },
                              project.id === state.currentProjectId ? h(DesignIcon, { name: 'check' }) : null),
                            h('span', { className: 'dsh-wb-project-label' }, project.name),
                            h('span', { className: 'dsh-wb-project-count' }, `${projectIterationCount(project.id)} 个迭代`),
                          )),
                      canCreateIteration ? h('div', { className: 'dsh-wb-project-menu-sep' }) : null,
                      canCreateIteration
                        ? h('button', {
                            className: 'dsh-wb-project-action',
                            type: 'button',
                            onClick: () => { setProjectMenuOpen(false); setProjectDialog({ project: null }) },
                          }, h(DesignIcon, { name: 'plus' }), '新建项目')
                        : null,
                      canCreateIteration && currentProject
                        ? h('button', {
                            className: 'dsh-wb-project-action',
                            type: 'button',
                            onClick: () => { setProjectMenuOpen(false); setProjectDialog({ project: currentProject }) },
                          }, h(DesignIcon, { name: 'settings' }), '重命名当前项目')
                        : null,
                    )
                  : null,
              ),
              h('span', { className: 'plugnac-sep' }),
              h(Breadcrumbs, { items: currentCrumbs }),
            ),
            h('div', { className: 'spacer' }),
            view === 'iterations'
              ? h('div', { className: 'search', style: { width: '220px' } },
                  h(DesignIcon, { name: 'search' }),
                  h('input', {
                    ref: iterationSearchRef,
                    value: iterationQuery,
                    placeholder: '搜索迭代 (⌘K)',
                    'aria-label': '搜索迭代',
                    onChange: event => setIterationQuery(event.target.value),
                  }),
                )
              : null,
            h('button', {
              className: 'dsh-wb-iconbtn',
              type: 'button',
              title: '设置',
              'aria-label': '设置',
              onClick: () => setView('settings'),
            }, h(DesignIcon, { name: 'settings' })),
            h('button', {
              className: 'dsh-wb-iconbtn',
              type: 'button',
              title: unreadNotifications > 0 ? `${unreadNotifications} 条未读通知` : '通知',
              'aria-label': unreadNotifications > 0 ? `通知，${unreadNotifications} 条未读` : '通知',
              onClick: () => setView('notifications'),
            },
              h(BellIcon),
              unreadNotifications > 0 ? h('span', { className: 'dsh-wb-bell-badge' }, unreadNotifications > 99 ? '99+' : String(unreadNotifications)) : null,
            ),
            // 身份只做展示；设置只有一个入口（上面的齿轮），不再让头像也打开同一页。
            h('span', { className: 'dsh-wb-identity' },
              h(Avatar, { name: state.currentUser.name }),
              roleLabel(state.currentUser.activeRole),
              auth.provider === 'mock' ? h('span', { className: 'badge badge--mock' }, 'MOCK') : null,
            ),
          ),
          h('div', { className: 'dsh-wb-shell-body' },
            h('div', { className: stageActive ? 'scroll is-stage' : 'scroll' },
            workbench.error !== null && workbench.error !== ''
              ? h('div', { className: 'page', style: { paddingBottom: 0 } },
                  h('div', { className: 'banner banner--mock' }, h(DesignIcon, { name: 'alert' }), h('span', null, workbench.error)),
                )
              : null,
            stageActive
              ? h('div', { className: 'dsh-wb-stage' },
                  h('div', { className: 'dsh-wb-stage-body' },
                    canvasSid === ''
                      ? h('div', { className: 'dsh-wb-design-msg' },
                          h('b', null, canvasKind === 'design' ? '还没有设计会话' : '还没有可用的会话'),
                          canvasKind === 'design'
                            ? '设计先在设计会话里开始，画布会显示这一版的设计稿。'
                            : '右侧先创建你的会话，再打开原型画布。')
                      : h(DesignStudioCanvas, {
                          sid: canvasSid,
                          ctx,
                          targetPath: canvasTarget?.path ?? '',
                          kind: canvasKind,
                          currentWorkId: selectedRequirement.id,
                          // 产品负责人可编辑原型；设计负责人可编辑设计画布，其他人只读。
                          readOnly: !canvasEditable,
                          // 画布「版本」面板里同时列出需求提交时定格的原型版本：
                          // 本机快照是每轮对话的过程稿，提交版本才是需求卡上的 v1、v2。
                          requirementVersions: canvasKind === 'prototype'
                            ? (Array.isArray(selectedRequirement.prototypeVersions) ? selectedRequirement.prototypeVersions : [])
                            : [],
                          onOpenRequirementVersion: openRequirementVersion,
                          onOpenWork: openWorkInside,
                        }),
                  ),
                )
              : view === 'iterations'
              ? h(IterationListView, {
                  state,
                  query: iterationQuery,
                  onQuery: setIterationQuery,
                  filter: iterationFilter,
                  onFilter: setIterationFilter,
                  onOpen: (id) => { void openIteration(id) },
                  onCreate: () => setIterationOpen(true),
                  onOpenMy: () => setView('my'),
                  onOpenSkills: () => { setView('skills') },
                  canCreate: canCreateIteration && currentProject !== null,
                  hasProject: currentProject !== null,
                })
              : view === 'iteration'
                ? activeIteration === null
                  ? h('div', { className: 'page' },
                      h('div', { className: 'empty-page' },
                        h(DesignIcon, { name: 'iter', size: 28 }),
                        h('b', null, currentProject === null ? '还没有项目' : '这个项目还没有迭代'),
                        h('span', null, currentProject === null
                          ? '先在左上角项目菜单新建项目。'
                          : canCreateIteration ? '点上方项目菜单回到首页，再新建迭代。' : '等负责人创建迭代后再来。'),
                      ))
                  : h(IterationDetailView, {
                    state,
                    requirements,
                    onCreateRequirement: () => setDialogOpen(true),
                    onOpenSettings: () => setIterationManageOpen(true),
                    canCreate: canCreateRequirement,
                    canConfig,
                    onOpenRequirement: (id) => { void openRequirement(id) },
                    onOpenSession: (sessionId) => openSession(sessionId),
                    onOpenDesign: (requirement) => openSessionFor(requirement, 'design'),
                    onReload: () => { void workbench.reload() },
                    onToast: showToast,
                  })
                : view === 'requirement'
                  ? requirementMain
                  : view === 'my'
                    ? h(MyWorkbenchView, {
                        state,
                        filter: myFilter,
                        onFilter: setMyFilter,
                        onOpenRequirement: (id) => { void openRequirement(id) },
                        onOpenSession: (sessionId) => openSession(sessionId),
                        onOpenDesign: (requirement) => openSessionFor(requirement, 'design'),
                      })
                    : view === 'settings'
                      ? h(SettingsPage, {
                          auth,
                          state,
                          onReload: workbench.reload,
                          onToast: showToast,
                          onOpenPlatform: () => setPlatformOpen(true),
                          onOpenAdmin: () => setAdminOpen(true),
                        })
                      : view === 'skills'
                        ? h(SkillLibraryPage, {
                            state,
                            onReload: workbench.reload,
                            onToast: showToast,
                          })
                        : h(NotificationsView, {
                            state,
                            onOpenRequirement: (id) => { void openRequirement(id) },
                            onReload: workbench.reload,
                            onToast: showToast,
                          }),
            ),
            // 会话坞只属于这条需求上的参与者；认领后才会出现，没加入的人看到整页卡片墙。
            view === 'requirement' && dockJoined
              ? h(SessionDock, {
                  ctx,
                  kit,
                  state,
                  requirement: selectedRequirement,
                  creating: autoSession.status === 'creating',
                  createError: autoSession.error,
                  waitingForPublish: (selectedRequirement.versions ?? []).length === 0
                    && sessionTypeForRole(state.currentUser) !== 'requirement',
                  onRetry: retryAutoSession,
                  width: dockWidth,
                  onResizeStart: beginDockResize,
                  onResizeReset: resetDockWidth,
                  onResizeStep: stepDockWidth,
                })
              : null,
          ),
        ),
        dialogOpen ? h(CreateRequirementDialog, {
          ctx,
          state,
          onClose: () => setDialogOpen(false),
          onCreated: handleCreated,
          onToast: showToast,
        }) : null,
        projectDialog !== null ? h(ProjectDialog, {
          project: projectDialog.project,
          onClose: () => setProjectDialog(null),
          onSubmit: (project, editing) => { void handleProjectSubmitted(project, editing) },
          onToast: showToast,
        }) : null,
        iterationOpen ? h(CreateIterationDialog, {
          state,
          onClose: () => setIterationOpen(false),
          onReload: workbench.reload,
          onToast: showToast,
        }) : null,
        iterationManageOpen ? h(IterationManageDialog, {
          state,
          onClose: () => setIterationManageOpen(false),
          onReload: workbench.reload,
          onToast: showToast,
        }) : null,
        platformOpen ? h(PlatformConfigDialog, {
          state,
          onClose: () => setPlatformOpen(false),
          onReload: workbench.reload,
          onToast: showToast,
        }) : null,
        adminOpen ? h(AdminDialog, {
          state,
          onClose: () => setAdminOpen(false),
          onReload: workbench.reload,
          onToast: showToast,
        }) : null,
      )
    }

    // ---------------------------------------------------------------------
    // Right sidebar tab
    // ---------------------------------------------------------------------

