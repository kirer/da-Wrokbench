import * as canvasHost from '../vendor/canvas/index.js'
import * as canvasSkill from '../vendor/canvas/skill.js'

// ---------------------------------------------------------------------------
// 设计画布（vendor/canvas/）
// ---------------------------------------------------------------------------

export function mountCanvas(ctx) {
  const warn = (what, reason) => {
    const text = reason instanceof Error ? reason.message : String(reason)
    try { ctx.logger?.warn?.(`[dsh-workbench] ${what}: ${text}`) } catch { /* ignore */ }
  }
  try {
    ctx.inject(['webServer'], (sub) => {
      try {
        canvasHost.apply(sub)
      } catch (reason) {
        warn('设计画布 host 启动失败', reason)
      }
    })
  } catch (reason) {
    warn('设计画布 host 启动失败', reason)
  }
  try {
    canvasSkill.apply(ctx)
  } catch (reason) {
    warn('设计画布技能挂载失败', reason)
  }
  try {
    ctx.inject(['tools'], (sub) => {
      try {
        sub.tools.register({ ...canvasHost.previewTool })
        sub.tools.register({
          ...canvasHost.checkTool,
          execute: (args, exec) => canvasHost.checkTool.execute(args, exec, ctx),
        })
        sub.tools.register({
          ...canvasHost.lookTool,
          execute: (args, exec) => canvasHost.lookTool.execute(args, exec, ctx),
        })
      } catch (reason) {
        warn('设计画布工具挂载失败', reason)
      }
    })
  } catch (reason) {
    warn('设计画布工具注入失败', reason)
  }
}
