import { test, expect } from '../fixtures/game-test.js';

test.describe('City Kit asset pipeline', () => {
  test('all facilities resolve to City Kit or a procedural fallback', async ({ gamePage: page }) => {
    await page.waitForFunction(() => window.__getCityAssetStatus?.().state !== 'loading');
    const status = await page.evaluate(() => window.__getCityAssetStatus());

    expect(status.state).toBe('ready');
    expect(status.loaded.length + status.fallbacks.length).toBe(10);
    expect(status.errors).toEqual([]);
  });

  test('level visuals provide distinct color, scale, and segment encodings', async ({ gamePage: page }) => {
    const levels = await page.evaluate(() => window.__getCityLevelVisuals());
    const scales = levels.map((level) => level.scale);

    expect(new Set(levels.map((level) => level.color)).size).toBe(3);
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(levels.map((level) => level.segments)).toEqual([1, 2, 3]);
  });
});
