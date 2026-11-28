    function LoginPage({ auth }) {
      const mockUsers = auth.mockUsers ?? []
      const [selectedId, setSelectedId] = useState('')
      useEffect(() => {
        if (mockUsers.length === 0) return
        if (!mockUsers.some(user => user.id === selectedId)) setSelectedId(mockUsers[0].id)
      }, [mockUsers.map(user => user.id).join('|')])
      const selected = mockUsers.find(user => user.id === selectedId) ?? null
      const href = `${API}auth/dingtalk/start?returnTo=${encodeURIComponent(typeof window === 'undefined' ? '/' : window.location.href)}`
      const enter = () => {
        if (selected === null || auth.busy) return
        void auth.loginMock(selected.id)
      }
      return h('div', { className: 'dsh-wb-design dsh-wb-login' },
        h('div', { className: 'login' },
          h('section', { className: 'brand' },
            h('div', { className: 'grid-bg' }),
            h('div', { className: 'logo' },
              h('svg', { className: 'logo-mark', width: 24, height: 24, 'aria-hidden': 'true' }, h('use', { href: '#i-logo' })),
              h('span', { className: 'logo-name' }, 'deepseek'),
              h('span', { className: 'logo-badge' }, 'HARNESS'),
            ),
            h('div', { style: { marginTop: '56px' } },
              h('h1', null, '需求与设计，', h('br'), '在一个会话里闭环。'),
              h('p', { className: 'sub' }, 'DSH 部门研发工作台 · 第一版聚焦「迭代 → 需求 → 评审排期 → 设计」，沉淀结果进服务端，草稿留在本地。'),
            ),
            h('div', { className: 'flow' },
              [
                ['1', '迭代', '建迭代、定阶段时间、圈需求范围'],
                ['2', '需求', '产品在会话里梳理需求，存草稿、提交评审'],
                ['3', '评审 · 排期', '不依赖设计，评审与设计可并行'],
                ['4', '设计 · 交付', '设计画布出稿、比对版本、提交交付'],
              ].map(([no, title, desc]) => h('div', { className: 'fi', key: no },
                h('span', { className: 'no' }, no),
                h('div', null, h('div', { className: 'tt' }, title), h('div', { className: 'dd' }, desc)),
              )),
            ),
            h('div', { className: 'foot' },
              h(DesignIcon, { name: 'shield', size: 13, style: { color: 'var(--text-3)' } }),
              'DSH 研发部 · 内网部署',
            ),
          ),
          h('section', { className: 'auth' },
            h('div', { className: 'theme-slot' },
              h('span', { className: 'badge badge--mock' }, auth.provider === 'mock' ? 'Mock 登录' : '钉钉登录'),
            ),
            h('div', { className: 'auth-card' },
              h('h2', { className: 'h' }, '登录到研发工作台'),
              h('p', { className: 's' }, auth.provider === 'mock' ? '使用钉钉身份进入；第一版为 Mock，可直接选测试用户。' : '使用钉钉授权进入；需要管理员提前开通工作台权限。'),
              auth.provider === 'mock'
                ? h('div', { className: 'banner banner--mock mock-banner' },
                    h(DesignIcon, { name: 'shield' }),
                    h('span', null, '当前为 ', h('b', null, 'Mock 测试登录'), '：从测试用户里选一个身份进入，不连接钉钉；数据仍会写进团队服务端。'),
                  )
                : null,
              auth.error !== '' ? h('div', { className: 'auth-error' }, auth.error) : null,
              auth.provider === 'mock'
                ? (mockUsers.length === 0
                    ? h('div', { className: 'empty-page', style: { padding: '28px 16px' } },
                        h(DesignIcon, { name: 'users', size: 24 }),
                        h('b', null, '没有可用的 Mock 用户'),
                        h('span', null, '请检查服务端用户配置。'),
                      )
                    : h('div', { className: 'user-list' },
                        mockUsers.map(user => h('div', {
                          className: `user-row${user.id === selectedId ? ' sel' : ''}`,
                          key: user.id,
                          role: 'button',
                          tabIndex: 0,
                          onClick: () => setSelectedId(user.id),
                          onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(user.id) } },
                        },
                          h(Avatar, { name: user.name, size: 28 }),
                          h('div', { className: 'who' },
                            h('div', { className: 'n' }, user.name),
                            h('div', { className: 'r' }, roleText(user)),
                          ),
                          h('span', { className: 'radio' }),
                        )),
                      ))
                : null,
              auth.provider === 'mock'
                ? h('button', {
                    className: 'btn btn-primary',
                    type: 'button',
                    disabled: auth.busy || selected === null,
                    style: { width: '100%', height: '36px' },
                    onClick: enter,
                  }, auth.busy ? '正在进入…' : selected ? `以「${selected.name}」身份进入` : '请选择测试用户')
                : h('a', { className: 'btn btn-primary', href, style: { width: '100%', height: '36px' } }, '使用钉钉登录'),
              auth.provider === 'mock'
                ? h('div', { className: 'tiny muted', style: { textAlign: 'center', marginTop: '8px' } }, '首次使用会先做「身份 / 平台 + 顶级文件夹」设置')
                : null,
              auth.provider === 'mock'
                ? h('div', null,
                    h('div', { className: 'divider-lbl' }, '或'),
                    h('button', {
                      className: 'btn btn-ghost',
                      type: 'button',
                      disabled: true,
                      title: '生产环境启用钉钉扫码登录',
                      style: { width: '100%', height: '36px' },
                    }, h(DesignIcon, { name: 'command' }), '钉钉扫码登录 · 生产环境'),
                  )
                : null,
              h('div', { className: 'next-hint' },
                h(DesignIcon, { name: 'arrow-right', style: { color: 'var(--text-3)' } }),
                h('span', null, '首次使用接下来：', h('b', null, '选择职能与平台'), ' → ', h('b', null, '选择个人顶级文件夹')),
              ),
              h('p', { className: 'auth-foot' },
                auth.provider === 'mock' ? '正式环境将使用钉钉授权登录，界面与此一致。' : '登录状态保存在 HttpOnly Cookie / 桌面端 Token。',
                h('br'),
                '需要企业管理员开通通讯录权限',
              ),
            ),
          ),
        ),
      )
    }

    function ProfileForm({ mode, user, platformGroups, platforms, defaultBaseDir, onSubmit, onCancel }) {
      const groups = useMemo(() => activePlatformGroups(platformGroups ?? [], platforms ?? []), [platformGroups, platforms])
      const [step, setStep] = useState(0)
      const [role, setRole] = useState(user.activeRole || user.roles[0] || '')
      const [selected, setSelected] = useState(() => defaultProfilePlatformIds(user, groups))
      const [folder, setFolder] = useState(user.onboarding?.topLevelFolder || defaultBaseDir || '~/DSH-Workbench')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')

      const togglePlatform = (id) => {
        setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
      }

      const submit = async () => {
        if (busy || folder.trim() === '' || user.roles.length === 0) return
        setBusy(true)
        setError('')
        try {
          await onSubmit({ activeRole: role || null, platformIds: selected, topLevelFolder: folder.trim() })
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setBusy(false)
        }
      }

      const roleLabelOf = item => roleLabel(item)
      const steps = ['选择身份', '顶级文件夹', '确认']
      const stepsBar = h('div', { className: 'ob-steps' },
        steps.flatMap((label, index) => {
          const node = h('span', {
            key: label,
            className: `s${index === step ? ' active' : index < step ? ' done' : ''}`,
          }, h('span', { className: 'dot' }, index < step ? '✓' : String(index + 1)), label)
          return index === steps.length - 1 ? [node] : [node, h('span', { className: 'line', key: `line-${index}` })]
        }),
      )
      const panel = step === 0
        ? h('div', null,
            h('h1', null, '先确认你的身份'),
            h('div', { className: 'sub' }, '职能由管理员分配，权限取并集；再选一个「当前身份」决定默认打开哪个工作台。平台可多选，新建需求默认带上这些平台。'),
            h('div', { className: 'field' },
              h('div', { className: 'label' }, '当前身份', h('span', { className: 'hint' }, '单选')),
              user.roles.length === 0
                ? h('div', { className: 'banner banner--mock' }, h(DesignIcon, { name: 'alert' }), h('span', null, '账号还没有分配身份，请联系管理员。'))
                : h('div', { className: 'radio-row' },
                    user.roles.map(item => h('div', {
                      className: `radio-card${role === item ? ' sel' : ''}`,
                      key: item,
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => setRole(item),
                      onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setRole(item) } },
                    },
                      h('div', { className: 'rt' }, h('span', { className: 'r' }), roleLabelOf(item)),
                      h('div', { className: 'rd' }, item === 'lead' ? '默认打开「我的工作台」，可创建迭代' : item === 'product' ? '默认打开需求相关视图' : item === 'design' ? '默认打开设计相关视图' : `以「${roleLabelOf(item)}」身份进入工作台`),
                    )),
                  ),
            ),
            h('div', { className: 'field', style: { marginBottom: 0 } },
              h('div', { className: 'label' }, '开发平台', h('span', { className: 'hint' }, '按组展示 · 可多选')),
              groups.length === 0
                ? h('div', { className: 'tiny muted' }, '当前没有启用的平台组，请联系管理员。')
                : groups.map(entry => h('div', { key: entry.group.id, style: { marginBottom: '10px' } },
                    h('div', { className: 'tiny muted', style: { marginBottom: '6px' } }, entry.group.name),
                    h('div', { className: 'row gap-2 wrap' },
                      entry.items.map(platform => h('div', {
                        className: `ptog${selected.includes(platform.id) ? ' on' : ''}`,
                        key: platform.id,
                        role: 'button',
                        tabIndex: 0,
                        onClick: () => togglePlatform(platform.id),
                        onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePlatform(platform.id) } },
                      }, h('span', { className: 'box' }), platform.name)),
                    ),
                  )),
            ),
          )
        : step === 1
          ? h('div', null,
              h('h1', null, '选择个人顶级文件夹'),
              h('div', { className: 'sub' }, '需求文件夹、草稿和 DSH 会话都建在这里；只保存在本机，不上传团队服务端。'),
              h('div', { className: 'field' },
                h('div', { className: 'label' }, '文件夹路径'),
                h('div', { className: 'path-box' },
                  h(DesignIcon, { name: 'folder', style: { color: 'var(--text-3)' } }),
                  h('span', { className: 'p' }, folder.trim() || '未填写'),
                  h(DesignChip, { tone: 'done', glyph: '✓' }, '本地'),
                ),
                h('div', { className: 'field-help' }, '修改文件夹不会移动已有需求目录；已有会话仍指向原路径。'),
              ),
              h('div', { className: 'field', style: { marginBottom: 0 } },
                h('div', { className: 'label' }, '路径', h('span', { className: 'req' }, '*')),
                h('input', {
                  className: 'input mono',
                  value: folder,
                  placeholder: '例如：~/DSH-Workbench',
                  onChange: (event) => setFolder(event.target.value),
                  disabled: busy,
                  'aria-label': '本地顶级文件夹',
                }),
                h('div', { className: 'field-help' }, '服务端只记录「已配置」，不保存真实路径。'),
              ),
            )
          : h('div', null,
              h('h1', null, '确认设置'),
              h('div', { className: 'sub' }, '确认后进入工作台；以后可在「设置」里调整当前身份、平台与文件夹。'),
              h('dl', { className: 'ob-summary' },
                h('dt', null, '当前身份'), h('dd', null, h('span', { className: 'assignee' }, h(Avatar, { name: user.name }), `${user.name} · ${roleLabelOf(role)}`)),
                h('dt', null, '职能'), h('dd', null, user.roles.map(item => h(DesignChip, { key: item, tone: 'plain' }, roleLabelOf(item)))),
                h('dt', null, '平台'), h('dd', null, selected.length === 0 ? h('span', { className: 'muted' }, '未选择') : selected.map(id => h(DesignChip, { key: id, tone: 'plain' }, (platforms ?? []).find(item => item.id === id)?.name ?? id))),
                h('dt', null, '顶级文件夹'), h('dd', { className: 'mono', style: { fontSize: '12px' } }, folder.trim() || '未填写'),
                h('dt', null, '认证模式'), h('dd', null, h('span', { className: 'badge badge--mock' }, auth.provider === 'mock' ? 'Mock 测试登录' : '钉钉授权登录')),
              ),
              h('div', { className: 'banner banner--mock', style: { marginTop: '16px' } },
                h(DesignIcon, { name: 'shield' }),
                h('span', null, auth.provider === 'mock'
                  ? '当前为 Mock 模式，不连接钉钉；正式环境界面一致，只换登录方式。'
                  : '当前为钉钉授权登录，身份和部门来自企业通讯录。'),
              ),
            )
      return h('div', { className: 'ob' },
        h('div', { className: 'ob-card' },
          h('div', { className: 'ob-brand' },
            h('svg', { className: 'logo-mark', width: 22, height: 22, 'aria-hidden': 'true' }, h('use', { href: '#i-logo' })),
            h('span', { className: 'logo-name' }, 'deepseek'),
            h('span', { className: 'logo-badge' }, 'HARNESS'),
            h('span', { className: 'badge badge--mock', style: { marginLeft: '8px' } }, mode === 'settings' ? '设置' : '首次使用'),
          ),
          stepsBar,
          h('div', { className: 'ob-panel' },
            panel,
            error !== '' ? h('div', { className: 'banner banner--mock', style: { marginTop: '12px' } }, h(DesignIcon, { name: 'alert' }), h('span', null, error)) : null,
            h('div', { className: 'ob-foot' },
              step > 0
                ? h('button', { className: 'btn', type: 'button', disabled: busy, onClick: () => setStep(step - 1) }, '上一步')
                : onCancel
                  ? h('button', { className: 'btn', type: 'button', disabled: busy, onClick: onCancel }, '取消')
                  : null,
              h('div', { className: 'spacer' }),
              step < 2
                ? h('button', {
                    className: 'btn btn-primary',
                    type: 'button',
                    disabled: busy || (step === 1 && folder.trim() === '') || (step === 0 && user.roles.length === 0),
                    onClick: () => setStep(step + 1),
                  }, '下一步', h(DesignIcon, { name: 'arrow-right' }))
                : h('button', {
                    className: 'btn btn-primary',
                    type: 'button',
                    disabled: busy || folder.trim() === '' || user.roles.length === 0,
                    onClick: () => { void submit() },
                  }, busy ? '保存中…' : mode === 'settings' ? '保存设置' : '进入工作台', h(DesignIcon, { name: 'arrow-right' })),
            ),
          ),
        ),
      )
    }

    function OnboardingPage({ auth }) {
      const submit = useCallback(async (payload) => {
        await api('onboarding/complete', { method: 'POST', body: JSON.stringify(payload) })
        await auth.refresh()
      }, [auth])
      return h('div', { className: 'dsh-wb-design' },
        h(ProfileForm, {
          mode: 'onboarding',
          user: auth.user,
          platformGroups: auth.platformGroups,
          platforms: auth.platforms,
          defaultBaseDir: auth.defaultBaseDir,
          onSubmit: submit,
        }),
      )
    }

    function SettingsPage({ auth, state, onReload, onToast, onOpenPlatform, onOpenAdmin }) {
      const user = state.currentUser ?? auth.user
      const groups = useMemo(() => activePlatformGroups(state.platformGroups ?? [], state.platforms ?? []), [state.platformGroups, state.platforms])
      const [role, setRole] = useState(user.activeRole || user.roles[0] || '')
      const [selected, setSelected] = useState(() => defaultProfilePlatformIds(user, groups))
      const [folder, setFolder] = useState(user.onboarding?.topLevelFolder || state.baseDir || '~/DSH-Workbench')
      const [folderHint, setFolderHint] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [saved, setSaved] = useState(false)
      const isAdmin = (user.roles ?? []).includes('admin')
      const canConfig = (user.roles ?? []).includes('lead') || isAdmin
      const toggle = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
      useEffect(() => {
        const value = folder.trim()
        if (value === '') { setFolderHint(null); return undefined }
        const timer = setTimeout(() => {
          api('onboarding/precheck', { method: 'POST', body: JSON.stringify({ folder: value }) })
            .then(hint => setFolderHint(hint))
            .catch(() => setFolderHint(null))
        }, 400)
        return () => clearTimeout(timer)
      }, [folder])
      const save = async () => {
        if (busy || folder.trim() === '' || (user.roles ?? []).length === 0 || (folderHint && folderHint.valid === false)) return
        setBusy(true)
        setError('')
        setSaved(false)
        try {
          await api('onboarding/complete', { method: 'POST', body: JSON.stringify({ activeRole: role || null, platformIds: selected, topLevelFolder: folder.trim() }) })
          await auth.refresh()
          await onReload()
          setSaved(true)
          onToast('设置已保存', false)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          onToast(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setBusy(false)
        }
      }
      const jump = id => {
        const node = typeof document === 'undefined' ? null : document.getElementById(`wb-set-${id}`)
        if (node !== null) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return h('div', { className: 'page' },
        h('div', { className: 'page-head' },
          h('div', { className: 'page-actions' },
            h('button', { className: 'btn btn-sm', type: 'button', disabled: auth.busy, onClick: () => { void auth.logout() } }, '退出登录'),
            h('button', { className: 'btn btn-sm btn-primary', type: 'button', disabled: busy || folder.trim() === '' || (folderHint && folderHint.valid === false), onClick: () => { void save() } }, busy ? '保存中…' : '保存更改'),
          ),
        ),
        error !== '' ? h('div', { className: 'banner banner--mock', style: { marginBottom: '14px' } }, h(DesignIcon, { name: 'alert' }), h('span', null, error)) : null,
        saved ? h('div', { className: 'banner banner--info', style: { marginBottom: '14px' } }, h(DesignIcon, { name: 'check-circle' }), h('span', null, '设置已保存，立即生效。')) : null,
        h('div', { className: 'settings-layout' },
          h('nav', { className: 'set-nav' },
            [['identity', 'user', '身份与平台'], ['platform', 'package', '平台配置'], ['folder', 'folder', '顶级文件夹'], ['auth', 'shield', '认证模式']].map(([id, icon, label]) =>
              h('a', { key: id, href: `#wb-set-${id}`, onClick: event => { event.preventDefault(); jump(id) } }, h(DesignIcon, { name: icon }), label)),
          ),
          h('div', null,
            h('section', { className: 'set-sec', id: 'wb-set-identity' },
              h('div', { className: 'set-sec-hd' }, h(DesignIcon, { name: 'user' }), h('span', { className: 't' }, '身份与平台'), h('span', { className: 'd' }, '职能由管理员分配，权限取并集')),
              h('div', { className: 'set-sec-bd' },
                h('div', { className: 'field' },
                  h('div', { className: 'label' }, '当前身份', h('span', { className: 'hint' }, '单选')),
                  h('div', { className: 'radio-row' },
                    (user.roles ?? []).map(item => h('div', {
                      className: `radio-card${role === item ? ' sel' : ''}`,
                      key: item,
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => setRole(item),
                      onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setRole(item) } },
                    },
                      h('div', { className: 'rt' }, h('span', { className: 'r' }), roleLabel(item)),
                      h('div', { className: 'rd' }, item === 'lead' ? '管迭代与排期，可创建需求和指定负责人'
                        : item === 'product' ? '写需求、做原型、提交评审'
                          : item === 'design' ? '认领设计任务，交付设计稿'
                            : item === 'dev' ? '认领平台任务，提交分支与 MR'
                              : item === 'qa' ? '认领测试，给出通过与缺陷结论'
                                : '管理用户、平台与集成'),
                    )),
                  ),
                ),
                h('div', { className: 'field', style: { marginBottom: 0 } },
                  h('div', { className: 'label' }, '开发平台', h('span', { className: 'hint' }, '按组展示 · 可多选')),
                  groups.length === 0
                    ? h('div', { className: 'tiny muted' }, '当前没有启用的平台组。')
                    : groups.map(entry => h('div', { key: entry.group.id, style: { marginBottom: '10px' } },
                        h('div', { className: 'tiny muted', style: { marginBottom: '6px' } }, entry.group.name),
                        h('div', { className: 'row gap-2 wrap' }, entry.items.map(platform => h('div', {
                          className: `ptog${selected.includes(platform.id) ? ' on' : ''}`,
                          key: platform.id,
                          role: 'button',
                          tabIndex: 0,
                          onClick: () => toggle(platform.id),
                          onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(platform.id) } },
                        }, h('span', { className: 'box' }), platform.name))),
                      )),
                ),
              ),
            ),
            h('section', { className: 'set-sec', id: 'wb-set-platform' },
              h('div', { className: 'set-sec-hd' }, h(DesignIcon, { name: 'package' }), h('span', { className: 't' }, '平台配置'), h('span', { className: 'd' }, canConfig ? '负责人 / 管理员 · 组 + 平台/团队' : '只读 · 管理员可配置')),
              h('div', { className: 'set-sec-bd' },
                (state.platformGroups ?? []).filter(group => group.active !== false).map(group => h('div', { className: 'row', key: group.id, style: { alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--line)' } },
                  h(DesignChip, { tone: 'plain', className: '' }, group.name),
                  h('div', { className: 'row gap-2 wrap', style: { flex: 1 } },
                    (state.platforms ?? []).filter(platform => platform.groupId === group.id && platform.active !== false).map(platform => h(DesignChip, { key: platform.id, tone: 'idle' }, platform.name)),
                  ),
                )),
                h('div', { className: 'row gap-2 wrap', style: { marginTop: '10px' } },
                  canConfig ? h('button', { className: 'btn btn-sm', type: 'button', onClick: onOpenPlatform }, '管理平台配置') : null,
                  isAdmin ? h('button', { className: 'btn btn-sm', type: 'button', onClick: onOpenAdmin }, '用户与权限') : null,
                ),
                h('div', { className: 'banner banner--info', style: { marginTop: '10px' } },
                  h(DesignIcon, { name: 'dot' }),
                  h('span', null, '需求只选具体平台；矩阵与各端卡片按需求实际涉及的平台、按组动态渲染，不涉及的折叠成一行。'),
                ),
              ),
            ),
            h('section', { className: 'set-sec', id: 'wb-set-folder' },
              h('div', { className: 'set-sec-hd' }, h(DesignIcon, { name: 'folder' }), h('span', { className: 't' }, '个人顶级文件夹'), h('span', { className: 'd' }, '只存本地，不上传真实路径')),
              h('div', { className: 'set-sec-bd' },
                h('div', { className: 'path-box' },
                  h(DesignIcon, { name: 'folder', style: { color: 'var(--text-3)' } }),
                  h('span', { className: 'p' }, folder.trim() || '未填写'),
                  h(DesignChip, { tone: 'done', glyph: '✓' }, '本地'),
                ),
                h('div', { className: 'field', style: { marginTop: '11px', marginBottom: 0 } },
                  h('div', { className: 'label' }, '路径', h('span', { className: 'hint' }, '修改后保存')),
                  h('input', { className: 'input mono', value: folder, disabled: busy, onChange: event => setFolder(event.target.value), 'aria-label': '本地顶级文件夹' }),
                  folderHint && folderHint.valid === false
                    ? h('div', { className: 'field-help', style: { color: 'var(--dsw-alias-state-error-primary,#e05a5a)' } }, folderHint.reason || '路径不可用')
                    : (folderHint && folderHint.valid
                        ? h('div', { className: 'field-help' }, folderHint.hasHistory ? '该目录已有历史项目数据，可继续使用' : '路径可用')
                        : null),
                  h('div', { className: 'field-help' }, '会话全文、需求草稿、原型/设计草稿都放这里；服务端只存已提交/已交付结果。修改文件夹不会移动已有目录。'),
                ),
              ),
            ),
            h('section', { className: 'set-sec', id: 'wb-set-auth', style: { marginBottom: 0 } },
              h('div', { className: 'set-sec-hd' }, h(DesignIcon, { name: 'shield' }), h('span', { className: 't' }, '认证模式'), h('span', { className: 'd' }, '由服务端环境变量决定')),
              h('div', { className: 'set-sec-bd' },
                h('div', { className: 'banner banner--mock', style: { marginBottom: '12px' } },
                  h(DesignIcon, { name: 'shield' }),
                  h('span', null, auth.provider === 'mock'
                    ? '当前为 Mock 模式：从测试用户列表选人进入，用于本地联调，不连接钉钉。'
                    : '当前为钉钉授权：登录走企业通讯录，切换登录方式需要重启服务端并重新登录。'),
                ),
                h('div', { className: 'radio-row' },
                  h('div', { className: `radio-card${auth.provider === 'mock' ? ' sel' : ''}` },
                    h('div', { className: 'rt' }, h('span', { className: 'r' }), 'Mock 测试登录', auth.provider === 'mock' ? h('span', { className: 'badge badge--mock', style: { marginLeft: 'auto' } }, '当前') : null),
                    h('div', { className: 'rd' }, '仅开发环境可用；正式环境由管理员配置钉钉。'),
                  ),
                  h('div', { className: `radio-card${auth.provider === 'mock' ? '' : ' sel'}` },
                    h('div', { className: 'rt' }, h('span', { className: 'r' }), '钉钉授权登录', auth.provider === 'mock' ? null : h('span', { className: 'badge badge--mock', style: { marginLeft: 'auto' } }, '当前')),
                    h('div', { className: 'rd' }, '需企业管理员开通通讯录权限。'),
                  ),
                ),
              ),
            ),
          ),
        ),
      )
    }

    function PlatformGroupRow({ group, busy, onSave, onArchive }) {
      const [editing, setEditing] = useState(false)
      const [name, setName] = useState(group.name)
      const [order, setOrder] = useState(String(group.order))
      const [supportsApiDoc, setSupportsApiDoc] = useState(group.supportsApiDoc === true)
      useEffect(() => {
        setName(group.name)
        setOrder(String(group.order))
        setSupportsApiDoc(group.supportsApiDoc === true)
      }, [group.id, group.name, group.order, group.supportsApiDoc])
      if (!editing) {
        return h('div', { className: `dsh-wb-platform-row${group.active === false ? ' is-archived' : ''}` },
          h('div', { className: 'dsh-wb-platform-row-main' },
            h('b', null, group.name),
            h('span', { className: 'dsh-wb-platform-row-meta' },
              `排序 ${group.order}`,
              group.supportsApiDoc ? ' · API 文档' : '',
              group.active === false ? ' · 已归档' : '',
            ),
          ),
          h('div', { className: 'dsh-wb-platform-row-actions' },
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', disabled: busy, onClick: () => setEditing(true) }, '编辑'),
            h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
              type: 'button',
              disabled: busy,
              onClick: () => onArchive(group, group.active === false),
            }, group.active === false ? '恢复' : '归档'),
          ),
        )
      }
      return h('div', { className: 'dsh-wb-platform-row is-editing' },
        h('div', { className: 'dsh-wb-platform-form' },
          h('input', { className: 'dsh-wb-input', value: name, onChange: (event) => setName(event.target.value), placeholder: '平台组名称' }),
          h('input', { className: 'dsh-wb-input dsh-wb-input--order', value: order, onChange: (event) => setOrder(event.target.value), inputMode: 'numeric', placeholder: '排序' }),
          h('label', { className: 'dsh-wb-auth-check' },
            h('input', { type: 'checkbox', checked: supportsApiDoc, onChange: (event) => setSupportsApiDoc(event.target.checked) }),
            '有 API 文档',
          ),
        ),
        h('div', { className: 'dsh-wb-platform-row-actions' },
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', disabled: busy, onClick: () => setEditing(false) }, '取消'),
          h('button', {
            className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary',
            type: 'button',
            disabled: busy || name.trim() === '',
            onClick: () => { void onSave(group, { name: name.trim(), order: Number(order) || 0, supportsApiDoc }).then(ok => { if (ok) setEditing(false) }) },
          }, '保存'),
        ),
      )
    }

    function PlatformRow({ platform, groups, users, busy, first = false, last = false, onMove, onSave, onArchive }) {
      const [editing, setEditing] = useState(false)
      const [name, setName] = useState(platform.name)
      const [shortName, setShortName] = useState(platform.shortName)
      const [groupId, setGroupId] = useState(platform.groupId)
      const [order, setOrder] = useState(String(platform.order))
      const [ownerId, setOwnerId] = useState(platform.ownerId ?? '')
      const [gitlabProjectPath, setGitlabProjectPath] = useState(platform.gitlabProjectPath ?? '')
      useEffect(() => {
        setName(platform.name)
        setShortName(platform.shortName)
        setGroupId(platform.groupId)
        setOrder(String(platform.order))
        setOwnerId(platform.ownerId ?? '')
        setGitlabProjectPath(platform.gitlabProjectPath ?? '')
      }, [platform.id, platform.name, platform.shortName, platform.groupId, platform.order, platform.ownerId, platform.gitlabProjectPath])
      const groupName = groups.find(item => item.id === platform.groupId)?.name ?? platform.groupId
      const ownerName = users.find(user => user.id === platform.ownerId)?.name
      if (!editing) {
        return h('div', { className: `dsh-wb-platform-row${platform.active === false ? ' is-archived' : ''}` },
          h('div', { className: 'dsh-wb-platform-row-main' },
            h('b', null, platform.name, h('span', { className: 'dsh-wb-platform-short' }, platform.shortName)),
            h('span', { className: 'dsh-wb-platform-row-meta' },
              `${groupName} · 排序 ${platform.order}${ownerName ? ` · 负责人 ${ownerName}` : ''}${platform.gitlabProjectPath ? ` · GitLab ${platform.gitlabProjectPath}` : ''}${platform.active === false ? ' · 已归档' : ''}`,
            ),
          ),
          h('div', { className: 'dsh-wb-platform-row-actions' },
            h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
              type: 'button',
              disabled: busy || first || typeof onMove !== 'function',
              title: '上移',
              'aria-label': `上移 ${platform.name}`,
              onClick: () => onMove?.(platform, -1),
            }, '↑'),
            h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
              type: 'button',
              disabled: busy || last || typeof onMove !== 'function',
              title: '下移',
              'aria-label': `下移 ${platform.name}`,
              onClick: () => onMove?.(platform, 1),
            }, '↓'),
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', disabled: busy, onClick: () => setEditing(true) }, '编辑'),
            h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
              type: 'button',
              disabled: busy,
              onClick: () => onArchive(platform, platform.active === false),
            }, platform.active === false ? '恢复' : '归档'),
          ),
        )
      }
      return h('div', { className: 'dsh-wb-platform-row is-editing' },
        h('div', { className: 'dsh-wb-platform-form' },
          h('input', { className: 'dsh-wb-input', value: name, onChange: (event) => setName(event.target.value), placeholder: '平台名称' }),
          h('input', { className: 'dsh-wb-input dsh-wb-input--short', value: shortName, onChange: (event) => setShortName(event.target.value), placeholder: '简称' }),
          h('select', { className: 'dsh-wb-select', value: groupId, onChange: (event) => setGroupId(event.target.value) },
            groups.map(item => h('option', { key: item.id, value: item.id }, item.name)),
          ),
          h('input', { className: 'dsh-wb-input dsh-wb-input--order', value: order, onChange: (event) => setOrder(event.target.value), inputMode: 'numeric', placeholder: '排序' }),
          h('select', { className: 'dsh-wb-select', value: ownerId, onChange: (event) => setOwnerId(event.target.value), title: '平台负责人' },
            h('option', { value: '' }, '无平台负责人'),
            users.map(user => h('option', { key: user.id, value: user.id }, user.name)),
          ),
          h('input', {
            className: 'dsh-wb-input',
            value: gitlabProjectPath,
            onChange: (event) => setGitlabProjectPath(event.target.value),
            placeholder: 'GitLab 项目路径，例如 group/project',
          }),
        ),
        h('div', { className: 'dsh-wb-platform-row-actions' },
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', disabled: busy, onClick: () => setEditing(false) }, '取消'),
          h('button', {
            className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary',
            type: 'button',
            disabled: busy || name.trim() === '' || shortName.trim() === '',
            onClick: () => { void onSave(platform, { name: name.trim(), shortName: shortName.trim(), groupId, order: Number(order) || 0, ownerId, gitlabProjectPath: gitlabProjectPath.trim() }).then(ok => { if (ok) setEditing(false) }) },
          }, '保存'),
        ),
      )
    }

    function PlatformConfigDialog({ state, onClose, onReload, onToast }) {
      const [busy, setBusy] = useState('')
      const [groupName, setGroupName] = useState('')
      const [platformName, setPlatformName] = useState('')
      const [platformShort, setPlatformShort] = useState('')
      const [platformGroupId, setPlatformGroupId] = useState('')
      const groups = state.platformGroups ?? []
      const platforms = state.platforms ?? []
      const activeGroups = useMemo(() => groups.filter(group => group.active !== false), [groups])
      const modal = useModalBehavior(onClose)

      useEffect(() => {
        if (platformGroupId === '' && activeGroups.length > 0) setPlatformGroupId(activeGroups[0].id)
      }, [platformGroupId, activeGroups])

      const act = useCallback(async (label, path, body) => {
        setBusy(label)
        try {
          await api(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
          await onReload()
          onToast('平台配置已更新', false)
          return true
        } catch (reason) {
          onToast(reason instanceof Error ? reason.message : String(reason), true)
          return false
        } finally {
          setBusy('')
        }
      }, [onReload, onToast])

      const addGroup = () => {
        if (groupName.trim() === '' || busy !== '') return
        void act('group-add', 'platform-groups', { name: groupName.trim() }).then(ok => { if (ok) setGroupName('') })
      }
      const movePlatform = async (platform, delta) => {
        if (busy !== '') return
        const siblings = platforms
          .filter(item => item.groupId === platform.groupId && item.active !== false)
          .sort((a, b) => Number(a.order) - Number(b.order))
        const index = siblings.findIndex(item => item.id === platform.id)
        const target = siblings[index + delta]
        if (target === undefined) return
        const selfOrder = Number(platform.order)
        const targetOrder = Number(target.order)
        // 两个平台排序值相同（手动填过重复值）时直接对调没效果，把对方排到后面一格。
        const nextSelf = selfOrder === targetOrder ? (delta < 0 ? targetOrder : targetOrder + 1) : targetOrder
        const nextTarget = selfOrder === targetOrder ? (delta < 0 ? targetOrder + 1 : targetOrder) : selfOrder
        setBusy('platform-move')
        try {
          await api(`platforms/${encodeURIComponent(platform.id)}`, { method: 'POST', body: JSON.stringify({ order: nextSelf }) })
          await api(`platforms/${encodeURIComponent(target.id)}`, { method: 'POST', body: JSON.stringify({ order: nextTarget }) })
          await onReload()
          onToast('平台顺序已更新', false)
        } catch (reason) {
          onToast(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setBusy('')
        }
      }

      const addPlatform = () => {
        if (platformName.trim() === '' || platformGroupId === '' || busy !== '') return
        void act('platform-add', 'platforms', {
          name: platformName.trim(),
          shortName: platformShort.trim() || platformName.trim(),
          groupId: platformGroupId,
        }).then(ok => { if (ok) { setPlatformName(''); setPlatformShort('') } })
      }

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog dsh-wb-platform-dialog', ...modal.dialogProps },
          h('div', { className: 'dsh-wb-dialog-head' },
            h('div', null,
              h('h2', { id: modal.titleId }, '平台配置'),
              h('p', null, '平台组和平台按团队实际情况维护；归档只隐藏，不删除历史数据。'),
            ),
            h('button', { className: 'dsh-wb-rqbar-toggle', type: 'button', onClick: onClose, title: '关闭', 'aria-label': '关闭' }, '×'),
          ),
          h('section', { className: 'dsh-wb-platform-section' },
            h('div', { className: 'dsh-wb-platform-section-head' },
              h('h3', null, '平台组'),
              h('span', { className: 'dsh-wb-count' }, String(groups.length)),
            ),
            h('div', { className: 'dsh-wb-platform-add' },
              h('input', {
                className: 'dsh-wb-input',
                value: groupName,
                placeholder: '新平台组名称，例如 服务端组',
                onChange: (event) => setGroupName(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) addGroup() },
              }),
              h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary', type: 'button', disabled: busy !== '' || groupName.trim() === '', onClick: addGroup }, '添加平台组'),
            ),
            h('div', { className: 'dsh-wb-platform-list' },
              groups.length === 0
                ? h('div', { className: 'dsh-wb-note' }, '还没有平台组。')
                : groups.map(group => h(PlatformGroupRow, {
                    key: group.id,
                    group,
                    busy: busy !== '',
                    onSave: (item, body) => act('group-save', `platform-groups/${encodeURIComponent(item.id)}`, body),
                    onArchive: (item, restore) => act('group-archive', `platform-groups/${encodeURIComponent(item.id)}/${restore ? 'restore' : 'archive'}`, {}),
                  })),
            ),
          ),
          h('section', { className: 'dsh-wb-platform-section' },
            h('div', { className: 'dsh-wb-platform-section-head' },
              h('h3', null, '平台 / 团队'),
              h('span', { className: 'dsh-wb-count' }, String(platforms.length)),
            ),
            h('div', { className: 'dsh-wb-platform-add' },
              h('input', {
                className: 'dsh-wb-input',
                value: platformName,
                placeholder: '新平台名称，例如 交易服务端',
                onChange: (event) => setPlatformName(event.target.value),
              }),
              h('input', {
                className: 'dsh-wb-input dsh-wb-input--short',
                value: platformShort,
                placeholder: '简称',
                onChange: (event) => setPlatformShort(event.target.value),
              }),
              h('select', {
                className: 'dsh-wb-select',
                value: platformGroupId,
                onChange: (event) => setPlatformGroupId(event.target.value),
              },
                activeGroups.length === 0
                  ? h('option', { value: '' }, '先建平台组')
                  : activeGroups.map(group => h('option', { key: group.id, value: group.id }, group.name)),
              ),
              h('button', {
                className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary',
                type: 'button',
                disabled: busy !== '' || platformName.trim() === '' || platformGroupId === '',
                onClick: addPlatform,
              }, '添加平台'),
            ),
            h('div', { className: 'dsh-wb-platform-list' },
              platforms.length === 0
                ? h('div', { className: 'dsh-wb-note' }, '还没有平台。')
                : platforms.map((platform, index) => h(PlatformRow, {
                    key: platform.id,
                    platform,
                    groups,
                    users: state.users ?? [],
                    busy: busy !== '',
                    first: index === 0,
                    last: index === platforms.length - 1,
                    onMove: (item, delta) => { void movePlatform(item, delta) },
                    onSave: (item, body) => act('platform-save', `platforms/${encodeURIComponent(item.id)}`, body),
                    onArchive: (item, restore) => act('platform-archive', `platforms/${encodeURIComponent(item.id)}/${restore ? 'restore' : 'archive'}`, {}),
                  })),
            ),
          ),
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn', type: 'button', onClick: onClose }, '关闭'),
          ),
        ),
      )
    }

    function BellIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      },
        h('path', { d: 'M6 9a6 6 0 1 1 12 0c0 6 2 7 2 9H4c0-2 2-3 2-9' }),
        h('path', { d: 'M10 21h4' }),
      )
    }

    function DesignRolePacks({ value, onChange, disabled }) {
      return h('div', { className: 'row gap-2 wrap' },
        ['lead', 'product', 'design', 'dev', 'qa', 'admin'].map(role => h('div', {
          className: `ptog${value.includes(role) ? ' on' : ''}`,
          key: role,
          role: 'button',
          tabIndex: disabled ? -1 : 0,
          style: disabled ? { opacity: .6, pointerEvents: 'none' } : undefined,
          onClick: () => onChange(value.includes(role) ? value.filter(item => item !== role) : [...value, role]),
        }, h('span', { className: 'box' }), roleLabel(role))),
      )
    }

    function SkillLibraryPage({ state, onReload, onToast }) {
      const roles = state.currentUser.roles ?? []
      const canPlan = roles.includes('lead') || roles.includes('admin')
      const [skills, setSkills] = useState([])
      const [loading, setLoading] = useState(true)
      const [filter, setFilter] = useState('all')
      const [query, setQuery] = useState('')
      const [selectedId, setSelectedId] = useState(null)
      const [mode, setMode] = useState('view')
      const [busy, setBusy] = useState('')
      const [error, setError] = useState('')
      const [form, setForm] = useState({ name: '', description: '', summary: '', content: '', rolePacks: ['product'], scope: canPlan ? 'global' : 'personal' })
      const [edit, setEdit] = useState({ description: '', rolePacks: [] })
      const [reviewForm, setReviewForm] = useState(null)

      const load = useCallback(async () => {
        try {
          const body = await api('skills')
          const list = body.skills ?? []
          setSkills(list)
          setSelectedId(current => (current !== null && list.some(skill => skill.id === current) ? current : (list[0]?.id ?? null)))
          setError('')
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => { void load() }, [load])

      const selected = skills.find(skill => skill.id === selectedId) ?? null
      useEffect(() => {
        setReviewForm(null)
        if (selected === null) return
        setEdit({ description: selected.description, rolePacks: [...(selected.rolePacks ?? [])] })
      }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

      const visible = useMemo(() => {
        const normalized = query.trim().toLowerCase()
        return skills.filter(skill => {
          if (normalized !== '' && !`${skill.name} ${skill.description}`.toLowerCase().includes(normalized)) return false
          if (filter === 'all') return true
          if (filter === 'pending') return skill.status === 'pending_review'
          if (filter === 'archived') return skill.status === 'archived'
          return (skill.rolePacks ?? []).includes(filter)
        })
      }, [skills, filter, query])

      const act = useCallback(async (label, path, body, success) => {
        setBusy(label)
        setError('')
        try {
          await api(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
          await load()
          onToast(success, false)
          return true
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          return false
        } finally {
          setBusy('')
        }
      }, [load, onToast])

      const startCreate = () => {
        setMode('create')
        setForm({ name: '', description: '', summary: '', content: '', rolePacks: ['product'], scope: canPlan ? 'global' : 'personal' })
      }

      const submitCreate = async () => {
        if (busy !== '' || form.name.trim() === '' || form.content.trim() === '') return
        const ok = await act('create', 'skills', {
          name: form.name.trim(),
          description: form.description.trim(),
          rolePacks: form.rolePacks,
          content: form.content,
          summary: form.summary.trim(),
          scope: form.scope,
        }, form.scope === 'global' ? '团队技能已创建并启用' : '个人技能已上传，等待负责人审核')
        if (ok) {
          setMode('view')
          await onReload()
        }
      }

      const submitVersion = async () => {
        if (selected === null || busy !== '' || form.content.trim() === '') return
        const ok = await act('version', `skills/${encodeURIComponent(selected.id)}/versions`, {
          content: form.content,
          summary: form.summary.trim(),
        }, canPlan && selected.scope === 'global' ? '新版本已发布' : '新版本已上传，等待负责人审核')
        if (ok) {
          setMode('view')
          await onReload()
        }
      }

      const submitEdit = async () => {
        if (selected === null || busy !== '') return
        const ok = await act('edit', `skills/${encodeURIComponent(selected.id)}`, {
          description: edit.description.trim(),
          rolePacks: edit.rolePacks,
        }, '技能信息已保存')
        if (ok) await onReload()
      }

      const submitReview = async (decision) => {
        if (selected === null || busy !== '') return
        const trimmed = (reviewForm?.comment ?? '').trim()
        if (decision === 'reject' && trimmed === '') return
        const ok = await act('review', `skills/${encodeURIComponent(selected.id)}/review`, { decision, comment: trimmed }, decision === 'approve' ? '技能已通过审核' : '技能已退回')
        if (ok) setReviewForm(null)
        await onReload()
      }

      const toggleArchive = async () => {
        if (selected === null || busy !== '') return
        const archived = selected.status === 'archived'
        const nextStatus = archived ? (selected.scope === 'global' || canPlan ? 'active' : 'pending_review') : 'archived'
        const ok = await act('archive', `skills/${encodeURIComponent(selected.id)}`, { status: nextStatus }, archived ? '技能已恢复' : '技能已归档')
        if (ok) await onReload()
      }

      const latest = selected?.versions?.[selected.versions.length - 1] ?? null
      const canEditSelected = selected !== null && (canPlan || selected.ownerId === state.currentUser.id)
      const statusTone = status => status === 'active' ? 'done' : status === 'pending_review' ? 'warn' : status === 'changes_requested' ? 'block' : status === 'archived' ? 'na' : 'idle'
      const statusGlyph = status => status === 'active' ? '✓' : status === 'pending_review' ? '◷' : status === 'changes_requested' ? '!' : status === 'archived' ? '—' : '○'
      const roleIcon = skill => (skill.rolePacks ?? []).includes('design') ? 'target' : (skill.rolePacks ?? []).includes('dev') ? 'code' : (skill.rolePacks ?? []).includes('qa') ? 'check-circle' : 'file'
      const filteredCounts = {
        all: skills.length,
        product: skills.filter(skill => (skill.rolePacks ?? []).includes('product')).length,
        design: skills.filter(skill => (skill.rolePacks ?? []).includes('design')).length,
        dev: skills.filter(skill => (skill.rolePacks ?? []).includes('dev')).length,
        qa: skills.filter(skill => (skill.rolePacks ?? []).includes('qa')).length,
      }
      const detail = mode === 'create'
        ? h('div', { className: 'detail' },
            h('div', { className: 'detail-hd' },
              h('div', { className: 'ic-badge' }, h(DesignIcon, { name: 'plus' })),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('h2', null, '新建技能'),
                h('div', { className: 'sub' }, '团队技能由负责人审核发布；个人技能上传后进入审核。'),
              ),
              h('button', { className: 'btn btn-sm btn-text', type: 'button', onClick: () => setMode('view') }, '取消'),
            ),
            h('div', { className: 'detail-bd' },
              h('div', { className: 'field' }, h('div', { className: 'label' }, '技能名', h('span', { className: 'req' }, '*')), h('input', { className: 'input', value: form.name, placeholder: '例如 req-acceptance（字母/数字/-/_）', onChange: event => setForm(current => ({ ...current, name: event.target.value })) })),
              h('div', { className: 'field' }, h('div', { className: 'label' }, '一句话说明'), h('input', { className: 'input', value: form.description, placeholder: '这个技能做什么', onChange: event => setForm(current => ({ ...current, description: event.target.value })) })),
              h('div', { className: 'field' }, h('div', { className: 'label' }, '适用角色'), h(DesignRolePacks, { value: form.rolePacks, onChange: rolePacks => setForm(current => ({ ...current, rolePacks })) })),
              canPlan ? h('div', { className: 'field' },
                h('div', { className: 'label' }, '发布范围'),
                h('div', { className: 'row gap-2 wrap' },
                  h('div', { className: `ptog${form.scope === 'global' ? ' on' : ''}`, role: 'button', tabIndex: 0, onClick: () => setForm(current => ({ ...current, scope: 'global' })) }, h('span', { className: 'box' }), '团队技能 · 直接发布'),
                  h('div', { className: `ptog${form.scope === 'personal' ? ' on' : ''}`, role: 'button', tabIndex: 0, onClick: () => setForm(current => ({ ...current, scope: 'personal' })) }, h('span', { className: 'box' }), '个人技能 · 待审核'),
                ),
              ) : null,
              h('div', { className: 'field' }, h('div', { className: 'label' }, '技能正文', h('span', { className: 'req' }, '*')), h('textarea', { className: 'textarea', style: { minHeight: '220px' }, value: form.content, placeholder: '支持 Markdown', onChange: event => setForm(current => ({ ...current, content: event.target.value })) })),
              h('div', { className: 'field' }, h('div', { className: 'label' }, '版本说明'), h('input', { className: 'input', value: form.summary, placeholder: '可选', onChange: event => setForm(current => ({ ...current, summary: event.target.value })) })),
            ),
            h('div', { className: 'rp-foot', style: { borderTop: '1px solid var(--line)' } },
              h('div', { className: 'spacer' }),
              h('button', { className: 'btn btn-sm btn-ghost', type: 'button', onClick: () => setMode('view') }, '取消'),
              h('button', { className: 'btn btn-sm btn-primary', type: 'button', disabled: busy !== '' || form.name.trim() === '' || form.content.trim() === '', onClick: () => { void submitCreate() } }, busy === 'create' ? '创建中…' : '创建技能'),
            ),
          )
        : mode === 'version' && selected !== null
          ? h('div', { className: 'detail' },
              h('div', { className: 'detail-hd' },
                h('div', { className: 'ic-badge' }, h(DesignIcon, { name: 'upload' })),
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('h2', null, `上传新版本 · ${selected.name}`),
                  h('div', { className: 'sub' }, `当前 v${latest?.version ?? 0}。${canPlan && selected.scope === 'global' ? '负责人上传团队技能版本会直接发布。' : '上传后等待负责人审核。'}`),
                ),
                h('button', { className: 'btn btn-sm btn-text', type: 'button', onClick: () => setMode('view') }, '取消'),
              ),
              h('div', { className: 'detail-bd' },
                h('div', { className: 'field' }, h('div', { className: 'label' }, '新版本正文', h('span', { className: 'req' }, '*')), h('textarea', { className: 'textarea', style: { minHeight: '260px' }, value: form.content, onChange: event => setForm(current => ({ ...current, content: event.target.value })) })),
                h('div', { className: 'field', style: { marginBottom: 0 } }, h('div', { className: 'label' }, '版本说明'), h('input', { className: 'input', value: form.summary, placeholder: '这次改了什么', onChange: event => setForm(current => ({ ...current, summary: event.target.value })) })),
              ),
              h('div', { className: 'rp-foot', style: { borderTop: '1px solid var(--line)' } },
                h('div', { className: 'spacer' }),
                h('button', { className: 'btn btn-sm btn-ghost', type: 'button', onClick: () => setMode('view') }, '取消'),
                h('button', { className: 'btn btn-sm btn-primary', type: 'button', disabled: busy !== '' || form.content.trim() === '', onClick: () => { void submitVersion() } }, busy === 'version' ? '上传中…' : '上传版本'),
              ),
            )
          : selected === null
            ? h('div', { className: 'empty-page' }, h(DesignIcon, { name: 'skills', size: 28 }), h('b', null, '选择一个技能'), h('span', null, '左侧点一个技能查看内容、版本和审核状态。'))
            : h('div', { className: 'detail' },
                h('div', { className: 'detail-hd' },
                  h('div', { className: 'ic-badge' }, h(DesignIcon, { name: roleIcon(selected) })),
                  h('div', { style: { flex: 1, minWidth: 0 } },
                    h('h2', null, selected.name, h('span', { className: 'badge' }, `v${latest?.version ?? 0}`)),
                    h('div', { className: 'sub' }, `${SKILL_SCOPE_LABELS[selected.scope] ?? selected.scope} · ${(selected.rolePacks ?? []).map(roleLabel).join(' / ') || '通用'} · owner ${state.users.find(user => user.id === selected.ownerId)?.name ?? selected.ownerId}`),
                  ),
                  h('div', { className: 'col gap-2', style: { alignItems: 'flex-end' } },
                    h(DesignChip, { tone: statusTone(selected.status), glyph: statusGlyph(selected.status) }, SKILL_STATUS_LABELS[selected.status] ?? selected.status),
                    canEditSelected ? h('div', { className: 'row gap-3', title: selected.status === 'archived' ? '恢复技能' : '归档技能' },
                      h('span', { className: 'tiny muted' }, selected.status === 'archived' ? '已归档' : '启用'),
                      h('span', { className: `switch${selected.status === 'archived' ? '' : ' on'}`, role: 'button', tabIndex: 0, onClick: () => { void toggleArchive() }, onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void toggleArchive() } } }),
                    ) : null,
                  ),
                ),
                h('div', { className: 'detail-bd' },
                  h('div', { className: 'detail-sec' },
                    h('div', { className: 'h' }, '描述'),
                    h('p', { className: 'spec-line', style: { fontSize: '12px', margin: '0 0 10px' } }, selected.description || '未填写说明'),
                    h('dl', { className: 'kv' },
                      h('dt', null, '适用角色'), h('dd', null, (selected.rolePacks ?? []).length === 0 ? '通用' : (selected.rolePacks ?? []).map(role => h(DesignChip, { key: role, tone: 'plain' }, roleLabel(role)))),
                      h('dt', null, '发布范围'), h('dd', null, SKILL_SCOPE_LABELS[selected.scope] ?? selected.scope),
                      h('dt', null, '最新版本'), h('dd', null, latest === undefined ? '还没有版本' : `v${latest.version} · ${relativeTime(latest.at)}`),
                    ),
                  ),
                  h('div', { className: 'detail-sec' },
                    h('div', { className: 'h' }, 'Changelog'),
                    (selected.versions ?? []).length === 0
                      ? h('div', { className: 'tiny muted' }, '还没有版本。')
                      : [...selected.versions].reverse().slice(0, 4).map(version => h('div', { className: 'chg-item', key: version.version },
                          h('span', { className: 'v' }, `v${version.version}`),
                          h('span', { className: 'd' }, version.summary || '无说明'),
                          h('span', { className: 't', style: { marginLeft: 'auto' } }, relativeTime(version.at)),
                        )),
                  ),
                  h('div', { className: 'detail-sec' },
                    h('div', { className: 'h' }, '内容预览', h('span', { className: 'r tiny muted' }, 'SKILL.md')),
                    h('div', { className: 'code-block' },
                      h('div', { className: 'cb-h' }, h(DesignIcon, { name: 'file', size: 12 }), `SKILL.md · v${latest?.version ?? 0}`),
                      h('pre', null, (latest?.content ?? '—').slice(0, 4000)),
                    ),
                  ),
                  h('div', { className: 'detail-sec' },
                    h('div', { className: 'h' }, '版本历史'),
                    (selected.versions ?? []).length === 0
                      ? h('div', { className: 'tiny muted' }, '还没有版本。')
                      : [...selected.versions].reverse().map((version, index) => h('div', { className: 'vline', key: version.version },
                          h('span', { className: 'v' }, `v${version.version}`),
                          h('span', { className: 'd' }, version.summary || '无说明'),
                          index === 0 ? h('span', { className: 'badge', style: { marginLeft: 'auto' } }, '当前') : h('span', { className: 'tiny muted', style: { marginLeft: 'auto' } }, relativeTime(version.at)),
                        )),
                  ),
                  canEditSelected
                    ? h('div', { className: 'detail-sec' },
                        h('div', { className: 'h' }, '编辑信息'),
                        h('div', { className: 'field' }, h('input', { className: 'input', value: edit.description, placeholder: '技能说明', onChange: event => setEdit(current => ({ ...current, description: event.target.value })) })),
                        h('div', { className: 'field' }, h('div', { className: 'label' }, '适用角色'), h(DesignRolePacks, { value: edit.rolePacks, onChange: rolePacks => setEdit(current => ({ ...current, rolePacks })) })),
                        h('button', { className: 'btn btn-sm', type: 'button', disabled: busy !== '', onClick: () => { void submitEdit() } }, busy === 'edit' ? '保存中…' : '保存说明与角色'),
                      )
                    : null,
                  reviewForm !== null
                    ? h('div', { className: 'detail-sec' },
                        h('div', { className: 'h' }, reviewForm.decision === 'approve' ? '审核意见（可留空）' : '退回原因'),
                        h('textarea', {
                          className: 'textarea',
                          style: { minHeight: '70px' },
                          value: reviewForm.comment,
                          maxLength: 500,
                          onChange: event => setReviewForm(current => ({ ...current, comment: event.target.value })),
                        }),
                        h('div', { className: 'row gap-2', style: { marginTop: '8px' } },
                          h('button', { className: 'btn btn-sm btn-ghost', type: 'button', disabled: busy !== '', onClick: () => setReviewForm(null) }, '取消'),
                          h('button', {
                            className: 'btn btn-sm btn-primary',
                            type: 'button',
                            disabled: busy !== '' || (reviewForm.decision === 'reject' && reviewForm.comment.trim() === ''),
                            onClick: () => { void submitReview(reviewForm.decision) },
                          }, busy === 'review' ? '提交中…' : reviewForm.decision === 'approve' ? '确认通过' : '确认退回'),
                        ),
                      )
                    : null,
                ),
                h('div', { className: 'rp-foot', style: { borderTop: '1px solid var(--line)' } },
                  canEditSelected ? h('button', { className: 'btn btn-sm btn-ghost', type: 'button', disabled: busy !== '', onClick: () => { void toggleArchive() } }, selected.status === 'archived' ? '恢复技能' : '停用') : null,
                  h('div', { className: 'spacer' }),
                  selected.status === 'pending_review' && canPlan
                    ? h('span', { className: 'row gap-2' },
                        h('button', { className: 'btn btn-sm', type: 'button', disabled: busy !== '', onClick: () => setReviewForm({ decision: 'reject', comment: '' }) }, '退回'),
                        h('button', { className: 'btn btn-sm btn-primary', type: 'button', disabled: busy !== '', onClick: () => setReviewForm({ decision: 'approve', comment: '' }) }, '通过'),
                      )
                    : null,
                  canEditSelected ? h('button', { className: 'btn btn-sm', type: 'button', disabled: busy !== '', onClick: () => { setMode('version'); setForm(current => ({ ...current, content: latest?.content ?? '', summary: '' })) } }, '上传新版本') : null,
                ),
              )
      return h('div', { className: 'page' },
        error !== '' ? h('div', { className: 'banner banner--mock', style: { marginBottom: '14px' } }, h(DesignIcon, { name: 'alert' }), h('span', null, error)) : null,
        h('div', { className: 'toolbar' },
          h('div', { className: 'seg' },
            [['all', `全部 ${filteredCounts.all}`], ['product', `产品 ${filteredCounts.product}`], ['design', `设计 ${filteredCounts.design}`], ['dev', `开发 ${filteredCounts.dev}`], ['qa', `测试 ${filteredCounts.qa}`]].map(([key, label]) =>
              h('button', { key, type: 'button', className: filter === key ? 'active' : '', onClick: () => setFilter(key) }, label)),
          ),
          h('div', { className: 'spacer' }),
          h('div', { className: 'search', style: { width: '200px' } },
            h(DesignIcon, { name: 'search' }),
            h('input', { value: query, placeholder: '搜索技能', 'aria-label': '搜索技能', onChange: event => setQuery(event.target.value) }),
          ),
          h('button', { className: 'btn btn-sm btn-primary', type: 'button', onClick: startCreate }, h(DesignIcon, { name: 'plus' }), '新建技能'),
        ),
        h('div', { className: 'skill-layout' },
          h('div', { className: 'skill-list' },
            loading
              ? h('div', { className: 'empty-page', style: { padding: '30px 16px' } }, h(DesignIcon, { name: 'refresh', size: 22 }), h('b', null, '正在读取技能'))
              : visible.length === 0
                ? h('div', { className: 'empty-page', style: { padding: '30px 16px' } }, h(DesignIcon, { name: 'skills', size: 22 }), h('b', null, '没有匹配技能'), h('span', null, '换个筛选或搜索词。'))
                : visible.map(skill => {
                    const latestVersion = skill.versions?.[skill.versions.length - 1]
                    return h('div', {
                      className: `srow${skill.id === selectedId && mode === 'view' ? ' sel' : ''}`,
                      key: skill.id,
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => { setSelectedId(skill.id); setMode('view') },
                      onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(skill.id); setMode('view') } },
                    },
                      h('div', { className: 'ic-badge' }, h(DesignIcon, { name: roleIcon(skill) })),
                      h('div', { className: 'mid' },
                        h('div', { className: 'nm' }, skill.name, h('span', { className: 'badge' }, `v${latestVersion?.version ?? 0}`)),
                        h('div', { className: 'sub' },
                          h('span', null, (skill.rolePacks ?? []).length === 0 ? '通用' : (skill.rolePacks ?? []).map(roleLabel).join(' / ')),
                          h('span', { className: 'sep' }, '·'),
                          h('span', null, SKILL_SCOPE_LABELS[skill.scope] ?? skill.scope),
                          h('span', { className: 'sep' }, '·'),
                          h(DesignChip, { tone: statusTone(skill.status), glyph: statusGlyph(skill.status), style: { height: '16px', padding: '0 5px' } }, SKILL_STATUS_LABELS[skill.status] ?? skill.status),
                        ),
                      ),
                    )
                  }),
          ),
          detail,
        ),
      )
    }

