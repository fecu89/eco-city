import { test, expect } from '../fixtures/game-test.js';
import { GREEN_VISUAL_LAYOUTS } from '../../src/ui/CityScene3D.js';
import { DIRECTION_RULES } from '../../src/core/Constants.js';
import { defaultRotationFor } from '../../src/systems/EnvironmentSystem.js';

// 방향 인덱스 → three의 yaw. 시계 방향으로 도는 만큼 +Y 회전은 반대 부호다.
const yawFor = (rotation) => -rotation * ((DIRECTION_RULES.STEP_DEGREES * Math.PI) / 180);
// 오일러 각은 ±π에서 접히므로 각도 차이로 비교한다.
const sameAngle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-3;

test('green levels use progressively richer but bounded shared geometry', () => {
  expect(Object.fromEntries(
    Object.entries(GREEN_VISUAL_LAYOUTS).map(([level, items]) => [level, items.length]),
  )).toEqual({ 1: 2, 2: 4, 3: 6 });
});

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
    expect(status.materials.thermal.assetId).toBe('industrial.thermalSmall');
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

    for (const type of ['residential', 'factory', 'data', 'nuclear', 'green']) {
      expect(new Set(samples[type].map((sample) => sample.rotationY)).size).toBeGreaterThan(1);
    }
    // 장식용 방위 오프셋이 없는 시설은 칸이 달라도 같은 쪽을 본다. 방향을 따로 고르지 않은
    // 칸은 시설 기본 방향에 그대로 서므로(태양광은 남향 = 180°) 그 값까지 함께 확인한다.
    for (const type of ['thermal', 'solar', 'wind', 'battery', 'cooling', 'tidal']) {
      const expected = yawFor(defaultRotationFor(type));
      expect(new Set(samples[type].map((sample) => sample.rotationY)).size).toBe(1);
      expect(samples[type].every((sample) => sameAngle(sample.rotationY, expected))).toBe(true);
    }
  });

  test('green visual detail instances follow the level layouts without per-cell animation', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid = [{ type: 'green', level: 1 }, { type: 'green', level: 2 }, { type: 'green', level: 3 }];
      while (state.grid.length < 19) state.grid.push(null);
      window.__renderCityForTest();
    });

    const stats = await page.evaluate(() => window.__getCityRendererStats());
    expect(stats.greenDetailInstances).toBe(12);
    expect(stats.greenDetailCountsByLevel).toEqual({ 1: 2, 2: 4, 3: 6 });
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

  test('original model textures carry facility detail without floating encodings', async ({ gamePage: page }) => {
    const stats = await page.evaluate(() => window.__getCityRendererStats());
    expect(stats.linkMarkerCount).toBe(0);
    expect(stats.levelSegmentCount).toBe(0);
    expect(stats.facilityPaletteMode).toBe('textured-tint');
    expect(stats.facilityHasMap).toBe(true);
    expect(stats.texturedFacilityTypes.sort()).toEqual([
      'battery', 'cooling', 'data', 'factory', 'green', 'nuclear',
      'residential', 'solar', 'thermal', 'tidal', 'wind',
    ]);
    expect(stats.facilityUsesVertexColors).toBe(false);
    expect(stats.facilityMaterialType).toBe('MeshStandardMaterial');
  });
});
