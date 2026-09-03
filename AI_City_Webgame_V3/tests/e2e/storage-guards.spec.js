import { test, expect } from '@playwright/test';
import { SAVE_MESSAGES } from '../../src/core/Constants.js';

// 게임 픽스처는 goto를 먼저 하므로, 저장소를 막는 initScript를 붙이려면 부팅을 직접 몰아야 한다.
async function bootGame(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME_STATE__ && typeof window.render_game_to_text === 'function', {
    timeout: 10000,
  });
  await expect(page.locator('#loadingScreen')).toHaveClass(/done/, { timeout: 10000 });
  await page.waitForTimeout(500);
  const storyNext = page.locator('#storyNext');
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
    if (!await storyNext.isVisible().catch(() => false)) break;
    await storyNext.click();
  }
}

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

// 저장이 조용히 실패하면 학생은 도시가 남아 있다고 믿고 새로고침한다. 실패는 반드시
// 알려야 하지만, 정산·건설마다 같은 경고가 쌓이면 화면을 덮으므로 세션당 한 번만 띄운다.
test('저장이 막히면 자동저장 실패를 한 번만 알린다', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function blockedSetItem(key, value) {
      if (String(key).startsWith('ai-city-save')) throw new Error('QuotaExceededError');
      return original.call(this, key, value);
    };
    // 토스트는 몇 초 뒤 스스로 사라지고 세 개가 넘으면 밀려난다. 부팅 직후 첫 정산 저장부터
    // 실패할 수 있으므로, 화면에 남아 있는지가 아니라 "몇 번 떴는지"를 처음부터 기록한다.
    window.__SAVE_TOASTS__ = [];
    const observe = () => {
      const stack = document.getElementById('toastStack');
      if (!stack) return false;
      new MutationObserver((records) => {
        records.forEach(({ addedNodes }) => addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.classList.contains('toast')) {
            window.__SAVE_TOASTS__.push(node.textContent);
          }
        }));
      }).observe(stack, { childList: true });
      return true;
    };
    if (!observe()) document.addEventListener('DOMContentLoaded', observe, { once: true });
  });

  await bootGame(page);
  const title = SAVE_MESSAGES.STORAGE_BLOCKED_TITLE;
  const seen = () => page.evaluate(
    (expected) => window.__SAVE_TOASTS__.filter((text) => text.includes(expected)).length,
    title,
  );

  const mobile = await page.evaluate(() => matchMedia('(max-width: 760px)').matches);
  await page.locator(mobile ? '.mobile-bar [data-hud-target="build"]' : '.hud-rail [data-hud-target="build"]').click();
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);

  // 건설로 예약된 자동저장이 실패하면 경고가 뜬다.
  await expect.poll(seen).toBe(1);
  expect(await page.evaluate(
    (expected) => window.__SAVE_TOASTS__.find((text) => text.includes(expected)),
    title,
  )).toContain(SAVE_MESSAGES.STORAGE_BLOCKED_TEXT);

  // 이후 저장 시도는 계속 실패하지만 다시 알리지 않는다.
  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.SAVE_REQUESTED, {}));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.SAVE_REQUESTED, {}));
  await page.waitForTimeout(1200);
  expect(await seen()).toBe(1);
});
