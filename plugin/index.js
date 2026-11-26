/**
 * dsh-workbench — host half.
 *
 * 架构：
 *   - Rust 团队服务端（server/）保存共享协作数据：用户、平台、迭代、需求、
 *     评审、排期、设计版本、开发/测试/发布、技能、通知与事件。
 *   - DSH host 插件只做 BFF：同源 Cookie 鉴权、转发团队服务端、保存本机
 *     顶级文件夹与 DSH 会话映射、创建本地目录、挂载设计画布。
 *   - 会话里的工具/技能通过内部令牌代表当前用户调用团队服务端。
 *
 * 实现按职责拆在 lib/：config / local / server / http / state / routes /
 * format / ops / tools / skills / commands / canvas。本文件只负责装配。
 */

import fs from 'node:fs'
import { API_PREFIX, SERVER_URL } from './lib/config.js'
import { baseDirOverride, defaultBaseDir, loadLocal, localFile, setBaseDir } from './lib/local.js'
import { makeRoute } from './lib/routes.js'
import { mountCanvas } from './lib/canvas.js'
import { registerTools } from './lib/tools.js'
import { registerSkills, syncPublishedSkills } from './lib/skills.js'
import { registerCommands } from './lib/commands.js'

export const name = 'dsh-workbench'
// webServer 只在 web profile 存在；headless/CLI profile 仍可挂载工具、技能和命令。
export const inject = []

export function apply(ctx, config = {}) {
  if (config?.baseDir && String(config.baseDir).trim() !== '') {
    setBaseDir(String(config.baseDir))
  }
  const local = loadLocal()
  // 只有确实没有任何文件夹配置时才落默认目录；配置了别的 baseDir 或已经用过
  // 工作台的人，不该每次启动都在主目录里凭空多出一个 ~/DSH-Workbench。
  const hasOwnFolder = Object.values(local.users ?? {}).some(state => (
    typeof state?.topLevelFolder === 'string' && state.topLevelFolder !== ''
  ))
  if (baseDirOverride === null && !hasOwnFolder) {
    fs.mkdirSync(defaultBaseDir(), { recursive: true })
  }

  mountCanvas(ctx)

  ctx.inject(['webServer'], (sub) => {
    sub.effect(() => sub.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: makeRoute(local, sub),
    }), 'dsh-workbench: team-server BFF routes')
  })

  registerTools(ctx, local)
  registerSkills(ctx, local)
  registerCommands(ctx, local)
  void syncPublishedSkills(ctx, local)

  ctx.logger?.info?.(`[dsh-workbench] team server: ${SERVER_URL}`)
  ctx.logger?.info?.(`[dsh-workbench] local state: ${localFile()}`)
  ctx.logger?.info?.(`[dsh-workbench] requirement folders: ${defaultBaseDir()}`)
}

// 仅供 tests/host-bff.mjs 使用的内部入口；不属于插件公开 API。
export const __test = { makeRoute, loadLocal, localFile, defaultBaseDir }
