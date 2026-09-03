import { test, expect } from '../fixtures/game-test.js';

test('final stress test starts from the quest panel, owns the forecast strip, and preserves a failed city', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.questIndex = 15;
    state.progression.chapter = 4;
    state.stressTest.status = 'ready';
    state.research.completedIds.add('tidal1');
    state.credits = 20;
    for (let index = 0; index < 10; index += 1) {
      state.grid[index] = { type: 'residential', level: 1, priority: 'essential' };
    }
    state.grid[10] = { type: 'tidal', level: 1, priority: 'normal' };
    window.__refreshGameForTest();
  });

  await page.locator('[data-hud-target="quest"]').first().click();
  await expect(page.locator('#questPanelTitle')).toHaveText('대한민국 복합기후 시험');
  await expect(page.locator('#questPanelClaimBtn')).toHaveText('테스트 시작');
  await page.locator('#questPanelClaimBtn').click();
  await expect(page.locator('#modalCard')).toContainText('41일 동안 복합 위기');
  await expect(page.locator('.stress-phase-list article')).toHaveCount(8);
  await page.locator('#startStressTestBtn').click();

  expect(await page.evaluate(() => window.__GAME_STATE__.stressTest.status)).toBe('running');
  await expect(page.locator('#forecastStrip')).toContainText('기준 측정 · 3일 남음');
  await expect(page.locator('#questPanelClaimBtn')).toBeDisabled();

  await page.evaluate(() => {
    for (let day = 0; day < 41; day++) window.__settleSimulationDay();
  });
  await expect(page.locator('#modalCard')).toContainText('도시 보완 필요');
  await expect(page.locator('#modalCard')).toContainText('필수시설 평균 전력 공급이 82% 미만');
  await expect(page.locator('#modalCard')).toContainText('CO₂ 평균');
  await expect(page.locator('#modalCard')).toContainText('안전일');
  await expect(page.locator('#modalCard')).toContainText('조력 공급');
  await expect(page.locator('#modalCard')).toContainText('복구 달성');
  expect(await page.evaluate(() => ({
    status: window.__GAME_STATE__.stressTest.status,
    cell: window.__GAME_STATE__.grid[0]?.type,
    complete: window.__GAME_STATE__.campaignComplete,
  }))).toEqual({ status: 'failed', cell: 'residential', complete: false });

  await page.locator('#stressResultClose').click();
  await expect(page.locator('#questPanelClaimBtn')).toHaveText('테스트 재도전');
});

// 시험을 통과하면 같은 버튼이 "최종 보고서 보기"로 바뀐다. 예전에는 그 클릭이
// claimCurrentQuest로 떨어져 already_claimed를 돌려받고 아무 일도 일어나지 않았다.
test('시험을 통과한 뒤 퀘스트 버튼이 최종 보고서를 연다', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.questIndex = 19;
    state.progression.chapter = 4;
    state.stressTest.status = 'passed';
    state.stressTest.phaseIndex = 7;
    state.stressTest.result = { passed: true };
    window.__refreshGameForTest();
  });

  await page.locator('[data-hud-target="quest"]').first().click();
  await expect(page.locator('#questPanelClaimBtn')).toHaveText('최종 보고서 보기');
  await expect(page.locator('#questPanelClaimBtn')).toBeEnabled();

  await page.locator('#questPanelClaimBtn').click();
  await expect(page.locator('#modalCard')).toBeVisible();
  await expect(page.locator('#modalCard')).toContainText('기후 생존 도시 성적표');
});
