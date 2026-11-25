# 浏览器 E2E

Playwright 用例覆盖研发工作台主界面、需求活文档/附件、通知聚合、管理员后台和右侧需求/设计画布。

## 前置条件

1. Rust 服务端已启动（默认 `http://127.0.0.1:3210`）。
2. DSH 宿主已用工作台插件启动，例如：

   ```bash
   DSH_WORKBENCH_BASE=/path/to/da-Workbench/runtime/workbench \
   WORKBENCH_SERVER_URL=http://127.0.0.1:3210 \
   dsh --profile workbench-poc --no-open --port 3199
   ```

3. 记下 `dsh web` 打印的完整地址（含 `?token=...`）。

## 运行

```bash
cd e2e
npm install
npx playwright install chromium
DSH_URL='http://127.0.0.1:3199/?token=...' npx playwright test
```

截图输出到 `screenshots/`，失败时的 trace 在 `test-results/`。CI 默认只跑服务端 API 与集成回归；设置仓库变量 `DSH_E2E_ENABLED=1` 并提供 `DSH_URL` secret 后才会跑 UI 用例。

## 桌面端真实绘制回归（2026-S13）

`desktop-s13.mjs` 在 DSH 桌面端（Electron CDP）里跑「一个迭代、两个需求、原型 +
设计稿」全链路。它只发提示词和点击，**不写任何 `prototype/`、`design/` 产物**；
产物必须由会话里的模型生成，脚本只读文件并截图取证。

```bash
# 1. 清空测试数据并重启服务端 + 桌面端（会退出桌面端，破坏性操作）
bash tools/reset-workbench-test-data.sh

# 2. 只做预检：服务端、登录、基线是否为 2 迭代 / 9 需求
node e2e/desktop-s13.mjs --preflight

# 3.（可选）只建迭代和两个需求，停在提示词，不调用模型
node e2e/desktop-s13.mjs --prepare

# 4. （可选）只验证已有交付：跨角色预览、我的作品、缩略图，不调用模型
node e2e/desktop-s13.mjs --verify

# 5. 跑全流程（约 30–50 分钟，取决于模型）
node e2e/desktop-s13.mjs

# 或者一条命令：先重置再跑
node e2e/desktop-s13.mjs --reset
```

- 桌面端必须带 `--remote-debugging-port=9222` 启动；重置脚本会负责重开。
- 证据（截图、草稿、会话记录、文件清单、`report.md` / `report.json`）写到
  `runtime/test-evidence/2026-S13-<时间>/`。
- 失败时不补产物、不重试模型；报告里会保留失败截图和会话尾部。
- 可选参数：`--allow-dirty`（跳过基线断言）、`--no-launch`（不自动启动桌面端）、
  `--timeout=<秒>`（单轮模型超时，默认 900）、`--evidence=<目录>`。

## 「在线教育」结构全流程

`check-online-education.mjs` 用一套干净数据跑「项目 → 迭代 → 两个需求 → 各角色进入需求」，
验证参与者卡片墙、进入需求自动建会话、设计 / 开发认领和发布状态。它不调用模型，几分钟内跑完：

```bash
# 先清空测试数据（会退出/重开桌面端）
bash tools/reset-workbench-test-data.sh

# 跑结构全流程（--reset 可以合并上一步）
node e2e/check-online-education.mjs
```

流程说明和当前缺口见 `docs/测试方案-在线教育全流程.md`；证据写到
`runtime/test-evidence/online-education-<时间>/`。真实原型 / 设计稿生成仍由
`desktop-s13.mjs` 覆盖。

## 脚本分层

- 根目录的 `check-*.mjs`、`container-*.mjs`、`open-design-tab.mjs`、`see-*.mjs`、
  `create-*.mjs`、`verify-split.mjs`：当前可复用的页面验证脚本，参数通常为带 token 的 DSH URL
  和截图名。
- `debug/`：排障用的检查脚本，会读取页面状态并输出调试信息；不属于回归套件。
- `tests/`：Playwright 回归用例，由 `npm test` 执行。

## 覆盖范围

| 用例 | 说明 |
| --- | --- |
| 工作台首页 / 需求详情 | 登录、需求列表、活文档、团队文件、附件上传入口 |
| 通知聚合 | 按需求筛选通知、未读状态 |
| 管理员后台 | 用户与角色、钉钉同步、集成状态、审计事件 |
| 右侧需求与设计画布 | 会话归属人打开右栏、无身份冲突、设计画布加载 |
