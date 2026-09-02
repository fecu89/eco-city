import { test, expect } from '../fixtures/game-test.js';
// 저장 파일에서 부팅하는 시나리오는 공용 fixture(스토리를 넘겨 주는)를 쓸 수 없어 직접 이동한다.
import { test as rawTest } from '@playwright/test';

test('a tick-driven game over replaces a player-opened panel instead of being swallowed by it', async ({ gamePage: page }) => {
  await page.locator('[data-hud-target="settings"]').first().click();
  await page.locator('#helpBtn').click();
  await expect(page.locator('#modalCard')).toHaveAttribute('data-modal-id', 'panel');

  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.GAME_OVER, { summary: { dailyCarbon: 30 } }));

  await expect(page.locator('#modalCard')).toHaveAttribute('data-modal-id', 'game-over');
  await expect(page.locator('#restartAfterGameOver')).toBeVisible();
  // 도움말은 되돌아올 필요가 없는 창이라 대기열에 남지 않는다.
  expect(await page.evaluate(() => window.__getModalState().queueLength)).toBe(0);
});

test('an operational risk pause replaces the facility inspector and does not bring it back', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });
  await expect(page.locator('.facility-inspector-grid')).toBeVisible();

  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.OPERATIONAL_RISK_PAUSE, { reason: 'credit' }));
  await expect(page.locator('#modalCard')).toHaveAttribute('data-modal-id', 'operational-risk');
  expect(await page.evaluate(() => window.__getModalState().queueLength)).toBe(0);

  await page.locator('#acknowledgeOperationalRisk').click();
  await expect(page.locator('#modal')).toBeHidden();
});

test('a blocking project cancel prompt returns after a more urgent modal closes', async ({ gamePage: page }) => {
  await page.locator('[data-hud-target="build"]').first().click();
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('[data-construction-console="build"]')).toBeVisible();
  await page.locator('#cancelProjectBtn').click();
  await expect(page.locator('[data-project-cancel-confirm]')).toBeVisible();

  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.OPERATIONAL_RISK_PAUSE, { reason: 'credit' }));
  await expect(page.locator('#modalCard')).toHaveAttribute('data-modal-id', 'operational-risk');
  expect(await page.evaluate(() => window.__getModalState().queueLength)).toBe(1);

  await page.locator('#acknowledgeOperationalRisk').click();
  await expect(page.locator('#modalCard')).toHaveAttribute('data-modal-id', 'project-cancel');
  await expect(page.locator('[data-project-cancel-confirm]')).toBeVisible();
  // 다시 붙인 마크업이 아니라 원래 노드가 돌아와야 한다 — 오프너가 붙인 리스너가 살아 있어야 한다.
  await page.locator('#keepProjectBtn').click();
  await expect(page.locator('[data-construction-console="build"]')).toBeVisible();
});

rawTest('a game-over save keeps the story queued behind the blocking modal until reset', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME_STATE__ && document.querySelector('#loadingScreen.done'));
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.gameOver = true;
    state.gameOverReason = 'carbon_crisis';
    state.onboardingVersionSeen = 0;
    localStorage.setItem('ai-city-save-v1', JSON.stringify(state.serialize()));
  });

  await page.reload();
  await page.waitForFunction(() => window.__GAME_STATE__?.gameOver === true);
  await expect(page.locator('#modalCard')).toHaveAttribute('data-modal-id', 'game-over');
  expect(await page.evaluate(() => window.__getSimulationState().paused)).toBe(true);
  await expect(page.locator('#storyNext')).toBeHidden();
  expect(await page.evaluate(() => window.__getModalState().queueLength)).toBe(1);

  await page.locator('#restartAfterGameOver').click();
  await expect(page.locator('#storyTitle')).toHaveText('2040년, 멈춰가는 도시');
  expect(await page.evaluate(() => window.__getModalState())).toMatchObject({ id: 'story', queueLength: 0 });
});
