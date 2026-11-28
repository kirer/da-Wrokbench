    function CreateRequirementDialog({ ctx, state, onClose, onCreated, onToast }) {
      const [title, setTitle] = useState('')
      const [background, setBackground] = useState('')
      const [busy, setBusy] = useState(false)
      const [step, setStep] = useState('')
      const [error, setError] = useState('')
      const inputRef = useRef(null)
      const modal = useModalBehavior(onClose, !busy)

      useEffect(() => { inputRef.current?.focus() }, [])

      const submit = useCallback(async () => {
        const value = title.trim()
        if (value === '' || busy) return
        setBusy(true)
        setError('')
        let requirement = null
        try {
          setStep('创建需求记录')
          const created = await api('requirements', { method: 'POST', body: JSON.stringify({ title: value }) })
          requirement = created.requirement
          // 选填的背景先写进需求正文，省得建完再进会话补一遍（失败不阻断创建）。
          if (background.trim() !== '') {
            try {
              await api(`requirements/${encodeURIComponent(requirement.id)}/document`, { method: 'POST', body: JSON.stringify({ body: background.trim() }) })
            } catch { /* 背景写入失败不影响需求创建 */ }
          }
          setStep('准备迭代目录')
          const done = await finishRequirementCreation(ctx, requirement, state)
          // 建完先落在需求页，会话就在右侧坞里；不切到 DSH 的会话工作区。
          setStep('打开需求页')
          onToast(`${done.requirement.code} ${done.requirement.title} 已创建`, false)
          onCreated(done.requirement)
        } catch (reason) {
          if (requirement !== null) await markCreationFailed(requirement, reason)
          setError(reason instanceof Error ? reason.message : String(reason))
          setStep('')
          setBusy(false)
        }
      }, [title, background, busy, ctx, onCreated, onToast, state])

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog', ...modal.dialogProps },
          h('h2', { id: modal.titleId }, '新建需求'),
          h('p', null, `迭代 ${state.iteration?.code ?? '—'} · 只填需求名称；创建后在会话里说清楚背景、页面和验收，模型会整理进需求文档。`),
          h('input', {
            ref: inputRef,
            className: 'dsh-wb-input',
            value: title,
            placeholder: '例如：会员积分改版',
            maxLength: 200,
            disabled: busy,
            onChange: (event) => setTitle(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) void submit() },
          }),
          h('details', { className: 'dsh-wb-note', style: { marginTop: '8px' } },
            h('summary', { style: { cursor: 'pointer' } }, '补充背景（可选）'),
            h('textarea', {
              className: 'dsh-wb-input',
              rows: 3,
              value: background,
              maxLength: 2000,
              disabled: busy,
              placeholder: '一两句话说明背景，创建后会写进需求正文',
              style: { marginTop: '6px', resize: 'vertical' },
              onChange: (event) => setBackground(event.target.value),
            }),
          ),
          busy ? h('div', { className: 'dsh-wb-progress' }, h('span', { className: 'dsh-wb-spinner' }), `${step}…`) : null,
          error !== '' ? h('div', { className: 'dsh-wb-dialog-err' }, error) : null,
          h('div', { className: 'dsh-wb-note', style: { marginTop: '10px' } }, `顶级文件夹：${state.baseDir}`),
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: onClose }, '取消'),
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy || title.trim() === '', onClick: submit }, busy ? '创建中…' : '创建需求'),
          ),
        ),
      )
    }

    function suggestIterationCode(iterations) {
      const sorted = [...(iterations ?? [])].sort((a, b) => b.code.localeCompare(a.code))
      const last = sorted[0]
      if (!last) return ''
      const match = /^(.*?)(\d+)$/.exec(last.code)
      if (!match) return ''
      const digits = match[2]
      return `${match[1]}${String(Number(digits) + 1).padStart(digits.length, '0')}`
    }

    function ProjectDialog({ project, onClose, onSubmit, onToast }) {
      const editing = Boolean(project)
      const [name, setName] = useState(project?.name ?? '')
      const [description, setDescription] = useState(project?.description ?? '')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const nameRef = useRef(null)
      const modal = useModalBehavior(onClose, !busy)

      useEffect(() => {
        nameRef.current?.focus()
        nameRef.current?.select?.()
      }, [])

      const submit = useCallback(async () => {
        if (busy || name.trim() === '') return
        setBusy(true)
        setError('')
        try {
          const body = editing
            ? await api(`projects/${encodeURIComponent(project.id)}`, {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), description: description.trim() }),
              })
            : await api('projects', {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), description: description.trim() }),
              })
          onToast(editing ? '项目已更新' : `项目「${body.project?.name ?? name.trim()}」已创建并切换`, false)
          onSubmit(body.project ?? null, editing)
          onClose()
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setBusy(false)
        }
      }, [busy, name, description, editing, project, onSubmit, onToast, onClose])

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog', ...modal.dialogProps },
          h('h2', { id: modal.titleId }, editing ? `项目设置 · ${project.name}` : '新建项目'),
          h('p', null, editing
            ? '改名只影响展示，项目下的迭代、需求和会话都保持不变。'
            : '项目是迭代的上一层：新建后自动切换过去，之后建的迭代都挂在这个项目下。'),
          h('div', { style: { display: 'grid', gap: '8px' } },
            h('input', {
              ref: nameRef,
              className: 'dsh-wb-input',
              value: name,
              placeholder: '项目名称，例如 会员增长',
              maxLength: 40,
              disabled: busy,
              onChange: event => setName(event.target.value),
            }),
            h('input', {
              className: 'dsh-wb-input',
              value: description,
              placeholder: '一句话说明（可选）',
              maxLength: 120,
              disabled: busy,
              onChange: event => setDescription(event.target.value),
            }),
          ),
          error !== '' ? h('div', { className: 'dsh-wb-dialog-err' }, error) : null,
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: onClose }, '取消'),
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy || name.trim() === '', onClick: () => { void submit() } },
              busy ? '保存中…' : editing ? '保存' : '创建项目'),
          ),
        ),
      )
    }

    function CreateIterationDialog({ state, onClose, onReload, onToast }) {
      const [code, setCode] = useState(() => suggestIterationCode(state.iterations))
      const [name, setName] = useState('')
      const [startDate, setStartDate] = useState('')
      const [endDate, setEndDate] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const codeRef = useRef(null)
      const modal = useModalBehavior(onClose, !busy)
      const fmtDate = (value) => value.toISOString().slice(0, 10)
      const applyWeeks = (weeks) => {
        const start = startDate !== '' ? startDate : fmtDate(new Date())
        const base = new Date(`${start}T00:00:00`)
        if (Number.isNaN(base.getTime())) return
        setStartDate(start)
        setEndDate(fmtDate(new Date(base.getTime() + weeks * 7 * 86400000)))
      }
      const dateInvalid = startDate !== '' && endDate !== '' && endDate < startDate

      useEffect(() => { codeRef.current?.focus() }, [])

      const submit = useCallback(async () => {
        if (busy || code.trim() === '' || dateInvalid) return
        setBusy(true)
        setError('')
        let created = false
        try {
          await api('iterations', {
            method: 'POST',
            body: JSON.stringify({ code: code.trim(), name: name.trim(), startDate, endDate, projectId: state.project?.id }),
          })
          created = true
          // 迭代目录就是之后需求会话的工作区，建迭代时先把目录落好。
          await ensureChildDirectory(state.baseDir, code.trim())
          await onReload()
          onToast(`迭代 ${code.trim()} 已创建并切换`, false)
          onClose()
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason)
          // 迭代已经建成、只是本机目录没落好：不能让人再点一次创建（服务端会报重名）。
          if (created) {
            await onReload().catch(() => {})
            onToast(`迭代已创建，但本机目录没建好：${message}`, true)
            onClose()
            return
          }
          setError(message)
          setBusy(false)
        }
      }, [busy, code, name, startDate, endDate, dateInvalid, onReload, onToast, onClose, state.baseDir, state.project])

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog', ...modal.dialogProps },
          h('h2', { id: modal.titleId }, '新建迭代'),
          h('p', null, `在「${state.project?.name ?? '当前项目'}」下新建迭代。创建后自动切换到新迭代，并在当前用户的顶级文件夹下建同名目录。需求编号使用迭代编码的短码。`),
          h('div', { style: { display: 'grid', gap: '8px' } },
            h('input', {
              ref: codeRef,
              className: 'dsh-wb-input',
              value: code,
              placeholder: '迭代编码，例如 2026-S12',
              maxLength: 40,
              disabled: busy,
              onChange: (event) => setCode(event.target.value),
            }),
            h('input', {
              className: 'dsh-wb-input',
              value: name,
              placeholder: '迭代名称，例如 双十二会员增长',
              maxLength: 80,
              disabled: busy,
              onChange: (event) => setName(event.target.value),
            }),
            h('div', { style: { display: 'flex', gap: '8px' } },
              h('input', { className: 'dsh-wb-input', type: 'date', value: startDate, disabled: busy, onChange: (event) => setStartDate(event.target.value) }),
              h('input', { className: 'dsh-wb-input', type: 'date', value: endDate, disabled: busy, onChange: (event) => setEndDate(event.target.value) }),
            ),
            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: () => applyWeeks(2) }, '两周迭代'),
              h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: () => applyWeeks(4) }, '四周迭代'),
            ),
            dateInvalid ? h('div', { className: 'dsh-wb-dialog-err' }, '结束日期不能早于开始日期') : null,
          ),
          error !== '' ? h('div', { className: 'dsh-wb-dialog-err' }, error) : null,
          h('div', { className: 'dsh-wb-note', style: { marginTop: '10px' } }, `顶级文件夹：${state.baseDir}`),
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: onClose }, '取消'),
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy || code.trim() === '' || dateInvalid, onClick: () => { void submit() } }, busy ? '创建中…' : '创建迭代'),
          ),
        ),
      )
    }

    function IterationManageDialog({ state, onClose, onReload, onToast }) {
      const iteration = state.iteration
      const [name, setName] = useState(iteration.name)
      const [phase, setPhase] = useState(iteration.phase ?? '')
      const [status, setStatus] = useState(iteration.status ?? 'planning')
      const [startDate, setStartDate] = useState(iteration.startDate ?? '')
      const [endDate, setEndDate] = useState(iteration.endDate ?? '')
      const [reviewerIds, setReviewerIds] = useState(() => Array.isArray(iteration.reviewerIds) ? iteration.reviewerIds : [])
      const [confirmArchive, setConfirmArchive] = useState(false)
      const [busy, setBusy] = useState('')
      const modal = useModalBehavior(onClose, busy === '')
      const candidates = (state.users ?? []).filter(user => (
        user.active !== false && (user.roles ?? []).some(role => ['lead', 'product', 'admin'].includes(role))
      ))
      const toggleReviewer = (id) => {
        setReviewerIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
      }
      const save = async (patch = {}) => {
        setBusy('save')
        try {
          await api(`iterations/${encodeURIComponent(iteration.id)}`, {
            method: 'POST',
            body: JSON.stringify({ name: name.trim(), phase: phase.trim(), status, startDate, endDate, reviewerIds, ...patch }),
          })
          await onReload()
          onToast('迭代已更新', false)
          onClose()
        } catch (reason) {
          onToast(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setBusy('')
        }
      }
      const archive = async (restore) => {
        setBusy('archive')
        try {
          await api(`iterations/${encodeURIComponent(iteration.id)}/${restore ? 'restore' : 'archive'}`, { method: 'POST', body: '{}' })
          await onReload()
          onToast(restore ? '迭代已恢复' : '迭代已归档', false)
          onClose()
        } catch (reason) {
          onToast(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setBusy('')
        }
      }
      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog', ...modal.dialogProps },
          h('h2', { id: modal.titleId }, `迭代设置 · ${iteration.code}`),
          h('p', null, '归档只从切换列表隐藏，历史需求和会话仍保留。'),
          h('div', { style: { display: 'grid', gap: '8px' } },
            h('input', { className: 'dsh-wb-input', value: name, placeholder: '迭代名称', maxLength: 80, onChange: (event) => setName(event.target.value) }),
            h('input', { className: 'dsh-wb-input', value: phase, placeholder: '阶段，例如 需求评审', maxLength: 80, onChange: (event) => setPhase(event.target.value) }),
            h('select', { className: 'dsh-wb-select', value: status, onChange: (event) => setStatus(event.target.value) },
              Object.entries(ITERATION_STATUS_LABELS).map(([value, label]) => h('option', { key: value, value }, label)),
            ),
            h('div', { style: { display: 'flex', gap: '8px' } },
              h('input', { className: 'dsh-wb-input', type: 'date', value: startDate, onChange: (event) => setStartDate(event.target.value) }),
              h('input', { className: 'dsh-wb-input', type: 'date', value: endDate, onChange: (event) => setEndDate(event.target.value) }),
            ),
            h('div', { className: 'dsh-wb-reviewer-picker' },
              h('div', { className: 'dsh-wb-reviewer-picker-head' },
                h('span', null, '默认会签人'),
                h('span', { className: 'dsh-wb-count' }, reviewerIds.length === 0 ? '单人评审' : `${reviewerIds.length} 人`),
              ),
              h('div', { className: 'dsh-wb-reviewer-options' },
                candidates.map(user => h('label', { key: user.id, className: 'dsh-wb-reviewer-option' },
                  h('input', {
                    type: 'checkbox',
                    checked: reviewerIds.includes(user.id),
                    onChange: () => toggleReviewer(user.id),
                  }),
                  user.name,
                )),
              ),
              h('div', { className: 'dsh-wb-reviewer-hint' }, '新需求会默认带这些会签人；全部通过才算评审通过。'),
            ),
          ),
          confirmArchive
            ? h('div', { className: 'dsh-wb-note', style: { color: 'var(--dsw-alias-state-warn-label,#8a5a00)', marginTop: '8px' } }, '确认归档后：该迭代从「切换列表」隐藏；进行中的需求与会话保留，但不再显示在当前列表；已提交的评审/排期记录不受影响。')
            : null,
          h('div', { className: 'dsh-wb-dialog-actions' },
            iteration.archived === true
              ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--ghost', type: 'button', disabled: busy !== '', onClick: () => { void archive(true) } }, '恢复迭代')
              : h('button', {
                  className: `dsh-wb-btn${confirmArchive ? ' dsh-wb-btn--primary' : ' dsh-wb-btn--ghost'}`,
                  type: 'button',
                  disabled: busy !== '',
                  onClick: () => { if (!confirmArchive) { setConfirmArchive(true); return } void archive(false) },
                }, confirmArchive ? '确认归档' : '归档'),
            confirmArchive ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--ghost', type: 'button', disabled: busy !== '', onClick: () => setConfirmArchive(false) }, '先不归档') : null,
            h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy !== '', onClick: onClose }, '取消'),
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy !== '' || name.trim() === '', onClick: () => { void save() } }, busy === 'save' ? '保存中…' : '保存'),
          ),
        ),
      )
    }

    // 需求页的会话都按同一套流程创建：迭代目录 → DSH 工作区 → 会话 →
    // 标题 → 服务端会话记录。进入需求页时按身份自动调用；引导信息由会话开场白给出。
    async function createRequirementSession(ctx, state, requirement, type) {
      const sessionRoot = String(state?.iterationDir ?? state?.baseDir ?? '').replace(/\/+$/, '')
      const baseDir = String(state?.baseDir ?? '').replace(/\/+$/, '')
      if (sessionRoot === '') throw new Error('还没有可用的迭代目录')
      const split = splitDirectory(sessionRoot)
      if (sessionRoot !== baseDir && split !== null) await ensureChildDirectory(split.parent, split.name)
      const workspace = await ctx.workspaces.create({ path: sessionRoot })
      const workspaceId = workspace.workspaceId
      const sessionId = await ctx.sessions.create({ workspaceId })
      await ctx.sessions.using(sessionId, { source: 'workbench' }, async (reference) => {
        const result = await reference.binding.session.rename(`${requirement.title} · ${sessionTypeLabel(type)}`)
        if (result.ok !== true) throw new Error(result.error?.message || '会话标题设置失败')
      })
      // 服务端只存会话记录；DSH 会话 ID 和本机路径由 host 半端写进本机映射。
      const body = await api(`requirements/${encodeURIComponent(requirement.id)}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          label: `${sessionTypeLabel(type)}会话`,
          dshSessionId: sessionId,
          workspaceId,
          folderPath: sessionRoot,
        }),
      })
      return { sessionId, requirement: body.requirement }
    }

