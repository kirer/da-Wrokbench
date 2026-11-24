# DSH 部门研发工作台

DSH 插件形态的部门研发工作台：左侧是迭代/需求/通知/技能入口，右侧是基于
Design Studio 改造的「需求原型」与「设计稿」双画布；共享协作数据由 Rust 服务端保存。

**仓库根目录就是插件目录** —— `package.json`、`index.js`、`client.js` 都在根上，
`dsh plugin add <仓库路径>` 直接指向根目录即可。

## 目录

### 插件本体（DSH 加载这些）

| 路径 | 内容 |
| --- | --- |
| [`package.json`](package.json) | 插件清单：`main`、`exports`、`dsh.bundle` / `dsh.client` |
| [`index.js`](index.js) | **宿主半端（Host BFF）**：同源 Cookie 鉴权、转发服务端、本机文件夹与 DSH 会话映射 |
| [`client.js`](client.js) | **浏览器半端**：左侧「研发工作台」主面板 |
| [`client.design-studio.js`](client.design-studio.js) | 浏览器半端的 Design Studio chunk，必须与 `client.js` 同目录 |
| [`cordis.patch.yml`](cordis.patch.yml) | profile patch：把 `dsh-workbench` 插进插件栈 |
| [`design-studio/`](design-studio/) | 内嵌的 `dsh-design-studio@0.29.0`（MIT）宿主半端：画布、外观、体检、导出、版本 |

`npm pack` 只会打包上面这些（见 `package.json` 的 `files`），服务端和部署脚本不会进包。

### 服务与工具（插件不加载）

| 路径 | 内容 |
| --- | --- |
| [`server/`](server/) | **Rust 团队服务端**（axum；SQLite 或 Postgres）+ API/集成/GitLab 测试脚本 |
| [`tests/host-bff.mjs`](tests/host-bff.mjs) | 宿主 BFF 回归：Cookie、CSRF、会话归属、路径边界 |
| [`e2e/`](e2e/) | Playwright 浏览器回归与截图脚本 |
| [`deploy/`](deploy/) | 部署：`gitlab/`（本地 GitLab CE + Runner）、`dsh-sim/`（多角色容器仿真）、`dsh-uat/`（UAT 编排）、`init-env.sh` |
| [`tools/`](tools/) | 运维脚本（DSH 会话备份） |
| [`docker-compose.yml`](docker-compose.yml) | Postgres + 服务端的本地编排 |

### 文档与素材

| 路径 | 内容 |
| --- | --- |
| [`docs/实现说明.md`](docs/实现说明.md) | 完整实现说明：架构、环境变量、HTTP API、页面、生命周期、测试命令 |
| [`docs/`](docs/) | 需求梳理、设计提示词、差异评审、POC 结论、审查记录（[索引](docs/README.md)） |
| [`design/`](design/) | 高保真设计稿与设计系统参考（HTML/CSS，浏览器直接打开） |
| [`artifacts/`](artifacts/) | 验收截图与应用界面存档 |
| [`CODE-REVIEW-50.md`](CODE-REVIEW-50.md) | 50 轮代码审查报告（74 条发现） |
| [`.github/`](.github/) | CI 工作流 |
| [`.claude/`](.claude/) | 本地预览启动配置 |

## 快速开始

```bash
# 1. 启动 Rust 团队服务端（SQLite，默认 :3210）
(cd server && cargo run)

# 2. 另一个终端，在仓库根目录安装并启动插件
REPO_ROOT="$(git rev-parse --show-toplevel)"
# 首次：以默认 web profile 为底建 workbench-poc；已有该 profile 时跳过，否则会被覆盖
[ -d ~/.dsh/profiles/workbench-poc ] || \
  dsh --profile workbench-poc --from-default-profile web --dump-config >/dev/null
dsh plugin --profile workbench-poc add "$REPO_ROOT"

WORKBENCH_SERVER_URL=http://127.0.0.1:3210 \
DSH_WORKBENCH_BASE="$REPO_ROOT/runtime/workbench" \
dsh --profile workbench-poc --no-open --port 3199
```

打开终端输出的带 token URL，左侧出现「研发工作台」。Mock 模式点一个种子用户即可登录，
然后完成首次引导：默认身份、负责平台、本机顶级文件夹。

Docker/Postgres 方式见 [`docker-compose.yml`](docker-compose.yml)；
多角色容器仿真见 [`deploy/dsh-sim/`](deploy/dsh-sim/)；
本地真实 GitLab 见 [`deploy/gitlab/README.md`](deploy/gitlab/README.md)。

环境变量、HTTP API、权限矩阵、生命周期和完整测试命令见
[`docs/实现说明.md`](docs/实现说明.md)。

## 验证

```bash
# 服务端单元测试（8 项）+ 构建
(cd server && cargo test && cargo build)

# API 回归（112 项）：先起一个临时服务端
(cd server && DATABASE_PATH=/tmp/wb.db PORT=3211 ./target/debug/dsh-workbench-server &) ; sleep 2
BASE=http://127.0.0.1:3211 bash server/test-api.sh

# 钉钉 / GitLab 集成回归（34 项，脚本自己起临时服务端）
bash server/test-integrations.sh

# 宿主 BFF 回归（51 项，自己拉起临时服务端）
node tests/host-bff.mjs

# 插件语法与打包
npm run check && npm run pack:dry
```

## 本机数据

| 路径 | 内容 | 是否提交 |
| --- | --- | --- |
| `runtime/` | DSH 工作目录、需求文件夹、临时数据库 | 否 |
| `.local/` | GitLab root 密码、机器人 token、Runner token（600） | 否 |
| `server/data/` | SQLite 数据库 | 否 |
| `server/target/` | Rust 构建产物 | 否 |
| `~/.dsh/cache/dsh-workbench-poc/local.json` | 本机路径与 DSH 会话映射，**不要上传** | 仓库外 |

## 约定

- `e2e/` 根目录脚本是当前可复用的浏览器验证；`e2e/debug/` 是排障用的一次性脚本；
  `e2e/tests/` 是 Playwright 回归用例。
- 截图：最终验收图在 `deploy/dsh-sim/screenshots/final/`，历史图在 `archive/`；
  应用整体截图在 `artifacts/screenshots/`。
- 生产环境必须设置 `APP_ENV=production`、强随机 `WORKBENCH_AUTH_SECRET` /
  `WORKBENCH_INTERNAL_TOKEN`，并在反向代理上启用 HTTPS；详见
  [`docs/实现说明.md`](docs/实现说明.md)。
