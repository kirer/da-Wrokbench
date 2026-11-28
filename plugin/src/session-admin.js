    function WorkbenchChat({ ctx, sessionId, renderFactorySlot, useSession, useConversation, useSessions }) {
      const none = () => undefined
      const useSessionSafe = typeof useSession === 'function' ? useSession : none
      const useConversationSafe = typeof useConversation === 'function' ? useConversation : none
      const useSessionsSafe = typeof useSessions === 'function' ? useSessions : none
      const session = useSessionSafe(value => value)
      const conversation = useConversationSafe(value => value)
      const summaryBlank = useSessionsSafe(state => state?.byId?.[sessionId]?.blank)
      const active = (conversation?.activeTargets?.size ?? 0) > 0
        || (session !== undefined && !session.blank && !session.awaitingFirstTurn)
        || session?.running === true
      const shellPhase = active ? 'active' : session?.promptAttempted ? 'engaging' : 'blank'
      const settling = shellPhase === 'blank' && session?.openState === 'loading' && summaryBlank !== true
      const hero = shellPhase === 'blank' && (session?.openState === 'open' || summaryBlank === true)
      const phase = settling ? 'settling' : hero ? 'hero' : 'active'
      return renderFactorySlot('conversation.content', {
        variant: 'embedded',
        phase,
        hero,
        onWorkspaceSelected: (workspaceId, adopt) => {
          try { ctx.uiWorkspace?.openWorkspace?.(workspaceId, adopt) } catch (_) { /* 会话坞不切换主视图 */ }
        },
      }, { slots: { views: ChatOnlyView } })
    }

    function SessionDock({ ctx, kit, state, requirement, creating = false, createError = '', waitingForPublish = false, onRetry, width = 400, onResizeStart, onResizeReset, onResizeStep }) {
      const record = dockSessionOf(requirement, state?.currentUser)
      const sessionId = record?.sessionId ?? ''
      const [reference, setReference] = useState(null)
      const [error, setError] = useState('')

      useEffect(() => {
        setReference(null)
        setError('')
        if (sessionId === '') return undefined
        let retained = null
        try {
          retained = ctx.sessions.retain(sessionId, {
            source: 'workbenchDock',
            facets: { conversation: true },
          })
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          return undefined
        }
        let alive = true
        setReference(retained)
        Promise.resolve(retained.ready).catch((reason) => {
          if (alive) setError(reason instanceof Error ? reason.message : String(reason))
        })
        return () => {
          alive = false
          try { retained.release() } catch (_) { /* 已释放 */ }
        }
      }, [ctx, sessionId])

      const canEmbed = reference !== null && kit !== null && typeof kit.SessionProvider === 'function'
        && typeof kit.renderSlot === 'function'

      return h('aside', { className: 'dsh-wb-dock', style: { width: `${width}px` } },
        h('div', {
          className: 'dsh-wb-dock-resize',
          role: 'separator',
          'aria-orientation': 'vertical',
          'aria-label': '调整会话宽度',
          'aria-valuenow': width,
          'aria-valuemin': DOCK_WIDTH_MIN,
          'aria-valuemax': DOCK_WIDTH_MAX,
          tabIndex: 0,
          title: '拖动调整宽度，双击复位；聚焦后左右方向键也能调',
          onPointerDown: onResizeStart,
          onDoubleClick: onResizeReset,
          onKeyDown: (event) => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); onResizeStep?.(16) }
            else if (event.key === 'ArrowRight') { event.preventDefault(); onResizeStep?.(-16) }
            else if (event.key === 'Home') { event.preventDefault(); onResizeReset?.() }
          },
        }),
        h('div', { className: 'dsh-wb-dock-body' },
          canEmbed
            ? h(kit.SessionProvider, { session: reference }, kit.renderSlot('workbench.chat', {}))
            : h('div', { className: 'dsh-wb-dock-msg' },
                error !== ''
                  ? error
                  : sessionId !== ''
                    ? '正在打开你的会话…'
                    : createError !== ''
                      ? `自动创建会话失败：${createError}`
                      : creating
                        ? '正在为你创建这条需求上的会话…'
                        : waitingForPublish
                          ? '需求发布后，这里会准备你的会话。'
                          : '正在准备你的会话…',
                sessionId === '' && createError !== '' && onRetry !== undefined
                  ? h('button', {
                      className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary',
                      type: 'button',
                      onClick: onRetry,
                    }, '重试')
                  : null,
              ),
        ),
      )
    }

    const DOCK_WIDTH_DEFAULT = 400
    const DOCK_WIDTH_MIN = 300
    const DOCK_WIDTH_MAX = 760
    const DOCK_WIDTH_KEY = 'dsh-wb:dock-width'

    function readDockWidth() {
      try {
        const value = Number(window.localStorage.getItem(DOCK_WIDTH_KEY))
        if (Number.isFinite(value) && value > 0) {
          return Math.min(DOCK_WIDTH_MAX, Math.max(DOCK_WIDTH_MIN, value))
        }
      } catch (_) { /* 本地存储不可用时用默认宽度 */ }
      return DOCK_WIDTH_DEFAULT
    }

    function WorkbenchGate({ ctx, kit }) {
      const auth = useAuth()
      if (auth.loading) {
        return h('div', { className: 'dsh-wb-design' },
          h('div', { className: 'empty-page', style: { margin: '40px auto', maxWidth: '520px' } },
            h(DesignIcon, { name: 'refresh', size: 28 }),
            h('b', null, '正在检查登录状态'),
            h('span', null, '正在读取当前身份与工作台配置。'),
          ),
        )
      }
      if (!auth.authenticated || auth.user === null) return h(LoginPage, { auth })
      if (!auth.user.onboarding || !auth.user.onboarding.completedAt) return h(OnboardingPage, { auth })
      return h(WorkbenchPage, { ctx, auth, kit })
    }

    const ADMIN_ROLES = ['lead', 'product', 'design', 'dev', 'qa', 'admin']

    // 审计事件类型是点分命名；管理页按人话展示，未收录的原样显示。
    const AUDIT_LABELS = {
      'requirement.created': '新建需求',
      'requirement.submitted': '提交需求',
      'requirement.reviewed': '评审需求',
      'requirement.scheduled': '需求排期',
      'requirement.scope.changed': '调整需求范围',
      'requirement.moved': '移动需求',
      'requirement.frozen': '封板',
      'requirement.unfrozen': '取消封板',
      'requirement.released': '发布',
      'requirement.deleted': '删除需求',
      'requirement.artifact.added': '上传附件',
      'requirement.artifact.deleted': '删除附件',
      'requirement.document.updated': '更新需求文档',
      'requirement.reviewers.set': '设置会签人',
      'requirement.test.claimed': '认领测试',
      'requirement.test.started': '开始测试',
      'requirement.test.passed': '测试通过',
      'requirement.test.failed': '测试不通过',
      'requirement.dev.assigned': '指派开发',
      'requirement.dev.claimed': '认领开发',
      'requirement.dev.started': '开始开发',
      'requirement.dev.finished': '完成开发',
      'requirement.dev.reopened': '重开开发',
      'requirement.session.archived': '归档会话',
      'requirement.session.restored': '恢复会话',
      'design.claimed': '认领设计',
      'design.delivered': '交付设计',
      'design.reset': '删除设计',
      'iteration.created': '新建迭代',
      'iteration.updated': '更新迭代',
      'iteration.archived': '归档迭代',
      'iteration.restored': '恢复迭代',
      'project.created': '新建项目',
      'project.updated': '更新项目',
      'platform.created': '新建平台',
      'platform.updated': '更新平台',
      'platform.archived': '归档平台',
      'platform.restored': '恢复平台',
      'platform.group.created': '新建平台组',
      'platform.group.updated': '更新平台组',
      'platform.group.archived': '归档平台组',
      'platform.group.restored': '恢复平台组',
      'skill.created': '新建技能',
      'skill.updated': '更新技能',
      'skill.reviewed': '审核技能',
      'skill.version.created': '上传技能版本',
      'admin.user.updated': '修改用户',
      'integration.dingtalk.sync': '钉钉组织同步',
    }

    function auditActionLabel(type) {
      const key = String(type ?? '').replace(/_/g, '.')
      return AUDIT_LABELS[key] ?? type ?? '未知事件'
    }

    // 审计载荷只挑人看得懂的部分：用户改动展开成「字段 from → to」，其余键值一行。
    function auditPayloadText(payload) {
      if (payload === null || typeof payload !== 'object') return ''
      const text = value => Array.isArray(value) ? (value.length === 0 ? '无' : value.join('/')) : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '无')
      const parts = []
      for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined || value === '') continue
        if (key === 'changes' && typeof value === 'object') {
          for (const [field, change] of Object.entries(value)) {
            parts.push(`${field}: ${text(change?.from)} → ${text(change?.to)}`)
          }
          continue
        }
        parts.push(`${key}: ${text(value)}`)
      }
      return parts.slice(0, 6).join(' · ')
    }

    function AdminDialog({ state, onClose, onReload, onToast }) {
      const [tab, setTab] = useState('users')
      const [busy, setBusy] = useState('')
      const [roleDrafts, setRoleDrafts] = useState({})
      const [integrations, setIntegrations] = useState(null)
      const [audit, setAudit] = useState([])
      const [auditLoading, setAuditLoading] = useState(false)
      const [syncResult, setSyncResult] = useState(null)
      const [pendingToggle, setPendingToggle] = useState(null)
      const modal = useModalBehavior(onClose)
      const users = state.users ?? []
      const platformName = (id) => state.platforms.find(item => item.id === id)?.name ?? id
      const rolesOf = (user) => roleDrafts[user.id] ?? (Array.isArray(user.roles) ? user.roles : [])

      const toggleRole = (user, role) => {
        const current = rolesOf(user)
        const next = current.includes(role) ? current.filter(item => item !== role) : [...current, role]
        setRoleDrafts(prev => ({ ...prev, [user.id]: next }))
      }

      const saveUser = async (user, patch, includeRoles = true) => {
        setBusy(user.id)
        try {
          await api(`admin/users/${encodeURIComponent(user.id)}`, {
            method: 'POST',
            body: JSON.stringify({
              ...(includeRoles ? { roles: rolesOf(user) } : {}),
              ...patch,
            }),
          })
          if (includeRoles) setRoleDrafts(prev => { const next = { ...prev }; delete next[user.id]; return next })
          await onReload()
          onToast('用户权限已更新', false)
        } catch (reason) {
          onToast(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setBusy('')
        }
      }

      const runSync = async () => {
        setBusy('dingtalk')
        setSyncResult(null)
        try {
          const result = await api('admin/dingtalk/sync', { method: 'POST', body: '{}' })
          setSyncResult(result)
          await onReload()
          onToast('钉钉组织架构已同步', false)
        } catch (reason) {
          onToast(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setBusy('')
        }
      }

      useEffect(() => {
        if (tab !== 'integrations') return undefined
        let alive = true
        api('admin/integrations').then((data) => { if (alive) setIntegrations(data) }).catch((reason) => {
          if (alive) onToast(reason instanceof Error ? reason.message : String(reason), true)
        })
        return () => { alive = false }
      }, [tab, onToast])

      useEffect(() => {
        if (tab !== 'audit') return undefined
        let alive = true
        setAuditLoading(true)
        // 审计流按时间倒序看：最新一条在顶上。
        api('audit?limit=50').then((data) => { if (alive) setAudit((data.events ?? []).slice().sort((a, b) => Number(b.id) - Number(a.id))) }).catch((reason) => {
          if (alive) onToast(reason instanceof Error ? reason.message : String(reason), true)
        }).finally(() => { if (alive) setAuditLoading(false) })
        return () => { alive = false }
      }, [tab, onToast])

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog dsh-wb-admin-dialog', ...modal.dialogProps },
          h('div', { className: 'dsh-wb-dialog-head' },
            h('div', null,
              h('h2', { id: modal.titleId }, '管理'),
              h('p', null, '用户与角色、钉钉组织同步、集成状态和审计事件。'),
            ),
            h('button', { className: 'dsh-wb-rqbar-toggle', type: 'button', onClick: onClose, title: '关闭', 'aria-label': '关闭' }, '×'),
          ),
          h('div', { className: 'dsh-wb-admin-tabs' },
            [['users', '用户与角色'], ['dingtalk', '钉钉同步'], ['integrations', '集成状态'], ['audit', '审计事件']].map(([id, label]) =>
              h('button', {
                key: id,
                type: 'button',
                className: `dsh-wb-btn dsh-wb-btn--sm${tab === id ? ' dsh-wb-btn--primary' : ''}`,
                onClick: () => setTab(id),
              }, label)),
          ),
          tab === 'users'
            ? h('div', { className: 'dsh-wb-admin-list' },
                users.map(user => h('div', { className: 'dsh-wb-admin-row', key: user.id },
                  h('div', { className: 'dsh-wb-admin-row-main' },
                    h('b', null, user.name, h('span', { className: 'dsh-wb-platform-short' }, user.id)),
                    h('span', { className: 'dsh-wb-platform-row-meta' },
                      user.title ? `${user.title} · ` : '',
                      (user.platforms ?? []).map(platformName).join('、') || '未分配平台',
                      user.active === false ? ' · 已停用' : '',
                    ),
                  ),
                  h('div', { className: 'dsh-wb-admin-roles' },
                    ADMIN_ROLES.map(role => h('label', { key: role, className: 'dsh-wb-admin-role' },
                      h('input', {
                        type: 'checkbox',
                        checked: rolesOf(user).includes(role),
                        onChange: () => toggleRole(user, role),
                      }),
                      roleLabel(role),
                    )),
                  ),
                  pendingToggle?.id === user.id
                    ? h('div', { className: 'dsh-wb-platform-row-actions' },
                        h('span', { className: 'dsh-wb-note' }, `确认停用 ${user.name}？账号将立即失去访问权限。`),
                        h('button', {
                          className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary',
                          type: 'button',
                          disabled: busy === user.id,
                          onClick: () => {
                            const target = pendingToggle
                            setPendingToggle(null)
                            void saveUser(target, { active: false }, false)
                          },
                        }, '确认停用'),
                        h('button', {
                          className: 'dsh-wb-btn dsh-wb-btn--sm',
                          type: 'button',
                          disabled: busy === user.id,
                          onClick: () => setPendingToggle(null),
                        }, '取消'),
                      )
                    : h('div', { className: 'dsh-wb-platform-row-actions' },
                        h('button', {
                          className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary',
                          type: 'button',
                          disabled: busy === user.id,
                          onClick: () => { void saveUser(user, {}) },
                        }, busy === user.id ? '保存中…' : '保存角色'),
                        h('button', {
                          className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
                          type: 'button',
                          disabled: busy === user.id,
                          onClick: () => {
                            if (user.active === false) { void saveUser(user, { active: true }, false); return }
                            setPendingToggle(user)
                          },
                        }, user.active === false ? '启用' : '停用'),
                      ),
                )),
              )
            : null,
          tab === 'dingtalk'
            ? h('div', { className: 'dsh-wb-admin-pane' },
                h('p', null, '从钉钉通讯录同步部门和成员。已存在成员按钉钉 userid / unionid / 手机号匹配，新成员使用默认开发角色；未出现在通讯录里的成员会被停用（管理员本人除外）。'),
                h('button', {
                  className: 'dsh-wb-btn dsh-wb-btn--primary',
                  type: 'button',
                  disabled: busy === 'dingtalk',
                  onClick: () => { void runSync() },
                }, busy === 'dingtalk' ? '同步中…' : '立即同步'),
                syncResult !== null
                  ? h('div', { className: 'dsh-wb-note' },
                      `通讯录 ${syncResult.departments ?? 0} 个部门、${syncResult.users ?? 0} 人；新增 ${syncResult.created ?? 0} 人，更新 ${syncResult.updated ?? 0} 人，停用 ${syncResult.disabled ?? 0} 人。`)
                  : null,
              )
            : null,
          tab === 'integrations'
            ? h('div', { className: 'dsh-wb-admin-pane' },
                integrations === null
                  ? h('div', { className: 'dsh-wb-note' }, '读取中…')
                  : h('div', { className: 'dsh-wb-admin-pane' },
                      h('div', null, h('b', null, '钉钉'), '：', integrations.dingtalk?.configured ? '已配置应用' : '未配置应用',
                        integrations.dingtalk?.agentIdConfigured ? ' · 已填 AgentId' : ' · 缺 AgentId',
                        integrations.dingtalk?.orgSync ? ' · 组织同步开' : ' · 组织同步关',
                        integrations.dingtalk?.workNotify ? ' · 工作通知开' : ' · 工作通知关'),
                      h('div', null, h('b', null, 'GitLab'), '：', integrations.gitlab?.configured ? '已配置访问令牌' : '未配置访问令牌',
                        integrations.gitlab?.webhookConfigured ? ' · Webhook 已开' : ' · Webhook 未开'),
                    ),
                h('p', { className: 'dsh-wb-note' }, '密钥只保留在服务端；这里只显示是否已配置。GitLab Webhook 地址：/webhooks/gitlab。'),
              )
            : null,
          tab === 'audit'
            ? h('div', { className: 'dsh-wb-admin-pane' },
                auditLoading
                  ? h('div', { className: 'dsh-wb-note' }, '读取中…')
                  : audit.length === 0
                    ? h('div', { className: 'dsh-wb-note' }, '还没有审计事件。')
                    : h('div', { className: 'dsh-wb-admin-audit' },
                      audit.map(event => h('div', { className: 'dsh-wb-admin-audit-row', key: event.id },
                        h('span', { className: 'dsh-wb-admin-audit-time' }, relativeTime(event.at)),
                        h('b', null, auditActionLabel(event.type)),
                        h('span', null, event.actorId ?? '系统'),
                        h('span', { className: 'dsh-wb-admin-audit-payload', title: event.type }, auditPayloadText(event.payload)),
                      )),
                    ),
              )
            : null,
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn', type: 'button', onClick: onClose }, '关闭'),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Workbench pages: iterations -> iteration detail -> requirement
    // ---------------------------------------------------------------------

