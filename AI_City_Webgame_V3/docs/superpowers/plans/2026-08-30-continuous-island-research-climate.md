# Continuous Island Research Climate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this plan.

**Goal:** Make the 2040 hex city run at one game hour per second with a continuous visual clock, surround the maximum city with an instanced island and ocean, support one independent research job per data center, and add clear quest, permit, credit, texture, and carbon-failure behavior.

**Architecture:** Keep simulation outcomes deterministic at integer-hour settlements while deriving fractional display time from the timer controller's interval progress. Migrate research from one global active job to a research-ID job map, keep Three.js event-rendered, and add island layers as cached InstancedMeshes. Put money precision and carbon-crisis rules behind small pure helpers so state migration and Playwright tests can exercise them without booting WebGL.

**Tech Stack:** JavaScript ES modules, Three.js 0.185.1, Vite 8.2.2, Playwright 1.62.1, HTML/CSS, localStorage save migration.

**Spec:** `docs/superpowers/specs/2026-08-30-continuous-island-research-climate-design.md`

## Global Constraints

- The maximum playable grid remains pointy-top hex radius 3 with 37 cells.
- At 1× speed one real second advances exactly one game hour; 2× uses 500ms and 4× uses 250ms.
- Economic, power, research, quest, and carbon outcomes settle only on integer game hours.
- Sun and moon remain DOM/CSS elements; do not create celestial Three.js meshes.
- Do not add a continuously rendered 60FPS WebGL loop for the clock or ocean.
- Terrain GLB failures must fall back to procedural hex geometry without blocking gameplay.
- Only CC0 assets already present in the registry may be used.
- Credits are stored to two decimal places and the balance is displayed with exactly two decimals.
- Hourly carbon above 8 accumulates crisis time after quest 5; 168 crisis hours causes game over.
- Preserve current user work in the dirty worktree.
- Do not run `git add`, `git commit`, `git push`, deployment commands, remote mutations, or destructive history/worktree commands.
- Every task ends with a local test checkpoint instead of a Git commit.

## File Structure

### Create

- `src/core/Money.js` — two-decimal credit normalization and display helpers.
- `src/systems/CarbonCrisisSystem.js` — pure carbon-crisis transition and warning calculation.
- `src/ui/ContinuousClockView.js` — fractional HUD clock and DOM sun/moon animation loop.
- `tests/e2e/unit/money.spec.js` — money precision contract.
- `tests/e2e/unit/carbon-crisis.spec.js` — carbon accumulation, recovery, warning, and game-over contract.
- `tests/e2e/continuous-clock.spec.js` — visible fractional clock, pause, and removed sweep bar.
- `tests/e2e/island-scene.spec.js` — island/ocean instance and expansion invariants.
- `tests/e2e/carbon-game-over.spec.js` — browser game-over modal and paused controller.

### Modify

- `src/core/Constants.js` — 1000ms hour, research balance, carbon limits, island dimensions.
- `src/core/GameState.js` — save v5 state, research jobs, scanner state, carbon crisis, game over.
- `src/core/EventBus.js` — clock/research acceleration/carbon warning/game-over events.
- `src/core/ResearchDefinitions.js` — approved durations and prices.
- `src/systems/CalendarSystem.js` — fractional hour snapshots with minutes.
- `src/systems/SimulationSystem.js` — preserved timer progress, research result collection, carbon evaluation.
- `src/systems/EconomySystem.js` — cent precision for credits and hourly totals.
- `src/systems/ResearchSystem.js` — parallel jobs, quiz acceleration, shared completion path.
- `src/systems/QuizSystem.js` — invoke acceleration on each correct answer.
- `src/systems/QuestSystem.js` — Lv.2 permit at quest 7 and cent-precision rewards.
- `src/systems/BoardSystem.js` — cent mutations and human-readable unlock requirements.
- `src/systems/SaveSystem.js` — v4→v5 migration and throttled simulation saves.
- `src/systems/DiagnosisSystem.js` — next unresolved risk helper.
- `src/ui/CityEnvironment3D.js` — fixed radius-3 island, shore, water rings, fallback layers.
- `src/ui/CityScene3D.js` — DOM celestial API, island stats, marker removal, palette filtering integration.
- `src/level/CityAssetLoader.js` — one-time Kenney palette texture sampling configuration.
- `src/ui/SimulationHudView.js` — carbon crisis status and non-clock settlement values.
- `src/ui/ResearchView.js` — center-specific concurrent research UI.
- `src/ui/QuestView.js` — diagnosis scanner action and corrected permit rewards.
- `src/ui/DiagnosisView.js` — scanner toggle behavior and next-risk highlight.
- `src/ui/GridView.js` — remove persistent facility link marks.
- `src/ui/DockView.js` — exact lock reasons and two-decimal missing credits.
- `src/ui/HudView.js` — fixed two-decimal balance.
- `src/ui/StageModals.js` — actionable upgrade requirement, game-over modal, updated help.
- `src/ui/OnboardingView.js` — sea-level-rise island story.
- `src/ui/format.js` — reuse money display helpers.
- `src/main.js` — clock lifecycle, event fan-out, game-over pause, remove settlement sweep.
- `src/style.css` — celestial orbs, sea/island UI, scanner controls, remove sweep/marker styles.
- `index.html` — remove settlement line and add diagnosis toggle host.
- Existing unit/e2e/visual/performance tests — update approved contracts and snapshots.
- `progress.md` — record completed behavior, measurements, and remaining issues.

---

### Task 1: Credit Precision and Save v5 Foundation

**Files:**
- Create: `src/core/Money.js`
- Create: `tests/e2e/unit/money.spec.js`
- Modify: `src/core/GameState.js`
- Modify: `src/systems/SaveSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/ui/format.js`
- Modify: `src/ui/HudView.js`
- Modify: `src/ui/DockView.js`
- Test: `tests/e2e/unit/economy.spec.js`
- Test: `tests/e2e/unit/state-v4.spec.js`
- Create: `tests/e2e/unit/state-v5.spec.js`

**Interfaces:**
- Produces: `roundCredits(value: number): number`, `formatCredits(value: number, { suffix?: boolean } = {}): string`.
- Produces: save version 5 fields consumed by later research and carbon tasks.
- Consumes: existing `normalizeCell`, v4 save shape, and facility/economy definitions.

- [ ] **Step 1: Write failing money and migration tests**

```js
import { test, expect } from '@playwright/test';
import { roundCredits, formatCredits } from '../../../src/core/Money.js';

test('credits round and display at exactly two decimals without negative zero', () => {
  expect(roundCredits(0.1 + 0.2)).toBe(0.3);
  expect(roundCredits(1.005)).toBe(1.01);
  expect(formatCredits(10)).toBe('10.00C');
  expect(formatCredits(-0.00001)).toBe('0.00C');
});
```

Add `state-v5.spec.js` with a v4 payload containing `credits: 1.005`, one `research.active` job, quest 8, and permit 1. Assert migration returns v5, `credits === 1.01`, `research.jobs.solar2` contains the old job, `upgradePermitLevel === 2`, and new carbon/game-over defaults exist.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- tests/e2e/unit/money.spec.js tests/e2e/unit/state-v5.spec.js --reporter=line --workers=1`

Expected: FAIL because `Money.js`, save v5, and `migrateV4ToV5` do not exist.

- [ ] **Step 3: Implement the money helpers and save shape**

```js
export function roundCredits(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) || Math.abs(rounded) < 0.005 ? 0 : rounded;
}

export function formatCredits(value, { suffix = true } = {}) {
  const text = roundCredits(value).toFixed(2);
  return suffix ? `${text}C` : text;
}
```

Set `SAVE_VERSION = 5`. Add default research fields `jobs: {}` and `quizAccelerationBankHours: 0`, plus `diagnosisScannerActive: true`, `carbonCrisisHours: 0`, `carbonWarningMilestones: new Set()`, `gameOver: false`, and `gameOverReason: null`. Serialize Sets as arrays and jobs as plain objects.

Implement `migrateV4ToV5(data)` so the old active job moves under its ID, quest 8–12 saves receive permit 2, invalid/missing values receive exact defaults, and credits are normalized through `roundCredits`.

- [ ] **Step 4: Replace every credit mutation and balance display**

Use `roundCredits` after economy settlement, building, upgrading, demolition, research payment/refund, quest reward, and emergency support. Change `settleEconomy.netCredits` and `nextCredits` from one-decimal rounding to two-decimal rounding. Use `formatCredits` in the top balance and missing-credit copy; keep integer construction prices readable where no fractional value exists.

- [ ] **Step 5: Run focused money, economy, state, HUD, and dock tests**

Run: `npm test -- tests/e2e/unit/money.spec.js tests/e2e/unit/economy.spec.js tests/e2e/unit/state-v4.spec.js tests/e2e/unit/state-v5.spec.js tests/e2e/hud.spec.js --reporter=line --workers=1`

Expected: PASS, with updated balance expectations such as `10.00C` and cent-precision economy totals.

- [ ] **Step 6: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src AI_City_Webgame_V3/tests/e2e/unit AI_City_Webgame_V3/tests/e2e/hud.spec.js`

Expected: no whitespace errors. Do not stage or commit.

### Task 2: Parallel Data-Center Research

**Files:**
- Modify: `src/core/ResearchDefinitions.js`
- Modify: `src/systems/ResearchSystem.js`
- Modify: `src/ui/ResearchView.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/main.js`
- Modify: `tests/e2e/unit/research.spec.js`
- Modify: `tests/e2e/research-ui.spec.js`

**Interfaces:**
- Consumes: `gameState.research.jobs`, `roundCredits`, and `Events.RESEARCH_*`.
- Produces: `activeResearchJobs(state): Array<Job>`, `startResearch(state, researchId, dataCenterIndex)`, `cancelResearch(state, researchId)`, `assignResearchDataCenter(state, researchId, index)`, `researchDemandByIndex(state): Record<number, number>`, `advanceResearchOneHour(state, facilityPower): { status, jobs, completed }`.

- [ ] **Step 1: Replace research unit tests with concurrent-job contracts**

```js
test('two data centers run different research jobs independently', () => {
  const state = stateWithDataCenter({ credits: 40, index: 3 });
  state.grid[5] = { type: 'data', level: 2, priority: 'normal' };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  expect(startResearch(state, 'solar2', 3).ok).toBe(true);
  expect(startResearch(state, 'wind2', 5).ok).toBe(true);
  expect(researchDemandByIndex(state)).toEqual({ 3: 2, 5: 2 });
  const result = advanceResearchOneHour(state, { 3: { ratio: 1 }, 5: { ratio: 1 } });
  expect(result.jobs.solar2.advancedHours).toBe(1);
  expect(result.jobs.wind2.advancedHours).toBe(1.25);
});
```

Add assertions that the same center returns `data_center_busy`, the same research returns `research_active`, underpower pauses only one job, removal unassigns only matching jobs, and cancel accepts a research ID.

- [ ] **Step 2: Run research unit tests and verify old global-active assumptions fail**

Run: `npm test -- tests/e2e/unit/research.spec.js --reporter=line --workers=1`

Expected: FAIL because the implementation still uses `research.active`.

- [ ] **Step 3: Implement the approved research definitions and job helpers**

Set durations/costs to `(7,10)`, `(7,10)`, `(10,15)`, `(10,18)`, `(14,24)`. Implement center occupancy and duplicate research checks by iterating `Object.values(state.research.jobs)`.

Use a single `completeResearchJob(state, researchId)` helper that adds the completed ID, applies the outcome exactly once, deletes the job, and returns `{ researchId, outcome }`. `advanceResearchOneHour` must return a completed array because multiple jobs may complete in the same settlement.

- [ ] **Step 4: Update main event fan-out and research UI**

For every item in `result.research.completed`, emit `RESEARCH_COMPLETED`. Emit one `RESEARCH_PROGRESS` payload containing all remaining jobs. The data-center inspector must show the job assigned to that center, label jobs running elsewhere, offer reassignment only for unassigned jobs, and call cancel/assign with an explicit research ID.

- [ ] **Step 5: Add the two-center browser test**

Create two data centers, unlock solar/wind, start `solar2` from center 0 and `wind2` from center 1, then assert both cards show their assigned center and closing/reopening either inspector preserves independent progress. Assert opening the inspector never pauses the simulation.

- [ ] **Step 6: Run research unit and browser tests**

Run: `npm test -- tests/e2e/unit/research.spec.js tests/e2e/research-ui.spec.js --reporter=line --workers=1`

Expected: PASS.

- [ ] **Step 7: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src/core/ResearchDefinitions.js AI_City_Webgame_V3/src/systems/ResearchSystem.js AI_City_Webgame_V3/src/ui/ResearchView.js AI_City_Webgame_V3/tests/e2e/unit/research.spec.js AI_City_Webgame_V3/tests/e2e/research-ui.spec.js`

Expected: no whitespace errors. Do not stage or commit.

### Task 3: Quiz Acceleration and Solvable Upgrade Sequence

**Files:**
- Modify: `src/core/EventBus.js`
- Modify: `src/systems/ResearchSystem.js`
- Modify: `src/systems/QuizSystem.js`
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/ui/QuestView.js`
- Modify: `src/ui/FeedbackBridge.js`
- Modify: `tests/e2e/unit/quest-quiz.spec.js`
- Modify: `tests/e2e/unit/facility-tech.spec.js`
- Modify: `tests/e2e/unit/quest.spec.js`
- Modify: `tests/e2e/quest-ui.spec.js`

**Interfaces:**
- Consumes: `completeResearchJob`, research job map, quest claim flow.
- Produces: `accelerateResearchFromQuiz(state, hours = 24): { appliedJobs, bankedHours, completed }` and event `RESEARCH_ACCELERATED`.

- [ ] **Step 1: Add failing acceleration and permit tests**

```js
test('each correct quiz answer advances every active research by 24 hours', () => {
  const state = twoJobState();
  const result = accelerateResearchFromQuiz(state, 24);
  expect(result.appliedJobs).toEqual(['solar2', 'wind2']);
  expect(state.research.jobs.solar2.elapsedEffectiveHours).toBe(24);
  expect(state.research.jobs.wind2.elapsedEffectiveHours).toBe(24);
});

test('quest 7 reward opens city level 2 permit before solar quest', () => {
  const state = readyStateAtQuest(7);
  claimCurrentQuest(state);
  expect(state.upgradePermitLevel).toBe(2);
});
```

Add a no-active-job assertion that 24 hours are banked, a start assertion that the bank applies once, and a near-complete job assertion that quiz acceleration completes research exactly once.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- tests/e2e/unit/quest-quiz.spec.js tests/e2e/unit/facility-tech.spec.js tests/e2e/unit/quest.spec.js --reporter=line --workers=1`

Expected: FAIL because acceleration is absent and permit 2 opens at quest 10.

- [ ] **Step 3: Implement acceleration and move the permit reward**

In `answerQuestQuiz`, call acceleration only after `correct === true`. Attach the acceleration result to `QUIZ_ANSWERED` so the UI can append `활성 연구 2개에서 각각 24시간 단축` or `연구 가속 24시간 적립` to the explanation. Emit completion events for jobs completed by the answer.

In `claimCurrentQuest`, set permit 2 when quest 7 is claimed, remove the quest 10 mutation, and retain permit 3 at quest 13. Update reward copy so quest 7 says `Lv.2 강화 허가` and quest 10 no longer claims it.

- [ ] **Step 4: Verify the original solar upgrade bug**

Create state at quest 8 with a completed `solar2` outcome, a level-1 solar facility, permit 2, and enough credits. Assert `validateUpgrade` returns `{ ok: true, nextLevel: 2 }`, then assert `upgradeCell` creates level 2 and `evaluateCurrentQuest` becomes ready when quiz is also passed.

- [ ] **Step 5: Run quiz, quest, facility-tech, and UI tests**

Run: `npm test -- tests/e2e/unit/quest-quiz.spec.js tests/e2e/unit/facility-tech.spec.js tests/e2e/unit/quest.spec.js tests/e2e/quest-ui.spec.js --reporter=line --workers=1`

Expected: PASS.

- [ ] **Step 6: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src/systems/QuizSystem.js AI_City_Webgame_V3/src/systems/QuestSystem.js AI_City_Webgame_V3/src/systems/ResearchSystem.js AI_City_Webgame_V3/tests/e2e/unit`

Expected: no whitespace errors. Do not stage or commit.

### Task 4: One-Second Settlement and Continuous Display Time

**Files:**
- Create: `src/ui/ContinuousClockView.js`
- Create: `tests/e2e/continuous-clock.spec.js`
- Modify: `src/core/Constants.js`
- Modify: `src/systems/CalendarSystem.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/ui/CityScene3D.js`
- Modify: `src/ui/SimulationHudView.js`
- Modify: `src/main.js`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `tests/e2e/unit/calendar.spec.js`
- Modify: `tests/e2e/unit/simulation.spec.js`
- Modify: `tests/e2e/day-night-scene.spec.js`

**Interfaces:**
- Consumes: `simulationController.getProgress()` and `gameState.elapsedGameHours`.
- Produces: `calendarAtElapsedHour(number)` with `minute`, `createContinuousClockView({ timeElement, getElapsedHours, getProgress, getPaused, onVisualHour })`, `setVisualWorldHour(hour: number)`.

- [ ] **Step 1: Write failing timer progress tests**

Use an injected fake clock. Start a 1000ms controller, advance fake time to 400ms, pause, and assert progress remains 0.4 while paused. Resume and assert the new timer delay is 600ms. Change from 1× to 2× at progress 0.4 and assert the new delay is 300ms. Assert default intervals are 1000/500/250ms.

- [ ] **Step 2: Write failing fractional calendar and browser clock tests**

```js
expect(calendarAtElapsedHour(0.5)).toMatchObject({ hour: 8, minute: 30 });
expect(formatCalendar(calendarAtElapsedHour(0.5))).toBe('2040-01-01 08:30');
```

The browser test must assert `#settlementProgress` and `.settlement-line` have count 0, the clock changes from `08:00` to a minute between `08:10` and `08:59` before the first settlement, and pause freezes both clock text and sun transform.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/e2e/unit/calendar.spec.js tests/e2e/unit/simulation.spec.js tests/e2e/continuous-clock.spec.js --reporter=line --workers=1`

Expected: FAIL on 5000ms constants, lost paused progress, missing minutes, and existing settlement line.

- [ ] **Step 4: Implement preserved interval progress**

Track `baseProgress`, `scheduledAt`, and `scheduledDelay`. `pause()` stores `getProgress(now())`, cancels the timer, and leaves progress frozen. `resume()` schedules `intervalForScale * (1 - baseProgress)`. `setTimeScale()` first captures progress with the old schedule, then schedules the remaining fraction at the new interval. A completed settlement resets `baseProgress = 0` before scheduling the next hour.

- [ ] **Step 5: Implement continuous clock and DOM celestial orbs**

`ContinuousClockView` uses one RAF, computes `elapsed + progress`, writes the time only if formatted text changed, and calls `setVisualWorldHour` with fractional hour. In `CityScene3D`, replace the one radial-gradient celestial background with `.city-sun-orb` and `.city-moon-orb`, updating only CSS transforms/opacity for position. Continue to update Three.js lights and building windows from integer settlement events.

- [ ] **Step 6: Remove the recurring sweep and decouple autosave frequency**

Delete settlement-line markup, sweep CSS, `restartSettlementProgress`, and all references to `settlementProgress`. Stop emitting an immediate save request from every hourly settlement. Keep simulation autosave throttled to at most once per 10 real seconds, while board/research/quest events use the existing short debounce.

- [ ] **Step 7: Run time and sky tests**

Run: `npm test -- tests/e2e/unit/calendar.spec.js tests/e2e/unit/simulation.spec.js tests/e2e/continuous-clock.spec.js tests/e2e/day-night-scene.spec.js --reporter=line --workers=1`

Expected: PASS without a continuously increasing WebGL render count from the clock alone.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src/systems/SimulationSystem.js AI_City_Webgame_V3/src/ui/ContinuousClockView.js AI_City_Webgame_V3/src/ui/CityScene3D.js AI_City_Webgame_V3/index.html AI_City_Webgame_V3/src/style.css`

Expected: no whitespace errors. Do not stage or commit.

### Task 5: Carbon Crisis and Game Over

**Files:**
- Create: `src/systems/CarbonCrisisSystem.js`
- Create: `tests/e2e/unit/carbon-crisis.spec.js`
- Create: `tests/e2e/carbon-game-over.spec.js`
- Modify: `src/core/Constants.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/ui/SimulationHudView.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `src/main.js` render-to-text hook

**Interfaces:**
- Consumes: `summary.hourlyCarbon`, quest index, v5 crisis state, simulation controller pause.
- Produces: `applyCarbonCrisis(state, hourlyCarbon): { active, hours, warnings, gameOverTransition }`, events `CARBON_WARNING` and `GAME_OVER`.

- [ ] **Step 1: Write failing pure carbon tests**

```js
test('carbon above 8 accumulates and safe operation recovers two hours', () => {
  const state = crisisState({ questIndex: 5, carbonCrisisHours: 10 });
  expect(applyCarbonCrisis(state, 8.01).hours).toBe(11);
  expect(applyCarbonCrisis(state, 8).hours).toBe(9);
});

test('168 crisis hours transitions to carbon game over once', () => {
  const state = crisisState({ carbonCrisisHours: 167 });
  expect(applyCarbonCrisis(state, 9).gameOverTransition).toBe(true);
  expect(applyCarbonCrisis(state, 9).gameOverTransition).toBe(false);
});
```

Assert warnings occur exactly once at 24, 72, and 144 hours and quest 1–4 never accumulate crisis time.

- [ ] **Step 2: Run carbon unit tests and verify failure**

Run: `npm test -- tests/e2e/unit/carbon-crisis.spec.js --reporter=line --workers=1`

Expected: FAIL because the system and constants do not exist.

- [ ] **Step 3: Implement pure crisis transitions and settlement integration**

Add constants `{ SAFE_HOURLY: 8, GAME_OVER_HOURS: 168, RECOVERY_PER_SAFE_HOUR: 2, WARNING_HOURS: [24,72,144] }`. Invoke the system after quest evaluation and before incrementing elapsed time. Return crisis result in the settlement payload. Main emits each warning and emits game over only on transition.

- [ ] **Step 4: Implement HUD and blocking game-over modal**

When crisis hours are positive, show `탄소 위험 N/168h`; otherwise retain heatwave labels. `openCarbonGameOverModal()` must use a pausing modal, explain the hourly value and threshold, and provide `새 도시 시작`. The button calls the existing reset flow, clears the save, refreshes, closes the modal, and resumes only the fresh state. On loading a game-over save, do not start the controller before opening this modal.

- [ ] **Step 5: Add browser game-over coverage**

Seed quest 5, `carbonCrisisHours = 167`, a high-carbon summary, settle once, and assert the modal is visible, `gameOver === true`, controller pause reasons include `game-over`, and another settle does not emit a second transition. Assert `render_game_to_text()` reports `mode: "game_over"` and carbon crisis fields.

- [ ] **Step 6: Run carbon, simulation, modal, and save tests**

Run: `npm test -- tests/e2e/unit/carbon-crisis.spec.js tests/e2e/unit/simulation.spec.js tests/e2e/unit/state-v5.spec.js tests/e2e/carbon-game-over.spec.js --reporter=line --workers=1`

Expected: PASS.

- [ ] **Step 7: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src/systems/CarbonCrisisSystem.js AI_City_Webgame_V3/src/ui/StageModals.js AI_City_Webgame_V3/tests/e2e/unit/carbon-crisis.spec.js AI_City_Webgame_V3/tests/e2e/carbon-game-over.spec.js`

Expected: no whitespace errors. Do not stage or commit.

### Task 6: Fixed Maximum Island and Ocean

**Files:**
- Create: `tests/e2e/island-scene.spec.js`
- Modify: `src/core/Constants.js`
- Modify: `src/ui/CityEnvironment3D.js`
- Modify: `src/ui/CityScene3D.js`
- Modify: `tests/e2e/hex-scene.spec.js`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/visual.spec.js`

**Interfaces:**
- Consumes: `assetLoader.getPrimitives('terrain.hexGrass|hexDirt|hexWater')`, `prepareAssetGeometry`, `createHexCoordinates`, `hexDistance`, `axialToWorld`.
- Produces: environment stats `{ landInstances: 37, shoreInstances: 24, waterInstances: 156, oceanPlane: true, roadModels: [] }`.

- [ ] **Step 1: Write failing island instance tests**

```js
test('island reserves maximum land and surrounds it with instanced water', async ({ gamePage: page }) => {
  await page.waitForFunction(() => window.__getCityRendererStats().environment.state === 'ready');
  const environment = await page.evaluate(() => window.__getCityRendererStats().environment);
  expect(environment).toMatchObject({
    landInstances: 37,
    shoreInstances: 24,
    waterInstances: 156,
    oceanPlane: true,
    roadModels: [],
  });
});
```

Capture environment stats before and after expanding board radius 2→3 and assert instance counts and environment scale remain unchanged.

- [ ] **Step 2: Run island tests and verify failure**

Run: `npm test -- tests/e2e/island-scene.spec.js tests/e2e/hex-scene.spec.js --reporter=line --workers=1`

Expected: FAIL because the environment currently scales roadside decoration with board radius and has no water layers.

- [ ] **Step 3: Build cached terrain layers**

Create helper `addTerrainLayer({ id, name, coordinates, targetHeight, materialFallback })` that loads one registered GLB, normalizes it to the board hex footprint, and fills one InstancedMesh. Use `createHexCoordinates(8)` and hex distance to partition radius 0–3 land, radius 4 shore, and radius 5–8 water. Alternate every fifth shore tile to grass; keep the rest dirt. On asset failure, use a six-segment cylinder fallback.

- [ ] **Step 4: Replace outer decoration and rectangular ground**

Remove `addRoads`, street vehicles, radius scaling, and their initial loading. Place a small fixed set of tree/rock instances only on selected radius-4 coordinates. Replace the old offset ground plane material with a blue ocean plane below the water tiles. Keep all non-playable terrain out of raycasting.

- [ ] **Step 5: Render locked reserve land without expanding gameplay state**

Keep the clickable `tileMesh` at 19 or 37 cells according to state. The environment land layer always shows 37 terrain tiles; radius-3 reserve cells use the underlying terrain until expansion creates clickable tile instances over them. Do not add reserve cells to `gameState.grid` early.

- [ ] **Step 6: Run island and performance tests**

Run: `npm test -- tests/e2e/island-scene.spec.js tests/e2e/hex-scene.spec.js tests/e2e/perf.spec.js --reporter=line --workers=1`

Expected: PASS with representative-city draw calls at or below 26 and no new continuous frames.

- [ ] **Step 7: Review and update island visual snapshots**

Run: `npm test -- tests/e2e/visual.spec.js --reporter=line --workers=1`

Inspect day, night, rotated, mobile, and initial-board diffs. Update only snapshots whose differences are the approved island/ocean framing.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src/ui/CityEnvironment3D.js AI_City_Webgame_V3/src/ui/CityScene3D.js AI_City_Webgame_V3/tests/e2e/island-scene.spec.js`

Expected: no whitespace errors. Do not stage or commit.

### Task 7: Remove Floating Markers and Stabilize Kenney Palette Textures

**Files:**
- Modify: `src/ui/CityScene3D.js`
- Modify: `src/ui/GridView.js`
- Modify: `src/level/CityAssetLoader.js`
- Modify: `src/ui/CityEnvironment3D.js`
- Modify: `tests/e2e/motion.spec.js`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/assets.spec.js`
- Modify: `tests/e2e/visual.spec.js`

**Interfaces:**
- Consumes: cached GLTF materials, selection/preview/diagnosis state rings.
- Produces: `configurePaletteMaterial(material, assetId)` and renderer stats with `linkMarkerCount: 0`, `levelSegmentCount: 0`.

- [ ] **Step 1: Add failing marker and texture tests**

Assert a city containing positive/warning relationships reports zero link markers and zero level segments. Inspect the factory material after asset load and assert its map uses `THREE.NearestFilter`, `generateMipmaps === false`, and remains the same object after 30 redraws.

- [ ] **Step 2: Add camera resource-stability coverage**

Record geometry count, texture count, resource revision, and instrumented WebGL buffer counts. Rotate the camera through 30 orbit updates. Assert all resource counts remain constant and created/deleted buffers equal zero after warm-up.

- [ ] **Step 3: Run tests and verify the old visual layers fail**

Run: `npm test -- tests/e2e/assets.spec.js tests/e2e/motion.spec.js tests/e2e/perf.spec.js --reporter=line --workers=1`

Expected: FAIL on marker counts and palette sampling.

- [ ] **Step 4: Remove persistent airborne layers**

Delete `linkMarkerMesh`, `linkMarkerMaterial`, `pedestalMesh`, `pedestalMaterial`, their geometry allocation, prewarm entries, update loops, disposal paths, and stats. Stop adding `linkMark` in `GridView`; keep spatial relationships in the inspector. Extend the ground state ring priority with `diagnosisTarget` for Task 8.

- [ ] **Step 5: Configure palette textures once**

For Kenney asset IDs from hexagon, road, suburban, commercial, industrial, nature, car, and people packs, clone the loaded material once, set `map.magFilter = THREE.NearestFilter`, `map.minFilter = THREE.NearestFilter`, `map.generateMipmaps = false`, and `map.needsUpdate = true`. Do not apply this to `energy.*` Quaternius assets. Reuse the configured map for every instance.

- [ ] **Step 6: Run assets, motion, performance, and visual tests**

Run: `npm test -- tests/e2e/assets.spec.js tests/e2e/motion.spec.js tests/e2e/perf.spec.js tests/e2e/visual.spec.js --reporter=line --workers=1`

Expected: functional tests pass; inspect factory snapshot at multiple angles before updating approved visual snapshots.

- [ ] **Step 7: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src/ui/CityScene3D.js AI_City_Webgame_V3/src/ui/GridView.js AI_City_Webgame_V3/src/level/CityAssetLoader.js`

Expected: no whitespace errors. Do not stage or commit.

### Task 8: Quest 6 Scanner Toggle and Actionable Unlock Reasons

**Files:**
- Modify: `src/systems/DiagnosisSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/ui/DiagnosisView.js`
- Modify: `src/ui/QuestView.js`
- Modify: `src/ui/DockView.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/main.js`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `tests/e2e/unit/diagnosis-v2.spec.js`
- Modify: `tests/e2e/quest-ui.spec.js`
- Modify: `tests/e2e/hud.spec.js`

**Interfaces:**
- Consumes: v5 `diagnosisScannerActive`, `problemTileIndices`, `validateUpgrade`, research definitions, quest definitions.
- Produces: `nextDiagnosisTarget(): number|null`, `setDiagnosisScannerActive(active): boolean`, `upgradeRequirementMessage(state, validation): string`, `facilityUnlockMessage(state, key): string`.

- [ ] **Step 1: Write failing diagnostic target and unlock-message tests**

Assert `nextDiagnosisTarget()` returns the first unresolved risk and advances after scanning it. Assert scanner-off clicks do not change `diagnosisFound`. Assert level-2 permit, level-3 permit, solar technology, and insufficient-credit validations produce exact Korean messages from the spec.

- [ ] **Step 2: Run diagnosis and facility tests and verify failure**

Run: `npm test -- tests/e2e/unit/diagnosis-v2.spec.js tests/e2e/unit/facility-tech.spec.js --reporter=line --workers=1`

Expected: FAIL because target/toggle/message helpers do not exist.

- [ ] **Step 3: Implement scanner state and target ground highlight**

When quest 6 is active, render a separate `diagnosisToggleBtn`, show progress copy with scanner state, and add `diagnosisTarget: true` only to the next unresolved risk config. `markerColorFor` maps this to the selected cyan ground ring. If scanner is off, the diagnosis click handler emits a short instruction toast and does not call `scanTile`.

- [ ] **Step 4: Add a quest-card action without overloading claim**

Add a dedicated context action element in the quest tracker. It is visible only on quest 6 and toggles scanner state. The reward button remains responsible only for quizzes and claims. On quest 6 entry default the scanner to on; leaving quest 6 hides the action and diagnostic controls.

- [ ] **Step 5: Make locked buttons explain themselves on click and hover**

For upgrades, render a visible requirement line and use `aria-disabled` instead of native `disabled`. The handler revalidates; on failure it emits the exact message and does not mutate state. For dock cards, keep unaffordable cards non-selectable but clickable for a missing-credit toast, and replace generic `퀘스트 잠금` with the quest number/title that grants the facility.

- [ ] **Step 6: Run unit and browser UI tests**

Run: `npm test -- tests/e2e/unit/diagnosis-v2.spec.js tests/e2e/unit/facility-tech.spec.js tests/e2e/quest-ui.spec.js tests/e2e/hud.spec.js --reporter=line --workers=1`

Expected: PASS.

- [ ] **Step 7: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src/systems/DiagnosisSystem.js AI_City_Webgame_V3/src/ui/DiagnosisView.js AI_City_Webgame_V3/src/ui/QuestView.js AI_City_Webgame_V3/src/ui/StageModals.js`

Expected: no whitespace errors. Do not stage or commit.

### Task 9: Story, Help, Hooks, and Integrated UI Copy

**Files:**
- Modify: `src/ui/OnboardingView.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/ui/SimulationHudView.js`
- Modify: `src/main.js`
- Modify: `tests/e2e/onboarding.spec.js`
- Modify: `tests/e2e/quest-ui.spec.js`
- Modify: `tests/e2e/game.spec.js`
- Modify: `progress.md`

**Interfaces:**
- Consumes: all previous tasks' state and view APIs.
- Produces: updated onboarding/help copy and complete `render_game_to_text()` research, clock, crisis, and island state.

- [ ] **Step 1: Add failing onboarding and text-state assertions**

Assert story text includes `해수면 상승`, `섬`, and `37칸`. Assert help text includes `1초마다`, `데이터센터마다`, `정답마다 24시간`, and `탄소 8`. Assert text-state research contains a `jobs` object rather than `active` and reports `visualGameTime`, `carbonCrisisHours`, and `mode`.

- [ ] **Step 2: Run onboarding and game tests and verify failure**

Run: `npm test -- tests/e2e/onboarding.spec.js tests/e2e/game.spec.js --reporter=line --workers=1`

Expected: FAIL on old story/help/hook shape.

- [ ] **Step 3: Update story and rules copy**

The first story page explains that 2040 sea-level rise flooded low ground and collapsed power/water infrastructure. The final page identifies the remaining high-ground island, 15 quests, and maximum 37-cell protected city. Replace the help modal's five-second rule and single research language with the approved one-second, per-center, quiz acceleration, carbon limit, and tidal-edge rules.

- [ ] **Step 4: Update test and agent hooks**

Return `mode: gameState.gameOver ? 'game_over' : 'playing'`; include settled and visual calendar labels, all research jobs, completed IDs, technology levels, acceleration bank, carbon crisis hours/limit, and island environment stats. Retain concise on-screen entities and axial coordinate note.

- [ ] **Step 5: Append progress documentation**

Record the approved balance values, save version, island instance counts, removed marker layers, texture-filter root cause, test commands, bundle sizes, draw calls, and any genuine residual limitation. Do not rewrite older user-owned entries.

- [ ] **Step 6: Run onboarding, game, quest, and nonpausing tests**

Run: `npm test -- tests/e2e/onboarding.spec.js tests/e2e/game.spec.js tests/e2e/quest-ui.spec.js tests/e2e/nonpausing-panels.spec.js --reporter=line --workers=1`

Expected: PASS.

- [ ] **Step 7: Local checkpoint**

Run: `git diff --check -- AI_City_Webgame_V3/src/ui/OnboardingView.js AI_City_Webgame_V3/src/ui/StageModals.js AI_City_Webgame_V3/src/main.js AI_City_Webgame_V3/progress.md`

Expected: no whitespace errors. Do not stage or commit.

### Task 10: Full Runtime, Visual, Asset, and Performance Verification

**Files:**
- Modify if and only if failures reveal approved-scope defects: touched source/tests above.
- Modify after inspection: approved visual snapshots under `tests/e2e/visual.spec.js-snapshots/`.

**Interfaces:**
- Consumes: completed implementation.
- Produces: evidence that the complete game builds and passes gameplay, asset, visual, and performance gates.

- [ ] **Step 1: Run the complete suite without retries**

Run: `npm test -- --reporter=line --workers=2 --retries=0`

Expected: all tests pass. If a test fails, reproduce it alone before changing code; do not update a screenshot until inspecting the image.

- [ ] **Step 2: Run visual tests serially and inspect every changed image**

Run: `npm test -- tests/e2e/visual.spec.js --reporter=line --workers=1 --retries=0`

Expected approved changes: continuous celestial DOM layers, island/ocean background, no floating relation/level objects, stable factory palette, and quest 6 scanner UI. Reject clipping, blank terrain, black asset faces, unreadable night scenes, or controls over water.

- [ ] **Step 3: Run performance tests serially**

Run: `npm test -- tests/e2e/perf.spec.js tests/e2e/continuous-clock.spec.js tests/e2e/island-scene.spec.js --reporter=line --workers=1 --retries=0`

Expected: one WebGL context, draw calls ≤26, no continuous WebGL frames from the clock, no GPU buffer churn, and stable resources during camera movement.

- [ ] **Step 4: Run asset audit and security audit**

Run: `npm run assets:audit`

Expected: zero audit errors, no missing runtime models, and zero manual downloads remaining.

Run: `npm audit`

Expected: zero vulnerabilities.

- [ ] **Step 5: Build production output**

Run: `npm run build`

Expected: exit 0. Record emitted HTML/CSS/JS sizes and the existing large-JS warning if it remains.

- [ ] **Step 6: Verify workspace integrity**

Run: `git diff --check -- AI_City_Webgame_V3`

Expected: no whitespace errors.

Run: `git status --short -- AI_City_Webgame_V3`

Expected: only local user/project changes; no staged entries caused by this plan and no remote operations.

- [ ] **Step 7: Final manual browser review**

At desktop and mobile sizes, verify camera rotation/pan/zoom, build preview, one-second income, continuous clock, pause, dawn/day/dusk/night, island edge, two simultaneous research jobs, quiz acceleration, quest 6 toggle, solar Lv.2, locked-permit explanation, cent balance, carbon warnings, and game over. Check the browser console has no uncaught errors or failed asset requests.

- [ ] **Step 8: Record final measurements and handoff**

Append exact passed-test count, durations, draw calls, renderer resource counts, island instance counts, asset bytes, bundle sizes, and remaining non-blocking limitations to `progress.md`. Report the local file links and explicitly state that no Git commit, push, deployment, or remote mutation occurred.
