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

test('approved selection is unique and keeps only 45 representative runtime GLBs', async () => {
  const selection = JSON.parse(await readFile(new URL('../../../assets-source/selection.json', import.meta.url), 'utf8'));
  expect(selection.models).toHaveLength(45);
  expect(new Set(selection.models.map((item) => item.id)).size).toBe(45);
  expect(new Set(selection.models.map((item) => item.target)).size).toBe(45);
  expect(selection.models.every((item) => item.target.endsWith('.glb'))).toBe(true);
  expect(selection.models.filter((item) => item.id.startsWith('energy.')).map((item) => item.id)).toEqual([
    'energy.solarSmall',
    'energy.solarLarge',
    'energy.windBase',
  ]);
});

test('converted energy assets retain hashes for their original source files', async () => {
  const selected = JSON.parse(await readFile(new URL('../../../assets-source/selected.json', import.meta.url), 'utf8'));
  const energy = selected.models.filter((item) => item.id.startsWith('energy.'));
  expect(energy).toHaveLength(3);
  expect(energy.flatMap((item) => item.originals.map((original) => original.member))).toEqual([
    'Original/Environment/GLTF/SolarPanel_Ground.gltf',
    'Original/Environment/GLTF/SolarPanel_Structure.gltf',
    'Original/OBJ/Windmill.obj',
    'Original/OBJ/Windmill.mtl',
  ]);
  expect(energy.flatMap((item) => item.originals).every((original) => (
    original.bytes > 0 && /^[a-f0-9]{64}$/.test(original.sha256)
  ))).toBe(true);
});

test('selected wind model stays lightweight enough for repeated mobile instances', async () => {
  const report = JSON.parse(await readFile(new URL('../../../assets-source/ASSET_REPORT.json', import.meta.url), 'utf8'));
  const wind = report.models.find((item) => item.id === 'energy.windBase');
  expect(wind.stats.triangles).toBeLessThanOrEqual(800);
  expect(wind.stats.bytes).toBeLessThan(50 * 1024);
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
  expect(assets.filter((asset) => asset.path)).toHaveLength(45);
  expect(getAsset('terrain.hexGrass')).toMatchObject({ phase: 'critical', license: 'CC0-1.0' });
  expect(getAsset('energy.solarSmall')).toMatchObject({
    kind: 'glb',
    path: '/assets/buildings/energy/solar-small.glb',
    fallback: 'solar',
  });
  expect(getAsset('energy.solarLarge')).toMatchObject({
    kind: 'glb',
    path: '/assets/buildings/energy/solar-large.glb',
  });
  expect(getAsset('energy.windBase')).toMatchObject({
    kind: 'glb',
    path: '/assets/buildings/energy/wind-turbine.glb',
    fallback: 'wind',
  });
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
  expect(FACILITY_ASSET_IDS.thermal[0]).toBe('industrial.chimney');
  expect(FACILITY_ASSET_IDS.thermal[0]).not.toBe(FACILITY_ASSET_IDS.factory[0]);
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

test('license ledger records every used pack and completed energy import', async () => {
  const ledger = await readFile(new URL('../../../public/assets/licenses/ASSET_LICENSES.md', import.meta.url), 'utf8');
  for (const pack of [
    'Hexagon Kit', 'City Kit Roads', 'City Kit Suburban', 'City Kit Commercial',
    'City Kit Industrial', 'Nature Kit', 'Car Kit', 'Blocky Characters',
    'Ultimate Space Kit', 'Farm Buildings Pack',
  ]) expect(ledger).toContain(pack);
  expect(ledger).toContain('CC0-1.0');
  expect(ledger).toContain('SolarPanel_Ground.gltf');
  expect(ledger).toContain('`Windmill.obj`');
  expect(ledger).not.toContain('수동 다운로드 필요');
});
