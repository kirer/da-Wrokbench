    // ---------------------------------------------------------------------
    // Data
    // ---------------------------------------------------------------------

    class ApiError extends Error {
      constructor(message, status) {
        super(message)
        this.name = 'ApiError'
        this.status = status
      }
    }

    async function api(path, options = {}) {
      const { timeoutMs = 20000, signal: externalSignal, ...rest } = options
      const token = readToken()
      const headers = {
        ...(rest.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token !== '' ? { authorization: `Bearer ${token}` } : {}),
        ...(rest.headers || {}),
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const forwardAbort = () => controller.abort()
      if (externalSignal) {
        if (externalSignal.aborted) controller.abort()
        else externalSignal.addEventListener('abort', forwardAbort, { once: true })
      }
      try {
        const response = await fetch(API + path, { ...rest, headers, credentials: 'same-origin', signal: controller.signal })
        const body = await response.json().catch(() => ({}))
        if (response.status === 401) {
          writeToken('')
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dsh-workbench:unauthorized'))
        }
        if (!response.ok) throw new ApiError(body.error || `HTTP ${response.status}`, response.status)
        return body
      } catch (reason) {
        if (controller.signal.aborted && !(externalSignal?.aborted)) {
          throw new ApiError('请求超时，请检查团队服务端是否可达', 0)
        }
        if (reason instanceof ApiError) throw reason
        throw new ApiError(reason instanceof Error ? reason.message : String(reason), 0)
      } finally {
        clearTimeout(timeout)
        externalSignal?.removeEventListener('abort', forwardAbort)
      }
    }

    // 多标签页共享同一授权 Cookie；登录/退出后通知其他标签页刷新，避免身份漂移。
    function broadcastAuthChange() {
      if (typeof BroadcastChannel !== 'function') return
      try {
        const channel = new BroadcastChannel('dsh-workbench-auth')
        channel.postMessage({ at: Date.now() })
        channel.close()
      } catch (_) { /* 浏览器不支持时忽略 */ }
    }

    let authIdentity = ''

    function useAuth() {
      const [view, setView] = useState({
        loading: true,
        authenticated: false,
        user: null,
        provider: 'mock',
        mockUsers: [],
        defaultBaseDir: '',
        platformGroups: [],
        platforms: [],
      })
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const refreshInFlight = useRef(false)

      const refresh = useCallback(async () => {
        // 挂载 / BroadcastChannel / unauthorized 事件可能同时触发 refresh：加互斥，
        // 避免同时打多份 auth/session + auth/config。
        if (refreshInFlight.current) return
        refreshInFlight.current = true
        try {
          const session = await api('auth/session')
          // 配置接口失败不应把已登录用户踢回登录页；保留会话结果，配置用空对象兜底。
          let config = {}
          try { config = await api('auth/config') } catch (_) { /* 保留会话 */ }
          const identity = session.authenticated === true
            ? String(session.user?.id ?? session.user?.userId ?? session.user?.userid ?? '')
            : ''
          if (identity !== authIdentity) {
            authIdentity = identity
            resetDataCaches()
          }
          setView({
            loading: false,
            authenticated: session.authenticated === true,
            user: session.user ?? null,
            provider: config.provider || session.provider || 'mock',
            mockUsers: config.mock?.users ?? [],
            defaultBaseDir: session.defaultBaseDir ?? config.defaultBaseDir ?? '',
            platformGroups: session.platformGroups ?? [],
            platforms: session.platforms ?? [],
          })
          setError('')
        } catch (reason) {
          setView(current => ({ ...current, loading: false, authenticated: false }))
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          refreshInFlight.current = false
        }
      }, [])

      useEffect(() => { void refresh() }, [refresh])

      useEffect(() => {
        const onUnauthorized = () => { void refresh() }
        window.addEventListener('dsh-workbench:unauthorized', onUnauthorized)
        return () => window.removeEventListener('dsh-workbench:unauthorized', onUnauthorized)
      }, [refresh])

      useEffect(() => {
        if (typeof BroadcastChannel !== 'function') return undefined
        const channel = new BroadcastChannel('dsh-workbench-auth')
        const onMessage = () => { void refresh() }
        channel.addEventListener('message', onMessage)
        return () => {
          channel.removeEventListener('message', onMessage)
          channel.close()
        }
      }, [refresh])

      const loginMock = useCallback(async (userId) => {
        setBusy(true)
        setError('')
        try {
          const result = await api('auth/mock', { method: 'POST', body: JSON.stringify({ userId }) })
          if (result && typeof result.token === 'string' && result.token !== '') writeToken(result.token)
          broadcastAuthChange()
          await refresh()
          return true
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          return false
        } finally {
          setBusy(false)
        }
      }, [refresh])

      const logout = useCallback(async () => {
        setBusy(true)
        try {
          await api('auth/logout', { method: 'POST', body: '{}' })
          writeToken('')
          broadcastAuthChange()
          await refresh()
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setBusy(false)
        }
      }, [refresh])

      return { ...view, busy, error, refresh, loginMock, logout }
    }

    // 工作台数据和需求数据都是同一个账号/会话共享的：左栏、两个右栏 tab 和
    // 开场白组件如果各自起一个 setInterval，会同时打 6 份 /state、3 份 /requirement。
    // 这里改成模块级 store，只保留一个轮询器，所有组件订阅同一份快照。
    function createDataStore(snapshot) {
      return {
        snapshot,
        listeners: new Set(),
        requestId: 0,
        inFlight: false,
        refs: 0,
        pollers: 0,
        timer: null,
        failures: 0,
        onVisibility: null,
        eventSource: null,
      }
    }

    // 轮询失败时按 2 的倍数退避（最长 30 秒），成功一次就回到基础间隔：
    // 服务端重启或断网时，别让每个打开的会话每 2.5 秒各打一次。
    function schedulePoll(store, tick, baseDelay) {
      const failed = typeof store.snapshot.error === 'string' && store.snapshot.error !== ''
      store.failures = failed ? store.failures + 1 : 0
      const delay = store.failures === 0 ? baseDelay : Math.min(30000, baseDelay * 2 ** Math.min(store.failures, 4))
      store.timer = setTimeout(tick, delay)
    }

    function emitStore(store, patch) {
      store.snapshot = { ...store.snapshot, ...patch }
      for (const listener of [...store.listeners]) listener()
    }

    const workbenchStore = createDataStore({ state: null, error: null, loading: true })

    async function reloadWorkbench() {
      const id = ++workbenchStore.requestId
      try {
        const next = await api('state')
        if (id !== workbenchStore.requestId) return
        emitStore(workbenchStore, { state: next, error: null, loading: false })
      } catch (reason) {
        if (id !== workbenchStore.requestId) return
        emitStore(workbenchStore, { error: reason instanceof Error ? reason.message : String(reason), loading: false })
      }
    }

    function startWorkbenchPolling() {
      if (workbenchStore.timer !== null) return
      const tick = () => {
        if (workbenchStore.timer !== null) { clearTimeout(workbenchStore.timer); workbenchStore.timer = null }
        if (workbenchStore.inFlight || document.visibilityState === 'hidden') { schedulePoll(workbenchStore, tick, 3000); return }
        workbenchStore.inFlight = true
        void reloadWorkbench().finally(() => {
          workbenchStore.inFlight = false
          schedulePoll(workbenchStore, tick, 3000)
        })
      }
      workbenchStore.onVisibility = () => { if (document.visibilityState === 'visible') tick() }
      document.addEventListener('visibilitychange', workbenchStore.onVisibility)
      tick()
    }

    function stopWorkbenchPolling() {
      if (workbenchStore.timer === null) return
      clearTimeout(workbenchStore.timer)
      workbenchStore.timer = null
      if (workbenchStore.onVisibility !== null) {
        document.removeEventListener('visibilitychange', workbenchStore.onVisibility)
        workbenchStore.onVisibility = null
      }
    }

    // SSE：有新事件时立刻刷新一次；不可用（如桌面端无 Cookie）就靠轮询兜底。
    function startWorkbenchStream() {
      if (workbenchStore.eventSource || typeof EventSource !== 'function') return
      try {
        const es = new EventSource(`${API}events/stream`, { withCredentials: true })
        es.addEventListener('workbench', () => { void reloadWorkbench() })
        es.onopen = () => { workbenchStore.failures = 0 }
        workbenchStore.eventSource = es
      } catch (_) { /* 不支持就只轮询 */ }
    }
    function stopWorkbenchStream() {
      if (!workbenchStore.eventSource) return
      try { workbenchStore.eventSource.close() } catch (_) { /* 忽略 */ }
      workbenchStore.eventSource = null
    }

    // 切换账号（或退出登录）时清掉内存里的工作台数据和需求缓存，避免短暂显示上一个账号的内容。
    function resetDataCaches() {
      workbenchStore.requestId += 1
      stopWorkbenchStream()
      emitStore(workbenchStore, { state: null, error: null, loading: true })
      // 预览票据绑在上一个账号上：票据会让宿主按上一个用户的 baseDir 解析
      // 本机文件。不清理，B 在 A 登出后的 120 秒内登录会看到 A 的需求目录。
      previewTickets.clear()
      previewTicketQueued.clear()
      previewTicketInFlight = null
      notifyPreviewTickets()
      // 不能清空 Map：已经挂载的 hook 仍持有旧 store 引用，清空会让它们继续
      // 轮询一个不再被复用的对象，新账号登录后还看得到旧数据。就地把所有
      // store 清空，正在运行的轮询器会用新 token 重新取数。
      for (const store of requirementStores.values()) {
        store.requestId += 1
        emitStore(store, {
          requirement: null,
          error: null,
          loading: store.snapshot.sid !== '',
        })
      }
    }

    function useWorkbench() {
      const [snapshot, setSnapshot] = useState(workbenchStore.snapshot)
      useEffect(() => {
        const listener = () => setSnapshot(workbenchStore.snapshot)
        workbenchStore.listeners.add(listener)
        workbenchStore.refs += 1
        startWorkbenchPolling()
        startWorkbenchStream()
        listener()
        return () => {
          workbenchStore.listeners.delete(listener)
          workbenchStore.refs -= 1
          if (workbenchStore.refs <= 0) {
            stopWorkbenchPolling()
            stopWorkbenchStream()
          }
        }
      }, [])
      return { ...snapshot, reload: reloadWorkbench }
    }

    const requirementStores = new Map()

    function requirementStoreFor(sessionId) {
      const key = typeof sessionId === 'string' ? sessionId : ''
      let store = requirementStores.get(key)
      if (store === undefined) {
        // 先清掉所有不再被引用的旧 store，避免频繁切换会话时堆积。
        for (const [oldKey, old] of requirementStores) {
          if (old.refs <= 0 && old.timer === null) requirementStores.delete(oldKey)
        }
        store = createDataStore({ sid: key, requirement: null, error: null, loading: key !== '' })
        store.key = key
        requirementStores.set(key, store)
      }
      return store
    }

    async function reloadRequirementStore(store, sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') {
        store.requestId += 1
        emitStore(store, { sid: '', requirement: null, error: null, loading: false })
        return
      }
      const id = ++store.requestId
      if (store.snapshot.requirement === null) emitStore(store, { loading: true })
      try {
        const body = await api(`requirement?sessionId=${encodeURIComponent(sessionId)}`)
        if (id !== store.requestId) return
        emitStore(store, { sid: sessionId, requirement: body.requirement ?? null, error: null, loading: false })
      } catch (reason) {
        if (id !== store.requestId) return
        emitStore(store, { sid: sessionId, error: reason instanceof Error ? reason.message : String(reason), loading: false })
      }
    }

    function startRequirementPolling(store, sessionId) {
      if (store.timer !== null || sessionId === '') return
      const tick = () => {
        if (store.timer !== null) { clearTimeout(store.timer); store.timer = null }
        if (store.inFlight || document.visibilityState === 'hidden') { schedulePoll(store, tick, 2500); return }
        store.inFlight = true
        void reloadRequirementStore(store, sessionId).finally(() => {
          store.inFlight = false
          schedulePoll(store, tick, 2500)
        })
      }
      store.onVisibility = () => { if (document.visibilityState === 'visible') tick() }
      document.addEventListener('visibilitychange', store.onVisibility)
      tick()
    }

    function stopRequirementPolling(store) {
      if (store.timer === null) return
      clearTimeout(store.timer)
      store.timer = null
      if (store.onVisibility !== null) {
        document.removeEventListener('visibilitychange', store.onVisibility)
        store.onVisibility = null
      }
    }

    function useRequirementForSession(sessionId, options = {}) {
      const poll = options.poll !== false
      const store = requirementStoreFor(sessionId)
      const [snapshot, setSnapshot] = useState(store.snapshot)
      useEffect(() => {
        setSnapshot(store.snapshot)
        const listener = () => setSnapshot(store.snapshot)
        store.listeners.add(listener)
        store.refs += 1
        if (poll) {
          store.pollers += 1
          startRequirementPolling(store, sessionId)
        } else if (store.snapshot.loading || store.snapshot.requirement === null) {
          void reloadRequirementStore(store, sessionId)
        }
        listener()
        return () => {
          store.listeners.delete(listener)
          store.refs -= 1
          if (poll) {
            store.pollers -= 1
            if (store.pollers <= 0) stopRequirementPolling(store)
          }
          // 页面离开后没人再读这个会话：延迟 5 秒回收，给频繁切换留一点余量，
          // 期间如果又被重新进入则保留，避免反复重建轮询器。
          if (store.refs <= 0 && store.timer === null) {
            const dying = store
            setTimeout(() => {
              if (dying.refs <= 0 && dying.timer === null) requirementStores.delete(dying.key)
            }, 5000)
          }
        }
      }, [sessionId, poll, store])
      const current = snapshot.sid === sessionId
        ? snapshot
        : { requirement: null, error: null, loading: typeof sessionId === 'string' && sessionId !== '' }
      const reload = useCallback(() => reloadRequirementStore(store, sessionId), [store, sessionId])
      return { requirement: current.requirement, loading: current.loading, error: current.error, reload }
    }

    async function openDesignFile(sessionId, filePath) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      try {
        const response = await fetch(`${DS_API}open`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: sessionId, target: filePath }),
          signal: controller.signal,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || `打开设计失败（${response.status}）`)
        return body
      } catch (reason) {
        if (controller.signal.aborted) throw new Error('打开设计文件超时')
        throw reason
      } finally {
        clearTimeout(timer)
      }
    }

