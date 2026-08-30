import { test, expect } from '../fixtures/game-test.js';

test('demolition requires an irreversible-action confirmation before changing the city', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });
  await page.locator('#demolishBtn').click();
  await expect(page.locator('#modalCard')).toContainText('되돌릴 수 없습니다');
  await expect(page.locator('#modalCard')).toContainText('환급 1.00 💰');
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0]?.type)).toBe('residential');
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).not.toContain('demolition-confirm');

  await page.locator('#confirmDemolishBtn').click();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toBeNull();
});
