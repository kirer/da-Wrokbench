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
