import { test, expect } from '../fixtures/game-test.js';
import { openHudPanel } from '../helpers/playthrough.js';

async function chartPixels(page) {
  return page.locator('#cityChart').evaluate((canvas) => canvas.toDataURL());
}

test('open city chart interpolates across most of the one-times tick interval', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    window.__GAME_STATE__.timeScale = 1;
  });
  await openHudPanel(page, 'status');
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.lastTickSummary = null;
    state.metrics = { ...state.metrics, dev: 5, reliability: 10, carbon: 20, water: 20, synergyLinks: 0 };
    window.__refreshGameForTest();
  });
  await page.waitForTimeout(1000);
  const before = await chartPixels(page);

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.metrics = { ...state.metrics, dev: 95, reliability: 90, carbon: 1, water: 1, synergyLinks: 5 };
    window.__refreshGameForTest();
  });
  await page.waitForTimeout(600);
  const middle = await chartPixels(page);
  await page.waitForTimeout(400);
  const after = await chartPixels(page);

  expect(middle).not.toBe(before);
  expect(after).not.toBe(middle);
});

test('closed city chart applies new values without spending frames on animation', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    window.__GAME_STATE__.timeScale = 1;
    const state = window.__GAME_STATE__;
    state.lastTickSummary = null;
    state.metrics = { ...state.metrics, dev: 95, reliability: 90, carbon: 1, water: 1, synergyLinks: 5 };
    window.__refreshGameForTest();
  });
  const immediate = await chartPixels(page);
  await page.waitForTimeout(150);
  expect(await chartPixels(page)).toBe(immediate);
});
