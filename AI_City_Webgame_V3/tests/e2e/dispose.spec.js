import { test, expect } from '../fixtures/game-test.js';

// 해제 경로는 정상 플레이에서 실행되지 않는다. 누수가 조용히 되살아나지 않도록,
// 실제 도시를 한 번 그린 뒤 해제하고 GPU에 남은 geometry/texture 수를 확인한다.
test('disposing the city scene frees every GPU geometry and texture it uploaded', async ({ gamePage: page }) => {
  await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
  await page.waitForFunction(() => window.__getCityRendererStats?.().environment?.state === 'ready');
  await page.evaluate(() => {
    const types = ['residential', 'factory', 'data', 'thermal', 'nuclear', 'solar', 'wind', 'battery', 'cooling', 'green', 'tidal'];
    const state = window.__GAME_STATE__;
    state.boardRadius = 3;
    state.expansion = {
      phase: 2,
      firstChoice: 'east',
      activeCellIndices: Array.from({ length: 37 }, (_, index) => index),
    };
    state.grid = Array.from({ length: 37 }, (_, index) => ({
      type: types[index % types.length],
      level: (index % 3) + 1,
    }));
    window.__renderCityForTest();
  });

  const before = await page.evaluate(() => window.__getCityRendererStats());
  expect(before.geometryCount).toBeGreaterThan(0);
  expect(before.textureCount).toBeGreaterThan(0);

  const memory = await page.evaluate(() => window.__disposeCitySceneForTest());

  // 씬이 올린 geometry는 하나도 남지 않아야 한다. 텍스처는 three가 소유한 내부 공용
  // 빈 텍스처(앱이 해제할 수 없는 모듈 싱글턴) 기준선까지 되돌아와야 한다.
  expect(memory.geometries).toBe(0);
  expect(memory.baselineTextures).toBeLessThanOrEqual(1);
  expect(before.textureCount).toBeGreaterThan(memory.baselineTextures);
  expect(memory.textures).toBe(memory.baselineTextures);
  expect(await page.evaluate(() => window.__getCityRendererStats())).toMatchObject({
    geometryCount: 0,
    textureCount: 0,
    drawCalls: 0,
  });
  expect(await page.evaluate(() => document.querySelectorAll('[data-world-construction-progress]').length)).toBe(0);
});
