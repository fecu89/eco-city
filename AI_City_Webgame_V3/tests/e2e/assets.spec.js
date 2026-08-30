import { test, expect } from '../fixtures/game-test.js';

test.describe('City Kit asset pipeline', () => {
  test('all facilities resolve to selected low-poly GLBs without runtime fallbacks', async ({ gamePage: page }) => {
    await page.waitForFunction(() => window.__getCityAssetStatus?.().state !== 'loading');
    const status = await page.evaluate(() => window.__getCityAssetStatus());

    expect(status.state).toBe('ready');
    expect(status.loaded).toEqual(expect.arrayContaining(['solar', 'wind']));
    expect(status.loaded).toHaveLength(11);
    expect(status.fallbacks).toEqual([]);
    expect(status.errors).toEqual([]);
    expect(status.materials.factory.assetId).toBe('industrial.factorySmall');
    expect(status.materials.thermal.assetId).toBe('industrial.chimney');
  });

  test('level visuals provide distinct color, scale, and segment encodings', async ({ gamePage: page }) => {
    const levels = await page.evaluate(() => window.__getCityLevelVisuals());
    const scales = levels.map((level) => level.scale);

    expect(new Set(levels.map((level) => level.color)).size).toBe(3);
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(levels.map((level) => level.segments)).toEqual([1, 2, 3]);
  });

  test('rendered facilities use type colors and visibly distinct level scales', async ({ gamePage: page }) => {
    const types = [
      'residential', 'factory', 'data', 'thermal', 'nuclear',
      'solar', 'wind', 'battery', 'cooling', 'green', 'tidal',
    ];
    await page.evaluate((facilityTypes) => {
      const state = window.__GAME_STATE__;
      state.boardRadius = 3;
      state.grid = facilityTypes.flatMap((type) => [1, 2, 3].map((level) => ({ type, level })));
      while (state.grid.length < 37) state.grid.push(null);
      window.__renderCityForTest();
    }, types);

    const samples = await page.evaluate(() => window.__getCityRendererStats().facilityVisualSamples);
    expect(Object.keys(samples).sort()).toEqual([...types].sort());
    expect(new Set(types.map((type) => samples[type][1].color)).size).toBe(types.length);
    for (const type of types) {
      expect(new Set(samples[type].map((sample) => sample.color)).size).toBe(3);
      const scales = samples[type].map((sample) => sample.scale);
      expect(scales[1] - scales[0]).toBeGreaterThanOrEqual(0.12);
      expect(scales[2] - scales[1]).toBeGreaterThanOrEqual(0.12);
    }
  });

  test('idle environment loads the fixed island without runtime roads', async ({ gamePage: page }) => {
    await page.waitForFunction(() => window.__getCityRendererStats?.().environment?.state === 'ready');
    const environment = await page.evaluate(() => window.__getCityRendererStats().environment);
    expect(environment.roadModels).toEqual([]);
    expect(environment).toMatchObject({ landInstances: 37, shoreInstances: 24, waterInstances: 156 });
    expect(environment.treeInstances).toBeGreaterThan(0);
    expect(environment.treeLayers).toBeLessThanOrEqual(5);
    expect(environment.errors).toEqual([]);
  });

  test('edge-to-edge island loads deterministic Kenney coast and near-shore details', async ({ gamePage: page }) => {
    await page.waitForFunction(() => window.__getCityRendererStats?.().environment?.state === 'ready');
    const environment = await page.evaluate(() => window.__getCityRendererStats().environment);

    expect(environment.tileCoverage).toMatchObject({ land: expect.any(Number), shore: expect.any(Number), water: expect.any(Number) });
    expect(environment.tileCoverage.land).toBeGreaterThanOrEqual(1);
    expect(environment.tileCoverage.shore).toBeGreaterThanOrEqual(1);
    expect(environment.tileCoverage.water).toBeGreaterThanOrEqual(1.02);
    expect(environment.coastalPropInstances).toEqual({
      dock: 2,
      grassHill: 4,
      stoneHill: 2,
      forest: 2,
      waterRocks: 5,
      waterIsland: 3,
      ship: 2,
    });
    expect(environment.coastalPropLayers).toBeLessThanOrEqual(7);
    expect(environment.coastalBounds.minRadius).toBeGreaterThanOrEqual(2.5);
    expect(environment.coastalBounds.maxRadius).toBeLessThan(5);
    expect(environment.errors).toEqual([]);
  });

  test('Kenney factory palette stays nearest-filtered and persistent across redraws', async ({ gamePage: page }) => {
    await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
    const before = await page.evaluate(() => window.__getCityAssetStatus().materials.factory);
    expect(before).toMatchObject({ paletteSampling: 'nearest-no-mipmaps', paletteBlackLift: true, generateMipmaps: false });
    for (let index = 0; index < 30; index++) {
      await page.evaluate(() => window.__renderCityForTest());
    }
    const after = await page.evaluate(() => window.__getCityAssetStatus().materials.factory);
    expect(after.materialUuid).toBe(before.materialUuid);
    expect(after.textureUuid).toBe(before.textureUuid);
  });

  test('relationship and level encodings no longer float above facilities', async ({ gamePage: page }) => {
    const stats = await page.evaluate(() => window.__getCityRendererStats());
    expect(stats.linkMarkerCount).toBe(0);
    expect(stats.levelSegmentCount).toBe(0);
    expect(stats.facilityPaletteMode).toBe('level-solid');
    expect(stats.facilityHasMap).toBe(false);
    expect(stats.facilityUsesVertexColors).toBe(false);
    expect(stats.facilityMaterialType).toBe('MeshStandardMaterial');
  });
});
