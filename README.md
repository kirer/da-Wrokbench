# DSH 部门研发工作台

DSH 插件形态的部门研发工作台：左侧是迭代 / 需求 / 通知 / 技能入口；需求本身是一整页工作面
（参与者卡片 + 原型/设计画布 + 右侧会话坞）。评审会签、排期与按端估时、设计交付、开发认领与
提测、封板发布都在会话里完成，共享数据由 Rust 团队服务端保存。

**插件代码在 `plugin/`**：`package.json`、`index.js`、`client.js` 和 `vendor/canvas/` 都在这个目录里，
`dsh plugin add <仓库路径>/plugin` 指向它；服务端、脚本和文档在仓库根目录的其他文件夹。

## 快速开始

### 1. 启动服务端

开发时直接 `cargo run`（默认 `127.0.0.1:3210`，数据库 `server/data/workbench.db`）：

```bash
cd server
cargo run
```

用构建产物在后台跑：

```bash
(cd server && cargo build)
mkdir -p runtime/server
DATABASE_PATH="$PWD/runtime/server/workbench.db" \
  nohup server/target/debug/dsh-workbench-server >> runtime/server/server.log 2>&1 &
curl -s http://127.0.0.1:3210/health
```

Docker + Postgres：复制 `.env.example` 为 `.env`，用 `openssl rand -hex 32` 生成并填入
`POSTGRES_PASSWORD` / `WORKBENCH_AUTH_SECRET` / `WORKBENCH_INTERNAL_TOKEN`，然后：

```bash
docker compose up -d --build
```

环境变量见 [`.env.example`](.env.example)；完整的测试准备与验收步骤见
[`TESTING.md`](TESTING.md)。

### 2. 安装并启动插件

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
# 首次：以默认 web profile 为底建 workbench-poc（已有则跳过，否则会被覆盖）
[ -d ~/.dsh/profiles/workbench-poc ] || \
  dsh --profile workbench-poc --from-default-profile web --dump-config >/dev/null
dsh plugin --profile workbench-poc add "$REPO_ROOT/plugin"

WORKBENCH_SERVER_URL=http://127.0.0.1:3210 \
DSH_WORKBENCH_BASE="$REPO_ROOT/runtime/workbench" \
dsh --profile workbench-poc --no-open --port 3199
```

打开终端输出的带 token URL，左侧出现「研发工作台」。

DeepSeek Harness 桌面端加载的是 `~/.dsh/profiles/desktop`：把上面的 `--profile workbench-poc`
换成 `--profile desktop`；本地改代码后用 `(cd plugin && npm pack --pack-destination ../dist)` 出包，
在该 profile 里重装 tgz 并重启客户端。

### 3. 登录与测试员工

Mock 模式在登录页直接点员工进入，然后完成首次引导（默认身份、负责平台、本机顶级文件夹）。
种子员工固定 8 人：

| 员工 | 角色 | 负责平台 |
| --- | --- | --- |
| 张三 | 负责人 | — |
| 李四 | 产品 | — |
| 王五 | 设计 | — |
| 赵六 | 开发 | 交易服务端、用户服务端 |
| 孙八 | 开发 | Web、小程序 |
| 周九 | 开发 | iOS、Android、鸿蒙 |
| 钱七 | 测试 | — |
| 管理员 | 管理员 | — |

- **改员工**（姓名 / 角色 / 平台 / 启用停用）：管理员 → 设置 → 用户与角色。
- **加员工**：接钉钉后由「设置 → 钉钉同步」按通讯录创建和停用；本机 mock 模式没有新增入口，
  需要新的测试账号就在 `server/src/seed.rs` 里加，再用下面的重置脚本重建数据库。

## 测试数据

- **云栖民宿手工验收**（1 项目 · 3 迭代 · 7 需求，含启动 / 打包 / 安装插件和每个角色可直接发的提示词）：
  [`TESTING.md`](TESTING.md)
- **一键重置**：`bash tools/reset-workbench-test-data.sh`。只用于测试环境：会退出桌面端，
  清空数据库、本机需求目录和会话缓存（不备份），以种子基线重启服务端，并以 9222 调试端口重开桌面端。
- **数据库备份**：`bash tools/workbench-db-backup.sh`（SQLite 在线备份，默认保留最近 14 份）。

## 目录

```text
.
├── plugin/                   DSH 插件包（dsh plugin add 指向这里）
│   ├── index.js             插件入口：装配路由、工具、技能、命令与设计画布
│   ├── lib/                 宿主 BFF 实现（按职责拆分）
│   │   ├── config.js        环境与常量：服务端地址、内部令牌、鉴权 Cookie
│   │   ├── util.js          httpError / escapeHtml 等通用工具
│   │   ├── greeting.js      会话开场白与引导消息
│   │   ├── local.js         本机状态与需求目录：local.json、路径校验、文件扫描
│   │   ├── server.js        团队服务端客户端与 /state 缓存
│   │   ├── http.js          同源 Cookie、CSRF、会话、预览票据等 HTTP 基础
│   │   ├── state.js         服务端记录与本机目录 / DSH 会话的合并
│   │   ├── routes.js        /dsh-workbench/api/* 路由
│   │   ├── format.js        状态、角色、平台等展示文案
│   │   ├── ops.js           需求目录、原型 / 设计 / 测试报告同步与上传
│   │   ├── tools.js         会话工具注册
│   │   ├── skills.js        技能与角色目录
│   │   ├── commands.js      斜杠命令
│   │   └── canvas.js        设计画布挂载
│   ├── client.js            浏览器主面板：工作台、迭代、需求页、通知、设置
│   ├── client.canvas.js     设计画布 client chunk
│   ├── cordis.patch.yml     DSH 插件挂载补丁
│   ├── package.json         插件清单与脚本（check / pack / test:bff）
│   └── vendor/
│       └── canvas/          设计画布宿主端（源自 MIT 授权的 dsh-design-studio，见 LICENSE）
│           ├── index.js     画布服务装配
│           ├── serve.js     预览服务与文件路由
│           ├── browser.js   画布浏览器端桥接
│           ├── core.js      画布核心：节点、编辑、历史
│           ├── handoff.js   设计稿交付与打包
│           ├── htmlpack.js  单文件 HTML 打包
│           ├── gallery/     页面模板与素材（css / html / pack / policy / routes / zip）
│           ├── skills/ui-design/  ui-design 技能
│           └── 其余模块      annotations / bundle / canvthumb / doc / draft / draft-page /
│                             edits / frames / history / impl / kinds / look / photo-assets /
│                             picker / skill / slot / styles / system / tweaks / works
├── server/                  Rust 团队服务端（axum）
│   ├── src/
│   │   ├── main.rs          启动、配置与路由
│   │   ├── api.rs           HTTP 接口与鉴权
│   │   ├── domain.rs        业务规则：会签、排期、设计、开发、测试、发布
│   │   ├── models.rs        数据模型
│   │   ├── db.rs            SQLite 持久化
│   │   ├── pg.rs            Postgres 持久化
│   │   ├── seed.rs          种子数据（8 名测试员工与演示项目）
│   │   ├── dingtalk.rs      钉钉登录与通讯录同步
│   │   ├── gitlab.rs        GitLab 分支 / MR / 流水线 / Webhook
│   │   └── experience.rs    需求活文档与经验沉淀
│   ├── tests/
│   │   ├── mock-integrations.mjs  钉钉 / GitLab mock
│   │   ├── test-api.sh            API 回归
│   │   ├── test-integrations.sh   集成回归（脚本自起临时服务端）
│   │   └── test-gitlab-real.sh    真实 GitLab 回归
│   └── Dockerfile           Debian 运行镜像（docker-compose 使用）
├── tests/host-bff.mjs       宿主 BFF 回归（Cookie / CSRF / 会话归属 / 路径边界）
├── tools/
│   ├── reset-workbench-test-data.sh  重置测试数据（清空后回到种子基线）
│   ├── workbench-db-backup.sh        SQLite 在线备份
│   └── dsh-session-backup.sh         DSH 会话备份
├── TESTING.md               从装服务端到逐角色验收的完整指南
├── .github/workflows/ci.yml CI：格式检查、构建、单元 / API / 集成回归
├── docker-compose.yml       Postgres + 服务端本地编排
└── .env.example             Docker / 生产环境变量样例
```

运行时生成（不提交）：`runtime/`（DSH 工作目录与临时库）、`server/data/`（SQLite）、
`dist/`（打包产物）、`.local/`、`.env`；桌面端本机映射在 `~/.dsh/cache/dsh-workbench-poc/local.json`。

## 验证

```bash
(cd server && cargo test && cargo build)                      # 服务端单元测试
(cd server && DATABASE_PATH=/tmp/wb.db PORT=3211 ./target/debug/dsh-workbench-server &) ; sleep 2
BASE=http://127.0.0.1:3211 bash server/tests/test-api.sh      # API 回归（临时库）
bash server/tests/test-integrations.sh                        # 钉钉 / GitLab 集成回归
node tests/host-bff.mjs                                       # 宿主 BFF 回归
(cd plugin && npm run check && npm run pack:dry)               # 插件语法与打包
```

## 本机数据

| 路径 | 内容 | 是否提交 |
| --- | --- | --- |
| `runtime/` | DSH 工作目录、需求文件夹、临时数据库 | 否 |
| `server/data/` | SQLite 数据库 | 否 |
| `server/target/` | Rust 构建产物 | 否 |
| `dist/` | `npm pack` 产物 | 否 |
| `~/.dsh/cache/dsh-workbench-poc/local.json` | 本机路径与 DSH 会话映射，**不要上传** | 仓库外 |
| `~/.dsh/backups/` | SQLite 备份（`tools/workbench-db-backup.sh`） | 仓库外 |

## 生产

必须设置 `APP_ENV=production` 和强随机 `WORKBENCH_AUTH_SECRET` / `WORKBENCH_INTERNAL_TOKEN`，
在反向代理上启用 HTTPS，并接入钉钉登录；配置项见 [`.env.example`](.env.example)。
