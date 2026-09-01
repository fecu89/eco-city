# Construction and Upgrade Time System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace immediate construction and upgrades with concurrent Game Clock projects, trustworthy operational forecasting, cancellable progress, persistent state, and a low-cost hybrid 3D/DOM progress presentation.

**Architecture:** Add one project-domain module as the source of truth for durations, project validation, operation profiles, progress, completion, and cancellation. Existing power, economy, workforce, research, modifier, quest, and render systems consume that shared profile rather than inventing project rules. The hourly settler advances/completes projects before event and operational settlement; prediction deep-clones a save-shaped state and runs the same settler without EventBus, persistence, audio, or real-state mutation.

**Tech Stack:** JavaScript ES modules, Three.js 0.185.1, DOM/CSS HUD, Vite 8, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-01-construction-upgrade-time-system-design.md`

## Global Constraints

- All construction and upgrade progress uses the existing Game Clock: paused = 0h, 1× = 1 real second per game hour, 2× = 0.5s, 4× = 0.25s.
- New construction uses fixed durations: green 3h, residential 5h, solar 6h, factory/wind/cooling 8h, data/battery 10h, thermal 12h, tidal 15h, nuclear 18h.
- Upgrades use 8h at 70% existing performance for Lv.1→2 and 15h at 50% for Lv.2→3, with residential/data/battery special profiles from the spec.
- New construction has zero operation, upkeep, workforce, adjacency, health, and overcrowding effects until completion; tile and permit are occupied immediately.
- Completion occurs before the same hour's event, power, economy, research, quest, and risk settlement.
- Cancellation refunds actual `paidCost` at 80%/65%/50% using integer boundary comparisons.
- Prediction and live execution share the same hourly calculation path; prediction has no external side effects.
- Save version becomes v7; v6 facilities migrate as complete with `project: null`; no offline progress.
- Project visuals may not create a continuous WebGL render loop and must preserve the representative 24-draw-call budget.
- Do not add, commit, push, branch, create a worktree, or otherwise write Git state in this repository.

---

### Task 1: Project domain and construction constants

**Files:**
- Modify: `src/core/Constants.js`
- Create: `src/systems/ConstructionProjectSystem.js`
- Create: `tests/e2e/unit/construction-projects.spec.js`

**Interfaces:**
- Produces: `constructionDurationHours(type)`, `upgradeDurationHours(fromLevel)`, `createBuildProject({ type, paidCost })`, `createUpgradeProject({ cell, paidCost })`, `projectProgress(project)`, `projectStage(project)`, `projectRefund(project)`, `operationProfileForCell(cell)`, `advanceConstructionProjects(state)`, `cancelConstructionProject(state, index)`.
- `advanceConstructionProjects(state)` returns `{ advanced, completed, stageChanged }` and never emits events or saves.

- [ ] **Step 1: Write failing lifecycle and boundary tests**

```js
test('fixed build durations and upgrade durations are authoritative', () => {
  expect(constructionDurationHours('green')).toBe(3);
  expect(constructionDurationHours('nuclear')).toBe(18);
  expect(upgradeDurationHours(1)).toBe(8);
  expect(upgradeDurationHours(2)).toBe(15);
});

test('refund boundaries use paid cost and exact integer comparisons', () => {
  expect(projectRefund({ elapsedHours: 1, durationHours: 5, paidCost: 10 })).toBe(8);
  expect(projectRefund({ elapsedHours: 2, durationHours: 8, paidCost: 10 })).toBe(6.5);
  expect(projectRefund({ elapsedHours: 6, durationHours: 8, paidCost: 10 })).toBe(5);
});

test('completion is returned once and clears the project', () => {
  const state = new GameState();
  state.grid[0] = { type: 'factory', level: 1, project: createBuildProject({ type: 'factory', paidCost: 3 }) };
  state.grid[0].project.elapsedHours = 7;
  const result = advanceConstructionProjects(state);
  expect(result.completed).toEqual([expect.objectContaining({ index: 0, kind: 'build' })]);
  expect(state.grid[0].project).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and verify missing exports fail**

Run: `npx playwright test tests/e2e/unit/construction-projects.spec.js`

Expected: FAIL because `ConstructionProjectSystem.js` does not exist.

- [ ] **Step 3: Add constants and implement the pure project lifecycle**

```js
export const CONSTRUCTION = Object.freeze({
  BUILD_HOURS: Object.freeze({ green: 3, residential: 5, solar: 6, factory: 8, wind: 8, cooling: 8, data: 10, battery: 10, thermal: 12, tidal: 15, nuclear: 18 }),
  UPGRADE_HOURS: Object.freeze({ 1: 8, 2: 15 }),
  UPGRADE_RATIOS: Object.freeze({ 1: 0.7, 2: 0.5 }),
  REFUND_RATIOS: Object.freeze({ EARLY: 0.8, MID: 0.65, LATE: 0.5 }),
});
```

Implement strict project normalization, integer refund boundaries, build/upgrade completion, stage transitions at 30% and 70%, mode restoration, build-site removal, and credit refunds through `roundCredits`.

- [ ] **Step 4: Run the project tests**

Run: `npx playwright test tests/e2e/unit/construction-projects.spec.js`

Expected: PASS.

- [ ] **Step 5: Run nonGit verification checkpoint**

Run: `git diff --check && npx playwright test tests/e2e/unit/money.spec.js`

Expected: no whitespace errors and money tests PASS. Do not stage or commit.

### Task 2: Operational profiles for build and upgrade projects

**Files:**
- Modify: `src/systems/ConstructionProjectSystem.js`
- Modify: `src/systems/CityModifierSystem.js`
- Modify: `src/systems/WorkforceSystem.js`
- Modify: `src/systems/PowerNetworkSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Modify: `src/systems/FacilityOperationSystem.js`
- Modify: `src/systems/ResearchSystem.js`
- Create: `tests/e2e/unit/construction-operations.spec.js`

**Interfaces:**
- Consumes: `operationProfileForCell(cell)` from Task 1.
- Produces: `operationalGrid(state.grid)` for adjacency/count rules and field multipliers for `effectiveFacilityStats`.

- [ ] **Step 1: Write failing operation-profile tests**

Cover new-build zero stats/upkeep/workforce/overcrowding/health, general upgrade ratios with 100% upkeep/workforce, residential 80%, data 70% demand/50% research/60% income, battery stored energy and 50% throughput, and a generator's reduced supply.

```js
expect(effectiveFacilityStats(buildingFactory)).toMatchObject({ supply: 0, demand: 0, income: 0, upkeep: 0, carbon: 0, water: 0, workforce: 0 });
expect(effectiveFacilityStats(upgradingThermal)).toMatchObject({ supply: 7, upkeep: 0.5, workforce: 2 });
expect(calculateWorkforce([upgradingHome])).toMatchObject({ capacity: 8 });
```

- [ ] **Step 2: Verify failures in the focused tests**

Run: `npx playwright test tests/e2e/unit/construction-operations.spec.js`

Expected: FAIL because current systems treat project cells as complete facilities.

- [ ] **Step 3: Apply the shared project profile at system boundaries**

`effectiveFacilityStats` applies project field multipliers after existing level/modifier calculation, except fixed upkeep/workforce. `calculateWorkforce` uses the profile. Power skips build sites, applies generation/demand ratios, and halves upgrading battery throughput while retaining existing capacity/storage. Economy and environmental adjacency use `operationalGrid` so build sites do not count toward overcrowding, pollution pairs, health, green/cooling, or hub effects. Research ignores build-site data centers and multiplies active upgrading-data progress by 0.5.

- [ ] **Step 4: Run operation, power, economy, workforce, and research suites**

Run: `npx playwright test tests/e2e/unit/construction-operations.spec.js tests/e2e/unit/power-network.spec.js tests/e2e/unit/economy.spec.js tests/e2e/unit/workforce.spec.js tests/e2e/unit/research.spec.js`

Expected: PASS.

- [ ] **Step 5: Run nonGit verification checkpoint**

Run: `git diff --check`

Expected: no whitespace errors. Do not stage or commit.

### Task 3: Atomic batch starts and timed upgrades

**Files:**
- Modify: `src/systems/ConstructionPlanSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/core/EventBus.js`
- Modify: `tests/e2e/unit/construction-plan.spec.js`
- Modify: `tests/e2e/unit/facility-tech.spec.js`

**Interfaces:**
- Consumes: project factories and cancellation rules from Task 1.
- Produces: `commitConstructionPlan(state)` that writes build projects, `startUpgrade(state, index)` that writes an upgrade project, project-aware validation, and project transition EventBus constants.

- [ ] **Step 1: Change tests to require project creation instead of immediate operation**

```js
const result = commitConstructionPlan(state);
expect(state.grid[0]).toMatchObject({ type: 'residential', level: 1, project: { kind: 'build', elapsedHours: 0, durationHours: 5, paidCost: 2 } });
expect(result.projects).toHaveLength(2);

const upgrade = startUpgrade(state, 0);
expect(state.grid[0]).toMatchObject({ level: 1, project: { kind: 'upgrade', fromLevel: 1, toLevel: 2, durationHours: 8 } });
```

Add cases for existing in-progress projects plus a new plan, permit occupation, final-state workforce/dependency validation, insufficient credits atomically preserving state, and rejecting demolition/re-upgrade of a project cell.

- [ ] **Step 2: Run focused tests and verify current immediate behavior fails**

Run: `npx playwright test tests/e2e/unit/construction-plan.spec.js tests/e2e/unit/facility-tech.spec.js`

Expected: FAIL because commits/upgrades currently activate immediately.

- [ ] **Step 3: Implement atomic project starts and project-aware validation**

Preserve `projectedGrid` as the final complete city used for validation, but write independent `project` objects into the live grid. Return `projects` rather than completion events. Rename `upgradeCell` behavior to `startUpgrade`, retaining an exported compatibility wrapper only if existing callers/tests need it during migration. Block normal demolition for any project cell.

- [ ] **Step 4: Run focused tests**

Run: `npx playwright test tests/e2e/unit/construction-plan.spec.js tests/e2e/unit/facility-tech.spec.js tests/e2e/unit/facility-permits.spec.js`

Expected: PASS.

- [ ] **Step 5: Run nonGit verification checkpoint**

Run: `git diff --check`

Expected: no whitespace errors. Do not stage or commit.

### Task 4: Tick ordering and completion transitions

**Files:**
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/main.js`
- Modify: `tests/e2e/unit/simulation.spec.js`
- Create: `tests/e2e/unit/construction-simulation.spec.js`

**Interfaces:**
- Consumes: `advanceConstructionProjects(state)` and project transition event constants.
- Produces: a settlement result with `construction: { advanced, completed, stageChanged }`; main emits actual UI/audio/save events only after the pure settlement returns.

- [ ] **Step 1: Write failing completion-order and pause/speed tests**

Create a 7/8h upgrade, run one settlement, and assert the target level's 100% stats are used that hour. Create an event starting at the same timestamp and assert both completion and event modifiers apply. Verify no project progress occurs while the simulation controller is paused and 1×/2×/4× change wall-clock scheduling rather than game-hour increments.

- [ ] **Step 2: Run focused tests to observe incorrect ordering**

Run: `npx playwright test tests/e2e/unit/simulation.spec.js tests/e2e/unit/construction-simulation.spec.js`

Expected: FAIL because projects are not advanced before settlement.

- [ ] **Step 3: Advance and complete projects before event and operation calculation**

Move authoritative `elapsedGameHours` and `tickIndex` increment to the beginning of the hourly settlement, advance all projects, complete them, then refresh event state, modifiers, workforce, power, economy, research, quest, and risks. Include transition payloads in the result. Main maps completion to `BOARD_PLACED`/`BOARD_UPGRADED`, stage changes to render refresh, one batched `SAVE_REQUESTED`, and completion-only audio/toasts.

- [ ] **Step 4: Run simulation and campaign suites**

Run: `npx playwright test tests/e2e/unit/simulation.spec.js tests/e2e/unit/construction-simulation.spec.js tests/e2e/unit/campaign-playthrough.spec.js tests/e2e/unit/quest.spec.js tests/e2e/unit/objectives.spec.js`

Expected: PASS after campaign helpers explicitly advance construction projects where they previously assumed instant completion.

- [ ] **Step 5: Run nonGit verification checkpoint**

Run: `git diff --check`

Expected: no whitespace errors. Do not stage or commit.

### Task 5: Save v7 and project recovery

**Files:**
- Modify: `src/core/GameState.js`
- Modify: `src/systems/SaveSystem.js`
- Create: `tests/e2e/unit/state-v7.spec.js`

**Interfaces:**
- Consumes: `normalizeConstructionProject(cell, rawProject)` from Task 1.
- Produces: save v7 serialization/hydration and `migrateV6ToV7(data)`.

- [ ] **Step 1: Write failing migration, round-trip, and corruption tests**

Test v6→v7 adds no projects, build/upgrade projects round-trip with paid cost/mode/storage/research, malformed build projects clear only the site, malformed upgrade projects keep `fromLevel` and restore the mode, and no real timestamp is serialized.

- [ ] **Step 2: Run the state test and verify SAVE_VERSION 6 fails**

Run: `npx playwright test tests/e2e/unit/state-v7.spec.js`

Expected: FAIL with the current v6 save contract.

- [ ] **Step 3: Implement migration and strict project normalization**

Set `SAVE_VERSION = 7`, add `migrateV6ToV7`, extend the migration chain, validate integer elapsed/duration and finite nonnegative paid cost, preserve battery storage and research, and never synthesize project state for v6 cities.

- [ ] **Step 4: Run every state migration suite**

Run: `npx playwright test tests/e2e/unit/state-v2.spec.js tests/e2e/unit/state-v3.spec.js tests/e2e/unit/state-v4.spec.js tests/e2e/unit/state-v5.spec.js tests/e2e/unit/state-v6.spec.js tests/e2e/unit/state-v7.spec.js`

Expected: PASS with older test expectations updated to final v7 only where they assert the current version.

- [ ] **Step 5: Run nonGit verification checkpoint**

Run: `git diff --check`

Expected: no whitespace errors. Do not stage or commit.

### Task 6: Shared live/prediction settlement and construction timeline

**Files:**
- Create: `src/systems/SimulationForecastSystem.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/main.js`
- Modify: `src/ui/GridView.js`
- Modify: `src/ui/StageModals.js`
- Create: `tests/e2e/unit/construction-forecast.spec.js`

**Interfaces:**
- Produces: `cloneSimulationState(state)`, `forecastConstruction(state, plannedProjects)`, and timeline entries `{ hourOffset, completed, summary, warnings }`.
- Consumes: the exact same `settleHour` callback as live mode; cloned state only.

- [ ] **Step 1: Write failing prediction parity and no-side-effect tests**

```js
const before = state.serialize();
const prediction = forecastConstruction(state, plans, { settleHour });
expect(state.serialize()).toEqual(before);
expect(prediction.horizonHours).toBe(12);
expect(prediction.timeline.map(({ hourOffset }) => hourOffset)).toEqual([8, 12]);
```

Clone the same save twice, predict 12h on A and run live settlement 12 times on B without event emission, then compare credits, power, workforce, CO₂, water, batteries, research, project completion, and active event within numeric tolerance.

- [ ] **Step 2: Run focused tests and verify the old one-frame forecast fails**

Run: `npx playwright test tests/e2e/unit/construction-forecast.spec.js`

Expected: FAIL because only final static-grid forecasting exists.

- [ ] **Step 3: Implement save-shaped cloning and dynamic-horizon forecasting**

Insert planned cells as virtual elapsed-0 projects on the clone, calculate `Math.max(0, ...remainingHours)`, settle each hour through the shared callback, record only completion timestamps plus the worst interval, collect power/credit/workforce/battery/event warnings, and discard the clone. Do not emit EventBus events, save, play audio, show UI, or alter real quest/reward state.

- [ ] **Step 4: Replace construction and upgrade confirmations with timeline data**

Grid confirmation shows final and worst interval on mobile with an expandable full timeline. Upgrade confirmation compares current/construction/completed states and warns if an event starts before completion. Labels explicitly state that current modes and forecasts are assumed constant except deterministic simulation transitions.

- [ ] **Step 5: Run forecast and relevant UI tests**

Run: `npx playwright test tests/e2e/unit/construction-forecast.spec.js tests/e2e/build-preview.spec.js tests/e2e/event-forecast.spec.js`

Expected: PASS.

### Task 7: Construction inspector, cancellation, and upgrade interaction

**Files:**
- Modify: `src/ui/StageModals.js`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Create: `tests/e2e/construction-progress.spec.js`

**Interfaces:**
- Consumes: `cancelConstructionProject`, project progress/stage/refund helpers, and forecast data.
- Produces: build-site inspector, upgrading-facility inspector, centered cancellation confirmation, and locked operation-mode controls.

- [ ] **Step 1: Write failing desktop/mobile interaction tests**

Test batch confirmation starts sites without completing them, site selection shows remaining hours/refund/event risk, exact cancellation refunds and clears the tile, upgrading facilities show limited-operation copy and disabled mode controls, completion removes cancel UI, and 44px mobile actions remain visible.

- [ ] **Step 2: Run the E2E test and confirm current inspector behavior fails**

Run: `npx playwright test tests/e2e/construction-progress.spec.js`

Expected: FAIL because project inspectors do not exist and construction is immediate.

- [ ] **Step 3: Implement project-aware inspector and cancellation flow**

Render build fields `공사 단계`, `elapsed / duration`, remaining game hours, refund rate/value, completion date, and event warning. Render upgrade fields inside the current console, disable its mode buttons, keep priority/battery controls, hide normal demolition, and require a centered irreversible cancellation confirmation before changing state.

- [ ] **Step 4: Run E2E, demolition, mobile, and modal tests**

Run: `npx playwright test tests/e2e/construction-progress.spec.js tests/e2e/demolition-warning.spec.js tests/e2e/mobile.spec.js tests/e2e/nonpausing-panels.spec.js`

Expected: PASS.

- [ ] **Step 5: Run nonGit verification checkpoint**

Run: `git diff --check`

Expected: no whitespace errors. Do not stage or commit.

### Task 8: Hybrid 3D stages and pooled DOM world progress

**Files:**
- Modify: `src/ui/CityScene3D.js`
- Modify: `src/ui/GridView.js`
- Create: `src/ui/ConstructionProgressView.js`
- Modify: `src/style.css`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/visual.spec.js`

**Interfaces:**
- Consumes: project fields in cell configs and Task 1 stage/progress helpers.
- Produces: foundation/skeleton/near-complete construction meshes, orange upgrade scaffold, compact marker pool, and at most two DOM progress bars.

- [ ] **Step 1: Add failing renderer-state and DOM-cap tests**

Assert build configs expose project kind/stage/progress, world HUD contains no more than two `[data-construction-world-progress]` elements, build and upgrade labels are textually distinct, and a tick that remains in the same stage does not increase geometry/buffer allocation counters.

- [ ] **Step 2: Run focused visual/performance tests to verify failure**

Run: `npx playwright test tests/e2e/construction-progress.spec.js tests/e2e/perf.spec.js --grep "construction|draw|buffer"`

Expected: FAIL because project visuals and progress pooling are absent.

- [ ] **Step 3: Implement dirty, stage-based construction visuals**

Reuse simple cached geometry/material for foundation, skeleton/scaffold, and translucent shell. Keep the existing model under orange scaffold for upgrades. Rebuild only on start, stage change, cancel, completion, selection, hover, or camera movement; do not add a project animation frame loop.

- [ ] **Step 4: Implement accessible pooled DOM progress bars**

Show selected, desktop-hovered, then earliest project, capped at two. Add `role="progressbar"`, `aria-valuenow/min/max`, build/upgrade text and icons, 44px mobile target, reduced-motion rules, and a short CSS transition on hourly value changes.

- [ ] **Step 5: Run visual, camera, scene, and performance tests**

Run: `npx playwright test tests/e2e/construction-progress.spec.js tests/e2e/hex-scene.spec.js tests/e2e/camera.spec.js tests/e2e/perf.spec.js`

Expected: PASS with representative draw calls at or below 24 and buffer reuse intact.

### Task 9: Full regression, browser verification, and handoff

**Files:**
- Modify: `progress.md`
- Modify: `docs/superpowers/plans/2026-09-01-construction-upgrade-time-system.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified production build, full regression evidence, manual runtime evidence, and continuity notes.

- [ ] **Step 1: Run all unit-level project and campaign suites**

Run: `npx playwright test tests/e2e/unit`

Expected: all tests PASS.

- [ ] **Step 2: Run production build and asset audit**

Run: `npm run build && npm run assets:audit`

Expected: Vite build succeeds and asset audit reports no missing runtime files.

- [ ] **Step 3: Run the full Playwright suite**

Run: `npm test`

Expected: all tests PASS; if visual baselines intentionally changed, inspect actual screenshots before updating only affected baselines.

- [ ] **Step 4: Perform manual browser runtime review**

Verify a paused batch remains at 0h; 1×/4× advance consistently; residential/factory/thermal complete at their independent times; upgrade reductions are visible; cancellation boundaries and save/reload work; mobile progress remains readable; browser console has no uncaught errors.

- [ ] **Step 5: Record completion evidence without Git writes**

Append the implemented rules, tests run, asset/draw-call measurements, known limitations, and the explicit `no Git writes performed` note to `progress.md`. Mark plan checkboxes complete. Run `git diff --check` and read-only `git status --short`; do not stage, commit, push, branch, or deploy.
