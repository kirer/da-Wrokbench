/**
 * dsh-workbench POC — browser half.
 *
 * Registers one left sidebar entry + main panel: 研发工作台.
 * The requirement itself opens as a full-width canvas (prototype / design), with the
 * person's session docked beside it; there is no separate requirement side panel.
 *
 * The visual language follows the DSH workbench canvas: DSW alias tokens, compact
 * rows, 6–8 px radii, monospace codes.
 */

window.__ModuleLoader__.load({
  id: 'dsh-workbench',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    let react = null
    try { react = require('react') } catch (_) { react = null }

    const INJECT = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace', 'layout', 'conversation']
    if (!react) {
      exports.apply = () => {}
      exports.inject = INJECT
      return module.exports
    }

    const h = react.createElement
    const { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } = react
    // 主面板注册时声明了会话作用域的子插槽；宿主把 SessionProvider / renderSlot
    // 作为标准 props 传给组件，这里用 context 带给页面深处，避免逐层透传。
    const SlotKit = react.createContext(null)

    const PANEL_ID = 'workbench'
    const API = '/dsh-workbench/api/'
    // 桌面端 dsh-app://app 下 Cookie 可能不持久，登录时把 token 存进 localStorage，
    // 之后所有请求带 Authorization: Bearer，服务端两者都接受。
    // 网页端（http/https）优先用 Cookie，token 只放内存不落 localStorage，降低 XSS 窃取风险。
    const TOKEN_KEY = 'dshWorkbenchAuthToken'
    const PERSIST_TOKEN = (() => {
      try { return window.location.protocol === 'dsh-app:' } catch (_) { return false }
    })()
    let inMemoryToken = ''
    function readToken() {
      if (inMemoryToken !== '') return inMemoryToken
      if (!PERSIST_TOKEN) return ''
      try { return String(window.localStorage.getItem(TOKEN_KEY) || '') } catch (_) { return '' }
    }
    function writeToken(token) {
      inMemoryToken = typeof token === 'string' ? token : ''
      try {
        if (!PERSIST_TOKEN) {
          // 网页端：清掉可能残留的旧持久化 token。
          if (window.localStorage.getItem(TOKEN_KEY) !== null) window.localStorage.removeItem(TOKEN_KEY)
          return
        }
        if (inMemoryToken !== '') window.localStorage.setItem(TOKEN_KEY, inMemoryToken)
        else window.localStorage.removeItem(TOKEN_KEY)
      } catch (_) { /* 无 localStorage 时退回 Cookie */ }
    }
    const DS_API = '/dsh-workbench/canvas/'

    // 设计稿 `design/` 是唯一视觉基准：tokens + app.css + 页面内联样式，作用域收在 .dsh-wb-design 内。
/*__DESIGN_CSS__*/
/*__DESIGN_LOGIN_CSS__*/

/*__DESIGN_ICONS__*/

/*__MD_ICONS__*/
    // 内嵌的 设计画布按 package-local chunk 懒加载；加载完再渲染右栏 tab。
    let designStudioState = { runtime: null, error: null }
    const designStudioListeners = new Set()
    let designStudioRetry = null

    function publishDesignStudio(next) {
      designStudioState = next
      for (const listener of [...designStudioListeners]) listener()
    }

    function useDesignStudio() {
      const [snapshot, setSnapshot] = useState(designStudioState)
      useEffect(() => {
        const listener = () => setSnapshot(designStudioState)
        designStudioListeners.add(listener)
        listener()
        return () => { designStudioListeners.delete(listener) }
      }, [])
      return snapshot
    }

    // 画布的「选择 / 改字 / 样式 / 画笔」要把结果放进对话输入框。输入门面由 DSH
    // 以 inputActions 的形式发给会话作用域的插槽，这里在开场白那个插槽里按会话记一份，
    // 画布从工作台中间打开时照样拿得到；会话关掉就撤掉。
    const sessionInputActions = new Map()

    function useSessionInputActions(sid, inputActions) {
      useEffect(() => {
        if (typeof sid !== 'string' || sid === '' || inputActions === undefined || inputActions === null) return undefined
        sessionInputActions.set(sid, inputActions)
        return () => {
          if (sessionInputActions.get(sid) === inputActions) sessionInputActions.delete(sid)
        }
      }, [sid, inputActions])
    }

    // 画布要的是「拿一下光标位置、插一段字」的同步门面；没收到真正的 inputActions 前
    // 退回复制，收到之后每次都现取，不把旧会话的门面带过去。
    function inputActionsFor(sid) {
      if (typeof sid !== 'string' || sid === '') return undefined
      return {
        captureInsertion: () => {
          const target = sessionInputActions.get(sid)
          return target && typeof target.captureInsertion === 'function' ? target.captureInsertion() : undefined
        },
        insertText: (text, span) => {
          const target = sessionInputActions.get(sid)
          if (!target || typeof target.insertText !== 'function' || span === undefined) return false
          return target.insertText(text, span)
        },
      }
    }

    // 统一的全局提示队列：斜杠命令结果、页面操作反馈都走这一套，避免多套提示风格/位置。
    let commandToastSeq = 0
    let toastQueue = []
    const toastListeners = new Set()
    function notifyToasts() { for (const listener of [...toastListeners]) listener() }
    function pushToast(next) {
      const item = {
        seq: ++commandToastSeq,
        kind: next.kind || 'info',
        name: next.name || '',
        text: next.text || '',
        detail: next.detail || '',
      }
      toastQueue = [...toastQueue, item].slice(-6)
      notifyToasts()
      if (item.kind !== 'error') {
        setTimeout(() => {
          toastQueue = toastQueue.filter(entry => entry.seq !== item.seq)
          notifyToasts()
        }, 6000)
      }
      return item
    }
    function publishCommandToast(next) { return pushToast(next) }
    function dismissToast(seq) { toastQueue = toastQueue.filter(entry => entry.seq !== seq); notifyToasts() }
    function useToasts() {
      const [snapshot, setSnapshot] = useState(toastQueue)
      useEffect(() => {
        const listener = () => setSnapshot(toastQueue)
        toastListeners.add(listener)
        listener()
        return () => { toastListeners.delete(listener) }
      }, [])
      return snapshot
    }

    const REQ_STATUS = {
      creating: { label: '创建中', tone: 'idle', glyph: '◌' },
      draft: { label: '草稿', tone: 'idle', glyph: '○' },
      create_failed: { label: '创建失败', tone: 'error', glyph: '!' },
      pending_review: { label: '待评审', tone: 'warn', glyph: '◷' },
      changes_requested: { label: '待修改', tone: 'error', glyph: '!' },
      approved: { label: '已通过', tone: 'success', glyph: '✓' },
      scheduled: { label: '已排期', tone: 'business', glyph: '◐' },
      backlog: { label: '已暂缓', tone: 'idle', glyph: '○' },
      in_progress: { label: '开发中', tone: 'business', glyph: '◐' },
      dev_done: { label: '待测试', tone: 'business', glyph: '◇' },
      testing: { label: '测试中', tone: 'business', glyph: '◑' },
      test_failed: { label: '测试不通过', tone: 'error', glyph: '!' },
      test_passed: { label: '测试通过', tone: 'success', glyph: '✓' },
      frozen: { label: '已冻结', tone: 'warn', glyph: '❄' },
      released: { label: '已发布', tone: 'success', glyph: '▲' },
      done: { label: '已完成', tone: 'success', glyph: '✓' },
      cancelled: { label: '已取消', tone: 'idle', glyph: '⊘' },
    }

    const DESIGN_STATUS = {
      not_needed: { label: '无需设计', tone: 'idle', glyph: '—' },
      unclaimed: { label: '设计待认领', tone: 'warn', glyph: '◇' },
      designing: { label: '设计中', tone: 'business', glyph: '◐' },
      delivered: { label: '设计已交付', tone: 'success', glyph: '✓' },
      changes_requested: { label: '设计待修改', tone: 'error', glyph: '!' },
    }

    const ROLE_LABELS = {
      lead: '负责人',
      product: '产品',
      design: '设计',
      dev: '开发',
      qa: '测试',
      admin: '管理员',
    }

    function roleLabel(role) {
      return ROLE_LABELS[role] || role || '未设置'
    }

    function roleText(user) {
      const roles = Array.isArray(user?.roles) ? user.roles : []
      return roles.length === 0 ? '未分配身份' : roles.map(roleLabel).join(' / ')
    }

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------

/*__CSS__*/

    function ensureStyles() {
      if (typeof document === 'undefined') return
      // 插件热更新时旧的 style 标签会留在页面里；直接复用并覆盖内容，
      // 否则新加的样式永远不生效，界面看起来像“改了但没改”。
      let style = document.querySelector('style[data-dsh-workbench]')
      if (style === null) {
        style = document.createElement('style')
        style.dataset.dshWorkbench = '1'
        document.head.appendChild(style)
      }
      const text = CSS + '\n' + DESIGN_CSS + '\n' + DESIGN_LOGIN_CSS
      if (style.textContent !== text) style.textContent = text
    }

/*__DATA__*/
/*__HELPERS__*/
    // ---------------------------------------------------------------------
    // Main panel
    // ---------------------------------------------------------------------

    let modalSeq = 0

    function useModalBehavior(onClose, canClose = true) {
      const dialogRef = useRef(null)
      const titleId = useRef(`dsh-wb-modal-title-${++modalSeq}`).current
      const closeRef = useRef(onClose)
      const canCloseRef = useRef(canClose)
      closeRef.current = onClose
      canCloseRef.current = canClose

      useEffect(() => {
        const dialog = dialogRef.current
        if (dialog === null) return undefined
        const previous = document.activeElement
        const focusables = () => Array.from(dialog.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter(element => element.getClientRects().length > 0)
        const focusTimer = setTimeout(() => {
          if (dialog.contains(document.activeElement) && document.activeElement !== document.body) return
          const target = dialog.querySelector('[data-autofocus]') ?? focusables()[0] ?? dialog
          target.focus()
        }, 0)
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            if (canCloseRef.current) {
              event.preventDefault()
              event.stopPropagation()
              closeRef.current?.()
            }
            return
          }
          if (event.key !== 'Tab') return
          const items = focusables()
          if (items.length === 0) {
            event.preventDefault()
            dialog.focus()
            return
          }
          const first = items[0]
          const last = items[items.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
          clearTimeout(focusTimer)
          document.removeEventListener('keydown', onKeyDown, true)
          document.body.style.overflow = previousOverflow
          if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus()
        }
      }, [])

      return {
        titleId,
        overlayProps: {
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && canCloseRef.current) closeRef.current?.()
          },
        },
        dialogProps: {
          ref: dialogRef,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': titleId,
          tabIndex: -1,
        },
      }
    }

    function ConfirmDialog({ title, children, confirmLabel = '确认', busy = false, onConfirm, onClose }) {
      const modal = useModalBehavior(onClose, !busy)
      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog dsh-wb-confirm-dialog', ...modal.dialogProps },
          h('h2', { id: modal.titleId }, title),
          h('div', { className: 'dsh-wb-confirm-body' }, children),
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: onClose }, '取消'),
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy, onClick: onConfirm }, busy ? '处理中…' : confirmLabel),
          ),
        ),
      )
    }

/*__DIALOGS__*/
    function activePlatformGroups(platformGroups, platforms) {
      return [...platformGroups]
        .filter(group => group.active !== false)
        .sort((a, b) => a.order - b.order)
        .map(group => ({
          group,
          items: platforms
            .filter(platform => platform.groupId === group.id && platform.active !== false)
            .sort((a, b) => a.order - b.order),
        }))
    }

    function defaultProfilePlatformIds(user, groups) {
      const available = groups.flatMap(entry => entry.items.map(platform => platform.id))
      const preferred = [
        ...(Array.isArray(user.activePlatformIds) ? user.activePlatformIds : []),
        ...(Array.isArray(user.platforms) ? user.platforms : []),
      ].filter(id => available.includes(id))
      if (preferred.length > 0) return [...new Set(preferred)]
      return groups.map(entry => entry.items[0]?.id).filter(Boolean).slice(0, 4)
    }

/*__PAGES__*/
    function MainPage({ ctx }) {
      const kit = react.useContext(SlotKit)
      return h(WorkbenchGate, { ctx, kit })
    }

    // 「一个需求 × 一个人 = 一个会话」：优先取本人名下、与当前角色匹配的会话，
    // 没有就让用户在工作台里创建，不拿同事的会话顶替。
    function dockSessionOf(requirement, user) {
      const own = (requirement?.sessions ?? [])
        .filter(session =>
          session.archived !== true
          && session.own === true && typeof session.sessionId === 'string' && session.sessionId !== '')
        // 同一类型可能建过不止一场；会话坞永远打开最新的一场。
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      if (own.length === 0) return null
      const byRole = { product: 'requirement', design: 'design', dev: 'dev', qa: 'test', lead: 'requirement' }
      const preferred = byRole[user?.activeRole]
      return own.find(session => session.type === preferred) ?? own[0]
    }

    // 卡片墙上有没有「我」：负责人、设计、会签、开发、测试都算；会话记录不算卡片，
    // 否则以前自动开过会话的人会看不到「加入需求」的入口。
    function requirementHasCard(requirement, user) {
      if (requirement === null || !user) return false
      const uid = user.id
      return requirement.ownerId === uid
        || requirement.designerId === uid
        || requirement.testerId === uid
        || (requirement.reviewerIds ?? []).includes(uid)
        || (requirement.reviews ?? []).some(review => review.by === uid)
        || (requirement.devTasks ?? []).some(task => task.assigneeId === uid)
        || (requirement.testRuns ?? []).some(run => run.by === uid)
    }

    // 已经在这条需求上有位置：有卡片，或者本人名下已有会话。
    // 测试没有认领这一步：QA 进来就准备测试会话，测试卡随第一轮测试出现。
    function requirementJoined(requirement, user) {
      if (requirement === null || !user) return false
      if (sessionTypeForRole(user) === 'test') return true
      return requirementHasCard(requirement, user)
        || (requirement.sessions ?? []).some(session => session.archived !== true && session.createdBy === user.id)
    }

    // 进入需求时自动开的会话类型：按当前身份，产品/负责人开需求会话，其余各开各的。
    function sessionTypeForRole(user) {
      const role = user?.activeRole || (user?.roles ?? [])[0] || ''
      if (role === 'design') return 'design'
      if (role === 'dev') return 'dev'
      if (role === 'qa') return 'test'
      return 'requirement'
    }

    // 会话坞里只放对话本身：固定 Chat 视图，复用宿主的 conversation.content 工厂。
    // 与 DSH 右栏的子会话（sidebar.chat.conversation）是同一套嵌入方式。
    function ChatOnlyView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
    }

/*__SESSION__*/
/*__PAGES2__*/
/*__WBPAGE__*/
/*__CANVAS__*/
    function apply(ctx) {
      ensureStyles()
      // 容器部署时随机预览端口只在容器内可达；让内嵌画布改走服务端打包的 srcdoc。
      fetch(`${API}health`, { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(body => {
          if (body && body.remotePreview === true) window.__DSH_WORKBENCH_REMOTE_PREVIEW__ = true
        })
        .catch(() => {})

      // 主面板自带一个会话作用域的子插槽：宿主据此下发 SessionProvider /
      // renderSlot，页面才能把「我的需求会话」嵌进画布页，而不是另开一栏。
      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        children: { 'workbench.chat': { kind: 'single', scope: 'session' } },
      }, (props) => h(SlotKit.Provider, { value: props }, h(MainPage, { ctx })))), 'dsh-workbench: main panel')

      ctx.effect(() => ctx.slots.inject('workbench.chat', () => ctx.slots.register({
        name: 'workbench.chat',
      }, (props) => h(WorkbenchChat, { ...props, ctx }))), 'dsh-workbench: embedded session chat')

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: -20,
        label: '研发工作台',
      }, WorkbenchIcon)), 'dsh-workbench: sidebar entry')

      // 画布组件以 package-local chunk 懒加载，加载后由它注册文案、点选标签等外围能力。
      // 工作台内嵌模式只提供画布，不再注册 DSH 右侧栏标签。
      ctx.effect(() => {
        let disposed = false
        let attempt = 0
        const load = () => {
          const mine = ++attempt
          publishDesignStudio({ runtime: null, error: null })
          Promise.resolve()
            .then(() => require.async('./client.canvas.js'))
            .then((runtime) => {
              if (disposed || mine !== attempt) return
              runtime.apply(ctx, { embed: { kind: 'workbench' } })
              publishDesignStudio({ runtime, error: null })
            })
            .catch((reason) => {
              if (disposed || mine !== attempt) return
              console.error('[dsh-workbench] 设计画布加载失败', reason)
              publishDesignStudio({ runtime: null, error: reason })
            })
        }
        designStudioRetry = load
        load()
        return () => {
          disposed = true
          designStudioRetry = null
          publishDesignStudio({ runtime: null, error: null })
        }
      }, 'dsh-workbench: design studio chunk')

      // 会话开场的固定一句：需求会话空白时让宿主写一条真实的 assistant 消息。
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-workbench.greeting',
        order: 20,
      }, (props) => h(RequirementGreeting, { ...props, ctx }))), 'dsh-workbench: session greeting')

      // 聊天框左侧的「草稿图」入口：复用 DSH 原生图片粘贴/附件链路。
      ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'dsh-workbench.draft-image',
        order: 40,
      }, ComposerDraftImage)), 'dsh-workbench: composer draft image')

      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'dsh-workbench.command-toast',
      }, CommandToast)), 'dsh-workbench: command toast')

      ctx.on('command/executed', (_sessionId, commandName, result) => {
        if (typeof commandName !== 'string' || !commandName.startsWith('wb-')) return
        publishCommandToast({
          seq: ++commandToastSeq,
          name: commandName,
          kind: result?.kind === 'error' ? 'error' : 'success',
          text: typeof result?.text === 'string' ? result.text : '',
        })
      })
    }

    exports.apply = apply
    exports.inject = INJECT
    return module.exports
  },
})
