import { test, expect } from '@playwright/test';

// 학교 공용 PC의 시크릿 모드처럼 저장소를 차단한 브라우저에서도 부팅이 끝나야 한다.
test('localStorage가 차단된 브라우저에서도 게임이 부팅된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked'); },
    });
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__GAME_STATE__ && typeof window.render_game_to_text === 'function', {
    timeout: 10000,
  });
  await expect(page.locator('#loadingScreen')).toHaveClass(/done/, { timeout: 10000 });
  await expect(page.locator('#cityGrid')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});
