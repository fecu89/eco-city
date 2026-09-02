import { test, expect } from '../fixtures/game-test.js';

// 6단계 보상 직후 확장 선택 모달을 닫기 전에 새로고침하면 자동저장은 이미
// questIndex 7 · expansion.phase 0을 기록한 상태다. 부팅이 다시 묻지 않으면
// 태양광/풍력이 영원히 잠겨 7단계에서 진행이 막힌다.
async function waitForBootedPage(page) {
  await page.waitForFunction(() => window.__GAME_STATE__ && typeof window.render_game_to_text === 'function', {
    timeout: 10000,
  });
  await page.waitForFunction(() => document.getElementById('loadingScreen')?.classList.contains('done'), {
    timeout: 5000,
  });
  await page.waitForTimeout(500);
}

test('a save made before the expansion choice re-asks on the next boot', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 7;
    state.questStatus = 'active';
    state.stage = 5;
    state.credits = 40;
    state.claimedQuestIds = new Set([
      'first-citizens', 'power-on', 'jobs-and-tax', 'research-seed', 'growth-cost', 'water-cycle',
    ]);
    state.unlockedFacilities = new Set([
      'residential', 'factory', 'thermal', 'green', 'data', 'nuclear', 'cooling',
    ]);
    state.expansion = { phase: 0, firstChoice: null, activeCellIndices: state.expansion.activeCellIndices };
    window.__EVENT_BUS__.emit(window.__EVENTS__.SAVE_REQUESTED, {});
  });
  await page.waitForTimeout(1000);

  await page.reload();
  await waitForBootedPage(page);

  expect(await page.evaluate(() => ({
    questIndex: window.__GAME_STATE__.questIndex,
    phase: window.__GAME_STATE__.expansion.phase,
  }))).toEqual({ questIndex: 7, phase: 0 });
  await expect(page.locator('#modalCard[data-modal-id="expansion-choice"]')).toBeVisible();

  await page.locator('[data-expansion-side="east"]').click();
  await page.waitForFunction(() => window.__GAME_STATE__.expansion.phase === 1);
  expect(await page.evaluate(() => ({
    phase: window.__GAME_STATE__.expansion.phase,
    firstChoice: window.__GAME_STATE__.expansion.firstChoice,
    solar: window.__GAME_STATE__.unlockedFacilities.has('solar'),
    activeCells: window.__GAME_STATE__.expansion.activeCellIndices.length,
  }))).toEqual({ phase: 1, firstChoice: 'east', solar: true, activeCells: 28 });
});

test('an already expanded save does not re-open the expansion choice', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 7;
    state.questStatus = 'active';
    state.stage = 5;
    state.expansion = {
      phase: 1,
      firstChoice: 'east',
      activeCellIndices: Array.from({ length: 28 }, (_, index) => index),
    };
    state.boardRadius = 3;
    state.grid = Array.from({ length: 37 }, (_, index) => state.grid[index] ?? null);
    state.unlockedFacilities.add('solar');
    window.__EVENT_BUS__.emit(window.__EVENTS__.SAVE_REQUESTED, {});
  });
  await page.waitForTimeout(1000);

  await page.reload();
  await waitForBootedPage(page);

  await expect(page.locator('#modalCard[data-modal-id="expansion-choice"]')).toHaveCount(0);
});
