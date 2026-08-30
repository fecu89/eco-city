import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { compareBounds, inspectGlb, validateModelStats } from './audit-3d-assets.mjs';
import { externalUrisFromGlb } from './select-3d-assets.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SCRIPT_DIR);
const SELECTED_PATH = join(PROJECT_ROOT, 'assets-source', 'selected.json');
const GLTF_TRANSFORM = join(PROJECT_ROOT, 'node_modules', '.bin', 'gltf-transform');
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

export function optimizationArguments(input, output) {
  return [
    'optimize', input, output,
    '--compress', 'meshopt',
    '--meshopt-level', 'medium',
    '--flatten', 'false',
    '--join', 'false',
    '--simplify', 'false',
    '--palette', 'false',
    '--texture-compress', 'auto',
    '--texture-size', '1024',
  ];
}

export function stripAnimations(document) {
  const animations = document.getRoot().listAnimations();
  animations.forEach((animation) => animation.dispose());
  return animations.length;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function optimizeOne(input, output) {
  const result = spawnSync(GLTF_TRANSFORM, optimizationArguments(input, output), {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Optimization failed: ${input}`);
}

export async function optimizeAssets() {
  const selected = JSON.parse(await readFile(SELECTED_PATH, 'utf8'));
  const sidecarFiles = new Set();
  const sidecarDirectories = new Set();

  for (const item of selected.models) {
    const input = join(PROJECT_ROOT, 'public', item.runtimePath);
    const output = `${input}.optimized.glb`;
    const staticInput = `${input}.static.glb`;
    const before = await inspectGlb(input);
    await rm(output, { force: true });
    await rm(staticInput, { force: true });
    let optimizationInput = input;
    if (before.animations) {
      const document = await io.read(input);
      stripAnimations(document);
      await io.write(staticInput, document);
      optimizationInput = staticInput;
    }
    try {
      optimizeOne(optimizationInput, output);
    } finally {
      await rm(staticInput, { force: true });
    }
    const after = await inspectGlb(output);
    const errors = validateModelStats(after);
    const outputBytes = await readFile(output);
    if (errors.length) {
      await rm(output, { force: true });
      throw new Error(`${item.id}: optimized model failed audit: ${errors.join(', ')}`);
    }
    if (!compareBounds(before.bounds, after.bounds, 0.02)) {
      await rm(output, { force: true });
      throw new Error(`${item.id}: optimized bounds changed beyond tolerance`);
    }
    if (externalUrisFromGlb(outputBytes).length) {
      await rm(output, { force: true });
      throw new Error(`${item.id}: optimized GLB still has external resources`);
    }
    await rename(output, input);
    item.optimizedBytes = outputBytes.length;
    item.optimizedSha256 = sha256(outputBytes);
    item.optimization = 'gltf-transform optimize; meshopt medium; no simplify/flatten/join; textures <=1024';

    for (const sidecar of item.sidecars || []) {
      const path = join(dirname(input), decodeURIComponent(sidecar.uri));
      sidecarFiles.add(path);
      sidecarDirectories.add(dirname(path));
    }
    console.log(`${item.id}: ${item.bytes} -> ${item.optimizedBytes} bytes`);
  }

  for (const path of sidecarFiles) await rm(path, { force: true });
  for (const path of [...sidecarDirectories].sort((a, b) => b.length - a.length)) {
    await rmdir(path).catch((error) => {
      if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error;
    });
  }
  await writeFile(SELECTED_PATH, `${JSON.stringify(selected, null, 2)}\n`);
  return selected.models;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  optimizeAssets().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
