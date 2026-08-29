import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  // 보드가 Three.js(WebGL)라 DOM 테스트보다 워커 하나당 CPU/GPU 비용이 훨씬 크다.
  // 기본 병렬 워커 수로 돌리면 리소스 경합으로 전체가 타임아웃되는 걸 겪어서 낮춰둔다.
  workers: 2,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 3000,
      threshold: 0.3,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
});
