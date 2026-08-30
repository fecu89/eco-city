import { test, expect } from '../fixtures/game-test.js';

test('maximum land is reserved from boot and surrounded by fixed instanced water', async ({ gamePage: page }) => {
  await page.waitForFunction(() => window.__getCityRendererStats().environment.state === 'ready');
  const before = await page.evaluate(() => window.__getCityRendererStats().environment);
  expect(before).toMatchObject({
    landInstances: 37,
    shoreInstances: 24,
    shoreWaterSupportInstances: 24,
    waterInstances: 156,
    renderedWaterInstances: 180,
    oceanPlane: true,
    environmentScale: 1,
    roadModels: [],
    layerElevations: {
      shore: -0.12,
      shoreWaterSupport: -0.22,
      water: -0.12,
    },
  });

  expect(before.layerElevations.shoreWaterSupport).toBeLessThan(before.layerElevations.shore);
  expect(before.coastalPropRotations.dock).toHaveLength(2);
  expect(before.coastalPropRotations.dock[0]).toBeCloseTo(Math.PI / 3);
  expect(before.coastalPropRotations.dock[1]).toBeCloseTo(-(Math.PI * 2) / 3);

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.boardRadius = 3;
    state.grid = [...state.grid, ...Array(18).fill(null)];
    window.__refreshGameForTest();
  });
  const after = await page.evaluate(() => window.__getCityRendererStats().environment);
  expect(after).toMatchObject({
    landInstances: 37,
    shoreInstances: 24,
    shoreWaterSupportInstances: 24,
    waterInstances: 156,
    renderedWaterInstances: 180,
    environmentScale: 1,
  });
});
