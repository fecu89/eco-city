import { test, expect } from '../fixtures/game-test.js';

test('operational panels keep the city clock running while explicit story and reset screens pause it', async ({ gamePage: page }) => {
  for (const target of ['build', 'quest', 'status', 'settings']) {
    await page.locator(`[data-hud-target="${target}"]`).first().click();
    expect(await page.evaluate(() => window.__getSimulationState().paused)).toBe(false);
    if (target === 'build') await page.locator('[data-hud-target="build"]').first().click();
    else await page.locator(`[data-hud-panel="${target}"] [data-hud-close]`).click();
  }

  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });
  await expect(page.locator('.facility-inspector-grid')).toBeVisible();
  expect(await page.evaluate(() => window.__getSimulationState().paused)).toBe(false);
  await page.locator('.modal-card .close-modal').click();

  await page.locator('[data-hud-target="settings"]').first().click();
  await page.locator('#storyReplayBtn').click();
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).toContain('story');
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) await page.locator('#storyNext').click();

  await page.locator('[data-hud-target="settings"]').first().click();
  await page.locator('#resetBtn').click();
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).toContain('reset');
  await page.locator('#cancelReset').click();
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).not.toContain('reset');
});
