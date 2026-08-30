import { test, expect } from '../fixtures/game-test.js';

test('seven unsafe carbon days pause the city and show a blocking reset modal', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.questIndex = 6;
    state.carbonCrisisHours = 167;
    state.grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
    state.grid[1] = { type: 'thermal', level: 1, priority: 'normal' };
    window.__settleSimulationHour();
  });

  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#modalCard')).toContainText('탄소 임계치');
  expect(await page.evaluate(() => window.__GAME_STATE__.gameOver)).toBe(true);
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).toContain('game-over');
  expect(JSON.parse(await page.evaluate(() => window.render_game_to_text()))).toMatchObject({
    mode: 'game_over',
    carbonCrisisHours: 168,
    carbonCrisisLimit: 168,
  });
});
