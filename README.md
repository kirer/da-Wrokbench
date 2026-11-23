# DSH 部门研发工作台

DSH 插件形态的部门研发工作台：左侧是迭代/需求/通知/技能入口，右侧是基于
Design Studio 改造的「需求原型」与「设计稿」双画布；共享协作数据由 Rust 服务端保存。

## 目录

| 目录 | 内容 |
| --- | --- |
| [`design/`](design/) | 高保真设计稿与设计系统参考（HTML/CSS，浏览器直接打开） |
| [`docs/`](docs/) | 需求梳理、设计提示词、差异评审、POC 结论和代码审查记录 |
| [`poc/`](poc/) | 可运行实现：DSH 插件、Host BFF、Rust 服务端、部署与测试 |
| [`artifacts/`](artifacts/) | 验收截图与应用界面存档 |
| [`.github/`](.github/) | CI 工作流 |
| [`.claude/`](.claude/) | 本地预览启动配置 |

## 快速开始

实现说明、环境变量、HTTP API 和测试命令见 [`poc/README.md`](poc/README.md)。

```bash
# 1. 启动 Rust 团队服务端（SQLite，默认 :3210）
(cd poc/server && cargo run)

# 2. 另一个终端，在项目根目录启动 DSH 插件宿主
DSH_WORKBENCH_BASE="$PWD/poc/runtime/workbench" \
WORKBENCH_SERVER_URL=http://127.0.0.1:3210 \
dsh --profile workbench-poc --no-open --port 3199
```

Docker/Postgres 启动方式见 [`poc/docker-compose.yml`](poc/docker-compose.yml)，
仿真容器部署见 [`poc/deploy/dsh-sim/`](poc/deploy/dsh-sim/)。

## 文档入口

- 需求与方案：[`docs/需求梳理与方案建议.md`](docs/需求梳理与方案建议.md)
- 设计交付与提示词：[`docs/设计图交付清单.md`](docs/设计图交付清单.md)、
  [`docs/设计稿Agent提示词.md`](docs/设计稿Agent提示词.md)
- 设计修订与差异：[`docs/设计修订说明与提示词.md`](docs/设计修订说明与提示词.md)、
  [`docs/设计稿差异评审.md`](docs/设计稿差异评审.md)
- 验证结论：[`docs/POC结论.md`](docs/POC结论.md)
- 代码审查：[`docs/reviews/REVIEW-2026-11-22.md`](docs/reviews/REVIEW-2026-11-22.md)

## 约定

- `poc/runtime/` 是本机 DSH 工作目录和临时数据库，已被 `.gitignore`/`.dockerignore` 排除。
- `poc/e2e/` 下根目录脚本是当前可复用的浏览器验证；`e2e/debug/` 是排障用的一次性脚本；
  `e2e/tests/` 是 Playwright 回归用例。
- 截图：最终验收图在 `poc/deploy/dsh-sim/screenshots/final/`，历史图在 `archive/`；
  应用整体截图在 `artifacts/screenshots/`。
