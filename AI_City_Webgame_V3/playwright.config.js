import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  // 보드가 Three.js(WebGL)라 브라우저 두 개만 겹쳐도 장시간 전체 실행에서 GPU 작업이
  // 로딩·모션 타이머를 막을 수 있다. 단일 워커로 기능 실패와 자원 경합을 분리한다.
  workers: 1,
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
