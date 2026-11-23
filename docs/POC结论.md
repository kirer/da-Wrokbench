# DSH 研发工作台 POC 结论

验证时间：2026-11-22
环境：DeepSeek Harness 0.2.2-rc.5，独立 profile `workbench-poc`，Rust 1.9x，Docker Desktop
插件目录：`poc/`
参考设计：`需求梳理与方案建议.md` v0.3

## 一句话结论

**完整协作链路已经跑通并可回归**：登录 → 首次引导 → 迭代 → 建需求 → 本机文件夹/DSH 会话
→ 右侧需求与设计面板 → 活文档/附件 → 提交 → 会签 → 排期/范围 → 设计认领/交付 → 开发
→ 测试 → 冻结 → 发布，以及通知聚合、技能治理、管理后台、会话归档/恢复。

团队服务端用 **Rust（axum）**，支持 **SQLite 和 Postgres**，已有 Dockerfile / Compose、
健康检查和命名卷；DSH 宿主是**按会话解析身份的 BFF**，不再有进程级 `activeUserId`。
POC 回归为 **112 项 API + 23 项 Host BFF + 34 项集成 + 4 项浏览器 E2E + 20 项/平台真实
GitLab 断言**，全部通过；本地已部署 GitLab CE 17.11.4 + Runner，真实分支/MR/流水线/Webhook
跑通。另完成 50 轮代码/UI/UX 审查（120 条建议，113 条修复、2 条缓解、5 条标注暂缓），
详见 `docs/reviews/REVIEW-2026-11-22.md`。钉钉租户仍需企业凭据，其余功能均已在本地 mock、真实
GitLab 或真实浏览器中验证。

## 架构结论

```
DSH client.js（工作台 UI + 右侧需求/设计画布 + 技能、工具、/wb-* 命令）
        │ 同源 Cookie
DSH host index.js（鉴权 BFF、本机目录/DSH 会话映射、设计稿上传、预览服务）
        │ 内部令牌 + x-workbench-actor
Rust server/（axum + SQLite/WAL 或 Postgres JSONB + JWT + Mock/DingTalk）
        │
钉钉开放平台 / GitLab API / GitLab Webhook（服务端调用，凭据不下发客户端）
```

关键取舍：

1. **服务端只存已定稿的协作数据**。需求版本、活文档、评审、设计版本与设计稿正文、附件、
   开发/测试/发布、技能、通知、事件/审计进入服务端；对话原文、草稿、本机路径和原始 DSH
   会话 ID 不进入服务端。
2. **身份按请求和会话隔离**。浏览器用 HttpOnly Cookie 鉴权；宿主把 DSH 会话认领给账号，
   工具/命令按会话归属解析 actor，不能靠“最后登录的人”串号。换账号打开同一会话会被拒绝。
3. **本机映射解决多设备问题**。服务端保存 `session-<uuid>` 记录；host 在本机
   `~/.dsh/cache/dsh-workbench-poc/local.json` 映射 DSH session/workspace/folder。换机后
   服务端数据仍在，本机会重建目录/会话；其他设备创建的会话标记「其他设备」。
4. **写操作在会话里完成**。工作台只保留新建迭代、新建需求、新建会话、失败重试；提交、评审、
   排期、范围、设计、开发、测试、发布都由技能/工具/命令调用服务端。
5. **设计是可选并行轨**。不阻塞开发；开发开始后交付会标记「设计已更新」，服务端记录版本；
   交付时自动上传本机设计资产，其他设备可在「团队设计稿」打开。
6. **数据库双后端**。SQLite 适合本地和小团队；Postgres 用单行 JSONB 快照 + 事务 +
   `SELECT ... FOR UPDATE` + 版本号，支持多实例。增量拆表留到正式版。

## 功能覆盖

- **组织与身份**：Mock / 钉钉登录、多身份（角色并集）、首次引导、个人设置、停用用户、
  按 DSH 会话隔离身份、会话认领冲突提示。
- **迭代与平台**：迭代新建/编辑/切换/归档/恢复、跨迭代移动与重新编号、默认会签人；
  平台组/平台、负责人、GitLab 项目、归档/恢复。
- **需求**：只填名称创建、失败重试、需求/设计/评审/开发/测试会话、会话归档/恢复/解绑本机、
  需求活文档（摘要/验收标准/正文，版本递增）、附件与设计稿（文本/base64，跨用户读取）。
- **生命周期**：提交、单/多人会签、退回、排期、范围纳入/移出、设计认领与晚到交付、
  按平台指派/认领/开始/完成/重开、测试开始/通过/不通过、冻结/解冻/发布。
- **集成**：钉钉组织架构/成员同步（递归部门、分页成员、停用离职）、钉钉工作通知；
  GitLab 分支/MR/流水线、Webhook 回写流水线状态（本地 GitLab CE + Runner 已真实跑通）。
- **部署**：SQLite 单文件、Postgres、Dockerfile、Compose、健康检查、数据卷、环境变量文档；
  `deploy/gitlab/` 提供 GitLab CE + Runner 一键本地部署与初始化脚本。
- **协作设施**：通知聚合（按需求/系统分组、未读、单条/全部已读、多设备同步）、技能上传/
  审核/发布/版本/归档、事件流、管理员审计。
- **管理后台**：用户与角色、钉钉同步、集成状态（不回传密钥）、审计事件。
- **工作台 UI**：7 个统计卡、需求列表与详情、会签/开发/测试/发布卡、通知铃、技能管理、
  管理后台、平台配置；右侧需求面板 + 精简 Design Studio 画布。

## 验证结果

### Rust 服务端

`server/test-api.sh` 在 **SQLite** 和 **Docker Postgres** 上均为 **112 项断言全部通过**（用例使用唯一编码，可重复运行）：

- 登录、JWT、Cookie、生产环境拒绝 Mock/默认密钥。
- 新建需求、会话记录、绑定、创建失败重试、会话归档/恢复。
- 提交、单人会签、两人会签（一人通过仍待评审，全部通过才通过）、退回与会签权限。
- 排期、范围移出/纳入、跨迭代移动与重新编号。
- 开发指派/认领/开始/完成/重开；设计认领、开发开始后交付「设计已更新」。
- 测试开始/不通过/重开/修复/通过；冻结/解冻/发布与版本记录。
- 需求活文档版本与权限、文本/二进制附件跨用户读取。
- 技能上传（非负责人自动待审核）、负责人审核、已发布同步、版本历史。
- 迭代新建/编辑/切换/归档/恢复；通知聚合；事件流；审计仅管理员可读。

### 集成回归（本地 mock）

`server/test-integrations.sh` **34 项全部通过**：

- 钉钉 `/gettoken` → 组织同步 → 成员新增/更新 → 工作通知调用与内容校验。
- GitLab 建分支、建 MR、查询流水线、Webhook 校验与流水线状态回写。
- dev-start / dev-finish 响应在 GitLab 变更后重新读取，返回最新分支/MR/流水线。
- Webhook 错误令牌返回 401。

### 真实 GitLab（本地部署）

`deploy/gitlab/` 启动 GitLab CE 17.11.4 + GitLab Runner 17.11.0，`bootstrap.sh` 创建机器人
账号、私有分组 `workbench`、项目 `trade-server`/`web`、CI 文件、Group Runner 和 Webhook。
`server/test-gitlab-real.sh` 对两个平台各 **20 项断言全部通过**：

- 平台配置指向真实项目，dev-start 创建真实分支 `feature/<需求编号>-<平台>`。
- 模拟开发者在分支提交文件，Runner 真实执行 `.gitlab-ci.yml`，流水线成功。
- dev-finish 创建真实 MR（`http://127.0.0.1:8929/workbench/.../-/merge_requests/1`），
  并回写流水线状态。
- 再次提交触发新流水线，GitLab Webhook 把 pending/running/success 状态回写到工作台开发
  任务；事件流中出现 `integration.gitlab_pipeline`。
- 浏览器详情能看到真实分支、MR 地址和流水线链接，见
  `poc/e2e/screenshots/workbench-gitlab-real.png`。

本地 GitLab 地址 `http://127.0.0.1:8929`，root 密码和机器人/ Runner token 在
`poc/.local/gitlab.env` 与 `poc/.local/gitlab.outputs.env`（已忽略，不提交）。Runner 使用
容器内地址 `http://gitlab:8929` 克隆，避免把宿主 `127.0.0.1` 带进 Job 容器。

### Docker / Postgres

- 多阶段构建（`rust:slim-bookworm` → `debian:bookworm-slim`），非 root 用户，`/data` 卷，
  容器 `HEALTHCHECK` 调 `/health`。
- Compose 启动 `postgres:16-alpine` + 服务端，`pg_isready` 健康依赖，服务端 `/health`
  返回 `{"database":"postgres",...}`。
- 创建需求 → 编辑活文档 → `docker compose restart workbench-server` → 需求仍在且文档版本
  保留（Postgres 命名卷持久化）。
- 注意：Postgres 密码只在数据卷首次初始化时生效。卷已存在时修改 `.env` 的
  `POSTGRES_PASSWORD` 不会改库内密码，需要重置卷或进入容器 `ALTER USER`。

### 浏览器 E2E

`e2e/`（Playwright + Chromium）**4/4 通过**，使用真实 DSH 宿主和真实 Rust 服务端：

- 工作台首页、需求详情、活文档、团队文件（空状态也显示上传入口）。
- 通知按需求聚合与分组筛选。
- 管理员后台（用户与角色、钉钉同步、集成状态、审计）。
- 会话归属人打开右侧需求与设计画布；本机无映射时现场创建会话，验证跨设备兜底流程。
- 截图见 `poc/e2e/screenshots/`；控制台无报错。

人工浏览器验证（上一阶段）：

- 非会话归属人登录后打开同一 DSH 会话，服务端明确返回 403 认领冲突；归属人认领成功，
  工具解析到正确账号。
- 管理后台修改用户角色、触发钉钉同步、查看集成状态与审计。
- 平台配置、迭代设置、会签人选择、设计稿/附件查看。
- 会话归档/恢复按钮与解绑本机接口已验证 UI 渲染和 API；解绑流程尚未纳入自动化 E2E。

## POC 中发现并修掉的问题

| 问题 | 处理 |
| --- | --- |
| DSH 右侧栏组件 early return 后调用 Hook，登录后整页崩溃 | 把 Hook 移到 early return 之前 |
| 种子需求目录已被删，新建会话报 `workspace/invalid-path` | 建会话前按现有路径 `POST /folders/ensure` 补齐 |
| `/wb-*` 命令带参数不执行 | 命令声明 `input`，需形成 command chip；测试带尾随空格 |
| 零消息会话里命令结果不可见 | 监听 `command/executed`，为 `wb-*` 显示结果 toast |
| 同一操作重复通知（负责人同时是评审人/迭代负责人） | `Snapshot::notify` 对同操作同文本提醒去重 |
| 产品身份的会签人被 `require_plan` 挡住 | 评审权限改为管理员、会签人，或会签人为空时的负责人/管理员 |
| 需求活文档产品身份 403 | 编辑权限改为 `can_product() \|\| can_plan()` |
| DingTalk `/gettoken` 解析错层，报“没有返回 access_token” | 按顶层 `access_token` 解析 |
| GitLab 变更后 dev-start/dev-finish 返回旧分支/MR | 变更后重新读取快照再响应 |
| Design Studio 技能弹窗宽度被基础样式覆盖 | 提高选择器优先级 |
| 统计卡拥挤 | 拆成 7 张卡 |
| 会签测试只设一人，第二次评审 409 | 测试设置两名会签人，覆盖全部通过逻辑 |
| Playwright 在登录页等“研发工作台”标题超时 | 先识别登录页，必要时退出再选身份 |
| 管理员按钮与身份 chip 文本重名 | `getByRole(..., exact: true)` |
| 团队文件为空时整块不渲染，用户以为没有入口 | 空状态也渲染「团队文件 · 0」和上传入口 |
| 通知分组只有一个需求时不显示筛选条 | 有分组即显示「全部」+ 分组 chip |
| 服务端重置后本机会话映射悬空，E2E 卡在“进入会话” | E2E 检测禁用时现场新建设计会话，覆盖换机兜底 |
| GitLab `/-/readiness` 从宿主机访问 404 | 健康端点默认只允许容器内 127.0.0.1；Compose 内部检查，宿主机用登录页判断就绪 |
| Runner 从 Job 容器克隆 `127.0.0.1:8929` 失败 | Runner 注册加 `clone_url = http://gitlab:8929`，Job 加入 `dsh-gitlab-net` |
| 机器人 impersonation token 有效期超过一年被 400 拒绝 | 改为动态 300 天 |

## DSH 插件机制结论

- 客户端插件用 `window.__ModuleLoader__.load({ id, factory })`，`require('react')`，无需构建；
  package-local chunk 用 `require.async('./client.design-studio.js')`。
- 右栏：`ctx.sidebarRightTabs.register({ id, kind, title, keepMounted, guide })` +
  `ctx.slots.inject('sidebar.right.pane.tab', ...)`；同一 tab 内组合需求条和设计画布。
- 主机命令 `ctx.commands.register({ name, description, input, handler })`；带 `input` 的命令
  需要尾随空格/参数形成 chip；无参数命令要再按一次 Enter 才提交。
- 命令结果写入 `command/run` / `command/done` 会话日志；零消息会话不渲染 flow node，
  因此额外做 toast。
- 工作台会话从右侧栏反查需求：服务端记录 → 本机映射 → DSH session；工具/命令省略需求编号时
  用当前会话反查，不把原始 DSH session ID 发给服务端。
- Design Studio host 半端与预览服务随插件挂载；画布组件由 package-local chunk 懒加载。
- 右侧栏是滑入动画，E2E 截图需等宽度稳定，否则会截到动画中的窄条。

## 安全边界

- Cookie：HttpOnly、SameSite=Lax，生产默认 Secure；写请求校验 Origin / Sec-Fetch-Site。
- 内部令牌：服务端默认只接受回环地址；Docker 需显式 `WORKBENCH_INTERNAL_ALLOW_REMOTE=1`
  并配合网络隔离，正式版应上 mTLS 或只暴露给 DSH 宿主。
- CORS：默认关闭，仅 `WORKBENCH_ALLOWED_ORIGINS` 白名单启用。
- 路径：顶级文件夹/需求目录做 realpath + 符号链接检查，拒绝路径穿越。
- 密钥：钉钉 AppSecret、GitLab Token 只在服务端环境变量；集成状态 API 不返回密钥。
- 附件：正文经宿主取回后以 Blob 打开，不由服务端同源直接渲染 HTML。
- 生产：拒绝 `mock` Provider 和默认密钥，要求 HTTPS、强随机密钥、反向代理限流。

## 截图

浏览器 E2E（最新）：

- `poc/e2e/screenshots/workbench-dashboard.png`：工作台首页。
- `poc/e2e/screenshots/workbench-requirement-detail.png`：需求详情、活文档、团队文件。
- `poc/e2e/screenshots/workbench-notifications.png`：通知聚合与分组筛选。
- `poc/e2e/screenshots/workbench-admin.png`：管理后台。
- `poc/e2e/screenshots/workbench-design-pane.png`：右侧需求与 Design Studio 画布。
- `poc/e2e/screenshots/workbench-gitlab-real.png`：需求详情里的真实 GitLab 分支、MR 和
  流水线链接。
- `poc/e2e/screenshots/gitlab-project.png`：本地 GitLab 的 `workbench/trade-server` 项目。
- `poc/e2e/screenshots/gitlab-pipelines.png`：Runner 执行成功的真实流水线列表。
- `poc/e2e/screenshots/gitlab-merge-requests.png`：工作台创建的真实 MR。

早期人工验证（保留）：

- `artifacts/screenshots/app/01-login.png` … `11-dev-session.png`：登录、首次引导、统计卡、详情、
  设计画布、通知、技能、命令生命周期、新建会话。

## 正式版前必须处理

1. **真实钉钉联通**：企业 AppKey/AppSecret/AgentId、回调域名、真实组织架构、工作通知
   送达与失败重试；POC 只用本地 mock 验证了调用形状。
2. **生产 GitLab/CI**：本地 GitLab CE + Runner 已验证真实链路；生产实例还需按实际 HTTPS、
   分支保护、MR 审批、共享 Runner 和 Webhook 公网暴露/签名调整。Jenkins/制品库/测试平台
   尚未接入。
3. **Postgres 增量化**：当前整份 JSONB 快照 + 行锁，写放大明显；正式版拆
   requirements/events/notifications/artifacts 表，加迁移、备份、保留策略和归档。
4. **可观测性**：已有 `/health`、Docker healthcheck、tracing 访问日志；还需 Prometheus
   指标、错误告警、审计导出和外部 uptime 监控。
5. **文件存储**：附件/设计稿存状态快照，单文件 3 MB（解码后）上限；正式版换对象存储、
   分片上传、病毒扫描和访问签名。
6. **设计画布维护**：`design-studio/` 是裁剪后的上游代码，升级需补丁清单、快照对比和
   画布交互回归；当前 E2E 只覆盖打开与展示，不覆盖改字/切屏/样式保存。
7. **技能治理**：需要版本签名、审核留痕、角色可见性和运行时隔离；目前技能正文靠提示词
   约束，模型是否遵守不可强制。
8. **网络与部署**：生产需要 HTTPS、mTLS/网络隔离、限流、CSRF 双保险、密钥轮换和
   数据库备份；Docker 默认密码只用于 POC。
9. **会话生命周期**：跨设备映射清理、归档会话的 DSH session 回收、解绑本机的自动化用例
   仍需补齐。
10. **CI 的浏览器 E2E**：工作流已定义但默认关闭，需要可用的 DSH 宿主和 `DSH_URL`；
    当前 E2E 在本机真实宿主上跑通。
11. **版本管理**：当前目录不是 git 仓库；正式交付前应初始化仓库、补 LICENSE/第三方声明
    （Design Studio 为 MIT）并建立提交规范。

## 结论

POC 已足以支撑产品评审和下一阶段排期：核心协作链路、服务端权限与身份隔离、需求活文档/
附件、通知聚合、技能治理、管理后台、真实浏览器 UI、SQLite/Postgres 双后端、Docker 部署，
以及本地 GitLab 的真实分支/MR/流水线/Webhook 都已可运行、可演示、可回归。剩余工作集中在
钉钉真实租户联通、生产 GitLab 配置、生产级存储与可观测性、设计画布维护，不是架构性未知。
