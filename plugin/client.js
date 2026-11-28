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
    const DESIGN_CSS = String.raw`
.dsh-wb-design {

  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC",
    "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", ui-monospace, "Menlo", "Consolas",
    "PingFang SC", monospace;


  --fs-10: 12px;
  --fs-11: 12px;
  --fs-12: 12px;
  --fs-13: 13px;
  --fs-14: 14px;
  --fs-16: 16px;
  --fs-19: 19px;
  --fs-22: 22px;
  --fs-28: 28px;

  --lh-tight: 1.2;
  --lh-snug: 1.35;
  --lh-body: 1.55;
  --lh-loose: 1.7;

  --fw-reg: 400;
  --fw-med: 500;
  --fw-semi: 600;
  --fw-bold: 700;


  --sp-1: 2px;
  --sp-2: 4px;
  --sp-3: 6px;
  --sp-4: 8px;
  --sp-5: 12px;
  --sp-6: 16px;
  --sp-7: 20px;
  --sp-8: 24px;
  --sp-9: 32px;
  --sp-10: 40px;
  --sp-11: 48px;
  --sp-12: 64px;


  --r-xs: 4px;
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 10px;
  --r-pill: 999px;


  --rail-w: 248px;
  --rpanel-w: 388px;
  --win-w: 1440px;
  --win-h: 900px;


  --ease: cubic-bezier(.2, .8, .2, 1);
  --dur-1: 120ms;
  --dur-2: 180ms;
  --dur-3: 240ms;


  /* 跟随宿主主题：核心中性色/文字/边框/主色直接取 DSH 语义变量，深浅色由宿主自动切换。
     末尾保留深色 hex 作兜底：宿主未提供这些变量时退回原深色，不影响功能。 */
  --bg: var(--dsw-alias-bg-base, #151517);
  --bg-elev: var(--dsw-alias-bg-layer-1, #191919);
  --panel: var(--dsw-alias-bg-layer-1, #1b1b1e);
  --surface: var(--dsw-alias-bg-layer-2, #232326);
  --surface-2: var(--dsw-alias-bg-layer-2, #2a2a2e);
  --surface-3: var(--dsw-alias-bg-layer-2, #333338);
  --overlay: rgba(0,0,0,.55);

  --line: var(--dsw-alias-border-l1, #2b2b30);
  --line-2: var(--dsw-alias-border-l2, #36363c);
  --line-3: var(--dsw-alias-border-l2, #46474d);

  --text: var(--dsw-alias-label-primary, #ededef);
  --text-2: var(--dsw-alias-label-secondary, #adb0b8);
  --text-3: var(--dsw-alias-label-tertiary, #9a9aa2);
  --text-4: var(--dsw-alias-label-tertiary, #6e6e76);
  --text-inv: var(--dsw-alias-label-inverse, #17171a);

  --primary: var(--dsw-alias-brand-primary, #6f9bf0);
  --primary-strong: var(--dsw-alias-brand-primary, #3563cc);
  --primary-strong-h: var(--dsw-alias-brand-primary, #3f6fd6);
  --primary-h: var(--dsw-alias-brand-primary, #86adf4);
  --primary-ink: var(--dsw-alias-brand-primary, #cdddfb);
  --primary-bg: rgba(111,155,240,.13);
  --primary-bg-2: rgba(111,155,240,.20);
  --primary-line: rgba(111,155,240,.38);

  --green: #5cc79a;
  --green-bg: rgba(69,185,139,.14);
  --green-line: rgba(92,199,154,.40);

  --amber: #dfb56a;
  --amber-bg: rgba(211,162,76,.14);
  --amber-line: rgba(223,181,106,.40);

  --red: #ec8a8a;
  --red-bg: rgba(226,107,107,.14);
  --red-line: rgba(236,138,138,.40);

  --violet: #c2a8f2;
  --violet-bg: rgba(176,146,238,.14);
  --violet-line: rgba(194,168,242,.40);


  --st-idle: #a6a6ae;
  --st-idle-bg: rgba(166,166,174,.12);
  --st-prog: #82a8f3;
  --st-prog-bg: rgba(111,155,240,.12);
  --st-done: #5cc79a;
  --st-done-bg: rgba(92,199,154,.12);
  --st-block: #ef8a8a;
  --st-block-bg: rgba(239,138,138,.12);
  --st-na: #9c9ca4;
  --st-na-bg: transparent;
  --st-draft: #c2a8f2;
  --st-draft-bg: rgba(194,168,242,.12);
  --st-warn: #e2b768;
  --st-warn-bg: rgba(226,183,104,.12);


  --shadow-1: 0 1px 2px rgba(0,0,0,.35);
  --shadow-2: 0 8px 24px rgba(0,0,0,.45);
  --shadow-pop: 0 16px 48px rgba(0,0,0,.55);

  --focus-ring: 0 0 0 2px var(--bg), 0 0 0 4px var(--primary-line);
}
.dsh-wb-design *, .dsh-wb-design *::before, .dsh-wb-design *::after { box-sizing: border-box; }
.dsh-wb-design, .dsh-wb-design {
  margin: 0;
  padding: 0;
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--fs-13);
  line-height: var(--lh-body);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.dsh-wb-design { overflow: hidden; }
.dsh-wb-design ::selection { background: var(--primary-bg-2); }
.dsh-wb-design *::-webkit-scrollbar { width: 10px; height: 10px; }
.dsh-wb-design *::-webkit-scrollbar-thumb {
  background: var(--line-2);
  border-radius: var(--r-pill);
  border: 3px solid transparent;
  background-clip: content-box;
}
.dsh-wb-design *::-webkit-scrollbar-thumb:hover { background: var(--line-3); background-clip: content-box; }
.dsh-wb-design *::-webkit-scrollbar-track { background: transparent; }
.dsh-wb-design a { color: inherit; text-decoration: none; }
.dsh-wb-design button { font-family: inherit; }
.dsh-wb-design svg { display: block; }
.dsh-wb-design .mono { font-family: var(--font-mono); font-feature-settings: "tnum" 1; letter-spacing: -.01em; }
.dsh-wb-design .tnum { font-variant-numeric: tabular-nums; }
.dsh-wb-design .win {
  position: relative;
  width: 100%;
  height: 100vh;
  min-width: 0;
  display: grid;
  grid-template-columns: var(--rail-w) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  background: var(--bg);
  overflow: hidden;
}
.dsh-wb-design .win.has-panel { grid-template-columns: var(--rail-w) minmax(0, 1fr) var(--rpanel-w); }
.dsh-wb-design .rail {
  position: relative;
  background: var(--bg-elev);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 44px 0 8px;
}
.dsh-wb-design .rail-top { padding: 8px 12px 10px; }
.dsh-wb-design .logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 6px 10px;
  color: var(--text);
}
.dsh-wb-design .logo-mark { width: 20px; height: 20px; color: var(--text); flex: none; }
.dsh-wb-design .logo-name { font-size: var(--fs-14); font-weight: var(--fw-semi); letter-spacing: .01em; }
.dsh-wb-design .logo-badge {
  flex: none;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: var(--fs-10);
  letter-spacing: .04em;
  padding: 1px 5px;
  border: 1px solid var(--line-3);
  border-radius: var(--r-xs);
  color: var(--text-2);
  font-weight: var(--fw-med);
}
.dsh-wb-design .logo-collapse { margin-left: auto; color: var(--text-3); }
.dsh-wb-design .newbtn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line-2);
  background: var(--surface-2);
  color: var(--text);
  border-radius: var(--r-sm);
  font-size: var(--fs-13);
  font-weight: var(--fw-med);
  cursor: pointer;
  transition: background var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease);
}
.dsh-wb-design .newbtn:hover { background: var(--surface-3); border-color: var(--line-3); }
.dsh-wb-design .newbtn svg { width: 16px; height: 16px; color: var(--text-2); }
.dsh-wb-design .nav { padding: 10px 8px 4px; display: flex; flex-direction: column; gap: 1px; }
.dsh-wb-design .nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--r-sm);
  color: var(--text-2);
  font-size: var(--fs-13);
  cursor: pointer;
  transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
}
.dsh-wb-design .nav-item svg { width: 16px; height: 16px; color: var(--text-3); flex: none; }
.dsh-wb-design .nav-item:hover { background: var(--surface-2); color: var(--text); }
.dsh-wb-design .nav-item.active { background: var(--surface-3); color: var(--text); font-weight: var(--fw-med); }
.dsh-wb-design .nav-item.active svg { color: var(--text); }
.dsh-wb-design .nav-item .count {
  margin-left: auto;
  font-size: var(--fs-11);
  font-family: var(--font-mono);
  color: var(--text-3);
  background: var(--surface-2);
  border-radius: var(--r-pill);
  padding: 0 6px;
  min-width: 18px;
  text-align: center;
}
.dsh-wb-design .nav-item .dot-new {
  margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: var(--primary);
}
.dsh-wb-design .rail-sec { padding: 10px 8px 4px; min-height: 0; overflow: auto; flex: 1; }
.dsh-wb-design .rail-sec-hd {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 6px;
  font-size: var(--fs-11);
  color: var(--text-3);
  letter-spacing: .04em;
  text-transform: uppercase;
}
.dsh-wb-design .rail-sec-hd .r { margin-left: auto; display: flex; gap: 4px; }
.dsh-wb-design .rail-sec-hd svg { width: 13px; height: 13px; }
.dsh-wb-design .iter-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
  border: 1px solid transparent;
}
.dsh-wb-design .iter-item:hover { background: var(--surface-2); }
.dsh-wb-design .iter-item.active { background: var(--surface-2); border-color: var(--line-2); }
.dsh-wb-design .iter-item .t { font-size: var(--fs-12); color: var(--text); display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .iter-item .s { font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); }
.dsh-wb-design .iter-item .t .num { font-family: var(--font-mono); color: var(--text-3); font-size: var(--fs-11); }
.dsh-wb-design .identity {
  margin: 6px 8px 4px;
  padding: 8px;
  border-radius: var(--r-md);
  border: 1px solid var(--line-2);
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
}
.dsh-wb-design .identity:hover { border-color: var(--line-3); }
.dsh-wb-design .identity .who { min-width: 0; flex: 1; }
.dsh-wb-design .identity .who .n { font-size: var(--fs-12); color: var(--text); font-weight: var(--fw-med); }
.dsh-wb-design .identity .who .r { font-size: var(--fs-11); color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-wb-design .identity .chev { color: var(--text-3); }
.dsh-wb-design .center {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  position: relative;
}
.dsh-wb-design .topbar {
  height: 52px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: blur(8px);
}
.dsh-wb-design .crumb { display: flex; align-items: center; gap: 6px; color: var(--text-3); font-size: var(--fs-12); }
.dsh-wb-design .crumb a:hover { color: var(--text); }
.dsh-wb-design .crumb .sep { color: var(--text-3); }
.dsh-wb-design .crumb .cur { color: var(--text-2); }
.dsh-wb-design .topbar .spacer { flex: 1; }
.dsh-wb-design .scroll { overflow: auto; min-height: 0; flex: 1; }
/* 所有页面共用同一圈固定边距；宽度跟着窗口走，不再卡最大宽度。 */
.dsh-wb-design .page { padding: 22px 28px 40px; max-width: none; }
/* 首页：迭代表上面放「我的工作台」和「技能」两个入口。 */
.dsh-wb-design .home-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 16px; }
.dsh-wb-design .home-link { display: flex; align-items: center; gap: 11px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.dsh-wb-design .home-link:hover { border-color: var(--line-2); background: var(--surface-2); }
.dsh-wb-design .home-link > .ic { width: 18px; height: 18px; color: var(--primary); flex: none; }
.dsh-wb-design .home-link-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-wb-design .home-link-body b { font-size: var(--fs-13); font-weight: var(--fw-semi); }
.dsh-wb-design .home-link-body span { font-size: var(--fs-11); color: var(--text-3); }
.dsh-wb-design .home-link .chev { margin-left: auto; width: 14px; height: 14px; color: var(--text-3); flex: none; }
.dsh-wb-design .home-link:hover .chev { color: var(--text-2); }
/* 层级导航并进顶栏：项目选择器后面直接是面包屑，页面不再单独占一条。 */
.dsh-wb-design .topbar .dsh-wb-crumbs { min-width: 0; overflow: hidden; }
.dsh-wb-design .dsh-wb-crumbs { display: flex; align-items: center; gap: 1px; min-height: 28px; font-size: var(--fs-12); color: var(--text-3); min-width: 0; }
.dsh-wb-design .dsh-wb-crumbs .sep { flex: none; width: 12px; height: 12px; color: var(--line-3); }
.dsh-wb-design .dsh-wb-crumbs .step,
.dsh-wb-design .dsh-wb-crumbs .cur { display: inline-flex; align-items: center; height: 24px; padding: 0 7px; border: 0; border-radius: var(--r-sm); background: transparent; font: inherit; font-size: var(--fs-12); white-space: nowrap; }
.dsh-wb-design .dsh-wb-crumbs .step { color: var(--text-3); cursor: pointer; }
.dsh-wb-design .dsh-wb-crumbs .step:hover { background: var(--surface-2); color: var(--text); }
.dsh-wb-design .dsh-wb-crumbs .cur { color: var(--text); font-weight: var(--fw-med); }
.dsh-wb-design .dsh-wb-crumbs .mono { font-family: var(--font-mono); letter-spacing: -.01em; }
.dsh-wb-design .page-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 18px; }
.dsh-wb-design .page-head .ttl-block { min-width: 0; }
.dsh-wb-design .page-title {
  font-size: var(--fs-22);
  font-weight: var(--fw-semi);
  letter-spacing: -.01em;
  line-height: var(--lh-tight);
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}
.dsh-wb-design .page-title .code {
  font-family: var(--font-mono);
  font-size: var(--fs-14);
  color: var(--text-3);
  font-weight: var(--fw-reg);
}
.dsh-wb-design .page-sub { margin-top: 6px; color: var(--text-2); font-size: var(--fs-12); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-wb-design .page-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex: none; }
.dsh-wb-design .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line-2);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-13);
  font-weight: var(--fw-med);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
}
.dsh-wb-design .btn svg { width: 15px; height: 15px; }
.dsh-wb-design .btn:hover { background: var(--surface-3); border-color: var(--line-3); }
.dsh-wb-design .btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.dsh-wb-design .btn-primary {
  background: var(--primary-strong);
  border-color: var(--primary-strong);
  color: #fff;
  font-weight: var(--fw-semi);
}
.dsh-wb-design .btn-primary:hover { background: var(--primary-strong-h); border-color: var(--primary-strong-h); }
.dsh-wb-design .btn-ghost { background: transparent; border-color: var(--line-2); color: var(--text-2); }
.dsh-wb-design .btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.dsh-wb-design .btn-danger { background: var(--red-bg); border-color: var(--red-line); color: var(--st-block); }
.dsh-wb-design .btn-danger:hover { background: var(--red-bg); border-color: var(--red); }
.dsh-wb-design .btn-text { background: transparent; border-color: transparent; color: var(--text-2); padding: 0 6px; }
.dsh-wb-design .btn-text:hover { background: var(--surface-2); color: var(--text); }
.dsh-wb-design .btn-sm { height: 27px; padding: 0 9px; font-size: var(--fs-12); border-radius: var(--r-xs); }
.dsh-wb-design .btn-sm svg { width: 13px; height: 13px; }
.dsh-wb-design .btn-icon { width: 32px; padding: 0; }
.dsh-wb-design .btn-icon.btn-sm { width: 27px; }
.dsh-wb-design .btn-disabled, .dsh-wb-design .btn:disabled { cursor: not-allowed; pointer-events: none; color: var(--text-3) !important; background: var(--surface-2); border-color: var(--line); opacity: 1; }
.dsh-wb-design .input, .dsh-wb-design .select, .dsh-wb-design .textarea {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  color: var(--text);
  font-size: var(--fs-13);
  font-family: inherit;
  transition: border-color var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease);
}
.dsh-wb-design .textarea { height: auto; padding: 9px 10px; line-height: var(--lh-body); resize: vertical; }
.dsh-wb-design .input::placeholder, .dsh-wb-design .textarea::placeholder { color: var(--text-3); }
.dsh-wb-design .input:hover, .dsh-wb-design .select:hover, .dsh-wb-design .textarea:hover { border-color: var(--line-3); }
.dsh-wb-design .input:focus, .dsh-wb-design .select:focus, .dsh-wb-design .textarea:focus {
  outline: none;
  border-color: var(--primary-line);
  box-shadow: 0 0 0 3px var(--primary-bg);
}
.dsh-wb-design .input.err { border-color: var(--red-line); }
.dsh-wb-design .field { margin-bottom: 16px; }
.dsh-wb-design .label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-12);
  color: var(--text-2);
  font-weight: var(--fw-med);
  margin-bottom: 6px;
}
.dsh-wb-design .label .req { color: var(--red); }
.dsh-wb-design .label .hint { margin-left: auto; color: var(--text-3); font-weight: var(--fw-reg); }
.dsh-wb-design .field-help { font-size: var(--fs-11); color: var(--text-3); margin-top: 5px; line-height: var(--lh-snug); }
.dsh-wb-design .search {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text-3);
}
.dsh-wb-design .search svg { width: 14px; height: 14px; }
.dsh-wb-design .search input { flex: 1; height: 26px; border: 0; background: transparent; color: var(--text); font-size: var(--fs-12); outline: none; }
.dsh-wb-design .search input::placeholder { color: var(--text-3); }
.dsh-wb-design .dropdown-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 10px;
  background: var(--surface); border: 1px solid var(--line-2);
  border-radius: var(--r-sm); font-size: var(--fs-12); color: var(--text);
  cursor: pointer;
}
.dsh-wb-design .dropdown-trigger svg.chev { width: 13px; height: 13px; color: var(--text-3); margin-left: 2px; }
.dsh-wb-design .dsh-wb-identity { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 4px; font-size: var(--fs-12); color: var(--text-2); }
.dsh-wb-design .seg {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  gap: 2px;
}
.dsh-wb-design .seg button {
  height: 26px; padding: 0 11px;
  border: 0; background: transparent; color: var(--text-2);
  font-size: var(--fs-12); border-radius: var(--r-xs); cursor: pointer;
  font-family: inherit;
}
.dsh-wb-design .seg button.active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-1); font-weight: var(--fw-med); }
.dsh-wb-design .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.dsh-wb-design .toolbar .spacer { flex: 1; }
.dsh-wb-design .card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
.dsh-wb-design .card-hd { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
.dsh-wb-design .card-hd .t { font-size: var(--fs-13); font-weight: var(--fw-semi); }
.dsh-wb-design .card-hd .r { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .card-bd { padding: 14px; }
.dsh-wb-design .section-hd { display: flex; align-items: center; gap: 8px; margin: 26px 0 12px; }
.dsh-wb-design .section-hd .t { font-size: var(--fs-14); font-weight: var(--fw-semi); }
.dsh-wb-design .section-hd .n { font-family: var(--font-mono); font-size: var(--fs-12); color: var(--text-3); }
.dsh-wb-design .section-hd .r { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  border-radius: var(--r-xs);
  font-size: var(--fs-11);
  font-weight: var(--fw-med);
  line-height: 1;
  white-space: nowrap;
  border: 1px solid transparent;
  font-family: var(--font-sans);
}
.dsh-wb-design .chip .ico { width: 9px; height: 9px; flex: none; }
.dsh-wb-design .chip .gl { font-family: var(--font-mono); font-size: 12px; line-height: 1; }
.dsh-wb-design .chip--idle { color: var(--st-idle); background: var(--st-idle-bg); }
.dsh-wb-design .chip--prog { color: var(--st-prog); background: var(--st-prog-bg); }
.dsh-wb-design .chip--done { color: var(--st-done); background: var(--st-done-bg); }
.dsh-wb-design .chip--block { color: var(--st-block); background: var(--st-block-bg); }
.dsh-wb-design .chip--na { color: var(--st-na); background: transparent; border-color: var(--line-2); }
.dsh-wb-design .chip--draft { color: var(--st-draft); background: var(--st-draft-bg); border-style: dashed; border-color: var(--violet-line); }
.dsh-wb-design .chip--warn { color: var(--st-warn); background: var(--st-warn-bg); }
.dsh-wb-design .chip--plain { color: var(--text-2); background: var(--surface-2); }
.dsh-wb-design .chip--lg { height: 23px; padding: 0 9px; font-size: var(--fs-12); }
.dsh-wb-design .badge {
  display: inline-flex; align-items: center; gap: 4px;
  height: 18px; padding: 0 6px; border-radius: var(--r-xs);
  font-size: var(--fs-11); font-family: var(--font-mono);
  background: var(--surface-2); color: var(--text-2); border: 1px solid var(--line);
}
.dsh-wb-design .badge--local { color: var(--violet); background: var(--violet-bg); border-color: var(--violet-line); font-family: var(--font-sans); }
.dsh-wb-design .badge--live { color: var(--green); background: var(--green-bg); border-color: var(--green-line); font-family: var(--font-sans); }
.dsh-wb-design .badge--mock { color: var(--amber); background: var(--amber-bg); border-color: var(--amber-line); font-family: var(--font-sans); }
.dsh-wb-design .matrix { display: flex; gap: 4px; align-items: center; }
.dsh-wb-design .mx {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  min-width: 60px;
}
.dsh-wb-design .mx-lab {
  font-size: 12px; color: var(--text-3); letter-spacing: .02em;
  display: flex; align-items: center; gap: 3px; white-space: nowrap;
}
.dsh-wb-design .mx-lab .na { color: var(--text-4); }
.dsh-wb-design .mx .chip { width: 100%; justify-content: flex-start; }
.dsh-wb-design .matrix--row { gap: 3px; }
.dsh-wb-design .matrix--row .mx { min-width: 0; }
.dsh-wb-design .matrix--row .mx .chip { padding: 0 5px; font-size: 12px; height: 18px; gap: 3px; }
.dsh-wb-design .matrix--row .mx .chip .txt { display: none; }
.dsh-wb-design .matrix--row .mx .chip .gl { font-size: 12px; }
.dsh-wb-design .table { width: 100%; border-collapse: collapse; }
.dsh-wb-design .table th {
  text-align: left;
  font-size: var(--fs-11);
  font-weight: var(--fw-med);
  color: var(--text-3);
  letter-spacing: .03em;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line-2);
  white-space: nowrap;
  background: var(--bg-elev);
  position: sticky; top: 0; z-index: 2;
}
.dsh-wb-design .table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
  font-size: var(--fs-12);
  color: var(--text-2);
}
.dsh-wb-design .table tbody tr { transition: background var(--dur-1) var(--ease); cursor: pointer; }
.dsh-wb-design .table tbody tr:hover { background: var(--surface-2); }
.dsh-wb-design .table tbody tr.active { background: var(--surface-2); box-shadow: inset 2px 0 0 var(--primary); }
.dsh-wb-design .table td .rk { color: var(--text); font-weight: var(--fw-med); font-size: var(--fs-13); }
.dsh-wb-design .table td a.rk { display: inline-block; padding: 5px 0; white-space: nowrap; }
.dsh-wb-design .crumb a { display: inline-flex; align-items: center; min-height: 24px; padding: 0 2px; }
.dsh-wb-design .meta-kv a { display: inline-flex; align-items: center; min-height: 24px; }
.dsh-wb-design .td-code { font-family: var(--font-mono); color: var(--text-3); font-size: var(--fs-11); }
.dsh-wb-design .table-wrap { border: 1px solid var(--line); border-radius: var(--r-md); overflow: auto; background: var(--surface); }
.dsh-wb-design .table-wrap .table { min-width: 760px; }
.dsh-wb-design .avatar {
  width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--fs-11); font-weight: var(--fw-semi); color: #fff;
  flex: none; font-family: var(--font-sans); letter-spacing: .02em;
  border: 1px solid rgba(255,255,255,.08);
}
.dsh-wb-design .avatar.sm { width: 20px; height: 20px; font-size: 12px; }
.dsh-wb-design .avatar.lg { width: 30px; height: 30px; font-size: var(--fs-12); }
.dsh-wb-design .av-1 { background: #3d5c8f; }
.dsh-wb-design .av-2 { background: #37704f; }
.dsh-wb-design .av-3 { background: #67509a; }
.dsh-wb-design .av-4 { background: #855636; }
.dsh-wb-design .av-5 { background: #35707a; }
.dsh-wb-design .av-6 { background: #7d4555; }
.dsh-wb-design .assignee { display: inline-flex; align-items: center; gap: 7px; }
.dsh-wb-design .assignee .nm { font-size: var(--fs-12); color: var(--text-2); }
.dsh-wb-design .assignee.empty .slot {
  width: 24px; height: 24px; border-radius: 50%;
  border: 1px dashed var(--line-3); color: var(--text-3);
  display: inline-flex; align-items: center; justify-content: center;
}
.dsh-wb-design .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); }
.dsh-wb-design .tab {
  position: relative;
  height: 36px; padding: 0 12px;
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--fs-13); color: var(--text-3); cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  white-space: nowrap;
}
.dsh-wb-design .tab:hover { color: var(--text-2); }
.dsh-wb-design .tab.active { color: var(--text); border-bottom-color: var(--primary); font-weight: var(--fw-med); }
.dsh-wb-design .tab .n { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--text-3); }
.dsh-wb-design .progress { height: 5px; border-radius: var(--r-pill); background: var(--surface-3); overflow: hidden; min-width: 60px; }
.dsh-wb-design .progress span { display: block; height: 100%; border-radius: inherit; background: var(--primary); }
.dsh-wb-design .progress.green span { background: var(--green); }
.dsh-wb-design .timeline { padding: 4px 0; }
.dsh-wb-design .tl-row { display: grid; grid-template-columns: 104px 1fr 92px; align-items: center; gap: 12px; padding: 7px 0; }
.dsh-wb-design .tl-name { font-size: var(--fs-12); color: var(--text-2); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.dsh-wb-design .tl-track { position: relative; height: 22px; background: var(--surface-2); border-radius: var(--r-xs); overflow: hidden; }
.dsh-wb-design .tl-bar {
  position: absolute; top: 4px; height: 14px; border-radius: var(--r-xs);
  background: var(--primary-bg-2); border: 1px solid var(--primary-line);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--primary-ink); font-family: var(--font-mono); white-space: nowrap;
}
.dsh-wb-design .tl-bar.green { background: var(--green-bg); border-color: var(--green-line); color: var(--green); }
.dsh-wb-design .tl-bar.amber { background: var(--amber-bg); border-color: var(--amber-line); color: var(--amber); }
.dsh-wb-design .tl-bar.idle { background: var(--surface-3); border-color: var(--line-2); color: var(--text-3); }
.dsh-wb-design .tl-date { font-size: var(--fs-11); font-family: var(--font-mono); color: var(--text-3); text-align: right; }
.dsh-wb-design .steps { display: flex; align-items: center; gap: 0; }
.dsh-wb-design .step { display: flex; align-items: center; gap: 7px; font-size: var(--fs-12); color: var(--text-3); }
.dsh-wb-design .step .knob { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--line-3); display: flex; align-items: center; justify-content: center; font-size: 12px; }
.dsh-wb-design .step.done { color: var(--text-2); }
.dsh-wb-design .step.done .knob { background: var(--green); border-color: var(--green); color: #04130c; }
.dsh-wb-design .step.cur .knob { border-color: var(--primary); color: var(--primary); }
.dsh-wb-design .step.cur { color: var(--text); font-weight: var(--fw-med); }
.dsh-wb-design .step-line { width: 26px; height: 1px; background: var(--line-2); margin: 0 6px; }
.dsh-wb-design .empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 56px 24px; color: var(--text-3);
}
.dsh-wb-design .empty .ico {
  width: 44px; height: 44px; border-radius: var(--r-md);
  border: 1px solid var(--line-2); background: var(--surface);
  display: flex; align-items: center; justify-content: center; margin-bottom: 14px; color: var(--text-3);
}
.dsh-wb-design .empty .ico svg { width: 22px; height: 22px; }
.dsh-wb-design .empty .t { font-size: var(--fs-14); color: var(--text); font-weight: var(--fw-med); margin-bottom: 5px; }
.dsh-wb-design .empty .d { font-size: var(--fs-12); color: var(--text-3); max-width: 34ch; line-height: var(--lh-body); margin-bottom: 14px; }
.dsh-wb-design .skeleton { background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 37%, var(--surface-2) 63%); background-size: 400% 100%; animation: sk 1.4s ease infinite; border-radius: var(--r-xs); }
@keyframes dsh-wb-sk{ 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
@media (prefers-reduced-motion: reduce){
.dsh-wb-design .skeleton { animation: none; }
}
.dsh-wb-design .toast {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 14px; border-radius: var(--r-md);
  background: var(--surface-3); border: 1px solid var(--line-3);
  box-shadow: var(--shadow-pop); font-size: var(--fs-12); color: var(--text);
}
.dsh-wb-design .toast svg { width: 15px; height: 15px; }
.dsh-wb-design .toast.ok svg { color: var(--green); }
.dsh-wb-design .toast.err svg { color: var(--red); }
.dsh-wb-design .banner {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 12px; border-radius: var(--r-sm);
  font-size: var(--fs-12); line-height: var(--lh-snug);
  border: 1px solid transparent;
}
.dsh-wb-design .banner svg { width: 15px; height: 15px; flex: none; }
.dsh-wb-design .banner--mock { background: var(--amber-bg); border-color: var(--amber-line); color: var(--amber); }
.dsh-wb-design .banner--info { background: var(--primary-bg); border-color: var(--primary-line); color: var(--primary-ink); }
.dsh-wb-design .banner--warn { background: var(--amber-bg); border-color: var(--amber-line); color: var(--amber); }
.dsh-wb-design .banner--danger { background: var(--red-bg); border-color: var(--red-line); color: var(--red); }
.dsh-wb-design .banner .r { margin-left: auto; }
.dsh-wb-design .banner a { text-decoration: underline; text-underline-offset: 2px; }
.dsh-wb-design .switch { width: 34px; height: 19px; border-radius: var(--r-pill); background: var(--surface-3); border: 1px solid var(--line-2); position: relative; cursor: pointer; flex: none; transition: background var(--dur-2) var(--ease); }
.dsh-wb-design .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: var(--text-3); transition: transform var(--dur-2) var(--ease), background var(--dur-2) var(--ease); }
.dsh-wb-design .switch.on { background: var(--primary); border-color: var(--primary); }
.dsh-wb-design .switch.on::after { transform: translateX(15px); background: #fff; }
.dsh-wb-design .conv-head { height: 52px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--line); }
.dsh-wb-design .conv-head .ct { font-size: var(--fs-13); font-weight: var(--fw-med); display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .conv-head .csub { font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); }
.dsh-wb-design .conv-head .spacer { flex: 1; }
.dsh-wb-design .conv { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.dsh-wb-design .conv-body { flex: 1; overflow: auto; padding: 24px 24px 12px; display: flex; flex-direction: column; gap: 18px; }
.dsh-wb-design .msg { display: flex; gap: 11px; max-width: 100%; }
.dsh-wb-design .msg .av { flex: none; }
.dsh-wb-design .msg .body { min-width: 0; flex: 1; }
.dsh-wb-design .msg .meta { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.dsh-wb-design .msg .meta .who { font-size: var(--fs-12); font-weight: var(--fw-semi); color: var(--text); }
.dsh-wb-design .msg .meta .role { font-size: var(--fs-11); color: var(--text-3); }
.dsh-wb-design .msg .meta .time { font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); }
.dsh-wb-design .msg p { margin: 0 0 8px; font-size: var(--fs-13); line-height: var(--lh-loose); color: var(--text); }
.dsh-wb-design .msg .bubble { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 11px 13px; }
.dsh-wb-design .msg.user .bubble { background: var(--primary-bg); border-color: var(--primary-line); }
.dsh-wb-design .tool-call { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); overflow: hidden; }
.dsh-wb-design .tool-hd { display: flex; align-items: center; gap: 8px; padding: 8px 11px; font-size: var(--fs-12); color: var(--text-2); cursor: pointer; }
.dsh-wb-design .tool-hd svg { width: 14px; height: 14px; color: var(--primary); }
.dsh-wb-design .tool-hd .chev { color: var(--text-3); margin-left: auto; }
.dsh-wb-design .tool-hd .tag { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--text-3); }
.dsh-wb-design .tool-bd { padding: 0 11px 10px 33px; font-family: var(--font-mono); font-size: var(--fs-11); color: var(--text-3); line-height: var(--lh-body); }
.dsh-wb-design .composer-wrap { flex: none; padding: 10px 18px 16px; }
.dsh-wb-design .composer {
  border: 1px solid var(--line-2); border-radius: var(--r-md);
  background: var(--surface); padding: 10px 12px;
}
.dsh-wb-design .composer:focus-within { border-color: var(--primary-line); box-shadow: 0 0 0 3px var(--primary-bg); }
.dsh-wb-design .composer textarea { width: 100%; border: 0; background: transparent; color: var(--text); font-size: var(--fs-13); font-family: inherit; resize: none; outline: none; line-height: var(--lh-body); }
.dsh-wb-design .composer textarea::placeholder { color: var(--text-3); }
.dsh-wb-design .composer-bar { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.dsh-wb-design .composer-bar .spacer { flex: 1; }
.dsh-wb-design .composer-chip { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border-radius: var(--r-xs); background: var(--surface-2); border: 1px solid var(--line); font-size: var(--fs-11); color: var(--text-2); }
.dsh-wb-design .composer-chip svg { width: 12px; height: 12px; }
.dsh-wb-design .send-btn { width: 28px; height: 28px; border-radius: var(--r-sm); background: var(--primary-strong); border: 0; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.dsh-wb-design .send-btn svg { width: 15px; height: 15px; }
.dsh-wb-design .rpanel {
  background: var(--panel);
  border-left: 1px solid var(--line);
  display: flex; flex-direction: column; min-height: 0;
}
.dsh-wb-design .rp-head { flex: none; padding: 12px 14px 0; border-bottom: 1px solid var(--line); }
.dsh-wb-design .rp-titlebar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.dsh-wb-design .rp-titlebar .t { font-size: var(--fs-13); font-weight: var(--fw-semi); }
.dsh-wb-design .rp-titlebar .r { margin-left: auto; display: flex; gap: 4px; }
.dsh-wb-design .rp-titlebar .r svg { width: 15px; height: 15px; color: var(--text-3); }
.dsh-wb-design .rp-tabs { display: flex; gap: 1px; overflow: auto; }
.dsh-wb-design .rp-tab { height: 32px; padding: 0 9px; display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-12); color: var(--text-3); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.dsh-wb-design .rp-tab:hover { color: var(--text-2); }
.dsh-wb-design .rp-tab.active { color: var(--text); border-bottom-color: var(--primary); font-weight: var(--fw-med); }
.dsh-wb-design .rp-tab .n { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); }
.dsh-wb-design .rp-body { flex: 1; overflow: auto; padding: 14px; }
.dsh-wb-design .rp-foot { flex: none; padding: 10px 14px; border-top: 1px solid var(--line); display: flex; align-items: center; gap: 8px; background: var(--panel); }
.dsh-wb-design .rp-foot .spacer { flex: 1; }
.dsh-wb-design .rp-sec { margin-bottom: 18px; }
.dsh-wb-design .rp-sec-hd { display: flex; align-items: center; gap: 7px; font-size: var(--fs-11); color: var(--text-3); letter-spacing: .04em; text-transform: uppercase; margin-bottom: 8px; }
.dsh-wb-design .rp-sec-hd .r { margin-left: auto; }
.dsh-wb-design .rp-sec-hd svg { width: 13px; height: 13px; }
.dsh-wb-design .kv { display: grid; grid-template-columns: 70px 1fr; gap: 7px 10px; font-size: var(--fs-12); }
.dsh-wb-design .kv dt { color: var(--text-3); }
.dsh-wb-design .kv dd { margin: 0; color: var(--text); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-wb-design .req-sum { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px; margin-bottom: 14px; }
.dsh-wb-design .req-sum .top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.dsh-wb-design .req-sum .code { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--text-3); }
.dsh-wb-design .req-sum .h { font-size: var(--fs-13); font-weight: var(--fw-semi); color: var(--text); }
.dsh-wb-design .req-sum .txt { font-size: var(--fs-12); color: var(--text-2); line-height: var(--lh-body); }
.dsh-wb-design .canvas-preview { border: 1px solid var(--line-2); border-radius: var(--r-md); overflow: hidden; background: var(--surface-2); }
.dsh-wb-design .canvas-preview .bar { display: flex; align-items: center; gap: 6px; padding: 6px 9px; background: var(--surface-3); border-bottom: 1px solid var(--line); font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); }
.dsh-wb-design .canvas-preview .bar .dots { display: flex; gap: 3px; }
.dsh-wb-design .canvas-preview .bar .dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-3); }
.dsh-wb-design .canvas-preview .stage { height: 132px; display: flex; align-items: center; justify-content: center; position: relative; background:
  linear-gradient(var(--line) 1px, transparent 1px) 0 0 / 100% 22px,
  linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0 / 22px 100%,
  var(--surface); }
.dsh-wb-design .canvas-preview .stage .wire { width: 150px; height: 96px; border: 1px solid var(--line-3); border-radius: var(--r-sm); background: var(--surface-2); display: flex; flex-direction: column; gap: 5px; padding: 8px; }
.dsh-wb-design .canvas-preview .stage .wire i { display: block; height: 6px; border-radius: 2px; background: var(--line-3); }
.dsh-wb-design .canvas-preview .stage .wire i:nth-child(1) { width: 40%; height: 10px; background: var(--primary-line); }
.dsh-wb-design .canvas-preview .stage .wire i:nth-child(3) { width: 70%; }
.dsh-wb-design .canvas-preview .stage .wire i:nth-child(4) { width: 55%; }
.dsh-wb-design .diff { border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; font-family: var(--font-mono); font-size: var(--fs-11); }
.dsh-wb-design .diff-hd { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: var(--bg-elev); border-bottom: 1px solid var(--line); font-family: var(--font-sans); font-size: var(--fs-11); color: var(--text-3); }
.dsh-wb-design .diff-line { display: flex; gap: 10px; padding: 3px 10px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.dsh-wb-design .diff-line .ln { color: var(--text-2); flex: none; width: 24px; text-align: right; }
.dsh-wb-design .diff-line.add { background: var(--green-bg); }
.dsh-wb-design .diff-line.add .tx { color: var(--st-done); }
.dsh-wb-design .diff-line.del { background: var(--red-bg); }
.dsh-wb-design .diff-line.del .tx { color: var(--st-block); }
.dsh-wb-design .diff-line .tx { flex: 1; }
.dsh-wb-design .drawer-scrim { position: absolute; inset: 0; background: var(--overlay); }
.dsh-wb-design .drawer {
  position: absolute; top: 0; right: 0; bottom: 0; width: 380px;
  background: var(--panel); border-left: 1px solid var(--line-2);
  box-shadow: var(--shadow-pop); display: flex; flex-direction: column; z-index: 40;
}
.dsh-wb-design .drawer-hd { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.dsh-wb-design .drawer-hd .t { font-size: var(--fs-14); font-weight: var(--fw-semi); }
.dsh-wb-design .drawer-hd .r { margin-left: auto; }
.dsh-wb-design .drawer-bd { flex: 1; overflow: auto; padding: 6px 0; }
.dsh-wb-design .log-item { display: flex; gap: 11px; padding: 10px 16px; position: relative; }
.dsh-wb-design .log-item::before { content: ""; position: absolute; left: 26px; top: 30px; bottom: -6px; width: 1px; background: var(--line); }
.dsh-wb-design .log-item:last-child::before { display: none; }
.dsh-wb-design .log-item .av { flex: none; z-index: 1; }
.dsh-wb-design .log-item .c { min-width: 0; }
.dsh-wb-design .log-item .c .l1 { font-size: var(--fs-12); color: var(--text); line-height: var(--lh-snug); }
.dsh-wb-design .log-item .c .l1 b { font-weight: var(--fw-semi); }
.dsh-wb-design .log-item .c .l2 { font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); margin-top: 2px; }
.dsh-wb-design .modal-scrim { position: absolute; inset: 0; background: var(--overlay); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dsh-wb-design .modal { width: 380px; background: var(--panel); border: 1px solid var(--line-2); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); overflow: hidden; }
.dsh-wb-design .modal-hd { padding: 16px 18px 8px; font-size: var(--fs-14); font-weight: var(--fw-semi); }
.dsh-wb-design .modal-bd { padding: 0 18px 16px; font-size: var(--fs-12); color: var(--text-2); line-height: var(--lh-body); }
.dsh-wb-design .modal-ft { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); background: var(--bg-elev); }
.dsh-wb-design .ic { width: 16px; height: 16px; flex: none; }
.dsh-wb-design .muted { color: var(--text-3); }
.dsh-wb-design .muted2 { color: var(--text-2); }
.dsh-wb-design .mono-label { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--text-3); letter-spacing: .02em; }
.dsh-wb-design .hr { height: 1px; background: var(--line); border: 0; margin: 16px 0; }
.dsh-wb-design .row { display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .col { display: flex; flex-direction: column; }
.dsh-wb-design .gap-2 { gap: 4px; }
.dsh-wb-design .gap-3 { gap: 6px; }
.dsh-wb-design .gap-4 { gap: 8px; }
.dsh-wb-design .gap-6 { gap: 12px; }
.dsh-wb-design .wrap { flex-wrap: wrap; }
.dsh-wb-design .grow { flex: 1; }
.dsh-wb-design .nowrap { white-space: nowrap; }
.dsh-wb-design .tiny { font-size: var(--fs-11); }
.dsh-wb-design .sm { font-size: var(--fs-12); }
.dsh-wb-design .strong { font-weight: var(--fw-semi); color: var(--text); }
.dsh-wb-design .hide { display: none !important; }
.dsh-wb-design .skill-card { display: flex; flex-direction: column; gap: 10px; padding: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); cursor: pointer; transition: border-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease); }
.dsh-wb-design .skill-card:hover { border-color: var(--line-3); background: var(--surface-2); }
.dsh-wb-design .skill-card .hd { display: flex; align-items: flex-start; gap: 10px; }
.dsh-wb-design .skill-card .ic-badge { width: 32px; height: 32px; border-radius: var(--r-sm); background: var(--primary-bg); border: 1px solid var(--primary-line); color: var(--primary); display: flex; align-items: center; justify-content: center; flex: none; }
.dsh-wb-design .skill-card .ic-badge svg { width: 17px; height: 17px; }
.dsh-wb-design .skill-card .nm { font-size: var(--fs-13); font-weight: var(--fw-semi); color: var(--text); }
.dsh-wb-design .skill-card .desc { font-size: var(--fs-11); color: var(--text-3); margin-top: 3px; line-height: var(--lh-snug); }
.dsh-wb-design .skill-card .ft { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-wb-design .setting-row { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--line); }
.dsh-wb-design .setting-row:last-child { border-bottom: 0; }
.dsh-wb-design .setting-row .info { flex: 1; min-width: 0; }
.dsh-wb-design .setting-row .info .t { font-size: var(--fs-13); color: var(--text); }
.dsh-wb-design .setting-row .info .d { font-size: var(--fs-11); color: var(--text-3); margin-top: 3px; line-height: var(--lh-snug); }
.dsh-wb-design .state-band { margin-top: 34px; padding-top: 18px; border-top: 1px solid var(--line); }
.dsh-wb-design .state-band .cap { display: flex; align-items: center; gap: 8px; font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 10px; }
.dsh-wb-design .state-band .cap::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.dsh-wb-design .state-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.dsh-wb-design .state-prev { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--bg-elev); padding: 12px; min-height: 108px; display: flex; flex-direction: column; }
.dsh-wb-design .state-prev .h { font-size: var(--fs-11); color: var(--text-3); margin-bottom: 8px; display: flex; align-items: center; gap: 5px; }
.dsh-wb-design .state-prev .h svg { width: 12px; height: 12px; }
.dsh-wb-design .state-prev .bd { flex: 1; display: flex; flex-direction: column; gap: 6px; justify-content: center; }
.dsh-wb-design .state-prev .bd .ln { height: 7px; border-radius: 3px; background: var(--surface-3); }
.dsh-wb-design .state-prev .bd .ln.w60 { width: 60%; }
.dsh-wb-design .state-prev .bd .ln.w80 { width: 80%; }
.dsh-wb-design .state-prev .bd .ln.w40 { width: 40%; }
.dsh-wb-design .state-prev .msg { font-size: var(--fs-12); color: var(--text-2); display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .state-prev .msg svg { width: 13px; height: 13px; }
.dsh-wb-design .state-prev .msg.err { color: var(--red); }
.dsh-wb-design .state-prev .msg.warn { color: var(--amber); }
.dsh-wb-design .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
.dsh-wb-design .kpi { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); padding: 12px 14px; }
.dsh-wb-design .kpi .lab { font-size: var(--fs-11); color: var(--text-3); display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .kpi .v { font-size: var(--fs-22); font-weight: var(--fw-semi); color: var(--text); font-family: var(--font-mono); margin-top: 4px; letter-spacing: -.02em; }
.dsh-wb-design .kpi .v small { font-size: var(--fs-12); color: var(--text-3); font-family: var(--font-sans); font-weight: 400; margin-left: 4px; }
.dsh-wb-design .kpi .d { font-size: var(--fs-11); color: var(--text-3); margin-top: 2px; }
.dsh-wb-design .plugnac { display: flex; align-items: center; gap: 2px; min-width: 0; }
.dsh-wb-design .plugnac-title { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; color: var(--text); padding-right: 2px; white-space: nowrap; }
.dsh-wb-design .plugnac-title svg { width: 15px; height: 15px; color: var(--primary); }
.dsh-wb-design .plugnac-sep { width: 1px; height: 18px; background: var(--line-2); margin: 0 8px; flex: none; }
.dsh-wb-design .plugnac a { height: 30px; padding: 0 11px; display: inline-flex; align-items: center; gap: 6px; border-radius: var(--r-sm); color: var(--text-2); font-size: 13px; white-space: nowrap; }
.dsh-wb-design .plugnac a:hover { background: var(--surface-2); color: var(--text); }
.dsh-wb-design .plugnac a.active { background: var(--surface-3); color: var(--text); font-weight: 600; }
.dsh-wb-design .mindmap { position: relative; padding-left: 26px; }
.dsh-wb-design .mindmap::before { content: ""; position: absolute; left: 9px; top: 8px; bottom: 12px; width: 1px; background: var(--line-2); }
.dsh-wb-design .branch { position: relative; margin-bottom: 16px; }
.dsh-wb-design .branch:last-child { margin-bottom: 0; }
.dsh-wb-design .branch::before { content: ""; position: absolute; left: -17px; top: 28px; width: 17px; height: 1px; background: var(--line-2); }
.dsh-wb-design .branch::after { content: ""; position: absolute; left: -20px; top: 25px; width: 7px; height: 7px; border-radius: 50%; background: var(--bg); border: 1px solid var(--line-3); }
.dsh-wb-design .req-card { border: 1px solid var(--line-2); border-radius: var(--r-md); background: var(--surface); padding: 13px 14px; display: flex; flex-direction: column; gap: 10px; transition: border-color .12s var(--ease); cursor: pointer; }
.dsh-wb-design .req-card:hover { border-color: var(--line-3); }
.dsh-wb-design .req-card .rc-hd { display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .req-card .rc-del { margin-left: auto; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text-3); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.dsh-wb-design .req-card .rc-del:hover { background: var(--red-bg); color: var(--st-block); }
.dsh-wb-design .req-card .rc-code { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); }
.dsh-wb-design .req-card .rc-title { font-size: 14px; font-weight: 600; color: var(--text); display: inline-block; padding: 2px 0; }
.dsh-wb-design .req-card .rc-title:hover { color: var(--primary); }
.dsh-wb-design .req-card .rc-matrix { flex-wrap: wrap; gap: 4px; }
.dsh-wb-design .req-card .rc-ft { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 10px; border-top: 1px dashed var(--line); }
.dsh-wb-design .with-aside { display: grid; grid-template-columns: minmax(0, 1fr) 316px; gap: 22px; align-items: start; }
.dsh-wb-design .aside-col { position: sticky; top: 0; display: flex; flex-direction: column; gap: 14px; }
/* 需求总览是一面扁平的卡片墙：所有卡片同样小，不按区块分组。 */
.dsh-wb-design .cardwall { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; grid-auto-rows: 1fr; }
/* 总述和需求日志并排放在第一行：左边读需求，右边看过程。 */
.dsh-wb-design .req-top { display: grid; grid-template-columns: minmax(0, 2.7fr) minmax(280px, 1fr); gap: 12px; margin-bottom: 12px; align-items: stretch; }
@media (max-width: 1100px) { .dsh-wb-design .req-top { grid-template-columns: minmax(0, 1fr); } }
/* 参与者卡：一人一张（开发按端一张），卡头是角色和人，卡底是他的工作面入口。 */
.dsh-wb-design .pcard { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); padding: 12px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dsh-wb-design .pcard .phead { display: flex; align-items: center; gap: 7px; min-width: 0; }
.dsh-wb-design .pcard .prole { display: inline-flex; align-items: center; gap: 5px; flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 12px; font-weight: 600; color: var(--text-2); }
.dsh-wb-design .pcard .prole svg { width: 13px; height: 13px; flex: none; color: var(--text-3); }
.dsh-wb-design .pcard .assignee { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dsh-wb-design .pcard .pchip { margin-left: auto; flex: none; }
.dsh-wb-design .pcard .pbody { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dsh-wb-design .pcard .pfoot { display: flex; align-items: center; gap: 6px; padding-top: 8px; border-top: 1px solid var(--line); }
.dsh-wb-design .pcard .pact { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border: 0; border-radius: var(--r-xs); background: transparent; color: var(--text-3); font-size: 12px; cursor: pointer; }
.dsh-wb-design .pcard .pact:hover { background: var(--surface-2); color: var(--text); }
.dsh-wb-design .pcard .pact.is-danger { color: var(--text-3); }
.dsh-wb-design .pcard .pact.is-danger:hover { background: var(--red-bg); color: var(--red); }
.dsh-wb-design .pcard .pact:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.dsh-wb-design .pcard .pstat { display: flex; align-items: baseline; gap: 8px; font-size: 12px; color: var(--text-2); }
.dsh-wb-design .pcard .pstat b { font-size: 15px; font-weight: 600; color: var(--text); }
/* 工作面入口：卡片右上角的小图标，悬停才显眼。 */
.dsh-wb-design .pcard .pcorner { flex: none; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--r-xs); background: transparent; color: var(--text-3); cursor: pointer; }
.dsh-wb-design .pcard .pcorner:hover { background: var(--surface-2); color: var(--text); }
.dsh-wb-design .pcard .pcorner:disabled { opacity: .35; cursor: default; background: transparent; color: var(--text-3); }
.dsh-wb-design .pcard .kv2 { display: grid; grid-template-columns: 52px 1fr; gap: 4px 6px; font-size: 12px; }
.dsh-wb-design .pcard .kv2 dt { color: var(--text-3); }
.dsh-wb-design .pcard .kv2 dd { margin: 0; color: var(--text-2); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
/* 待认领的位置：右上角的状态徽标换成可点的「认领」，确认后卡片写成本人。 */
.dsh-wb-design .pcard .pclaim { flex: none; height: 22px; padding: 0 10px; border: 1px solid var(--primary-line); border-radius: 999px; background: var(--primary-bg); color: var(--primary); font-size: 12px; font-weight: 600; line-height: 1; cursor: pointer; transition: background .12s var(--ease), color .12s var(--ease), border-color .12s var(--ease); }
.dsh-wb-design .pcard .pclaim:hover { background: var(--primary); border-color: var(--primary); color: #fff; }
.dsh-wb-design .pcard .pclaim:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.dsh-wb-design .pclaim-error { margin-top: 8px; color: var(--red); }
/* 小卡片头只留图标、标题和徽标；长说明和右侧提示收起来，别把标题挤成两行。 */
.dsh-wb-design .cardwall .dcard2 .ch .t { white-space: nowrap; }
/* 总述卡：标题行只放标题和版本徽标，正文太长时默认收起，需要再展开。 */
.dsh-wb-design .dcard2 .ch .t { flex: none; white-space: nowrap; }
.dsh-wb-design .doc-body { position: relative; }
.dsh-wb-design .doc-body.is-clipped { overflow: hidden; }
.dsh-wb-design .doc-body.is-clipped::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 56px; background: linear-gradient(to bottom, transparent, var(--surface)); pointer-events: none; }
.dsh-wb-design .doc-toggle { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 9px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--text-2); font: inherit; font-size: 12px; line-height: 1; cursor: pointer; white-space: nowrap; }
.dsh-wb-design .doc-toggle:hover { border-color: var(--line-2); background: var(--surface-2); color: var(--text); }
.dsh-wb-design .doc-toggle svg { transition: transform 150ms ease; }
.dsh-wb-design .doc-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
.dsh-wb-design .dcard2 { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); padding: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dsh-wb-design .dcard2 .ch { display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .dcard2 .ch .t { font-size: 13px; font-weight: 600; }
.dsh-wb-design .dcard2 .ch .r { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .dcard2 .ch svg.ic { width: 14px; height: 14px; color: var(--text-3); }
.dsh-wb-design .rail .nav-item.plugin-entry { color: var(--text); }
.dsh-wb-design .rail .nav-item.plugin-entry.active { background: var(--surface-3); }
.dsh-wb-design .modal-host { display: none; }
.dsh-wb-design .modal-host:target { display: flex; position: absolute; inset: 0; background: var(--overlay); align-items: center; justify-content: center; z-index: 60; }
.dsh-wb-design .modal-host .modal { width: 440px; max-width: calc(100% - 40px); }
.dsh-wb-design .modal-close { color: var(--text-3); display: inline-flex; }
.dsh-wb-design .modal-close:hover { color: var(--text); }
.dsh-wb-design .wizard-step { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px dashed var(--line); }
.dsh-wb-design .wizard-step:last-child { border-bottom: 0; }
.dsh-wb-design .wizard-step .no { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line-3); display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 12px; color: var(--text-2); flex: none; }
.dsh-wb-design .wizard-step.done .no { background: #0f6b46; border-color: #0f6b46; color: #fff; }
.dsh-wb-design .wizard-step .c { flex: 1; min-width: 0; }
.dsh-wb-design .wizard-step .c .t { font-size: 13px; font-weight: 500; color: var(--text); }
.dsh-wb-design .wizard-step .c .d { font-size: 12px; color: var(--text-3); margin-top: 2px; }
.dsh-wb-design .platgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.dsh-wb-design .platcard { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); padding: 12px 13px; display: flex; flex-direction: column; gap: 9px; }
.dsh-wb-design .platcard .ph { display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .platcard .ph .pn { font-size: 13px; font-weight: 600; color: var(--text); }
.dsh-wb-design .platcard .ph .dot { width: 8px; height: 8px; border-radius: 2px; background: var(--line-3); }
.dsh-wb-design .platcard .pf { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-3); }
.dsh-wb-design .platcard .pf .assignee .nm { font-size: 12px; }
.dsh-wb-design .platcard .extra { border-top: 1px dashed var(--line); padding-top: 8px; font-size: 12px; color: var(--text-2); display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .platcard .extra svg { width: 12px; height: 12px; color: var(--text-3); }
.dsh-wb-design .platcard.na { opacity: 1; }
.dsh-wb-design .statbar { display: flex; align-items: stretch; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); margin-bottom: 16px; overflow: hidden; }
.dsh-wb-design .statbar .st { flex: 1; padding: 12px 16px; border-right: 1px solid var(--line); min-width: 0; }
.dsh-wb-design .statbar .st:last-child { border-right: 0; }
.dsh-wb-design .statbar .st .lab { font-size: 12px; color: var(--text-3); display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .statbar .st .lab svg { width: 12px; height: 12px; }
.dsh-wb-design .statbar .st .v { font-family: var(--font-mono); font-size: 24px; font-weight: 600; color: var(--text); letter-spacing: -.02em; margin-top: 4px; }
.dsh-wb-design .statbar .st .v small { font-size: 12px; color: var(--text-3); font-family: var(--font-sans); font-weight: 400; margin-left: 5px; }
.dsh-wb-design .statbar .st .d { font-size: 12px; color: var(--text-3); margin-top: 3px; }
.dsh-wb-design .statbar .st .d .up { color: var(--green); }
.dsh-wb-design .rail-ph { flex: 1; min-height: 0; margin: 10px 10px 8px; padding: 12px; border: 1px dashed var(--line-2); border-radius: var(--r-md); background: var(--surface); display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.dsh-wb-design .rail-ph .h { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-3); font-weight: 500; }
.dsh-wb-design .rail-ph .h svg { width: 13px; height: 13px; }
.dsh-wb-design .rail-ph p { margin: 0; font-size: 12px; color: var(--text-3); line-height: var(--lh-body); }
.dsh-wb-design .rail-ph .lines { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
.dsh-wb-design .rail-ph .lines i { height: 9px; border-radius: 3px; background: var(--surface-3); display: block; }
.dsh-wb-design .rail-ph .lines i:nth-child(1) { width: 78%; }
.dsh-wb-design .rail-ph .lines i:nth-child(2) { width: 60%; }
.dsh-wb-design .rail-ph .lines i:nth-child(3) { width: 68%; }
.dsh-wb-design .rail-ph .lines i:nth-child(4) { width: 52%; }
.dsh-wb-design .identity.ph-id { border-style: dashed; background: transparent; }
.dsh-wb-design .identity.ph-id .avatar { background: var(--surface-3); color: var(--text-3); border-color: var(--line-2); }
.dsh-wb-design .conv-ph { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; }
.dsh-wb-design .conv-ph .ico { width: 44px; height: 44px; border-radius: var(--r-md); border: 1px dashed var(--line-2); background: var(--surface); display: flex; align-items: center; justify-content: center; color: var(--text-3); margin-bottom: 14px; }
.dsh-wb-design .conv-ph .ico svg { width: 22px; height: 22px; }
.dsh-wb-design .conv-ph .t { font-size: 14px; color: var(--text); font-weight: 500; margin-bottom: 5px; }
.dsh-wb-design .conv-ph .d { font-size: 12px; color: var(--text-3); max-width: 34ch; line-height: var(--lh-body); }
.dsh-wb-design .dsr { display: flex; flex-direction: column; height: 100%; }
.dsh-wb-design .dsr-head { height: 44px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 14px; border-bottom: 1px solid var(--line); }
.dsh-wb-design .dsr-head .t { font-size: 13px; font-weight: 600; color: var(--text); }
.dsh-wb-design .dsr-head .r { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .dsr-body { flex: 1; min-height: 0; overflow: auto; padding: 14px; display: flex; flex-direction: column; }
.dsh-wb-design .dsr-note { border: 1px dashed var(--line-2); border-radius: var(--r-sm); padding: 9px 11px; font-size: 12px; color: var(--text-3); line-height: var(--lh-body); margin-bottom: 14px; }
.dsh-wb-design .dsr-tools { display: flex; flex-direction: column; gap: 8px; }
.dsh-wb-design .dsr-tool { display: flex; align-items: center; gap: 11px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); font-size: 13px; color: var(--text-2); }
.dsh-wb-design .dsr-tool .ic { width: 18px; height: 18px; color: var(--text-3); flex: none; }
.dsh-wb-design .dsr-tool .k { margin-left: auto; font-family: var(--font-mono); font-size: 12px; color: var(--text-3); }
.dsh-wb-design .dsr-tool.ph { border-style: dashed; color: var(--text-3); }
@media (max-width: 1180px){
.dsh-wb-design { --rail-w: 208px; --rpanel-w: 336px; }
}
.dsh-wb-design .dsh-wb-drawer-toggles{display:none}
@media (max-width: 980px){
.dsh-wb-design .win, .dsh-wb-design .win.has-panel { grid-template-columns: minmax(0, 1fr); }
.dsh-wb-design .dsh-wb-drawer-toggles{display:flex;gap:6px;margin-right:8px}
.dsh-wb-drawer-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text-2);cursor:pointer}
.dsh-wb-design .rail,.dsh-wb-design .rpanel{position:fixed;top:0;bottom:0;z-index:70;display:flex;transition:transform var(--dur-2,180ms) var(--ease,ease);box-shadow:0 0 0 1px var(--line),0 20px 60px rgba(0,0,0,.4)}
.dsh-wb-design .rail{left:0;transform:translateX(-102%)}
.dsh-wb-design .rpanel{right:0;transform:translateX(102%)}
.dsh-wb-design.drawer-left-open .rail{transform:translateX(0)}
.dsh-wb-design.drawer-right-open .rpanel{transform:translateX(0)}
.dsh-wb-design .topbar { flex-wrap: wrap; height: auto; min-height: 52px; padding: 10px 20px; }
.dsh-wb-design .plugnac { flex-wrap: wrap; row-gap: 4px; }
.dsh-wb-design .page-head { flex-wrap: wrap; }
.dsh-wb-design .page-title { font-size: 20px; }
.dsh-wb-design .kpis, .dsh-wb-design .state-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dsh-wb-design .cardwall { grid-template-columns: 1fr; }
.dsh-wb-design .dcard2.span2 { grid-column: auto; }
.dsh-wb-design .platgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dsh-wb-design .two-col, .dsh-wb-design .with-aside, .dsh-wb-design .skill-layout, .dsh-wb-design .settings-layout, .dsh-wb-design .form-grid { grid-template-columns: 1fr; }
.dsh-wb-design .aside-col, .dsh-wb-design .set-nav { position: static; }
.dsh-wb-design .set-nav { flex-direction: row; flex-wrap: wrap; }
.dsh-wb-design .witem { flex-wrap: wrap; }
.dsh-wb-design .statbar { flex-wrap: wrap; }
.dsh-wb-design .statbar .st { flex: 1 1 45%; border-right: 0; border-bottom: 1px solid var(--line); }
.dsh-wb-design .statbar .st:nth-child(odd) { border-right: 1px solid var(--line); }
.dsh-wb-design .modal-host .modal { width: calc(100% - 32px); }
}
.dsh-wb-design .mxg { display: inline-flex; align-items: center; gap: 3px; border: 1px solid var(--line-2); border-radius: var(--r-xs); padding: 1px 4px 1px 6px; background: var(--surface-2); }
.dsh-wb-design .mxg .gl2 { font-size: 12px; color: var(--text-3); margin-right: 2px; }
.dsh-wb-design .mxg .chip { height: 18px; padding: 0 5px; }
.dsh-wb-design .mna2 { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: var(--r-xs); border: 1px dashed var(--line-2); color: var(--text-3); font-size: 12px; }
.dsh-wb-design .ds-ctx { margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--primary-line); border-radius: var(--r-sm); background: var(--primary-bg); }
.dsh-wb-design .ds-ctx .l1 { display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .ds-ctx .l1 .code { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); }
.dsh-wb-design .ds-ctx .l1 .nm { font-size: 13px; font-weight: 600; color: var(--text); }
.dsh-wb-design .ds-ctx .l2 { font-size: 12px; color: var(--text-2); margin-top: 4px; }
.dsh-wb-design .endsec { margin-bottom: 20px; }
.dsh-wb-design .endsec-h { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.dsh-wb-design .endsec-h .t { font-size: 13px; font-weight: 600; }
.dsh-wb-design .endsec-h .n { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); }
.dsh-wb-design .egrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 12px; }
.dsh-wb-design .endcard2 { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); padding: 13px; display: flex; flex-direction: column; gap: 9px; }
.dsh-wb-design .endcard2 .eh { display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .endcard2 .eh .nm { font-size: 13px; font-weight: 600; color: var(--text); }
.dsh-wb-design .endcard2 .eh .st { margin-left: auto; }
.dsh-wb-design .endcard2 .kv2 { display: grid; grid-template-columns: 62px 1fr; gap: 5px 8px; font-size: 12px; }
.dsh-wb-design .endcard2 .kv2 dt { color: var(--text-3); }
.dsh-wb-design .endcard2 .kv2 dd { margin: 0; color: var(--text-2); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.dsh-wb-design .endcard2 .risk { font-size: 12px; color: var(--amber); display: flex; align-items: center; gap: 5px; }
.dsh-wb-design .endcard2 .foot { display: flex; align-items: center; gap: 8px; border-top: 1px dashed var(--line); padding-top: 9px; margin-top: 1px; }
.dsh-wb-design .endcard2 .foot .upd { font-size: 12px; color: var(--text-3); margin-left: auto; }
.dsh-wb-design .dsh-wb-mrlink { display: inline-flex; align-items: center; gap: 3px; color: var(--primary); font-size: 12px; text-decoration: none; }
.dsh-wb-design .dsh-wb-mrlink:hover { text-decoration: underline; }
.dsh-wb-design .dsh-wb-branch { font-family: var(--font-mono,ui-monospace,SFMono-Regular,monospace); font-size: 12px; color: var(--text-3); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-wb-design .narep { border: 1px dashed var(--line-2); border-radius: var(--r-md); padding: 11px 13px; font-size: 12px; color: var(--text-3); display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .narep svg { width: 14px; height: 14px; }
.dsh-wb-design .ob { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); padding: 40px 24px; overflow: auto; }
.dsh-wb-design .ob-card { width: 100%; max-width: 620px; }
.dsh-wb-design .ob-brand { display: flex; align-items: center; gap: 9px; justify-content: center; margin-bottom: 18px; }
.dsh-wb-design .ob-brand .logo-name { font-size: 14px; font-weight: 600; }
.dsh-wb-design .ob-steps { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 18px; }
.dsh-wb-design .ob-steps .s { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-3); }
.dsh-wb-design .ob-steps .s .dot { width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--line-3); display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 12px; }
.dsh-wb-design .ob-steps .s.active { color: var(--text); }
.dsh-wb-design .ob-steps .s.active .dot { background: var(--primary-strong); border-color: var(--primary-strong); color: #fff; }
.dsh-wb-design .ob-steps .s.done .dot { background: #0f6b46; border-color: #0f6b46; color: #fff; }
.dsh-wb-design .ob-steps .line { width: 24px; height: 1px; background: var(--line-2); }
.dsh-wb-design .ob-panel { border: 1px solid var(--line-2); border-radius: var(--r-lg); background: var(--surface); padding: 22px 24px; }
.dsh-wb-design .ob-panel h1 { font-size: 19px; font-weight: 600; margin: 0 0 4px; }
.dsh-wb-design .ob-panel .sub { font-size: 12px; color: var(--text-3); margin-bottom: 18px; }
.dsh-wb-design .ob-foot { display: flex; align-items: center; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); }
.dsh-wb-design .ob-foot .spacer { flex: 1; }
.dsh-wb-design .ob-summary { display: grid; grid-template-columns: 96px 1fr; gap: 9px 12px; font-size: 13px; }
.dsh-wb-design .ob-summary dt { color: var(--text-3); }
.dsh-wb-design .ob-summary dd { margin: 0; color: var(--text); }
@media (max-width: 980px){
.dsh-wb-design .egrid { grid-template-columns: 1fr; }
}
.dsh-wb-design .ptog { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface); font-size: var(--fs-12); color: var(--text-2); cursor: pointer; }
.dsh-wb-design .ptog .box { width: 13px; height: 13px; border-radius: 3px; border: 1.5px solid var(--line-3); display: flex; align-items: center; justify-content: center; }
.dsh-wb-design .ptog.on { border-color: var(--primary-line); background: var(--primary-bg); color: var(--text); }
.dsh-wb-design .ptog.on .box { background: var(--primary); border-color: var(--primary); }
.dsh-wb-design .ptog.on .box::after { content: ""; width: 5px; height: 8px; border: solid #0e1424; border-width: 0 2px 2px 0; transform: rotate(45deg); margin-top: -2px; }
.dsh-wb-design .radio-row { display: flex; gap: 10px; flex-wrap: wrap; }
.dsh-wb-design .radio-card { flex: 1; min-width: 190px; border: 1px solid var(--line-2); border-radius: var(--r-sm); padding: 11px 12px; cursor: pointer; }
.dsh-wb-design .radio-card.sel { border-color: var(--primary-line); background: var(--primary-bg); box-shadow: 0 0 0 1px var(--primary-line); }
.dsh-wb-design .radio-card .rt { display: flex; align-items: center; gap: 8px; font-size: var(--fs-13); font-weight: var(--fw-med); color: var(--text); }
.dsh-wb-design .radio-card .rd { font-size: var(--fs-12); color: var(--text-3); margin-top: 5px; line-height: var(--lh-snug); }
.dsh-wb-design .radio-card .r { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--line-3); flex: none; display: flex; align-items: center; justify-content: center; }
.dsh-wb-design .radio-card.sel .r { border-color: var(--primary); }
.dsh-wb-design .radio-card.sel .r::after { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
.dsh-wb-design .path-box { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border: 1px solid var(--line-2); border-radius: var(--r-sm); background: var(--surface-2); }
.dsh-wb-design .path-box .p { font-family: var(--font-mono); font-size: var(--fs-12); color: var(--text); flex: 1; }
/* page: iteration-detail */
.dsh-wb-design .head-card { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
.dsh-wb-design .head-card .lft { min-width: 0; flex: 1; }
.dsh-wb-design .head-card .code-line { display: flex; align-items: center; gap: 10px; }
.dsh-wb-design .head-card .code-line .code { font-family: var(--font-mono); font-size: 14px; color: var(--text-3); display: inline-flex; align-items: center; min-height: 24px; }
.dsh-wb-design .head-card h1 { font-size: 22px; font-weight: 600; letter-spacing: -.01em; margin: 3px 0 8px; }
.dsh-wb-design .head-meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--text-3); }
.dsh-wb-design .head-meta .it { display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .head-meta b { color: var(--text-2); font-weight: 500; }
.dsh-wb-design .tl-head { display: grid; grid-template-columns: 104px 1fr 92px; gap: 12px; font-size: 12px; color: var(--text-3); font-family: var(--font-mono); margin-bottom: 4px; }
.dsh-wb-design .tl-head .axis { display: flex; justify-content: space-between; }
.dsh-wb-design .tl-wrap { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); padding: 14px 16px; margin-bottom: 22px; }
.dsh-wb-design .summary-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
/* page: requirement-full */
.dsh-wb-design .rf-head { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.dsh-wb-design .rf-head .lft { flex: 1; min-width: 0; }
.dsh-wb-design .rf-head .l1 { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.dsh-wb-design .rf-head .l1 .code { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); }
.dsh-wb-design .rf-head h1 { font-size: 22px; font-weight: 600; letter-spacing: -.01em; margin: 2px 0 10px; }
.dsh-wb-design .rf-meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--text-3); }
.dsh-wb-design .rf-meta .it { display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .rf-meta b { color: var(--text-2); font-weight: 500; }
.dsh-wb-design .spec-line { font-size: 13px; color: var(--text-2); line-height: var(--lh-loose); }
.dsh-wb-design .spec-line b { color: var(--text); font-weight: 500; }
/* 原型版本：只有提交需求时才会新增；「最新」是当前工作区里的原型。 */
.dsh-wb-design .pcard .pfoot.is-vers { display: block; padding-top: 6px; }
.dsh-wb-design .vf-head { display: flex; align-items: center; gap: 6px; width: 100%; height: 26px; padding: 0; border: 0; background: transparent; color: var(--text-3); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-wb-design .vf-head .ic { color: var(--text-4); }
.dsh-wb-design .vf-head:hover, .dsh-wb-design .vf-head:hover .ic { color: var(--text); }
.dsh-wb-design .vf-count { color: var(--text-4); font-size: 11px; }
.dsh-wb-design .vf-on { color: var(--primary-ink); background: var(--primary-bg); border-radius: 5px; padding: 1px 6px; font-size: 11px; }
.dsh-wb-design .vf-chev { margin-left: auto; color: var(--text-4); transition: transform .18s ease; }
.dsh-wb-design .vf:not(.is-open) .vf-chev { transform: rotate(-90deg); }
.dsh-wb-design .vf-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .18s ease; overflow-anchor: none; }
.dsh-wb-design .vf.is-open .vf-wrap { grid-template-rows: 1fr; }
.dsh-wb-design .vf-clip { min-height: 0; overflow: hidden; }
.dsh-wb-design .vf-list { display: flex; flex-direction: column; gap: 1px; padding: 2px 0 2px; }
.dsh-wb-design .vf-row { display: flex; align-items: center; border-radius: var(--r-xs); }
.dsh-wb-design .vf-row:hover { background: var(--surface-2); }
.dsh-wb-design .vf-row.is-on { background: var(--primary-bg); }
.dsh-wb-design .vf-pick { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; height: 29px; padding: 0 6px; border: 0; border-radius: var(--r-xs); background: transparent; color: var(--text-3); font: inherit; text-align: left; cursor: pointer; }
.dsh-wb-design .vf-tag { min-width: 30px; text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--text-2); background: var(--surface-2); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
.dsh-wb-design .vf-row.is-on .vf-tag { color: var(--primary-ink); border-color: var(--primary-line); background: var(--surface); }
.dsh-wb-design .vf-meta { font-size: 11px; color: var(--text-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-wb-design .vf-open { display: inline-flex; align-items: center; gap: 4px; height: 22px; margin-right: 4px; padding: 0 7px; border: 0; border-radius: var(--r-xs); background: transparent; color: var(--text-4); font: inherit; font-size: 11px; cursor: pointer; }
.dsh-wb-design .vf-row:hover .vf-open, .dsh-wb-design .vf-row.is-on .vf-open { color: var(--text-2); }
.dsh-wb-design .vf-open:hover { color: var(--text); background: var(--surface-3, var(--surface-2)); }
.dsh-wb-design .shot3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.dsh-wb-design .shot { border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; background: var(--surface-2); }
.dsh-wb-design .shot .img { height: 60px; background: linear-gradient(var(--line) 1px,transparent 1px) 0 0/100% 16px, linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/16px 100%, var(--surface-2); display: flex; align-items: center; justify-content: center; }
.dsh-wb-design .shot .img.is-live { position: relative; display: block; height: 78px; overflow: hidden; background: #fff; }
.dsh-wb-design .shot .img.is-live img { display: block; width: 100%; height: 100%; object-fit: cover; }
.dsh-wb-design .shot .img .dsh-wb-shot-frame { position: absolute; inset: 0; overflow: hidden; }
.dsh-wb-design .shot .img .dsh-wb-shot-frame iframe { display: block; border: 0; background: #fff; transform-origin: top left; pointer-events: none; }
.dsh-wb-design .shot .shot-open { position: absolute; inset: 0; z-index: 2; display: block; }
.dsh-wb-design .shot .img .wf { width: 48px; height: 36px; border: 1px solid var(--line-3); border-radius: 4px; background: var(--surface); display: flex; flex-direction: column; gap: 3px; padding: 5px; }
.dsh-wb-design .shot .img .wf i { height: 4px; background: var(--line-3); border-radius: 2px; display: block; }
.dsh-wb-design .shot .img .wf i:first-child { width: 50%; height: 6px; background: var(--primary-line); }
.dsh-wb-design .shot .cap { padding: 5px 7px; font-size: 12px; color: var(--text-2); display: flex; align-items: center; gap: 5px; border-top: 1px solid var(--line); }
.dsh-wb-design .shot .cap .shot-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-wb-design .shot .cap .shot-link { flex: none; margin-left: auto; color: var(--primary); font-size: 12px; text-decoration: none; }
.dsh-wb-design .shot .cap .shot-link:hover { text-decoration: underline; }
.dsh-wb-design .shot .shot-note { padding: 0 7px 7px; font-size: 12px; line-height: 1.45; color: var(--text-3); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.dsh-wb-design a.btn { text-decoration: none; }
.dsh-wb-design .vline { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 12px; }
.dsh-wb-design .vline:last-child { border-bottom: 0; }
.dsh-wb-design .vline .v { font-family: var(--font-mono); color: var(--text-2); width: 26px; }
.dsh-wb-design .vline .d { color: var(--text-3); }
.dsh-wb-design .sub-label { font-size: 12px; color: var(--text-3); margin: 12px 0 8px; display: flex; align-items: center; gap: 6px; }
/* page: my-workbench */
.dsh-wb-design .worklist { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); overflow: hidden; }
.dsh-wb-design .witem { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
.dsh-wb-design .witem:last-child { border-bottom: 0; }
.dsh-wb-design .witem:hover { background: var(--surface-2); }
.dsh-wb-design .witem .wcode { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); width: 72px; flex: none; }
.dsh-wb-design .witem .wmain { flex: 1; min-width: 0; }
.dsh-wb-design .witem .wname { font-size: 13px; font-weight: 600; color: var(--text); display: inline-block; padding: 2px 0; }
.dsh-wb-design .witem .wname:hover { color: var(--primary); }
.dsh-wb-design .witem .wsub { font-size: 12px; color: var(--text-3); margin-top: 2px; }
.dsh-wb-design .witem .wroles { display: flex; gap: 4px; flex: none; }
.dsh-wb-design .witem .wstat { flex: none; }
.dsh-wb-design .witem .wtodo { flex: none; }
.dsh-wb-design .witem .wgo { flex: none; }
.dsh-wb-design .filter-note { font-size: 12px; color: var(--text-3); margin: -2px 0 14px; }
/* page: notifications */
.dsh-wb-design .notif { display: flex; align-items: flex-start; gap: 12px; padding: 13px 16px; border-bottom: 1px solid var(--line); position: relative; }
.dsh-wb-design .notif:last-child { border-bottom: 0; }
.dsh-wb-design .notif.unread { background: var(--primary-bg); }
.dsh-wb-design .notif.unread::before { content: ""; position: absolute; left: 6px; top: 50%; transform: translateY(-50%); width: 5px; height: 5px; border-radius: 50%; background: var(--primary); }
.dsh-wb-design .notif .ico { width: 30px; height: 30px; border-radius: var(--r-sm); background: var(--surface-2); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--text-2); flex: none; }
.dsh-wb-design .notif .ico svg { width: 15px; height: 15px; }
.dsh-wb-design .notif .c { flex: 1; min-width: 0; }
.dsh-wb-design .notif .c .t { font-size: var(--fs-13); color: var(--text); line-height: var(--lh-snug); }
.dsh-wb-design .notif .c .t b { font-weight: var(--fw-semi); }
.dsh-wb-design .notif .c .s { font-size: var(--fs-11); color: var(--text-3); margin-top: 4px; display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .notif .rt { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; flex: none; }
.dsh-wb-design .notif .rt .time { font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); }
.dsh-wb-design .sim { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); padding: 13px 14px; margin-bottom: 18px; }
.dsh-wb-design .sim .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.dsh-wb-design .sim .hd .t { font-size: var(--fs-12); font-weight: var(--fw-semi); color: var(--text); }
.dsh-wb-design .sim .btns { display: flex; gap: 8px; flex-wrap: wrap; }
/* page: settings */
.dsh-wb-design .settings-layout { display: grid; grid-template-columns: 190px minmax(0,1fr); gap: 26px; align-items: start; }
.dsh-wb-design .set-nav { position: sticky; top: 0; display: flex; flex-direction: column; gap: 1px; }
.dsh-wb-design .set-nav a { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--r-sm); font-size: var(--fs-12); color: var(--text-2); }
.dsh-wb-design .set-nav a:hover { background: var(--surface-2); color: var(--text); }
.dsh-wb-design .set-nav a svg { width: 15px; height: 15px; color: var(--text-3); }
.dsh-wb-design .set-sec { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); margin-bottom: 16px; }
.dsh-wb-design .set-sec-hd { padding: 13px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .set-sec-hd .t { font-size: var(--fs-13); font-weight: var(--fw-semi); }
.dsh-wb-design .set-sec-hd .d { font-size: var(--fs-11); color: var(--text-3); margin-left: 8px; }
.dsh-wb-design .set-sec-bd { padding: 14px 16px; }
.dsh-wb-design .radio-card .rd { font-size: var(--fs-11); color: var(--text-3); margin-top: 5px; line-height: var(--lh-snug); }
/* page: skill-library */
.dsh-wb-design .skill-layout { display: grid; grid-template-columns: 372px minmax(0,1fr); gap: 20px; align-items: start; }
.dsh-wb-design .skill-list { display: flex; flex-direction: column; gap: 8px; }
.dsh-wb-design .srow { display: flex; align-items: flex-start; gap: 11px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); cursor: pointer; transition: border-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease); }
.dsh-wb-design .srow:hover { border-color: var(--line-3); background: var(--surface-2); }
.dsh-wb-design .srow.sel { border-color: var(--primary-line); background: var(--primary-bg); box-shadow: 0 0 0 1px var(--primary-line); }
.dsh-wb-design .srow .ic-badge { width: 30px; height: 30px; border-radius: var(--r-sm); background: var(--primary-bg); border: 1px solid var(--primary-line); color: var(--primary); display: flex; align-items: center; justify-content: center; flex: none; }
.dsh-wb-design .srow .ic-badge svg { width: 16px; height: 16px; }
.dsh-wb-design .srow .mid { flex: 1; min-width: 0; }
.dsh-wb-design .srow .mid .nm { font-size: var(--fs-13); font-weight: var(--fw-med); color: var(--text); display: flex; align-items: center; gap: 6px; }
.dsh-wb-design .srow .mid .sub { font-size: var(--fs-11); color: var(--text-3); margin-top: 3px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.dsh-wb-design .srow .mid .sub .sep { color: var(--text-3); }
.dsh-wb-design .detail { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); }
.dsh-wb-design .detail-hd { padding: 14px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; gap: 12px; }
.dsh-wb-design .detail-hd .ic-badge { width: 40px; height: 40px; border-radius: var(--r-md); background: var(--primary-bg); border: 1px solid var(--primary-line); color: var(--primary); display: flex; align-items: center; justify-content: center; flex: none; }
.dsh-wb-design .detail-hd .ic-badge svg { width: 21px; height: 21px; }
.dsh-wb-design .detail-hd h2 { font-size: var(--fs-16); font-weight: var(--fw-semi); margin: 0; display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .detail-hd .sub { font-size: var(--fs-12); color: var(--text-3); margin-top: 4px; }
.dsh-wb-design .detail-bd { padding: 16px; }
.dsh-wb-design .detail-sec { margin-bottom: 20px; }
.dsh-wb-design .detail-sec .h { font-size: var(--fs-11); color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-family: var(--font-mono); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.dsh-wb-design .detail-sec .h .r { margin-left: auto; }
.dsh-wb-design .code-block { border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--bg); overflow: hidden; }
.dsh-wb-design .code-block .cb-h { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 12px; color: var(--text-3); background: var(--bg-elev); }
.dsh-wb-design .code-block pre { margin: 0; padding: 10px 12px; font-family: var(--font-mono); font-size: 12px; line-height: 1.65; color: var(--text-2); overflow: auto; white-space: pre; }
.dsh-wb-design .code-block pre .k { color: var(--primary); }
.dsh-wb-design .code-block pre .c { color: var(--text-3); }
.dsh-wb-design .chg-item { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px dashed var(--line); font-size: 12px; }
.dsh-wb-design .chg-item:last-child { border-bottom: 0; }
.dsh-wb-design .chg-item .v { font-family: var(--font-mono); color: var(--text-2); flex: none; width: 36px; }
.dsh-wb-design .chg-item .t { color: var(--text-3); }
.dsh-wb-design .chg-item .d { color: var(--text-2); }

/* ---- workbench plugin shell ---- */
.dsh-wb-design{position:relative;flex:1 1 auto;min-height:0;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font-sans);font-size:13px;line-height:var(--lh-body)}
.dsh-wb-design .shell{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--bg)}
.dsh-wb-design .shell > .topbar{flex:none}
.dsh-wb-design .dsh-wb-shell-body{display:flex;flex:1;min-height:0;min-width:0}
.dsh-wb-design .dsh-wb-shell-body > .scroll{flex:1;min-width:0;min-height:0;overflow:auto}
.dsh-wb-design .page{margin:0;width:100%;max-width:none}
/* 画布页右侧的常驻会话坞：嵌入真实 DSH 会话，随需求切换。 */
.dsh-wb-design .dsh-wb-dock{position:relative;width:400px;min-width:280px;max-width:62%;flex:none;display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--line-2);background:var(--bg-elev)}
.dsh-wb-design .dsh-wb-dock-resize{position:absolute;left:-4px;top:0;bottom:0;width:8px;z-index:6;cursor:col-resize;touch-action:none}
.dsh-wb-design .dsh-wb-dock-resize::after{content:'';position:absolute;left:3px;top:0;bottom:0;width:1px;background:transparent;transition:background .15s}
.dsh-wb-design .dsh-wb-dock-resize:hover::after,.dsh-wb-design .dsh-wb-dock-resize:active::after{background:var(--primary-line,var(--line-3))}
.dsh-wb-design .dsh-wb-dock-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.dsh-wb-design .dsh-wb-dock-body > *{flex:1;min-height:0;min-width:0}
.dsh-wb-design .dsh-wb-dock-body [data-conversation-content]{height:100%}
.dsh-wb-design .dsh-wb-dock-msg{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:18px 16px;font-size:12px;color:var(--text-3);line-height:1.6}
.dsh-wb-design .dsh-wb-dock-toggle{height:28px;padding:0 9px;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:transparent;color:var(--text-2);font:inherit;font-size:var(--fs-12);cursor:pointer}
.dsh-wb-design .dsh-wb-dock-toggle:hover{background:var(--surface-2);color:var(--text)}
.dsh-wb-design .dsh-wb-dock-toggle.is-on{border-color:var(--primary-line,var(--line-2));color:var(--text);background:var(--surface-2)}
/* 中栏工作画布：会话在右边说话，原型/设计稿在这一栏实时出图。 */
.dsh-wb-design .scroll.is-stage{display:flex;flex-direction:column;overflow:hidden}
.dsh-wb-design .dsh-wb-stage{flex:1;min-height:0;display:flex;flex-direction:column}
.dsh-wb-design .dsh-wb-stage-body{flex:1;min-height:0;display:flex;flex-direction:column}
.dsh-wb-design .dsh-wb-stage-body > .dsh-wb-canvas-pane{flex:1;min-height:0}
/* 非产品负责人看原型画布：同一个画布，只读——收起编辑工具坞、屏头操作和右上导出/外观。 */
.dsh-wb-design .dsh-wb-canvas-readonly .ddp-dock,
.dsh-wb-design .dsh-wb-canvas-readonly .ddp-act,
.dsh-wb-design .dsh-wb-canvas-readonly .ddp-take,
.dsh-wb-design .dsh-wb-canvas-readonly .ddp-top .tr{display:none}
/* 画布工具栏和工作台上导航共用一块底板：铺满整行、同样的底色和分隔线，不再浮成深色胶囊。 */
.dsh-wb-stage .ddp-top{left:0;right:0;top:0;align-items:center;padding:6px 20px;background:color-mix(in srgb,var(--bg) 86%,transparent);border-bottom:1px solid var(--line);backdrop-filter:blur(8px);z-index:12}
.dsh-wb-stage .ddp-top>.ddp-isl{background:transparent;box-shadow:none;padding:0;border-radius:0;gap:2px}
.dsh-wb-stage .ddp-top>.ddp-isl .ddp-btn{height:30px;padding:0 8px;border-radius:var(--r-sm)}
.dsh-wb-design .topbar{position:relative;z-index:20}
/* DSH 侧栏收起后插件贴住窗口左边：顶栏让开 macOS 红绿灯和宿主的展开/新建按钮，
   背景透明、指针穿透，让宿主那组按钮露出来且点得到。 */
.dsh-wb-design.is-flush-left .topbar{padding-left:var(--dsh-safe-left, 180px);background:transparent;backdrop-filter:none;pointer-events:none}
.dsh-wb-design.is-flush-left .topbar > *{pointer-events:auto}
.dsh-wb-design .topbar .plugnac{display:flex;align-items:center;gap:7px;min-width:0;overflow:visible}
.dsh-wb-design .plugnac-title{display:inline-flex;align-items:center;gap:7px;font-size:var(--fs-13);font-weight:var(--fw-semi);color:var(--text);white-space:nowrap}
.dsh-wb-design .plugnac-title svg{width:16px;height:16px;color:var(--text-2)}
.dsh-wb-design .plugnac-sep{width:1px;height:16px;background:var(--line-2);margin:0 4px;flex:none}
.dsh-wb-design .plugnac a{height:30px;display:inline-flex;align-items:center;padding:0 9px;border-radius:var(--r-sm);font-size:var(--fs-12);color:var(--text-2);white-space:nowrap;cursor:pointer}
.dsh-wb-design .plugnac a:hover{background:var(--surface-2);color:var(--text)}
.dsh-wb-design .plugnac a.active{background:var(--surface-2);color:var(--text);font-weight:var(--fw-med)}
/* 项目切换：顶栏品牌位就是入口，下拉里切项目、建项目、改名字。 */
.dsh-wb-design .plugnac-project{position:relative;flex:none}
.dsh-wb-design .plugnac-project-btn{border:1px solid transparent;background:transparent;border-radius:var(--r-sm);height:32px;padding:0 8px;font:inherit;cursor:pointer;max-width:260px}
.dsh-wb-design .plugnac-project-btn:hover{background:var(--surface-2);border-color:var(--line)}
.dsh-wb-design .plugnac-project-btn.is-open{background:var(--surface-2);border-color:var(--line-2)}
.dsh-wb-design .plugnac-project-btn .plugnac-project-name{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-design .plugnac-project-btn .chev{width:13px;height:13px;color:var(--text-3);flex:none;transition:transform .16s ease}
.dsh-wb-design .plugnac-project-btn.is-open .chev{transform:rotate(180deg)}
.dsh-wb-design .dsh-wb-project-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:71;width:300px;padding:6px;border:1px solid var(--line-2);border-radius:var(--r-md);background:var(--surface);box-shadow:var(--shadow-2);display:flex;flex-direction:column;gap:2px}
.dsh-wb-design .dsh-wb-project-menu-head{padding:6px 9px 4px;font-size:var(--fs-11);color:var(--text-3);display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsh-wb-design .dsh-wb-project-item{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 9px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--text-2);font:inherit;font-size:var(--fs-12);text-align:left;cursor:pointer}
.dsh-wb-design .dsh-wb-project-item:hover{background:var(--surface-2);color:var(--text)}
.dsh-wb-design .dsh-wb-project-item.is-current{background:var(--surface-2);color:var(--text);font-weight:var(--fw-med)}
.dsh-wb-design .dsh-wb-project-check{width:14px;height:14px;flex:none;color:var(--primary)}
.dsh-wb-design .dsh-wb-project-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-design .dsh-wb-project-count{font-size:12px;color:var(--text-3);white-space:nowrap}
.dsh-wb-design .dsh-wb-project-menu-sep{height:1px;background:var(--line);margin:4px 2px;flex:none}
.dsh-wb-design .dsh-wb-project-action{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 9px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--text-2);font:inherit;font-size:var(--fs-12);text-align:left;cursor:pointer}
.dsh-wb-design .dsh-wb-project-action:hover{background:var(--surface-2);color:var(--text)}
.dsh-wb-design .dsh-wb-project-action svg{width:14px;height:14px;color:var(--text-3)}
.dsh-wb-design .dsh-wb-project-menu-empty{padding:10px;color:var(--text-3);font-size:12px}
.dsh-wb-design .topbar .avatar{margin-right:2px}
.dsh-wb-design .topbar .identity{cursor:pointer;border:1px solid transparent;padding:3px 7px;border-radius:var(--r-sm);background:transparent}
.dsh-wb-design .topbar .identity:hover{background:var(--surface-2);border-color:var(--line)}
.dsh-wb-design .nav-link{position:relative}
.dsh-wb-design .toast-region{position:fixed;right:20px;bottom:20px;z-index:80;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.dsh-wb-design .wb-toast{display:flex;align-items:center;gap:10px;min-height:38px;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);box-shadow:var(--shadow-2);color:var(--text);font-size:12px;pointer-events:auto}
.dsh-wb-design .wb-toast.error{border-color:var(--red-line);background:var(--red-bg);color:var(--st-block)}
.dsh-wb-design .wb-toast button{border:0;background:transparent;color:inherit;font-size:16px;line-height:1;cursor:pointer;padding:2px;opacity:.7}
.dsh-wb-design .wb-toast button:hover{opacity:1}
.dsh-wb-design .empty-page{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:64px 20px;border:1px dashed var(--line-2);border-radius:var(--r-md);background:var(--surface);color:var(--text-3);font-size:12px;text-align:center}
.dsh-wb-design .empty-page svg{width:28px;height:28px;color:var(--text-3);opacity:.8}
.dsh-wb-design .empty-page b{font-size:14px;color:var(--text-2);font-weight:var(--fw-med)}
.dsh-wb-design .table tbody tr{cursor:pointer}
.dsh-wb-design .table tbody tr:hover{background:var(--surface-2)}
.dsh-wb-design .kpi.clickable,.dsh-wb-design .st.clickable{cursor:pointer}
.dsh-wb-design .kpi.clickable:hover,.dsh-wb-design .st.clickable:hover{border-color:var(--line-3);background:var(--surface-2)}
.dsh-wb-design .progress span{transition:width .3s var(--ease)}
.dsh-wb-design .mono{font-family:var(--font-mono)}
.dsh-wb-design .muted{color:var(--text-3)}
.dsh-wb-design .tiny{font-size:var(--fs-11)}
.dsh-wb-design .row{display:flex;align-items:center}
.dsh-wb-design .col{display:flex;flex-direction:column}
.dsh-wb-design .wrap{flex-wrap:wrap}
.dsh-wb-design .gap-2{gap:var(--sp-2)}
.dsh-wb-design .gap-3{gap:var(--sp-3)}
.dsh-wb-design .gap-4{gap:var(--sp-4)}
.dsh-wb-design .spacer{flex:1}
.dsh-wb-design .chip .gl{font-size:10px;line-height:1}
.dsh-wb-design .assignee{display:inline-flex;align-items:center;gap:5px;min-width:0}
.dsh-wb-design .assignee .nm{color:var(--text-2);font-size:var(--fs-12);white-space:nowrap}
.dsh-wb-design .avatar.sm{width:18px;height:18px;font-size:10px}
.dsh-wb-design .avatar{width:22px;height:22px;font-size:11px}
.dsh-wb-design .tl-bar{min-width:2px}
.dsh-wb-design .tl-row .tl-name{white-space:nowrap}
.dsh-wb-design .mindmap .req-card{margin-bottom:10px}
.dsh-wb-design .req-card .rc-title{display:block}
.dsh-wb-design .mxg{display:inline-flex;align-items:center;gap:3px;padding:1px 3px 1px 0;border-radius:4px;background:var(--surface-2);border:1px solid var(--line)}
.dsh-wb-design .mxg .gl2{font-size:10px;color:var(--text-3);padding:0 4px;white-space:nowrap}
.dsh-wb-design .mna2{font-size:10px;color:var(--text-4);white-space:nowrap}
.dsh-wb-design .rc-ft{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0;padding-top:0;border-top:0}
.dsh-wb-design .log-item{display:flex;gap:9px;padding:8px 14px;align-items:flex-start}
.dsh-wb-design .log-item .c{min-width:0;flex:1}
.dsh-wb-design .log-item .l1{font-size:12px;color:var(--text-2);line-height:var(--lh-snug)}
.dsh-wb-design .log-item .l1 b{color:var(--text);font-weight:var(--fw-med)}
.dsh-wb-design .log-item .l2{font-size:12px;color:var(--text-3);margin-top:2px}
.dsh-wb-design .card-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)}
.dsh-wb-design .card-hd .t{font-size:13px;font-weight:var(--fw-semi)}
.dsh-wb-design .card-hd .r{margin-left:auto}
.dsh-wb-design .card-bd{padding:14px}
.dsh-wb-design .aside-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.dsh-wb-design .aside-col .card{padding:0}
.dsh-wb-design .head-meta b{color:var(--text-2);font-weight:var(--fw-med)}
.dsh-wb-design .head-card h1{margin:3px 0 8px}
.dsh-wb-design .head-card .code-line .chip{height:20px}
.dsh-wb-design .tl-head{margin-bottom:2px}
.dsh-wb-design .summary-line{margin-top:12px}
.dsh-wb-design .section-hd{display:flex;align-items:center;gap:8px;margin:18px 0 10px}
.dsh-wb-design .section-hd .t{font-size:14px;font-weight:var(--fw-semi);color:var(--text)}
.dsh-wb-design .section-hd .n{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);font-size:11px;color:var(--text-3);font-family:var(--font-mono)}
.dsh-wb-design .section-hd .r{margin-left:auto;display:flex;align-items:center;gap:8px}
.dsh-wb-design .btn.btn-primary{background:var(--primary-strong);border-color:var(--primary-strong);color:#fff}
.dsh-wb-design .btn.btn-primary:hover{background:var(--primary-strong-h);border-color:var(--primary-strong-h)}
.dsh-wb-design .btn.btn-ghost{background:transparent;border-color:var(--line-2);color:var(--text-2)}
.dsh-wb-design .btn.btn-text{border-color:transparent;background:transparent;color:var(--text-2)}
.dsh-wb-design .badge{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:4px;background:var(--surface-2);border:1px solid var(--line);font-size:10px;color:var(--text-3);white-space:nowrap}
.dsh-wb-design .badge--live{background:var(--green-bg);border-color:var(--green-line);color:var(--st-done)}
.dsh-wb-design .badge--mock{background:var(--amber-bg);border-color:var(--amber-line);color:var(--st-warn)}
.dsh-wb-design .banner{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface-2);font-size:12px;color:var(--text-2);line-height:var(--lh-snug)}
.dsh-wb-design .banner b{color:var(--text);font-weight:var(--fw-med)}
.dsh-wb-design .banner--info{border-color:var(--primary-line);background:var(--primary-bg)}
.dsh-wb-design .banner--mock{border-color:var(--amber-line);background:var(--amber-bg);color:var(--text-2)}
.dsh-wb-design .banner--info svg{color:var(--primary)}
.dsh-wb-design .banner--mock svg{color:var(--amber)}
.dsh-wb-design .tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:14px}
.dsh-wb-design .tabs button{height:34px;padding:0 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--text-3);font-size:12px;cursor:pointer}
.dsh-wb-design .tabs button.active{color:var(--text);border-bottom-color:var(--primary)}
.dsh-wb-design .kv2{display:grid;grid-template-columns:66px 1fr;gap:6px 10px;font-size:12px;color:var(--text-2);margin:0}
.dsh-wb-design .kv2 dt{color:var(--text-3)}
.dsh-wb-design .kv2 dd{margin:0;min-width:0;color:var(--text-2)}
.dsh-wb-design .kv{display:grid;grid-template-columns:66px 1fr;gap:5px 10px;font-size:12px;margin:0}
.dsh-wb-design .kv dt{color:var(--text-3)}
.dsh-wb-design .kv dd{margin:0;color:var(--text-2);display:flex;gap:4px;flex-wrap:wrap;align-items:center}
.dsh-wb-design .rf-meta .chip,.dsh-wb-design .head-meta .chip{height:20px}
.dsh-wb-design .rf-meta .assignee b{color:var(--text-2)}
.dsh-wb-design .dcard2 .ch{min-height:22px;margin-bottom:8px}
/* 端卡片也直接放进卡片墙：没有「涉及端」之类的分组标题。 */
.dsh-wb-design .ob{min-height:100%}
.dsh-wb-design .endcard2{border:1px solid var(--line);border-radius:var(--r-md);background:var(--surface);padding:10px 12px;display:flex;flex-direction:column;gap:7px;height:100%;min-width:0}
.dsh-wb-design .endcard2 .kv2{grid-template-columns:52px 1fr;gap:4px 6px;font-size:12px}
.dsh-wb-design .endcard2 .eh{display:flex;align-items:center;gap:8px}
.dsh-wb-design .endcard2 .eh .nm{font-size:13px;font-weight:var(--fw-semi)}
.dsh-wb-design .endcard2 .eh .st{margin-left:auto}
.dsh-wb-design .endcard2 .foot{display:flex;align-items:center;gap:8px;border-top:1px dashed var(--line);padding-top:9px;margin-top:2px}
.dsh-wb-design .endcard2 .upd{font-size:12px;color:var(--text-3);margin-left:auto}
.dsh-wb-design .endcard2 .risk{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--amber);background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:var(--r-xs);padding:5px 7px}
.dsh-wb-design .narep{display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px dashed var(--line-2);border-radius:var(--r-sm);font-size:12px;color:var(--text-3);margin-top:14px}
.dsh-wb-design .narep svg{width:13px;height:13px}
.dsh-wb-design .spec-line p{margin:0 0 5px}
.dsh-wb-design .spec-line p:last-child{margin-bottom:0}
.dsh-wb-design .req-detail-raw{font-size:12px;color:var(--text-2);line-height:var(--lh-body)}
.dsh-wb-design .req-detail-raw h3,.dsh-wb-design .req-detail-raw h4{color:var(--text);margin:14px 0 6px;font-size:13px}
.dsh-wb-design .req-detail-raw p{margin:0 0 7px}
.dsh-wb-design .req-detail-raw ul,.dsh-wb-design .req-detail-raw ol{margin:0 0 8px;padding-left:20px}
.dsh-wb-design .req-detail-raw code{font-family:var(--font-mono);background:var(--surface-2);border:1px solid var(--line);padding:0 4px;border-radius:3px;font-size:11px}
.dsh-wb-design .req-detail-raw pre{background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px;overflow:auto;font-family:var(--font-mono);font-size:11px}
.dsh-wb-design .table-wrap{border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden;background:var(--surface)}
.dsh-wb-design .table{width:100%;border-collapse:collapse}
.dsh-wb-design .table th{height:34px;padding:0 12px;text-align:left;font-size:12px;font-weight:var(--fw-med);color:var(--text-3);background:var(--bg-elev);border-bottom:1px solid var(--line);white-space:nowrap}
.dsh-wb-design .table td{height:48px;padding:7px 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--text-2);vertical-align:middle}
.dsh-wb-design .table tbody tr:last-child td{border-bottom:0}
.dsh-wb-design .table tr.active{background:var(--primary-bg)}
.dsh-wb-design .td-code{font-family:var(--font-mono);font-size:12px;color:var(--text-3)}
.dsh-wb-design .rk{font-size:13px;font-weight:var(--fw-med);color:var(--text)}
.dsh-wb-design .rk:hover{color:var(--primary)}
.dsh-wb-design .toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
/* 键盘焦点：没单独写 focus 样式的控件至少有统一的外圈。 */
.dsh-wb-design :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .dsh-wb-design *, .dsh-wb-design *::before, .dsh-wb-design *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}

`
    const DESIGN_LOGIN_CSS = String.raw`
.dsh-wb-login .login { min-height: 100vh; display: grid; grid-template-columns: minmax(0,1fr) 600px; }
.dsh-wb-login .brand { position: relative; background: var(--bg-elev); border-right: 1px solid var(--line); padding: 56px 60px; display: flex; flex-direction: column; overflow: hidden; }
.dsh-wb-login .brand .grid-bg { position: absolute; inset: 0; background:
      linear-gradient(var(--line) 1px, transparent 1px) 0 0 / 100% 44px,
      linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0 / 44px 100%;
      opacity: .35; mask-image: radial-gradient(circle at 30% 30%, #000 0%, transparent 75%); pointer-events: none; }
.dsh-wb-login .brand > * { position: relative; }
.dsh-wb-login .brand .logo { padding: 0 0 0 2px; }
.dsh-wb-login .brand .tag { margin-top: auto; }
.dsh-wb-login .brand h1 { font-size: 34px; font-weight: var(--fw-semi); letter-spacing: -.02em; line-height: 1.2; margin: 0 0 14px; max-width: 14ch; }
.dsh-wb-login .brand .sub { color: var(--text-2); font-size: var(--fs-14); line-height: var(--lh-body); max-width: 40ch; }
.dsh-wb-login .flow { margin-top: 44px; max-width: 420px; }
.dsh-wb-login .flow .fi { display: grid; grid-template-columns: 26px 1fr; gap: 14px; padding-bottom: 20px; position: relative; }
.dsh-wb-login .flow .fi:not(:last-child)::before { content: ""; position: absolute; left: 12px; top: 26px; bottom: 0; width: 1px; background: var(--line-2); }
.dsh-wb-login .flow .fi .no { width: 25px; height: 25px; border-radius: 50%; border: 1px solid var(--line-3); display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: var(--fs-11); color: var(--text-2); background: var(--bg-elev); z-index: 1; }
.dsh-wb-login .flow .fi .tt { font-size: var(--fs-13); color: var(--text); font-weight: var(--fw-med); }
.dsh-wb-login .flow .fi .dd { font-size: var(--fs-12); color: var(--text-3); margin-top: 3px; line-height: var(--lh-snug); }
.dsh-wb-login .brand .foot { margin-top: 40px; display: flex; align-items: center; gap: 10px; font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); }
.dsh-wb-login .auth { padding: 40px 56px; display: flex; flex-direction: column; justify-content: center; background: var(--bg); position: relative; }
.dsh-wb-login .auth .theme-slot { position: absolute; top: 22px; right: 24px; display: flex; align-items: center; gap: 10px; }
.dsh-wb-login .auth-card { width: 100%; max-width: 400px; margin: 0 auto; }
.dsh-wb-login .auth-card .h { font-size: var(--fs-22); font-weight: var(--fw-semi); letter-spacing: -.01em; margin: 0 0 6px; }
.dsh-wb-login .auth-card .s { color: var(--text-2); font-size: var(--fs-13); margin-bottom: 18px; }
.dsh-wb-login .mock-banner { margin-bottom: 18px; }
.dsh-wb-login .user-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.dsh-wb-login .user-row { display: flex; align-items: center; gap: 11px; padding: 9px 11px; border: 1px solid var(--line-2); border-radius: var(--r-sm); background: var(--surface); cursor: pointer; transition: border-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease); }
.dsh-wb-login .user-row:hover { border-color: var(--line-3); }
.dsh-wb-login .user-row.sel { border-color: var(--primary-line); background: var(--primary-bg); box-shadow: 0 0 0 1px var(--primary-line); }
.dsh-wb-login .user-row .who { min-width: 0; flex: 1; }
.dsh-wb-login .user-row .who .n { font-size: var(--fs-13); color: var(--text); font-weight: var(--fw-med); }
.dsh-wb-login .user-row .who .r { font-size: var(--fs-11); color: var(--text-3); margin-top: 1px; }
.dsh-wb-login .user-row .radio { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--line-3); flex: none; display: flex; align-items: center; justify-content: center; }
.dsh-wb-login .user-row.sel .radio { border-color: var(--primary); }
.dsh-wb-login .user-row.sel .radio::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); }
.dsh-wb-login .divider-lbl { display: flex; align-items: center; gap: 10px; color: var(--text-3); font-size: var(--fs-11); margin: 16px 0; }
.dsh-wb-login .divider-lbl::before, .dsh-wb-login .divider-lbl::after { content: ""; flex: 1; height: 1px; background: var(--line-2); }
.dsh-wb-login .auth-foot { margin-top: 16px; font-size: var(--fs-11); color: var(--text-3); line-height: var(--lh-body); text-align: center; }
.dsh-wb-login .auth-foot a { color: var(--primary); }
.dsh-wb-login .next-hint { margin-top: 14px; display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-radius: var(--r-sm); background: var(--surface-2); border: 1px solid var(--line); font-size: var(--fs-11); color: var(--text-3); }
.dsh-wb-login .next-hint b { color: var(--text-2); font-weight: var(--fw-med); }
.dsh-wb-login .states { max-width: 400px; margin: 26px auto 0; }
.dsh-wb-login .states .cap { font-size: var(--fs-11); color: var(--text-3); font-family: var(--font-mono); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em; }
.dsh-wb-login .state-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.dsh-wb-login .state-mini { border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); padding: 9px 10px; }
.dsh-wb-login .state-mini .t { font-size: var(--fs-11); color: var(--text-3); margin-bottom: 6px; }
.dsh-wb-login .state-mini .body { font-size: var(--fs-12); color: var(--text-2); display: flex; align-items: center; gap: 6px; line-height: var(--lh-snug); }
.dsh-wb-login .state-mini.err .body { color: var(--red); }
.dsh-wb-login .state-mini.warn .body { color: var(--amber); }
.dsh-wb-login .spin { width: 12px; height: 12px; border: 1.8px solid var(--line-3); border-top-color: var(--primary); border-radius: 50%; animation: dsh-wb-spin 0.8s linear infinite; flex: none; }
@keyframes dsh-wb-spin{ to { transform: rotate(360deg); } }
@media (max-width: 980px){
.dsh-wb-login .login { grid-template-columns: 1fr; }
.dsh-wb-login .brand { display: none; }
.dsh-wb-login .auth { padding: 40px 24px; }
}
.dsh-wb-login{height:100%;min-height:0;overflow:auto;background:var(--bg);color:var(--text);font-family:var(--font-sans);font-size:13px;line-height:var(--lh-body)}
.dsh-wb-login .login{min-height:100%;grid-template-columns:minmax(0,1fr) 560px}
.dsh-wb-login .brand .logo{display:flex;align-items:center;gap:9px}
.dsh-wb-login .brand .logo .logo-mark{width:24px;height:24px;color:var(--text)}
.dsh-wb-login .logo-name{font-size:15px;font-weight:var(--fw-semi);color:var(--text)}
.dsh-wb-login .logo-badge{font-size:9px;font-weight:var(--fw-semi);letter-spacing:.06em;padding:2px 5px;border-radius:3px;background:var(--surface-2);border:1px solid var(--line-2);color:var(--text-3)}
.dsh-wb-login .auth-card .banner{display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border:1px solid var(--amber-line);border-radius:var(--r-sm);background:var(--amber-bg);color:var(--text-2);font-size:12px;line-height:var(--lh-snug)}
.dsh-wb-login .auth-card .banner svg{width:15px;height:15px;color:var(--amber);flex:none}
.dsh-wb-login .auth-card .banner b{color:var(--text)}
.dsh-wb-login .user-row .avatar{width:28px;height:28px;font-size:12px}
.dsh-wb-login .auth-card .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:var(--r-sm);border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:var(--fw-med);cursor:pointer}
.dsh-wb-login .auth-card .btn-primary{background:var(--primary-strong);border-color:var(--primary-strong);color:#fff}
.dsh-wb-login .auth-card .btn-primary:hover{background:var(--primary-strong-h)}
.dsh-wb-login .auth-card .btn-ghost{background:transparent;color:var(--text-2)}
.dsh-wb-login .auth-card .btn:disabled{opacity:.6;cursor:not-allowed}
.dsh-wb-login .auth-card .btn svg{width:15px;height:15px}
.dsh-wb-login .auth-error{margin-bottom:12px;padding:8px 10px;border:1px solid var(--red-line);border-radius:var(--r-sm);background:var(--red-bg);color:var(--st-block);font-size:12px}
.dsh-wb-login .avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:var(--fw-semi);flex:none}

`

    const DESIGN_ICONS = String.raw`
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <defs>
    <g id="_s" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></g>
  </defs>

  <symbol id="i-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.5 14.5c2.2-4.6 6-7 9.6-6.6 3.4.4 5.8 2.6 7.4 5.9"/>
    <path d="M4 16.2c2.6 3 6.1 3.6 9.2 2.1 1.9-.9 3.3-2.4 4.6-4.3"/>
    <circle cx="15.6" cy="9.4" r="1" fill="currentColor" stroke="none"/>
  </symbol>

  <symbol id="i-iter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 12.5 12 17.5l9-5"/><path d="M3 17 12 22l9-5"/>
  </symbol>
  <symbol id="i-workbench" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>
  </symbol>
  <symbol id="i-skills" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>
    <circle cx="12" cy="12" r="3.2"/>
  </symbol>
  <symbol id="i-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>
  </symbol>
  <symbol id="i-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>
  </symbol>
  <symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
  </symbol>
  <symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-chev-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></symbol>
  <symbol id="i-chev-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></symbol>
  <symbol id="i-chev-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></symbol>
  <symbol id="i-panel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></symbol>
  <symbol id="i-filter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></symbol>
  <symbol id="i-more-v" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9 17.5 20 6"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17.5v.5"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
  <symbol id="i-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></symbol>
  <symbol id="i-file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></symbol>
  <symbol id="i-folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></symbol>
  <symbol id="i-message" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 3V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10Z"/></symbol>
  <symbol id="i-arrow-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="i-arrow-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></symbol>
  <symbol id="i-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M21 3l-9 9"/><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/><path d="M16 4.2a3.5 3.5 0 0 1 0 6.6M17.5 14.6c2.4.5 4 2.2 4 5.4"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 4v5h-5"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M4 21h16"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></symbol>
  <symbol id="i-branch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="M6 7.2v9.6M18 9.2c0 4-5 3.4-8.2 4.6"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></symbol>
  <symbol id="i-minus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 12h14"/></symbol>
  <symbol id="i-dot" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></symbol>
  <symbol id="i-circle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="7"/></symbol>
  <symbol id="i-command" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z"/></symbol>
  <symbol id="i-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></symbol>
  <symbol id="i-code" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/></symbol>
  <symbol id="i-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/></symbol>
  <symbol id="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></symbol>
  <symbol id="i-package" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></symbol>
  <symbol id="i-history" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/><path d="M12 8v4l3 2"/></symbol>
  <symbol id="i-tag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.4"/></symbol>
  <symbol id="i-check-circle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></symbol>
  <symbol id="i-terminal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></symbol>
  <symbol id="i-star" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></symbol>
  <symbol id="i-inbox" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 2.5h5L16 13h5"/><path d="M4.5 5h15l1.5 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4l1.5-8Z"/></symbol>
  <symbol id="i-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></symbol>
</svg>

`

    function DesignIcon({ name, size = 16, className = 'ic', ...rest }) {
      // 图标精灵按需注入：第一次真正渲染图标时才把 <symbol> 塞进 body，
      // 不再在样式装配阶段无条件注入，减少不需要时的首屏 DOM。
      ensureDesignIcons()
      return h('svg', { className, width: size, height: size, 'aria-hidden': 'true', focusable: 'false', ...rest },
        h('use', { href: `#i-${name}` }))
    }

    // 需求正文允许写 Markdown：标题、段落、列表、粗体、行内代码、链接、引用、
    // 代码块。只生成 React 节点、不拼 innerHTML，避免把需求文档当 HTML 执行。
    function markdownInline(text, keyPrefix) {
      const nodes = []
      const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|~~([^~]+)~~/g
      let last = 0
      let index = 0
      let match
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index))
        if (match[1] !== undefined) nodes.push(h('strong', { key: `${keyPrefix}-s${index++}` }, match[1]))
        else if (match[2] !== undefined) nodes.push(h('code', { key: `${keyPrefix}-c${index++}` }, match[2]))
        else if (match[3] !== undefined) nodes.push(h('a', { key: `${keyPrefix}-a${index++}`, href: match[4], target: '_blank', rel: 'noreferrer noopener' }, match[3]))
        else nodes.push(h('del', { key: `${keyPrefix}-d${index++}` }, match[5]))
        last = pattern.lastIndex
      }
      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    function markdownBlocks(text) {
      const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let index = 0
      let key = 0
      while (index < lines.length) {
        const line = lines[index]
        if (/^\s*$/.test(line)) { index += 1; continue }
        // 表格：| a | b | 换行 | --- | --- | 换行若干数据行（产品文档常用）。
        const isTableRow = (value) => /^\s*\|.*\|\s*$/.test(value)
        const isTableSep = (value) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(value)
        if (isTableRow(line) && index + 1 < lines.length && isTableSep(lines[index + 1])) {
          const splitRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
          const header = splitRow(line)
          index += 2
          const rows = []
          while (index < lines.length && isTableRow(lines[index])) {
            rows.push(splitRow(lines[index]))
            index += 1
          }
          const headerCells = header.map((cell, ci) => h('th', { key: `th-${ci}` }, ...markdownInline(cell, `th${key}-${ci}`)))
          const bodyRows = rows.map((cells, ri) => h('tr', { key: `tr-${ri}` },
            ...header.map((_, ci) => h('td', { key: `td-${ci}` }, ...markdownInline(cells[ci] ?? '', `td${key}-${ri}-${ci}`)))))
          blocks.push(h('table', { key: `md-${key++}`, className: 'dsh-wb-md-table' },
            h('thead', null, h('tr', null, ...headerCells)),
            h('tbody', null, ...bodyRows)))
          continue
        }
        if (/^\s*```/.test(line)) {
          const code = []
          index += 1
          while (index < lines.length && !/^\s*```/.test(lines[index])) { code.push(lines[index]); index += 1 }
          index += 1
          blocks.push(h('pre', { key: `md-${key++}`, className: 'dsh-wb-md-pre' }, h('code', null, code.join('\n'))))
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          // 文档嵌在卡片里，标题降两级，避免 # 比卡片标题还大。
          const level = Math.min(6, heading[1].length + 2)
          blocks.push(h(`h${level}`, { key: `md-${key++}` }, markdownInline(heading[2].trim(), `h${key}`)))
          index += 1
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          const quote = []
          while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
            quote.push(lines[index].replace(/^\s*>\s?/, ''))
            index += 1
          }
          blocks.push(h('blockquote', { key: `md-${key++}` }, markdownInline(quote.join(' '), `q${key}`)))
          continue
        }
        const ordered = /^\s*\d+[.)]\s+/.test(line)
        const unordered = /^\s*[-*+]\s+/.test(line)
        if (ordered || unordered) {
          const items = []
          const itemPattern = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/
          while (index < lines.length && itemPattern.test(lines[index])) {
            let itemText = lines[index].match(itemPattern)[1]
            let task = null
            if (unordered) {
              const checkbox = /^\[( |x|X)\]\s+(.*)$/.exec(itemText)
              if (checkbox) { task = checkbox[1].toLowerCase() === 'x'; itemText = checkbox[2] }
            }
            const inner = markdownInline(itemText, `li${key}`)
            if (task === null) {
              items.push(h('li', { key: `li-${key++}` }, ...inner))
            } else {
              items.push(h('li', { key: `li-${key++}`, className: 'dsh-wb-md-task' },
                h('span', { key: 'ck', className: `dsh-wb-md-check${task ? ' is-done' : ''}`, 'aria-hidden': 'true' }, task ? '✓' : '○'),
                h('span', { key: 'tx' }, ...inner)))
            }
            index += 1
          }
          blocks.push(h(ordered ? 'ol' : 'ul', { key: `md-${key++}` }, ...items))
          continue
        }
        const paragraph = []
        while (index < lines.length
          && !/^\s*$/.test(lines[index])
          && !/^(#{1,6})\s+/.test(lines[index])
          && !/^\s*```/.test(lines[index])
          && !/^\s*>\s?/.test(lines[index])
          && !/^\s*\d+[.)]\s+/.test(lines[index])
          && !/^\s*[-*+]\s+/.test(lines[index])) {
          paragraph.push(lines[index].trim())
          index += 1
        }
        const children = []
        paragraph.forEach((part, order) => {
          if (order > 0) children.push(h('br', { key: `br-${key++}` }))
          children.push(...markdownInline(part, `p${key}-${order}`))
        })
        blocks.push(h('p', { key: `md-${key++}` }, ...children))
      }
      return blocks
    }

    function MarkdownText({ text, className = '' }) {
      if (String(text ?? '').trim() === '') return null
      return h('div', { className: `dsh-wb-md ${className}`.trim() }, markdownBlocks(text))
    }

    function ensureDesignIcons() {
      if (typeof document === 'undefined') return
      if (document.querySelector('div[data-dsh-workbench-icons]') !== null) return
      const host = document.createElement('div')
      host.dataset.dshWorkbenchIcons = '1'
      host.setAttribute('aria-hidden', 'true')
      host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
      host.innerHTML = DESIGN_ICONS
      document.body.appendChild(host)
    }
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

    const CSS = `
.dsh-wb-page{height:100%;min-height:0;overflow:auto;box-sizing:border-box;padding:24px 28px 40px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-family:var(--dsw-font-family);font-size:13px;line-height:1.45}
.dsh-wb-page *{box-sizing:border-box}
.dsh-wb-top{display:flex;align-items:flex-start;gap:16px;margin-bottom:20px}
.dsh-wb-top-main{min-width:250px;flex:1 1 auto}
.dsh-wb-eyebrow{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-wb-title{font-size:22px;line-height:1.2;font-weight:650;letter-spacing:-.01em;margin:0}
.dsh-wb-title-sub{margin-top:6px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-top-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:nowrap;gap:7px;margin-left:auto;flex:none}
.dsh-wb-iconbtn{position:relative;height:30px;min-width:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}
.dsh-wb-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-wb-bell-badge{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-state-error-primary,#e05a5a);color:#fff;font-size:9.5px;line-height:15px;text-align:center;font-weight:650}
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
.dsh-wb-toast-queue{position:fixed;right:22px;bottom:22px;z-index:81;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:min(440px,calc(100vw - 32px));pointer-events:none}
.dsh-wb-toast-queue>*{pointer-events:auto}
.dsh-wb-command-toast{display:block;white-space:pre-wrap;cursor:default;max-width:min(440px,90vw);position:relative}
.dsh-wb-toast-detail{margin-top:6px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-wb-toast-detail summary{cursor:pointer}
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
.dsh-wb-btn:focus-visible,.dsh-wb-iconbtn:focus-visible,.dsh-wb-auth-chip:focus-visible,.dsh-wb-rqbar-toggle:focus-visible,a:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-wb-rqbar-toggle{min-width:24px;min-height:24px}
.dsh-wb-dialog h2{font-size:16px;font-weight:650;margin:0 0 4px}
.dsh-wb-dialog p{margin:0 0 14px;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.dsh-wb-input{width:100%;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:0 10px;font:inherit;font-size:13px;outline:none}
.dsh-wb-input:focus{border-color:var(--dsw-alias-border-selected);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary-dimmed,rgba(90,140,255,.18))}
.dsh-wb-dialog-err{margin-top:9px;color:var(--dsw-alias-state-error-primary);font-size:11.5px;line-height:1.45}
.dsh-wb-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.dsh-wb-shot-dialog{width:min(1200px,100%);height:calc(100dvh - 48px);display:flex;flex-direction:column;overflow:hidden;border-radius:var(--dsw-radius-lg,10px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent,0 24px 70px rgba(0,0,0,.45))}
.dsh-wb-shot-dialog-head{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-shot-dialog-head b{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wb-shot-dialog-body{flex:1;min-height:0;overflow:auto;background:#fff}
.dsh-wb-shot-dialog-body iframe{display:block;width:100%;height:100%;border:0;background:#fff}
.dsh-wb-shot-dialog-body img{display:block;max-width:100%;max-height:100%;margin:auto}
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
.dsh-wb-canvas-pane{position:relative;display:flex;flex-direction:column;min-height:0}
.dsh-wb-canvas-content{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}
.dsh-wb-req-brief{flex:none;max-height:34vh;overflow:auto;padding:9px 12px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);font-size:12px;line-height:1.6}
.dsh-wb-readonly{flex:1;min-height:0;overflow:auto;padding:0 12px 16px;background:var(--dsw-alias-bg-base)}
.dsh-wb-readonly-banner{display:flex;align-items:center;gap:6px;margin:8px 0 10px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1,transparent);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-readonly-list{display:flex;flex-direction:column;gap:14px}
.dsh-wb-readonly-shot{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff)}
.dsh-wb-readonly-head{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-readonly-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace)}
.dsh-wb-readonly-note{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dsh-wb-readonly-shot iframe{width:100%;height:70vh;min-height:420px;border:0;background:#fff}
.dsh-wb-readonly-title{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-wb-readonly-quote{margin-left:auto;flex:none}
.dsh-wb-req-brief-quote{margin-left:auto;flex:none}
.dsh-wb-draftimg{display:inline-flex;align-items:center}
.dsh-wb-draftimg-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-wb-draftimg-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary)}
.dsh-wb-draftimg-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4b7bf5);outline-offset:1px}
.dsh-wb-code{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base)}
.dsh-wb-code-head{flex:none;display:flex;flex-direction:column;gap:2px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-code-title{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-wb-code-refresh{margin-left:auto;flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-wb-code-refresh:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary)}
.dsh-wb-code-refresh:disabled{opacity:.45;cursor:default}
.dsh-wb-code-folder{font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:10px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-wb-code-tasks{flex:none;display:flex;flex-direction:column;gap:5px;padding:7px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1,transparent)}
.dsh-wb-code-task{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:5px 8px}
.dsh-wb-code-task-top{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-primary)}
.dsh-wb-code-task-top b{font-weight:650}
.dsh-wb-code-task-state{margin-left:auto;flex:none;font-size:9.5px;font-weight:650;color:var(--dsw-alias-label-secondary)}
.dsh-wb-code-task-meta{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-wb-code-task-meta a{color:var(--dsw-alias-brand-primary,#4b7bf5);text-decoration:none}
.dsh-wb-code-task-meta a:hover{text-decoration:underline}
.dsh-wb-code-crumbs{flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:1px;padding:5px 12px;border-bottom:1px dashed var(--dsw-alias-border-l1);font-size:11px}
.dsh-wb-code-crumb{border:0;background:transparent;padding:1px 3px;border-radius:4px;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:10.5px}
.dsh-wb-code-crumb:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary)}
.dsh-wb-code-sep{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));opacity:.6}
.dsh-wb-code-body{flex:1;min-height:0;overflow:auto;padding:6px 8px 14px}
.dsh-wb-code-list{display:flex;flex-direction:column;gap:1px}
.dsh-wb-code-row{display:flex;align-items:center;gap:7px;width:100%;padding:5px 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left}
.dsh-wb-code-row:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.dsh-wb-code-row .ic{flex:none;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-wb-code-row.is-dir .ic{color:var(--dsw-alias-brand-primary,#4b7bf5)}
.dsh-wb-code-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:11px}
.dsh-wb-code-meta{flex:none;font-size:9.5px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-wb-code-file{display:flex;flex-direction:column;min-height:100%}
.dsh-wb-code-file-head{flex:none;display:flex;align-items:center;gap:6px;padding:2px 4px 8px}
.dsh-wb-code-file-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-wb-code-file-meta{flex:none;font-size:9.5px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-wb-code-file-head .dsh-wb-btn{margin-left:auto;flex:none}
.dsh-wb-code-pre{margin:0;flex:1;min-height:0;overflow:auto;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1,transparent);font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:11px;line-height:1.55;white-space:pre;tab-size:2}
.dsh-wb-test{flex:1;min-height:0;overflow:auto;padding:0 12px 16px;background:var(--dsw-alias-bg-base)}
.dsh-wb-test .dsh-wb-req-brief{margin:8px -12px 10px;max-height:30vh}
.dsh-wb-code .dsh-wb-req-brief{max-height:26vh}
.dsh-wb-test-banner{display:flex;flex-direction:column;gap:3px;margin:8px 0 12px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1,transparent)}
.dsh-wb-test-banner.is-pass{border-color:var(--dsw-alias-state-success-primary,#3fa66b)}
.dsh-wb-test-banner.is-fail{border-color:var(--dsw-alias-state-error-primary,#d9534f)}
.dsh-wb-test-banner.is-run{border-color:var(--dsw-alias-state-business-primary,#4b7bf5)}
.dsh-wb-test-banner-top{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary)}
.dsh-wb-test-banner-meta{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dsh-wb-test-banner-meta a{color:var(--dsw-alias-brand-primary,#4b7bf5);text-decoration:none}
.dsh-wb-test-sec{margin-bottom:14px}
.dsh-wb-test-sec h4{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:11px;font-weight:650;color:var(--dsw-alias-label-primary)}
.dsh-wb-test-progress{font-size:9.5px;font-weight:600;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-wb-test-checks{display:flex;flex-direction:column;gap:1px}
.dsh-wb-test-check{display:flex;align-items:flex-start;gap:7px;padding:5px 6px;border-radius:6px;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-primary);cursor:pointer}
.dsh-wb-test-check:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.dsh-wb-test-check input{margin:2px 0 0;flex:none}
.dsh-wb-test-check.is-done{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-wb-test-check.is-done span{text-decoration:line-through}
.dsh-wb-test-empty{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-wb-test-runs{display:flex;flex-direction:column;gap:5px}
.dsh-wb-test-run{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:5px 8px}
.dsh-wb-test-run-top{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-primary);flex-wrap:wrap}
.dsh-wb-test-run-top b{font-weight:650;font-size:11px}
.dsh-wb-test-run-meta{font-size:10px;line-height:1.5;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-wb-test-run .state{flex:none;font-size:9.5px;font-weight:650;padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-secondary)}
.dsh-wb-test-run .state.is-passed{color:var(--dsw-alias-state-success-primary,#3fa66b)}
.dsh-wb-test-run .state.is-failed{color:var(--dsw-alias-state-error-primary,#d9534f)}
.dsh-wb-test-run .state.is-running{color:var(--dsw-alias-state-business-primary,#4b7bf5)}
.dsh-wb-test-run-meta code{font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:9.5px}
.dsh-wb-test-evidence{display:flex;flex-direction:column;gap:6px}
.dsh-wb-test-evidence-item{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;overflow:hidden}
.dsh-wb-test-evidence-head{display:flex;align-items:center;gap:6px;padding:6px 8px}
.dsh-wb-test-evidence-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:11px;color:var(--dsw-alias-label-primary)}
.dsh-wb-test-evidence-head .dsh-wb-btn{flex:none}
.dsh-wb-test-evidence-frame{width:100%;height:60vh;min-height:320px;border:0;border-top:1px solid var(--dsw-alias-border-l1);background:#fff}
.dsh-wb-test-cmds{display:flex;flex-direction:column;gap:3px;padding-top:10px;border-top:1px dashed var(--dsw-alias-border-l1);font-size:10.5px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-wb-test-cmds code{padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:10px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-req-brief-head{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-wb-req-brief-title{font-weight:600;font-size:12px;color:var(--dsw-alias-label-primary)}
.dsh-wb-req-brief-summary{margin:0 0 6px;font-weight:500;color:var(--dsw-alias-label-primary);white-space:pre-wrap}
.dsh-wb-req-brief-body{white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}
.dsh-wb-req-brief details{margin-top:6px;border-top:1px dashed var(--dsw-alias-border-l1);padding-top:6px}
.dsh-wb-req-brief summary{cursor:pointer;font-size:11px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-wb-req-brief.is-empty{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px}
.dsh-wb-md p{margin:0 0 6px}
.dsh-wb-md p:last-child{margin-bottom:0}
.dsh-wb-md h3,.dsh-wb-md h4,.dsh-wb-md h5,.dsh-wb-md h6{margin:10px 0 5px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-wb-md ul,.dsh-wb-md ol{margin:0 0 6px;padding-left:18px}
.dsh-wb-md li{margin:1px 0}
.dsh-wb-md code{padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));font-family:var(--font-mono,ui-monospace,SFMono-Regular,monospace);font-size:11px}
.dsh-wb-md pre{margin:6px 0;padding:8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));overflow:auto;white-space:pre}
.dsh-wb-md pre code{padding:0;background:none}
.dsh-wb-md blockquote{margin:6px 0;padding:2px 0 2px 8px;border-left:2px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));color:var(--dsw-alias-label-secondary)}
.dsh-wb-md a{color:var(--dsw-alias-brand-primary,#4b7bf5);text-decoration:underline}
.dsh-wb-md del{opacity:.65}
.dsh-wb-md .dsh-wb-md-table{margin:6px 0;border-collapse:collapse;width:100%;font-size:11px}
.dsh-wb-md .dsh-wb-md-table th,.dsh-wb-md .dsh-wb-md-table td{border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));padding:4px 7px;text-align:left;vertical-align:top}
.dsh-wb-md .dsh-wb-md-table th{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));font-weight:600}
.dsh-wb-md li.dsh-wb-md-task{list-style:none;display:flex;align-items:flex-start;gap:6px;margin-left:-14px}
.dsh-wb-md .dsh-wb-md-check{flex:none;width:13px;display:inline-flex;justify-content:center;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}
.dsh-wb-md .dsh-wb-md-check.is-done{color:var(--dsw-alias-state-success-primary,#3aa675)}
.dsh-wb-offline-bar{display:flex;align-items:center;gap:10px;justify-content:center;padding:7px 14px;background:var(--dsw-alias-state-warn-tertiary,rgba(245,180,60,.14));color:var(--dsw-alias-state-warn-label,#8a5a00);font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-wb-offline-bar button{margin-left:auto}
.dsh-wb-shot-frame{position:relative}
.dsh-wb-thumb-skel{position:absolute;inset:0;border-radius:inherit;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1)) 25%,var(--dsw-alias-bg-layer-1,rgba(127,127,127,.16)) 37%,var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1)) 63%);background-size:400% 100%;animation:dsh-wb-skel 1.4s ease infinite;z-index:1}
@keyframes dsh-wb-skel{0%{background-position:100% 0}100%{background-position:-100% 0}}
.dsh-wb-req-brief-summary .dsh-wb-md,.dsh-wb-req-brief-body .dsh-wb-md{white-space:normal}
.dsh-wb-design .spec-item b{display:block;margin-bottom:2px}
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
/*画布保留整套能力：首页、外观、体检、导出、版本、工具坞。
   只收起市场与设计库这两个整屏入口（内嵌首页已经用工作台自己的作品代替）。 */
.dsh-wb-design-canvas .ddp-libwrap{display:none!important}
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
.dsh-wb-detail-code-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:2px}
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
  --dsw-radius-sm:6px;--dsw-radius-md:8px;--dsw-radius-lg:10px;
  font-family:"Inter",-apple-system,"PingFang SC","HarmonyOS Sans SC","MiSans","Microsoft YaHei",system-ui,sans-serif;
}
.dsh-wb-page{background:var(--dsw-alias-bg-base, #151517);color:var(--dsw-alias-label-primary, #ededef)}
.dsh-wb-content{padding:22px 28px 40px;max-width:1240px}
.dsh-wb-title{font-size:22px;font-weight:600;letter-spacing:-.01em}
.dsh-wb-title-sub{font-size:12px;color:var(--dsw-alias-label-secondary, #adb0b8)}
.dsh-wb-eyebrow{color:var(--dsw-alias-label-tertiary, #9a9aa2)}
.dsh-wb-stat{background:var(--dsw-alias-bg-layer-1, #232326);border:1px solid var(--dsw-alias-border-l1, #2b2b30);border-radius:8px;padding:12px 14px}
.dsh-wb-stat-label{font-size:11px;color:var(--dsw-alias-label-tertiary, #9a9aa2)}
.dsh-wb-stat-value{font-size:22px;font-weight:600;letter-spacing:-.01em}
.dsh-wb-btn{height:32px;font-size:13px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2, #36363c);background:var(--dsw-alias-bg-layer-2, #2a2a2e);color:var(--dsw-alias-label-primary, #ededef)}
.dsh-wb-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3, #333338);border-color:var(--dsw-alias-border-l3, #46474d)}
.dsh-wb-btn--primary{background:var(--dsw-alias-button-primary-fill, #3563cc);border-color:var(--dsw-alias-button-primary-fill, #3563cc);color:#fff;font-weight:600}
.dsh-wb-btn--primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover, #3f6fd6);border-color:var(--dsw-alias-button-primary-hover, #3f6fd6)}
.dsh-wb-btn--ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary, #adb0b8)}
.dsh-wb-navbar{background:var(--dsw-alias-bg-base, #151517);border-bottom:1px solid var(--dsw-alias-border-l1, #2b2b30);min-height:52px;padding:0 24px;gap:18px}
.dsh-wb-nav button{height:36px;font-size:13px;color:var(--dsw-alias-label-tertiary, #9a9aa2)}
.dsh-wb-nav button:hover{background:var(--dsw-alias-bg-layer-1, #232326);color:var(--dsw-alias-label-primary, #ededef)}
.dsh-wb-nav button.is-active{background:transparent;box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary, #6f9bf0);border-radius:0;color:var(--dsw-alias-label-primary, #ededef);font-weight:600}
.dsh-wb-nav-logo{font-size:14px}
.dsh-wb-iter-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.dsh-wb-iter-table{border:1px solid var(--dsw-alias-border-l1, #2b2b30);border-radius:8px;background:var(--dsw-alias-bg-layer-1, #232326)}
.dsh-wb-iter-tr{gap:10px;padding:11px 12px}
.dsh-wb-iter-tr.is-head{background:var(--dsw-alias-bg-layer-1, #191919);font-size:11px;color:var(--dsw-alias-label-tertiary, #9a9aa2);font-weight:500;letter-spacing:.03em}
.dsh-wb-iter-tr.is-row:hover{background:var(--dsw-alias-bg-layer-2, #2a2a2e)}
.dsh-wb-iter-code,.dsh-wb-iter-dates,.dsh-wb-code{color:var(--dsw-alias-label-tertiary, #9a9aa2)}
.dsh-wb-iter-name b{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary, #ededef)}
.dsh-wb-iter-name em{font-size:11px;color:var(--dsw-alias-label-tertiary, #9a9aa2)}
.dsh-wb-avatar{width:20px;height:20px;background:#3d5c8f;color:#fff;border:1px solid rgba(255,255,255,.08);font-size:11px}
.dsh-wb-progress{height:5px;background:var(--dsw-alias-bg-layer-3, #333338)}
.dsh-wb-progress span{background:var(--dsw-alias-brand-primary, #6f9bf0)}
.dsh-wb-seg{padding:2px;background:var(--dsw-alias-bg-layer-2, #2a2a2e);border:1px solid var(--dsw-alias-border-l1, #2b2b30);border-radius:6px}
.dsh-wb-seg button{height:26px;font-size:12px;border-radius:4px;color:var(--dsw-alias-label-secondary, #adb0b8)}
.dsh-wb-seg button.is-on{background:var(--dsw-alias-bg-layer-1, #232326);color:var(--dsw-alias-label-primary, #ededef);box-shadow:0 1px 2px rgba(0,0,0,.35);font-weight:500}
.dsh-wb-chip{height:20px;border-radius:4px;font-size:11px;font-weight:500}
.dsh-wb-input,.dsh-wb-select{background:var(--dsw-alias-bg-layer-1, #232326);border:1px solid var(--dsw-alias-border-l2, #36363c);height:32px;border-radius:6px;color:var(--dsw-alias-label-primary, #ededef)}
`

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
