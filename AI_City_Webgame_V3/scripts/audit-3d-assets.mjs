import { stat, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SCRIPT_DIR);
const PUBLIC_ASSET_ROOT = join(PROJECT_ROOT, 'public', 'assets');
const SELECTION_PATH = join(PROJECT_ROOT, 'assets-source', 'selected.json');
const REPORT_PATH = join(PROJECT_ROOT, 'assets-source', 'ASSET_REPORT.json');
const CRITICAL_IDS = new Set(['terrain.hexGrass', 'residential.house1', 'industrial.factorySmall']);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function localPath(pathOrUrl) {
  return pathOrUrl instanceof URL ? fileURLToPath(pathOrUrl) : pathOrUrl;
}

function boundsSize(bounds) {
  if (!bounds) return { x: 0, y: 0, z: 0 };
  return {
    x: bounds.max[0] - bounds.min[0],
    y: bounds.max[1] - bounds.min[1],
    z: bounds.max[2] - bounds.min[2],
  };
}

function primitiveTriangles(primitive) {
  const count = primitive.getIndices()?.getCount() || primitive.getAttribute('POSITION')?.getCount() || 0;
  return Math.floor(count / 3);
}

export async function inspectGlb(pathOrUrl) {
  const path = localPath(pathOrUrl);
  const document = await io.read(path);
  const root = document.getRoot();
  const meshes = root.listMeshes();
  const primitives = meshes.flatMap((mesh) => mesh.listPrimitives());
  const scene = root.listScenes()[0] || null;
  const file = await stat(path);
  return {
    bytes: file.size,
    scenes: root.listScenes().length,
    nodes: root.listNodes().length,
    meshes: meshes.length,
    primitives: primitives.length,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations: root.listAnimations().length,
    cameras: root.listCameras().length,
    lights: root.listNodes().filter((node) => node.getExtension('KHR_lights_punctual')).length,
    triangles: primitives.reduce((sum, primitive) => sum + primitiveTriangles(primitive), 0),
    maxTextureSize: 0,
    bounds: { size: scene ? boundsSize(getBounds(scene)) : { x: 0, y: 0, z: 0 } },
  };
}

export function validateModelStats(stats, limits = {}) {
  const errors = [];
  if (stats.cameras) errors.push('camera');
  if (stats.lights) errors.push('light');
  if (stats.animations && !limits.allowAnimation) errors.push('animation');
  if (stats.maxTextureSize > (limits.maxTextureSize || 1024)) errors.push('texture');
  return errors;
}

export function compareBounds(before, after, tolerance = 0.01) {
  return ['x', 'y', 'z'].every((axis) => (
    Math.abs(before.size[axis] - after.size[axis])
      <= Math.max(tolerance, Math.abs(before.size[axis]) * tolerance)
  ));
}

async function recursiveFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? recursiveFiles(path) : [path];
  }));
  return nested.flat();
}

export async function auditAssets() {
  const selected = JSON.parse(await readFile(SELECTION_PATH, 'utf8'));
  const models = [];
  for (const item of selected.models) {
    const stats = await inspectGlb(join(PROJECT_ROOT, 'public', item.runtimePath));
    const errors = validateModelStats(stats);
    const licensePath = join(PUBLIC_ASSET_ROOT, 'licenses', `${item.source}-License.txt`);
    await stat(licensePath);
    models.push({ ...item, stats, errors });
  }
  const publicFiles = await recursiveFiles(PUBLIC_ASSET_ROOT);
  const publicGlbs = publicFiles.filter((path) => extname(path).toLowerCase() === '.glb');
  const publicBytes = (await Promise.all(publicGlbs.map((path) => stat(path)))).reduce((sum, item) => sum + item.size, 0);
  const selectedBytes = models.reduce((sum, item) => sum + item.stats.bytes, 0);
  const criticalBytes = models.filter((item) => CRITICAL_IDS.has(item.id)).reduce((sum, item) => sum + item.stats.bytes, 0);
  const report = {
    auditedAt: '2026-08-30',
    selectedModelCount: models.length,
    publicGlbCount: publicGlbs.length,
    selectedBytes,
    publicBytes,
    criticalBytes,
    budgets: { publicBytes: 12 * 1024 * 1024, criticalBytes: 3 * 1024 * 1024 },
    manualDownloads: [],
    models,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  const errors = models.flatMap((item) => item.errors.map((error) => `${item.id}:${error}`));
  if (publicBytes > report.budgets.publicBytes) errors.push(`public budget exceeded: ${publicBytes}`);
  if (criticalBytes > report.budgets.criticalBytes) errors.push(`critical budget exceeded: ${criticalBytes}`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Assets OK: ${models.length} selected GLBs, ${publicBytes} public bytes, ${criticalBytes} critical bytes`);
  return report;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  auditAssets().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
