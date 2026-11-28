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
