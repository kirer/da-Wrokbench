# 浏览器 E2E

Playwright 用例覆盖研发工作台主界面、需求活文档/附件、通知聚合、管理员后台和右侧需求/设计画布。

## 前置条件

1. Rust 服务端已启动（默认 `http://127.0.0.1:3210`）。
2. DSH 宿主已用工作台插件启动，例如：

   ```bash
   DSH_WORKBENCH_BASE=/path/to/poc/runtime/workbench \
   WORKBENCH_SERVER_URL=http://127.0.0.1:3210 \
   dsh --profile workbench-poc --no-open --port 3199
   ```

3. 记下 `dsh web` 打印的完整地址（含 `?token=...`）。

## 运行

```bash
cd poc/e2e
npm install
npx playwright install chromium
DSH_URL='http://127.0.0.1:3199/?token=...' npx playwright test
```

截图输出到 `screenshots/`，失败时的 trace 在 `test-results/`。CI 默认只跑服务端 API 与集成回归；设置仓库变量 `DSH_E2E_ENABLED=1` 并提供 `DSH_URL` secret 后才会跑 UI 用例。

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
| 右侧需求与设计画布 | 会话归属人打开右栏、无身份冲突、Design Studio 画布加载 |
