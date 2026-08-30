import { test, expect } from '../fixtures/game-test.js';

test('radius 3 renders 37 unique pointy-top hex tile instances', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.boardRadius = 3;
    state.grid = Array(37).fill(null);
    window.__renderCityForTest();
  });
  await page.waitForTimeout(50);
  const result = await page.evaluate(() => ({
    stats: window.__getCityRendererStats(),
    cells: Array.from({ length: 37 }, (_, index) => window.__getHexCell?.(index)),
  }));
  expect(result.stats).toMatchObject({ tileInstances: 37, boardRadius: 3, hexCellCount: 37 });
  expect(result.cells.every(Boolean)).toBe(true);
  expect(new Set(result.cells.map(({ x, z }) => `${x.toFixed(3)}:${z.toFixed(3)}`)).size).toBe(37);
  expect(result.cells[0]).toMatchObject({ index: 0, q: 0, r: 0, x: 0, z: 0 });
});
