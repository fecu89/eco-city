import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { Document } from '@gltf-transform/core';
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  Int16BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import {
  externalUrisFromGlb,
  selectArchiveMembers,
} from '../../../scripts/select-3d-assets.mjs';
import * as selectionTools from '../../../scripts/select-3d-assets.mjs';
import {
  compareBounds,
  inspectGlb,
  validateModelStats,
} from '../../../scripts/audit-3d-assets.mjs';
import {
  optimizationArguments,
  stripAnimations,
} from '../../../scripts/optimize-3d-assets.mjs';
import {
  ASSETS,
  FACILITY_ASSET_IDS,
  assetIdsByPhase,
  flattenAssets,
  getAsset,
} from '../../../src/assets/assetRegistry.js';
import { AssetLoader } from '../../../src/assets/AssetLoader.js';
import { mergeAssetPrimitives } from '../../../src/assets/geometryUtils.js';
import { snapHexRotation } from '../../../src/ui/CityEnvironment3D.js';

function glbWithExternalImage(uri) {
  const jsonText = JSON.stringify({ asset: { version: '2.0' }, images: [{ uri }] });
  const padded = jsonText.padEnd(Math.ceil(jsonText.length / 4) * 4, ' ');
  const json = Buffer.from(padded);
  const glb = Buffer.alloc(20 + json.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  return glb;
}

test('selects semantic candidates and never falls back to archive order', () => {
  const inventory = [
    'Models/GLTF format/road-straight.gltf',
    'Models/GLTF format/road-cross.gltf',
    'Models/OBJ format/road-straight.obj',
    'Models/GLTF format/unrelated-sign.gltf',
  ];
  expect(selectArchiveMembers(inventory, [
    { id: 'roads.straight', formats: ['gltf', 'glb'], include: ['road-straight'] },
    { id: 'roads.cross', formats: ['gltf', 'glb'], include: ['road-cross'] },
  ])).toEqual({
    selected: [
      { id: 'roads.straight', member: 'Models/GLTF format/road-straight.gltf' },
      { id: 'roads.cross', member: 'Models/GLTF format/road-cross.gltf' },
    ],
  });
});

test('rejects ambiguous candidates instead of silently choosing one', () => {
  expect(() => selectArchiveMembers([
    'Models/GLB format/tree-a.glb',
    'Models/GLB format/tree-a-copy.glb',
  ], [{ id: 'tree', formats: ['glb'], include: ['tree-a'] }])).toThrow(/expected one candidate, found 2/i);
});

test('manual acquisitions remain available beside repeatable automatic downloads', () => {
  expect(typeof selectionTools.mergeAcquisitions).toBe('function');
  expect(selectionTools.mergeAcquisitions(
    { acquired: [{ id: 'kenney-roads', archive: 'automatic.zip' }] },
    { acquired: [{ id: 'quaternius-space', archive: 'manual.zip' }] },
  )).toEqual([
    { id: 'kenney-roads', archive: 'automatic.zip' },
    { id: 'quaternius-space', archive: 'manual.zip' },
  ]);
});

test('approved selection is unique and keeps only 52 representative runtime GLBs', async () => {
  const selection = JSON.parse(await readFile(new URL('../../../assets-source/selection.json', import.meta.url), 'utf8'));
  expect(selection.models).toHaveLength(52);
  expect(new Set(selection.models.map((item) => item.id)).size).toBe(52);
  expect(new Set(selection.models.map((item) => item.target)).size).toBe(52);
  expect(selection.models.every((item) => item.target.endsWith('.glb'))).toBe(true);
  // Quaternius의 energy.* 에셋(태양광·풍력 자리표시자)은 태양광·풍력이 각각 industrial
  // 2.0 kit 모델로 옮겨가며 더 이상 어떤 시설에도 쓰이지 않아 완전히 정리했다.
  expect(selection.models.some((item) => item.id.startsWith('energy.'))).toBe(false);
});

test('selected wind models stay lightweight enough for repeated mobile instances', async () => {
  const report = JSON.parse(await readFile(new URL('../../../assets-source/ASSET_REPORT.json', import.meta.url), 'utf8'));
  for (const id of ['industrial.windmillLow', 'industrial.windmill']) {
    const wind = report.models.find((item) => item.id === id);
    expect(wind.stats.bytes).toBeLessThan(50 * 1024);
    // 풍력은 도시에 여러 기가 동시에 서므로 삼각형 예산이 곧 모바일 프레임이다.
    // 현재 선택된 두 모델은 각각 456이며, 예산 800은 교체 여지를 둔 상한이다.
    expect(wind.stats.triangles).toBeLessThanOrEqual(800);
  }
});

test('detects external texture references embedded in a GLB JSON chunk', () => {
  expect(externalUrisFromGlb(glbWithExternalImage('Textures/colormap.png'))).toEqual(['Textures/colormap.png']);
});

test('asset audit rejects cameras, lights, animations, and oversized textures', () => {
  expect(validateModelStats({ cameras: 0, lights: 0, animations: 0, maxTextureSize: 0 })).toEqual([]);
  expect(validateModelStats({ cameras: 1, lights: 2, animations: 1, maxTextureSize: 4096 }))
    .toEqual(expect.arrayContaining(['camera', 'light', 'animation', 'texture']));
});

test('bounds comparison tolerates harmless quantization but rejects shape changes', () => {
  expect(compareBounds({ size: { x: 1, y: 2, z: 3 } }, { size: { x: 1.001, y: 2.001, z: 3.001 } }, 0.01)).toBe(true);
  expect(compareBounds({ size: { x: 1, y: 2, z: 3 } }, { size: { x: 1.4, y: 2, z: 3 } }, 0.01)).toBe(false);
});

test('inspects a selected GLB without loading it into the browser', async () => {
  const stats = await inspectGlb(new URL('../../../public/assets/environment/terrain/hex-grass.glb', import.meta.url));
  expect(stats).toMatchObject({ cameras: 0, lights: 0, animations: 0 });
  expect(stats.meshes).toBeGreaterThan(0);
  expect(stats.primitives).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(0);
});

test('optimizer uses conservative meshopt settings without simplification', () => {
  expect(optimizationArguments('input.glb', 'output.glb')).toEqual([
    'optimize', 'input.glb', 'output.glb',
    '--compress', 'meshopt',
    '--meshopt-level', 'medium',
    '--flatten', 'false',
    '--join', 'false',
    '--simplify', 'false',
    '--palette', 'false',
    '--texture-compress', 'auto',
    '--texture-size', '1024',
  ]);
});

test('static web-game copies remove unused source animations explicitly', () => {
  const document = new Document();
  document.createAnimation('idle');
  document.createAnimation('walk');
  expect(stripAnimations(document)).toBe(2);
  expect(document.getRoot().listAnimations()).toHaveLength(0);
});

test('runtime registry exposes selected GLBs while keeping only birds procedural', () => {
  const assets = flattenAssets();
  expect(assets.filter((asset) => asset.path)).toHaveLength(52);
  expect(getAsset('terrain.hexGrass')).toMatchObject({ phase: 'critical', license: 'CC0-1.0' });
  expect(() => getAsset('energy.solarSmall')).toThrow();
  expect(() => getAsset('energy.windBase')).toThrow();
  expect(assetIdsByPhase('critical')).toEqual(expect.arrayContaining([
    'terrain.hexGrass',
    'residential.house1',
    'industrial.factorySmall',
  ]));
  expect(FACILITY_ASSET_IDS.residential).toHaveLength(3);
  expect(ASSETS.animals.birds.kind).toBe('procedural');
});

test('runtime registry exposes the selected Kenney coastline set', () => {
  expect(getAsset('environment.coast.dock')).toMatchObject({
    path: '/assets/environment/coast/building-dock.glb',
    license: 'CC0-1.0',
    instanced: true,
  });
  expect(getAsset('environment.coast.grassHill').path).toBe('/assets/environment/coast/grass-hill.glb');
  expect(getAsset('environment.coast.stoneHill').path).toBe('/assets/environment/coast/stone-hill.glb');
  expect(getAsset('environment.coast.forest').path).toBe('/assets/environment/coast/grass-forest.glb');
  expect(getAsset('environment.water.rocks').path).toBe('/assets/environment/water/water-rocks.glb');
  expect(getAsset('environment.water.island').path).toBe('/assets/environment/water/water-island.glb');
  expect(getAsset('environment.water.ship').path).toBe('/assets/environment/water/ship.glb');
});

test('factory and thermal generation use different selected Kenney silhouettes', () => {
  expect(FACILITY_ASSET_IDS.factory[0]).toBe('industrial.factorySmall');
  expect(FACILITY_ASSET_IDS.thermal[0]).toBe('industrial.thermalSmall');
  expect(FACILITY_ASSET_IDS.thermal[0]).not.toBe(FACILITY_ASSET_IDS.factory[0]);
});

test('facilities with a real per-level model swap resolve a distinct GLB for every level', () => {
  const levelSwapTypes = ['thermal', 'nuclear', 'solar', 'data', 'residential', 'tidal'];
  for (const type of levelSwapTypes) {
    const ids = FACILITY_ASSET_IDS[type];
    expect(new Set(ids).size).toBe(3);
    ids.forEach((assetId) => expect(getAsset(assetId).kind).toBe('glb'));
  }
  // 순환냉각·풍력은 1·2단계가 같은 모델을 스케일만 다르게 쓰고, 3단계만 실제로 바뀐다.
  for (const type of ['cooling', 'wind']) {
    expect(FACILITY_ASSET_IDS[type][0]).toBe(FACILITY_ASSET_IDS[type][1]);
    expect(FACILITY_ASSET_IDS[type][2]).not.toBe(FACILITY_ASSET_IDS[type][0]);
    expect(getAsset(FACILITY_ASSET_IDS[type][2]).kind).toBe('glb');
  }
  // 공장·에너지저장·녹지는 단일 모델을 스케일만 다르게 쓴다(에너지저장은 building-p/t/q
  // 레벨 스왑으로 갔다가 다시 shipping-container-b 단일 모델로 돌아왔다).
  for (const type of ['factory', 'battery', 'green']) {
    expect(new Set(FACILITY_ASSET_IDS[type]).size).toBe(1);
  }
});

test('factory uses a single building-s Kenney model shared across every level', async () => {
  const selection = JSON.parse(await readFile(new URL('../../../assets-source/selection.json', import.meta.url), 'utf8'));
  expect(selection.models.find((item) => item.id === 'industrial.factorySmall')).toMatchObject({
    source: 'kenney-industrial2',
    member: 'Models/GLB format/building-s.glb',
  });
  expect(new Set(FACILITY_ASSET_IDS.factory)).toEqual(new Set(['industrial.factorySmall']));
});

test('asset loader caches one URL promise and preserves every primitive', async () => {
  let requests = 0;
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  const loader = new AssetLoader({
    gltfLoader: {
      loadAsync: async () => {
        requests += 1;
        return { scene, animations: [] };
      },
    },
  });
  const [first, second] = await Promise.all([
    loader.loadAsset('terrain.hexGrass'),
    loader.loadAsset('terrain.hexGrass'),
  ]);
  expect(first).toBe(second);
  expect(requests).toBe(1);
  expect((await loader.getPrimitives('terrain.hexGrass'))).toHaveLength(2);
});

test('runtime geometry adapter combines every GLB primitive into one draw geometry', () => {
  const left = new BoxGeometry(1, 1, 1);
  const right = new BoxGeometry(1, 1, 1);
  const merged = mergeAssetPrimitives([
    { geometry: left, matrix: new Matrix4().makeTranslation(-1, 0, 0) },
    { geometry: right, matrix: new Matrix4().makeTranslation(1, 0, 0) },
  ]);

  merged.computeBoundingBox();
  expect(merged.getAttribute('position').count).toBe(
    left.getAttribute('position').count + right.getAttribute('position').count,
  );
  expect(merged.boundingBox.min.x).toBeCloseTo(-1.5);
  expect(merged.boundingBox.max.x).toBeCloseTo(1.5);

  left.dispose();
  right.dispose();
  merged.dispose();
});

test('runtime geometry adapter preserves translations beyond normalized meshopt position range', () => {
  const geometry = new BufferGeometry();
  const position = new Int16BufferAttribute(new Int16Array(9), 3, true);
  position.setXYZ(0, -0.5, 0, -0.5);
  position.setXYZ(1, 0.5, 0, -0.5);
  position.setXYZ(2, 0, 0, 0.5);
  geometry.setAttribute('position', position);

  const merged = mergeAssetPrimitives([
    { geometry, matrix: new Matrix4().makeTranslation(3, 0, 0) },
  ]);
  merged.computeBoundingBox();

  expect(merged.boundingBox.min.x).toBeCloseTo(2.5, 3);
  expect(merged.boundingBox.max.x).toBeCloseTo(3.5, 3);
  expect(merged.getAttribute('position').array).toBeInstanceOf(Float32Array);

  geometry.dispose();
  merged.dispose();
});

test('radial coast assets snap to the six orientations of the hex shoreline', () => {
  const step = Math.PI / 3;
  for (const angle of [-2.9, -1.4, -0.2, 0.7, 1.8, 3.1]) {
    const snapped = snapHexRotation(angle);
    expect(snapped / step).toBeCloseTo(Math.round(angle / step), 10);
  }
});

test('asset loader records a failure without poisoning the procedural bird fallback', async () => {
  const loader = new AssetLoader({ gltfLoader: { loadAsync: async () => { throw new Error('offline'); } } });
  await expect(loader.loadAsset('roads.straight')).rejects.toThrow('offline');
  expect(loader.getStatus().failures['roads.straight']).toContain('offline');
  await expect(loader.loadAsset('animals.birds')).resolves.toBeNull();
});

test('license ledger records every currently used pack', async () => {
  const ledger = await readFile(new URL('../../../public/assets/licenses/ASSET_LICENSES.md', import.meta.url), 'utf8');
  for (const pack of [
    'Hexagon Kit', 'City Kit Roads', 'City Kit Suburban', 'City Kit Commercial',
    'City Kit Industrial', 'Nature Kit', 'Car Kit', 'Blocky Characters', 'Space Bits',
  ]) expect(ledger).toContain(pack);
  expect(ledger).toContain('CC0-1.0');
  expect(ledger).not.toContain('수동 다운로드 필요');
});

test('license ledger no longer lists packs that were cleaned up after every referencing facility moved on', async () => {
  const ledger = await readFile(new URL('../../../public/assets/licenses/ASSET_LICENSES.md', import.meta.url), 'utf8');
  // 별도 절(##) 표기는 사라져야 하지만, 무엇을 왜 정리했는지 남기는 각주까지 금지하지는 않는다.
  expect(ledger).not.toContain('## Quaternius — Ultimate Space Kit');
  expect(ledger).not.toContain('## Quaternius — Farm Buildings Pack');
});
