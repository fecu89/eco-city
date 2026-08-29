# AI City 3D Board and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a controllable, animated, City Kit–based 3D board that preserves all gameplay behavior while eliminating whole-scene rebuilds and meeting a 24-draw-call full-city budget.

**Architecture:** A `CameraController` owns bounded OrbitControls and gesture classification. `CityAssetLoader` loads a curated local GLB subset, normalizes each one into shared geometries, and provides merged procedural fallbacks. `CityScene3D` owns persistent instanced layers, diffs incoming cell configs, updates reusable instance buffers, and exposes read-only diagnostics for Playwright.

**Tech Stack:** JavaScript ESM, Three.js 0.185, GLTFLoader, BufferGeometryUtils, OrbitControls, Vite 8, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-29-3d-city-performance-design.md`

## Global Constraints

- Preserve the existing `initCityScene3D`, `renderCityScene3D`, `setCellClickHandler`, `disposeCityScene3D`, `window.__clickCell`, and `window.__getCellVisual` contracts.
- Preserve stage progression, placement, diagnosis, redesign, save, report, scoring, and all existing tests.
- Use only local `/assets/city-kit/` resources; no runtime third-party requests.
- Full 6x6 board must report no more than 24 board draw calls after warm-up.
- Thirty unchanged-city preview renders must create and delete zero GPU buffers after warm-up.
- Level 1 is neutral gray, level 2 blue, level 3 orange/gold; warning red is not a normal level.
- Camera drag, pan, pinch, or wheel gestures must never place a facility.
- Do not allocate geometry, material, vector, color, matrix, or hit-object arrays in the per-frame hot path.
- Keep gameplay available with procedural geometry when any City Kit asset fails.

## File Map

- `src/systems/CameraController.js`: OrbitControls setup, camera bounds, gesture tracking, reset, and read-only state.
- `src/level/FacilityGeometryFactory.js`: Single-geometry procedural silhouettes used before load and on failure.
- `src/level/CityAssetLoader.js`: Curated GLB/texture loading, geometry normalization, caching, progress/status, and disposal.
- `src/ui/CityScene3D.js`: Persistent scene, instanced layers, config diff, motion state, raycast, stats, and lifecycle.
- `src/ui/ThreeBackground.js`: Static/CSS-only fallback; no second animation loop.
- `index.html`: Decorative background becomes a non-canvas element so the board owns the only WebGL canvas.
- `src/core/Constants.js`: Camera, renderer, asset, level, motion, and performance configuration.
- `src/core/EventBus.js`: Camera, asset, and visual lifecycle events.
- `src/main.js`: Camera reset binding and read-only renderer diagnostics.
- `src/style.css`: Camera hint/reset controls, static background, loading, and responsive safe-area styling.
- `public/assets/city-kit/`: Eleven selected GLBs, four palette textures, and CC0 license.
- `tests/e2e/camera.spec.js`: Desktop camera controls and drag/click separation.
- `tests/e2e/assets.spec.js`: Asset status, fallback contract, and level metadata.
- `tests/e2e/perf.spec.js`: Draw-call, buffer-churn, and reset-resource budgets.
- `tests/e2e/mobile.spec.js`: Touch orbit/pinch separation and control sizing.
- `progress.md` and `docs/architectural-decisions/0003-city-kit-renderer.md`: Final decisions and measurements.

---

### Task 1: Camera controller and input regression tests

**Files:**
- Create: `src/systems/CameraController.js`
- Create: `tests/e2e/camera.spec.js`
- Modify: `src/core/Constants.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/ui/CityScene3D.js`
- Modify: `src/main.js`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: a Three.js `PerspectiveCamera`, renderer DOM canvas, and `() => number` board-size getter.
- Produces: `createCameraController({ camera, domElement, getBoardSize, onInteraction }): CameraController` with `controls`, `update()`, `reset(size)`, `resize(size)`, `isGestureClick(pointerId, x, y)`, `getState()`, and `dispose()`.
- Produces: `window.__getCityCameraState(): {position:number[], target:number[], distance:number, interacting:boolean}` and `window.__resetCityCamera(): void`.

- [ ] **Step 1: Add failing desktop camera tests**

Create `tests/e2e/camera.spec.js`:

```js
import { test, expect } from '../fixtures/game-test.js';

test('mouse orbit changes camera without placing a facility', async ({ gamePage: page }) => {
  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  const before = await page.evaluate(() => window.__getCityCameraState());
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => window.__getCityCameraState());
  expect(after.position).not.toEqual(before.position);
  expect(JSON.parse(await page.evaluate(() => window.render_game_to_text())).entities).toEqual([]);
});

test('reset restores the configured isometric pose', async ({ gamePage: page }) => {
  const initial = await page.evaluate(() => window.__getCityCameraState());
  const box = await page.locator('.city-scene-3d-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.evaluate(() => window.__resetCityCamera());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__getCityCameraState())).toMatchObject({
    position: initial.position,
    target: initial.target,
  });
});
```

- [ ] **Step 2: Run the camera tests and verify the missing API failure**

Run: `npx playwright test tests/e2e/camera.spec.js --reporter=line`

Expected: FAIL because `window.__getCityCameraState` and `window.__resetCityCamera` do not exist.

- [ ] **Step 3: Add camera constants and events**

Add to `Constants.js`:

```js
export const CITY_CAMERA = {
  FOV: 42,
  NEAR: 0.1,
  FAR: 100,
  DISTANCE_PER_GRID: 1.42,
  POSITION_RATIO: [0.62, 0.92, 0.78],
  MIN_DISTANCE_PER_GRID: 0.72,
  MAX_DISTANCE_PER_GRID: 2.8,
  MIN_POLAR_ANGLE: 0.32,
  MAX_POLAR_ANGLE: Math.PI / 2.08,
  DAMPING_FACTOR: 0.075,
  PAN_MARGIN: 0.75,
  DRAG_THRESHOLD_PX: 7,
};
```

Add `CAMERA_CHANGED`, `CAMERA_RESET`, `ASSETS_READY`, `ASSETS_FAILED`, `VISUAL_MOTION_STARTED`, and `VISUAL_MOTION_COMPLETED` to `Events` with the exact event strings from the spec.

- [ ] **Step 4: Implement `CameraController`**

Implement pointer tracking with a `Map<number,{x:number,y:number,moved:boolean}>`, `OrbitControls` with pan enabled, target clamping to `±(boardSize - 1) / 2 + PAN_MARGIN`, and a reusable state object returned as copied number arrays. `isGestureClick` must return false after any tracked pointer exceeds `DRAG_THRESHOLD_PX`, after multi-touch, or while controls report an active interaction.

Use `controls.addEventListener('start'|'change'|'end')` to set interaction state, clamp the target, call `onInteraction`, and emit camera events. `reset(size)` must set the configured camera position and target without animation so tests are deterministic.

- [ ] **Step 5: Wire controller and UI affordances into the board**

In `CityScene3D`, create the controller after the renderer and use `controller.isGestureClick(...)` instead of `movementX`/`movementY`. Add `.city-camera-hint` and a 44 px `.city-camera-reset` button to the board container; the button calls `controller.reset(currentSize)` and stops pointer propagation. Fade the hint after the first camera change. Subscribe to `stage:changed` and reset the camera for the active board size; a board-size rebuild also resets it. Position the controls with `var(--ogp-safe-top-inset, 0px)` and `var(--ogp-safe-bottom-inset, 0px)` so Play.fun chrome cannot cover them.

Expose read-only `getCityCameraState()` and `resetCityCamera()` exports, then bind the two window test APIs in `main.js`.

- [ ] **Step 6: Run focused and existing raycast tests**

Run:

```bash
npx playwright test tests/e2e/camera.spec.js tests/e2e/game.spec.js -g "camera|raycasting|placing a facility" --reporter=line
```

Expected: all selected tests PASS; orbit changes pose, reset is exact, and the center raycast still returns index 12.

- [ ] **Step 7: Commit the camera slice**

```bash
git add AI_City_Webgame_V3/src/core/Constants.js AI_City_Webgame_V3/src/core/EventBus.js AI_City_Webgame_V3/src/systems/CameraController.js AI_City_Webgame_V3/src/ui/CityScene3D.js AI_City_Webgame_V3/src/main.js AI_City_Webgame_V3/src/style.css AI_City_Webgame_V3/tests/e2e/camera.spec.js
git commit -m "feat: add bounded interactive city camera"
```

### Task 2: Local City Kit asset pipeline and fallback geometry

**Files:**
- Create: `src/level/FacilityGeometryFactory.js`
- Create: `src/level/CityAssetLoader.js`
- Create: `tests/e2e/assets.spec.js`
- Create: `public/assets/city-kit/` curated files
- Modify: `src/core/Constants.js`
- Modify: `src/ui/CityScene3D.js`

**Interfaces:**
- Consumes: `CITY_ASSETS`, `LEVEL_VISUALS`, EventBus asset events, and local GLB/PNG files.
- Produces: `createFacilityFallbackGeometry(type): BufferGeometry`.
- Produces: `initCityAssets(onProgress?: (loaded:number,total:number) => void): Promise<AssetStatus>`, `getFacilityGeometry(type): BufferGeometry`, `getSupplementGeometry(type): BufferGeometry|null`, `getAssetStatus(): {state, loaded, fallbacks, errors}`, and `disposeCityAssets(): void`.

- [ ] **Step 1: Copy only the approved local assets**

Create `public/assets/city-kit/` and copy:

```text
building-a.glb building-b.glb building-c.glb building-d.glb building-g.glb
building-l.glb building-m.glb building-p.glb building-q.glb building-r.glb
chimney-large.glb detail-tank.glb
colormap.png variation-a.png variation-b.png variation-c.png License.txt
```

Use the source files under repository `assets/city-kit/`; preserve `License.txt` unchanged.

- [ ] **Step 2: Add failing asset contract tests**

Create `tests/e2e/assets.spec.js`:

```js
import { test, expect } from '../fixtures/game-test.js';

test('all facilities resolve to City Kit or a procedural fallback', async ({ gamePage: page }) => {
  await page.waitForFunction(() => window.__getCityAssetStatus?.().state !== 'loading');
  const status = await page.evaluate(() => window.__getCityAssetStatus());
  expect(status.state).toBe('ready');
  expect(status.loaded.length + status.fallbacks.length).toBe(10);
  expect(status.errors).toEqual([]);
});

test('level visuals provide redundant distinct encodings', async ({ gamePage: page }) => {
  const levels = await page.evaluate(() => window.__getCityLevelVisuals());
  expect(new Set(levels.map((x) => x.color)).size).toBe(3);
  expect(levels.map((x) => x.scale)).toEqual([...levels.map((x) => x.scale)].sort((a, b) => a - b));
  expect(levels.map((x) => x.segments)).toEqual([1, 2, 3]);
});
```

- [ ] **Step 3: Run the tests and verify missing diagnostics**

Run: `npx playwright test tests/e2e/assets.spec.js --reporter=line`

Expected: FAIL because the asset and level diagnostics do not exist.

- [ ] **Step 4: Add exact asset and level configuration**

Add `CITY_ASSETS` with the table from the spec, an asset root of `/assets/city-kit/`, target footprint `0.66`, target height per facility, and supplements for nuclear/cooling. Add:

```js
export const LEVEL_VISUALS = [
  null,
  { color: 0xb7bdc9, scale: 0.86, segments: 1, palette: 'variation-c' },
  { color: 0x739fe8, scale: 1.00, segments: 2, palette: 'colormap' },
  { color: 0xf0a06f, scale: 1.13, segments: 3, palette: 'variation-a' },
];
```

- [ ] **Step 5: Implement merged procedural fallback geometries**

Use module-level primitive geometries and `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`. Clone and transform primitives into recognizable one-material silhouettes for all ten facility types, merge them into one `BufferGeometry` per type, compute normals/bounds, cache them, and never dispose source primitives per cell.

- [ ] **Step 6: Implement cached GLB loading and normalization**

For each facility, load its primary GLB once. Traverse for the first mesh, clone its geometry, apply `matrixWorld`, translate it to center X/Z and floor Y=0, scale uniformly to the configured footprint/height, recompute bounds, and cache the normalized geometry. Dispose embedded loader material/texture resources after extracting geometry because the renderer uses shared materials.

Load supplements through the same path. If any file fails, retain the cached fallback geometry for that facility, record the type in `fallbacks`, record a concise error, and continue resolving the overall promise.

- [ ] **Step 7: Start assets at scene boot, report progress, and expose diagnostics**

Render fallback geometry immediately, call `initCityAssets(onProgress)`, update the existing loading bar/text with `3D 도시 모델 loaded/total` while loading, then rebuild only the affected facility instance layers when the promise resolves. Listen for `assets:failed` once and show one non-blocking fallback toast. Expose `window.__getCityAssetStatus` and `window.__getCityLevelVisuals` as copied read-only values.

- [ ] **Step 8: Run asset, build, and no-console-error checks**

Run:

```bash
npm run build
npx playwright test tests/e2e/assets.spec.js tests/e2e/game.spec.js -g "assets|level visuals|no console errors" --reporter=line
```

Expected: build succeeds; all ten facilities resolve; no asset request or console errors occur.

- [ ] **Step 9: Commit the asset pipeline**

```bash
git add AI_City_Webgame_V3/public/assets/city-kit AI_City_Webgame_V3/src/core/Constants.js AI_City_Webgame_V3/src/level AI_City_Webgame_V3/src/ui/CityScene3D.js AI_City_Webgame_V3/src/main.js AI_City_Webgame_V3/tests/e2e/assets.spec.js
git commit -m "feat: integrate local City Kit assets"
```

### Task 3: Persistent instanced board renderer

**Files:**
- Modify: `src/ui/CityScene3D.js`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/game.spec.js`

**Interfaces:**
- Consumes: normalized facility and supplement geometries, `LEVEL_VISUALS`, cell config arrays, camera controller.
- Produces: `getCityRendererStats(): {drawCalls, geometries, textures, programs, renders, configUpdates, instanceGroups, activeMotions}`.

- [ ] **Step 1: Add failing renderer budget tests**

Append to `perf.spec.js` a representative 6x6 mixed city that sets the exposed game state, calls a new test-only `window.__renderCityForTest()`, waits two animation frames, and asserts `window.__getCityRendererStats().drawCalls <= 24`.

Add a reset-resource test that captures `{geometries,textures,programs}`, performs the existing UI reset three times, waits for rendering to settle, and asserts each value is at most its warmed baseline.

- [ ] **Step 2: Verify current renderer fails the diagnostic/budget test**

Run: `npx playwright test tests/e2e/perf.spec.js -g "draw-call|renderer resources" --reporter=line`

Expected: FAIL because renderer diagnostics and test rendering hook are absent.

- [ ] **Step 3: Replace individual tiles with one `InstancedMesh`**

Allocate one box geometry, one tile material with vertex/instance colors, one `InstancedMesh` capacity of 36, and reusable `Matrix4`/`Color`. Set each tile matrix from row/column, set color from selection/preview/diagnosis/new-land priority, and set `count = size * size`. Raycasting must intersect only this mesh and use `hit.instanceId` as the cell index.

- [ ] **Step 4: Add persistent facility instance groups**

Create one primary `InstancedMesh` per facility type with capacity 36 and one supplement mesh where configured. Each config update clears preallocated per-type cell-index arrays, repopulates them from the current persistent visual entries, writes compact matrices/colors, and sets mesh `count`. Geometry and material objects remain stable across preview, selection, and diagnosis updates.

Use one shared `MeshStandardMaterial` for all primary facility layers with the neutral City Kit texture and instance colors. The three colors are sampled from the approved level palettes; silhouettes, scale, and pedestal segments provide redundant encoding.

- [ ] **Step 5: Add shared marker and pedestal layers**

Use one instanced ring for selection/preview/diagnosis footprints, one instanced marker geometry for good/warn links, and three compact instanced pedestal-segment layers. Do not create per-cell materials or rings.

- [ ] **Step 6: Preserve config and test contracts**

Keep a copied `cellConfigs` array for `window.__getCellVisual`. `window.__clickCell(index)` must check `disabled` and invoke the active click callback. `window.__renderCityForTest()` must call the existing `renderGrid()` path, not mutate renderer internals directly.

- [ ] **Step 7: Expose renderer statistics and run budgets**

Read `renderer.info.render.calls`, `renderer.info.memory`, and `renderer.info.programs.length` after each completed render. Return copied scalar values through `getCityRendererStats` and the window diagnostic.

Run: `npx playwright test tests/e2e/perf.spec.js tests/e2e/game.spec.js -g "draw-call|renderer resources|raycasting|adjacency preview" --reporter=line`

Expected: all selected tests PASS and the representative 6x6 city reports at most 24 calls.

- [ ] **Step 8: Commit the persistent renderer**

```bash
git add AI_City_Webgame_V3/src/ui/CityScene3D.js AI_City_Webgame_V3/src/main.js AI_City_Webgame_V3/tests/e2e/perf.spec.js AI_City_Webgame_V3/tests/e2e/game.spec.js
git commit -m "perf: render city with persistent instances"
```

### Task 4: Level transitions and purposeful motion

**Files:**
- Modify: `src/core/Constants.js`
- Modify: `src/ui/CityScene3D.js`
- Modify: `tests/e2e/assets.spec.js`
- Modify: `tests/e2e/game.spec.js`

**Interfaces:**
- Consumes: previous and incoming cell configs plus level/motion constants.
- Produces: per-cell visual entry `{type, level, scale, y, motion, startedAt, removeAfter}` and renderer stat `activeMotions`.

- [ ] **Step 1: Add failing motion-state tests**

Add tests that place a cell and immediately expect `activeMotions > 0`, wait longer than placement duration and expect zero; upgrade an existing cell through the inspector and assert its `window.__getCellVisual(index).level` and diagnostic level metadata change to level 2.

- [ ] **Step 2: Verify the motion diagnostic test fails**

Run: `npx playwright test tests/e2e/assets.spec.js tests/e2e/game.spec.js -g "motion|level transition" --reporter=line`

Expected: FAIL because `activeMotions` and persistent transition state are absent.

- [ ] **Step 3: Add motion constants and easing helpers**

Add exact durations: place 480 ms, upgrade 520 ms, demolish 320 ms, selection pulse 1400 ms, ambient update 30 FPS, and max delta 0.1 s. Implement allocation-free `easeOutBack`, `easeInCubic`, and smoothstep helpers in `CityScene3D`.

- [ ] **Step 4: Diff config into persistent motion entries**

On empty→occupied, start `place` at scale 0.01 and y -0.35. On same type with increased level, start `upgrade` from the previous level scale/color. On occupied→empty, retain the old visual entry until the demolition duration completes. Complete motions emit the visual completion event and mark instance buffers dirty.

- [ ] **Step 5: Add bounded semantic ambient motion**

Create a combined rotor geometry and one instanced rotor layer for wind cells. Create one `Points` layer each for data lights, cooling vapor, and thermal smoke with preallocated position/alpha attributes. Update only at the configured 30 FPS cadence and only when matching facilities exist.

Selection and preview pulse only marker material intensity/color state; whole buildings do not bob.

- [ ] **Step 6: Run motion, gameplay, and draw-call tests**

Run:

```bash
npx playwright test tests/e2e/assets.spec.js tests/e2e/game.spec.js tests/e2e/perf.spec.js -g "motion|level transition|placing|upgraded|draw-call" --reporter=line
```

Expected: motion tests PASS and draw calls remain at or below 24.

- [ ] **Step 7: Commit the motion slice**

```bash
git add AI_City_Webgame_V3/src/core/Constants.js AI_City_Webgame_V3/src/ui/CityScene3D.js AI_City_Webgame_V3/tests/e2e/assets.spec.js AI_City_Webgame_V3/tests/e2e/game.spec.js
git commit -m "feat: animate city placement and upgrades"
```

### Task 5: Eliminate background GPU loop and verify buffer churn/mobile gestures

**Files:**
- Modify: `src/ui/ThreeBackground.js`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/ui/CityScene3D.js`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes: renderer DPR constants and camera pointer APIs.
- Produces: one active WebGL canvas, adaptive DPR, touch gesture tests, and WebGL buffer-churn measurements.

- [ ] **Step 1: Add WebGL instrumentation and failing churn test**

Create a Playwright test that calls `page.addInitScript` before navigation to wrap `WebGLRenderingContext` and `WebGL2RenderingContext` `createBuffer`/`deleteBuffer`, warms the board, resets counters, alternates two dock selections thirty times with 20 ms gaps, waits two frames, and expects both counters to be zero.

Add an assertion that `document.querySelectorAll('canvas').length` is one after loading.

- [ ] **Step 2: Add failing mobile touch-drag test**

In `mobile.spec.js`, use a CDP `Input.dispatchTouchEvent` start/move/end sequence across the board. Assert camera position changed and entity count remained zero. Assert `.city-camera-reset` has a bounding box at least 44×44 CSS pixels.

- [ ] **Step 3: Run tests and confirm the current background/count failure**

Run: `npx playwright test tests/e2e/perf.spec.js tests/e2e/mobile.spec.js -g "buffer churn|single WebGL|touch drag|camera reset" --reporter=line`

Expected before implementation: canvas-count and/or touch diagnostics FAIL.

- [ ] **Step 4: Replace animated Three.js background with CSS decoration**

Replace `<canvas id="threeBg">` in `index.html` with `<div id="threeBg" aria-hidden="true"></div>`. Change `initThreeBackground` to add a `three-bg-ready` body class and return a no-op disposer. Recreate the wireframe/glow impression with fixed radial gradients and two low-opacity CSS pseudo-elements; no canvas context or requestAnimationFrame is created.

- [ ] **Step 5: Apply adaptive DPR and demand rendering**

Use `matchMedia('(pointer: coarse)')` to choose the configured mobile/desktop DPR cap. Use `renderer.setAnimationLoop`, cap delta, and skip `renderer.render` unless scene state is dirty, controls are interacting/damping, motion is active, or an ambient facility exists. Reset `renderer.info` only after diagnostics capture.

- [ ] **Step 6: Run churn/mobile/performance tests**

Run:

```bash
npx playwright test tests/e2e/perf.spec.js tests/e2e/mobile.spec.js tests/e2e/camera.spec.js --reporter=line
```

Expected: one WebGL canvas, zero warmed preview buffer churn, desktop/touch camera tests PASS, and draw-call budget holds.

- [ ] **Step 7: Commit the final performance slice**

```bash
git add AI_City_Webgame_V3/index.html AI_City_Webgame_V3/src/ui/ThreeBackground.js AI_City_Webgame_V3/src/ui/CityScene3D.js AI_City_Webgame_V3/src/style.css AI_City_Webgame_V3/tests/e2e/perf.spec.js AI_City_Webgame_V3/tests/e2e/mobile.spec.js
git commit -m "perf: remove duplicate WebGL render loop"
```

### Task 6: Full regression, visual review, and documentation

**Files:**
- Create: `docs/architectural-decisions/0003-city-kit-renderer.md`
- Modify: `docs/architectural-decisions/0002-3d-board-rendering.md`
- Modify: `docs/tech.md`
- Modify: `progress.md`
- Modify: visual snapshots only when the new approved rendering is stable

**Interfaces:**
- Consumes: all completed implementation slices and measured diagnostics.
- Produces: passing build/test suite, reviewed desktop/mobile screenshots, before/after metrics, and final handoff.

- [ ] **Step 1: Run formatting/static sanity checks and production build**

Run:

```bash
git diff --check
npm run build
```

Expected: no whitespace errors; Vite build exits 0. The existing large-bundle warning is acceptable only if the emitted gzip size does not materially exceed the pre-change 243.93 kB JS baseline plus the separately served local GLBs.

- [ ] **Step 2: Run the full Playwright suite**

Run: `npm test -- --reporter=line`

Expected: all existing and new tests PASS with no retries required for camera, asset, or performance tests.

- [ ] **Step 3: Capture deterministic review screenshots**

Capture desktop 1440×900 and mobile 390×844 screenshots for:

- Empty initial board with camera affordances.
- Mixed facility city containing levels 1, 2, and 3.
- Diagnosis state with good and problem footprints.
- Rotated/panned camera view.

Inspect each screenshot for clipped canvas, ambiguous level colors, oversized models, floating models, hidden controls, modal overlap, and low-contrast text. Fix any issue and repeat build/focused tests.

- [ ] **Step 4: Re-run quantitative before/after measurement**

Record:

- Empty and representative full-city draw calls.
- Thirty preview-change buffer creates/deletes.
- Renderer geometry/texture/program counts before and after three resets.
- Desktop and mobile camera gesture pass results.
- Asset count, total curated transfer size, and fallback count.

Acceptance: full city ≤24 calls, preview churn 0/0, no reset resource growth, all ten facilities loaded or explicitly in fallback status, and camera gestures never place cells.

- [ ] **Step 5: Update ADR, tech docs, and progress log**

ADR-0003 must supersede the procedural-model and fixed-camera portions of ADR-0002, document the curated City Kit mapping, CC0 license, persistent instancing, camera behavior, fallback policy, and measured performance. `progress.md` must record the original user feedback, completed tasks, exact before/after metrics, test count, and remaining non-blocking limitations.

- [ ] **Step 6: Apply verification-before-completion skill and commit docs/snapshots**

Run the verification skill checklist against fresh command output, then:

```bash
git add AI_City_Webgame_V3/docs AI_City_Webgame_V3/progress.md AI_City_Webgame_V3/tests/e2e/visual.spec.js-snapshots
git commit -m "docs: record City Kit renderer results"
```

- [ ] **Step 7: Report the completed outcome**

Report implemented features, exact performance deltas, build/test results, visual review coverage, files added/modified, and the commands the user can run to verify locally.
