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

test('expansion choice opens only nine subtly zoned tiles without another draw-call layer', async ({ gamePage: page }) => {
  const beforeLayers = await page.evaluate(() => window.__getCityRendererStats().instancedLayers);
  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.EXPANSION_CHOICE_REQUESTED, {}));
  await expect(page.locator('[data-expansion-side="east"]')).toBeVisible();
  await expect(page.locator('[data-expansion-side="west"]')).toBeVisible();
  await page.locator('[data-expansion-side="east"]').click();
  await page.waitForTimeout(80);

  const result = await page.evaluate(() => ({
    expansion: window.__GAME_STATE__.expansion,
    stats: window.__getCityRendererStats(),
  }));
  expect(result.expansion).toMatchObject({ phase: 1, firstChoice: 'east' });
  // 목표 세트 계층은 제거됐다. 확장이 실제로 주는 것은 반쪽 보드와 그 지역의 재생에너지다.
  expect(await page.evaluate(() => ({
    objectiveSetId: window.__GAME_STATE__.progression.objectiveSetId,
    solarUnlocked: window.__GAME_STATE__.unlockedFacilities.has('solar'),
    windUnlocked: window.__GAME_STATE__.unlockedFacilities.has('wind'),
  }))).toEqual({ objectiveSetId: null, solarUnlocked: true, windUnlocked: false });
  expect(result.expansion.activeCellIndices).toHaveLength(28);
  expect(result.stats).toMatchObject({
    tileInstances: 37,
    inactiveTileCount: 9,
    zoneTileCounts: { solar: 5, residential: 4 },
  });
  expect(result.stats.instancedLayers).toBe(beforeLayers);
});
