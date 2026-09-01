import { test, expect } from '../fixtures/game-test.js';
import { openHudPanel } from '../helpers/playthrough.js';

test('post-tutorial quest panel shows three selectable objective cards and a two-of-three claim', async ({ gamePage: page }) => {
  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.EXPANSION_CHOICE_REQUESTED, {}));
  await page.locator('[data-expansion-side="east"]').click();
  await openHudPanel(page, 'quest');

  await expect(page.locator('#questPanelLevel')).toContainText('CHAPTER 2');
  await expect(page.locator('#questPanelTitle')).toHaveText('전환 방향 선택');
  await expect(page.locator('.objective-card')).toHaveCount(3);
  await expect(page.locator('#questPanelExpandBtn')).toBeHidden();
  await expect(page.locator('#questPanelClaimBtn')).toBeDisabled();

  await page.evaluate(() => {
    const progress = window.__GAME_STATE__.progression.objectiveProgress;
    progress['transition-low-carbon'] = { consecutiveDays: 3, completed: true, value: 3, target: 3 };
    progress['transition-carbon'] = { consecutiveDays: 3, completed: true, value: 3, target: 3 };
    window.__refreshGameForTest();
  });
  await expect(page.locator('.objective-card.complete')).toHaveCount(2);
  await expect(page.locator('#questPanelClaimBtn')).toBeEnabled();
  await page.locator('#questPanelClaimBtn').click();

  expect(await page.evaluate(() => ({
    setId: window.__GAME_STATE__.progression.objectiveSetId,
    phase: window.__GAME_STATE__.expansion.phase,
    cells: window.__GAME_STATE__.expansion.activeCellIndices.length,
    permit: window.__GAME_STATE__.upgradePermitLevel,
    battery: window.__GAME_STATE__.unlockedFacilities.has('battery'),
  }))).toEqual({ setId: 'specialization', phase: 2, cells: 37, permit: 2, battery: true });
});

test('objective panel remains touch-readable at 390 by 844', async ({ gamePage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.EXPANSION_CHOICE_REQUESTED, {}));
  await page.locator('[data-expansion-side="west"]').click();
  await page.locator('.mobile-bar [data-hud-target="quest"]').click();
  await page.locator('#questPanel').waitFor({ state: 'visible' });
  const panel = page.locator('#questPanel');
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(page.locator('.objective-card')).toHaveCount(3);
  await expect(page.locator('.objective-card').first()).toContainText('저탄소 전환');
});

test('top HUD follows objective chapters and the final test instead of freezing at recovery level seven', async ({ gamePage: page }) => {
  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.EXPANSION_CHOICE_REQUESTED, {}));
  await page.locator('[data-expansion-side="east"]').click();

  await expect(page.locator('#phaseText')).toHaveText('운영 챕터 2 / 4');
  await expect(page.locator('#missionTitle')).toHaveText('전환 방향 선택');
  await expect(page.locator('#phaseText')).not.toContainText('7 / 15');

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.progression.chapter = 3;
    state.progression.objectiveSetId = 'resilience';
    state.progression.objectiveProgress = {};
    window.__refreshGameForTest();
  });
  await expect(page.locator('#phaseText')).toHaveText('운영 챕터 3 / 4');
  await expect(page.locator('#missionTitle')).toHaveText('회복탄력 도시');

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.progression.chapter = 4;
    state.progression.objectiveSetId = null;
    state.stressTest.status = 'failed';
    state.stressTest.result = { passed: false, diagnosis: { label: '필수시설 평균 전력 공급이 부족했습니다.' } };
    window.__refreshGameForTest();
  });
  await expect(page.locator('#phaseText')).toHaveText('최종 시험 · 재도전');
  await expect(page.locator('#missionTitle')).toHaveText('도시 스트레스 테스트');
});
