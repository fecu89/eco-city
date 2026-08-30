import { test, expect } from '../fixtures/game-test.js';

async function renderAmbientCity(page) {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const configs = Array.from({ length: 19 }, () => ({ empty: true }));
    configs[0] = { empty: false, type: 'factory', level: 1 };
    configs[1] = { empty: false, type: 'data', level: 1 };
    configs[2] = { empty: false, type: 'wind', level: 1 };
    configs[3] = { empty: false, type: 'residential', level: 1 };
    configs[4] = { empty: false, type: 'green', level: 1 };
    window.__renderCityConfigsForTest(configs, 2);
    window.__finishFacilityAmbientForTest?.();
  });
}

test('facility motion uses pooled smoke and status layers while green stays bird-only', async ({ gamePage: page }) => {
  await renderAmbientCity(page);
  const before = await page.evaluate(() => window.__getCityRendererStats());

  expect(await page.evaluate(() => window.__triggerFacilityAmbientForTest('green', 4, 1200))).toBe(false);
  expect(await page.evaluate(() => window.__triggerFacilityAmbientForTest('factory', 0, 1200))).toBe(true);
  expect(await page.evaluate(() => window.__triggerFacilityAmbientForTest('data', 1, 1200))).toBe(true);
  expect(await page.evaluate(() => window.__triggerFacilityAmbientForTest('wind', 2, 1200))).toBe(true);

  const active = await page.evaluate(() => window.__getCityRendererStats());
  expect(active.ambientEffectCount).toBe(3);
  expect(active.ambientEffectKinds.sort()).toEqual(['data', 'factory', 'wind']);
  expect(active.smokeEffectCount).toBe(2);
  expect(active.statusLightCount).toBeGreaterThan(0);
  expect(active.ambientFrameIntervalMs).toBe(100);
  expect(active.resourceRevision).toBe(before.resourceRevision);
  expect(active.geometryCount).toBe(before.geometryCount);

  await page.evaluate(() => window.__finishFacilityAmbientForTest());
  await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().ambientEffectCount)).toBe(0);
  expect(await page.evaluate(() => window.__getCityRendererStats().smokeEffectCount)).toBe(0);
  expect(await page.evaluate(() => window.__getCityRendererStats().statusLightCount)).toBe(0);
});

test('facility motion renders at a throttled cadence and a pausing modal clears it', async ({ gamePage: page }) => {
  await renderAmbientCity(page);
  await page.evaluate(() => window.__triggerFacilityAmbientForTest('factory', 0, 1500));
  const before = await page.evaluate(() => window.__getCityRendererStats().ambientFrameUpdateCount);
  await expect.poll(
    () => page.evaluate(() => window.__getCityRendererStats().ambientFrameUpdateCount),
    { timeout: 3000, intervals: [120] },
  ).toBeGreaterThan(before);
  const after = await page.evaluate(() => window.__getCityRendererStats().ambientFrameUpdateCount);

  expect(after - before).toBeGreaterThanOrEqual(1);
  expect(after - before).toBeLessThanOrEqual(4);

  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.MODAL_OPEN, {
    pausesSimulation: true,
    pauseReason: 'ambient-test',
  }));
  expect(await page.evaluate(() => window.__getCityRendererStats())).toMatchObject({
    ambientEffectCount: 0,
    ambientMotionPaused: true,
  });
  await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.MODAL_CLOSE, {
    pausesSimulation: true,
    pauseReason: 'ambient-test',
  }));
  expect(await page.evaluate(() => window.__getCityRendererStats().ambientMotionPaused)).toBe(false);
});

test('removing an animated facility immediately clears its pooled effect', async ({ gamePage: page }) => {
  await renderAmbientCity(page);
  await page.evaluate(() => window.__triggerFacilityAmbientForTest('factory', 0, 1500));
  expect(await page.evaluate(() => window.__getCityRendererStats().ambientEffectCount)).toBe(1);

  await page.evaluate(() => {
    window.__renderCityConfigsForTest(Array.from({ length: 19 }, () => ({ empty: true })), 2);
  });

  expect(await page.evaluate(() => window.__getCityRendererStats())).toMatchObject({
    ambientEffectCount: 0,
    smokeEffectCount: 0,
    statusLightCount: 0,
  });
});
