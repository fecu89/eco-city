import { test, expect } from '../fixtures/game-test.js';
import { chooseExpansionViaUi, claimProgressViaUi, openHudPanel } from '../helpers/playthrough.js';

test('west first expansion switches quests and level eight opens the east side', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 6;
    state.questStatus = 'ready_to_claim';
    state.questProgress = { consecutiveDays: 2 };
    state.credits = 100;
    state.claimedQuestIds = new Set([
      'first-citizens', 'power-on', 'jobs-and-tax', 'research-seed', 'growth-cost',
    ]);
    state.unlockedFacilities = new Set([
      'residential', 'factory', 'thermal', 'green', 'data', 'nuclear', 'cooling',
    ]);
    window.__refreshGameForTest();
  });

  await claimProgressViaUi(page);
  await chooseExpansionViaUi(page, 'west');
  await openHudPanel(page, 'quest');
  await expect(page.locator('#questPanelTitle')).toHaveText('풍력 연구 기초');
  expect(await page.evaluate(() => ({
    wind: window.__GAME_STATE__.unlockedFacilities.has('wind'),
    solar: window.__GAME_STATE__.unlockedFacilities.has('solar'),
    phase: window.__GAME_STATE__.expansion.phase,
  }))).toEqual({ wind: true, solar: false, phase: 1 });

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.research.completedIds.add('wind2');
    window.__refreshGameForTest();
  });
  await claimProgressViaUi(page);

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.grid[0] = { type: 'data', level: 2, priority: 'normal' };
    state.research.completedIds.add('smartGrid');
    window.__refreshGameForTest();
  });
  await claimProgressViaUi(page);

  await expect(page.locator('#questPanelTitle')).toHaveText('태양광 실증망');
  expect(await page.evaluate(() => ({
    phase: window.__GAME_STATE__.expansion.phase,
    activeCells: window.__GAME_STATE__.expansion.activeCellIndices.length,
    solar: window.__GAME_STATE__.unlockedFacilities.has('solar'),
    questIndex: window.__GAME_STATE__.questIndex,
  }))).toEqual({ phase: 2, activeCells: 37, solar: true, questIndex: 9 });
});
