# Hex City Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagents are not authorized for this repository. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the 5×5/6×6 square board with a true pointy-top axial hex board that grows from 19 to 37 cells while preserving old facilities and applying one consistent six-neighbor/distance rule everywhere.

**Architecture:** `HexGridSystem` owns all coordinate generation, indexing, neighbors, distance, world placement, rings, and legacy mapping. Gameplay systems consume cell indices but ask this module for topology. The 3D scene uses the same axial-to-world mapping and an instanced Kenney hex tile, so visuals, raycasting, placement, power routing, and quests cannot disagree.

**Tech Stack:** Three.js 0.185, Vite 8, Playwright, EventBus/GameState architecture, asset registry/loader from `2026-08-30-cc0-asset-pipeline.md`.

**Spec:** `docs/superpowers/specs/2026-08-30-2040-onboarding-research-ui-design.md`

## Global Constraints

- New games use radius 2 (19 cells); quest 6 expands to radius 3 (37 cells).
- Pointy-top axial coordinates `(q, r)` are authoritative.
- Existing radius-2 indices never change when radius 3 is appended.
- All adjacency uses six neighbors; power distance uses hex distance.
- Battery coverage is its center plus six radius-1 neighbors.
- Legacy saves preserve every non-null facility, up to 36 facilities, on a radius-3 board.
- Keep the code-geometry tile fallback if the Kenney hex model fails.
- Do not commit, push, deploy, stage, or alter Git history.

## File Map

### New files

- `src/systems/HexGridSystem.js` — pure coordinate, topology, world mapping, and legacy-mapping functions.
- `src/ui/CityEnvironment3D.js` — lazily loaded outer roads, trees, rocks, vehicles, citizens, and commercial dressing.
- `tests/e2e/unit/hex-grid.spec.js` — coordinate and migration contracts.
- `tests/e2e/unit/hex-board-rules.spec.js` — gameplay rules on the shared topology.

### Modified files

- `src/core/Constants.js` — board radii, hex dimensions, world spacing, and maximum cells.
- `src/core/GameState.js` — `boardRadius`, 19/37-cell arrays, save payload.
- `src/systems/SaveSystem.js` — schema v3 and deterministic square-to-hex migration.
- `src/systems/BoardSystem.js` — shared neighbors, placement, expansion, edge checks.
- `src/systems/PowerNetworkSystem.js` — hex distance and radius-1 battery hub.
- `src/systems/EconomySystem.js` — six-neighbor pollution pairs.
- `src/systems/QuestSystem.js` — shared adjacency and 37-cell expansion.
- `src/systems/DiagnosisSystem.js` — shared adjacency.
- `src/ui/GridView.js` — radius-aware cell configs.
- `src/ui/CityScene3D.js` — 37-cell capacity, axial world placement, hex tile geometry, environment adapter.
- `src/systems/CameraController.js` — radius-based framing.
- `src/main.js` — text contract and test hooks with axial coordinates.
- Existing unit, gameplay, visual, and performance tests that assume square dimensions.

---

### Task 1: Pure axial hex topology

**Files:**
- Create: `src/systems/HexGridSystem.js`
- Create: `tests/e2e/unit/hex-grid.spec.js`
- Modify: `src/core/Constants.js`

**Interfaces:**
- Produces: `HEX_DIRECTIONS: readonly [q, r][]`
- Produces: `createHexCoordinates(radius): readonly HexCoord[]`
- Produces: `coordKey(coord): string`
- Produces: `buildHexIndex(coords): Map<string, number>`
- Produces: `neighborIndices(index, coords, indexByCoord?): number[]`
- Produces: `hexDistance(a, b): number`
- Produces: `axialToWorld(coord, size): { x, z }`
- Produces: `isOuterRing(index, coords, radius): boolean`
- Produces: `expandHexGrid(grid, fromRadius, toRadius): Cell[]`

- [x] **Step 1: Write exact topology tests**

```js
import { test, expect } from '@playwright/test';
import {
  axialToWorld,
  createHexCoordinates,
  hexDistance,
  isOuterRing,
  neighborIndices,
} from '../../../src/systems/HexGridSystem.js';

test('radius 2 and 3 contain 19 and 37 stable cells', () => {
  const r2 = createHexCoordinates(2);
  const r3 = createHexCoordinates(3);
  expect(r2).toHaveLength(19);
  expect(r3).toHaveLength(37);
  expect(r3.slice(0, 19)).toEqual(r2);
  expect(new Set(r3.map(({ q, r }) => `${q}:${r}`)).size).toBe(37);
});

test('center has six neighbors and edge cells have fewer', () => {
  const coords = createHexCoordinates(2);
  expect(neighborIndices(0, coords)).toHaveLength(6);
  const corner = coords.findIndex(({ q, r }) => q === 2 && r === 0);
  expect(neighborIndices(corner, coords).length).toBeLessThan(6);
  expect(isOuterRing(corner, coords, 2)).toBe(true);
});

test('pointy-top world coordinates and hex distance are deterministic', () => {
  expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
  expect(axialToWorld({ q: 0, r: 1 }, 1)).toEqual({ x: Math.sqrt(3) / 2, z: 1.5 });
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/unit/hex-grid.spec.js`

Expected: FAIL because `HexGridSystem.js` does not exist.

- [x] **Step 3: Add board constants**

```js
export const BOARD = Object.freeze({
  INITIAL_RADIUS: 2,
  EXPANDED_RADIUS: 3,
  INITIAL_CELLS: 19,
  EXPANDED_CELLS: 37,
  HEX_SIZE: 0.56,
});
```

Remove `INITIAL_GRID_SIZE` and `EXPANDED_GRID_SIZE` only after all consumers move to `BOARD`.

- [x] **Step 4: Implement coordinate generation and topology**

```js
export const HEX_DIRECTIONS = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([1, -1]), Object.freeze([0, -1]),
  Object.freeze([-1, 0]), Object.freeze([-1, 1]), Object.freeze([0, 1]),
]);

export function createHexCoordinates(radius) {
  const coords = [{ q: 0, r: 0 }];
  for (let ring = 1; ring <= radius; ring++) {
    let q = -ring;
    let r = ring;
    for (const [dq, dr] of HEX_DIRECTIONS) {
      for (let step = 0; step < ring; step++) {
        coords.push({ q, r });
        q += dq;
        r += dr;
      }
    }
  }
  return coords.map(Object.freeze);
}

export const coordKey = ({ q, r }) => `${q}:${r}`;

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function axialToWorld({ q, r }, size) {
  return { x: Math.sqrt(3) * size * (q + r / 2), z: 1.5 * size * r };
}
```

Implement `neighborIndices` through a coordinate-key Map; do not search the array once per direction in hot paths. `expandHexGrid()` returns the original array entries followed by null cells.

- [x] **Step 5: Pass the topology tests**

Run: `npx playwright test tests/e2e/unit/hex-grid.spec.js`

Expected: PASS.

- [x] **Step 6: Diff check without committing**

Run: `git diff --check -- src/systems/HexGridSystem.js src/core/Constants.js tests/e2e/unit/hex-grid.spec.js`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 2: GameState schema and square-save migration

**Files:**
- Modify: `src/core/GameState.js`
- Modify: `src/systems/SaveSystem.js`
- Create: `tests/e2e/unit/state-v3.spec.js`
- Modify: `tests/e2e/unit/state-v2.spec.js`

**Interfaces:**
- Consumes: `createHexCoordinates`, `expandHexGrid`
- Produces: `mapLegacySquareGrid(grid, size): { grid, indexMap, boardRadius }`
- Produces: save schema `v: 3`, `boardRadius: 2 | 3`

- [x] **Step 1: Write migration tests that preserve all facilities**

```js
test('migrates 25 square cells to radius 3 without dropping facility state', () => {
  const oldGrid = Array.from({ length: 25 }, (_, index) => ({
    type: index % 2 ? 'residential' : 'factory',
    level: (index % 3) + 1,
    priority: 'normal',
  }));
  const migrated = mapLegacySquareGrid(oldGrid, 5);
  expect(migrated.boardRadius).toBe(3);
  expect(migrated.grid).toHaveLength(37);
  expect(migrated.grid.filter(Boolean)).toHaveLength(25);
  expect(migrated.grid.filter(Boolean).map((cell) => cell.level).sort()).toEqual(oldGrid.map((cell) => cell.level).sort());
});

test('new state starts with radius 2 and 19 cells', () => {
  const state = new GameState();
  expect(state.boardRadius).toBe(2);
  expect(state.grid).toHaveLength(19);
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/unit/state-v3.spec.js`

Expected: FAIL because `boardRadius` and migration do not exist.

- [x] **Step 3: Implement deterministic legacy ordering**

```js
const angle = (x, y) => Math.atan2(y, x);

export function mapLegacySquareGrid(grid, size) {
  const center = (size - 1) / 2;
  const occupied = grid
    .map((cell, index) => ({ cell, index, x: index % size - center, y: Math.floor(index / size) - center }))
    .filter(({ cell }) => cell)
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || angle(a.x, a.y) - angle(b.x, b.y) || a.index - b.index);
  const coords = createHexCoordinates(3);
  const targets = coords
    .map((coord, index) => ({ coord, index }))
    .sort((a, b) => hexDistance(a.coord, { q: 0, r: 0 }) - hexDistance(b.coord, { q: 0, r: 0 }) || angle(a.coord.q, a.coord.r) - angle(b.coord.q, b.coord.r) || a.index - b.index);
  const next = Array(37).fill(null);
  const indexMap = new Map();
  occupied.forEach((entry, position) => {
    next[targets[position].index] = { ...entry.cell };
    indexMap.set(entry.index, targets[position].index);
  });
  return { grid: next, indexMap, boardRadius: 3 };
}
```

- [x] **Step 4: Migrate related index-based state**

Use the same `indexMap` for `firstCitySnapshot`, `selectedCell`, and diagnosis records. Reset only `questProgress.consecutiveHours` and transient preview/selection data. Preserve cell priority and battery storage fields.

- [x] **Step 5: Update GameState reset, hydrate, and serialization**

Replace `gridSize` with `boardRadius`, create 19 cells for new games, set `SAVE_VERSION = 3`, and serialize `v: 3`. Accept v2 payloads with `gridSize` and migrate once.

- [x] **Step 6: Run state tests**

Run: `npx playwright test tests/e2e/unit/state-v3.spec.js tests/e2e/unit/state-v2.spec.js`

Expected: PASS; v2 compatibility test now asserts v3 in-memory state.

- [x] **Step 7: Diff check without committing**

Run: `git diff --check -- src/core/GameState.js src/systems/SaveSystem.js tests/e2e/unit/state-v3.spec.js tests/e2e/unit/state-v2.spec.js`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 3: Board, economy, diagnosis, and quest topology

**Files:**
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Modify: `src/systems/DiagnosisSystem.js`
- Modify: `src/systems/QuestSystem.js`
- Create: `tests/e2e/unit/hex-board-rules.spec.js`
- Modify: `tests/e2e/unit/economy.spec.js`
- Modify: `tests/e2e/unit/quest.spec.js`

**Interfaces:**
- Consumes: `neighborIndices(index, coords)` and `isOuterRing`
- Produces: `getBoardCoordinates(state): HexCoord[]`
- Updates: `placementPreview(facilityType, grid, coords): { good, bad }`
- Produces: `expandBoard(): { oldRadius, newRadius, addedIndices }`

- [x] **Step 1: Write shared-neighbor gameplay tests**

```js
test('all six center neighbors produce the same residential green-space bonus', () => {
  const state = makeHexState(2);
  state.grid[0] = { type: 'residential', level: 1 };
  for (const neighbor of neighborIndices(0, createHexCoordinates(2))) {
    const grid = state.grid.map((cell) => cell && { ...cell });
    grid[neighbor] = { type: 'green', level: 1 };
    expect(getCellSpatial(grid, 0, createHexCoordinates(2)).positive).toContain('녹지 생활권');
  }
});

test('radius-two board exposes twelve outer-ring cells for later tidal validation', () => {
  const coords = createHexCoordinates(2);
  expect(coords.filter((_, index) => isOuterRing(index, coords, 2))).toHaveLength(12);
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/unit/hex-board-rules.spec.js`

Expected: FAIL because existing functions expect a square size.

- [x] **Step 3: Centralize board coordinate lookup**

```js
export function getBoardCoordinates(state = gameState) {
  return createHexCoordinates(state.boardRadius);
}
```

Remove local row/column neighbor functions from BoardSystem, EconomySystem, DiagnosisSystem, and QuestSystem.

- [x] **Step 4: Update spatial, pollution, diagnosis, and quest checks**

Every adjacency query passes the current coordinate list to the shared neighbor function. Pollution pairs remain unique by sorted cell index. Placement preview uses the same six-neighbor result as final placement.

- [x] **Step 5: Implement append-only expansion**

```js
export function expandBoard() {
  if (gameState.boardRadius >= BOARD.EXPANDED_RADIUS) return { ok: false, reason: 'already_expanded' };
  const oldLength = gameState.grid.length;
  gameState.grid = expandHexGrid(gameState.grid, gameState.boardRadius, BOARD.EXPANDED_RADIUS);
  gameState.boardRadius = BOARD.EXPANDED_RADIUS;
  const addedIndices = Array.from({ length: gameState.grid.length - oldLength }, (_, offset) => oldLength + offset);
  return { ok: true, oldRadius: 2, newRadius: 3, addedIndices };
}
```

The orchestrator emits `BOARD_EXPANDED` exactly once from this returned payload; `BoardSystem` does not emit the result itself.

- [x] **Step 6: Run targeted rule tests**

Run: `npx playwright test tests/e2e/unit/hex-board-rules.spec.js tests/e2e/unit/economy.spec.js tests/e2e/unit/quest.spec.js`

Expected: PASS.

- [x] **Step 7: Diff check without committing**

Run: `git diff --check -- src/systems/BoardSystem.js src/systems/EconomySystem.js src/systems/DiagnosisSystem.js src/systems/QuestSystem.js tests/e2e/unit`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 4: Hex-distance power network and seven-cell battery hub

**Files:**
- Modify: `src/systems/PowerNetworkSystem.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `tests/e2e/unit/power-network.spec.js`

**Interfaces:**
- Consumes: `coords: HexCoord[]`, `neighborIndices`, `hexDistance`
- Produces: unchanged `calculatePowerNetwork({ grid, coords, hour, tickIndex, heatwave, researchLoad? })`
- Preserves: route shape `{ from, to, via?, efficiency, delivered, kind }`

- [x] **Step 1: Replace square distance tests with exact hex cases**

```js
test('direct transmission loss uses hex distance', () => {
  const coords = createHexCoordinates(3);
  const source = coords.findIndex(({ q, r }) => q === 0 && r === 0);
  const target = coords.findIndex(({ q, r }) => q === 3 && r === -1);
  const result = calculatePowerNetwork({ grid: gridWith(source, 'thermal', target, 'factory', 37), coords, hour: 12, tickIndex: 0 });
  expect(result.routes.find((route) => route.to === target).distance).toBe(3);
  expect(result.routes.find((route) => route.to === target).efficiency).toBeCloseTo(0.88, 5);
});

test('battery serves exactly its center and six adjacent hexes', () => {
  const coords = createHexCoordinates(3);
  const hub = 0;
  const adjacent = neighborIndices(hub, coords);
  expect(adjacent).toHaveLength(6);
  adjacent.forEach((index) => expect(isWithinBatteryHub(hub, index, coords)).toBe(true));
  const radiusTwo = coords.findIndex((coord) => hexDistance(coords[hub], coord) === 2);
  expect(isWithinBatteryHub(hub, radiusTwo, coords)).toBe(false);
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/unit/power-network.spec.js`

Expected: FAIL because the system calculates `[row, column]` Manhattan distance and 3×3 coverage.

- [x] **Step 3: Replace coordinate and distance helpers**

```js
export function isWithinBatteryHub(hubIndex, targetIndex, coords) {
  return hexDistance(coords[hubIndex], coords[targetIndex]) <= 1;
}

const routeDistance = (from, to, coords) => hexDistance(coords[from], coords[to]);
```

Use `routeDistance` for source-to-consumer and source-to-battery segments. Keep `MIN_EFFICIENCY`, per-extra-tile loss, priority, capacity, throughput, charge/discharge order, and no chained batteries.

- [x] **Step 4: Pass coords through the hourly settler**

`SimulationSystem` derives `createHexCoordinates(state.boardRadius)` once per settlement and passes it to power, economy, and quest evaluation. Remove the square `size` parameter from these calls.

- [x] **Step 5: Run power and simulation tests**

Run: `npx playwright test tests/e2e/unit/power-network.spec.js tests/e2e/unit/simulation.spec.js`

Expected: PASS.

- [x] **Step 6: Diff check without committing**

Run: `git diff --check -- src/systems/PowerNetworkSystem.js src/systems/SimulationSystem.js tests/e2e/unit/power-network.spec.js`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 5: Hex 3D tiles, raycasting, camera framing, and ambient positions

**Files:**
- Modify: `src/ui/CityScene3D.js`
- Modify: `src/systems/CameraController.js`
- Modify: `src/ui/GridView.js`
- Modify: `src/main.js`
- Modify: `tests/e2e/game.spec.js`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/visual.spec.js`

**Interfaces:**
- Consumes: `createHexCoordinates(radius)` and `axialToWorld(coord, BOARD.HEX_SIZE)`
- Produces: `renderCityScene3D(cellConfigs, boardRadius)`
- Produces: `window.__getHexCell(index): { q, r, x, z }`
- Produces: radius-aware camera state

- [x] **Step 1: Add real-canvas and position tests**

```js
test('center canvas click resolves to axial center cell 0', async ({ gamePage: page }) => {
  await openHudPanel(page, 'build');
  const box = await page.locator('.board-stage canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect((await gameStateSnapshot(page)).entities[0].index).toBe(0);
});

test('radius 3 renders 37 unique hex tile instances', async ({ gamePage: page }) => {
  await page.evaluate(() => { window.__GAME_STATE__.boardRadius = 3; window.__GAME_STATE__.grid = Array(37).fill(null); window.__refreshGameForTest(); });
  const stats = await page.evaluate(() => window.__getCityRendererStats());
  expect(stats.tileInstances).toBe(37);
  const positions = await page.evaluate(() => Array.from({ length: 37 }, (_, index) => window.__getHexCell(index)));
  expect(new Set(positions.map(({ x, z }) => `${x.toFixed(3)}:${z.toFixed(3)}`)).size).toBe(37);
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/game.spec.js tests/e2e/perf.spec.js -g "axial|37 unique"`

Expected: FAIL because the scene still uses row-major `worldX/worldZ` and max 36 cells.

- [x] **Step 3: Replace scene positions and tile capacity**

Set `MAX_CELLS = BOARD.EXPANDED_CELLS`. Cache `currentCoords = createHexCoordinates(currentRadius)`. Replace every `worldX(index, size)`/`worldZ(index, size)` use with one helper:

```js
function worldPosition(index) {
  return axialToWorld(currentCoords[index], BOARD.HEX_SIZE);
}
```

This applies to facilities, supplements, energy lines, citizens, cars, birds, markers, rotors, motion, and pointer targets.

- [x] **Step 4: Use an instanced hex tile geometry**

Load `terrain.hexGrass` through the asset adapter. If it fails, use:

```js
new THREE.CylinderGeometry(BOARD.HEX_SIZE * 0.98, BOARD.HEX_SIZE * 0.98, 0.12, 6)
```

Rotate the fallback around Y only if the measured Kenney model orientation requires the same pointy-top alignment. Preserve per-instance state colors.

- [x] **Step 5: Make camera framing radius-aware**

Change controller input from `getBoardSize()` to `getBoardRadius()`. Derive board width from pointy-top world extents plus the existing margin. Keep drag, pan, zoom, damping, touch gestures, and reset behavior.

- [x] **Step 6: Update raycasting and renderer stats**

Instanced tile raycasting continues to use `instanceId`, which now directly matches the stable coordinate order. Add `tileInstances`, `boardRadius`, and `hexCellCount` to renderer stats and expose `window.__getHexCell` for deterministic QA.

- [x] **Step 7: Update render text contract**

Change the coordinate note to `axial pointy-top hex grid; index 0 is center; radius 2=19 cells, radius 3=37 cells`. Include each visible entity's `q` and `r` beside its stable index.

- [x] **Step 8: Run gameplay, camera, visual, and perf tests**

Run: `npx playwright test tests/e2e/game.spec.js tests/e2e/motion.spec.js tests/e2e/perf.spec.js tests/e2e/visual.spec.js`

Expected: PASS after deliberate snapshot updates; renderer draw calls and render CPU p95 do not regress beyond the existing accepted threshold.

- [x] **Step 9: Diff check without committing**

Run: `git diff --check -- src/ui/CityScene3D.js src/systems/CameraController.js src/ui/GridView.js src/main.js tests/e2e`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 6: Lazy outer-city environment layer

**Files:**
- Create: `src/ui/CityEnvironment3D.js`
- Modify: `src/ui/CityScene3D.js`
- Modify: `tests/e2e/assets.spec.js`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/visual.spec.js`

**Interfaces:**
- Consumes: common AssetLoader, `ASSETS`, current board radius and theme
- Produces: `createCityEnvironment3D({ scene, assetLoader }): EnvironmentLayer`
- Environment methods: `loadIdle()`, `setBoardRadius(radius)`, `setTheme(theme)`, `getStats()`, `dispose()`

- [x] **Step 1: Write an environment lifecycle test**

```js
test('idle environment loads selected roads and uses instancing for nature', async ({ gamePage: page }) => {
  await page.waitForFunction(() => window.__getCityRendererStats().environment?.state === 'ready');
  const environment = await page.evaluate(() => window.__getCityRendererStats().environment);
  expect(environment.roadModels).toEqual(expect.arrayContaining(['road-straight', 'road-curve', 'road-tee', 'road-cross']));
  expect(environment.treeInstances).toBeGreaterThan(0);
  expect(environment.treeLayers).toBeLessThanOrEqual(5);
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/assets.spec.js -g "idle environment"`

Expected: FAIL because no environment adapter exists.

- [x] **Step 3: Build the isolated environment layer**

The layer owns only decorative objects outside playable cells:

- selected Kenney straight/curve/T/cross road meshes forming a small entrance road beyond the lowest board edge
- up to five tree InstancedMesh layers and three rock layers around the plane perimeter
- two shared-material car clones and one truck clone on roads
- two shared-material citizen clones near the entrance/commercial dressing
- optional commercial buildings only after idle load

It must not own gameplay state, raycasting, power routes, or quest logic.

- [x] **Step 4: Use deterministic placement and no continuous animation**

Generate decoration transforms from a fixed seed and board radius. Cars and citizens remain posed/static; birds remain the existing pooled code silhouettes. Never allocate new objects per render frame.

- [x] **Step 5: Integrate load, theme, radius, and disposal**

Create the layer after critical city assets are ready, call `loadIdle()` through the approved idle scheduler, and forward board expansion/theme events. Dispose cloned scene nodes and instanced layers exactly once.

- [x] **Step 6: Run asset, visual, and performance tests**

Run: `npx playwright test tests/e2e/assets.spec.js tests/e2e/perf.spec.js tests/e2e/visual.spec.js`

Expected: PASS; environment adds bounded draw calls and no per-frame render when the camera and bird pool are idle.

- [x] **Step 7: Diff check without committing**

Run: `git diff --check -- src/ui/CityEnvironment3D.js src/ui/CityScene3D.js tests/e2e`

Expected: no whitespace errors. Do not stage or commit.

---

### Task 7: Campaign expansion, full migration, and regression gate

**Files:**
- Modify: `src/core/QuestDefinitions.js`
- Modify: `src/systems/QuestSystem.js`
- Modify: `tests/e2e/quest-ui.spec.js`
- Modify: `tests/helpers/playthrough.js`
- Modify: all square-specific visual snapshots after review
- Modify: `progress.md`

**Interfaces:**
- Consumes: append-only `expandBoard()` and schema-v3 migration
- Produces: quest 6 reward that expands 19 to 37 cells once

- [x] **Step 1: Add quest expansion acceptance test**

```js
test('quest 6 reward appends the radius 3 ring without moving existing cells', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.grid[0] = { type: 'residential', level: 2, priority: 'essential' };
    state.questIndex = 6;
    state.questStatus = 'ready_to_claim';
    window.__refreshGameForTest();
  });
  await page.locator('#questClaimBtn').click();
  const result = await page.evaluate(() => ({ radius: window.__GAME_STATE__.boardRadius, length: window.__GAME_STATE__.grid.length, center: window.__GAME_STATE__.grid[0] }));
  expect(result).toEqual({ radius: 3, length: 37, center: { type: 'residential', level: 2, priority: 'essential' } });
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/quest-ui.spec.js -g "appends the radius"`

Expected: FAIL while the reward still uses square expansion.

- [x] **Step 3: Wire quest 6 to one-time ring expansion**

Use `expandBoard()` and include `expandedRadius: 3` in the claim result. Repeated claims or hydrated post-expansion states must not add cells twice.

- [x] **Step 4: Replace square helper assumptions**

Update playthrough helpers and tests to use stable explicit cell indices or query axial coordinates through `window.__getHexCell`. Remove assertions for `5×5`, `6×6`, 25, or 36 unless they test legacy migration.

- [x] **Step 5: Run the complete deterministic suite**

Run: `npx playwright test tests/e2e/unit`

Run: `npx playwright test tests/e2e/game.spec.js tests/e2e/quest-ui.spec.js tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/motion.spec.js tests/e2e/assets.spec.js tests/e2e/perf.spec.js`

Expected: PASS.

- [x] **Step 6: Review and update visual snapshots deliberately**

Run: `npx playwright test tests/e2e/visual.spec.js`

Inspect each failure. Update snapshots only when the failure is the approved 19/37-cell geometry or new official asset appearance, not for clipping, wrong scale, missing material, camera framing, or blank tiles.

- [x] **Step 7: Build and inspect browser errors**

Run: `npm run build`

Start Vite on an unused explicit port and run the existing boot console-error test. Expected: build succeeds and console/page errors are empty.

- [x] **Step 8: Record completion evidence without Git operations**

Update `progress.md` with migration behavior, tests, visual review, measured draw calls, and known asset fallbacks.

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors. Do not stage, commit, push, or deploy.
