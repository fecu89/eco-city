import { test, expect } from '../fixtures/game-test.js';
import { chooseExpansionViaUi, claimProgressViaUi, openHudPanel } from '../helpers/playthrough.js';

test('the real HUD routes quest six into the heatwave campaign without legacy objective cards', async ({ gamePage: page }) => {
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(10);

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 6;
    state.questStatus = 'ready_to_claim';
    state.questProgress = { consecutiveDays: 2 };
    state.credits = 40;
    state.claimedQuestIds = new Set([
      'first-citizens', 'power-on', 'jobs-and-tax', 'research-seed', 'growth-cost',
    ]);
    state.unlockedFacilities = new Set([
      'residential', 'factory', 'thermal', 'green', 'data', 'nuclear', 'cooling',
    ]);
    state.grid = Array(19).fill(null);
    state.grid[0] = { type: 'data', level: 1, priority: 'normal', operationMode: 'normal' };
    state.grid[5] = { type: 'nuclear', level: 1, priority: 'normal', operationMode: 'normal' };
    state.grid[6] = { type: 'cooling', level: 1, priority: 'essential', operationMode: 'normal' };
    state.grid[13] = { type: 'thermal', level: 1, priority: 'normal', operationMode: 'normal' };
    state.grid[1] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
    state.grid[2] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
    state.baseline = { dailyWater: 12 };
    window.__refreshGameForTest();
  });

  await claimProgressViaUi(page);
  await expect(page.locator('#modalCard')).toContainText('첫 확장 방향을 선택하세요');
  await chooseExpansionViaUi(page, 'east');

  await openHudPanel(page, 'quest');
  await expect(page.locator('[data-hud-panel="quest"]')).toContainText('폭염 경보');
  await expect(page.locator('[data-hud-panel="quest"]')).toContainText('24일');
  expect(await page.evaluate(() => ({
    questIndex: window.__GAME_STATE__.questIndex,
    chapter: window.__GAME_STATE__.progression.chapter,
    objectiveSetId: window.__GAME_STATE__.progression.objectiveSetId,
    climateStatus: window.__GAME_STATE__.climateCampaign.status,
    activeCells: window.__GAME_STATE__.expansion.activeCellIndices.length,
  }))).toEqual({
    questIndex: 7,
    chapter: 3,
    objectiveSetId: null,
    climateStatus: 'briefing',
    activeCells: 28,
  });

  await page.locator('#questPanelClaimBtn').click();
  expect(await page.evaluate(() => ({
    status: window.__GAME_STATE__.climateCampaign.status,
    startsIn: window.__GAME_STATE__.events.schedule[0].startAt - window.__GAME_STATE__.elapsedGameDays,
    type: window.__GAME_STATE__.events.schedule[0].type,
  }))).toEqual({ status: 'preparation', startsIn: 24, type: 'heatwave' });

  await page.evaluate(() => window.__setTimeScale(1));
  await page.evaluate(() => window.__settleSimulationDay());
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#forecastStrip')).toBeHidden();
  expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).climateCampaign)).toMatchObject({
    questIndex: 7,
    status: 'preparation',
    eventType: 'heatwave',
  });
});
