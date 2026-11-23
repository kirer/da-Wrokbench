/**
 * dsh-workbench POC — browser half.
 *
 * Registers:
 *   - a left sidebar entry + main panel: 研发工作台
 *   - a right sidebar tab: 需求 (requirement context for the open session)
 *
 * The visual language follows DSH Design Studio: DSW alias tokens, compact
 * rows, 6–8 px radii, monospace codes.
 */

window.__ModuleLoader__.load({
  id: 'dsh-workbench',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    let react = null
    try { react = require('react') } catch (_) { react = null }

    const INJECT = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'workspaces', 'uiWorkspace', 'layout']
    if (!react) {
      exports.apply = () => {}
      exports.inject = INJECT
      return module.exports
    }

    const h = react.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = react

    const PANEL_ID = 'workbench'
    const TAB_ID = 'workbench-requirement'
    const TAB_KIND = 'workbench-requirement'
    const DESIGN_TAB_ID = 'workbench-design'
    const DESIGN_TAB_KIND = 'workbench-design'
    const API = '/dsh-workbench/api/'
    // 桌面端 dsh-app://app 下 Cookie 可能不持久，登录时把 token 存进 localStorage，
    // 之后所有请求带 Authorization: Bearer，服务端两者都接受。
    const TOKEN_KEY = 'dshWorkbenchAuthToken'
    function readToken() {
      try { return String(window.localStorage.getItem(TOKEN_KEY) || '') } catch (_) { return '' }
    }
    function writeToken(token) {
      try {
        if (typeof token === 'string' && token !== '') window.localStorage.setItem(TOKEN_KEY, token)
        else window.localStorage.removeItem(TOKEN_KEY)
      } catch (_) { /* 无 localStorage 时退回 Cookie */ }
    }
    const DS_API = '/dsh-workbench-design/api/'
    // 内嵌的 Design Studio 画布按 package-local chunk 懒加载；加载完再渲染右栏 tab。
    let designStudioState = { runtime: null, error: null }
    const designStudioListeners = new Set()

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

    // 斜杠命令的结果本来只写进会话日志；这里补一个轻量 toast，让 /wb-* 的执行结果
    // 在 composer 清空后仍然可见（失败也保留，便于纠正参数）。
    let commandToastSeq = 0
    let commandToastState = null
    const commandToastListeners = new Set()

    function publishCommandToast(next) {
      commandToastState = next
      for (const listener of [...commandToastListeners]) listener()
    }

    function useCommandToast() {
      const [snapshot, setSnapshot] = useState(commandToastState)
      useEffect(() => {
        const listener = () => setSnapshot(commandToastState)
        commandToastListeners.add(listener)
        listener()
        return () => { commandToastListeners.delete(listener) }
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

    const CSS = `
.dsh-wb-page{height:100%;min-height:0;overflow:auto;box-sizing:border-box;padding:24px 28px 40px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-family:var(--dsw-font-family);font-size:13px;line-height:1.45}
.dsh-wb-page *{box-sizing:border-box}
.dsh-wb-top{display:flex;align-items:flex-start;gap:16px;margin-bottom:20px}
.dsh-wb-top-main{min-width:250px;flex:1 1 auto}
.dsh-wb-eyebrow{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-wb-title{font-size:22px;line-height:1.2;font-weight:650;letter-spacing:-.01em;margin:0}
.dsh-wb-title-sub{margin-top:6px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-top-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:nowrap;gap:7px;margin-left:auto;flex:none}
.dsh-wb-popwrap{position:relative;display:inline-flex}
.dsh-wb-iconbtn{position:relative;height:30px;min-width:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}
.dsh-wb-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-wb-bell-badge{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-state-error-primary,#e05a5a);color:#fff;font-size:9.5px;line-height:15px;text-align:center;font-weight:650}
.dsh-wb-popover{position:absolute;right:0;top:calc(100% + 7px);z-index:60;width:min(380px,88vw);max-height:min(70vh,560px);overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent,0 18px 50px rgba(0,0,0,.35));padding:6px}
.dsh-wb-popover-head{display:flex;align-items:center;gap:8px;padding:7px 8px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:4px}
.dsh-wb-popover-head b{font-size:12px;font-weight:650}
.dsh-wb-popover-head .dsh-wb-btn{margin-left:auto}
.dsh-wb-notif{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;padding:8px 9px;cursor:pointer}
.dsh-wb-notif-groups{display:flex;gap:5px;flex-wrap:wrap;padding:0 0 8px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:4px}
.dsh-wb-notif-group{height:22px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;cursor:pointer;white-space:nowrap}
.dsh-wb-notif-group:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-notif-group.is-active{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.dsh-wb-notif:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-notif.is-unread{background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-notif-title{font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:6px}
.dsh-wb-notif-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}
.dsh-wb-notif-body{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.dsh-wb-notif-time{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:9.5px;color:var(--dsw-alias-label-tertiary);margin-top:2px}
.dsh-wb-dev-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.dsh-wb-devcard{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);padding:8px 9px;min-width:0;display:flex;flex-direction:column;gap:4px}
.dsh-wb-devcard-head{display:flex;align-items:center;gap:6px;min-width:0}
.dsh-wb-devcard-head b{font-size:11.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-devcard-state{margin-left:auto;flex:none;font-size:9.5px;font-weight:650;padding:2px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dsh-wb-devcard-state.is-done{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary,rgba(70,190,120,.12))}
.dsh-wb-devcard-state.is-progress{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary,rgba(100,150,255,.12))}
.dsh-wb-devcard-meta{font-size:10.5px;color:var(--dsw-alias-label-tertiary);line-height:1.45;overflow-wrap:anywhere}
.dsh-wb-devcard-meta a{color:var(--dsw-alias-brand-primary);text-decoration:none}
.dsh-wb-devcard-meta a:hover{text-decoration:underline}
.dsh-wb-testrow{display:flex;align-items:flex-start;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:7px 9px;background:var(--dsw-alias-bg-base);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-testrow+.dsh-wb-testrow{margin-top:6px}
.dsh-wb-testrow .state{flex:none;font-size:9.5px;font-weight:650;padding:2px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-testrow .state.is-passed{color:var(--dsw-alias-state-success-primary)}
.dsh-wb-testrow .state.is-failed{color:var(--dsw-alias-state-error-primary)}
.dsh-wb-testrow .state.is-running{color:var(--dsw-alias-state-business-primary)}
.dsh-wb-testrow-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.dsh-wb-testrow-main span{font-size:10.5px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.dsh-wb-testrow a{color:var(--dsw-alias-brand-primary);text-decoration:none}
.dsh-wb-reviewline{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-reviewline .dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}
.dsh-wb-reviewline .dot.is-pending{background:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}
.dsh-wb-reviewline .dot.is-rejected{background:var(--dsw-alias-state-error-primary)}
.dsh-wb-dialog.dsh-wb-skill-dialog{width:min(980px,100%);height:min(88vh,860px);display:flex;flex-direction:column;overflow:hidden}
.dsh-wb-skill-body{display:grid;grid-template-columns:270px minmax(0,1fr);gap:12px;min-height:0;flex:1;margin-top:10px}
.dsh-wb-skill-list{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:auto;min-height:0;background:var(--dsw-alias-bg-base)}
.dsh-wb-skill-filter{display:flex;gap:5px;flex-wrap:wrap;padding:7px;border-bottom:1px solid var(--dsw-alias-border-l1);position:sticky;top:0;background:var(--dsw-alias-bg-base);z-index:1}
.dsh-wb-skill-filter button{height:23px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:10px;cursor:pointer}
.dsh-wb-skill-filter button.is-on{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-bg-base,#fff);font-weight:600}
.dsh-wb-skill-item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;padding:8px 9px;cursor:pointer}
.dsh-wb-skill-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-skill-item.is-selected{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.dsh-wb-skill-item b{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;font-weight:600;overflow-wrap:anywhere}
.dsh-wb-skill-item span{font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-skill-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
.dsh-wb-skill-tag{font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary)}
.dsh-wb-skill-tag.is-pending{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-secondary));border-color:var(--dsw-alias-state-warn-secondary,var(--dsw-alias-border-l2))}
.dsh-wb-skill-tag.is-active{color:var(--dsw-alias-state-success-primary)}
.dsh-wb-skill-detail{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);padding:12px;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:8px}
.dsh-wb-skill-detail h3{font-size:14px;font-weight:650;margin:0;overflow-wrap:anywhere}
.dsh-wb-skill-detail p{margin:0;font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.55}
.dsh-wb-skill-form{display:flex;flex-direction:column;gap:8px}
.dsh-wb-skill-form>.dsh-wb-btn{align-self:flex-start;width:auto}
.dsh-wb-textarea{width:100%;min-height:150px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:8px 10px;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;line-height:1.55;outline:none;resize:vertical}
.dsh-wb-textarea:focus{border-color:var(--dsw-alias-border-selected)}
.dsh-wb-textarea:focus-visible,.dsh-wb-select:focus-visible,.dsh-wb-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-wb-skill-version{display:flex;gap:7px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);border-top:1px dashed var(--dsw-alias-border-l1);padding-top:5px;flex-wrap:wrap}
.dsh-wb-skill-version b{font-family:var(--dsw-font-mono,ui-monospace,monospace);color:var(--dsw-alias-label-secondary);font-weight:600}
.dsh-wb-skill-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-select{height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 8px;font-size:12px;outline:none}
.dsh-wb-select:focus{border-color:var(--dsw-alias-border-selected)}
.dsh-wb-mock{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px;border-radius:999px;border:1px solid var(--dsw-alias-state-warn-secondary,var(--dsw-alias-border-l2));background:var(--dsw-alias-state-warn-tertiary,rgba(245,180,60,.12));color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-secondary));font-size:10px;font-weight:650;letter-spacing:.04em}
.dsh-wb-btn{height:30px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-elevated-fill,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.dsh-wb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-btn:disabled{opacity:.45;cursor:not-allowed}
.dsh-wb-btn--primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));border-color:transparent;color:var(--dsw-alias-bg-base,#fff);font-weight:600}
.dsh-wb-btn--primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary))}
.dsh-wb-btn--ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-tertiary);padding:0 6px}
.dsh-wb-btn--ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-wb-btn--sm{height:26px;padding:0 9px;font-size:11px}
.dsh-wb-stats{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:18px}
.dsh-wb-stat{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);padding:11px 13px;min-width:0}
.dsh-wb-stat-label{font-size:11px;color:var(--dsw-alias-label-tertiary);display:flex;align-items:center;gap:6px}
.dsh-wb-stat-value{font-size:22px;font-weight:650;line-height:1.15;margin-top:5px;font-variant-numeric:tabular-nums}
.dsh-wb-stat-value small{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary);margin-left:4px}
.dsh-wb-grid{display:grid;grid-template-columns:minmax(420px,1.25fr) minmax(340px,.9fr);gap:16px;align-items:start}
.dsh-wb-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);overflow:hidden;min-width:0}
.dsh-wb-panel-head{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid var(--dsw-alias-separator-primary,var(--dsw-alias-border-l1));font-size:12px;font-weight:600}
.dsh-wb-panel-head .dsh-wb-count{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:400}
.dsh-wb-row{display:grid;grid-template-columns:64px minmax(0,1fr) auto auto;gap:10px;align-items:center;width:100%;text-align:left;border:0;border-bottom:1px solid var(--dsw-alias-separator-primary,var(--dsw-alias-border-l1));background:transparent;color:inherit;padding:11px 13px;cursor:pointer;font:inherit}
.dsh-wb-row:last-child{border-bottom:0}
.dsh-wb-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-row.is-selected{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.dsh-wb-code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dsh-wb-row-main{min-width:0;display:flex;flex-direction:column;gap:3px}
.dsh-wb-row-title{font-size:13px;font-weight:550;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-row-sub{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);font-size:10.5px;line-height:1;white-space:nowrap;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-chip .g{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10px}
.dsh-wb-chip--idle{color:var(--dsw-alias-label-tertiary)}
.dsh-wb-chip--warn{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-secondary));border-color:var(--dsw-alias-state-warn-secondary,var(--dsw-alias-border-l2));background:var(--dsw-alias-state-warn-tertiary,rgba(245,180,60,.1))}
.dsh-wb-chip--business{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-secondary,var(--dsw-alias-border-l2));background:var(--dsw-alias-state-business-tertiary,rgba(100,150,255,.1))}
.dsh-wb-chip--success{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-secondary,var(--dsw-alias-border-l2));background:var(--dsw-alias-state-success-tertiary,rgba(70,190,120,.1))}
.dsh-wb-chip--error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-secondary,var(--dsw-alias-border-l2));background:var(--dsw-alias-state-error-tertiary,rgba(235,90,90,.1))}
.dsh-wb-detail{padding:14px;min-width:0}
.dsh-wb-detail-code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-detail-title{font-size:17px;font-weight:650;line-height:1.3;margin:5px 0 9px;overflow-wrap:anywhere}
.dsh-wb-chiprow{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:13px}
.dsh-wb-meta{display:flex;flex-direction:column;gap:0;border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-meta-row{display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px}
.dsh-wb-meta-k{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dsh-wb-meta-v{min-width:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
.dsh-wb-meta-v.mono{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px}
.dsh-wb-actions{display:flex;flex-wrap:wrap;gap:7px;margin:13px 0}
.dsh-wb-subhead{font-size:11px;font-weight:650;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary);margin:16px 0 7px}
.dsh-wb-versions{display:flex;flex-direction:column;gap:6px}
.dsh-wb-version{display:flex;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-version b{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:500;flex:none;width:24px}
.dsh-wb-note{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.55}
.dsh-wb-sessions{display:flex;flex-direction:column;gap:6px}
.dsh-wb-session{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:7px 9px;background:var(--dsw-alias-bg-base);min-width:0}
.dsh-wb-session.is-archived{opacity:.62}
.dsh-wb-session-actions{display:flex;align-items:center;gap:4px;margin-left:auto;flex:none;flex-wrap:wrap;justify-content:flex-end}
.dsh-wb-session.is-primary{border-color:var(--dsw-alias-border-selected,var(--dsw-alias-border-l2))}
.dsh-wb-session-type{flex:none;font-size:10px;font-weight:650;padding:2px 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dsh-wb-session-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.dsh-wb-session-main b{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-wb-session-main span{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-session-go{flex:none}
.dsh-wb-notice{border:1px solid var(--dsw-alias-state-warn-secondary,var(--dsw-alias-border-l2));background:var(--dsw-alias-state-warn-tertiary,rgba(245,180,60,.1));color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-secondary));border-radius:var(--dsw-radius-sm);padding:7px 9px;font-size:11px;line-height:1.5;margin-bottom:10px}
.dsh-wb-notice.is-error{border-color:var(--dsw-alias-state-error-secondary,var(--dsw-alias-border-l2));background:var(--dsw-alias-state-error-tertiary,rgba(235,80,80,.1));color:var(--dsw-alias-state-error-label,var(--dsw-alias-label-secondary))}
.dsh-wb-plan{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:10px}
.dsh-wb-plan b{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-weight:500;color:var(--dsw-alias-label-primary)}
.dsh-wb-iterlabel{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-dialog textarea.dsh-wb-input{height:64px;padding:7px 10px;resize:vertical;line-height:1.5}
.dsh-wb-poc{border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:10px 11px;margin-top:14px;background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-poc-h{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:650;color:var(--dsw-alias-label-secondary);margin-bottom:8px}
.dsh-wb-poc-h .dsh-wb-mock{height:18px;font-size:9px}
.dsh-wb-empty{padding:34px 20px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-wb-empty b{display:block;color:var(--dsw-alias-label-secondary);font-size:13px;margin-bottom:4px}
.dsh-wb-skeleton{height:12px;border-radius:6px;background:var(--dsw-alias-bg-skeleton,var(--dsw-alias-bg-layer-2));margin:10px 13px;opacity:.75}
.dsh-wb-toast-region{position:fixed;right:22px;bottom:22px;z-index:80;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:min(420px,calc(100vw - 32px));pointer-events:none}
.dsh-wb-toast{position:relative;max-width:100%;display:flex;align-items:flex-start;gap:10px;padding:10px 13px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-toast-bg,var(--dsw-alias-bg-overlay,#222));color:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary));font-size:12px;line-height:1.5;box-shadow:var(--dsw-elevation-prominent,0 10px 30px rgba(0,0,0,.3));pointer-events:auto}
.dsh-wb-toast.is-error{border-color:var(--dsw-alias-state-error-primary)}
.dsh-wb-toast.is-error::before{content:'错误';flex:none;font-size:10px;font-weight:700;color:var(--dsw-alias-state-error-primary);margin-top:1px}
.dsh-wb-toast-text{min-width:0;overflow-wrap:anywhere}
.dsh-wb-toast-close{flex:none;border:0;background:transparent;color:inherit;font-size:16px;line-height:1;cursor:pointer;padding:0 2px;min-width:24px;min-height:24px;border-radius:4px}
.dsh-wb-toast-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-command-toast{display:block;white-space:pre-wrap;cursor:default;max-width:min(440px,90vw);right:22px;bottom:80px;position:fixed;z-index:81}
.dsh-wb-command-toast .dsh-wb-toast-close{position:absolute;right:6px;top:6px}
.dsh-wb-command-toast-head{display:flex;align-items:center;gap:8px;margin-bottom:5px;color:var(--dsw-alias-label-secondary);font-size:11px}
.dsh-wb-command-toast-head code{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);color:var(--dsw-alias-brand-primary);font-size:11px}
.dsh-wb-command-toast-body{line-height:1.55;max-height:220px;overflow:auto}
.dsh-wb-overlay{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.42);display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow:auto;overscroll-behavior:contain}
.dsh-wb-dialog{width:min(440px,100%);max-height:calc(100dvh - 48px);overflow:auto;overscroll-behavior:contain;margin:auto;border-radius:var(--dsw-radius-lg,10px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent,0 24px 70px rgba(0,0,0,.45));padding:18px}
.dsh-wb-dialog:focus{outline:none}
.dsh-wb-dialog:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}
.dsh-wb-confirm-dialog{width:min(400px,100%)}
.dsh-wb-confirm-body{font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);margin-top:8px}
.dsh-wb-search{display:flex;gap:6px;align-items:center;padding:0 10px 8px}
.dsh-wb-search-input{height:30px;font-size:12px}
.dsh-wb-reviewbox{margin-top:10px;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-btn:focus-visible,.dsh-wb-iconbtn:focus-visible,.dsh-wb-notif:focus-visible,.dsh-wb-notif-group:focus-visible,.dsh-wb-auth-chip:focus-visible,.dsh-wb-rqbar-toggle:focus-visible,a:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-wb-notif-group{min-height:24px}
.dsh-wb-rqbar-toggle{min-width:24px;min-height:24px}
.dsh-wb-dialog h2{font-size:16px;font-weight:650;margin:0 0 4px}
.dsh-wb-dialog p{margin:0 0 14px;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.dsh-wb-input{width:100%;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:0 10px;font:inherit;font-size:13px;outline:none}
.dsh-wb-input:focus{border-color:var(--dsw-alias-border-selected);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary-dimmed,rgba(90,140,255,.18))}
.dsh-wb-dialog-err{margin-top:9px;color:var(--dsw-alias-state-error-primary);font-size:11.5px;line-height:1.45}
.dsh-wb-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.dsh-wb-auth{height:100%;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:36px 24px;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:13px;line-height:1.5}
.dsh-wb-auth *{box-sizing:border-box}
.dsh-wb-auth-card{width:min(430px,100%);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent,0 20px 60px rgba(0,0,0,.22));padding:30px}
.dsh-wb-auth-card--wide{width:min(660px,100%)}
.dsh-wb-auth-eyebrow{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin-bottom:10px}
.dsh-wb-auth-title{font-size:25px;line-height:1.2;font-weight:650;letter-spacing:-.02em;margin:0 0 8px}
.dsh-wb-auth-sub{margin:0 0 22px;font-size:12.5px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-auth-note{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-bottom:12px}
.dsh-wb-auth-users{display:flex;flex-direction:column;gap:8px}
.dsh-wb-auth-user{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-wb-auth-user:hover:not(:disabled){border-color:var(--dsw-alias-border-selected);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-auth-user:disabled{opacity:.55;cursor:wait}
.dsh-wb-auth-user-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-wb-auth-user-main b{font-size:13.5px;font-weight:600}
.dsh-wb-auth-user-main span{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-auth-user-go{margin-left:auto;flex:none;font-size:11px;color:var(--dsw-alias-brand-primary)}
.dsh-wb-auth-dingtalk p{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:0 0 12px}
.dsh-wb-auth-dingtalk .dsh-wb-btn{width:100%;justify-content:center;text-decoration:none}
.dsh-wb-auth-foot{margin-top:20px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);text-align:center}
.dsh-wb-auth-form{display:flex;flex-direction:column}
.dsh-wb-auth-section{position:relative;padding:16px 0 16px 34px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-auth-section:first-child{border-top:0;padding-top:0}
.dsh-wb-auth-step{position:absolute;left:0;top:17px;width:22px;height:22px;border-radius:50%;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:center;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-auth-section:first-child .dsh-wb-auth-step{top:1px}
.dsh-wb-auth-section h3{font-size:13px;font-weight:600;margin:0 0 3px}
.dsh-wb-auth-section p{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin:0 0 10px;line-height:1.5}
.dsh-wb-auth-chips{display:flex;flex-wrap:wrap;gap:6px}
.dsh-wb-auth-chip{height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dsh-wb-auth-chip:hover{border-color:var(--dsw-alias-border-selected)}
.dsh-wb-auth-chip.is-on{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-bg-base,#fff);font-weight:600}
.dsh-wb-auth-groups{display:flex;flex-direction:column;gap:10px}
.dsh-wb-auth-group{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:10px 11px;background:var(--dsw-alias-bg-base)}
.dsh-wb-auth-group-head{display:flex;align-items:center;gap:7px;margin-bottom:7px}
.dsh-wb-auth-group-head b{font-size:12px;font-weight:600}
.dsh-wb-auth-tag{font-size:9.5px;padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-auth-platforms{display:flex;flex-wrap:wrap;gap:7px 14px}
.dsh-wb-auth-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}
.dsh-wb-auth-check input{accent-color:var(--dsw-alias-brand-primary);width:13px;height:13px;margin:0}
.dsh-wb-userchip{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}
.dsh-wb-userchip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-userchip b{color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-wb-userchip-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}
.dsh-wb-userchip .dsh-wb-mock{height:17px;font-size:8.5px;padding:0 5px}
.dsh-wb-platform-dialog{width:min(780px,100%);max-height:min(86vh,920px);overflow:auto}
.dsh-wb-platform-dialog .dsh-wb-dialog-head{position:sticky;top:-18px;z-index:2;background:var(--dsw-alias-bg-layer-1);padding:2px 0 10px}
.dsh-wb-admin-dialog{width:min(920px,100%);max-height:min(88vh,940px);overflow:auto}
.dsh-wb-admin-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:4px 0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:12px}
.dsh-wb-admin-list{display:flex;flex-direction:column;gap:7px}
.dsh-wb-admin-row{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-admin-row-main{display:flex;flex-direction:column;gap:2px;min-width:180px;flex:1}
.dsh-wb-admin-roles{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-admin-role{display:inline-flex;align-items:center;gap:3px;cursor:pointer}
.dsh-wb-admin-role input{accent-color:var(--dsw-alias-brand-primary)}
.dsh-wb-admin-pane{display:flex;flex-direction:column;gap:10px;font-size:12px;line-height:1.65;color:var(--dsw-alias-label-secondary)}
.dsh-wb-admin-pane p{margin:0}
.dsh-wb-admin-code{margin:0;padding:10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;line-height:1.6;max-height:280px;overflow:auto;white-space:pre-wrap;word-break:break-word}
.dsh-wb-admin-audit{display:flex;flex-direction:column;gap:4px;max-height:420px;overflow:auto}
.dsh-wb-admin-audit-row{display:flex;align-items:baseline;gap:8px;padding:5px 7px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-admin-audit-row code{color:var(--dsw-alias-brand-primary);font-family:var(--dsw-font-mono,ui-monospace,monospace);flex:none}
.dsh-wb-admin-audit-payload{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-doc{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-doc .dsh-wb-subhead{display:flex;align-items:center;gap:8px;margin:0}
.dsh-wb-doc-read{display:flex;flex-direction:column;gap:9px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-doc-block b{display:block;font-size:10.5px;color:var(--dsw-alias-label-tertiary);letter-spacing:.04em;margin-bottom:3px}
.dsh-wb-doc-block p{margin:0;font-size:12px;line-height:1.65;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}
.dsh-wb-doc-meta{font-size:10px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-doc-actions{display:flex;gap:7px}
.dsh-wb-field{display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-field textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:58px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.55}
.dsh-wb-field textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dsh-wb-artifacts{display:flex;flex-direction:column;gap:6px;margin-top:14px}
.dsh-wb-artifacts .dsh-wb-subhead{margin:0}
.dsh-wb-artifact{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);min-width:0}
.dsh-wb-artifact-kind{flex:none;font-size:9.5px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.dsh-wb-artifact-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:var(--dsw-alias-label-primary)}
.dsh-wb-artifact-meta{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dsh-wb-reviewer-picker{display:flex;flex-direction:column;gap:6px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-reviewer-picker-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-reviewer-options{display:flex;flex-wrap:wrap;gap:6px 12px}
.dsh-wb-reviewer-option{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--dsw-alias-label-primary);cursor:pointer}
.dsh-wb-reviewer-option input{accent-color:var(--dsw-alias-brand-primary)}
.dsh-wb-reviewer-hint{font-size:10px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-upload{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.dsh-wb-upload-hint{font-size:10px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-dialog-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:8px}
.dsh-wb-dialog-head>div{min-width:0;flex:1}
.dsh-wb-dialog-head .dsh-wb-rqbar-toggle{margin-left:auto}
.dsh-wb-platform-section{border-top:1px solid var(--dsw-alias-border-l1);padding-top:14px;margin-top:6px}
.dsh-wb-platform-section-head{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.dsh-wb-platform-section-head h3{font-size:13px;font-weight:600;margin:0}
.dsh-wb-platform-section-head .dsh-wb-count{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-platform-add{display:flex;align-items:center;gap:7px;margin-bottom:10px;flex-wrap:wrap}
.dsh-wb-platform-add .dsh-wb-input{flex:1;min-width:180px;width:auto;height:30px;font-size:12px}
.dsh-wb-platform-add .dsh-wb-input--short{flex:0 0 110px;min-width:90px}
.dsh-wb-platform-add .dsh-wb-select{height:30px;font-size:12px}
.dsh-wb-platform-list{display:flex;flex-direction:column;gap:6px}
.dsh-wb-platform-row{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-base);min-width:0}
.dsh-wb-platform-row.is-archived{opacity:.58}
.dsh-wb-platform-row.is-editing{display:block}
.dsh-wb-platform-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.dsh-wb-platform-row-main b{font-size:12px;font-weight:600;display:flex;align-items:center;gap:7px}
.dsh-wb-platform-short{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10px;font-weight:400;color:var(--dsw-alias-label-tertiary);padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-platform-row-meta{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-platform-row-actions{display:flex;align-items:center;gap:4px;margin-left:auto;flex:none}
.dsh-wb-platform-form{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:8px}
.dsh-wb-platform-form .dsh-wb-input{flex:1;min-width:150px;width:auto;height:30px;font-size:12px}
.dsh-wb-platform-form .dsh-wb-input--short{flex:0 0 100px;min-width:80px}
.dsh-wb-platform-form .dsh-wb-input--order{flex:0 0 70px;min-width:60px}
.dsh-wb-platform-form .dsh-wb-select{height:30px;font-size:12px}
.dsh-wb-platform-row.is-editing .dsh-wb-platform-row-actions{justify-content:flex-end}

.dsh-wb-progress{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-spinner{width:12px;height:12px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:dsh-wb-spin .8s linear infinite}
@keyframes dsh-wb-spin{to{transform:rotate(360deg)}}
.dsh-wb-design{display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:12px;container-type:inline-size}
.dsh-wb-design *{box-sizing:border-box}
.dsh-wb-rqbar{display:flex;align-items:center;gap:6px;height:38px;flex:none;min-width:0;padding:5px 6px 5px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-rqbar-main{display:flex;align-items:center;gap:6px;min-width:0;flex:1;height:28px;padding:0 4px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}
.dsh-wb-rqbar-main:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-rqbar-code{flex:none;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-rqbar-title{min-width:0;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-rqbar-chips{display:flex;align-items:center;gap:4px;flex:none;margin-left:2px}
.dsh-wb-rqbar-chips .dsh-wb-chip{height:19px;padding:0 6px;font-size:10px}
.dsh-wb-rqbar-btn{flex:none;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-elevated-fill,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.dsh-wb-rqbar-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-wb-rqbar-toggle{flex:none;width:22px;height:26px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;cursor:pointer}
.dsh-wb-rqbar-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-rqdetail{flex:none;padding:8px 10px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-rqdetail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px}
.dsh-wb-rqdetail-cell{min-width:0}
.dsh-wb-rqdetail-cell.is-wide{grid-column:1 / -1}
.dsh-wb-rqdetail-k{font-size:10px;color:var(--dsw-alias-label-tertiary);margin-bottom:1px}
.dsh-wb-rqdetail-v{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsh-wb-rqdetail-v.mono{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px}
.dsh-wb-rqdetail-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.dsh-wb-design-canvas{position:relative;flex:1;min-height:0}
.dsh-wb-design-msg{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.dsh-wb-design-msg b{color:var(--dsw-alias-label-secondary);font-size:13px}
.dsh-wb-req-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
.dsh-wb-req-designbar{display:flex;align-items:center;gap:6px;flex:none;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-req-designbar-text{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-gallery{height:100%}
.dsh-wb-gallery-head{display:flex;align-items:center;gap:8px;flex:none;min-height:38px;padding:5px 6px 5px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-gallery-head-main{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.dsh-wb-gallery-title{font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary)}
.dsh-wb-gallery-head-actions{display:flex;align-items:center;gap:5px;flex:none}
.dsh-wb-gallery-body{flex:1;min-height:0;display:flex}
.dsh-wb-gallery-list{width:190px;flex:none;min-width:0;overflow:auto;padding:8px;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-gallery-group + .dsh-wb-gallery-group{margin-top:12px}
.dsh-wb-gallery-group-title{font-size:10px;color:var(--dsw-alias-label-tertiary);padding:0 4px 5px;text-transform:uppercase;letter-spacing:.04em}
.dsh-wb-gallery-item{display:flex;flex-direction:column;gap:2px;width:100%;padding:6px 7px;margin-bottom:2px;border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-wb-gallery-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-gallery-item.is-on{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsh-wb-gallery-item-name{font-size:11.5px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-gallery-item-meta{font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-gallery-preview{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-gallery-stage{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;align-items:flex-start;justify-content:center}
.dsh-wb-gallery-scale{position:relative;flex:none;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.32)}
.dsh-wb-gallery-frame{position:absolute;left:0;top:0;border:0;background:#fff}
.dsh-wb-gallery-image{max-width:calc(100% - 24px);max-height:calc(100% - 24px);object-fit:contain;margin:auto;background:#fff;border-radius:6px}
.dsh-wb-gallery-caption{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;padding:6px 10px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10.5px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-gallery-caption span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@container (max-width: 420px){.dsh-wb-gallery-list{width:150px}}
.dsh-wb-canvas-pane{position:relative}
.dsh-wb-canvas-content{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.dsh-wb-canvas-bar{display:flex;align-items:center;gap:8px;flex:none;min-height:38px;padding:5px 6px 5px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-canvas-bar-main{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.dsh-wb-canvas-title{font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary)}
.dsh-wb-canvas-bar-actions{display:flex;align-items:center;gap:5px;flex:none}
.dsh-wb-canvas-mode{height:26px;padding:2px}
.dsh-wb-canvas-mode button{height:20px;padding:0 7px;font-size:10.5px}
.dsh-wb-canvas-toolbar{display:flex;align-items:center;gap:6px;flex:none;min-height:32px;padding:4px 8px 4px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-canvas-toolbar-main{display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden}
.dsh-wb-canvas-kind{flex:none;font-size:10.5px;font-weight:650;color:var(--dsw-alias-brand-primary)}
.dsh-wb-canvas-path{min-width:0;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-canvas-toolbar-actions{display:flex;align-items:center;gap:4px;flex:none}
.dsh-wb-canvas-notice{font-size:10px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dsh-wb-canvas-studio{display:flex;flex-direction:column}
.dsh-wb-canvas-loading{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-bg-base) 78%,transparent);font-size:11px;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.dsh-wb-canvas-error{position:absolute;left:8px;right:8px;top:8px;z-index:4;display:flex;flex-direction:column;gap:5px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.dsh-wb-canvas-error b{color:var(--dsw-alias-label-primary);font-size:11px}
.dsh-wb-canvas-error .dsh-wb-btn{align-self:flex-start}
.dsh-wb-canvas-empty{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px 18px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.55}
.dsh-wb-canvas-empty b{color:var(--dsw-alias-label-primary);font-size:13px}
.dsh-wb-canvas-empty p{max-width:300px;margin:0}
.dsh-wb-canvas-empty-actions{display:flex;align-items:center;gap:6px;margin-top:4px}
.dsh-wb-canvas-drawer{position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;flex-direction:column;max-height:62%;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:0 -12px 36px rgba(0,0,0,.28)}
.dsh-wb-canvas-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;height:32px;padding:0 8px 0 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-canvas-drawer-body{flex:1;min-height:0;overflow:auto}
.dsh-wb-canvas-drawer .dsh-wb-rqdetail{border-bottom:0}
/* 只保留工作台需要的画布能力：切屏、体检、选择、改字、样式、更多 */
.dsh-wb-design-canvas .ddp button[data-tip^="首页"],
.dsh-wb-design-canvas .ddp button[data-tip^="外观"],
.dsh-wb-design-canvas .ddp button[data-tip^="导出"],
.dsh-wb-design-canvas .ddp button[data-tip^="分享"],
.dsh-wb-design-canvas .ddp button[data-tip^="手机"],
.dsh-wb-design-canvas .ddp button[data-tip^="画笔"],
.dsh-wb-design-canvas .ddp button[data-tip^="试用"],
.dsh-wb-design-canvas .ddp button[data-tip^="品牌"],
.dsh-wb-design-canvas .ddp button[data-tip^="素材"],
.dsh-wb-design-canvas .ddp button[data-tip^="灵感"],
.dsh-wb-design-canvas .ddp button[data-tip^="设计系统"],
.dsh-wb-design-canvas .ddp button[data-tip^="发布"],
.dsh-wb-design-canvas .ddp button[aria-label^="首页"],
.dsh-wb-design-canvas .ddp button[aria-label^="外观"],
.dsh-wb-design-canvas .ddp button[aria-label^="导出"],
.dsh-wb-design-canvas .ddp button[aria-label^="画笔"],
.dsh-wb-design-canvas .ddp button[aria-label^="试用"],
.dsh-wb-design-canvas .ddp-homeback,
.dsh-wb-design-canvas .ddp-market,
.dsh-wb-design-canvas .ddp-libwrap{display:none!important}
/* 「更多」里只留刷新和在浏览器里打开；版本与手机预览交给工作台的会话链路 */
.dsh-wb-design-canvas .ddp-menu > button:nth-child(1),
.dsh-wb-design-canvas .ddp-menu > button:nth-child(2),
.dsh-wb-design-canvas .ddp-menu > .sp:nth-child(3){display:none!important}
/* 迭代列表 / 迭代详情 / 我的工作台 · 按设计稿的页面结构 */
.dsh-wb-shell{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;padding:0}
.dsh-wb-navbar{flex:none;display:flex;align-items:center;gap:16px;min-height:52px;padding:0 20px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-nav-brand{display:flex;align-items:center;gap:7px;min-width:0;flex:none}
.dsh-wb-nav-logo{font-size:13px;font-weight:650;letter-spacing:-.01em;white-space:nowrap}
.dsh-wb-nav-badge{font-size:9px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-brand-primary);border:1px solid var(--dsw-alias-state-business-secondary,var(--dsw-alias-border-l2));border-radius:999px;padding:1px 6px;background:var(--dsw-alias-state-business-tertiary,rgba(100,150,255,.08))}
.dsh-wb-nav{display:flex;align-items:center;gap:2px;min-width:0;flex:1;overflow:hidden}
.dsh-wb-nav button{height:32px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.dsh-wb-nav button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-wb-nav button.is-active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}
.dsh-wb-nav-count{min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-state-error-primary,#e05a5a);color:#fff;font-size:9px;line-height:16px;text-align:center;font-weight:650}
.dsh-wb-nav-actions{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}
.dsh-wb-content{flex:1;min-height:0;overflow:auto;padding:20px 28px 44px}
.dsh-wb-page-head{display:flex;align-items:flex-start;gap:18px;margin-bottom:16px}
.dsh-wb-page-title-block{min-width:0;flex:1}
.dsh-wb-page-title{font-size:23px;line-height:1.2;font-weight:650;letter-spacing:-.015em;margin:0}
.dsh-wb-page-sub{margin:6px 0 0;font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.dsh-wb-iter-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 18px}
.dsh-wb-my-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 18px}
.dsh-wb-iter-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.dsh-wb-seg{display:inline-flex;align-items:center;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-seg button{height:26px;padding:0 10px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.dsh-wb-seg button:hover{color:var(--dsw-alias-label-primary)}
.dsh-wb-seg button.is-on{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-wb-iter-tools{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap}
.dsh-wb-iter-sort{display:flex;align-items:center;gap:6px}
.dsh-wb-iter-sort button{height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.dsh-wb-iter-sort button:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dsh-wb-iter-sort button.is-on{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-wb-iter-search{flex:1;min-width:180px;max-width:280px}
.dsh-wb-iter-search .dsh-wb-input{height:30px;font-size:12px}
.dsh-wb-iter-table{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);overflow-x:auto}
.dsh-wb-iter-tr{display:grid;grid-template-columns:100px minmax(180px,1.6fr) 96px 154px 106px 48px 136px 144px;gap:8px;align-items:center;min-width:1000px;padding:13px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);text-align:left;width:100%}
.dsh-wb-iter-tr:last-child{border-bottom:0}
.dsh-wb-iter-tr.is-head{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-base);border-bottom-color:var(--dsw-alias-border-l2);padding-top:8px;padding-bottom:8px}
.dsh-wb-iter-tr.is-row{border-left:0;border-right:0;border-top:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
.dsh-wb-iter-tr.is-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-iter-code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-wb-iter-name{min-width:0;display:flex;flex-direction:column;gap:2px;overflow:hidden}
.dsh-wb-iter-name b{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-iter-name em{font-style:normal;font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-iter-dates{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dsh-wb-iter-owner{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden}
.dsh-wb-iter-num{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px;color:var(--dsw-alias-label-secondary);text-align:right;padding-right:4px}
.dsh-wb-iter-progress{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-wb-progress{flex:1;height:6px;min-width:30px;border-radius:99px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-border-l1));overflow:hidden}
.dsh-wb-progress span{display:block;height:100%;border-radius:99px;background:var(--dsw-alias-brand-primary)}
.dsh-wb-progress span.is-done{background:var(--dsw-alias-state-success-primary)}
.dsh-wb-iter-progress em{font-style:normal;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:9.5px;color:var(--dsw-alias-label-tertiary);flex:none}
.dsh-wb-avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-weight:600;flex:none;line-height:1;overflow:hidden}
.dsh-wb-muted{color:var(--dsw-alias-label-tertiary)}
.dsh-wb-empty--page{margin-top:10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:46px 20px}
.dsh-wb-detail-head{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px}
.dsh-wb-detail-head-main{min-width:0;flex:1}
.dsh-wb-back{height:26px;padding:0 7px;margin:0 0 7px -7px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;cursor:pointer}
.dsh-wb-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-wb-detail-code-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:2px}
.dsh-wb-detail-code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-detail-meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:7px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-detail-meta>span{display:inline-flex;align-items:center;gap:5px}
.dsh-wb-detail-actions{display:flex;align-items:center;gap:7px;flex:none}
.dsh-wb-detail-layout{display:grid;grid-template-columns:minmax(0,1fr) 296px;gap:16px;align-items:start}
.dsh-wb-detail-main{min-width:0;display:flex;flex-direction:column;gap:16px}
.dsh-wb-detail-aside{min-width:0;display:flex;flex-direction:column;gap:10px}
.dsh-wb-timeline-panel{overflow:hidden}
.dsh-wb-timeline{padding:10px 14px 4px;display:flex;flex-direction:column;gap:7px}
.dsh-wb-tl-row{display:grid;grid-template-columns:96px minmax(0,1fr) 132px;gap:10px;align-items:center;min-height:24px}
.dsh-wb-tl-name{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-wb-tl-track{height:16px;border-radius:5px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);overflow:hidden;display:flex;align-items:center}
.dsh-wb-tl-bar{display:block;height:100%;border-radius:4px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-border-l2));min-width:2px}
.dsh-wb-tl-bar.is-progress{background:var(--dsw-alias-brand-primary)}
.dsh-wb-tl-bar.is-done{background:var(--dsw-alias-state-success-primary)}
.dsh-wb-tl-bar.is-idle{background:var(--dsw-alias-label-tertiary);opacity:.55}
.dsh-wb-tl-meta{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:9.5px;color:var(--dsw-alias-label-tertiary);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-wb-timeline-summary{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:9px 14px 12px;border-top:1px dashed var(--dsw-alias-border-l1);margin-top:6px;font-size:10.5px}
.dsh-wb-timeline-summary .dsh-wb-muted{font-size:10px}
.dsh-wb-section-head{display:flex;align-items:flex-end;gap:12px;margin:2px 0 2px}
.dsh-wb-section-head>div{min-width:0;flex:1}
.dsh-wb-section-head h2{font-size:15px;font-weight:650;margin:0;display:flex;align-items:center;gap:7px}
.dsh-wb-section-head p{margin:3px 0 0;font-size:10.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-reqcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}
.dsh-wb-reqcard{display:flex;flex-direction:column;gap:8px;min-width:0;padding:11px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);transition:border-color .12s,background .12s}
.dsh-wb-reqcard:hover{border-color:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-layer-2)}
.dsh-wb-reqcard-head{display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:wrap}
.dsh-wb-reqcard-code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;color:var(--dsw-alias-label-tertiary);margin-right:1px}
.dsh-wb-reqcard-head .dsh-wb-chip{height:19px;padding:0 6px;font-size:9.5px}
.dsh-wb-reqcard-title{border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:600;text-align:left;padding:0;cursor:pointer;line-height:1.4;overflow-wrap:anywhere}
.dsh-wb-reqcard-title:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.dsh-wb-reqcard-chips{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.dsh-wb-reqcard-chips .dsh-wb-chip{height:20px;padding:0 6px;font-size:9.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dsh-wb-reqcard-foot{display:flex;align-items:center;gap:7px;min-width:0;margin-top:auto;padding-top:7px;border-top:1px dashed var(--dsw-alias-border-l1)}
.dsh-wb-reqcard-who{display:flex;align-items:center;gap:5px;min-width:0;font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;white-space:nowrap}
.dsh-wb-reqcard-who>span{overflow:hidden;text-overflow:ellipsis}
.dsh-wb-reqcard-time{font-size:9.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;margin-left:auto}
.dsh-wb-reqcard-actions{display:flex;align-items:center;gap:4px;flex:none}
.dsh-wb-sidecard{overflow:hidden}
.dsh-wb-sidecard-body{padding:10px 12px 12px;font-size:10.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dsh-wb-scope-line{display:flex;align-items:baseline;gap:7px}
.dsh-wb-scope-num{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:24px;line-height:1;font-weight:650;color:var(--dsw-alias-label-primary)}
.dsh-wb-scope-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:9px}
.dsh-wb-scope-tags .dsh-wb-chip{height:20px;padding:0 6px;font-size:9.5px}
.dsh-wb-sidecard-tip{margin:9px 0 0;font-size:9.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-activity{display:flex;flex-direction:column;padding:4px 0}
.dsh-wb-activity-item{display:flex;align-items:flex-start;gap:7px;padding:7px 11px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}
.dsh-wb-activity-item:last-child{border-bottom:0}
.dsh-wb-activity-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.dsh-wb-activity-main b{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsh-wb-activity-main span{font-size:9.5px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-activity-main em{font-style:normal;font-size:9px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-platform-list{display:flex;flex-direction:column;gap:6px}
.dsh-wb-platform-group{display:flex;align-items:baseline;gap:7px;min-width:0}
.dsh-wb-platform-group b{font-size:10px;font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-wb-platform-group span{font-size:9.5px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-req-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
.dsh-wb-summary-card{padding:10px 12px;min-width:0}
.dsh-wb-summary-label{font-size:10px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-summary-value{font-size:20px;line-height:1.15;font-weight:650;margin-top:4px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-summary-value small{font-size:10px;font-weight:400;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-summary-sub{font-size:9.5px;color:var(--dsw-alias-label-tertiary);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-req-full{overflow:hidden}
.dsh-wb-req-full-body{padding:12px 14px 16px}
.dsh-wb-my-list{overflow:hidden}
.dsh-wb-notif-page{overflow:hidden}
@media (max-width:1180px){.dsh-wb-iter-kpis,.dsh-wb-my-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-wb-detail-layout{grid-template-columns:1fr}.dsh-wb-detail-aside{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-wb-req-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-wb-nav-brand{display:none}}
@media (max-width:860px){.dsh-wb-navbar{flex-wrap:wrap;min-height:auto;padding:8px 12px;gap:6px}.dsh-wb-nav{order:3;width:100%;overflow-x:auto}.dsh-wb-content{padding:16px 14px 32px}.dsh-wb-detail-head{flex-direction:column}.dsh-wb-detail-actions{width:100%;justify-content:flex-start}.dsh-wb-detail-aside{grid-template-columns:1fr}.dsh-wb-reqcards{grid-template-columns:1fr}}

.dsh-wb-start{height:100%;overflow:auto;padding:18px 14px 26px;display:flex;flex-direction:column;gap:12px;background:var(--dsw-alias-bg-base)}
.dsh-wb-start-main{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.dsh-wb-start-eyebrow{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-start-title{font-size:16px;line-height:1.3;font-weight:650;margin:0}
.dsh-wb-start-sub{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dsh-wb-start-platforms{display:flex;flex-wrap:wrap;gap:5px}
.dsh-wb-start-platform{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-base);font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-start-platform b{font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-wb-start-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px}
.dsh-wb-start-notice{font-size:11px;color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary))}
.dsh-wb-start-files{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dsh-wb-start-files-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-start-empty{padding:18px 12px;text-align:center;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-start-filelist{display:flex;flex-direction:column;max-height:260px;overflow:auto}
.dsh-wb-start-file{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:8px 10px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-wb-start-file:last-child{border-bottom:0}
.dsh-wb-start-file:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-wb-start-file:disabled{opacity:.55;cursor:default}
.dsh-wb-start-file-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.dsh-wb-start-file-name{font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-start-file-path{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-start-file-time{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-start-tip{font-size:10.5px;line-height:1.7;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-start-tip code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10px;padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
@container (max-width: 380px){.dsh-wb-rqbar-chips{display:none}.dsh-wb-rqbar-btn{padding:0 6px}}
@media (max-width:1180px){.dsh-wb-stats{grid-template-columns:repeat(4,minmax(0,1fr))}.dsh-wb-top{flex-wrap:wrap}.dsh-wb-top-main{flex-basis:100%}.dsh-wb-top-actions{width:100%;justify-content:flex-start;flex-wrap:wrap;margin-left:0}}
@media (max-width:900px){.dsh-wb-grid{grid-template-columns:1fr}.dsh-wb-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-wb-dev-grid{grid-template-columns:1fr}.dsh-wb-skill-body{grid-template-columns:1fr}.dsh-wb-skill-list{max-height:240px}}

/* =========================================================================
   与 design/ 设计系统对齐（tokens.css + app.css）。
   插件跑在 DSH 内，读不到 design/ 的样式，所以把设计 token 映射到 DSH 语义变量上，
   并统一页面留白、卡片、表格、按钮、头像、进度条等组件尺寸与配色。
   ========================================================================= */
.dsh-wb-page,.dsh-wb-navbar,.dsh-wb-auth,.dsh-wb-start,.dsh-wb-overlay,.dsh-wb-dialog,.dsh-wb-toast-region,.dsh-wb-command-toast,.dsh-wb-rqbar{
  --dsw-alias-bg-base:#151517;
  --dsw-alias-bg-layer-1:#232326;
  --dsw-alias-bg-layer-2:#2a2a2e;
  --dsw-alias-bg-layer-3:#333338;
  --dsw-alias-border-l1:#2b2b30;
  --dsw-alias-border-l2:#36363c;
  --dsw-alias-border-l3:#46474d;
  --dsw-alias-border-selected:#6f9bf0;
  --dsw-alias-label-primary:#ededef;
  --dsw-alias-label-secondary:#adb0b8;
  --dsw-alias-label-tertiary:#9a9aa2;
  --dsw-alias-brand-primary:#6f9bf0;
  --dsw-alias-button-primary-fill:#3563cc;
  --dsw-alias-button-primary-hover:#3f6fd6;
  --dsw-alias-interactive-bg-hover:#2a2a2e;
  --dsw-alias-state-success-primary:#5cc79a;
  --dsw-alias-state-success-secondary:rgba(92,199,154,.4);
  --dsw-alias-state-success-tertiary:rgba(92,199,154,.14);
  --dsw-alias-state-business-primary:#82a8f3;
  --dsw-alias-state-business-secondary:rgba(111,155,240,.4);
  --dsw-alias-state-business-tertiary:rgba(111,155,240,.12);
  --dsw-alias-state-warn-label:#e2b768;
  --dsw-alias-state-warn-secondary:rgba(226,183,104,.4);
  --dsw-alias-state-warn-tertiary:rgba(226,183,104,.14);
  --dsw-alias-state-error-primary:#ef8a8a;
  --dsw-alias-state-error-secondary:rgba(239,138,138,.4);
  --dsw-alias-state-error-tertiary:rgba(239,138,138,.14);
  --dsw-radius-sm:6px;--dsw-radius-md:8px;--dsw-radius-lg:10px;
  font-family:"Inter",-apple-system,"PingFang SC","HarmonyOS Sans SC","MiSans","Microsoft YaHei",system-ui,sans-serif;
}
.dsh-wb-page{background:#151517;color:#ededef}
.dsh-wb-content{padding:22px 28px 40px;max-width:1240px}
.dsh-wb-title{font-size:22px;font-weight:600;letter-spacing:-.01em}
.dsh-wb-title-sub{font-size:12px;color:#adb0b8}
.dsh-wb-eyebrow{color:#9a9aa2}
.dsh-wb-stat{background:#232326;border:1px solid #2b2b30;border-radius:8px;padding:12px 14px}
.dsh-wb-stat-label{font-size:11px;color:#9a9aa2}
.dsh-wb-stat-value{font-size:22px;font-weight:600;letter-spacing:-.01em}
.dsh-wb-btn{height:32px;font-size:13px;border-radius:6px;border:1px solid #36363c;background:#2a2a2e;color:#ededef}
.dsh-wb-btn:hover:not(:disabled){background:#333338;border-color:#46474d}
.dsh-wb-btn--primary{background:#3563cc;border-color:#3563cc;color:#fff;font-weight:600}
.dsh-wb-btn--primary:hover:not(:disabled){background:#3f6fd6;border-color:#3f6fd6}
.dsh-wb-btn--ghost{background:transparent;border-color:transparent;color:#adb0b8}
.dsh-wb-navbar{background:#151517;border-bottom:1px solid #2b2b30;min-height:52px;padding:0 24px;gap:18px}
.dsh-wb-nav button{height:36px;font-size:13px;color:#9a9aa2}
.dsh-wb-nav button:hover{background:#232326;color:#ededef}
.dsh-wb-nav button.is-active{background:transparent;box-shadow:inset 0 -2px 0 #6f9bf0;border-radius:0;color:#ededef;font-weight:600}
.dsh-wb-nav-logo{font-size:14px}
.dsh-wb-iter-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.dsh-wb-iter-table{border:1px solid #2b2b30;border-radius:8px;background:#232326}
.dsh-wb-iter-tr{gap:10px;padding:11px 12px}
.dsh-wb-iter-tr.is-head{background:#191919;font-size:11px;color:#9a9aa2;font-weight:500;letter-spacing:.03em}
.dsh-wb-iter-tr.is-row:hover{background:#2a2a2e}
.dsh-wb-iter-code,.dsh-wb-iter-dates,.dsh-wb-code{color:#9a9aa2}
.dsh-wb-iter-name b{font-size:13px;font-weight:500;color:#ededef}
.dsh-wb-iter-name em{font-size:11px;color:#9a9aa2}
.dsh-wb-avatar{width:20px;height:20px;background:#3d5c8f;color:#fff;border:1px solid rgba(255,255,255,.08);font-size:11px}
.dsh-wb-progress{height:5px;background:#333338}
.dsh-wb-progress span{background:#6f9bf0}
.dsh-wb-seg{padding:2px;background:#2a2a2e;border:1px solid #2b2b30;border-radius:6px}
.dsh-wb-seg button{height:26px;font-size:12px;border-radius:4px;color:#adb0b8}
.dsh-wb-seg button.is-on{background:#232326;color:#ededef;box-shadow:0 1px 2px rgba(0,0,0,.35);font-weight:500}
.dsh-wb-chip{height:20px;border-radius:4px;font-size:11px;font-weight:500}
.dsh-wb-input,.dsh-wb-select{background:#232326;border:1px solid #36363c;height:32px;border-radius:6px;color:#ededef}
`

    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-dsh-workbench]') !== null) return
      const style = document.createElement('style')
      style.dataset.dshWorkbench = '1'
      style.textContent = CSS
      document.head.appendChild(style)
    }

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

      const refresh = useCallback(async () => {
        try {
          const session = await api('auth/session')
          // 配置接口失败不应把已登录用户踢回登录页；保留会话结果，配置用空对象兜底。
          let config = {}
          try { config = await api('auth/config') } catch (_) { /* 保留会话 */ }
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

    function useWorkbench() {
      const [state, setState] = useState(null)
      const [error, setError] = useState(null)
      const [loading, setLoading] = useState(true)
      const requestId = useRef(0)

      const reload = useCallback(async () => {
        const id = ++requestId.current
        try {
          const next = await api('state')
          if (id !== requestId.current) return
          setState(next)
          setError(null)
        } catch (reason) {
          if (id !== requestId.current) return
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          if (id === requestId.current) setLoading(false)
        }
      }, [])

      useEffect(() => {
        let alive = true
        let inFlight = false
        const tick = async () => {
          if (!alive || inFlight || document.visibilityState === 'hidden') return
          inFlight = true
          try { await reload() } finally { inFlight = false }
        }
        const onVisibility = () => { if (document.visibilityState === 'visible') void tick() }
        void tick()
        const timer = setInterval(() => { void tick() }, 3000)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          alive = false
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [reload])

      return { state, error, loading, reload }
    }

    function useRequirementForSession(sessionId) {
      const [requirement, setRequirement] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const requestId = useRef(0)

      const reload = useCallback(async () => {
        if (typeof sessionId !== 'string' || sessionId === '') {
          requestId.current += 1
          setRequirement(null)
          setLoading(false)
          return
        }
        const id = ++requestId.current
        try {
          const body = await api(`requirement?sessionId=${encodeURIComponent(sessionId)}`)
          if (id !== requestId.current) return
          setRequirement(body.requirement ?? null)
          setError(null)
        } catch (reason) {
          if (id !== requestId.current) return
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          if (id === requestId.current) setLoading(false)
        }
      }, [sessionId])

      useEffect(() => {
        setRequirement(null)
        setError(null)
        setLoading(true)
      }, [sessionId])

      useEffect(() => {
        let alive = true
        let inFlight = false
        const tick = async () => {
          if (!alive || inFlight || document.visibilityState === 'hidden') return
          inFlight = true
          try { await reload() } finally { inFlight = false }
        }
        const onVisibility = () => { if (document.visibilityState === 'visible') void tick() }
        void tick()
        const timer = setInterval(() => { void tick() }, 2500)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          alive = false
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [reload])

      return { requirement, loading, error, reload }
    }

    function useDesignPreviewState(sessionId) {
      const [state, setState] = useState(null)
      const [error, setError] = useState(null)
      const requestId = useRef(0)

      const reload = useCallback(async () => {
        if (typeof sessionId !== 'string' || sessionId === '') {
          requestId.current += 1
          setState(null)
          setError(null)
          return
        }
        const id = ++requestId.current
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        try {
          const response = await fetch(`${DS_API}state?session=${encodeURIComponent(sessionId)}`, { cache: 'no-store', signal: controller.signal })
          if (!response.ok) throw new Error(`设计服务返回 ${response.status}`)
          const next = await response.json()
          if (id !== requestId.current) return
          setState(next)
          setError(null)
        } catch (reason) {
          if (id !== requestId.current) return
          setError(controller.signal.aborted ? new Error('设计服务响应超时') : (reason instanceof Error ? reason : new Error(String(reason))))
        } finally {
          clearTimeout(timer)
        }
      }, [sessionId])

      useEffect(() => {
        setState(null)
        setError(null)
      }, [sessionId])

      useEffect(() => {
        let alive = true
        let inFlight = false
        const tick = async () => {
          if (!alive || inFlight || document.visibilityState === 'hidden') return
          inFlight = true
          try { await reload() } finally { inFlight = false }
        }
        const onVisibility = () => { if (document.visibilityState === 'visible') void tick() }
        void tick()
        const timer = setInterval(() => { void tick() }, 2000)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          alive = false
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [reload])

      return { state, error, reload }
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

    function designPrompt(requirement, state) {
      const platforms = groupedPlatforms(state?.platforms ?? [], state?.platformGroups ?? [], requirement.platformIds)
        .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
        .join('；')
      return [
        `/design-start`,
        '',
        `需求：${requirement.code}「${requirement.title}」`,
        `平台：${platforms || '未设置'}`,
        `需求文件夹：${requirement.folderPath ?? '尚未创建'}`,
        `设计状态：${requirement.designStatus}；已有设计文件：${(requirement.designFiles ?? []).length} 个`,
        '',
        '请先加载 wb-ui-design 技能，在这个需求文件夹里做设计稿（一屏一个 HTML），',
        '完成后调用 wb_preview_page 打开第一屏，并用 wb_check_design 自查。',
      ].join('\n')
    }

    // ---------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------

    function platformName(platforms, id) {
      const platform = platforms.find(item => item.id === id)
      return platform === undefined ? id : platform.shortName
    }

    function platformLine(platforms, ids) {
      if (!Array.isArray(ids) || ids.length === 0) return '未设置平台'
      return ids.map(id => platformName(platforms, id)).join(' · ')
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

    function StatusChip({ kind, value }) {
      const map = kind === 'design' ? DESIGN_STATUS : REQ_STATUS
      const meta = map[value] || { label: value || '未知', tone: 'idle', glyph: '·' }
      return h('span', { className: `dsh-wb-chip dsh-wb-chip--${meta.tone}` },
        h('span', { className: 'g' }, meta.glyph),
        meta.label,
      )
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

    function ScopeChip({ requirement }) {
      return h('span', {
        className: `dsh-wb-chip${requirement.inScope === false ? ' dsh-wb-chip--idle' : ''}`,
        title: requirement.inScope === false ? '不在本期范围（暂缓）' : '在本期范围内',
      }, requirement.inScope === false ? '范围外' : '本期')
    }

    function DesignUpdatedChip() {
      return h('span', {
        className: 'dsh-wb-chip dsh-wb-chip--warn',
        title: '设计在开发开始后交付或更新，研发侧需要查看最新设计',
      }, h('span', { className: 'g' }, '↑'), '设计已更新')
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

    function slugTitle(title) {
      return String(title).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 48)
    }

    async function ensureChildDirectory(parent, name) {
      // The web surface has no native directory picker (`directory-picker/unavailable`),
      // so folder creation goes through the host half, which runs on the same machine.
      const body = await api('folders/ensure', {
        method: 'POST',
        body: JSON.stringify({ parent, name }),
      })
      return body.path
    }

    async function finishRequirementCreation(ctx, requirement, iterationDir) {
      const folderPath = await ensureChildDirectory(iterationDir, `${requirement.code}-${slugTitle(requirement.title)}`)
      // 原型和设计稿分开放：产品在 prototype/ 里出原型，设计师在 design/ 里出设计稿；
      // 早期需求根目录直接放设计稿，读取时仍兼容。
      await ensureChildDirectory(folderPath, 'prototype')
      await ensureChildDirectory(folderPath, 'design')
      const workspace = await ctx.workspaces.create({ path: folderPath })
      const workspaceId = workspace.workspaceId
      const sessionId = await ctx.sessions.create({ workspaceId })
      await ctx.sessions.using(sessionId, { source: 'workbench' }, async (reference) => {
        const result = await reference.binding.session.rename(`${requirement.code} ${requirement.title}`)
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
      return { requirement: body.requirement, sessionId, folderPath, workspaceId }
    }

    async function markCreationFailed(requirement, reason) {
      try {
        await api(`requirements/${encodeURIComponent(requirement.id)}/create-failed`, {
          method: 'POST',
          body: JSON.stringify({ error: reason instanceof Error ? reason.message : String(reason) }),
        })
      } catch (_) { /* the requirement is already unusable; the next poll shows it */ }
    }

    function openRightTab(ctx, kind = TAB_KIND) {
      try { ctx.sidebarRight.openTab(kind) } catch (reason) { console.warn('[dsh-workbench] open tab failed', reason) }
    }

    function openDesignTab(ctx) {
      openRightTab(ctx, DESIGN_TAB_KIND)
    }

    function closeOwnTab(ctx, kind = TAB_KIND) {
      try {
        const active = ctx.sidebarRight.active?.()
        if (active && active.kind === kind) {
          ctx.sidebarRight.close(active.id)
          return
        }
      } catch (_) { /* fall through to collapsing the column */ }
      try { ctx.sidebarRight.toggleExpanded() } catch (_) { /* ignore */ }
    }

    function focusComposer() {
      setTimeout(() => {
        const node = document.querySelector('[data-conversation-composer] textarea, [data-conversation-composer] [contenteditable="true"], textarea')
        if (node && typeof node.focus === 'function') node.focus()
      }, 60)
    }

    // ---------------------------------------------------------------------
    // Main panel
    // ---------------------------------------------------------------------

    function StatCard({ label, value, detail }) {
      return h('div', { className: 'dsh-wb-stat' },
        h('div', { className: 'dsh-wb-stat-label' }, label),
        h('div', { className: 'dsh-wb-stat-value' }, String(value), detail ? h('small', null, detail) : null),
      )
    }

    function RequirementRow({ requirement, selected, onSelect, users, platforms }) {
      const owner = users.find(user => user.id === requirement.ownerId)
      const devTasks = Array.isArray(requirement.devTasks) ? requirement.devTasks : []
      const latestTest = Array.isArray(requirement.testRuns) && requirement.testRuns.length > 0
        ? requirement.testRuns[requirement.testRuns.length - 1]
        : null
      const flags = []
      if (requirement.inScope === false) flags.push('范围外')
      if (requirement.designUpdatedAt) flags.push('设计已更新')
      if (devTasks.length > 0 && ['in_progress', 'dev_done', 'testing', 'test_failed', 'test_passed', 'frozen', 'released', 'done'].includes(requirement.status)) {
        flags.push(`开发 ${devTasks.filter(task => task.status === 'done').length}/${devTasks.length}`)
      }
      if (latestTest) flags.push(`测试${TEST_STATUS_LABELS[latestTest.status] ?? latestTest.status}`)
      if (requirement.release) flags.push(requirement.release.version)
      if (requirement.plannedStartDate || requirement.plannedEndDate) {
        flags.push(`${requirement.plannedStartDate ?? '待定'} ~ ${requirement.plannedEndDate ?? '待定'}`)
      }
      return h('button', {
        type: 'button',
        className: `dsh-wb-row${selected ? ' is-selected' : ''}`,
        onClick: onSelect,
      },
        h('span', { className: 'dsh-wb-code' }, requirement.code),
        h('span', { className: 'dsh-wb-row-main' },
          h('span', { className: 'dsh-wb-row-title' }, requirement.title),
          h('span', { className: 'dsh-wb-row-sub' },
            `${owner?.name ?? '—'} · ${platformLine(platforms, requirement.platformIds)}`,
            flags.length > 0 ? ` · ${flags.join(' · ')}` : '',
          ),
        ),
        h(StatusChip, { kind: 'req', value: requirement.status }),
        h(StatusChip, { kind: 'design', value: requirement.designStatus }),
      )
    }

    function ArtifactList({ artifacts, title, onToast, showEmpty = false }) {
      const [error, setError] = useState('')
      const [opening, setOpening] = useState('')
      const [showAll, setShowAll] = useState(false)
      const rows = [...(artifacts ?? [])].reverse()
      const shownRows = showAll ? rows : rows.slice(0, 20)
      if (rows.length === 0 && !showEmpty) return null
      const openArtifact = async (artifact) => {
        setError('')
        setOpening(artifact.id)
        try {
          const data = await api(`artifacts/${encodeURIComponent(artifact.id)}`)
          let payload = data.content
          if (artifact.encoding === 'base64') {
            const raw = atob(data.content)
            const bytes = new Uint8Array(raw.length)
            for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
            payload = bytes
          }
          const declared = String(artifact.contentType || 'application/octet-stream').split(';')[0].trim().toLowerCase()
          // 只允许被动内容内联预览；HTML/SVG/JS 等主动内容一律改为下载，避免同源 Blob 执行脚本。
          const safeInline = new Set(['text/plain', 'text/markdown', 'application/json', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])
          const contentType = safeInline.has(declared) ? declared : 'application/octet-stream'
          const blob = new Blob([payload], { type: contentType })
          const url = URL.createObjectURL(blob)
          if (safeInline.has(declared)) {
            const opened = window.open(url, '_blank', 'noopener,noreferrer')
            if (opened === null) throw new Error('浏览器拦截了新标签页，请允许弹出窗口或下载附件')
            setTimeout(() => URL.revokeObjectURL(url), 60_000)
            onToast?.('已在新标签页打开')
          } else {
            const link = document.createElement('a')
            link.href = url
            link.download = String(artifact.name || 'artifact').replace(/[\\/:*?"<>|]/g, '_')
            link.rel = 'noopener'
            link.click()
            setTimeout(() => URL.revokeObjectURL(url), 60_000)
            onToast?.('该类型不支持预览，已下载附件')
          }
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setOpening('')
        }
      }
      return h('div', { className: 'dsh-wb-artifacts' },
        h('div', { className: 'dsh-wb-subhead' }, `${title} · ${rows.length}`),
        rows.length > 20
          ? h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
              type: 'button',
              style: { marginBottom: '6px' },
              onClick: () => setShowAll(value => !value),
            }, showAll ? '收起旧文件' : `显示全部 ${rows.length} 个文件`)
          : null,
        error ? h('div', { className: 'dsh-wb-notice is-error' }, error) : null,
        rows.length === 0
          ? h('div', { className: 'dsh-wb-note' }, '还没有文件。设计交付的设计稿和手动上传的附件会出现在这里。')
          : null,
        shownRows.map(artifact => h('div', { className: 'dsh-wb-artifact', key: artifact.id },
          h('span', { className: 'dsh-wb-artifact-kind' }, artifact.kind === 'design' ? '设计' : artifact.kind === 'test-report' ? '测试' : '附件'),
          h('span', { className: 'dsh-wb-artifact-name', title: artifact.name }, artifact.name),
          h('span', { className: 'dsh-wb-artifact-meta' }, `${Math.max(1, Math.round(artifact.size / 1024))} KB · ${relativeTime(artifact.createdAt)}`),
          h('button', {
            className: 'dsh-wb-btn dsh-wb-btn--sm',
            type: 'button',
            disabled: opening === artifact.id,
            onClick: () => openArtifact(artifact),
          }, opening === artifact.id ? '打开中…' : '打开'),
        )),
      )
    }

    function ArtifactUploader({ requirement, onReload, onToast }) {
      const inputRef = useRef(null)
      const [uploading, setUploading] = useState(false)
      const [error, setError] = useState('')
      const pick = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        if (file.size > 3_000_000) {
          setError('附件最大 3 MB')
          return
        }
        setUploading(true)
        setError('')
        try {
          const buffer = new Uint8Array(await file.arrayBuffer())
          let binary = ''
          const chunk = 0x8000
          for (let index = 0; index < buffer.length; index += chunk) {
            binary += String.fromCharCode.apply(null, buffer.subarray(index, index + chunk))
          }
          await api(`requirements/${encodeURIComponent(requirement.id)}/artifacts`, {
            method: 'POST',
            body: JSON.stringify({
              name: file.name,
              contentType: file.type || 'application/octet-stream',
              content: btoa(binary),
              encoding: 'base64',
              kind: 'attachment',
            }),
          })
          onToast?.('附件已上传')
          onReload?.()
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setUploading(false)
        }
      }
      return h('div', { className: 'dsh-wb-upload' },
        error ? h('div', { className: 'dsh-wb-notice is-error' }, error) : null,
        h('button', {
          className: 'dsh-wb-btn dsh-wb-btn--sm',
          type: 'button',
          disabled: uploading,
          onClick: () => inputRef.current?.click(),
        }, uploading ? '上传中…' : '上传附件'),
        h('span', { className: 'dsh-wb-upload-hint' }, '图片、日志、测试报告都行，最大 3 MB'),
        h('input', {
          ref: inputRef,
          type: 'file',
          style: { display: 'none' },
          onChange: pick,
        }),
      )
    }

    function RequirementDocumentEditor({ requirement, state, onReload, onToast }) {
      const doc = requirement.document ?? {}
      const [editing, setEditing] = useState(false)
      const [summary, setSummary] = useState(doc.summary ?? '')
      const [criteria, setCriteria] = useState(doc.acceptanceCriteria ?? '')
      const [body, setBody] = useState(doc.body ?? '')
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState('')
      const lastRequirement = useRef(requirement.id)
      const roles = state.currentUser?.roles ?? []
      const canEdit = roles.includes('product') || roles.includes('lead') || roles.includes('admin')
      useEffect(() => {
        if (lastRequirement.current === requirement.id) return
        lastRequirement.current = requirement.id
        setEditing(false)
        setError('')
      }, [requirement.id])
      useEffect(() => {
        if (editing) return
        setSummary(doc.summary ?? '')
        setCriteria(doc.acceptanceCriteria ?? '')
        setBody(doc.body ?? '')
      }, [requirement.id, doc.version, editing])
      const save = async () => {
        setSaving(true)
        setError('')
        try {
          await api(`requirements/${encodeURIComponent(requirement.id)}/document`, {
            method: 'POST',
            body: JSON.stringify({ summary, acceptanceCriteria: criteria, body, expectedVersion: doc.version ?? 0 }),
          })
          setEditing(false)
          onToast?.('需求文档已保存')
          onReload?.()
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setSaving(false)
        }
      }
      const hasContent = (doc.summary ?? '') !== '' || (doc.acceptanceCriteria ?? '') !== '' || (doc.body ?? '') !== ''
      if (!editing) {
        return h('div', { className: 'dsh-wb-doc' },
          h('div', { className: 'dsh-wb-subhead' },
            `需求文档${doc.version ? ` · 文档 v${doc.version}` : ''}`,
            canEdit ? h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm',
              type: 'button',
              style: { marginLeft: 'auto' },
              onClick: () => setEditing(true),
            }, hasContent ? '编辑' : '补全文档') : null,
          ),
          hasContent
            ? h('div', { className: 'dsh-wb-doc-read' },
                doc.summary ? h('div', { className: 'dsh-wb-doc-block' }, h('b', null, '摘要'), h('p', null, doc.summary)) : null,
                doc.acceptanceCriteria ? h('div', { className: 'dsh-wb-doc-block' }, h('b', null, '验收标准'), h('p', null, doc.acceptanceCriteria)) : null,
                doc.body ? h('div', { className: 'dsh-wb-doc-block' }, h('b', null, '需求正文'), h('p', null, doc.body)) : null,
                doc.updatedAt ? h('div', { className: 'dsh-wb-doc-meta' }, `最后由 ${state.users.find(user => user.id === doc.updatedBy)?.name ?? doc.updatedBy} 更新 · ${relativeTime(doc.updatedAt)}`) : null,
              )
            : h('div', { className: 'dsh-wb-note' }, '还没有需求文档。补全摘要和验收标准，研发与测试会收到更新通知。'),
        )
      }
      return h('div', { className: 'dsh-wb-doc' },
        h('div', { className: 'dsh-wb-subhead' }, '编辑需求文档'),
        error ? h('div', { className: 'dsh-wb-notice is-error' }, error) : null,
        h('label', { className: 'dsh-wb-field' }, h('span', null, '摘要'), h('textarea', { value: summary, rows: 3, onChange: event => setSummary(event.target.value) })),
        h('label', { className: 'dsh-wb-field' }, h('span', null, '验收标准'), h('textarea', { value: criteria, rows: 5, onChange: event => setCriteria(event.target.value), placeholder: '一条一行，写清楚可验证的结果' })),
        h('label', { className: 'dsh-wb-field' }, h('span', null, '需求正文'), h('textarea', { value: body, rows: 6, onChange: event => setBody(event.target.value), placeholder: '背景、范围、交互说明、依赖与风险' })),
        h('div', { className: 'dsh-wb-doc-actions' },
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: saving, onClick: save }, saving ? '保存中…' : '保存文档'),
          h('button', { className: 'dsh-wb-btn', type: 'button', disabled: saving, onClick: () => setEditing(false) }, '取消'),
        ),
      )
    }

    function RequirementDetail({ ctx, state, requirement, onRetry, retrying, onNewSession, onReload, onToast }) {
      const [unbindTarget, setUnbindTarget] = useState(null)
      const [unbinding, setUnbinding] = useState(false)
      const [sessionBusy, setSessionBusy] = useState('')
      const owner = state.users.find(user => user.id === requirement.ownerId)
      const designer = requirement.designerId ? state.users.find(user => user.id === requirement.designerId) : null
      const grouped = groupedPlatforms(state.platforms, state.platformGroups, requirement.platformIds)
      const iteration = (state.iterations ?? []).find(item => item.id === requirement.iterationId) ?? state.iteration
      const sessions = Array.isArray(requirement.sessions) ? requirement.sessions : []
      const reviews = Array.isArray(requirement.reviews) ? requirement.reviews : []
      const scopeChanges = Array.isArray(requirement.scopeChanges) ? requirement.scopeChanges : []
      const devTasks = Array.isArray(requirement.devTasks) ? requirement.devTasks : []
      const testRuns = Array.isArray(requirement.testRuns) ? requirement.testRuns : []
      const reviewerIds = Array.isArray(requirement.reviewerIds) ? requirement.reviewerIds : []
      const currentRound = requirement.versions.length
      const roundReviews = reviews.filter(review => review.version === currentRound)
      const reviewFor = (userId) => [...roundReviews].reverse().find(review => review.by === userId) ?? null
      const approvedReviewers = reviewerIds.filter(id => reviewFor(id)?.decision === 'approved')
      const latestReview = reviews.length > 0 ? reviews[reviews.length - 1] : null
      const latestScope = scopeChanges.length > 0 ? scopeChanges[scopeChanges.length - 1] : null
      const latestTest = testRuns.length > 0 ? testRuns[testRuns.length - 1] : null
      const devDone = devTasks.filter(task => task.status === 'done').length
      const hasLocalSession = typeof requirement.sessionId === 'string' && requirement.sessionId !== ''
      const reviewerName = (id) => state.users.find(user => user.id === id)?.name ?? id
      const activeSessions = sessions.filter(session => session.archived !== true)
      const archivedSessions = sessions.filter(session => session.archived === true)
      const updateSession = async (session, action) => {
        if (sessionBusy !== '') return
        setSessionBusy(session.id)
        try {
          await api(`requirements/${encodeURIComponent(requirement.id)}/sessions/${encodeURIComponent(session.id)}/${action}`, {
            method: 'POST',
            body: '{}',
          })
          onToast?.(action === 'archive' ? '会话已归档' : '会话已恢复')
          onReload?.()
        } catch (reason) {
          onToast?.(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setSessionBusy('')
        }
      }
      const unbindSession = async () => {
        if (unbindTarget === null || unbinding) return
        setUnbinding(true)
        try {
          await api(`requirements/${encodeURIComponent(requirement.id)}/sessions/${encodeURIComponent(unbindTarget.id)}/unbind`, {
            method: 'POST',
            body: '{}',
          })
          onToast?.('已解除本机绑定')
          setUnbindTarget(null)
          onReload?.()
        } catch (reason) {
          onToast?.(reason instanceof Error ? reason.message : String(reason), true)
        } finally {
          setUnbinding(false)
        }
      }
      const devTaskCard = (task) => {
        const assignee = task.assigneeId ? state.users.find(user => user.id === task.assigneeId) : null
        const stateClass = task.status === 'done' ? ' is-done' : task.status === 'in_progress' ? ' is-progress' : ''
        return h('div', { className: 'dsh-wb-devcard', key: task.id ?? task.platformId },
          h('div', { className: 'dsh-wb-devcard-head' },
            h('b', null, platformName(state.platforms, task.platformId)),
            h('span', { className: `dsh-wb-devcard-state${stateClass}` }, DEV_STATUS_LABELS[task.status] ?? task.status),
          ),
          h('div', { className: 'dsh-wb-devcard-meta' },
            assignee?.name ?? '未指派',
            task.startedAt ? ` · 开始 ${relativeTime(task.startedAt)}` : '',
            task.finishedAt ? ` · 完成 ${relativeTime(task.finishedAt)}` : '',
          ),
          task.branch ? h('div', { className: 'dsh-wb-devcard-meta' }, h('code', null, task.branch)) : null,
          task.mrUrl ? h('div', { className: 'dsh-wb-devcard-meta' }, 'MR ',
            safeHttpUrl(task.mrUrl)
              ? h('a', { href: safeHttpUrl(task.mrUrl), target: '_blank', rel: 'noopener noreferrer' }, task.mrUrl)
              : h('code', null, task.mrUrl),
          ) : null,
          task.pipelineStatus ? h('div', { className: 'dsh-wb-devcard-meta' },
            `流水线 ${task.pipelineStatus}`,
            task.pipelineUrl
              ? h('span', null, ' · ', safeHttpUrl(task.pipelineUrl)
                  ? h('a', { href: safeHttpUrl(task.pipelineUrl), target: '_blank', rel: 'noopener noreferrer' }, '查看')
                  : h('span', null, '（链接无效）'))
              : null,
          ) : null,
          task.note ? h('div', { className: 'dsh-wb-devcard-meta' }, task.note) : null,
        )
      }

      const openSession = useCallback((sessionId) => {
        if (!sessionId) return
        ctx.uiWorkspace.openSession(sessionId)
        setTimeout(() => openRightTab(ctx), 250)
      }, [ctx])

      const openPanel = useCallback(() => {
        if (!requirement.sessionId) return
        const mounted = ctx.sidebarRight.mounted?.getSnapshot?.()
        if (mounted === undefined || mounted === null) {
          ctx.uiWorkspace.openSession(requirement.sessionId)
          setTimeout(() => openRightTab(ctx), 350)
          return
        }
        openRightTab(ctx)
      }, [ctx, requirement.sessionId])

      const openDesign = useCallback(() => {
        if (!requirement.sessionId) return
        const mounted = ctx.sidebarRight.mounted?.getSnapshot?.()
        if (mounted === undefined || mounted === null) {
          ctx.uiWorkspace.openSession(requirement.sessionId)
          setTimeout(() => openDesignTab(ctx), 350)
          return
        }
        openDesignTab(ctx)
      }, [ctx, requirement.sessionId])

      const designScreenCount = ((requirement.designScreens?.length ?? 0) + (requirement.designImages?.length ?? 0)) ||
        (requirement.artifacts ?? []).filter(artifact => artifact.kind === 'design').length

      return h('div', { className: 'dsh-wb-detail' },
        h('div', { className: 'dsh-wb-detail-code' }, `${iteration?.code ?? '—'} / ${requirement.code}`),
        h('div', { className: 'dsh-wb-detail-title' }, requirement.title),
        h('div', { className: 'dsh-wb-chiprow' },
          h(StatusChip, { kind: 'req', value: requirement.status }),
          h(StatusChip, { kind: 'design', value: requirement.designStatus }),
          h(ScopeChip, { requirement }),
          requirement.designUpdatedAt ? h(DesignUpdatedChip) : null,
        ),
        requirement.designUpdatedAt
          ? h('div', { className: 'dsh-wb-notice' },
              `设计在 ${relativeTime(requirement.designUpdatedAt)} 更新过（d${requirement.designVersions.length}）。研发开始后设计有变更，请同步查看右栏画布。`)
          : null,
        h('div', { className: 'dsh-wb-actions' },
          h('button', {
            className: 'dsh-wb-btn dsh-wb-btn--primary',
            type: 'button',
            disabled: !hasLocalSession,
            title: hasLocalSession ? '' : '这条需求的会话建在另一台设备上；本机还没有对应 DSH 会话',
            onClick: () => openSession(requirement.sessionId),
          }, '进入会话'),
          h('button', {
            className: 'dsh-wb-btn',
            type: 'button',
            disabled: !requirement.folderPath,
            title: requirement.folderPath ? '为这条需求新建设计、开发、测试或评审会话' : '需求文件夹还没有创建',
            onClick: () => onNewSession(requirement),
          }, '新建会话'),
          h('button', { className: 'dsh-wb-btn', type: 'button', disabled: !hasLocalSession, onClick: openPanel }, '打开需求'),
          h('button', {
            className: 'dsh-wb-btn',
            type: 'button',
            disabled: !hasLocalSession || designScreenCount === 0,
            title: designScreenCount === 0 ? '还没有可预览的设计稿' : `打开设计（${designScreenCount} 个文件）`,
            onClick: openDesign,
          }, designScreenCount === 0 ? '打开设计' : `打开设计 · ${designScreenCount}`),
          (requirement.status === 'create_failed' || requirement.status === 'creating')
            ? h('button', { className: 'dsh-wb-btn', type: 'button', disabled: retrying === true, onClick: () => onRetry(requirement) }, retrying === true ? '创建中…' : '重试创建')
            : null,
        ),
        h('div', { className: 'dsh-wb-meta' },
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '负责人'), h('span', { className: 'dsh-wb-meta-v' }, owner?.name ?? '—')),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '设计'), h('span', { className: 'dsh-wb-meta-v' }, designer?.name ?? (requirement.designStatus === 'not_needed' ? '无需设计' : '未认领'))),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '范围'),
            h('span', { className: 'dsh-wb-meta-v' },
              requirement.inScope === false ? '范围外（暂缓）' : '本期',
              latestScope ? ` · ${latestScope.inScope ? '纳入' : '移出'}：${latestScope.reason || '未填原因'}（${relativeTime(latestScope.at)}）` : '',
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '计划'),
            h('span', { className: 'dsh-wb-meta-v mono' },
              requirement.plannedStartDate || requirement.plannedEndDate
                ? `${requirement.plannedStartDate ?? '待定'} ~ ${requirement.plannedEndDate ?? '待定'}`
                : '未排期',
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '评审'),
            h('span', { className: 'dsh-wb-meta-v' },
              latestReview === null
                ? '还没有评审记录'
                : `${REVIEW_DECISION_LABELS[latestReview.decision] ?? latestReview.decision} · ${latestReview.comment || '无意见'} · ${relativeTime(latestReview.at)}`,
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '会签'),
            h('span', { className: 'dsh-wb-meta-v' },
              reviewerIds.length === 0
                ? '单人评审（负责人 / 管理员）'
                : `${approvedReviewers.length}/${reviewerIds.length} 位已通过 · ${reviewerIds.map(reviewerName).join('、')}`,
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '开发'),
            h('span', { className: 'dsh-wb-meta-v' },
              devTasks.length === 0
                ? '未开始'
                : `${devDone}/${devTasks.length} 端完成${devTasks.some(task => task.status === 'in_progress') ? ' · 有端开发中' : ''}`,
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '测试'),
            h('span', { className: 'dsh-wb-meta-v' },
              latestTest === null
                ? '未开始'
                : `${TEST_STATUS_LABELS[latestTest.status] ?? latestTest.status} · ${relativeTime(latestTest.finishedAt ?? latestTest.startedAt)}${latestTest.note ? ` · ${latestTest.note}` : ''}`,
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '发布'),
            h('span', { className: 'dsh-wb-meta-v' },
              requirement.release
                ? `${requirement.release.version} · ${relativeTime(requirement.release.at)}`
                : '未发布',
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '设计版本'),
            h('span', { className: 'dsh-wb-meta-v' },
              requirement.designVersions.length === 0
                ? '—'
                : `d${requirement.designVersions.length}${requirement.designDeliveredAt ? ' · ' + relativeTime(requirement.designDeliveredAt) : ''}`,
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '设计文件'),
            h('span', { className: 'dsh-wb-meta-v' },
              (() => {
                const latestFiles = requirement.designVersions[requirement.designVersions.length - 1]?.files?.length ?? 0
                return latestFiles === 0 ? '—' : `${latestFiles} 个（最新交付）`
              })(),
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '平台'),
            h('span', { className: 'dsh-wb-meta-v' },
              grouped.length === 0 ? '未设置' : grouped.map(entry => `${entry.group.name}${entry.group.active === false ? '（已归档）' : ''} · ${entry.items.map(item => item.shortName).join(' / ')}`).join('；'),
            ),
          ),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '文件夹'), h('span', { className: 'dsh-wb-meta-v mono' }, requirement.folderPath ?? '创建中…')),
          h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '更新'), h('span', { className: 'dsh-wb-meta-v' }, relativeTime(requirement.updatedAt))),
          requirement.createError ? h('div', { className: 'dsh-wb-meta-row' }, h('span', { className: 'dsh-wb-meta-k' }, '错误'), h('span', { className: 'dsh-wb-meta-v', style: { color: 'var(--dsw-alias-state-error-primary)' } }, requirement.createError)) : null,
        ),
        h(RequirementDocumentEditor, { requirement, state, onReload, onToast }),
        h(ArtifactList, { key: `artifacts-${requirement.id}`, artifacts: requirement.artifacts, title: '团队文件', onToast, showEmpty: true }),
        h(ArtifactUploader, { key: `upload-${requirement.id}`, requirement, onReload, onToast }),
        h('div', { className: 'dsh-wb-subhead' }, `会话 · ${activeSessions.length}${archivedSessions.length > 0 ? ` · 已归档 ${archivedSessions.length}` : ''}`),
        sessions.length === 0
          ? h('div', { className: 'dsh-wb-note' }, '还没有会话记录。创建需求会自动建需求会话；也可以新建设计或评审会话。')
          : h('div', { className: 'dsh-wb-sessions' },
              [...activeSessions, ...archivedSessions].map(session => h('div', {
                className: `dsh-wb-session${session.sessionId === requirement.sessionId ? ' is-primary' : ''}${session.archived ? ' is-archived' : ''}`,
                key: session.id ?? session.sessionId,
              },
                h('span', { className: 'dsh-wb-session-type' }, sessionTypeLabel(session.type)),
                h('span', { className: 'dsh-wb-session-main' },
                  h('b', null, `${session.label || `${sessionTypeLabel(session.type)}会话`}${session.id === requirement.primarySessionId ? ' · 主会话' : ''}${session.archived ? ' · 已归档' : ''}`),
                  h('span', null, session.sessionId ? `${session.sessionId} · ${relativeTime(session.createdAt)}` : `其他设备 · ${relativeTime(session.createdAt)}`),
                ),
                h('span', { className: 'dsh-wb-session-actions' },
                  h('button', {
                    className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-session-go',
                    type: 'button',
                    disabled: !session.sessionId || session.archived,
                    title: session.archived ? '已归档会话不能直接进入' : session.sessionId ? '' : '会话建在另一台设备上，本机无法直接打开',
                    onClick: () => openSession(session.sessionId),
                  }, session.sessionId ? '进入' : '其他设备'),
                  session.archived
                    ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost', type: 'button', disabled: sessionBusy !== '', onClick: () => { void updateSession(session, 'restore') } }, sessionBusy === session.id ? '恢复中…' : '恢复')
                    : h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost', type: 'button', disabled: sessionBusy !== '', onClick: () => { void updateSession(session, 'archive') } }, sessionBusy === session.id ? '归档中…' : '归档'),
                  session.sessionId ? h('button', {
                    className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
                    type: 'button',
                    title: '只删除本机映射，服务端会话记录保留',
                    onClick: () => setUnbindTarget(session),
                  }, '解绑本机') : null,
                ),
              )),
            ),
        h('div', { className: 'dsh-wb-subhead' }, `开发任务 · ${devDone}/${devTasks.length}`),
        devTasks.length === 0
          ? h('div', { className: 'dsh-wb-note' }, '还没有开发任务。需求排期后按平台生成；负责人可以在会话里用 /dev-assign 指派。')
          : h('div', { className: 'dsh-wb-dev-grid' }, devTasks.map(devTaskCard)),
        testRuns.length > 0
          ? h('div', null,
              h('div', { className: 'dsh-wb-subhead' }, `测试记录 · ${testRuns.length}`),
              h('div', null, [...testRuns].reverse().map(run => {
                const tester = state.users.find(user => user.id === run.by)
                const stateClass = run.status === 'passed' ? ' is-passed' : run.status === 'failed' ? ' is-failed' : ' is-running'
                return h('div', { className: 'dsh-wb-testrow', key: run.id },
                  h('span', { className: `state${stateClass}` }, TEST_STATUS_LABELS[run.status] ?? run.status),
                  h('span', { className: 'dsh-wb-testrow-main' },
                    h('span', null, `${tester?.name ?? run.by} · ${relativeTime(run.finishedAt ?? run.startedAt)}`),
                    run.note ? h('span', null, run.note) : null,
                    run.bugUrl
                      ? h('span', null, safeHttpUrl(run.bugUrl)
                          ? h('a', { href: safeHttpUrl(run.bugUrl), target: '_blank', rel: 'noopener noreferrer' }, run.bugUrl)
                          : h('code', null, run.bugUrl))
                      : null,
                  ),
                )
              })),
            )
          : null,
        reviewerIds.length > 0
          ? h('div', null,
              h('div', { className: 'dsh-wb-subhead' }, `会签 · ${approvedReviewers.length}/${reviewerIds.length}`),
              h('div', { className: 'dsh-wb-reviewline' },
                reviewerIds.map(id => {
                  const review = reviewFor(id)
                  const dotClass = review === null ? ' is-pending' : review.decision === 'approved' ? '' : ' is-rejected'
                  return h('span', { className: 'dsh-wb-chip', key: id, title: review?.comment ?? '待评审' },
                    h('span', { className: `dot${dotClass}` }),
                    `${reviewerName(id)} · ${review === null ? '待评审' : REVIEW_DECISION_LABELS[review.decision] ?? review.decision}`,
                  )
                }),
              ),
            )
          : null,
        h('div', { className: 'dsh-wb-subhead' }, `版本历史 · v${requirement.versions.length}`),
        requirement.versions.length === 0
          ? h('div', { className: 'dsh-wb-note' }, '还没有提交版本。首次提交后在这里显示版本记录。')
          : h('div', { className: 'dsh-wb-versions' },
              [...requirement.versions].reverse().map(version => h('div', { className: 'dsh-wb-version', key: `${version.version}-${version.at}` },
                h('b', null, `v${version.version}`),
                h('span', null, version.summary),
                h('span', { style: { marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', whiteSpace: 'nowrap' } }, relativeTime(version.at)),
              )),
            ),
        requirement.designVersions.length > 0
          ? h('div', null,
              h('div', { className: 'dsh-wb-subhead' }, `设计版本历史 · d${requirement.designVersions.length}`),
              h('div', { className: 'dsh-wb-versions' },
                [...requirement.designVersions].reverse().map(version => h('div', { className: 'dsh-wb-version', key: `d-${version.version}-${version.at}` },
                  h('b', null, `d${version.version}`),
                  h('span', null, version.summary, version.files && version.files.length > 0 ? ` · ${version.files.length} 个文件` : ''),
                  h('span', { style: { marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', whiteSpace: 'nowrap' } }, relativeTime(version.at)),
                )),
              ),
            )
          : null,
        reviews.length > 0
          ? h('div', null,
              h('div', { className: 'dsh-wb-subhead' }, `评审记录 · ${reviews.length}`),
              h('div', { className: 'dsh-wb-versions' },
                [...reviews].reverse().map(review => h('div', { className: 'dsh-wb-version', key: review.id },
                  h('b', null, review.decision === 'approved' ? '通过' : '退回'),
                  h('span', null, `${review.comment || '无评审意见'}${review.version ? ` · v${review.version}` : ''}`),
                  h('span', { style: { marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', whiteSpace: 'nowrap' } }, relativeTime(review.at)),
                )),
              ),
            )
          : null,
        h('div', { className: 'dsh-wb-poc' },
          h('div', { className: 'dsh-wb-poc-h' }, h('span', { className: 'dsh-wb-mock' }, 'SKILL'), '在会话里完成评审、排期、设计、开发、测试与发布'),
          h('div', { className: 'dsh-wb-note' },
            '需求：',
            h('code', null, '/req-submit'),
            ' ',
            h('code', null, '/req-review'),
            ' ',
            h('code', null, '/req-schedule'),
            ' ',
            h('code', null, '/req-scope'),
            '；设计：',
            h('code', null, '/design-claim'),
            ' ',
            h('code', null, '/design-start'),
            ' ',
            h('code', null, '/design-deliver'),
            '；开发：',
            h('code', null, '/dev-start'),
            ' ',
            h('code', null, '/dev-finish'),
            '；测试：',
            h('code', null, '/test-verify'),
            '；发布：',
            h('code', null, '/release-freeze'),
            '。工作台只保留创建入口和状态展示。',
          ),
        ),
        unbindTarget !== null
          ? h(ConfirmDialog, {
              title: '解除本机绑定',
              confirmLabel: '解除绑定',
              busy: unbinding,
              onConfirm: () => { void unbindSession() },
              onClose: () => setUnbindTarget(null),
            }, `解除本机与会话「${unbindTarget.label || unbindTarget.id}」的绑定？服务端会话记录会保留，其他设备不受影响。`)
          : null,
      )
    }

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

    function CreateRequirementDialog({ ctx, state, onClose, onCreated, onToast }) {
      const [title, setTitle] = useState('')
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
          setStep('创建需求文件夹')
          const done = await finishRequirementCreation(ctx, requirement, state.iterationDir ?? state.baseDir)
          setStep('打开会话')
          ctx.uiWorkspace.openSession(done.sessionId)
          setTimeout(() => openRightTab(ctx), 350)
          onToast(`${done.requirement.code} ${done.requirement.title} 已创建`, false)
          onCreated(done.requirement)
        } catch (reason) {
          if (requirement !== null) await markCreationFailed(requirement, reason)
          setError(reason instanceof Error ? reason.message : String(reason))
          setStep('')
          setBusy(false)
        }
      }, [title, busy, ctx, onCreated, onToast, state.iterationDir, state.baseDir])

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog', ...modal.dialogProps },
          h('h2', { id: modal.titleId }, '新建需求'),
          h('p', null, `迭代 ${state.iteration.code} · 只需填写需求名称。创建后自动在本地顶级文件夹下建目录、创建 DSH 会话，并打开右栏的需求与设计面板。`),
          h('input', {
            ref: inputRef,
            className: 'dsh-wb-input',
            value: title,
            placeholder: '例如：会员积分改版',
            maxLength: 80,
            disabled: busy,
            onChange: (event) => setTitle(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) void submit() },
          }),
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

    function CreateIterationDialog({ state, onClose, onReload, onToast }) {
      const [code, setCode] = useState(() => suggestIterationCode(state.iterations))
      const [name, setName] = useState('')
      const [startDate, setStartDate] = useState('')
      const [endDate, setEndDate] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const codeRef = useRef(null)
      const modal = useModalBehavior(onClose, !busy)

      useEffect(() => { codeRef.current?.focus() }, [])

      const submit = useCallback(async () => {
        if (busy || code.trim() === '') return
        setBusy(true)
        setError('')
        try {
          await api('iterations', {
            method: 'POST',
            body: JSON.stringify({ code: code.trim(), name: name.trim(), startDate, endDate }),
          })
          await onReload()
          onToast(`迭代 ${code.trim()} 已创建并切换`, false)
          onClose()
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setBusy(false)
        }
      }, [busy, code, name, startDate, endDate, onReload, onToast, onClose])

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog', ...modal.dialogProps },
          h('h2', { id: modal.titleId }, '新建迭代'),
          h('p', null, '创建后自动切换到新迭代，并在当前用户的顶级文件夹下建同名目录。需求编号使用迭代编码的短码。'),
          h('div', { style: { display: 'grid', gap: '8px' } },
            h('input', {
              ref: codeRef,
              className: 'dsh-wb-input',
              value: code,
              placeholder: '迭代编码，例如 2026-S12',
              disabled: busy,
              onChange: (event) => setCode(event.target.value),
            }),
            h('input', {
              className: 'dsh-wb-input',
              value: name,
              placeholder: '迭代名称，例如 双十二会员增长',
              maxLength: 60,
              disabled: busy,
              onChange: (event) => setName(event.target.value),
            }),
            h('div', { style: { display: 'flex', gap: '8px' } },
              h('input', { className: 'dsh-wb-input', type: 'date', value: startDate, disabled: busy, onChange: (event) => setStartDate(event.target.value) }),
              h('input', { className: 'dsh-wb-input', type: 'date', value: endDate, disabled: busy, onChange: (event) => setEndDate(event.target.value) }),
            ),
          ),
          error !== '' ? h('div', { className: 'dsh-wb-dialog-err' }, error) : null,
          h('div', { className: 'dsh-wb-note', style: { marginTop: '10px' } }, `顶级文件夹：${state.baseDir}`),
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: onClose }, '取消'),
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy || code.trim() === '', onClick: () => { void submit() } }, busy ? '创建中…' : '创建迭代'),
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
            h('input', { className: 'dsh-wb-input', value: name, placeholder: '迭代名称', onChange: (event) => setName(event.target.value) }),
            h('input', { className: 'dsh-wb-input', value: phase, placeholder: '阶段，例如 需求评审', onChange: (event) => setPhase(event.target.value) }),
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
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--ghost', type: 'button', disabled: busy !== '', onClick: () => { void archive(false) } }, '归档'),
            h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy !== '', onClick: onClose }, '取消'),
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy !== '' || name.trim() === '', onClick: () => { void save() } }, busy === 'save' ? '保存中…' : '保存'),
          ),
        ),
      )
    }

    function CreateSessionDialog({ ctx, state, requirement, onClose, onCreated, onToast }) {
      const roles = state.currentUser.roles ?? []
      const canProduct = roles.includes('product') || roles.includes('lead') || roles.includes('admin')
      const canDesign = roles.includes('design') || roles.includes('lead') || roles.includes('admin')
      const canDev = roles.includes('dev') || roles.includes('lead') || roles.includes('admin')
      const canTest = roles.includes('qa') || roles.includes('lead') || roles.includes('admin')
      const types = [
        canDesign ? 'design' : null,
        canDev ? 'dev' : null,
        canTest ? 'test' : null,
        canProduct ? 'review' : null,
        canProduct ? 'requirement' : null,
      ].filter(Boolean)
      const [type, setType] = useState(() => (canDesign ? 'design' : canDev ? 'dev' : canTest ? 'test' : 'review'))
      const [busy, setBusy] = useState(false)
      const [step, setStep] = useState('')
      const [error, setError] = useState('')
      const modal = useModalBehavior(onClose, !busy)
      const folderPath = requirement.folderPath

      const submit = useCallback(async () => {
        if (busy || !folderPath) return
        setBusy(true)
        setError('')
        try {
          // 种子需求或换机后的记录可能只有路径、没有目录；先按现有路径补齐，再建 DSH 工作区。
          setStep('准备需求文件夹')
          const normalized = String(folderPath).replace(/\/+$/, '')
          const cut = normalized.lastIndexOf('/')
          if (cut > 0 && cut < normalized.length - 1) {
            await ensureChildDirectory(normalized.slice(0, cut), normalized.slice(cut + 1))
          }
          setStep('创建工作区')
          let workspaceId = requirement.workspaceId
          let sessionId
          try {
            if (!workspaceId) {
              const workspace = await ctx.workspaces.create({ path: folderPath })
              workspaceId = workspace.workspaceId
            }
            setStep('创建会话')
            sessionId = await ctx.sessions.create({ workspaceId })
          } catch (_) {
            // 旧工作区可能已经不在当前 DSH profile；重新按需求文件夹建一个。
            const workspace = await ctx.workspaces.create({ path: folderPath })
            workspaceId = workspace.workspaceId
            sessionId = await ctx.sessions.create({ workspaceId })
          }
          setStep('设置会话标题')
          await ctx.sessions.using(sessionId, { source: 'workbench' }, async (reference) => {
            const result = await reference.binding.session.rename(`${requirement.code} ${requirement.title} · ${sessionTypeLabel(type)}`)
            if (result.ok !== true) throw new Error(result.error?.message || '会话标题设置失败')
          })
          setStep('记录会话')
          const body = await api(`requirements/${encodeURIComponent(requirement.id)}/sessions`, {
            method: 'POST',
            body: JSON.stringify({
              type,
              label: `${sessionTypeLabel(type)}会话`,
              dshSessionId: sessionId,
              workspaceId,
              folderPath,
            }),
          })
          ctx.uiWorkspace.openSession(sessionId)
          // 设计会话直接落在「设计」画布；产品会话仍落在「需求」原型。
          setTimeout(() => (type === 'design' ? openDesignTab(ctx) : openRightTab(ctx)), 300)
          onToast(`${requirement.code} 的${sessionTypeLabel(type)}会话已创建`, false)
          onCreated(body.requirement)
          onClose()
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setStep('')
          setBusy(false)
        }
      }, [busy, folderPath, requirement, type, ctx, onCreated, onClose, onToast])

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog', ...modal.dialogProps },
          h('h2', { id: modal.titleId }, `新建会话 · ${requirement.code}`),
          h('p', null, '同一需求可以有多场会话：需求会话用于提交与评审排期，设计会话做设计，开发会话推进各端开发，测试会话记录测试结论，评审会话讨论评审意见。'),
          types.length === 0
            ? h('div', { className: 'dsh-wb-dialog-err' }, '当前身份不能为这条需求创建会话。')
            : h('div', { className: 'dsh-wb-auth-chips', style: { marginBottom: '12px' } },
                types.map(item => h('button', {
                  className: `dsh-wb-auth-chip${type === item ? ' is-on' : ''}`,
                  type: 'button',
                  key: item,
                  disabled: busy,
                  onClick: () => setType(item),
                }, `${sessionTypeLabel(item)}会话`)),
              ),
          h('div', { className: 'dsh-wb-note', style: { marginBottom: '10px' } },
            type === 'design'
              ? '设计会话里用 /design-claim、/design-start、/design-deliver 完成设计。'
              : type === 'dev'
                ? '开发会话里用 /dev-start 开始某端开发，完成后用 /dev-finish；各端都完成后需求进入待测试。'
                : type === 'test'
                  ? '测试会话里用 /test-verify 开始测试、记录通过或不通过；不通过会通知开发负责人。'
                  : type === 'review'
                    ? '评审会话里用 /req-review 给出评审结论；负责人可用 /req-schedule、/req-scope。'
                    : '需求会话里用 /req-submit 提交需求，之后在评审会话里用 /req-review 评审。',
          ),
          h('div', { className: 'dsh-wb-note mono', style: { overflowWrap: 'anywhere' } }, folderPath ?? '需求文件夹还没有创建'),
          busy ? h('div', { className: 'dsh-wb-progress' }, h('span', { className: 'dsh-wb-spinner' }), `${step}…`) : null,
          error !== '' ? h('div', { className: 'dsh-wb-dialog-err' }, error) : null,
          h('div', { className: 'dsh-wb-dialog-actions' },
            h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: onClose }, '取消'),
            h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--primary',
              type: 'button',
              disabled: busy || types.length === 0 || !folderPath,
              onClick: () => { void submit() },
            }, busy ? '创建中…' : '创建会话'),
          ),
        ),
      )
    }

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

    function LoginPage({ auth }) {
      const mockUsers = auth.mockUsers ?? []
      const href = `${API}auth/dingtalk/start?returnTo=${encodeURIComponent(typeof window === 'undefined' ? '/' : window.location.href)}`
      return h('div', { className: 'dsh-wb-auth' },
        h('div', { className: 'dsh-wb-auth-card' },
          h('div', { className: 'dsh-wb-auth-eyebrow' }, 'DSH · 部门研发工作台'),
          h('h1', { className: 'dsh-wb-auth-title' }, '登录工作台'),
          h('p', { className: 'dsh-wb-auth-sub' }, '使用团队身份进入需求与设计协作。'),
          auth.error !== '' ? h('div', { className: 'dsh-wb-dialog-err' }, auth.error) : null,
          auth.provider === 'mock'
            ? h('div', null,
                h('div', { className: 'dsh-wb-auth-note' }, h('span', { className: 'dsh-wb-mock' }, 'MOCK'), ' POC 测试登录，生产环境切换钉钉 OAuth'),
                h('div', { className: 'dsh-wb-auth-users' },
                  mockUsers.length === 0
                    ? h('div', { className: 'dsh-wb-note' }, '没有可用的 Mock 用户，请检查服务端状态。')
                    : mockUsers.map(user => h('button', {
                        className: 'dsh-wb-auth-user',
                        type: 'button',
                        key: user.id,
                        disabled: auth.busy,
                        onClick: () => { void auth.loginMock(user.id) },
                      },
                        h('span', { className: 'dsh-wb-auth-user-main' },
                          h('b', null, user.name),
                          h('span', null, roleText(user)),
                        ),
                        h('span', { className: 'dsh-wb-auth-user-go' }, '进入 →'),
                      )),
                ),
              )
            : h('div', { className: 'dsh-wb-auth-dingtalk' },
                h('p', null, '使用钉钉扫码 / 授权登录。账号需要管理员提前开通工作台权限。'),
                h('a', { className: 'dsh-wb-btn dsh-wb-btn--primary', href }, '使用钉钉登录'),
              ),
          h('div', { className: 'dsh-wb-auth-foot' }, `登录方式：${auth.provider === 'mock' ? 'Mock Provider' : '钉钉 OAuth'} · 会话保存在 HttpOnly Cookie`),
        ),
      )
    }

    function ProfileForm({ mode, user, platformGroups, platforms, defaultBaseDir, onSubmit, onCancel }) {
      const groups = useMemo(() => activePlatformGroups(platformGroups ?? [], platforms ?? []), [platformGroups, platforms])
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

      return h('div', { className: 'dsh-wb-auth-form' },
        h('section', { className: 'dsh-wb-auth-section' },
          h('div', { className: 'dsh-wb-auth-step' }, '1'),
          h('h3', null, '当前身份'),
          h('p', null, '权限按账号的全部角色合并；这里选择你在工作台里默认使用的身份。'),
          user.roles.length === 0
            ? h('div', { className: 'dsh-wb-dialog-err' }, '账号还没有分配身份，请联系管理员。')
            : h('div', { className: 'dsh-wb-auth-chips' },
                user.roles.map(item => h('button', {
                  className: `dsh-wb-auth-chip${role === item ? ' is-on' : ''}`,
                  type: 'button',
                  key: item,
                  onClick: () => setRole(item),
                }, roleLabel(item))),
              ),
        ),
        h('section', { className: 'dsh-wb-auth-section' },
          h('div', { className: 'dsh-wb-auth-step' }, '2'),
          h('h3', null, '负责的平台 / 团队'),
          h('p', null, '新建需求默认带上这些平台；可多选，后续可在平台配置里调整。'),
          groups.length === 0
            ? h('div', { className: 'dsh-wb-note' }, '当前没有启用的平台组，请联系管理员在平台配置里添加。')
            : h('div', { className: 'dsh-wb-auth-groups' },
                groups.map(entry => h('div', { className: 'dsh-wb-auth-group', key: entry.group.id },
                  h('div', { className: 'dsh-wb-auth-group-head' },
                    h('b', null, entry.group.name),
                    entry.group.supportsApiDoc ? h('span', { className: 'dsh-wb-auth-tag' }, 'API 文档') : null,
                  ),
                  h('div', { className: 'dsh-wb-auth-platforms' },
                    entry.items.length === 0
                      ? h('span', { className: 'dsh-wb-note' }, '暂无平台')
                      : entry.items.map(platform => h('label', { className: 'dsh-wb-auth-check', key: platform.id },
                          h('input', {
                            type: 'checkbox',
                            checked: selected.includes(platform.id),
                            onChange: () => togglePlatform(platform.id),
                          }),
                          platform.name,
                        )),
                  ),
                )),
              ),
        ),
        h('section', { className: 'dsh-wb-auth-section' },
          h('div', { className: 'dsh-wb-auth-step' }, '3'),
          h('h3', null, '本地顶级文件夹'),
          h('p', null, '需求文件夹和 DSH 会话都建在这里；只保存在本机 DSH，不上传团队服务端。'),
          h('input', {
            className: 'dsh-wb-input',
            value: folder,
            placeholder: '例如：~/DSH-Workbench',
            onChange: (event) => setFolder(event.target.value),
            disabled: busy,
            'aria-label': '本地顶级文件夹',
          }),
          mode === 'settings'
            ? h('p', { className: 'dsh-wb-note' }, '修改文件夹不会移动已有需求目录；已有会话仍指向原路径。')
            : null,
        ),
        error !== '' ? h('div', { className: 'dsh-wb-dialog-err' }, error) : null,
        h('div', { className: 'dsh-wb-dialog-actions' },
          onCancel ? h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: onCancel }, '取消') : null,
          h('button', {
            className: 'dsh-wb-btn dsh-wb-btn--primary',
            type: 'button',
            disabled: busy || folder.trim() === '' || user.roles.length === 0,
            onClick: () => { void submit() },
          }, busy ? '保存中…' : (mode === 'settings' ? '保存设置' : '进入工作台')),
        ),
      )
    }

    function OnboardingPage({ auth }) {
      const submit = useCallback(async (payload) => {
        await api('onboarding/complete', { method: 'POST', body: JSON.stringify(payload) })
        await auth.refresh()
      }, [auth])
      return h('div', { className: 'dsh-wb-auth' },
        h('div', { className: 'dsh-wb-auth-card dsh-wb-auth-card--wide' },
          h('div', { className: 'dsh-wb-auth-eyebrow' }, '首次使用 · 只需设置一次'),
          h('h1', { className: 'dsh-wb-auth-title' }, `欢迎，${auth.user.name}`),
          h('p', { className: 'dsh-wb-auth-sub' }, '确认身份、平台和本地文件夹后，就可以开始建需求了。'),
          h(ProfileForm, {
            mode: 'onboarding',
            user: auth.user,
            platformGroups: auth.platformGroups,
            platforms: auth.platforms,
            defaultBaseDir: auth.defaultBaseDir,
            onSubmit: submit,
          }),
          h('div', { className: 'dsh-wb-auth-foot' }, '顶级文件夹路径只保存本机；团队服务端只记录“已配置”。'),
        ),
      )
    }

    function SettingsDialog({ auth, state, onClose, onReload, onToast }) {
      const modal = useModalBehavior(onClose)
      const submit = useCallback(async (payload) => {
        await api('onboarding/complete', { method: 'POST', body: JSON.stringify(payload) })
        await auth.refresh()
        await onReload()
        onToast('身份与文件夹设置已保存', false)
        onClose()
      }, [auth, onClose, onReload, onToast])
      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog dsh-wb-platform-dialog', ...modal.dialogProps },
          h('div', { className: 'dsh-wb-dialog-head' },
            h('div', null,
              h('h2', { id: modal.titleId }, '个人设置'),
              h('p', null, '调整当前身份、平台范围和本地顶级文件夹。'),
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flex: 'none' } },
              h('button', {
                className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
                type: 'button',
                disabled: auth.busy,
                onClick: async () => { await auth.logout(); onClose() },
              }, '退出登录'),
              h('button', { className: 'dsh-wb-rqbar-toggle', type: 'button', onClick: onClose, title: '关闭', 'aria-label': '关闭' }, '×'),
            ),
          ),
          h(ProfileForm, {
            mode: 'settings',
            user: state.currentUser ?? auth.user,
            platformGroups: state.platformGroups,
            platforms: state.platforms,
            defaultBaseDir: state.baseDir,
            onSubmit: submit,
            onCancel: onClose,
          }),
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

    function PlatformRow({ platform, groups, users, busy, onSave, onArchive }) {
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
              disabled: busy || platform.order <= 0,
              title: '上移',
              onClick: () => { void onSave(platform, { order: Math.max(0, Number(platform.order) - 1) }) },
            }, '↑'),
            h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
              type: 'button',
              disabled: busy,
              title: '下移',
              onClick: () => { void onSave(platform, { order: Number(platform.order) + 1 }) },
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
                : platforms.map(platform => h(PlatformRow, {
                    key: platform.id,
                    platform,
                    groups,
                    users: state.users ?? [],
                    busy: busy !== '',
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

    function NotificationBell({ state, onOpenRequirement, onReload, onToast }) {
      const [open, setOpen] = useState(false)
      const [busy, setBusy] = useState(false)
      const [groupFilter, setGroupFilter] = useState('')
      const wrapRef = useRef(null)
      const buttonRef = useRef(null)
      const panelRef = useRef(null)
      const panelId = useRef(`dsh-wb-notif-panel-${++modalSeq}`).current
      const items = Array.isArray(state.notifications) ? state.notifications : []
      const groups = Array.isArray(state.notificationGroups) ? state.notificationGroups : []
      const unread = state.unreadNotificationCount ?? items.filter(item => item.read !== true).length
      const visibleItems = groupFilter === ''
        ? items
        : items.filter(item => (item.requirementId ?? 'system') === groupFilter)

      useEffect(() => {
        if (groupFilter !== '' && !groups.some(group => group.key === groupFilter)) setGroupFilter('')
      }, [groups, groupFilter])

      useEffect(() => {
        if (!open) return undefined
        const close = (event) => { if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false) }
        document.addEventListener('mousedown', close)
        const focusTimer = setTimeout(() => {
          const target = panelRef.current?.querySelector('button:not([disabled])')
          target?.focus()
        }, 0)
        return () => {
          document.removeEventListener('mousedown', close)
          clearTimeout(focusTimer)
        }
      }, [open])

      const closePopover = () => {
        setOpen(false)
        buttonRef.current?.focus()
      }

      const markAll = useCallback(async () => {
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
      }, [busy, onReload, onToast])

      const openItem = useCallback(async (item) => {
        setOpen(false)
        if (item.read !== true) {
          try {
            await api('notifications/read', { method: 'POST', body: JSON.stringify({ ids: [item.id] }) })
            await onReload()
          } catch (_) { /* 读取失败不阻塞跳转 */ }
        }
        if (item.requirementId) onOpenRequirement(item.requirementId)
      }, [onOpenRequirement, onReload])

      return h('div', {
        className: 'dsh-wb-popwrap',
        ref: wrapRef,
        onKeyDown: (event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            event.stopPropagation()
            closePopover()
          }
        },
      },
        h('button', {
          ref: buttonRef,
          className: 'dsh-wb-iconbtn',
          type: 'button',
          title: unread > 0 ? `${unread} 条未读通知` : '通知',
          'aria-label': unread > 0 ? `通知，${unread} 条未读` : '通知',
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-controls': panelId,
          onClick: () => setOpen(value => !value),
        },
          h(BellIcon),
          h('span', null, '通知'),
          unread > 0 ? h('span', { className: 'dsh-wb-bell-badge' }, unread > 99 ? '99+' : String(unread)) : null,
        ),
        open ? h('div', { className: 'dsh-wb-popover', ref: panelRef, id: panelId, role: 'dialog', 'aria-label': '通知' },
          h('div', { className: 'dsh-wb-popover-head' },
            h('b', null, '通知'),
            h('span', { className: 'dsh-wb-count' }, `${unread} 条未读`),
            unread > 0 ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost', type: 'button', disabled: busy, onClick: () => { void markAll() } }, busy ? '处理中…' : '全部已读') : null,
          ),
          groups.length > 0
            ? h('div', { className: 'dsh-wb-notif-groups' },
                h('button', {
                  className: `dsh-wb-notif-group${groupFilter === '' ? ' is-active' : ''}`,
                  type: 'button',
                  onClick: () => setGroupFilter(''),
                }, `全部 ${items.length}`),
                groups.map(group => h('button', {
                  className: `dsh-wb-notif-group${groupFilter === group.key ? ' is-active' : ''}`,
                  type: 'button',
                  key: group.key,
                  title: `${group.code || '系统'} ${group.title}`,
                  onClick: () => setGroupFilter(group.key),
                }, `${group.code || '系统'}${group.unread > 0 ? ` · ${group.unread}` : ''}`)),
              )
            : null,
          visibleItems.length === 0
            ? h('div', { className: 'dsh-wb-empty', style: { padding: '24px 14px' } }, h('b', null, '还没有通知'), '需求评审、开发完成、测试结果和技能审核会出现在这里。')
            : visibleItems.map(item => h('button', {
                className: `dsh-wb-notif${item.read === true ? '' : ' is-unread'}`,
                type: 'button',
                key: item.id,
                'aria-label': `${item.read === true ? '' : '未读，'}${item.title}${item.body ? `，${item.body}` : ''}，${relativeTime(item.at)}`,
                onClick: () => { void openItem(item) },
              },
                h('span', { className: 'dsh-wb-notif-title' },
                  item.read === true ? null : h('span', { className: 'dsh-wb-notif-dot' }),
                  item.title,
                ),
                item.body ? h('span', { className: 'dsh-wb-notif-body' }, item.body) : null,
                h('span', { className: 'dsh-wb-notif-time' }, relativeTime(item.at)),
              )),
        ) : null,
      )
    }

    function RolePackChips({ value, onChange, disabled }) {
      return h('div', { className: 'dsh-wb-auth-chips' },
        ['lead', 'product', 'design', 'dev', 'qa', 'admin'].map(role => h('button', {
          className: `dsh-wb-auth-chip${value.includes(role) ? ' is-on' : ''}`,
          type: 'button',
          key: role,
          disabled,
          onClick: () => onChange(value.includes(role) ? value.filter(item => item !== role) : [...value, role]),
        }, roleLabel(role))),
      )
    }

    function SkillManager({ state, onClose, onReload, onToast }) {
      const roles = state.currentUser.roles ?? []
      const canPlan = roles.includes('lead') || roles.includes('admin')
      const [skills, setSkills] = useState([])
      const [loading, setLoading] = useState(true)
      const [filter, setFilter] = useState('all')
      const [selectedId, setSelectedId] = useState(null)
      const [mode, setMode] = useState('view')
      const [busy, setBusy] = useState('')
      const [error, setError] = useState('')
      const [form, setForm] = useState({ name: '', description: '', summary: '', content: '', rolePacks: ['product'], scope: canPlan ? 'global' : 'personal' })
      const [edit, setEdit] = useState({ description: '', rolePacks: [] })
      const [reviewForm, setReviewForm] = useState(null)
      const modal = useModalBehavior(onClose, busy === '')

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
      }, [selectedId])
      useEffect(() => {
        if (selected === null) return
        setEdit({ description: selected.description, rolePacks: [...(selected.rolePacks ?? [])] })
      }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

      const visible = useMemo(() => skills.filter(skill => {
        if (filter === 'all') return true
        if (filter === 'pending') return skill.status === 'pending_review'
        if (filter === 'archived') return skill.status === 'archived'
        return skill.scope === filter
      }), [skills, filter])

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

      const filterBtn = (key, label) => h('button', {
        className: filter === key ? 'is-on' : '',
        type: 'button',
        key,
        onClick: () => setFilter(key),
      }, label)

      const latest = selected?.versions?.[selected.versions.length - 1] ?? null
      const canEditSelected = selected !== null && (canPlan || selected.ownerId === state.currentUser.id)
      const contentValue = mode === 'create' || mode === 'version' ? form.content : (latest?.content ?? '')

      return h('div', { className: 'dsh-wb-overlay', ...modal.overlayProps },
        h('div', { className: 'dsh-wb-dialog dsh-wb-skill-dialog', ...modal.dialogProps },
          h('div', { className: 'dsh-wb-dialog-head' },
            h('div', null,
              h('h2', { id: modal.titleId }, '技能管理'),
              h('p', null, '团队技能由负责人审核发布；个人技能审核通过后对该角色开放。会话里的技能名称与这里一致。'),
            ),
            h('button', { className: 'dsh-wb-rqbar-toggle', type: 'button', onClick: onClose, title: '关闭', 'aria-label': '关闭' }, '×'),
          ),
          error !== '' ? h('div', { className: 'dsh-wb-dialog-err' }, error) : null,
          h('div', { className: 'dsh-wb-skill-body' },
            h('div', { className: 'dsh-wb-skill-list' },
              h('div', { className: 'dsh-wb-skill-filter' },
                filterBtn('all', '全部'),
                filterBtn('pending', '待审核'),
                filterBtn('global', '团队'),
                filterBtn('personal', '个人'),
                filterBtn('archived', '归档'),
                h('button', { type: 'button', onClick: startCreate, style: { color: 'var(--dsw-alias-brand-primary)' } }, '+ 新建'),
              ),
              loading
                ? h('div', { className: 'dsh-wb-note', style: { padding: '14px' } }, '正在读取技能…')
                : visible.length === 0
                  ? h('div', { className: 'dsh-wb-note', style: { padding: '14px' } }, '这个筛选下没有技能。')
                  : visible.map(skill => {
                      const tags = [
                        h('span', { className: `dsh-wb-skill-tag${skill.status === 'active' ? ' is-active' : skill.status === 'pending_review' ? ' is-pending' : ''}`, key: 'status' }, SKILL_STATUS_LABELS[skill.status] ?? skill.status),
                        h('span', { className: 'dsh-wb-skill-tag', key: 'scope' }, SKILL_SCOPE_LABELS[skill.scope] ?? skill.scope),
                        ...(skill.rolePacks ?? []).map(role => h('span', { className: 'dsh-wb-skill-tag', key: role }, roleLabel(role))),
                      ]
                      return h('button', {
                        className: `dsh-wb-skill-item${skill.id === selectedId ? ' is-selected' : ''}`,
                        type: 'button',
                        key: skill.id,
                        onClick: () => { setSelectedId(skill.id); setMode('view') },
                      },
                        h('b', null, skill.name),
                        h('span', null, skill.description || '未填写说明'),
                        h('span', { className: 'dsh-wb-skill-tags' }, tags),
                      )
                    }),
            ),
            h('div', { className: 'dsh-wb-skill-detail' },
              mode === 'create'
                ? h('div', { className: 'dsh-wb-skill-form' },
                    h('h3', null, '新建技能'),
                    h('input', { className: 'dsh-wb-input', value: form.name, placeholder: '技能名，例如 req-acceptance（字母/数字/-/_）', onChange: (event) => setForm(current => ({ ...current, name: event.target.value })) }),
                    h('input', { className: 'dsh-wb-input', value: form.description, placeholder: '一句话说明这个技能做什么', onChange: (event) => setForm(current => ({ ...current, description: event.target.value })) }),
                    h('div', null,
                      h('div', { className: 'dsh-wb-rqdetail-k' }, '适用角色'),
                      h(RolePackChips, { value: form.rolePacks, onChange: (rolePacks) => setForm(current => ({ ...current, rolePacks })) }),
                    ),
                    canPlan ? h('label', { className: 'dsh-wb-auth-check' },
                      h('input', {
                        type: 'checkbox',
                        checked: form.scope === 'global',
                        onChange: (event) => setForm(current => ({ ...current, scope: event.target.checked ? 'global' : 'personal' })),
                      }),
                      '作为团队技能直接发布（仅负责人/管理员）',
                    ) : null,
                    h('textarea', { className: 'dsh-wb-textarea', value: form.content, placeholder: '技能正文，支持 Markdown', onChange: (event) => setForm(current => ({ ...current, content: event.target.value })) }),
                    h('input', { className: 'dsh-wb-input', value: form.summary, placeholder: '版本说明（可选）', onChange: (event) => setForm(current => ({ ...current, summary: event.target.value })) }),
                    h('div', { className: 'dsh-wb-skill-actions' },
                      h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy !== '', onClick: () => setMode('view') }, '取消'),
                      h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy !== '' || form.name.trim() === '' || form.content.trim() === '', onClick: () => { void submitCreate() } }, busy === 'create' ? '创建中…' : '创建技能'),
                    ),
                  )
                : mode === 'version' && selected !== null
                  ? h('div', { className: 'dsh-wb-skill-form' },
                      h('h3', null, `上传新版本 · ${selected.name}`),
                      h('p', null, `当前 v${latest?.version ?? 0}。${canPlan && selected.scope === 'global' ? '负责人上传团队技能版本会直接发布。' : '上传后等待负责人审核。'}`),
                      h('textarea', { className: 'dsh-wb-textarea', value: form.content, onChange: (event) => setForm(current => ({ ...current, content: event.target.value })) }),
                      h('input', { className: 'dsh-wb-input', value: form.summary, placeholder: '版本说明', onChange: (event) => setForm(current => ({ ...current, summary: event.target.value })) }),
                      h('div', { className: 'dsh-wb-skill-actions' },
                        h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy !== '', onClick: () => setMode('view') }, '取消'),
                        h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', disabled: busy !== '' || form.content.trim() === '', onClick: () => { void submitVersion() } }, busy === 'version' ? '上传中…' : '上传版本'),
                      ),
                    )
                  : selected === null
                    ? h('div', { className: 'dsh-wb-empty' }, h('b', null, '选择一个技能'), '左侧点一个技能查看内容、版本和审核状态。')
                    : h('div', { className: 'dsh-wb-skill-form' },
                        h('h3', null, selected.name),
                        h('div', { className: 'dsh-wb-skill-tags' },
                          h('span', { className: `dsh-wb-skill-tag${selected.status === 'active' ? ' is-active' : selected.status === 'pending_review' ? ' is-pending' : ''}` }, SKILL_STATUS_LABELS[selected.status] ?? selected.status),
                          h('span', { className: 'dsh-wb-skill-tag' }, SKILL_SCOPE_LABELS[selected.scope] ?? selected.scope),
                          h('span', { className: 'dsh-wb-skill-tag' }, `v${latest?.version ?? 0}`),
                          h('span', { className: 'dsh-wb-skill-tag' }, `所有者 ${state.users.find(user => user.id === selected.ownerId)?.name ?? selected.ownerId}`),
                        ),
                        canEditSelected
                          ? h('div', { className: 'dsh-wb-skill-form' },
                              h('input', { className: 'dsh-wb-input', value: edit.description, placeholder: '技能说明', onChange: (event) => setEdit(current => ({ ...current, description: event.target.value })) }),
                              h('div', null,
                                h('div', { className: 'dsh-wb-rqdetail-k' }, '适用角色'),
                                h(RolePackChips, { value: edit.rolePacks, onChange: (rolePacks) => setEdit(current => ({ ...current, rolePacks })) }),
                              ),
                              h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', disabled: busy !== '', onClick: () => { void submitEdit() } }, busy === 'edit' ? '保存中…' : '保存说明与角色'),
                            )
                          : h('p', null, selected.description || '未填写说明'),
                        h('div', { className: 'dsh-wb-rqdetail-k' }, `正文 · v${latest?.version ?? 0}`),
                        h('div', { className: 'dsh-wb-textarea', style: { minHeight: '180px', overflow: 'auto', whiteSpace: 'pre-wrap' } }, contentValue || '—'),
                        h('div', null,
                          h('div', { className: 'dsh-wb-rqdetail-k' }, '版本历史'),
                          (selected.versions ?? []).length === 0
                            ? h('div', { className: 'dsh-wb-note' }, '还没有版本。')
                            : [...selected.versions].reverse().map(version => h('div', { className: 'dsh-wb-skill-version', key: version.version },
                                h('b', null, `v${version.version}`),
                                h('span', null, version.summary || '无说明'),
                                h('span', null, `· ${relativeTime(version.at)}`),
                                h('span', null, version.decision === 'approved' ? '· 已通过' : version.decision === 'rejected' ? '· 已退回' : '· 待审核'),
                                version.comment ? h('span', null, `· ${version.comment}`) : null,
                              )),
                        ),
                        reviewForm !== null
                          ? h('div', { className: 'dsh-wb-reviewbox' },
                              h('div', { className: 'dsh-wb-rqdetail-k' }, reviewForm.decision === 'approve' ? '审核意见（可留空）' : '退回原因'),
                              h('textarea', {
                                className: 'dsh-wb-textarea',
                                style: { minHeight: '64px' },
                                value: reviewForm.comment,
                                maxLength: 500,
                                'aria-label': reviewForm.decision === 'approve' ? '审核意见' : '退回原因',
                                onChange: (event) => setReviewForm(current => ({ ...current, comment: event.target.value })),
                              }),
                              h('div', { className: 'dsh-wb-skill-actions' },
                                h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', disabled: busy !== '', onClick: () => setReviewForm(null) }, '取消'),
                                h('button', {
                                  className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary',
                                  type: 'button',
                                  disabled: busy !== '' || (reviewForm.decision === 'reject' && reviewForm.comment.trim() === ''),
                                  onClick: () => { void submitReview(reviewForm.decision) },
                                }, busy === 'review' ? '提交中…' : reviewForm.decision === 'approve' ? '确认通过' : '确认退回'),
                              ),
                            )
                          : null,
                        h('div', { className: 'dsh-wb-skill-actions' },
                          selected.status === 'pending_review' && canPlan
                            ? h('span', { style: { display: 'flex', gap: '6px' } },
                                h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--primary', type: 'button', disabled: busy !== '', onClick: () => setReviewForm({ decision: 'approve', comment: '' }) }, '通过'),
                                h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', disabled: busy !== '', onClick: () => setReviewForm({ decision: 'reject', comment: '' }) }, '退回'),
                              )
                            : null,
                          canEditSelected
                            ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', disabled: busy !== '', onClick: () => { setMode('version'); setForm(current => ({ ...current, content: latest?.content ?? '', summary: '' })) } }, '上传新版本')
                            : null,
                          canEditSelected
                            ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost', type: 'button', disabled: busy !== '', onClick: () => { void toggleArchive() } }, selected.status === 'archived' ? '恢复技能' : '归档')
                            : null,
                          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost', type: 'button', onClick: onClose }, '关闭'),
                        ),
                      ),
            ),
          ),
        ),
      )
    }

    function MainPage({ ctx }) {
      return h(WorkbenchGate, { ctx })
    }

    function WorkbenchGate({ ctx }) {
      const auth = useAuth()
      if (auth.loading) {
        return h('div', { className: 'dsh-wb-page' },
          h('div', { className: 'dsh-wb-skeleton', style: { width: '180px', height: '22px' } }),
          h('div', { className: 'dsh-wb-skeleton', style: { width: '60%' } }),
          h('div', { className: 'dsh-wb-skeleton', style: { width: '80%' } }),
        )
      }
      if (!auth.authenticated || auth.user === null) return h(LoginPage, { auth })
      if (!auth.user.onboarding || !auth.user.onboarding.completedAt) return h(OnboardingPage, { auth })
      return h(WorkbenchPage, { ctx, auth })
    }

    const ADMIN_ROLES = ['lead', 'product', 'design', 'dev', 'qa', 'admin']

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
        api('admin/audit?limit=50').then((data) => { if (alive) setAudit(data.events ?? []) }).catch((reason) => {
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
                  ? h('pre', { className: 'dsh-wb-admin-code' }, JSON.stringify(syncResult, null, 2))
                  : null,
              )
            : null,
          tab === 'integrations'
            ? h('div', { className: 'dsh-wb-admin-pane' },
                integrations === null
                  ? h('div', { className: 'dsh-wb-note' }, '读取中…')
                  : h('pre', { className: 'dsh-wb-admin-code' }, JSON.stringify(integrations, null, 2)),
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
                        h('code', null, event.type),
                        h('span', null, relativeTime(event.at)),
                        h('span', { className: 'dsh-wb-admin-audit-payload' }, JSON.stringify(event.payload)),
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
      if (requirements.some(item => ['designing', 'assigned'].includes(item.designStatus))) return '设计'
      return '需求'
    }

    function iterationPhaseTone(label) {
      if (label === '已封板') return 'success'
      if (label === '规划中') return 'idle'
      if (label === '测试') return 'warn'
      return 'business'
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

    function requirementTestLabel(requirement) {
      const latest = Array.isArray(requirement.testRuns) && requirement.testRuns.length > 0
        ? requirement.testRuns[requirement.testRuns.length - 1]
        : null
      if (latest === null) return ''
      return `测试${TEST_STATUS_LABELS[latest.status] ?? latest.status}`
    }

    function requirementDevLabel(requirement) {
      const tasks = Array.isArray(requirement.devTasks) ? requirement.devTasks : []
      if (tasks.length === 0) return ''
      return `开发 ${tasks.filter(task => task.status === 'done').length}/${tasks.length}`
    }

    function Avatar({ name, size = 18 }) {
      const text = String(name ?? '?').trim().slice(0, 1) || '?'
      return h('span', {
        className: 'dsh-wb-avatar',
        style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(9, size - 9)}px` },
        title: name || '',
        'aria-hidden': 'true',
      }, text)
    }

    function IterationKpis({ state, entries }) {
      const active = entries.filter(entry => entry.iteration.status === 'in_progress').length
      const total = entries.reduce((sum, entry) => sum + entry.requirements.length, 0)
      const month = new Date().toISOString().slice(0, 7)
      const closed = entries.filter(entry =>
        entry.iteration.status === 'done' &&
        String(entry.iteration.endDate ?? '').startsWith(month)).length
      const risk = entries.reduce((sum, entry) => sum + iterationRisk(entry.requirements).count, 0)
      return h('div', { className: 'dsh-wb-iter-kpis' },
        h(StatCard, { label: '进行中迭代', value: active, detail: entries.filter(entry => entry.iteration.status === 'in_progress').map(entry => entry.iteration.shortCode ?? entry.iteration.code).join(' · ') || undefined }),
        h(StatCard, { label: '需求总数', value: total, detail: `覆盖 ${entries.length} 个迭代` }),
        h(StatCard, { label: '本月封板', value: closed, detail: closed > 0 ? month : '还没有封板迭代' }),
        h(StatCard, { label: '风险项', value: risk, detail: risk > 0 ? '设计、测试与变更需关注' : '暂无风险' }),
      )
    }

    function IterationListView({ state, query, onQuery, filter, onFilter, sort, onSort, onOpen, onCreate, canCreate }) {
      const entries = [...(state.iterations ?? [])]
        .filter(iteration => iteration.archived !== true)
        .map(iteration => ({ iteration, requirements: iterationRequirements(state, iteration.id) }))
      const uid = state.currentUser.id
      const normalized = query.trim().toLowerCase()
      const visible = entries.filter(({ iteration, requirements }) => {
        if (normalized !== '' && !`${iteration.code} ${iteration.name}`.toLowerCase().includes(normalized)) return false
        if (filter === 'mine') {
          return iteration.ownerId === uid || requirements.some(requirement =>
            requirement.ownerId === uid ||
            requirement.designerId === uid ||
            (requirement.reviewerIds ?? []).includes(uid) ||
            (requirement.devTasks ?? []).some(task => task.assigneeId === uid))
        }
        if (filter === 'active') return iteration.status === 'in_progress'
        if (filter === 'done') return iteration.status === 'done'
        return true
      })
      const phaseOrder = { '规划中': 0, '需求': 1, '设计': 2, '开发': 3, '测试': 4, '已封板': 5 }
      const ordered = sort === ''
        ? visible
        : [...visible].sort((left, right) => {
            if (sort === 'owner') {
              const leftOwner = state.users.find(user => user.id === left.iteration.ownerId)?.name ?? left.iteration.ownerId
              const rightOwner = state.users.find(user => user.id === right.iteration.ownerId)?.name ?? right.iteration.ownerId
              return leftOwner.localeCompare(rightOwner, 'zh-CN')
            }
            const leftPhase = phaseOrder[iterationPhaseLabel(left.iteration, left.requirements)] ?? 9
            const rightPhase = phaseOrder[iterationPhaseLabel(right.iteration, right.requirements)] ?? 9
            return leftPhase - rightPhase
          })
      const mine = entries.filter(({ iteration, requirements }) =>
        iteration.ownerId === uid || requirements.some(requirement =>
          requirement.ownerId === uid ||
          requirement.designerId === uid ||
          (requirement.reviewerIds ?? []).includes(uid))).length
      const active = entries.filter(entry => entry.iteration.status === 'in_progress').length
      const month = new Date().toISOString().slice(0, 7)
      const closed = entries.filter(entry =>
        entry.iteration.status === 'done' && String(entry.iteration.endDate ?? '').startsWith(month)).length

      return h('div', null,
        h('div', { className: 'dsh-wb-page-head' },
          h('div', { className: 'dsh-wb-page-title-block' },
            h('h1', { className: 'dsh-wb-page-title' }, '迭代'),
            h('p', { className: 'dsh-wb-page-sub' },
              `共 ${entries.length} 个迭代 · 我参与 ${mine} 个 · 进行中 ${active} 个 · 本月封板 ${closed} 个`),
          ),
          canCreate ? h('button', {
            className: 'dsh-wb-btn dsh-wb-btn--primary',
            type: 'button',
            onClick: onCreate,
          }, '+ 新建迭代') : null,
        ),
        h(IterationKpis, { state, entries }),
        h('div', { className: 'dsh-wb-iter-toolbar' },
          h('div', { className: 'dsh-wb-seg' },
            [['all', '全部'], ['mine', '我参与的'], ['active', '进行中'], ['done', '已封板']].map(([key, label]) =>
              h('button', {
                key,
                type: 'button',
                className: filter === key ? 'is-on' : '',
                onClick: () => onFilter(key),
              }, label)),
          ),
          h('div', { className: 'dsh-wb-iter-tools' },
            h('div', { className: 'dsh-wb-iter-sort' },
              h('button', {
                type: 'button',
                className: sort === 'phase' ? 'is-on' : '',
                onClick: () => onSort(sort === 'phase' ? '' : 'phase'),
              }, '按阶段'),
              h('button', {
                type: 'button',
                className: sort === 'owner' ? 'is-on' : '',
                onClick: () => onSort(sort === 'owner' ? '' : 'owner'),
              }, '按负责人'),
            ),
            h('div', { className: 'dsh-wb-iter-search' },
              h('input', {
                className: 'dsh-wb-input',
                type: 'search',
                value: query,
                placeholder: '搜索迭代编号或名称',
                'aria-label': '搜索迭代',
                onChange: event => onQuery(event.target.value),
              }),
            ),
          ),
        ),
        ordered.length === 0
          ? h('div', { className: 'dsh-wb-empty dsh-wb-empty--page' },
              h('b', null, normalized !== '' ? '没有匹配的迭代' : '还没有迭代'),
              normalized !== '' ? '换一个关键词或筛选条件。' : canCreate ? '点右上角「新建迭代」开始。' : '等负责人创建迭代后再来。',
            )
          : h('div', { className: 'dsh-wb-iter-table', role: 'table', 'aria-label': '迭代列表' },
              h('div', { className: 'dsh-wb-iter-tr is-head', role: 'row' },
                h('span', { role: 'columnheader' }, '编号'),
                h('span', { role: 'columnheader' }, '迭代名称'),
                h('span', { role: 'columnheader' }, '当前阶段'),
                h('span', { role: 'columnheader' }, '起止'),
                h('span', { role: 'columnheader' }, '负责人'),
                h('span', { role: 'columnheader' }, '需求'),
                h('span', { role: 'columnheader' }, '进度'),
                h('span', { role: 'columnheader' }, '风险'),
              ),
              ordered.map(({ iteration, requirements }) => {
                const owner = state.users.find(user => user.id === iteration.ownerId)
                const phase = iterationPhaseLabel(iteration, requirements)
                const progress = requirementsProgress(requirements)
                const risk = iterationRisk(requirements)
                return h('button', {
                  className: 'dsh-wb-iter-tr is-row',
                  type: 'button',
                  key: iteration.id,
                  role: 'row',
                  onClick: () => onOpen(iteration.id),
                },
                  h('span', { className: 'dsh-wb-iter-code', role: 'cell' }, iteration.code),
                  h('span', { className: 'dsh-wb-iter-name', role: 'cell' },
                    h('b', null, iteration.name),
                    h('em', null, `${requirements.filter(item => item.inScope !== false).length} 个本期需求 · ${iteration.status === 'planning' ? '范围待定' : '范围已排期'}`),
                  ),
                  h('span', { role: 'cell' }, h('span', { className: `dsh-wb-chip dsh-wb-chip--${iterationPhaseTone(phase)}` },
                    h('span', { className: 'g' }, phase === '已封板' ? '✓' : phase === '规划中' ? '○' : '◐'),
                    phase,
                  )),
                  h('span', { className: 'dsh-wb-iter-dates', role: 'cell' }, `${iteration.startDate || '待定'} → ${iteration.endDate || '待定'}`),
                  h('span', { className: 'dsh-wb-iter-owner', role: 'cell' },
                    h(Avatar, { name: owner?.name ?? iteration.ownerId }),
                    owner?.name ?? iteration.ownerId,
                  ),
                  h('span', { className: 'dsh-wb-iter-num', role: 'cell' }, String(requirements.length)),
                  h('span', { className: 'dsh-wb-iter-progress', role: 'cell' },
                    h('span', { className: 'dsh-wb-progress' },
                      h('span', { className: progress >= 100 ? 'is-done' : '', style: { width: `${Math.min(100, progress)}%` } }),
                    ),
                    h('em', null, `${progress}%`),
                  ),
                  h('span', { role: 'cell' },
                    risk.count > 0
                      ? h('span', { className: 'dsh-wb-chip dsh-wb-chip--warn', title: risk.text }, h('span', { className: 'g' }, '◷'), risk.text)
                      : h('span', { className: 'dsh-wb-muted' }, '—'),
                  ),
                )
              }),
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
      const designing = requirements.filter(item => ['designing', 'assigned'].includes(item.designStatus)).length
      const devTasks = requirements.flatMap(item => item.devTasks ?? [])
      const devDone = devTasks.filter(task => task.status === 'done').length
      const devDoing = devTasks.filter(task => task.status === 'in_progress').length
      const testRuns = requirements.flatMap(item => item.testRuns ?? [])
      const testDone = testRuns.filter(run => run.status === 'passed' || run.status === 'failed').length
      const released = requirements.filter(item => ['released', 'done'].includes(item.status)).length
      const pct = (a, b) => b === 0 ? 0 : Math.round((a / b) * 100)
      return [
        { label: '需求与评审', meta: `${Math.max(0, total - pending)}/${total} 已评审`, pct: pct(reviewed, total), tone: pending > 0 ? 'progress' : total > 0 ? 'done' : 'idle' },
        { label: '设计', meta: `${designReady}/${total} 已交付/无需`, pct: pct(designReady, total), tone: designing > 0 ? 'progress' : designReady === total && total > 0 ? 'done' : 'idle' },
        { label: '开发', meta: `${devDone}/${devTasks.length} 端完成`, pct: pct(devDone, devTasks.length), tone: devDoing > 0 ? 'progress' : devTasks.length > 0 && devDone === devTasks.length ? 'done' : 'idle' },
        { label: '测试', meta: `${testDone}/${testRuns.length} 轮完成`, pct: pct(testDone, testRuns.length), tone: testRuns.some(run => run.status === 'running') ? 'progress' : testRuns.length > 0 && testDone === testRuns.length ? 'done' : 'idle' },
        { label: '封板', meta: `${released}/${total} 已发布`, pct: pct(released, total), tone: released === total && total > 0 ? 'done' : 'idle' },
      ]
    }

    function RequirementCard({ requirement, state, onOpen, onOpenSession, onOpenDesign }) {
      const owner = state.users.find(user => user.id === requirement.ownerId)
      const designer = requirement.designerId ? state.users.find(user => user.id === requirement.designerId) : null
      const grouped = groupedPlatforms(state.platforms ?? [], state.platformGroups ?? [], requirement.platformIds)
      const dev = requirementDevLabel(requirement)
      const test = requirementTestLabel(requirement)
      const designCount = Math.max(
        requirement.designFiles?.length ?? 0,
        (requirement.designScreens?.length ?? 0) + (requirement.designImages?.length ?? 0),
      )
      return h('article', { className: 'dsh-wb-reqcard' },
        h('div', { className: 'dsh-wb-reqcard-head' },
          h('span', { className: 'dsh-wb-reqcard-code' }, requirement.code),
          h(StatusChip, { kind: 'req', value: requirement.status }),
          requirement.designUpdatedAt ? h(DesignUpdatedChip) : null,
        ),
        h('button', { className: 'dsh-wb-reqcard-title', type: 'button', onClick: () => onOpen(requirement.id) }, requirement.title),
        h('div', { className: 'dsh-wb-reqcard-chips' },
          h(StatusChip, { kind: 'design', value: requirement.designStatus }),
          grouped.length > 0
            ? grouped.map(entry => h('span', { className: 'dsh-wb-chip dsh-wb-chip--idle', key: entry.group.id, title: entry.items.map(item => item.name).join(' / ') },
                entry.items.slice(0, 2).map(item => item.shortName ?? item.name).join(' / '),
                entry.items.length > 2 ? ` +${entry.items.length - 2}` : '',
              ))
            : h('span', { className: 'dsh-wb-chip dsh-wb-chip--idle' }, '未设置平台'),
          dev !== '' ? h('span', { className: 'dsh-wb-chip dsh-wb-chip--idle' }, dev) : null,
          test !== '' ? h('span', { className: 'dsh-wb-chip dsh-wb-chip--idle' }, test) : null,
          requirement.release ? h('span', { className: 'dsh-wb-chip dsh-wb-chip--success' }, requirement.release.version) : null,
        ),
        h('div', { className: 'dsh-wb-reqcard-foot' },
          h('span', { className: 'dsh-wb-reqcard-who' },
            h(Avatar, { name: owner?.name ?? requirement.ownerId }),
            h('span', null, owner?.name ?? '—'),
            designer !== null ? h('span', { className: 'dsh-wb-muted' }, ` · 设计 ${designer.name}`) : null,
          ),
          h('span', { className: 'dsh-wb-reqcard-time' }, relativeTime(requirement.updatedAt)),
          h('span', { className: 'dsh-wb-reqcard-actions' },
            h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost', type: 'button', onClick: () => onOpen(requirement.id) }, '打开'),
            requirement.sessionId && onOpenDesign && designCount > 0 ? h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
              type: 'button',
              title: `打开设计画布（${designCount} 个页面）`,
              onClick: () => onOpenDesign(requirement),
            }, '设计') : null,
            requirement.sessionId ? h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--sm',
              type: 'button',
              onClick: () => onOpenSession(requirement.sessionId),
            }, '会话') : null,
          ),
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

    function IterationDetailView({ state, requirements, onBack, onCreateRequirement, onOpenSettings, canCreate, canConfig, onOpenRequirement, onOpenSession, onOpenDesign }) {
      const iteration = state.iteration
      const owner = state.users.find(user => user.id === iteration.ownerId)
      const grouped = state.platformGroups ?? []
      const phase = iterationPhaseLabel(iteration, requirements)
      const progress = requirementsProgress(requirements)
      const risk = iterationRisk(requirements)
      const rows = phaseRows(requirements)
      const activity = recentRequirementActivity(state, requirements)
      const designReady = requirements.filter(item => ['delivered', 'not_needed'].includes(item.designStatus)).length
      const onlineSessions = requirements.reduce((sum, item) => sum + (item.sessions ?? []).filter(session => session.sessionId).length, 0)
      return h('div', null,
        h('div', { className: 'dsh-wb-detail-head' },
          h('div', { className: 'dsh-wb-detail-head-main' },
            h('button', { className: 'dsh-wb-back', type: 'button', onClick: onBack }, '← 迭代列表'),
            h('div', { className: 'dsh-wb-detail-code-line' },
              h('span', { className: 'dsh-wb-detail-code' }, iteration.code),
              h('span', { className: `dsh-wb-chip dsh-wb-chip--${iterationPhaseTone(phase)}` },
                h('span', { className: 'g' }, phase === '已封板' ? '✓' : '◐'), phase),
              risk.count > 0 ? h('span', { className: 'dsh-wb-chip dsh-wb-chip--warn' }, h('span', { className: 'g' }, '◷'), risk.text) : null,
            ),
            h('h1', { className: 'dsh-wb-page-title' }, iteration.name),
            h('div', { className: 'dsh-wb-detail-meta' },
              h('span', null, h(Avatar, { name: owner?.name ?? iteration.ownerId }), `负责人 ${owner?.name ?? iteration.ownerId}`),
              h('span', null, `${requirements.length} 个需求 · ${requirements.filter(item => item.inScope !== false).length} 个本期`),
              h('span', null, `${iteration.startDate || '待定'} → ${iteration.endDate || '待定'}`),
              h('span', null, `${onlineSessions} 个会话`),
            ),
          ),
          h('div', { className: 'dsh-wb-detail-actions' },
            canConfig ? h('button', { className: 'dsh-wb-btn', type: 'button', onClick: onOpenSettings }, '迭代设置') : null,
            canCreate ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', onClick: onCreateRequirement }, '+ 新建需求') : null,
          ),
        ),
        h('div', { className: 'dsh-wb-detail-layout' },
          h('div', { className: 'dsh-wb-detail-main' },
            h('section', { className: 'dsh-wb-panel dsh-wb-timeline-panel' },
              h('div', { className: 'dsh-wb-panel-head' }, '阶段时间轴', h('span', { className: 'dsh-wb-count' }, `整体 ${progress}%`)),
              h('div', { className: 'dsh-wb-timeline' },
                rows.map(row => h('div', { className: 'dsh-wb-tl-row', key: row.label },
                  h('span', { className: 'dsh-wb-tl-name' }, row.label),
                  h('div', { className: 'dsh-wb-tl-track' },
                    h('span', { className: `dsh-wb-tl-bar is-${row.tone}`, style: { width: `${Math.max(row.pct, row.pct > 0 ? 4 : 0)}%` } }),
                  ),
                  h('span', { className: 'dsh-wb-tl-meta' }, row.meta),
                )),
              ),
              h('div', { className: 'dsh-wb-timeline-summary' },
                h('span', { className: 'dsh-wb-chip dsh-wb-chip--business' }, `设计 ${designReady}/${requirements.length} 已交付/无需`),
                h('span', { className: 'dsh-wb-chip dsh-wb-chip--idle' }, `${requirements.filter(item => item.inScope === false).length} 个范围外`),
                h('span', { className: 'dsh-wb-muted', style: { marginLeft: 'auto' } }, '设计与开发按需求并行，不强制串行'),
              ),
            ),
            h('div', { className: 'dsh-wb-section-head' },
              h('div', null,
                h('h2', null, '需求', h('span', { className: 'dsh-wb-count' }, String(requirements.length))),
                h('p', null, '点标题进入需求全量；点会话直接进入对应 DSH 会话。'),
              ),
              canCreate ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: onCreateRequirement }, '+ 新建需求') : null,
            ),
            requirements.length === 0
              ? h('div', { className: 'dsh-wb-empty dsh-wb-empty--page' },
                  h('b', null, '迭代还没有需求'),
                  canCreate ? '点「新建需求」，只填名称，其他交给会话里的 skill。' : '等产品创建需求后再来。',
                )
              : h('div', { className: 'dsh-wb-reqcards' },
                  requirements.map(requirement => h(RequirementCard, {
                    key: requirement.id,
                    requirement,
                    state,
                    onOpen: onOpenRequirement,
                    onOpenSession,
                    onOpenDesign,
                  })),
                ),
          ),
          h('aside', { className: 'dsh-wb-detail-aside' },
            h('section', { className: 'dsh-wb-panel dsh-wb-sidecard' },
              h('div', { className: 'dsh-wb-panel-head' }, '范围'),
              h('div', { className: 'dsh-wb-sidecard-body' },
                h('div', { className: 'dsh-wb-scope-line' },
                  h('span', { className: 'dsh-wb-scope-num' }, String(requirements.filter(item => item.inScope !== false).length)),
                  h('span', null, '个本期需求'),
                ),
                h('div', { className: 'dsh-wb-scope-tags' },
                  h('span', { className: 'dsh-wb-chip dsh-wb-chip--idle' }, `范围外 ${requirements.filter(item => item.inScope === false).length}`),
                  h('span', { className: 'dsh-wb-chip dsh-wb-chip--business' }, `进行中 ${requirements.filter(item => ['in_progress', 'testing', 'dev_done'].includes(item.status)).length}`),
                  h('span', { className: 'dsh-wb-chip dsh-wb-chip--success' }, `已完成 ${requirements.filter(item => ['released', 'done', 'test_passed'].includes(item.status)).length}`),
                ),
                h('p', { className: 'dsh-wb-sidecard-tip' }, '加需求、移出范围、改阶段时间都在会话里由 skill 完成。'),
              ),
            ),
            h('section', { className: 'dsh-wb-panel dsh-wb-sidecard' },
              h('div', { className: 'dsh-wb-panel-head' }, '最近更新'),
              activity.length === 0
                ? h('div', { className: 'dsh-wb-sidecard-body dsh-wb-muted' }, '还没有活动记录。')
                : h('div', { className: 'dsh-wb-activity' },
                    activity.map((event, index) => {
                      const user = state.users.find(item => item.id === event.who)
                      return h('div', { className: 'dsh-wb-activity-item', key: `${event.at}-${index}` },
                        h(Avatar, { name: user?.name ?? event.who }),
                        h('div', { className: 'dsh-wb-activity-main' },
                          h('b', null, event.text),
                          h('span', null, event.sub),
                          h('em', null, relativeTime(event.at)),
                        ),
                      )
                    }),
                  ),
            ),
            h('section', { className: 'dsh-wb-panel dsh-wb-sidecard' },
              h('div', { className: 'dsh-wb-panel-head' }, '平台'),
              h('div', { className: 'dsh-wb-sidecard-body dsh-wb-platform-list' },
                grouped.length === 0
                  ? h('span', { className: 'dsh-wb-muted' }, '还没有平台组')
                  : grouped.map(group => h('div', { className: 'dsh-wb-platform-group', key: group.id },
                      h('b', null, group.name),
                      h('span', null, (state.platforms ?? []).filter(item => item.groupId === group.id && item.active !== false).map(item => item.shortName ?? item.name).join(' / ') || '—'),
                    )),
              ),
            ),
          ),
        ),
      )
    }

    function RequirementPageView({ state, requirement, onBack, onOpenSession, onOpenDesign, onOpenRequirementTab, onNewSession }) {
      const iteration = (state.iterations ?? []).find(item => item.id === requirement.iterationId)
      const artifacts = Array.isArray(requirement.artifacts) ? requirement.artifacts : []
      const designArtifacts = artifacts.filter(artifact => artifact.kind === 'design')
      const screens = Math.max(
        designArtifacts.filter(artifact => /\.html?$/i.test(String(artifact.name || ''))).length,
        (requirement.designFiles ?? []).length,
      )
      const images = designArtifacts.filter(artifact => /^image\//i.test(String(artifact.contentType || ''))).length
      return h('div', null,
        h('div', { className: 'dsh-wb-detail-head' },
          h('div', { className: 'dsh-wb-detail-head-main' },
            h('button', { className: 'dsh-wb-back', type: 'button', onClick: onBack }, '← 迭代详情'),
            h('div', { className: 'dsh-wb-detail-code-line' },
              h('span', { className: 'dsh-wb-detail-code' }, requirement.code),
              h(StatusChip, { kind: 'req', value: requirement.status }),
              h(StatusChip, { kind: 'design', value: requirement.designStatus }),
              requirement.designUpdatedAt ? h(DesignUpdatedChip) : null,
            ),
            h('h1', { className: 'dsh-wb-page-title' }, requirement.title),
            h('div', { className: 'dsh-wb-detail-meta' },
              h('span', null, iteration ? `${iteration.code} ${iteration.name}` : '未归属迭代'),
              h('span', null, `产品 ${state.users.find(user => user.id === requirement.ownerId)?.name ?? requirement.ownerId}`),
              requirement.designerId ? h('span', null, `设计 ${state.users.find(user => user.id === requirement.designerId)?.name ?? requirement.designerId}`) : null,
              h('span', null, `更新 ${relativeTime(requirement.updatedAt)}`),
            ),
          ),
          h('div', { className: 'dsh-wb-detail-actions' },
            h('button', {
              className: 'dsh-wb-btn',
              type: 'button',
              disabled: !requirement.folderPath,
              title: requirement.folderPath ? '为这条需求新建需求、设计、开发或测试会话' : '需求文件夹还没有创建',
              onClick: () => onNewSession(requirement),
            }, '新建会话'),
            requirement.sessionId ? h('button', { className: 'dsh-wb-btn', type: 'button', onClick: () => onOpenRequirementTab(requirement) }, '打开需求侧栏') : null,
            requirement.sessionId ? h('button', { className: 'dsh-wb-btn', type: 'button', onClick: () => onOpenDesign(requirement) }, '打开设计侧栏') : null,
            requirement.sessionId ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', onClick: () => onOpenSession(requirement.sessionId) }, '进入会话') : null,
          ),
        ),
        h('div', { className: 'dsh-wb-req-summary-grid' },
          h('div', { className: 'dsh-wb-panel dsh-wb-summary-card' },
            h('div', { className: 'dsh-wb-summary-label' }, '设计交付'),
            h('div', { className: 'dsh-wb-summary-value' }, String(screens), h('small', null, ' 屏')),
            h('div', { className: 'dsh-wb-summary-sub' }, `${images} 张预览图 · d${(requirement.designVersions ?? []).length}`),
          ),
          h('div', { className: 'dsh-wb-panel dsh-wb-summary-card' },
            h('div', { className: 'dsh-wb-summary-label' }, '开发'),
            h('div', { className: 'dsh-wb-summary-value' }, `${(requirement.devTasks ?? []).filter(task => task.status === 'done').length}/${(requirement.devTasks ?? []).length}`),
            h('div', { className: 'dsh-wb-summary-sub' }, '端完成'),
          ),
          h('div', { className: 'dsh-wb-panel dsh-wb-summary-card' },
            h('div', { className: 'dsh-wb-summary-label' }, '测试'),
            h('div', { className: 'dsh-wb-summary-value' }, TEST_STATUS_LABELS[(requirement.testRuns ?? [])[(requirement.testRuns ?? []).length - 1]?.status] ?? '未开始'),
            h('div', { className: 'dsh-wb-summary-sub' }, `${(requirement.testRuns ?? []).length} 轮记录`),
          ),
          h('div', { className: 'dsh-wb-panel dsh-wb-summary-card' },
            h('div', { className: 'dsh-wb-summary-label' }, '需求版本'),
            h('div', { className: 'dsh-wb-summary-value' }, `v${(requirement.versions ?? []).length}`),
            h('div', { className: 'dsh-wb-summary-sub' }, requirement.inScope === false ? '范围外（暂缓）' : '本期范围'),
          ),
        ),
        h('section', { className: 'dsh-wb-panel dsh-wb-req-full' },
          h('div', { className: 'dsh-wb-panel-head' }, '需求详情', h('span', { className: 'dsh-wb-count' }, requirement.folderPath ?? '本地目录未映射')),
          h('div', { className: 'dsh-wb-req-full-body' },
            h(RequirementDetailPanel, {
              requirement,
              state,
              ctx: null,
              onBackToSession: () => {
                if (requirement.sessionId) onOpenSession(requirement.sessionId)
              },
            }),
          ),
        ),
      )
    }

    function MyWorkbenchView({ state, filter, onFilter, onOpenRequirement }) {
      const uid = state.currentUser.id
      const mine = (state.requirements ?? []).filter(requirement =>
        requirement.ownerId === uid ||
        requirement.designerId === uid ||
        (requirement.reviewerIds ?? []).includes(uid) ||
        (requirement.devTasks ?? []).some(task => task.assigneeId === uid) ||
        (requirement.sessions ?? []).some(session => session.createdBy === uid))
      const visible = mine.filter(requirement => {
        if (filter === 'requirement') return requirement.ownerId === uid || (requirement.reviewerIds ?? []).includes(uid)
        if (filter === 'design') return requirement.designerId === uid
        if (filter === 'todo') {
          if (requirement.designerId === uid) return !['delivered', 'not_needed'].includes(requirement.designStatus)
          if (requirement.ownerId === uid) return requirement.status === 'pending_review' || requirement.status === 'draft'
          return false
        }
        return true
      })
      const month = new Date().toISOString().slice(0, 7)
      const monthDone = mine.filter(requirement =>
        requirement.release && String(requirement.release.at ?? '').startsWith(month)).length
      const active = mine.filter(requirement => !['released', 'done', 'draft'].includes(requirement.status)).length
      const todo = mine.filter(requirement =>
        (requirement.designerId === uid && !['delivered', 'not_needed'].includes(requirement.designStatus)) ||
        (requirement.ownerId === uid && ['pending_review', 'draft'].includes(requirement.status))).length
      return h('div', null,
        h('div', { className: 'dsh-wb-page-head' },
          h('div', { className: 'dsh-wb-page-title-block' },
            h('h1', { className: 'dsh-wb-page-title' }, '我的工作台'),
            h('p', { className: 'dsh-wb-page-sub' }, `${state.currentUser.name} · ${roleLabel(state.currentUser.activeRole)} · 和我有关的需求、设计与待办`),
          ),
        ),
        h('div', { className: 'dsh-wb-my-stats' },
          h(StatCard, { label: '本月完成', value: monthDone }),
          h(StatCard, { label: '进行中', value: active }),
          h(StatCard, { label: '待我处理', value: todo }),
          h(StatCard, { label: '我参与', value: mine.length }),
        ),
        h('div', { className: 'dsh-wb-iter-toolbar' },
          h('div', { className: 'dsh-wb-seg' },
            [['all', '全部'], ['todo', '待我处理'], ['requirement', '需求'], ['design', '设计任务']].map(([key, label]) =>
              h('button', { key, type: 'button', className: filter === key ? 'is-on' : '', onClick: () => onFilter(key) }, label)),
          ),
        ),
        visible.length === 0
          ? h('div', { className: 'dsh-wb-empty dsh-wb-empty--page' }, h('b', null, '这里还没有你要处理的事'), '等需求指派或设计任务分配后再来。')
          : h('div', { className: 'dsh-wb-panel dsh-wb-my-list' },
              visible.map(requirement => h(RequirementRow, {
                key: requirement.id,
                requirement,
                selected: false,
                onSelect: () => onOpenRequirement(requirement.id),
                users: state.users,
                platforms: state.platforms,
              })),
            ),
      )
    }

    function NotificationsView({ state, onOpenRequirement, onReload, onToast }) {
      const [busy, setBusy] = useState(false)
      const items = Array.isArray(state.notifications) ? state.notifications : []
      const unread = state.unreadNotificationCount ?? items.filter(item => item.read !== true).length
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
      return h('div', null,
        h('div', { className: 'dsh-wb-page-head' },
          h('div', { className: 'dsh-wb-page-title-block' },
            h('h1', { className: 'dsh-wb-page-title' }, '通知'),
            h('p', { className: 'dsh-wb-page-sub' }, `${unread} 条未读 · 需求提交、评审、设计交付、测试与技能审核`),
          ),
          unread > 0 ? h('button', { className: 'dsh-wb-btn', type: 'button', disabled: busy, onClick: () => { void markAll() } }, busy ? '处理中…' : '全部已读') : null,
        ),
        items.length === 0
          ? h('div', { className: 'dsh-wb-empty dsh-wb-empty--page' }, h('b', null, '还没有通知'), '团队动作会出现在这里。')
          : h('div', { className: 'dsh-wb-panel dsh-wb-notif-page' },
              items.map(item => h('button', {
                className: `dsh-wb-notif${item.read === true ? '' : ' is-unread'}`,
                type: 'button',
                key: item.id,
                onClick: () => { void open(item) },
              },
                h('span', { className: 'dsh-wb-notif-title' },
                  item.read === true ? null : h('span', { className: 'dsh-wb-notif-dot' }),
                  item.title,
                ),
                item.body ? h('span', { className: 'dsh-wb-notif-body' }, item.body) : null,
                h('span', { className: 'dsh-wb-notif-time' }, relativeTime(item.at)),
              )),
            ),
      )
    }

    function WorkbenchPage({ ctx, auth }) {
      const workbench = useWorkbench()
      const [view, setView] = useState('iterations')
      const [selectedRequirementId, setSelectedRequirementId] = useState(null)
      const [iterationQuery, setIterationQuery] = useState('')
      const [iterationFilter, setIterationFilter] = useState('all')
      const [iterationSort, setIterationSort] = useState('')
      const [myFilter, setMyFilter] = useState('all')
      const [dialogOpen, setDialogOpen] = useState(false)
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [platformOpen, setPlatformOpen] = useState(false)
      const [skillsOpen, setSkillsOpen] = useState(false)
      const [adminOpen, setAdminOpen] = useState(false)
      const [iterationOpen, setIterationOpen] = useState(false)
      const [iterationManageOpen, setIterationManageOpen] = useState(false)
      const [sessionFor, setSessionFor] = useState(null)
      const [toast, setToast] = useState(null)
      const [retrying, setRetrying] = useState('')
      const state = workbench.state

      useEffect(() => {
        if (toast === null || toast.isError) return undefined
        const timer = setTimeout(() => setToast(null), 3600)
        return () => clearTimeout(timer)
      }, [toast])

      const showToast = useCallback((message, isError) => setToast({ message, isError }), [])

      const openSession = useCallback((sessionId, kind) => {
        if (typeof sessionId !== 'string' || sessionId === '') return
        try { ctx.uiWorkspace.openSession(sessionId) } catch (reason) { console.warn('[dsh-workbench] open session failed', reason) }
        setTimeout(() => openRightTab(ctx, kind ?? TAB_KIND), 350)
      }, [ctx])

      const openSessionFor = useCallback((requirement, kind) => {
        if (kind === 'design') {
          const designSession = (requirement.sessions ?? []).find(session => session.type === 'design' && session.sessionId)
          openSession(designSession?.sessionId ?? requirement.sessionId, DESIGN_TAB_KIND)
          return
        }
        openSession(requirement.sessionId, TAB_KIND)
      }, [openSession])

      const openRequirement = useCallback(async (requirementId) => {
        if (state === null) return
        const target = (state.requirements ?? []).find(item => item.id === requirementId)
        if (!target) { showToast('这条需求不在当前可见范围', true); return }
        try {
          if (target.iterationId !== state.iteration.id) {
            await api(`iterations/${encodeURIComponent(target.iterationId)}/select`, { method: 'POST', body: '{}' })
            await workbench.reload()
          }
          setSelectedRequirementId(requirementId)
          setView('requirement')
        } catch (reason) {
          showToast(reason instanceof Error ? reason.message : String(reason), true)
        }
      }, [state, showToast, workbench])

      const openIteration = useCallback(async (iterationId) => {
        if (state === null) return
        try {
          if (iterationId !== state.iteration.id) {
            await api(`iterations/${encodeURIComponent(iterationId)}/select`, { method: 'POST', body: '{}' })
            await workbench.reload()
          }
          setView('iteration')
        } catch (reason) {
          showToast(reason instanceof Error ? reason.message : String(reason), true)
        }
      }, [state, showToast, workbench])

      const handleCreated = useCallback(async (requirement) => {
        setDialogOpen(false)
        setSelectedRequirementId(requirement.id)
        await workbench.reload()
        setView('requirement')
      }, [workbench])

      const retryCreate = useCallback(async (requirement) => {
        setRetrying(requirement.id)
        try {
          const done = await finishRequirementCreation(ctx, requirement, state.iterationDir)
          showToast(`${done.requirement.code} 已创建`, false)
          await workbench.reload()
          ctx.uiWorkspace.openSession(done.sessionId)
          setTimeout(() => openRightTab(ctx), 350)
        } catch (reason) {
          await markCreationFailed(requirement, reason)
          showToast(reason instanceof Error ? reason.message : String(reason), true)
          await workbench.reload()
        } finally {
          setRetrying('')
        }
      }, [ctx, state?.iterationDir, showToast, workbench])

      const handleSessionCreated = async (requirement) => {
        setSessionFor(null)
        setSelectedRequirementId(requirement.id)
        await workbench.reload()
      }

      if (workbench.loading && state === null) {
        return h('div', { className: 'dsh-wb-page' },
          h('div', { className: 'dsh-wb-skeleton', style: { width: '180px', height: '22px' } }),
          h('div', { className: 'dsh-wb-skeleton', style: { width: '60%' } }),
          h('div', { className: 'dsh-wb-skeleton', style: { width: '80%' } }),
        )
      }

      if (state === null) {
        return h('div', { className: 'dsh-wb-page' },
          h('div', { className: 'dsh-wb-empty' },
            h('b', null, '工作台没有加载出来'),
            workbench.error ?? '请检查插件服务是否启动',
            h('div', { style: { marginTop: '12px' } },
              h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', onClick: () => { void workbench.reload() } }, '重试'),
            ),
          ),
        )
      }

      const requirements = state.requirements.filter(item => item.iterationId === state.iteration.id)
      const canCreate = state.currentUser.roles.includes('product') || state.currentUser.roles.includes('lead') || state.currentUser.roles.includes('admin')
      const canConfig = state.currentUser.roles.includes('lead') || state.currentUser.roles.includes('admin')
      const isAdmin = state.currentUser.roles.includes('admin')
      const selectedRequirement = (state.requirements ?? []).find(item => item.id === selectedRequirementId) ?? null
      const unread = state.unreadNotificationCount ?? (state.notifications ?? []).filter(item => item.read !== true).length
      const navItems = [
        ['iterations', '迭代列表'],
        ['my', '我的工作台'],
        ['skills', '技能库'],
        ['settings', '设置'],
        ['notifications', '通知'],
      ]
      const onNav = (key) => {
        if (key === 'skills') { setSkillsOpen(true); return }
        if (key === 'settings') { setSettingsOpen(true); return }
        if (key === 'iterations') { setView('iterations'); return }
        if (key === 'my') { setView('my'); return }
        if (key === 'notifications') { setView('notifications'); return }
      }
      const navActive = view === 'iteration' || view === 'requirement' ? 'iterations' : view

      return h('div', { className: 'dsh-wb-page dsh-wb-shell' },
        h('header', { className: 'dsh-wb-navbar' },
          h('div', { className: 'dsh-wb-nav-brand' },
            h('span', { className: 'dsh-wb-nav-logo' }, '研发工作台'),
            h('span', { className: 'dsh-wb-nav-badge' }, '插件'),
          ),
          h('nav', { className: 'dsh-wb-nav', 'aria-label': '研发工作台导航' },
            navItems.map(([key, label]) => h('button', {
              key,
              type: 'button',
              className: navActive === key ? 'is-active' : '',
              'aria-current': navActive === key ? 'page' : undefined,
              onClick: () => onNav(key),
            }, label, key === 'notifications' && unread > 0 ? h('span', { className: 'dsh-wb-nav-count' }, unread > 99 ? '99+' : String(unread)) : null)),
          ),
          h('div', { className: 'dsh-wb-nav-actions' },
            canConfig ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--ghost dsh-wb-btn--sm', type: 'button', onClick: () => setPlatformOpen(true) }, '平台配置') : null,
            isAdmin ? h('button', { className: 'dsh-wb-btn dsh-wb-btn--ghost dsh-wb-btn--sm', type: 'button', onClick: () => setAdminOpen(true) }, '管理') : null,
            h('button', {
              className: 'dsh-wb-userchip',
              type: 'button',
              title: '个人设置',
              onClick: () => setSettingsOpen(true),
            },
              h('span', { className: 'dsh-wb-userchip-dot' }),
              h('span', null,
                h('b', null, state.currentUser.name),
                h('span', null, ` · ${roleLabel(state.currentUser.activeRole)}`),
              ),
              auth.provider === 'mock' ? h('span', { className: 'dsh-wb-mock' }, 'MOCK') : null,
            ),
          ),
        ),
        h('div', { className: 'dsh-wb-content' },
          workbench.error !== null ? h('div', { className: 'dsh-wb-dialog-err', style: { marginBottom: '12px' } }, workbench.error) : null,
          view === 'iterations'
            ? h(IterationListView, {
                state,
                query: iterationQuery,
                onQuery: setIterationQuery,
                filter: iterationFilter,
                onFilter: setIterationFilter,
                sort: iterationSort,
                onSort: setIterationSort,
                onOpen: (id) => { void openIteration(id) },
                onCreate: () => setIterationOpen(true),
                canCreate: canConfig,
              })
            : view === 'iteration'
              ? h(IterationDetailView, {
                  state,
                  requirements,
                  onBack: () => setView('iterations'),
                  onCreateRequirement: () => setDialogOpen(true),
                  onOpenSettings: () => setIterationManageOpen(true),
                  canCreate,
                  canConfig,
                  onOpenRequirement: (id) => { void openRequirement(id) },
                  onOpenSession: (sessionId) => openSession(sessionId),
                  onOpenDesign: (requirement) => openSessionFor(requirement, 'design'),
                })
              : view === 'requirement'
                ? selectedRequirement === null
                  ? h('div', { className: 'dsh-wb-empty dsh-wb-empty--page' }, h('b', null, '需求已不在当前迭代'), '回到迭代列表重新选择。')
                  : h(RequirementPageView, {
                      state,
                      requirement: selectedRequirement,
                      onBack: () => setView('iteration'),
                      onOpenSession: (sessionId) => openSession(sessionId),
                      onOpenDesign: (requirement) => openSessionFor(requirement, 'design'),
                      onOpenRequirementTab: (requirement) => openSessionFor(requirement, 'requirement'),
                      onNewSession: (requirement) => setSessionFor(requirement),
                    })
                : view === 'my'
                  ? h(MyWorkbenchView, {
                      state,
                      filter: myFilter,
                      onFilter: setMyFilter,
                      onOpenRequirement: (id) => { void openRequirement(id) },
                    })
                  : h(NotificationsView, {
                      state,
                      onOpenRequirement: (id) => { void openRequirement(id) },
                      onReload: workbench.reload,
                      onToast: showToast,
                    }),
        ),
        dialogOpen ? h(CreateRequirementDialog, {
          ctx,
          state,
          onClose: () => setDialogOpen(false),
          onCreated: handleCreated,
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
        sessionFor !== null ? h(CreateSessionDialog, {
          ctx,
          state,
          requirement: sessionFor,
          onClose: () => setSessionFor(null),
          onCreated: handleSessionCreated,
          onToast: showToast,
        }) : null,
        settingsOpen ? h(SettingsDialog, {
          auth,
          state,
          onClose: () => setSettingsOpen(false),
          onReload: workbench.reload,
          onToast: showToast,
        }) : null,
        platformOpen ? h(PlatformConfigDialog, {
          state,
          onClose: () => setPlatformOpen(false),
          onReload: workbench.reload,
          onToast: showToast,
        }) : null,
        skillsOpen ? h(SkillManager, {
          state,
          onClose: () => setSkillsOpen(false),
          onReload: workbench.reload,
          onToast: showToast,
        }) : null,
        adminOpen ? h(AdminDialog, {
          state,
          onClose: () => setAdminOpen(false),
          onReload: workbench.reload,
          onToast: showToast,
        }) : null,
        h('div', { className: 'dsh-wb-toast-region', 'aria-live': 'polite', 'aria-atomic': 'true' },
          toast !== null
            ? h('div', { className: `dsh-wb-toast${toast.isError ? ' is-error' : ''}`, role: toast.isError ? 'alert' : 'status' },
                h('span', { className: 'dsh-wb-toast-text' }, toast.message),
                h('button', {
                  className: 'dsh-wb-toast-close',
                  type: 'button',
                  'aria-label': '关闭提示',
                  onClick: () => setToast(null),
                }, '×'),
              )
            : null,
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Right sidebar tab
    // ---------------------------------------------------------------------

    function RequirementBar({ requirement, detailsOpen, onToggle, onBackToSession }) {
      return h('div', { className: 'dsh-wb-rqbar' },
        h('button', {
          className: 'dsh-wb-rqbar-main',
          type: 'button',
          onClick: onToggle,
          title: detailsOpen ? '收起需求详情' : '展开需求详情',
        },
          h('span', { className: 'dsh-wb-rqbar-code' }, requirement.code),
          h('span', { className: 'dsh-wb-rqbar-title' }, requirement.title),
          h('span', { className: 'dsh-wb-rqbar-chips' },
            h(StatusChip, { kind: 'req', value: requirement.status }),
            h(StatusChip, { kind: 'design', value: requirement.designStatus }),
            requirement.designUpdatedAt ? h(DesignUpdatedChip) : null,
          ),
        ),
        h('button', {
          className: 'dsh-wb-rqbar-btn',
          type: 'button',
          onClick: onBackToSession,
          title: '收起右侧栏，回到会话；提交 /req-submit，评审 /req-review，设计 /design-start',
        }, '在会话中提交'),
        h('button', {
          className: 'dsh-wb-rqbar-toggle',
          type: 'button',
          onClick: onToggle,
          title: detailsOpen ? '收起需求详情' : '展开需求详情',
          'aria-expanded': detailsOpen,
        }, detailsOpen ? '▴' : '▾'),
      )
    }

    function RequirementDetailPanel({ requirement, state, ctx, onBackToSession }) {
      const users = state?.users ?? []
      const platforms = state?.platforms ?? []
      const groups = state?.platformGroups ?? []
      const owner = users.find(user => user.id === requirement.ownerId)
      const designer = requirement.designerId ? users.find(user => user.id === requirement.designerId) : null
      const grouped = groupedPlatforms(platforms, groups, requirement.platformIds)
      const platformText = grouped.length === 0
        ? '未设置'
        : grouped.map(entry => `${entry.group.name} · ${entry.items.map(item => item.shortName).join(' / ')}`).join('；')
      const sessions = Array.isArray(requirement.sessions) ? requirement.sessions : []
      const reviews = Array.isArray(requirement.reviews) ? requirement.reviews : []
      const latestReview = reviews.length > 0 ? reviews[reviews.length - 1] : null
      const devTasks = Array.isArray(requirement.devTasks) ? requirement.devTasks : []
      const latestTest = Array.isArray(requirement.testRuns) && requirement.testRuns.length > 0
        ? requirement.testRuns[requirement.testRuns.length - 1]
        : null
      const reviewerIds = Array.isArray(requirement.reviewerIds) ? requirement.reviewerIds : []
      const roundReviews = reviews.filter(review => review.version === requirement.versions.length)
      const approvedReviewers = reviewerIds.filter(id => [...roundReviews].reverse().find(review => review.by === id)?.decision === 'approved')
      const iteration = (state?.iterations ?? []).find(item => item.id === requirement.iterationId)
      const cell = (label, value, mono, wide) => h('div', { className: 'dsh-wb-rqdetail-cell' + (wide ? ' is-wide' : '') },
        h('div', { className: 'dsh-wb-rqdetail-k' }, label),
        h('div', { className: 'dsh-wb-rqdetail-v' + (mono ? ' mono' : '') }, value),
      )
      const openSession = (sessionId) => {
        if (!sessionId) return
        ctx.uiWorkspace.openSession(sessionId)
      }
      return h('div', { className: 'dsh-wb-rqdetail' },
        requirement.designUpdatedAt
          ? h('div', { className: 'dsh-wb-notice' },
              `设计已更新（${relativeTime(requirement.designUpdatedAt)}）：研发开始后设计有变更，请查看最新画布。`)
          : null,
        h('div', { className: 'dsh-wb-rqdetail-grid' },
          cell('负责人', owner?.name ?? '—'),
          cell('设计', designer?.name ?? (requirement.designStatus === 'not_needed' ? '无需设计' : '未认领')),
          cell('迭代', iteration ? `${iteration.code}${iteration.status === 'planning' ? ' · 规划中' : ''}` : '—'),
          cell('本期范围', requirement.inScope === false ? '范围外（暂缓）' : '本期'),
          cell('计划', requirement.plannedStartDate || requirement.plannedEndDate
            ? `${requirement.plannedStartDate ?? '待定'} ~ ${requirement.plannedEndDate ?? '待定'}`
            : '未排期', true),
          cell('评审', latestReview === null
            ? '—'
            : `${REVIEW_DECISION_LABELS[latestReview.decision] ?? latestReview.decision} · ${relativeTime(latestReview.at)}`),
          cell('会签', reviewerIds.length === 0
            ? '单人评审'
            : `${approvedReviewers.length}/${reviewerIds.length} 已通过`),
          cell('开发', devTasks.length === 0
            ? '未开始'
            : `${devTasks.filter(task => task.status === 'done').length}/${devTasks.length} 端完成`),
          cell('测试', latestTest === null
            ? '未开始'
            : `${TEST_STATUS_LABELS[latestTest.status] ?? latestTest.status} · ${relativeTime(latestTest.finishedAt ?? latestTest.startedAt)}`),
          cell('发布', requirement.release ? requirement.release.version : '未发布'),
          cell('版本', `v${requirement.versions.length} · ${relativeTime(requirement.updatedAt)}`),
          cell('设计版本', requirement.designVersions.length === 0
            ? '—'
            : `d${requirement.designVersions.length}${requirement.designDeliveredAt ? ' · ' + relativeTime(requirement.designDeliveredAt) : ''}`),
          cell('平台', platformText),
          cell('设计文件', (() => {
            const count = (requirement.designScreens?.length ?? 0) + (requirement.designImages?.length ?? 0) ||
              requirement.designFiles?.length ||
              requirement.designVersions?.[requirement.designVersions.length - 1]?.files?.length ||
              0
            return count === 0 ? '—' : `${count} 个`
          })()),
          cell('需求文件夹', requirement.folderPath ?? '—', true, true),
        ),
        (requirement.document?.summary || requirement.document?.acceptanceCriteria)
          ? h('div', { className: 'dsh-wb-rqdetail-cell is-wide', style: { marginTop: '8px' } },
              h('div', { className: 'dsh-wb-rqdetail-k' }, `需求文档 · v${requirement.document.version ?? 1}`),
              requirement.document.summary ? h('div', { className: 'dsh-wb-rqdetail-v' }, requirement.document.summary) : null,
              requirement.document.acceptanceCriteria
                ? h('div', { className: 'dsh-wb-rqdetail-v', style: { marginTop: '6px', whiteSpace: 'pre-wrap' } }, `验收：${requirement.document.acceptanceCriteria}`)
                : null,
            )
          : null,
        sessions.length > 0
          ? h('div', { className: 'dsh-wb-rqdetail-cell is-wide', style: { marginTop: '8px' } },
              h('div', { className: 'dsh-wb-rqdetail-k' }, `会话 · ${sessions.length}`),
              h('div', { className: 'dsh-wb-sessions' },
                sessions.map(session => h('div', { className: 'dsh-wb-session', key: session.id ?? session.sessionId },
                  h('span', { className: 'dsh-wb-session-type' }, sessionTypeLabel(session.type)),
                  h('span', { className: 'dsh-wb-session-main' },
                    h('b', null, `${session.label || `${sessionTypeLabel(session.type)}会话`}${session.id === requirement.primarySessionId ? ' · 主会话' : ''}`),
                    h('span', null, session.sessionId ? relativeTime(session.createdAt) : `其他设备 · ${relativeTime(session.createdAt)}`),
                  ),
                  h('button', {
                    className: 'dsh-wb-btn dsh-wb-btn--sm',
                    type: 'button',
                    disabled: !session.sessionId,
                    onClick: () => openSession(session.sessionId),
                  }, session.sessionId ? '进入' : '其他设备'),
                )),
              ),
            )
          : null,
        requirement.versions.length > 0
          ? h('div', { className: 'dsh-wb-rqdetail-cell is-wide', style: { marginTop: '7px' } },
              h('div', { className: 'dsh-wb-rqdetail-k' }, '最近提交'),
              h('div', { className: 'dsh-wb-rqdetail-v' }, [...requirement.versions].slice(-2).reverse().map(version => `v${version.version} ${version.summary}`).join(' · ')),
            )
          : null,
        requirement.designVersions.length > 0
          ? h('div', { className: 'dsh-wb-rqdetail-cell is-wide', style: { marginTop: '7px' } },
              h('div', { className: 'dsh-wb-rqdetail-k' }, '最近设计交付'),
              h('div', { className: 'dsh-wb-rqdetail-v' }, [...requirement.designVersions].slice(-2).reverse().map(version => `d${version.version} ${version.summary}`).join(' · ')),
            )
          : null,
        h('div', { className: 'dsh-wb-rqdetail-actions' },
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: () => { try { ctx.layout.selectPanel(PANEL_ID) } catch (_) {} } }, '打开研发工作台'),
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: onBackToSession }, '在会话中提交'),
        ),
      )
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch (_) {
        return false
      }
    }

    function DesignStartPanel({ requirement, state, previewError, opening, onRefresh, onOpenFile }) {
      const [notice, setNotice] = useState('')
      const files = requirement.designFiles ?? []
      const prompt = useMemo(() => designPrompt(requirement, state), [requirement, state])
      const platforms = groupedPlatforms(state?.platforms ?? [], state?.platformGroups ?? [], requirement.platformIds)

      useEffect(() => {
        if (notice === '') return undefined
        const timer = setTimeout(() => setNotice(''), 2800)
        return () => clearTimeout(timer)
      }, [notice])

      const copy = useCallback(async (text) => {
        const ok = await copyText(text)
        setNotice(ok ? '已复制，粘贴到会话输入框发送' : '复制失败，请手动输入 /design-start')
      }, [])

      return h('div', { className: 'dsh-wb-start' },
        h('div', { className: 'dsh-wb-start-main' },
          h('div', { className: 'dsh-wb-start-eyebrow' }, `需求设计 · ${requirement.code}`),
          h('h2', { className: 'dsh-wb-start-title' }, files.length === 0 ? '还没有设计稿' : '选择一屏设计稿'),
          h('p', { className: 'dsh-wb-start-sub' },
            requirement.designStatus === 'delivered'
              ? `设计已交付（d${requirement.designVersions.length}），继续修改后可重新走设计交付。`
              : requirement.designStatus === 'designing'
                ? `设计进行中${requirement.designerId ? '' : '，等待认领'}。把下面的设计指令发到会话，AI 会把设计稿写进需求文件夹，并实时显示在这里。`
                : '让 AI 在这个需求文件夹里生成设计稿；也可以直接打开文件夹里已有的 HTML。',
          ),
          requirement.designUpdatedAt
            ? h('div', { className: 'dsh-wb-notice' }, `设计在 ${relativeTime(requirement.designUpdatedAt)} 更新过；开发已开始，请确认最新设计。`)
            : null,
          platforms.length > 0
            ? h('div', { className: 'dsh-wb-start-platforms' },
                platforms.map(entry => h('span', { className: 'dsh-wb-start-platform', key: entry.group.id },
                  h('b', null, entry.group.name),
                  entry.items.map(item => item.name).join(' / '),
                )),
              )
            : null,
          h('div', { className: 'dsh-wb-start-actions' },
            h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--primary',
              type: 'button',
              onClick: () => { void copy(prompt) },
            }, '复制设计指令'),
            h('button', {
              className: 'dsh-wb-btn',
              type: 'button',
              onClick: () => { void copy('/design-start') },
            }, '复制 /design-start'),
            h('button', {
              className: 'dsh-wb-btn dsh-wb-btn--ghost',
              type: 'button',
              onClick: onRefresh,
            }, '重新扫描'),
          ),
          notice !== '' ? h('div', { className: 'dsh-wb-start-notice' }, notice) : null,
          previewError !== null
            ? h('div', { className: 'dsh-wb-dialog-err' }, `设计服务：${previewError.message ?? previewError}`)
            : null,
        ),
        h('section', { className: 'dsh-wb-start-files' },
          h('div', { className: 'dsh-wb-start-files-head' },
            h('span', null, '需求文件夹里的设计文件'),
            h('span', { className: 'dsh-wb-count' }, String(files.length)),
          ),
          files.length === 0
            ? h('div', { className: 'dsh-wb-start-empty' }, '还没有 HTML 设计文件。发送设计指令后，文件会出现在这里。')
            : h('div', { className: 'dsh-wb-start-filelist' },
                files.map(file => h('button', {
                  className: 'dsh-wb-start-file',
                  type: 'button',
                  key: file.path,
                  disabled: opening !== '',
                  onClick: () => {
                    Promise.resolve(onOpenFile(file.path)).catch((reason) => {
                      setNotice(reason instanceof Error ? reason.message : String(reason))
                    })
                  },
                },
                  h('span', { className: 'dsh-wb-start-file-main' },
                    h('span', { className: 'dsh-wb-start-file-name' }, file.name),
                    h('span', { className: 'dsh-wb-start-file-path' }, file.relativePath),
                  ),
                  h('span', { className: 'dsh-wb-start-file-time' }, opening === file.path ? '打开中…' : relativeTime(file.updatedAt)),
                )),
              ),
        ),
        h('div', { className: 'dsh-wb-start-tip' },
          '画布会跟随 ',
          h('code', null, 'wb_preview_page'),
          ' 实时刷新；设计完成后在会话里用 ',
          h('code', null, '/design-deliver'),
          ' 交付，工作台会记录设计版本。',
        ),
      )
    }

    // 会话身份由浏览器登录态认领；host 的工具/命令只认这个映射，不再使用
    // 进程级“最后登录用户”，多人交替使用同一台机器也不会串号。
    function useClaimSession(sid, actorId, setClaimError) {
      useEffect(() => {
        if (typeof sid !== 'string' || sid === '') return undefined
        let alive = true
        api('sessions/claim', {
          method: 'POST',
          body: JSON.stringify({ sessionId: sid }),
        }).then(() => { if (alive) setClaimError('') }).catch((reason) => {
          if (alive) setClaimError(reason instanceof Error ? reason.message : String(reason))
        })
        return () => { alive = false }
      }, [sid, actorId, setClaimError])
    }

    function useEnsuredChild(folderPath, name) {
      const [ensured, setEnsured] = useState('')
      useEffect(() => {
        if (typeof folderPath !== 'string' || folderPath === '' || typeof name !== 'string' || name === '') {
          setEnsured('')
          return undefined
        }
        let alive = true
        ensureChildDirectory(folderPath, name)
          .then(value => { if (alive) setEnsured(value) })
          .catch(() => { if (alive) setEnsured('') })
        return () => { alive = false }
      }, [folderPath, name])
      return ensured
    }

    function useCanvasTarget(sid, targetPath) {
      const [error, setError] = useState('')
      const [opening, setOpening] = useState(false)
      useEffect(() => {
        setError('')
        if (typeof sid !== 'string' || sid === '' || typeof targetPath !== 'string' || targetPath === '') return undefined
        let alive = true
        const run = async () => {
          try {
            const response = await fetch(`${DS_API}state?session=${encodeURIComponent(sid)}`, { cache: 'no-store' })
            if (!response.ok) throw new Error(`设计服务返回 ${response.status}`)
            const current = await response.json()
            const root = current && current.target && current.target.kind === 'file' ? String(current.target.root || '') : ''
            if (root === targetPath) return
            if (alive) setOpening(true)
            await openDesignFile(sid, targetPath)
          } catch (reason) {
            if (alive) setError(reason instanceof Error ? reason.message : String(reason))
          } finally {
            if (alive) setOpening(false)
          }
        }
        void run()
        return () => { alive = false }
      }, [sid, targetPath])
      return { error, opening }
    }

    function prototypeInstruction(requirement, state) {
      const platforms = groupedPlatforms(state?.platforms ?? [], state?.platformGroups ?? [], requirement.platformIds)
        .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
        .join('；')
      return [
        '/design-start',
        '',
        `需求：${requirement.code}「${requirement.title}」`,
        `平台：${platforms || '未设置'}`,
        `原型目录：${requirement.prototypePath ?? 'prototype/'}`,
        `需求文件夹：${requirement.folderPath ?? '尚未创建'}`,
        '',
        '请在这个需求里做产品原型：把一屏一个 HTML 写进 prototype/ 目录，先保证信息结构、关键流程和状态完整，不追求最终视觉；',
        '做完调用 wb_preview_page 打开第一屏，原型会显示在右侧「需求」面板的画布里。',
      ].join('\n')
    }

    function designInstruction(requirement, state) {
      const platforms = groupedPlatforms(state?.platforms ?? [], state?.platformGroups ?? [], requirement.platformIds)
        .map(entry => `${entry.group.name} · ${entry.items.map(item => item.name).join(' / ')}`)
        .join('；')
      return [
        '/design-start',
        '',
        `需求：${requirement.code}「${requirement.title}」`,
        `平台：${platforms || '未设置'}`,
        `设计稿目录：${requirement.designPath ?? 'design/'}`,
        `需求文件夹：${requirement.folderPath ?? '尚未创建'}`,
        '',
        '请先加载 wb-ui-design 技能，在 design/ 目录里做高保真设计稿（一屏一个 HTML），沿用需求里的原型和验收标准；',
        '完成后调用 wb_preview_page 打开第一屏，用 wb_check_design 自查，再在会话里用 /design-deliver 交付。',
      ].join('\n')
    }

    function CanvasToolbar({ kindLabel, pathLabel, count, promptText, onRefresh, otherLabel, onOther, otherDisabled }) {
      const [notice, setNotice] = useState('')
      useEffect(() => {
        if (notice === '') return undefined
        const timer = setTimeout(() => setNotice(''), 2800)
        return () => clearTimeout(timer)
      }, [notice])
      const copy = async () => {
        const ok = await copyText(promptText)
        setNotice(ok ? '已复制，粘贴到会话输入框发送' : '复制失败，请手动输入 /design-start')
      }
      return h('div', { className: 'dsh-wb-canvas-toolbar' },
        h('div', { className: 'dsh-wb-canvas-toolbar-main' },
          h('span', { className: 'dsh-wb-canvas-kind' }, kindLabel),
          h('span', { className: 'dsh-wb-canvas-path' }, `${pathLabel} · ${count} 个页面`),
        ),
        h('div', { className: 'dsh-wb-canvas-toolbar-actions' },
          notice !== '' ? h('span', { className: 'dsh-wb-canvas-notice' }, notice) : null,
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: () => { void copy() } }, '复制指令'),
          otherLabel ? h('button', {
            className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost',
            type: 'button',
            disabled: otherDisabled,
            onClick: onOther,
          }, otherLabel) : null,
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm dsh-wb-btn--ghost', type: 'button', onClick: onRefresh, title: '重新扫描本地文件' }, '刷新'),
        ),
      )
    }

    function CanvasEmpty({ kindLabel, pathLabel, promptText, onRefresh }) {
      const [notice, setNotice] = useState('')
      useEffect(() => {
        if (notice === '') return undefined
        const timer = setTimeout(() => setNotice(''), 2800)
        return () => clearTimeout(timer)
      }, [notice])
      const copy = async () => {
        const ok = await copyText(promptText)
        setNotice(ok ? '已复制，粘贴到会话输入框发送' : '复制失败，请手动输入 /design-start')
      }
      return h('div', { className: 'dsh-wb-canvas-empty' },
        h('b', null, `还没有${kindLabel}`),
        h('p', null,
          `在会话里描述要做的页面，模型把一屏一个 HTML 写进 ${pathLabel}；预览工具一打开，画布就会出现在这里。`),
        h('div', { className: 'dsh-wb-canvas-empty-actions' },
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--primary', type: 'button', onClick: () => { void copy() } }, '复制指令'),
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--ghost', type: 'button', onClick: onRefresh }, '重新扫描'),
        ),
        notice !== '' ? h('div', { className: 'dsh-wb-canvas-notice' }, notice) : null,
      )
    }

    function DesignStudioCanvas({ sid, ctx, targetPath, onRefresh }) {
      const studio = useDesignStudio()
      const t = useMemo(() => (studio.runtime ? studio.runtime.makeT(ctx) : key => key), [studio.runtime, ctx])
      const { error, opening } = useCanvasTarget(sid, targetPath)
      if (studio.error) {
        return h('div', { className: 'dsh-wb-design-msg' },
          h('b', null, '设计画布加载失败'),
          studio.error instanceof Error ? studio.error.message : String(studio.error),
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: onRefresh }, '重试'),
        )
      }
      if (!studio.runtime) {
        return h('div', { className: 'dsh-wb-design-msg' }, h('span', { className: 'dsh-wb-spinner' }), '正在加载 Design Studio…')
      }
      return h('div', { className: 'dsh-wb-design-canvas dsh-wb-canvas-studio' },
        opening ? h('div', { className: 'dsh-wb-canvas-loading' }, '正在打开画布…') : null,
        error !== '' ? h('div', { className: 'dsh-wb-canvas-error' },
          h('b', null, '画布没有打开'),
          error,
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: onRefresh }, '重试'),
        ) : null,
        h(studio.runtime.PreviewTab, { sid, t }),
      )
    }

    function RequirementTab({ sid, ctx }) {
      const { requirement, loading, error, reload } = useRequirementForSession(sid)
      const { state } = useWorkbench()
      const actorId = state?.currentUser?.id ?? ''
      const [detailsOpen, setDetailsOpen] = useState(false)
      const [claimError, setClaimError] = useState('')
      useClaimSession(sid, actorId, setClaimError)
      // 设计师打开自己的设计会话时，右栏默认落到设计画布；需求/开发会话仍看原型。
      useEffect(() => {
        if (requirement === null || state?.currentUser?.activeRole !== 'design') return undefined
        const current = (requirement.sessions ?? []).find(session => session.sessionId === sid)
        if (!current || current.type !== 'design') return undefined
        const timer = setTimeout(() => openDesignTab(ctx), 220)
        return () => clearTimeout(timer)
      }, [requirement?.id, sid, state?.currentUser?.activeRole, ctx])
      const ensuredPrototype = useEnsuredChild(requirement?.folderPath, 'prototype')
      const prototypePath = requirement?.prototypePath || ensuredPrototype
      const prototypeFiles = requirement?.prototypeFiles ?? []
      const designCount = Math.max(
        requirement?.designFiles?.length ?? 0,
        (requirement?.designScreens?.length ?? 0) + (requirement?.designImages?.length ?? 0),
      )
      const hasPrototype = prototypeFiles.length > 0
      const backToSession = useCallback(() => { closeOwnTab(ctx); focusComposer() }, [ctx])
      const prompt = requirement ? prototypeInstruction(requirement, state) : ''

      let body
      if (loading && requirement === null) {
        body = h('div', { className: 'dsh-wb-design-msg' }, h('span', { className: 'dsh-wb-spinner' }), '正在读取需求…')
      } else if (error !== null && requirement === null) {
        body = h('div', { className: 'dsh-wb-design-msg' },
          h('b', null, '需求读取失败'),
          error,
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: () => { void reload() } }, '重试'),
        )
      } else if (requirement === null) {
        body = h('div', { className: 'dsh-wb-design-msg' },
          h('b', null, '这个会话还没有关联需求'),
          '从研发工作台的迭代里点“进入会话”，或先在会话中提交需求。',
        )
      } else if (!hasPrototype) {
        body = h(CanvasEmpty, {
          kindLabel: '产品原型',
          pathLabel: 'prototype/',
          promptText: prompt,
          onRefresh: () => { void reload() },
        })
      } else {
        body = h(DesignStudioCanvas, {
          sid,
          ctx,
          targetPath: prototypePath,
          onRefresh: () => { void reload() },
        })
      }

      return h('div', { className: 'dsh-wb-design dsh-wb-canvas-pane' },
        claimError !== '' ? h('div', { className: 'dsh-wb-notice is-error' }, claimError) : null,
        requirement !== null
          ? h(RequirementBar, {
              requirement,
              detailsOpen,
              onToggle: () => setDetailsOpen(open => !open),
              onBackToSession: backToSession,
            })
          : null,
        requirement !== null
          ? h(CanvasToolbar, {
              kindLabel: '产品原型',
              pathLabel: 'prototype/',
              count: prototypeFiles.length,
              promptText: prompt,
              onRefresh: () => { void reload() },
              otherLabel: designCount > 0 ? `设计交付 ${designCount}` : '',
              otherDisabled: designCount === 0,
              onOther: () => openDesignTab(ctx),
            })
          : null,
        h('div', { className: 'dsh-wb-canvas-content' }, body),
        requirement !== null && detailsOpen
          ? h('div', { className: 'dsh-wb-canvas-drawer' },
              h('div', { className: 'dsh-wb-canvas-drawer-head' },
                h('b', null, '需求详情'),
                h('button', { className: 'dsh-wb-rqbar-toggle', type: 'button', onClick: () => setDetailsOpen(false), title: '收起', 'aria-label': '收起需求详情' }, '×'),
              ),
              h('div', { className: 'dsh-wb-canvas-drawer-body' },
                h(RequirementDetailPanel, { requirement, state, ctx, onBackToSession: backToSession }),
              ),
            )
          : null,
      )
    }

    function designItemKey(item) {
      return item.source === 'local' ? `local:${item.relativePath}` : `server:${item.artifactId}`
    }

    function designVersionLabel(version) {
      if (version === null || version === undefined || version === '') return '—'
      const text = String(version)
      return /^d\d+/i.test(text) ? text : `d${text}`
    }

    // 原型按 1440 宽设计；右栏窄，等比缩到可视宽度，保证整屏能看到。
    function ScaledDesignFrame({ src, title }) {
      const stage = useRef(null)
      const [scale, setScale] = useState(0.3)
      useEffect(() => {
        const node = stage.current
        if (node === null) return undefined
        const update = () => {
          const width = node.clientWidth - 24
          if (width > 0) setScale(Math.min(1, width / 1440))
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
      return h('div', { className: 'dsh-wb-gallery-stage', ref: stage },
        h('div', {
          className: 'dsh-wb-gallery-scale',
          style: { width: `${Math.round(1440 * scale)}px`, height: `${Math.round(1000 * scale)}px` },
        },
          h('iframe', {
            className: 'dsh-wb-gallery-frame',
            src,
            title,
            sandbox: 'allow-scripts allow-forms allow-modals allow-popups',
            referrerPolicy: 'no-referrer',
            style: { width: '1440px', height: '1000px', transform: `scale(${scale})`, transformOrigin: 'top left' },
          }),
        ),
      )
    }

    function designPreviewUrl(requirementId, item) {
      if (!requirementId || !item) return ''
      const params = new URLSearchParams({ requirementId })
      if (item.artifactId) params.set('artifactId', item.artifactId)
      else if (item.relativePath) params.set('path', item.relativePath)
      else return ''
      return `${API}design-preview?${params.toString()}`
    }

    function DeliveredGallery({ requirement, reload, onOpenRequirement, onBackToSession }) {
      const [selectedKey, setSelectedKey] = useState('')
      const [previewError, setPreviewError] = useState('')
      const screens = requirement?.designScreens ?? []
      const images = requirement?.designImages ?? []
      const items = [...screens, ...images]
      const itemsKey = items.map(designItemKey).join('|')

      useEffect(() => {
        if (items.length === 0) { setSelectedKey(''); return }
        if (!items.some(item => designItemKey(item) === selectedKey)) setSelectedKey(designItemKey(items[0]))
      }, [itemsKey, selectedKey])

      const chosen = items.find(item => designItemKey(item) === selectedKey) ?? null
      const src = requirement !== null && chosen !== null ? designPreviewUrl(requirement.id, chosen) : ''

      useEffect(() => {
        setPreviewError('')
        if (src === '') return undefined
        let alive = true
        fetch(src, { cache: 'no-store' })
          .then(response => {
            if (!response.ok) throw new Error(`预览服务返回 ${response.status}`)
          })
          .catch(reason => {
            if (alive) setPreviewError(reason instanceof Error ? reason.message : String(reason))
          })
        return () => { alive = false }
      }, [src])

      if (items.length === 0) {
        return h('div', { className: 'dsh-wb-design-msg' },
          h('b', null, '还没有可预览的交付稿'),
          requirement.designStatus === 'designing'
            ? '设计进行中；交付后会在这里看到同一份原型和预览图。'
            : '设计交付后，团队里的每个人都能在这里查看同一份原型和预览图。',
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: onOpenRequirement }, '查看需求'),
        )
      }

      return h('div', { className: 'dsh-wb-gallery-body' },
        h('aside', { className: 'dsh-wb-gallery-list' },
          screens.length > 0
            ? h('div', { className: 'dsh-wb-gallery-group' },
                h('div', { className: 'dsh-wb-gallery-group-title' }, `原型 · ${screens.length}`),
                screens.map(item => {
                  const key = designItemKey(item)
                  return h('button', {
                    className: `dsh-wb-gallery-item${key === selectedKey ? ' is-on' : ''}`,
                    type: 'button',
                    key,
                    onClick: () => setSelectedKey(key),
                  },
                    h('span', { className: 'dsh-wb-gallery-item-name' }, item.name),
                    h('span', { className: 'dsh-wb-gallery-item-meta' },
                      `${item.source === 'local' ? '本机' : designVersionLabel(item.version)} · ${relativeTime(item.updatedAt)}`),
                  )
                }),
              )
            : null,
          images.length > 0
            ? h('div', { className: 'dsh-wb-gallery-group' },
                h('div', { className: 'dsh-wb-gallery-group-title' }, `预览图 · ${images.length}`),
                images.map(item => {
                  const key = designItemKey(item)
                  return h('button', {
                    className: `dsh-wb-gallery-item${key === selectedKey ? ' is-on' : ''}`,
                    type: 'button',
                    key,
                    onClick: () => setSelectedKey(key),
                  },
                    h('span', { className: 'dsh-wb-gallery-item-name' }, item.name),
                    h('span', { className: 'dsh-wb-gallery-item-meta' }, `${designVersionLabel(item.version)} · ${relativeTime(item.updatedAt)}`),
                  )
                }),
              )
            : null,
        ),
        h('div', { className: 'dsh-wb-gallery-preview' },
          previewError !== ''
            ? h('div', { className: 'dsh-wb-design-msg' },
                h('b', null, '预览加载失败'),
                previewError,
                h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: reload }, '重试'),
              )
            : chosen === null
              ? h('div', { className: 'dsh-wb-design-msg' }, '选择一屏设计查看')
              : chosen.kind === 'image'
                ? h('img', {
                    className: 'dsh-wb-gallery-image',
                    src,
                    alt: chosen.name,
                    onError: () => setPreviewError('预览图加载失败'),
                  })
                : h(ScaledDesignFrame, { src, title: chosen.name }),
          chosen !== null
            ? h('div', { className: 'dsh-wb-gallery-caption' },
                h('span', null, chosen.name),
                h('span', null, `${chosen.source === 'local' ? '本机文件' : `交付版本 ${designVersionLabel(chosen.version)}`} · ${Math.max(1, Math.round((chosen.size ?? 0) / 1024))} KB`),
              )
            : null,
        ),
      )
    }

    function DesignTab({ sid, ctx }) {
      const { requirement, loading, error, reload } = useRequirementForSession(sid)
      const { state } = useWorkbench()
      const actorId = state?.currentUser?.id ?? ''
      const [claimError, setClaimError] = useState('')
      const [mode, setMode] = useState('canvas')
      useClaimSession(sid, actorId, setClaimError)

      const designFiles = requirement?.designFiles ?? []
      const screens = requirement?.designScreens ?? []
      const images = requirement?.designImages ?? []
      const deliveredCount = screens.length + images.length
      const dedicated = designFiles.some(file => String(file.relativePath || '').startsWith('design/'))
      const needsDesignDir = designFiles.length === 0 || dedicated
      const ensuredDesign = useEnsuredChild(requirement?.folderPath, needsDesignDir ? 'design' : '')
      const targetPath = dedicated
        ? ensuredDesign
        : designFiles.length > 0
          ? requirement.folderPath
          : ensuredDesign
      const backToSession = useCallback(() => { closeOwnTab(ctx, DESIGN_TAB_KIND); focusComposer() }, [ctx])
      const prompt = requirement ? designInstruction(requirement, state) : ''

      useEffect(() => {
        if (requirement === null) return
        if (designFiles.length > 0) setMode('canvas')
        else if (deliveredCount > 0) setMode('delivered')
      }, [requirement?.id, designFiles.length, deliveredCount])

      let body
      if (loading && requirement === null) {
        body = h('div', { className: 'dsh-wb-design-msg' }, h('span', { className: 'dsh-wb-spinner' }), '正在读取设计…')
      } else if (error !== null && requirement === null) {
        body = h('div', { className: 'dsh-wb-design-msg' },
          h('b', null, '设计读取失败'),
          error,
          h('button', { className: 'dsh-wb-btn dsh-wb-btn--sm', type: 'button', onClick: () => { void reload() } }, '重试'),
        )
      } else if (requirement === null) {
        body = h('div', { className: 'dsh-wb-design-msg' },
          h('b', null, '这个会话还没有关联需求'),
          '从研发工作台的迭代里点“进入会话”，或先在会话中提交需求。',
        )
      } else if (mode === 'delivered') {
        body = h(DeliveredGallery, {
          requirement,
          reload: () => { void reload() },
          onOpenRequirement: () => openRightTab(ctx),
          onBackToSession: backToSession,
        })
      } else if (designFiles.length === 0) {
        body = h(CanvasEmpty, {
          kindLabel: '设计稿',
          pathLabel: 'design/',
          promptText: prompt,
          onRefresh: () => { void reload() },
        })
      } else {
        body = h(DesignStudioCanvas, {
          sid,
          ctx,
          targetPath,
          onRefresh: () => { void reload() },
        })
      }

      return h('div', { className: 'dsh-wb-design dsh-wb-canvas-pane' },
        claimError !== '' ? h('div', { className: 'dsh-wb-notice is-error' }, claimError) : null,
        requirement !== null
          ? h('div', { className: 'dsh-wb-canvas-bar' },
              h('div', { className: 'dsh-wb-canvas-bar-main' },
                h('span', { className: 'dsh-wb-rqbar-code' }, requirement.code),
                h('span', { className: 'dsh-wb-canvas-title' }, '设计'),
                h(StatusChip, { kind: 'design', value: requirement.designStatus }),
              ),
              h('div', { className: 'dsh-wb-canvas-bar-actions' },
                deliveredCount > 0
                  ? h('div', { className: 'dsh-wb-seg dsh-wb-canvas-mode' },
                      h('button', { type: 'button', className: mode === 'canvas' ? 'is-on' : '', onClick: () => setMode('canvas') }, '画布'),
                      h('button', { type: 'button', className: mode === 'delivered' ? 'is-on' : '', onClick: () => setMode('delivered') }, `交付稿 ${deliveredCount}`),
                    )
                  : null,
                h('button', { className: 'dsh-wb-rqbar-btn', type: 'button', onClick: () => openRightTab(ctx) }, '打开需求'),
                h('button', { className: 'dsh-wb-rqbar-btn', type: 'button', onClick: backToSession }, '在会话中提交'),
                h('button', { className: 'dsh-wb-rqbar-btn', type: 'button', onClick: () => { void reload() } }, '刷新'),
              ),
            )
          : null,
        requirement !== null && mode === 'canvas'
          ? h(CanvasToolbar, {
              kindLabel: '设计稿',
              pathLabel: 'design/',
              count: designFiles.length,
              promptText: prompt,
              onRefresh: () => { void reload() },
              otherLabel: deliveredCount > 0 ? `交付稿 ${deliveredCount}` : '',
              otherDisabled: deliveredCount === 0,
              onOther: () => setMode('delivered'),
            })
          : null,
        h('div', { className: 'dsh-wb-canvas-content' }, body),
      )
    }

    function CommandToast() {
      const toast = useCommandToast()
      const [visible, setVisible] = useState(true)
      const seq = toast?.seq ?? null
      useEffect(() => {
        if (seq === null) return undefined
        setVisible(true)
        if (toast?.kind === 'error') return undefined
        const timer = setTimeout(() => setVisible(false), 6000)
        return () => clearTimeout(timer)
      }, [seq, toast?.kind])
      if (toast === null || !visible) return null
      return h('div', {
        className: `dsh-wb-toast dsh-wb-command-toast${toast.kind === 'error' ? ' is-error' : ''}`,
        role: toast.kind === 'error' ? 'alert' : 'status',
      },
        h('button', { className: 'dsh-wb-toast-close', type: 'button', 'aria-label': '关闭提示', onClick: () => setVisible(false) }, '×'),
        h('div', { className: 'dsh-wb-command-toast-head' },
          h('code', null, `/${toast.name}`),
          h('span', null, toast.kind === 'error' ? '执行失败' : '已完成'),
        ),
        h('div', { className: 'dsh-wb-command-toast-body' }, toast.text || '（无输出）'),
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

    function GuideIcon({ size = 18 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M5 4h9l5 5v11H5z' }),
        h('path', { d: 'M14 4v5h5M8.5 13h7M8.5 16h4.5' }),
      )
    }

    function DesignGuideIcon({ size = 18 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }),
        h('path', { d: 'M3.5 8.5h17M8 12.5h5M8 16h8' }),
      )
    }

    // ---------------------------------------------------------------------
    // Apply
    // ---------------------------------------------------------------------

    function apply(ctx) {
      ensureStyles()
      // 容器部署时随机预览端口只在容器内可达；让内嵌画布改走服务端打包的 srcdoc。
      fetch(`${API}health`, { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(body => {
          if (body && body.remotePreview === true) window.__DSH_WORKBENCH_REMOTE_PREVIEW__ = true
        })
        .catch(() => {})

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
      }, () => h(MainPage, { ctx }))), 'dsh-workbench: main panel')

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: -20,
        label: '研发工作台',
      }, WorkbenchIcon)), 'dsh-workbench: sidebar entry')

      // Design Studio 的画布以 package-local chunk 懒加载，加载后由它注册文案、点选标签等外围能力；
      // tab 本身仍由工作台注册，画布与需求上下文在同一个右栏面板里。
      ctx.effect(() => {
        let disposed = false
        Promise.resolve()
          .then(() => require.async('./client.design-studio.js'))
          .then((runtime) => {
            if (disposed) return
            runtime.apply(ctx, { embed: { kind: DESIGN_TAB_KIND } })
            publishDesignStudio({ runtime, error: null })
          })
          .catch((reason) => {
            if (disposed) return
            console.error('[dsh-workbench] 设计画布加载失败', reason)
            publishDesignStudio({ runtime: null, error: reason })
          })
        return () => {
          disposed = true
          publishDesignStudio({ runtime: null, error: null })
        }
      }, 'dsh-workbench: design studio chunk')

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        title: () => '需求',
        keepMounted: true,
        guide: [{
          id: 'open',
          order: 28,
          title: () => '需求',
          description: () => '需求文档、验收标准、评审、开发、测试与发布进度',
          icon: GuideIcon,
        }],
      }), 'dsh-workbench: requirement tab')

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        inject: (sessionId) => ({ sid: sessionId }),
      }, (props) => h(RequirementTab, { ...props, ctx }))), 'dsh-workbench: requirement tab body')

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: DESIGN_TAB_ID,
        kind: DESIGN_TAB_KIND,
        title: () => '设计',
        keepMounted: true,
        guide: [{
          id: 'open',
          order: 29,
          title: () => '设计',
          description: () => '设计版本、原型和预览图，团队里每个人看到同一份交付稿',
          icon: DesignGuideIcon,
        }],
      }), 'dsh-workbench: design tab')

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: DESIGN_TAB_ID,
        inject: (sessionId) => ({ sid: sessionId }),
      }, (props) => h(DesignTab, { ...props, ctx }))), 'dsh-workbench: design tab body')

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
