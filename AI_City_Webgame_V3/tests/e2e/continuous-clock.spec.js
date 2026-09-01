import { test, expect } from '../fixtures/game-test.js';

test('HUD shows only the date while the daily simulation keeps advancing', async ({ gamePage: page }) => {
  await expect(page.locator('#settlementProgress')).toHaveCount(0);
  await expect(page.locator('.settlement-line')).toHaveCount(0);
  await expect(page.locator('.city-celestial-layer')).toHaveCount(0);

  await page.evaluate(() => window.__setTimeScale(0));
  const pausedStart = await page.locator('#simTime').textContent();
  const pausedDays = await page.evaluate(() => window.__GAME_STATE__.elapsedGameDays);
  expect(pausedStart).toBe('2040-01-01');
  expect(pausedStart).not.toContain(':');
  await page.waitForTimeout(180);
  await expect(page.locator('#simTime')).toHaveText(pausedStart);
  expect(await page.evaluate(() => window.__GAME_STATE__.elapsedGameDays)).toBe(pausedDays);

  await page.evaluate(() => window.__settleSimulationDay());
  expect(await page.evaluate(() => window.__GAME_STATE__.elapsedGameDays)).toBe(pausedDays + 1);
  await expect(page.locator('#simTime')).toHaveText('2040-01-02');
});
