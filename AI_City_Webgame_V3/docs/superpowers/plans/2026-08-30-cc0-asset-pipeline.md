# CC0 3D Asset Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagents are not authorized for this repository. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a verified CC0-only Kenney/Quaternius asset set, convert the selected models to optimized GLB files, expose them through a cached registry/loader, and integrate them without increasing initial loading beyond the approved budget.

**Architecture:** Official-page acquisition and provenance live under `assets-source/`; canonical runtime files live under `public/assets/`. A generated registry is the only place production code learns asset paths. A cached common loader preserves every GLB primitive, while the city adapter turns repeated primitives into `InstancedMesh` layers and retains code geometry as a failure fallback.

**Tech Stack:** Three.js 0.185, Vite 8, Playwright, Node.js, GLTFLoader, MeshoptDecoder, glTF Transform CLI, optional `obj2gltf` only for a selected source that has no official GLTF/GLB.

**Spec:** `docs/superpowers/specs/2026-08-30-2040-onboarding-research-ui-design.md`

## Global Constraints

- Use only CC0 or attribution-free commercial-use assets; reject CC BY and CC BY-SA.
- Use Kenney and Quaternius official pages; do not use Sketchfab or guess direct URLs.
- If an official page cannot be downloaded automatically, record a manual-download instruction and do not substitute an unrelated file.
- Keep original license files and official source metadata.
- Keep selected runtime models at roughly 35 GLBs or fewer, public 3D assets at 12MB or less when visually safe, and critical initial assets at 3MB or less.
- Do not place source ZIP files in `public/`.
- Preserve existing code-generated facility geometry as the load-failure fallback.
- Do not commit, push, deploy, stage, or alter Git history.

## File Map

### New acquisition and audit files

- `assets-source/manifest.json` — official source pages, licenses, download strategy, checksums, and archive names.
- `assets-source/selection.json` — canonical runtime IDs mapped to selected archive members.
- `assets-source/licenses/` — untouched license files copied from official distributions.
- `assets-source/MANUAL_DOWNLOADS.md` — generated only for official downloads that automation cannot fetch.
- `scripts/fetch-3d-assets.mjs` — resolves links from official pages, validates policy, downloads to a temporary directory, and records SHA-256.
- `scripts/select-3d-assets.mjs` — copies only approved archive members into canonical category paths.
- `scripts/optimize-3d-assets.mjs` — converts/optimizes selected files and rejects damaged outputs.
- `scripts/audit-3d-assets.mjs` — reports model structure, license coverage, and loading budgets.
- `docs/asset-report.md` — generated final asset inventory and size report.

### New runtime files

- `src/assets/assetRegistry.js` — canonical paths and runtime metadata.
- `src/assets/AssetLoader.js` — Promise cache, Meshopt support, static clone and primitive APIs.

### Modified runtime files

- `src/level/CityAssetLoader.js` — city-specific adapter over the common loader.
- `src/ui/CityScene3D.js` — primitive-aware instanced facility layers and lazy environment loading.
- `src/core/Constants.js` — remove path duplication and retain only visual/game constants.
- `src/main.js` — expose asset audit status for browser QA.
- `package.json`, `package-lock.json` — reproducible asset scripts and verified conversion dependencies.

### Tests

- `tests/e2e/unit/asset-source-policy.spec.js`
- `tests/e2e/unit/asset-registry.spec.js`
- `tests/e2e/unit/asset-loader.spec.js`
- `tests/e2e/assets.spec.js`
- `tests/e2e/perf.spec.js`

---

### Task 1: Official-source policy and acquisition manifest

**Files:**
- Create: `assets-source/manifest.json`
- Create: `scripts/fetch-3d-assets.mjs`
- Create: `tests/e2e/unit/asset-source-policy.spec.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `assertAllowedSource(source): true`
- Produces: `extractOfficialDownloadUrl(source, html): string | null`
- Produces: `sha256File(path): Promise<string>`
- Produces: CLI `node scripts/fetch-3d-assets.mjs [--source <id>] [--dry-run]`

- [x] **Step 1: Write source-policy tests**

```js
import { test, expect } from '@playwright/test';
import { assertAllowedSource, extractOfficialDownloadUrl } from '../../../scripts/fetch-3d-assets.mjs';

test('accepts approved CC0 official sources and rejects attribution licenses', () => {
  expect(assertAllowedSource({ creator: 'Kenney', officialPage: 'https://kenney.nl/assets/hexagon-kit', license: 'CC0-1.0' })).toBe(true);
  expect(() => assertAllowedSource({ creator: 'Unknown', officialPage: 'https://sketchfab.com/models/x', license: 'CC-BY-4.0' })).toThrow(/source|license/i);
});

test('extracts only a zip linked by the official Kenney page', () => {
  const html = '<a href="/media/pages/assets/hexagon-kit/hash/kenney_hexagon-kit.zip">Continue without donating...</a>';
  expect(extractOfficialDownloadUrl({ creator: 'Kenney', officialPage: 'https://kenney.nl/assets/hexagon-kit' }, html))
    .toBe('https://kenney.nl/media/pages/assets/hexagon-kit/hash/kenney_hexagon-kit.zip');
});

test('Quaternius requires an explicitly labelled download anchor', () => {
  const html = [
    '<a href="https://quaternius.com/packs/index.html">Packs</a>',
    '<a href="https://linked-host.example/official-file.zip"><img alt="Download" /></a>',
  ].join('');
  expect(extractOfficialDownloadUrl({ creator: 'Quaternius', officialPage: 'https://quaternius.com/packs/example.html' }, html))
    .toBe('https://linked-host.example/official-file.zip');
});

test('does not treat arbitrary Quaternius navigation as a download', () => {
  const html = '<a href="https://quaternius.com/packs/index.html">Packs</a>';
  expect(extractOfficialDownloadUrl({ creator: 'Quaternius', officialPage: 'https://quaternius.com/packs/example.html' }, html))
    .toBeNull();
});
```

- [x] **Step 2: Run the tests and confirm RED**

Run: `npx playwright test tests/e2e/unit/asset-source-policy.spec.js`

Expected: FAIL because `scripts/fetch-3d-assets.mjs` does not exist.

- [x] **Step 3: Create the approved source manifest**

Use these exact source IDs and official pages:

```json
{
  "downloadedAt": "2026-08-30",
  "sources": [
    { "id": "kenney-hexagon", "creator": "Kenney", "pack": "Hexagon Kit", "officialPage": "https://kenney.nl/assets/hexagon-kit", "license": "CC0-1.0", "strategy": "kenney-page" },
    { "id": "kenney-roads", "creator": "Kenney", "pack": "City Kit Roads", "officialPage": "https://kenney.nl/assets/city-kit-roads", "license": "CC0-1.0", "strategy": "kenney-page" },
    { "id": "kenney-suburban", "creator": "Kenney", "pack": "City Kit Suburban", "officialPage": "https://kenney.nl/assets/city-kit-suburban", "license": "CC0-1.0", "strategy": "kenney-page" },
    { "id": "kenney-commercial", "creator": "Kenney", "pack": "City Kit Commercial", "officialPage": "https://kenney.nl/assets/city-kit-commercial", "license": "CC0-1.0", "strategy": "kenney-page" },
    { "id": "kenney-industrial", "creator": "Kenney", "pack": "City Kit Industrial", "officialPage": "https://kenney.nl/assets/city-kit-industrial", "license": "CC0-1.0", "strategy": "kenney-page" },
    { "id": "kenney-nature", "creator": "Kenney", "pack": "Nature Kit", "officialPage": "https://kenney.nl/assets/nature-kit", "license": "CC0-1.0", "strategy": "kenney-page" },
    { "id": "kenney-car", "creator": "Kenney", "pack": "Car Kit", "officialPage": "https://kenney.nl/assets/car-kit", "license": "CC0-1.0", "strategy": "kenney-page" },
    { "id": "kenney-people", "creator": "Kenney", "pack": "Blocky Characters", "officialPage": "https://kenney.nl/assets/blocky-characters", "license": "CC0-1.0", "strategy": "kenney-page" },
    { "id": "quaternius-space", "creator": "Quaternius", "pack": "Ultimate Space Kit", "officialPage": "https://quaternius.com/packs/ultimatespacekit.html", "license": "CC0-1.0", "strategy": "official-linked-download" },
    { "id": "quaternius-farm", "creator": "Quaternius", "pack": "Farm Buildings Pack", "officialPage": "https://quaternius.com/packs/farmbuildings.html", "license": "CC0-1.0", "strategy": "official-linked-download" }
  ]
}
```

- [x] **Step 4: Implement strict link resolution and dry-run output**

```js
const APPROVED_CREATORS = new Set(['Kenney', 'Quaternius']);
const APPROVED_LICENSES = new Set(['CC0-1.0']);

export function assertAllowedSource(source) {
  const page = new URL(source.officialPage);
  const officialHost = source.creator === 'Kenney' ? /(^|\.)kenney\.nl$/ : /(^|\.)quaternius\.com$/;
  if (!APPROVED_CREATORS.has(source.creator) || !APPROVED_LICENSES.has(source.license) || !officialHost.test(page.hostname)) {
    throw new Error(`Disallowed asset source or license: ${source.id || source.officialPage}`);
  }
  return true;
}

export function extractOfficialDownloadUrl(source, html) {
  assertAllowedSource(source);
  const anchors = [...html.matchAll(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => ({
    url: new URL(match[2], source.officialPage),
    label: `${match[1]} ${match[3]} ${match[4]}`.replace(/<[^>]+>/g, ' '),
  }));
  if (source.creator === 'Kenney') {
    return anchors.find(({ url }) => /(^|\.)kenney\.nl$/.test(url.hostname) && url.pathname.endsWith('.zip'))?.url.href || null;
  }
  return anchors.find(({ url, label }) => (
    url.protocol === 'https:'
    && /download/i.test(label)
    && !/patreon|discord/i.test(url.hostname)
  ))?.url.href || null;
}
```

The downloader may follow HTTPS redirects only when they begin from the exact extracted anchor URL; it records every redirect target and validates the final content as the expected archive instead of substituting another URL. It streams to a `mktemp` directory, computes SHA-256, and writes the anchor URL, final URL, archive filename, hash, and license filename back to a generated acquisition record. It must generate `assets-source/MANUAL_DOWNLOADS.md` instead of guessing when resolution, redirect validation, or download fails.

- [x] **Step 5: Add package scripts and rerun tests**

```json
{
  "assets:fetch": "node scripts/fetch-3d-assets.mjs",
  "assets:fetch:dry": "node scripts/fetch-3d-assets.mjs --dry-run"
}
```

Run: `npx playwright test tests/e2e/unit/asset-source-policy.spec.js`

Expected: PASS.

- [x] **Step 6: Verify the script has no guessed URL**

Run: `npm run assets:fetch:dry`

Expected: every item reports its official page and either an extracted linked download or `manual download required`; no Sketchfab/CC-BY source appears.

- [x] **Step 7: Inspect the local diff without committing**

Run: `git diff --check -- assets-source/manifest.json scripts/fetch-3d-assets.mjs tests/e2e/unit/asset-source-policy.spec.js package.json`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 2: Deterministic selection and canonical filenames

**Files:**
- Create: `assets-source/selection.json`
- Create: `scripts/select-3d-assets.mjs`
- Create: `tests/e2e/unit/asset-registry.spec.js`
- Create directories under: `public/assets/`

**Interfaces:**
- Consumes: acquisition records from Task 1
- Produces: `selectArchiveMembers(inventory, rules): SelectionResult`
- Produces: canonical runtime filenames listed below
- Produces: CLI `node scripts/select-3d-assets.mjs --archives <dir>`

- [x] **Step 1: Define canonical runtime IDs and filenames**

The selection file must resolve archive members into these names:

```json
{
  "terrain": ["hex-grass", "hex-dirt", "hex-water"],
  "roads": ["road-straight", "road-curve", "road-tee", "road-cross", "sidewalk"],
  "residential": ["house-01", "house-02", "house-03", "apartment-01", "apartment-02"],
  "commercial": ["shop-01", "shop-02", "commercial-01", "commercial-02"],
  "industrial": ["factory-small", "factory-medium", "factory-large", "chimney", "storage-tank"],
  "energy": ["solar-small", "solar-large", "wind-base"],
  "trees": ["tree-01", "tree-02", "tree-03", "tree-04", "tree-05", "bush-01"],
  "rocks": ["rock-01", "rock-02", "rock-03"],
  "vehicles": ["car-01", "car-02", "truck-01"],
  "people": ["citizen-01", "citizen-02"]
}
```

`selection.json` stores the chosen source ID and exact archive member beside each canonical ID after archive inspection. The selector must never choose by file order alone: candidate names must match the role, and the selected model must pass format and size inspection.

- [x] **Step 2: Write selection tests with a synthetic inventory**

```js
test('selects semantic candidates and does not copy the whole pack', async () => {
  const inventory = [
    'Models/GLTF format/road-straight.gltf',
    'Models/GLTF format/road-cross.gltf',
    'Models/OBJ format/road-straight.obj',
    'Models/GLTF format/unrelated-sign.gltf',
  ];
  const result = selectArchiveMembers(inventory, [
    { id: 'roads.straight', formats: ['gltf', 'glb'], include: ['road-straight'] },
    { id: 'roads.cross', formats: ['gltf', 'glb'], include: ['road-cross'] },
  ]);
  expect(result.selected.map((item) => item.member)).toEqual([
    'Models/GLTF format/road-straight.gltf',
    'Models/GLTF format/road-cross.gltf',
  ]);
});
```

- [x] **Step 3: Run the selection test and confirm RED**

Run: `npx playwright test tests/e2e/unit/asset-registry.spec.js`

Expected: FAIL because the selector is missing.

- [x] **Step 4: Implement selection with explicit ambiguity failures**

```js
export function selectArchiveMembers(inventory, rules) {
  const selected = rules.map((rule) => {
    const candidates = inventory.filter((member) => {
      const lower = member.toLowerCase();
      const extension = lower.split('.').pop();
      return rule.formats.includes(extension) && rule.include.every((token) => lower.includes(token));
    });
    if (candidates.length !== 1) throw new Error(`${rule.id}: expected one candidate, found ${candidates.length}`);
    return { id: rule.id, member: candidates[0] };
  });
  return { selected };
}
```

The real rule set may list multiple explicit accepted aliases, but an ambiguous match must stop and print all candidates for human inspection. Do not silently choose the first result.

- [x] **Step 5: Fetch and inspect official archives**

Run: `npm run assets:fetch`

Then list each downloaded archive with `unzip -l <explicit-archive-path>`. Inspect GLTF/GLB directories first. For Quaternius energy assets, confirm the model exists inside the official archive; if not, leave that source in `MANUAL_DOWNLOADS.md` and use the approved code-geometry wind rotor/facility fallback rather than an unrelated model.

- [x] **Step 6: Fill exact archive members and copy only selected files**

Run: `node scripts/select-3d-assets.mjs --archives <the-explicit-temporary-archive-directory>`

Expected: only the canonical models and their referenced textures/buffers appear under `public/assets/`; full source directories and ZIP files do not.

- [x] **Step 7: Rerun tests and inspect file inventory**

Run: `npx playwright test tests/e2e/unit/asset-registry.spec.js`

Run: `rg --files public/assets assets-source | sort`

Expected: PASS; only approved canonical files, manifests, and licenses are present.

- [x] **Step 8: Inspect the diff without committing**

Run: `git diff --check -- assets-source scripts/select-3d-assets.mjs public/assets tests/e2e/unit/asset-registry.spec.js`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 3: GLB conversion, optimization, and structural audit

**Files:**
- Create: `scripts/optimize-3d-assets.mjs`
- Create: `scripts/audit-3d-assets.mjs`
- Modify: `package.json`, `package-lock.json`
- Test: `tests/e2e/unit/asset-registry.spec.js`

**Interfaces:**
- Consumes: canonical selected source files from Task 2
- Produces: one `.glb` per registry model
- Produces: `inspectGlb(path): Promise<ModelStats>`
- Produces: `compareBounds(before, after, tolerance): boolean`
- Produces: CLIs `npm run assets:optimize` and `npm run assets:audit`

- [x] **Step 1: Add structural audit expectations**

```js
test('asset audit rejects forbidden cameras, lights, oversized textures, and animations', () => {
  expect(validateModelStats({ cameras: 0, lights: 0, animations: 0, maxTextureSize: 1024, triangles: 1800 })).toEqual([]);
  expect(validateModelStats({ cameras: 1, lights: 0, animations: 2, maxTextureSize: 4096, triangles: 1800 }))
    .toEqual(expect.arrayContaining(['camera', 'animation', 'texture']));
});
```

- [x] **Step 2: Run the test and confirm RED**

Run: `npx playwright test tests/e2e/unit/asset-registry.spec.js -g "asset audit"`

Expected: FAIL because `validateModelStats` is missing.

- [x] **Step 3: Install reproducible conversion dependencies**

Run: `npm install --save-dev @gltf-transform/cli @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer obj2gltf`

Expected: `package.json` and lockfile contain resolved versions. `obj2gltf` is invoked only for an approved model whose official pack lacks GLTF/GLB.

- [x] **Step 4: Implement validation and conversion policy**

```js
export function validateModelStats(stats, limits = {}) {
  const errors = [];
  if (stats.cameras) errors.push('camera');
  if (stats.lights) errors.push('light');
  if (stats.animations && !limits.allowAnimation) errors.push('animation');
  if (stats.maxTextureSize > (limits.maxTextureSize || 1024)) errors.push('texture');
  return errors;
}

export function compareBounds(before, after, tolerance = 0.01) {
  return ['x', 'y', 'z'].every((axis) => Math.abs(before.size[axis] - after.size[axis]) <= Math.max(tolerance, before.size[axis] * tolerance));
}
```

The optimizer must run `dedup`, `prune`, texture resize, WebP conversion when supported, and meshopt. It must write to a temporary output, inspect it, compare bounds, and atomically replace the canonical GLB only if validation succeeds.

- [x] **Step 5: Convert and optimize selected models**

Run: `npm run assets:optimize`

Expected: all canonical runtime models end in `.glb`; no 4K texture, camera, light, or unused animation remains. Any rejected model stays as its uncompressed valid GLB and is reported.

- [x] **Step 6: Run the asset audit**

Run: `npm run assets:audit`

Expected: exit 0; output includes file size, triangles, meshes, primitives, materials, textures, and initial/total loading bytes.

- [x] **Step 7: Rerun tests and diff check**

Run: `npx playwright test tests/e2e/unit/asset-registry.spec.js`

Run: `git diff --check -- scripts package.json package-lock.json public/assets`

Expected: PASS and no whitespace errors. Do not stage or commit.

---

### Task 4: Canonical runtime registry

**Files:**
- Create: `src/assets/assetRegistry.js`
- Modify: `src/core/Constants.js`
- Test: `tests/e2e/unit/asset-registry.spec.js`

**Interfaces:**
- Produces: `ASSETS: Readonly<Record<string, AssetDefinition>>`
- Produces: `FACILITY_ASSET_IDS: Readonly<Record<FacilityType, string[]>>`
- Produces: `getAssetDefinition(id): AssetDefinition`
- Produces: `assetIdsForPhase(phase): string[]`

- [x] **Step 1: Add registry contract tests**

```js
import { ASSETS, FACILITY_ASSET_IDS, assetIdsForPhase } from '../../../src/assets/assetRegistry.js';

test('registry contains canonical paths and only approved licenses', () => {
  expect(ASSETS['terrain.hexGrass'].path).toBe('/assets/environment/terrain/hex-grass.glb');
  expect(ASSETS['industrial.factorySmall'].license).toBe('CC0-1.0');
  expect(Object.values(ASSETS).every((asset) => asset.path.endsWith('.glb'))).toBe(true);
  expect(assetIdsForPhase('critical')).toEqual(expect.arrayContaining(['terrain.hexGrass', 'residential.house01', 'industrial.thermal01']));
  expect(FACILITY_ASSET_IDS.residential).toHaveLength(3);
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/unit/asset-registry.spec.js -g "registry contains"`

Expected: FAIL because the registry does not exist.

- [x] **Step 3: Implement immutable definitions**

```js
const asset = (definition) => Object.freeze(definition);

export const ASSETS = Object.freeze({
  'terrain.hexGrass': asset({ path: '/assets/environment/terrain/hex-grass.glb', creator: 'Kenney', pack: 'Hexagon Kit', license: 'CC0-1.0', phase: 'critical', instanced: true, fallback: 'hex' }),
  'terrain.hexDirt': asset({ path: '/assets/environment/terrain/hex-dirt.glb', creator: 'Kenney', pack: 'Hexagon Kit', license: 'CC0-1.0', phase: 'unlock', instanced: true, fallback: 'hex' }),
  'terrain.hexWater': asset({ path: '/assets/environment/terrain/hex-water.glb', creator: 'Kenney', pack: 'Hexagon Kit', license: 'CC0-1.0', phase: 'unlock', instanced: true, fallback: 'hex' }),
  'residential.house01': asset({ path: '/assets/buildings/residential/house-01.glb', creator: 'Kenney', pack: 'City Kit Suburban', license: 'CC0-1.0', phase: 'critical', instanced: true, fallback: 'residential', targetHeight: 0.58, rotationY: 0 }),
  'industrial.thermal01': asset({ path: '/assets/buildings/industrial/factory-small.glb', creator: 'Kenney', pack: 'City Kit Industrial', license: 'CC0-1.0', phase: 'critical', instanced: true, fallback: 'thermal', targetHeight: 0.72, rotationY: 0 })
});

export function getAssetDefinition(id) {
  const definition = ASSETS[id];
  if (!definition) throw new Error(`Unknown asset id: ${id}`);
  return definition;
}

export function assetIdsForPhase(phase) {
  return Object.entries(ASSETS).filter(([, definition]) => definition.phase === phase).map(([id]) => id);
}
```

Complete the registry with every canonical ID produced by Task 2. Use measured scale, rotation, offset, footprint, and source metadata from the audit rather than guessed transforms.

- [x] **Step 4: Define level-specific facility visuals**

```js
export const FACILITY_ASSET_IDS = Object.freeze({
  residential: Object.freeze(['residential.house01', 'residential.house03', 'residential.apartment01']),
  factory: Object.freeze(['industrial.factorySmall', 'industrial.factoryMedium', 'industrial.factoryLarge']),
  data: Object.freeze(['commercial.commercial01', 'commercial.commercial02', 'commercial.commercial02']),
  thermal: Object.freeze(['industrial.thermal01', 'industrial.factoryMedium', 'industrial.factoryLarge']),
  nuclear: Object.freeze(['industrial.factoryMedium', 'industrial.factoryLarge', 'industrial.factoryLarge']),
  solar: Object.freeze(['energy.solarSmall', 'energy.solarLarge', 'energy.solarLarge']),
  wind: Object.freeze(['energy.windBase', 'energy.windBase', 'energy.windBase']),
  battery: Object.freeze(['industrial.storageTank', 'industrial.storageTank', 'industrial.storageTank']),
  cooling: Object.freeze(['industrial.storageTank', 'industrial.storageTank', 'industrial.storageTank']),
  green: Object.freeze(['trees.tree01', 'trees.tree02', 'trees.tree03']),
  tidal: Object.freeze(['industrial.storageTank', 'industrial.factorySmall', 'industrial.factoryMedium'])
});
```

Do not add a commercial gameplay facility. Commercial models are used by data-center levels and optional outer-city dressing.

- [x] **Step 5: Remove duplicated path constants and pass tests**

Move asset path/config ownership out of `Constants.js`; keep game balance and visual palette there.

Run: `npx playwright test tests/e2e/unit/asset-registry.spec.js`

Expected: PASS.

- [x] **Step 6: Diff check without committing**

Run: `git diff --check -- src/assets/assetRegistry.js src/core/Constants.js tests/e2e/unit/asset-registry.spec.js`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 5: Cached multi-primitive GLB loader

**Files:**
- Create: `src/assets/AssetLoader.js`
- Create: `tests/e2e/unit/asset-loader.spec.js`

**Interfaces:**
- Consumes: `getAssetDefinition(id)` from Task 4
- Produces: `createAssetLoader({ loadGltf? }): AssetLoader`
- Produces methods: `load(id)`, `preload(ids)`, `cloneStatic(id)`, `getPrimitives(id)`, `getStatus()`, `dispose()`

- [x] **Step 1: Write cache and primitive-preservation tests**

```js
test('deduplicates concurrent loads and preserves every mesh primitive', async () => {
  let calls = 0;
  const fakeScene = makeSceneWithTwoMeshes();
  const loader = createAssetLoader({ loadGltf: async () => { calls++; return { scene: fakeScene, animations: [] }; } });
  const [first, second] = await Promise.all([loader.load('residential.house01'), loader.load('residential.house01')]);
  expect(calls).toBe(1);
  expect(first).toBe(second);
  expect(loader.getPrimitives('residential.house01')).toHaveLength(2);
});

test('records a rejected load without poisoning unrelated assets', async () => {
  const loader = createAssetLoader({ loadGltf: async (path) => { if (path.includes('house')) throw new Error('bad glb'); return makeOneMeshGltf(); } });
  await expect(loader.load('residential.house01')).rejects.toThrow('bad glb');
  await expect(loader.load('terrain.hexGrass')).resolves.toBeTruthy();
  expect(loader.getStatus().failed).toContain('residential.house01');
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/unit/asset-loader.spec.js`

Expected: FAIL because `AssetLoader.js` is missing.

- [x] **Step 3: Implement injected loader, Promise cache, and primitive collection**

```js
export function createAssetLoader({ loadGltf = browserLoadGltf } = {}) {
  const cache = new Map();
  const primitives = new Map();
  const failed = new Map();

  async function load(id) {
    if (cache.has(id)) return cache.get(id);
    const promise = loadGltf(getAssetDefinition(id).path).then((gltf) => {
      const list = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        list.push({ geometry: node.geometry, material: node.material, matrix: node.matrixWorld.clone() });
      });
      if (!list.length) throw new Error(`${id}: GLB contains no meshes`);
      primitives.set(id, list);
      return gltf;
    }).catch((error) => {
      cache.delete(id);
      failed.set(id, error.message || String(error));
      throw error;
    });
    cache.set(id, promise);
    return promise;
  }

  return { load, getPrimitives: (id) => primitives.get(id) || [], getStatus: () => ({ loaded: [...primitives.keys()], failed: [...failed.keys()] }) };
}
```

`browserLoadGltf` must configure `GLTFLoader` with `MeshoptDecoder`. `cloneStatic()` must clone nodes while sharing geometry/material. `dispose()` must dispose each cached source resource once, never once per clone.

- [x] **Step 4: Implement preload and disposal semantics**

`preload(ids)` returns `Promise.allSettled`, so one optional model does not reject the full loading phase. `dispose()` clears caches and releases source geometry, materials, and textures using identity Sets.

- [x] **Step 5: Run loader tests**

Run: `npx playwright test tests/e2e/unit/asset-loader.spec.js`

Expected: PASS.

- [x] **Step 6: Diff check without committing**

Run: `git diff --check -- src/assets/AssetLoader.js tests/e2e/unit/asset-loader.spec.js`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 6: Integrate the common loader with city instancing

> **Implemented performance adaptation:** The selected facility GLBs are single-primitive, while nature and vehicles contain multiple primitives. Instead of multiplying draw calls with `Map<type:level, InstancedMesh[]>`, runtime applies every primitive transform and merges the parts into one geometry per registered model. This preserves the complete model, keeps material UV attributes where compatible, and retains the 24-draw-call city budget. Level identity remains the approved tint/scale/segment treatment; the registry still keeps the small/medium/large GLBs available by level.

**Files:**
- Modify: `src/level/CityAssetLoader.js`
- Modify: `src/ui/CityScene3D.js`
- Modify: `src/main.js`
- Modify: `tests/e2e/assets.spec.js`
- Modify: `tests/e2e/perf.spec.js`

**Interfaces:**
- Consumes: `FACILITY_ASSET_IDS`, `assetIdsForPhase`, and common AssetLoader
- Produces: `getFacilityPrimitives(type, level): PrimitiveDefinition[]`
- Produces: `preloadFacilityType(type): Promise<LoadReport>`
- Produces: `getAssetStatus(): { state, loaded, fallbacks, errors, bytes }`

- [x] **Step 1: Extend browser tests for multi-primitive and lazy loading**

```js
test('boots from the critical asset group and lazy-loads an unlocked facility', async ({ gamePage: page }) => {
  const initial = await page.evaluate(() => window.__getCityAssetStatus());
  expect(initial.state).toBe('ready');
  expect(initial.loaded).toEqual(expect.arrayContaining(['terrain.hexGrass', 'residential.house01', 'industrial.thermal01']));
  expect(initial.bytes.critical).toBeLessThanOrEqual(3 * 1024 * 1024);
  await page.evaluate(() => {
    window.__GAME_STATE__.unlockedFacilities.add('solar');
    window.__refreshGameForTest();
  });
  await page.waitForFunction(() => window.__getCityAssetStatus().loaded.includes('energy.solarSmall'));
});
```

- [x] **Step 2: Run targeted tests and confirm RED**

Run: `npx playwright test tests/e2e/assets.spec.js -g "critical asset group"`

Expected: FAIL because the old status exposes facility types, not registry IDs or byte budgets.

- [x] **Step 3: Refactor CityAssetLoader into an adapter**

Replace first-Mesh normalization with primitive-preserving definitions:

```js
export async function preloadFacilityType(type) {
  const ids = FACILITY_ASSET_IDS[type];
  const settled = await sharedAssetLoader.preload([...new Set(ids)]);
  return summarizeSettled(ids, settled);
}

export function getFacilityPrimitives(type, level = 1) {
  const id = FACILITY_ASSET_IDS[type]?.[Math.max(0, Math.min(2, level - 1))];
  const primitives = sharedAssetLoader.getPrimitives(id);
  return primitives.length ? primitives : [{ geometry: createFacilityFallbackGeometry(type), material: null, fallback: true }];
}
```

- [x] **Step 4: Preserve every primitive without increasing per-cell draw calls**

Apply every primitive local matrix, merge compatible attributes into one normalized geometry, and keep one instanced facility layer per type. Use `instanceColor` for the approved level tint without cloning one material per cell. A synthetic two-part regression and real tree/rock/car loading must prove that no primitive is dropped.

- [x] **Step 5: Implement loading phases**

Boot only `assetIdsForPhase('critical')`. When unlock state changes, preload the facility's unique registry IDs. Schedule idle environment assets with `requestIdleCallback`, falling back to a short timeout. A failed optional asset must emit one toast and keep the fallback visible.

- [x] **Step 6: Update status and test hooks**

Expose critical/unlock/idle byte totals and registry IDs via `window.__getCityAssetStatus()`. Preserve `window.__getCityRendererStats()`.

- [x] **Step 7: Run targeted asset and performance tests**

Run: `npx playwright test tests/e2e/assets.spec.js tests/e2e/perf.spec.js`

Expected: PASS; draw calls remain within the existing threshold or improve, and no model is fetched twice.

- [x] **Step 8: Build and diff check**

Run: `npm run build`

Run: `git diff --check -- src/level/CityAssetLoader.js src/ui/CityScene3D.js src/main.js tests/e2e/assets.spec.js tests/e2e/perf.spec.js`

Expected: build succeeds and no whitespace errors. Do not stage or commit.

---

### Task 7: Licenses, asset report, and visual verification

**Files:**
- Create: `public/assets/licenses/ASSET_LICENSES.md`
- Create: `docs/asset-report.md`
- Modify: `scripts/audit-3d-assets.mjs`
- Modify: `tests/e2e/assets.spec.js`
- Modify: `tests/e2e/visual.spec.js`

**Interfaces:**
- Consumes: acquisition, selection, registry, and model audit data
- Produces: a complete human-readable license ledger
- Produces: final count/size/structure report

- [x] **Step 1: Add license coverage test**

```js
test('every registry entry has a retained CC0 source record', async () => {
  const audit = await runAssetAudit();
  expect(audit.missingFiles).toEqual([]);
  expect(audit.missingLicenses).toEqual([]);
  expect(audit.forbiddenLicenses).toEqual([]);
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/assets.spec.js -g "retained CC0"`

Expected: FAIL until the ledger and audit join are implemented.

- [x] **Step 3: Generate the license ledger**

For each used model, write creator, pack, official page, `CC0-1.0`, download date `2026-08-30`, original archive member, canonical runtime file, conversion steps, and SHA-256. Link the retained original license filename under `assets-source/licenses/`.

- [x] **Step 4: Generate the model report**

`docs/asset-report.md` must contain:

- selected model count by category
- file size and triangle count per canonical model
- Mesh, primitive, Material, Texture, Animation, Camera and Light counts
- critical/unlock/idle byte totals
- optimization failures and chosen fallback
- any manual download still required

- [x] **Step 5: Capture representative visual states**

Use the existing Playwright visual fixture to render at least one residential, industrial, energy, tree, rock, vehicle and citizen asset. Record screenshots for desktop and mobile. Confirm orientation, target footprint, floor alignment, materials, and level tint.

- [x] **Step 6: Run the complete asset gate**

Run: `npm run assets:audit`

Run: `npx playwright test tests/e2e/assets.spec.js tests/e2e/perf.spec.js tests/e2e/visual.spec.js`

Run: `npm run build`

Expected: all pass; audit reports no forbidden licenses, missing files, oversized textures, camera/light nodes, or duplicated critical downloads.

- [x] **Step 7: Inspect final size and worktree without committing**

Run: `du -sh public/assets`

Run: `git status --short`

Expected: report the measured total and any justified budget exception. Do not stage, commit, push, or deploy.
