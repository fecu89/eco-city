import { test, expect } from '../fixtures/game-test.js';

test('final stress test starts from the quest panel, owns the forecast strip, and preserves a failed city', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.progression.chapter = 4;
    state.progression.objectiveSetId = null;
    state.progression.completedObjectiveSetIds = ['transition-choice', 'specialization', 'resilience'];
    state.stressTest.status = 'ready';
    state.credits = 20;
    state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
    window.__refreshGameForTest();
  });

  await page.locator('[data-hud-target="quest"]').first().click();
  await expect(page.locator('#questPanelTitle')).toHaveText('도시 스트레스 테스트');
  await expect(page.locator('#questPanelClaimBtn')).toHaveText('테스트 시작');
  await page.locator('#questPanelClaimBtn').click();
  await expect(page.locator('#modalCard')).toContainText('27시간 동안 복합 위기');
  await expect(page.locator('.stress-phase-list article')).toHaveCount(5);
  await page.locator('#startStressTestBtn').click();

  expect(await page.evaluate(() => window.__GAME_STATE__.stressTest.status)).toBe('running');
  await expect(page.locator('#forecastStrip')).toContainText('평상시 · 4시간 남음');
  await expect(page.locator('#questPanelClaimBtn')).toBeDisabled();

  await page.evaluate(() => {
    for (let day = 0; day < 27; day++) window.__settleSimulationDay();
  });
  await expect(page.locator('#modalCard')).toContainText('도시 보완 필요');
  await expect(page.locator('#modalCard')).toContainText('필수시설 평균 전력 공급이 부족');
  expect(await page.evaluate(() => ({
    status: window.__GAME_STATE__.stressTest.status,
    cell: window.__GAME_STATE__.grid[0]?.type,
    complete: window.__GAME_STATE__.campaignComplete,
  }))).toEqual({ status: 'failed', cell: 'residential', complete: false });

  await page.locator('#stressResultClose').click();
  await expect(page.locator('#questPanelClaimBtn')).toHaveText('테스트 재도전');
});
