import { test, expect } from '../fixtures/game-test.js';

test('the scene uses sky gradients without celestial objects and keeps pooled night building lights', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.grid[0] = { type: 'residential', level: 1, priority: 'normal' };
    window.__refreshGameForTest();
    window.__setWorldHourForTest(12);
  });
  const day = await page.evaluate(() => window.__getCityRendererStats());
  expect(day.skyHour).toBe(12);
  expect(day.celestial).toBeUndefined();
  await expect(page.locator('.city-celestial-layer')).toHaveCount(0);
  expect(day.buildingLightCount).toBe(0);

  await page.evaluate(() => window.__setWorldHourForTest(23));
  const night = await page.evaluate(() => window.__getCityRendererStats());
  expect(night.skyHour).toBe(23);
  expect(night.celestial).toBeUndefined();
  expect(night.buildingLightCount).toBeGreaterThan(0);
  expect(night.hemisphereIntensity).toBeGreaterThanOrEqual(0.68);
});
