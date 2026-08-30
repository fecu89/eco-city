# Construction Permits, Batch Planning, and Ambient Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe quest-panel dragging, compact K/M HUD values, atomic multi-facility construction planning, quest-level facility permits, and bounded low-frequency ambient motion.

**Architecture:** Keep committed city data in `GameState.grid` and transient uncommitted placements in `GameState.constructionPlan`. Pure permit and plan systems own validation; UI modules only render their results and emit EventBus requests. Three.js preallocates per-type plan ghosts and two shared ambient-effect layers so planning and motion never allocate GPU resources during interaction.

**Tech Stack:** JavaScript ES modules, Three.js 0.185, anime.js, Lucide, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-30-construction-permits-ambient-motion-design.md`

## Global Constraints

- Never run `git add`, `git commit`, `git push`, create a PR, deploy, or mutate repository history; this repository is not owned by the user.
- Preserve EventBus domain naming, centralized GameState, constants-only balance values, and the single Three.js WebGL context.
- Existing saves over a new facility cap retain every building; only additional placement is denied.
- `constructionPlan` is transient and must never be serialized.
- Plan confirmation is atomic: one invalid item changes neither credits nor grid.
- Ambient effects update at most every 100ms, run at most three concurrently, and stop WebGL draws when idle.
- Existing settled 37-cell city draw-call budget remains 24; temporary plan/effect layers may add draw calls only while visible.
- Mobile quest UI remains a non-draggable bottom sheet.

---

### Task 1: Compact numeric formatting

**Files:**
- Modify: `src/core/Money.js`
- Modify: `src/ui/format.js`
- Modify: `src/ui/HudView.js`
- Modify: `src/ui/SimulationHudView.js`
- Modify: `src/ui/GridView.js`
- Test: `tests/e2e/unit/money.spec.js`
- Test: `tests/e2e/hud.spec.js`

**Interfaces:**
- Produces: `formatCompactNumber(value, options) -> string`
- Produces: `formatCredits(value, { suffix, compact }) -> string`
- Produces: `exactNumberLabel(value, fractionDigits) -> string`

- [ ] **Step 1: Write failing compact-number unit tests**

```js
import { formatCompactNumber, formatCredits } from '../../../src/core/Money.js';

test('compact numbers use stable K and M boundaries', () => {
  expect(formatCompactNumber(999.99, { fractionDigits: 2 })).toBe('999.99');
  expect(formatCompactNumber(1000)).toBe('1K');
  expect(formatCompactNumber(12500)).toBe('12.5K');
  expect(formatCompactNumber(999900)).toBe('999.9K');
  expect(formatCompactNumber(1250000)).toBe('1.25M');
  expect(formatCompactNumber(-1250000)).toBe('-1.25M');
  expect(formatCredits(1250, { suffix: false, compact: true })).toBe('1.25K');
});
```

- [ ] **Step 2: Run the focused unit test and verify RED**

Run: `npx playwright test tests/e2e/unit/money.spec.js --workers=1 --retries=0`

Expected: FAIL because `formatCompactNumber` and the `compact` option do not exist.

- [ ] **Step 3: Implement deterministic compact formatting**

```js
const COMPACT_UNITS = [
  { threshold: 1_000_000, divisor: 1_000_000, suffix: 'M' },
  { threshold: 1_000, divisor: 1_000, suffix: 'K' },
];

export function formatCompactNumber(value, { fractionDigits = 2 } = {}) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
  const unit = COMPACT_UNITS.find(({ threshold }) => Math.abs(numeric) >= threshold);
  if (!unit) return normalizeNegativeZero(numeric).toFixed(fractionDigits);
  const scaled = Math.round((numeric / unit.divisor + Number.EPSILON) * 100) / 100;
  const compactText = normalizeNegativeZero(scaled).toFixed(2).replace(/\.?0+$/, '');
  return `${compactText}${unit.suffix}`;
}

export function formatCredits(value, { suffix = true, compact = false } = {}) {
  const rounded = roundCredits(value);
  const text = compact && Math.abs(rounded) >= 1000
    ? formatCompactNumber(rounded)
    : rounded.toFixed(2);
  return suffix ? `${text} ${DISPLAY_UNITS.CREDIT}` : text;
}
```

- [ ] **Step 4: Add a browser regression for compact HUD values and exact titles**

```js
await page.evaluate(() => {
  const state = window.__GAME_STATE__;
  state.credits = 1_250_000;
  state.lastSettlementDelta = 12_500;
  state.lastTickSummary = {
    deliveredPower: 12500, demand: 10000, hourlyCarbon: 1250,
    hourlyWater: 1200000, workforce: 12500, jobs: 11000,
  };
  window.__refreshGameForTest();
});
await expect(page.locator('#credits')).toHaveText('1.25M');
await expect(page.locator('#credits').locator('xpath=..')).toHaveAttribute('title', /1,250,000/);
await expect(page.locator('#simPower')).toHaveText('12.5K/10K E');
```

- [ ] **Step 5: Wire compact display into narrow HUD and plan forecast only**

Use compact values in `HudView`, `SimulationHudView`, and `GridView`. Set the parent metric `title` and `aria-label` from the unabridged localized value. Do not change detailed inspector/report formatting.

- [ ] **Step 6: Run money and HUD tests and record the checkpoint**

Run: `npx playwright test tests/e2e/unit/money.spec.js tests/e2e/hud.spec.js --workers=1 --retries=0`

Expected: PASS. Do not commit; keep the verified local checkpoint.

---

### Task 2: Quest-level facility permit rules

**Files:**
- Modify: `src/core/Constants.js`
- Create: `src/systems/FacilityPermitSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/ui/DockView.js`
- Modify: `src/ui/StageModals.js`
- Test: `tests/e2e/unit/facility-permits.spec.js`
- Test: `tests/e2e/game.spec.js`

**Interfaces:**
- Produces: `getFacilityLimits(questIndex) -> Record<string, number>`
- Produces: `getFacilityPermitForCount(state, type, plannedCount) -> permit`
- Produces: `getFacilityPermit(state, type, plan) -> { ok, current, planned, limit, nextIncreaseQuest, reason, message }`
- Produces: `validateGridFacilityDependencies(grid) -> { ok, reason, message }`
- Produces: `validateDemolitionPermit(state, index) -> { ok, reason, message }`
- Consumes: `FACILITY_LIMIT_INCREASES` from `Constants.js`

- [ ] **Step 1: Write failing cumulative-limit and dependency tests**

```js
test('facility limits accumulate through all fifteen quests', () => {
  expect(getFacilityLimits(1)).toMatchObject({ residential: 2 });
  expect(getFacilityLimits(5)).toMatchObject({ residential: 5, thermal: 2, nuclear: 1 });
  expect(getFacilityLimits(10)).toMatchObject({ nuclear: 2, solar: 4, battery: 3, green: 3 });
  expect(getFacilityLimits(15)).toMatchObject({ residential: 10, nuclear: 2, solar: 6, tidal: 3 });
});

test('existing and planned facilities share one cap', () => {
  const state = new GameState();
  state.questIndex = 1;
  state.grid[0] = { type: 'residential', level: 1 };
  expect(getFacilityPermit(state, 'residential', [{ index: 1, type: 'residential' }])).toMatchObject({
    ok: false, current: 1, planned: 1, limit: 2, reason: 'facility_limit',
  });
});

test('nuclear needs thermal reserve and locks the last thermal demolition', () => {
  expect(validateGridFacilityDependencies([{ type: 'nuclear', level: 1 }])).toMatchObject({ ok: false, reason: 'thermal_reserve_required' });
  const state = new GameState();
  state.grid[0] = { type: 'thermal', level: 1 };
  state.grid[1] = { type: 'nuclear', level: 1 };
  expect(validateDemolitionPermit(state, 0)).toMatchObject({ ok: false, reason: 'last_thermal_supports_nuclear' });
});
```

- [ ] **Step 2: Run permit tests and verify RED**

Run: `npx playwright test tests/e2e/unit/facility-permits.spec.js --workers=1 --retries=0`

Expected: FAIL because the permit system does not exist.

- [ ] **Step 3: Add the exact approved limit increments to constants**

```js
export const FACILITY_LIMIT_INCREASES = Object.freeze({
  1: Object.freeze({ residential: 2 }),
  2: Object.freeze({ residential: 3, thermal: 1 }),
  3: Object.freeze({ residential: 4, factory: 2 }),
  4: Object.freeze({ residential: 5, thermal: 2, data: 1 }),
  5: Object.freeze({ nuclear: 1 }),
  6: Object.freeze({ residential: 6, factory: 3, data: 2, cooling: 2 }),
  7: Object.freeze({ residential: 7, solar: 2 }),
  8: Object.freeze({ solar: 3, battery: 2 }),
  9: Object.freeze({ residential: 8, factory: 4, data: 3, cooling: 3, wind: 2 }),
  10: Object.freeze({ nuclear: 2, solar: 4, battery: 3, wind: 3, green: 3 }),
  11: Object.freeze({ residential: 9, green: 5, tidal: 1 }),
  12: Object.freeze({ factory: 5, data: 4, cooling: 4, solar: 5, wind: 4, tidal: 2 }),
  13: Object.freeze({ residential: 10, battery: 4, green: 6 }),
  14: Object.freeze({ cooling: 5, solar: 6, wind: 5, green: 7, tidal: 3 }),
  15: Object.freeze({}),
});
```

- [ ] **Step 4: Implement pure permit functions**

Accumulate the latest value per type through `questIndex`, count real and planned items separately, find the next later quest whose value is higher, and return exact Korean messages from the pure result.

```js
export function getFacilityPermit(state, type, plan = []) {
  const planned = plan.filter((item) => item.type === type).length;
  return getFacilityPermitForCount(state, type, planned);
}

export function getFacilityPermitForCount(state, type, planned = 0) {
  const limits = getFacilityLimits(state.questIndex);
  const current = countType(state.grid, type);
  const limit = limits[type] ?? 0;
  const projectedAfterPlacement = current + planned + 1;
  const ok = projectedAfterPlacement <= limit;
  return {
    ok,
    current,
    planned,
    limit,
    projectedAfterPlacement,
    nextIncreaseQuest: findNextIncrease(state.questIndex, type, limit),
    reason: ok ? null : 'facility_limit',
    message: permitMessage({ ok, current, planned, limit, type }),
  };
}
```

`getFacilityPermit()` answers whether one additional candidate may be added. The plan already contains only previously queued items; the candidate being tested is not included in `plan`.

- [ ] **Step 5: Integrate placement and demolition validation**

Extend `validatePlacement(state, facilityKey, index, options = {})` with `grid`, `availableCredits`, `plan`, `skipPermit`, and `requireNuclearReserve` overrides. Run capacity after unlock and before credits unless `skipPermit` is true. Add `facility_limit` and `thermal_reserve_required` to placement messages. Call `validateDemolitionPermit()` before opening the irreversible demolition flow.

- [ ] **Step 6: Render permit counts and disabled state in the facility dock**

Add a `.facility-limit` badge containing `현재`, optional `+계획`, and `최대`. A cap-disabled card uses `aria-disabled=true`, retains pointer events for explanation, and displays the next increase quest or campaign maximum.

- [ ] **Step 7: Run permit, board, game, and demolition tests**

Run: `npx playwright test tests/e2e/unit/facility-permits.spec.js tests/e2e/unit/facility-tech.spec.js tests/e2e/game.spec.js tests/e2e/demolition-warning.spec.js --workers=1 --retries=0`

Expected: PASS with no existing save deletion.

---

### Task 3: Atomic construction-plan domain

**Files:**
- Modify: `src/core/GameState.js`
- Modify: `src/core/EventBus.js`
- Create: `src/systems/ConstructionPlanSystem.js`
- Test: `tests/e2e/unit/construction-plan.spec.js`
- Test: `tests/e2e/unit/state-v5.spec.js`

**Interfaces:**
- Produces: `upsertPlannedFacility(state, type, index) -> assessment`
- Produces: `removePlannedFacility(state, index) -> assessment`
- Produces: `clearConstructionPlan(state) -> assessment`
- Produces: `assessConstructionPlan(state) -> { ok, items, errors, totalCost, projectedCredits, projectedGrid }`
- Produces: `commitConstructionPlan(state) -> { ok, placements, totalCost, metrics }`
- Consumes: `validatePlacement`, `refreshMetrics`, permit dependency functions.

- [ ] **Step 1: Write failing plan-state, replacement, and atomicity tests**

```js
test('plan supports mixed add, replace, toggle remove, and cumulative cost', () => {
  const state = preparedState(5, 30, ['residential', 'thermal', 'factory']);
  upsertPlannedFacility(state, 'residential', 0);
  upsertPlannedFacility(state, 'thermal', 1);
  expect(assessConstructionPlan(state)).toMatchObject({ ok: true, totalCost: 7, projectedCredits: 23 });
  upsertPlannedFacility(state, 'factory', 0);
  expect(state.constructionPlan).toEqual([{ index: 0, type: 'factory' }, { index: 1, type: 'thermal' }]);
  upsertPlannedFacility(state, 'factory', 0);
  expect(state.constructionPlan).toEqual([{ index: 1, type: 'thermal' }]);
});

test('one invalid item makes batch commit atomic', () => {
  const state = preparedState(2, 6, ['residential', 'thermal']);
  state.constructionPlan = [{ index: 0, type: 'residential' }, { index: 1, type: 'thermal' }];
  const before = state.serialize();
  expect(commitConstructionPlan(state)).toMatchObject({ ok: false, reason: 'invalid_plan' });
  expect(state.grid).toEqual(before.grid);
  expect(state.credits).toBe(before.credits);
});

test('construction plan is never serialized', () => {
  const state = new GameState();
  state.constructionPlan = [{ index: 0, type: 'residential' }];
  expect(state.serialize()).not.toHaveProperty('constructionPlan');
  const restored = new GameState();
  expect(restored.hydrate(state.serialize())).toBe(true);
  expect(restored.constructionPlan).toEqual([]);
});
```

- [ ] **Step 2: Run plan tests and verify RED**

Run: `npx playwright test tests/e2e/unit/construction-plan.spec.js tests/e2e/unit/state-v5.spec.js --workers=1 --retries=0`

- [ ] **Step 3: Add transient GameState and EventBus events**

Add `constructionPlan = []` in reset and force it to `[]` in hydrate. Add `BUILD_PLAN_CHANGED`, `BUILD_PLAN_CLEARED`, `BUILD_PLAN_COMMIT_REQUESTED`, and `BUILD_PLAN_COMMITTED` event constants with `buildPlan:*` values.

- [ ] **Step 4: Implement assessment without mutating committed state**

```js
export function assessConstructionPlan(state) {
  const projectedGrid = cloneGrid(state.grid);
  const errors = [];
  let totalCost = 0;
  const typeCounts = countPlanTypes(state.constructionPlan);
  for (const [type, plannedCount] of Object.entries(typeCounts)) {
    const permit = getFacilityPermitForCount(state, type, plannedCount - 1);
    if (!permit.ok) errors.push({ index: null, type, ...permit });
  }
  for (const item of stablePlan(state.constructionPlan)) {
    const validation = validatePlacement(state, item.type, item.index, {
      grid: projectedGrid,
      availableCredits: state.credits - totalCost,
      skipPermit: true,
      requireNuclearReserve: false,
    });
    if (!validation.ok) errors.push({ index: item.index, type: item.type, ...validation });
    else {
      projectedGrid[item.index] = { type: item.type, level: 1 };
      totalCost = roundCredits(totalCost + FACILITIES[item.type].cost);
    }
  }
  const dependency = validateGridFacilityDependencies(projectedGrid);
  if (!dependency.ok) errors.push({ index: null, type: 'nuclear', ...dependency });
  return { ok: errors.length === 0 && state.constructionPlan.length > 0, items: stablePlan(state.constructionPlan), errors, totalCost, projectedCredits: roundCredits(state.credits - totalCost), projectedGrid };
}
```

The committed grid and each queued plan item must be counted exactly once.

- [ ] **Step 5: Implement atomic commit**

Reassess first. Only if `ok` is true: assign all cells, deduct total cost once, increment turn by item count, call `refreshMetrics()` once, clear the plan, and return placement payloads containing `index`, `key`, Korean `type`, `level: 1`, and final metrics.

- [ ] **Step 6: Run construction-plan and save tests**

Run: `npx playwright test tests/e2e/unit/construction-plan.spec.js tests/e2e/unit/state-v5.spec.js --workers=1 --retries=0`

Expected: PASS.

---

### Task 4: Multi-plan HUD and aggregate risk flow

**Files:**
- Modify: `index.html`
- Modify: `src/ui/GridView.js`
- Modify: `src/ui/DockView.js`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `tests/helpers/playthrough.js`
- Test: `tests/e2e/build-preview.spec.js`
- Test: `tests/e2e/hud.spec.js`
- Test: `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes: all `ConstructionPlanSystem` functions.
- Produces: `getConstructionForecast(assessment) -> { current, projected }`
- Emits: `BUILD_PLAN_CHANGED`, `BUILD_PLAN_COMMIT_REQUESTED`, `BUILD_PLAN_COMMITTED`.

- [ ] **Step 1: Replace single-candidate tests with failing mixed-plan tests**

```js
await openBuild(page);
await page.evaluate(() => window.__clickCell(0));
await page.locator('[data-facility="thermal"]').click();
await page.evaluate(() => window.__clickCell(1));
await expect(page.locator('#buildConfirmText')).toContainText('계획 2개');
await expect(page.locator('#buildPlanCost')).toContainText('7.00');
expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(0);
await page.locator('#confirmBuildBtn').click();
expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(2);
```

Add separate tests for replacement, same-type removal, panel-close clearing, cumulative insufficient credits, aggregate deficit warning, and mobile parity.

- [ ] **Step 2: Run build-preview tests and verify RED**

Run: `npx playwright test tests/e2e/build-preview.spec.js tests/e2e/mobile.spec.js --workers=1 --retries=0`

- [ ] **Step 3: Update confirmation markup**

Change labels to `계획 전체 취소` and a dynamic `N개 건설 확정`. Add `#buildPlanCost`, `#buildPlanBalance`, and `#buildPlanError` inside the existing confirmation bar. Keep the four aggregate forecast metrics.

- [ ] **Step 4: Refactor GridView from candidateIndex to constructionPlan**

Blank-cell clicks call `upsertPlannedFacility()`. Planned cells remain visually selectable. `buildCellConfigs()` adds `plannedType`, `plannedInvalid`, and permit-aware `placementAllowed`. Closing the build panel calls `clearConstructionPlan()` and hides all planning UI.

- [ ] **Step 5: Aggregate forecasting and commit in main orchestrator**

Replace `constructionForecastAt(index)` with a function accepting `assessment.projectedGrid`. On commit request, reassess, calculate aggregate risk, show one risk modal if required, then call `commitConstructionPlan()`. Emit `BOARD_PLACED` once per returned placement and refresh the full UI once after the loop.

- [ ] **Step 6: Update DockView with real + planned counts**

Use `getFacilityPermit()` for disabled state and `.facility-limit` copy. Re-render the dock on `BUILD_PLAN_CHANGED` and after commit/clear.

- [ ] **Step 7: Update shared playthrough helper**

`clickCell()` only queues a plan. Add `confirmConstructionPlan(page)` and make `buildStarterCity()` queue the requested group then confirm, accepting the aggregate risk modal once if present.

- [ ] **Step 8: Run build, HUD, quest, and mobile suites**

Run: `npx playwright test tests/e2e/build-preview.spec.js tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/game.spec.js tests/e2e/quest-ui.spec.js --workers=1 --retries=0`

Expected: PASS.

---

### Task 5: Instanced mixed-facility plan ghosts

**Files:**
- Modify: `src/ui/CityScene3D.js`
- Modify: `src/ui/GridView.js`
- Test: `tests/e2e/build-preview.spec.js`
- Test: `tests/e2e/perf.spec.js`

**Interfaces:**
- Extends: `setBuildPreviewMode({ enabled, type, plannedItems, invalidIndices })`
- Exposes in stats: `planGhostCount`, `planGhostTypes`, `planGhostLayerCount`

- [ ] **Step 1: Write failing ghost and GPU-reuse tests**

```js
expect(await page.evaluate(() => window.__getCityRendererStats())).toMatchObject({
  planGhostCount: 3,
  planGhostTypes: ['factory', 'residential', 'thermal'],
});

expect(after.resourceRevision).toBe(before.resourceRevision);
expect(after.geometryCount).toBe(before.geometryCount);
expect(window.__GPU_BUFFER_COUNTS__).toEqual({ created: 0, deleted: 0 });
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx playwright test tests/e2e/build-preview.spec.js tests/e2e/perf.spec.js --grep "plan|preview" --workers=1 --retries=0`

- [ ] **Step 3: Preallocate one plan ghost InstancedMesh per facility type**

Create all layers in `createSceneLayers()`, reuse facility placeholder geometry, and prewarm them. Use one shared transparent material clone per layer so loaded asset geometry can replace placeholders without rebuilding meshes.

- [ ] **Step 4: Update plan instances and keep hover ghost separate**

Group `plannedItems` by type, write matrices with existing facility scale/orientation, finish each layer count, and keep the single hover ghost visible only on an unplanned empty tile. Invalid plan indices receive problem rings from GridView config.

- [ ] **Step 5: Refresh geometry after asset load and dispose correctly**

Assign `getFacilityGeometry(type)` to each matching plan layer in `refreshLoadedAssets()`. Include layers in prewarm, stats, and final null/reset cleanup without creating or deleting buffers during planning.

- [ ] **Step 6: Run plan visual and performance tests**

Run: `npx playwright test tests/e2e/build-preview.spec.js tests/e2e/perf.spec.js --workers=1 --retries=0`

Expected: mixed plan ghosts are visible, settled draw calls remain within 24, buffer create/delete stays 0/0.

---

### Task 6: Whole-panel quest dragging and internal controls

**Files:**
- Modify: `index.html`
- Modify: `src/core/Constants.js`
- Modify: `src/ui/QuestPanelController.js`
- Modify: `src/style.css`
- Modify: `src/ui/Modal.js`
- Test: `tests/e2e/hud.spec.js`
- Test: `tests/e2e/mobile.spec.js`

**Interfaces:**
- Changes storage key to `ai-city-quest-panel-layout-v2`.
- `initQuestPanelController({ panel, dragSurface, pinButton, topSafeElement, rightSafeElement })`.

- [ ] **Step 1: Write failing legacy-position, whole-panel drag, and internal-button tests**

```js
await page.addInitScript(() => localStorage.setItem('ai-city-quest-panel-layout', JSON.stringify({ pinned: true, x: -900, y: -900 })));
await openQuestPanel(page);
const initial = await panel.boundingBox();
expect(initial.x).toBeGreaterThan(700);
expect(initial.y).toBeGreaterThan(60);

await dragFromTo(page, panel, { x: 40, y: 20 }, { x: -140, y: 100 });
expect(distance(before, await panel.boundingBox())).toBeGreaterThan(80);
await pin.click();
await expect(panel).toHaveClass(/quest-panel-pinned/);
```

Assert pin and close bounding boxes are fully contained by the panel and clicking either does not initiate drag.

- [ ] **Step 2: Run HUD/mobile tests and verify RED**

Run: `npx playwright test tests/e2e/hud.spec.js tests/e2e/mobile.spec.js --workers=1 --retries=0`

- [ ] **Step 3: Move tools into the quest header and remove drag icon**

Make `.quest-panel-header` a two-column grid containing the summary and `.quest-panel-tools`. Keep only pin and close. Register no grip icon.

- [ ] **Step 4: Refactor the controller to drag from panel surface**

Ignore interactive descendants, check primary button, compute safe bounds from top HUD bottom and rail left, and apply `quest-panel-dragging` to disable selection. Bind arrow keys to a focusable header surface.

- [ ] **Step 5: Migrate layout by using the v2 key and safe defaults**

Do not read the old key. If no valid v2 coordinates exist, leave CSS right anchoring and set top from the safe-area constant. Clamp persisted coordinates on open and resize.

- [ ] **Step 6: Verify desktop and mobile quest layouts**

Run: `npx playwright test tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/visual.spec.js --grep "quest|HUD" --workers=1 --retries=0`

Expected: desktop whole-panel drag works; mobile remains a bottom sheet with no pin.

---

### Task 7: Bounded ambient-motion scheduler

**Files:**
- Modify: `src/core/Constants.js`
- Create: `src/systems/CityAmbientMotionSystem.js`
- Test: `tests/e2e/unit/ambient-motion.spec.js`

**Interfaces:**
- Produces: `nextAmbientDelay(random) -> 4000..9000`
- Produces: `createAmbientMotionController(options)` with `start`, `pause`, `resume`, `complete`, `dispose`, `getState`.
- Emits through callbacks: `{ id, type, cellIndex, durationMs }` with max 3 active effects.

- [ ] **Step 1: Write failing scheduler tests**

```js
expect(nextAmbientDelay(() => 0)).toBe(4000);
expect(nextAmbientDelay(() => 1)).toBe(9000);

controller.start();
fireScheduledTimer();
expect(starts.length).toBeLessThanOrEqual(3);
expect(new Set(starts.map((effect) => effect.cellIndex)).size).toBe(starts.length);
controller.pause('hidden');
expect(controller.getState()).toMatchObject({ paused: true, scheduled: false });
```

- [ ] **Step 2: Run scheduler test and verify RED**

Run: `npx playwright test tests/e2e/unit/ambient-motion.spec.js --workers=1 --retries=0`

- [ ] **Step 3: Add exact motion constants**

```js
export const CITY_AMBIENT_MOTION = Object.freeze({
  MIN_DELAY_MS: 4000,
  MAX_DELAY_MS: 9000,
  FRAME_INTERVAL_MS: 100,
  MAX_ACTIVE_EFFECTS: 3,
  MIN_DURATION_MS: 600,
  MAX_DURATION_MS: 1600,
  MAX_SMOKE_INSTANCES: 6,
  MAX_STATUS_LIGHTS: BOARD.EXPANDED_CELLS * 2,
});
```

- [ ] **Step 4: Implement injectable deterministic scheduling**

Follow the existing bird controller shape. Select at most three unique candidates, skip green because birds own that ambient, cancel timers on pause/dispose, and schedule again after the current batch completes.

- [ ] **Step 5: Run scheduler tests**

Run: `npx playwright test tests/e2e/unit/ambient-motion.spec.js tests/e2e/unit/ambient-birds.spec.js --workers=1 --retries=0`

Expected: PASS with bird scheduling unchanged.

---

### Task 8: Shared Three.js facility effects

**Files:**
- Modify: `src/ui/CityScene3D.js`
- Test: `tests/e2e/motion.spec.js`
- Test: `tests/e2e/perf.spec.js`
- Test: `tests/e2e/day-night-scene.spec.js`

**Interfaces:**
- Consumes: `createAmbientMotionController`.
- Adds test hooks: `__triggerFacilityAmbientForTest(type, index)` and `__finishFacilityAmbientForTest()`.
- Adds stats: `ambientEffectCount`, `ambientEffectKinds`, `smokeEffectCount`, `statusLightCount`, `ambientFrameIntervalMs`.

- [ ] **Step 1: Write failing per-category visual and bounded-frame tests**

```js
await page.evaluate(() => window.__triggerFacilityAmbientForTest('factory', 0));
await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().smokeEffectCount)).toBeGreaterThan(0);
await page.evaluate(() => window.__finishFacilityAmbientForTest());
expect(await page.evaluate(() => window.__getCityRendererStats().ambientEffectCount)).toBe(0);

const before = await page.evaluate(() => window.__getCityRendererStats().renderCount);
await page.waitForTimeout(1000);
const after = await page.evaluate(() => window.__getCityRendererStats().renderCount);
expect(after - before).toBeLessThanOrEqual(12);
```

Cover smoke/steam, status light/glint/pump, rotor, car, tidal bob, and existing bird ownership for green.

- [ ] **Step 2: Run motion/performance tests and verify RED**

Run: `npx playwright test tests/e2e/motion.spec.js tests/e2e/perf.spec.js --grep "ambient|facility" --workers=1 --retries=0`

- [ ] **Step 3: Preallocate shared smoke and status-light layers**

Create low-segment sphere smoke geometry and box/octahedron status-light geometry once in `createSceneLayers()`. Add both meshes to prewarm and keep count 0 while idle.

- [ ] **Step 4: Map facility types to subtle effects**

Use `typeCellIndices` as candidates. Implement deterministic effect transforms for factory/thermal/nuclear smoke, data/battery/cooling/solar/tidal status layers, wind rotor rotation, and one residential car matrix. Green continues to use only the bird controller.

- [ ] **Step 5: Gate updates to 100ms and stop when idle**

In `renderFrame(now)`, update ambient effects only when `now - lastAmbientFrameAt >= FRAME_INTERVAL_MS`. Render those frames, finish expired effects, hide instances, then return to `needsRender=false` with no effect-driven draws.

- [ ] **Step 6: Pause for modal, hidden tab, and reduced motion**

Reuse modal/visibility listeners, add reduced-motion media-query handling, and dispose controller/listeners with the scene.

- [ ] **Step 7: Run motion, performance, and night-light suites**

Run: `npx playwright test tests/e2e/motion.spec.js tests/e2e/perf.spec.js tests/e2e/day-night-scene.spec.js --workers=1 --retries=0`

Expected: all facility categories have a bounded effect, idle city stays non-continuous, GPU buffers are reused.

---

### Task 9: Full integration, visual audit, and progress record

**Files:**
- Modify: `tests/e2e/visual.spec.js` only if new stable screenshots need explicit states
- Modify: `progress.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces final evidence only; no source feature should first appear here.

- [ ] **Step 1: Run every focused suite together without retries**

Run:

```bash
npx playwright test \
  tests/e2e/unit/money.spec.js \
  tests/e2e/unit/facility-permits.spec.js \
  tests/e2e/unit/construction-plan.spec.js \
  tests/e2e/unit/ambient-motion.spec.js \
  tests/e2e/build-preview.spec.js \
  tests/e2e/hud.spec.js \
  tests/e2e/mobile.spec.js \
  tests/e2e/motion.spec.js \
  tests/e2e/perf.spec.js \
  --workers=1 --retries=0 --reporter=line
```

Expected: zero failures.

- [ ] **Step 2: Capture and inspect six required visual states**

- default desktop quest panel below top HUD with internal controls
- dragged and pinned quest panel beside build UI
- 1.25M credits and 12.5K resources without overlap
- three mixed translucent planned facilities and aggregate confirmation bar
- a facility card at its current quest cap
- factory smoke plus a night status-light effect

Inspect full-size images and fix clipping, overlap, unreadable contrast, excessive motion, or misplaced effects before proceeding.

- [ ] **Step 3: Run the complete Playwright suite**

Run: `npm test -- --workers=2 --retries=0 --reporter=line`

Expected: all tests pass with zero retries.

- [ ] **Step 4: Run production and static verification**

Run each command independently:

```bash
npm run build
npm run audit:assets
npm audit --audit-level=high
git diff --check
```

Expected: build and audits exit 0, no high-severity vulnerabilities, no whitespace errors. The existing Three.js bundle-size warning may remain.

- [ ] **Step 5: Update progress.md**

Record the approved facility-limit table, transient batch construction semantics, quest-panel v2 layout migration, compact K/M formatting, exact ambient cadence, focused/full test counts, build sizes, asset audit, security audit, and the fact that no git or remote action was performed.

- [ ] **Step 6: Final safety check**

Run: `git status --short`

Confirm only intended local files are changed. Do not stage, commit, push, deploy, create a PR, or alter history.
