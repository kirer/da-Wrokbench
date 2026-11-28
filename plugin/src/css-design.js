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
