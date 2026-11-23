import { defineConfig } from '@playwright/test'

// DSH_URL 必须是 dsh web 打印的完整地址（含 ?token=...）。
// UI 用例依赖一个已经启动的 DSH 宿主和 Rust 团队服务端；CI 中默认跳过，
// 在具备 DSH_BIN 的环境里设置 E2E_DSH=1 后运行。
export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
})
