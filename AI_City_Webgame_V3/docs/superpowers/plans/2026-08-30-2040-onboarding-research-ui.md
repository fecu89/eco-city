# 2040 Onboarding, Research, UI, and Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagents are not authorized for this repository. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Turn the hex city into a readable 2040 climate-survival game with a reliable time economy, data-center research, exactly 15 progressive quests, predictive construction, and a canvas-first desktop/mobile UI.

**Architecture:** Pure calendar, research, placement-validation, and quest rules live in systems and constants. `main.js` remains the orchestrator: UI emits `domain:action` events, the orchestrator invokes systems, and state changes fan back out through domain result events. Modal pause policy is explicit, research is settled once per game hour after power/economy, and every UI reads the same validation/stat functions used by gameplay.

**Tech Stack:** Three.js 0.185, Vite 8, Playwright, anime.js, EventBus/GameState architecture, the axial hex board from `2026-08-30-hex-city-migration.md`, and the asset registry/loader from `2026-08-30-cc0-asset-pipeline.md`.

**Spec:** `docs/superpowers/specs/2026-08-30-2040-onboarding-research-ui-design.md`

**Dependencies:** Implement `2026-08-30-cc0-asset-pipeline.md` and `2026-08-30-hex-city-migration.md` first. This plan raises the hex save schema from v3 to v4; migration must remain a pipeline so original v1/v2 saves still pass through the v3 square-to-hex conversion before v4 fields are added.

## Global Constraints

- New games start at `2040-01-01 08:00` with 10C and a radius-2 hex board.
- One real-time hour tick is 5000ms at 1×, 2500ms at 2×, and 1250ms at 4×.
- Only story, quiz, reset confirmation, and final report pause simulation.
- Build, facility, research, quest map, status, settings, and guide panels do not pause simulation.
- Research demand is applied before power calculation; research progress is applied after economy settlement.
- There is one citywide active research job and one assigned data center.
- Build cards, pointer/tap ghost, and actual placement share one validator and reason codes.
- Mutating command systems return result payloads without emitting; `main.js` emits each result event exactly once.
- AI advisor, AI auto-build, transcripts, evidence, badges, and achievement UI/state are removed.
- Quest completion celebration replaces achievement celebration.
- Keep light/dark themes, low-frequency power flashes, pooled 10–30 second birds, and render-on-demand behavior.
- Do not add per-frame DOM or research updates.
- Do not commit, push, deploy, stage, or alter Git history.

## File Map

### New files

- `src/systems/CalendarSystem.js` — UTC-independent game calendar and speed interval helpers.
- `src/core/ResearchDefinitions.js` — five immutable research definitions and tech rules.
- `src/systems/ResearchSystem.js` — start, cancel, reassign, progress, and completion logic.
- `src/ui/OnboardingView.js` — three-page story and action-driven tutorial highlight.
- `src/ui/ResearchView.js` — non-pausing data-center research panel/tab.
- `tests/e2e/unit/calendar.spec.js` — date, leap-day, speed, and pause-policy contracts.
- `tests/e2e/unit/research.spec.js` — research lifecycle and power gating.
- `tests/e2e/unit/facility-tech.spec.js` — tidal placement and technology upgrade gates.
- `tests/e2e/onboarding.spec.js` — first-run story and tutorial browser flow.
- `tests/e2e/research-ui.spec.js` — browser research flow and non-pausing inspector.

### Modified files

- `index.html` — canvas-first HUD, four navigation actions, story/tutorial roots, build confirm controls.
- `src/style.css` — desktop floating panels, mobile bottom bar, story, cards, ghost confirmation, and themes.
- `src/core/Constants.js` — 10C start, calendar/speed, facility card data, tidal, research and UI constants; remove AI/badge constants.
- `src/core/EventBus.js` — calendar, research, preview, onboarding, and quest celebration events; remove AI/badge events.
- `src/core/GameState.js` — v4 time, onboarding, research, tech, and last-settlement state; remove obsolete state.
- `src/core/QuestDefinitions.js` — exact 15-quest campaign and structured goals/rewards.
- `src/systems/SaveSystem.js` — v3-to-v4 migration and obsolete-field stripping.
- `src/systems/SimulationSystem.js` — dynamic time speed, exact settlement order, and research hook.
- `src/systems/PowerNetworkSystem.js` — per-index additional demand and tidal as low-carbon generation.
- `src/systems/EconomySystem.js` — tidal upkeep and consistent settlement delta.
- `src/systems/BoardSystem.js` — authoritative placement/upgrade validation and technology gates.
- `src/systems/QuestSystem.js` — revised research-aware quest conditions and rewards.
- `src/systems/QuizSystem.js` — no AI/evidence questions and exact quiz mappings.
- `src/systems/ReportSystem.js` — 2040 climate terminology and no obsolete fields.
- `src/ui/Modal.js` — explicit modal identity and pause policy.
- `src/ui/WorldHud.js` — build/quest/status/settings only; preview cleanup on close.
- `src/ui/HudView.js` — compact operational HUD only.
- `src/ui/SimulationHudView.js` — calendar, speed buttons, delta pulse, progress line.
- `src/ui/DockView.js` — complete card data, locks, affordability, and selection events.
- `src/ui/GridView.js` — desktop preview/mobile candidate actions and shared reason presentation.
- `src/ui/CityScene3D.js` — one reusable GLB/fallback ghost and preview lifecycle.
- `src/ui/QuestView.js` — structured goals, quest map, claim feedback, celebration.
- `src/ui/StageModals.js` — settings/guide/report/reset and inspector shell without research implementation.
- `src/ui/ChartView.js` — city status metrics, no development-score emphasis.
- `src/main.js` — orchestration, selective pause, research commands, event wiring, and text contract.
- Existing unit, browser, visual, mobile, and performance tests that reference old UI/state.

### Deleted after replacement tests pass

- `src/systems/AdvisorSystem.js`
- `src/systems/AchievementSystem.js`
- `src/ui/PanelViews.js`
- `src/ui/AchievementCelebration.js`

---

### Task 1: Deterministic 2040 calendar and variable-speed simulation

**Files:**
- Create: `src/systems/CalendarSystem.js`
- Create: `tests/e2e/unit/calendar.spec.js`
- Modify: `src/core/Constants.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `tests/e2e/unit/simulation.spec.js`

**Interfaces:**
- Produces: `calendarAtElapsedHour(elapsedGameHours): CalendarSnapshot`
- Produces: `formatCalendar(snapshot): string`
- Produces: `intervalForTimeScale(timeScale): number | null`
- Updates: `createSimulationController({ settle, getIntervalMs, ... })`
- Adds controller methods: `setTimeScale(scale)`, `getProgress(now?)`
- Keeps controller methods: `start`, `pause`, `resume`, `settleNow`, `dispose`, `getState`

- [x] **Step 1: Write calendar and scheduler tests**

```js
import { test, expect } from '@playwright/test';
import {
  calendarAtElapsedHour,
  formatCalendar,
  intervalForTimeScale,
} from '../../../src/systems/CalendarSystem.js';
import { createSimulationController } from '../../../src/systems/SimulationSystem.js';

test('calendar starts at 2040-01-01 08:00 and uses leap-year rules', () => {
  expect(formatCalendar(calendarAtElapsedHour(0))).toBe('2040-01-01 08:00');
  expect(formatCalendar(calendarAtElapsedHour(24 * 59 + 16))).toBe('2040-03-01 00:00');
  expect(formatCalendar(calendarAtElapsedHour(24 * 365 + 16))).toBe('2041-01-01 00:00');
});

test('supported speeds resolve to exact real-time intervals', () => {
  expect(intervalForTimeScale(0)).toBeNull();
  expect(intervalForTimeScale(1)).toBe(5000);
  expect(intervalForTimeScale(2)).toBe(2500);
  expect(intervalForTimeScale(4)).toBe(1250);
  expect(() => intervalForTimeScale(3)).toThrow(/time scale/i);
});

test('changing speed cancels one timer and reschedules without settling twice', () => {
  let now = 0;
  let settles = 0;
  let nextId = 0;
  const timers = new Map();
  const controller = createSimulationController({
    settle: () => { settles += 1; },
    getIntervalMs: (speed) => intervalForTimeScale(speed),
    setTimer: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay, startedAt: now }); return id; },
    clearTimer: (id) => timers.delete(id),
    now: () => now,
  });
  controller.start();
  expect([...timers.values()][0].delay).toBe(5000);
  controller.setTimeScale(4);
  expect(timers.size).toBe(1);
  expect([...timers.values()][0].delay).toBe(1250);
  [...timers.values()][0].fn();
  expect(settles).toBe(1);
});
```

- [x] **Step 2: Run the focused tests and confirm failure**

Run: `npx playwright test tests/e2e/unit/calendar.spec.js tests/e2e/unit/simulation.spec.js`

Expected: FAIL because `CalendarSystem` and dynamic speed do not exist.

- [x] **Step 3: Add constants and implement the pure calendar**

```js
export const CALENDAR = Object.freeze({
  START_YEAR: 2040,
  START_MONTH: 1,
  START_DAY: 1,
  START_HOUR: 8,
  MS_PER_GAME_HOUR: 60 * 60 * 1000,
});

export const TIME = Object.freeze({
  BASE_HOUR_MS: 5000,
  ALLOWED_SCALES: Object.freeze([0, 1, 2, 4]),
  DEFAULT_SCALE: 1,
});
```

`calendarAtElapsedHour` must use `Date.UTC` and UTC getters only. It must reject negative or non-finite hours and return `{ year, month, day, hour, elapsedGameHours }`.

- [x] **Step 4: Make the controller reschedule on speed changes**

Store `timeScale`, `scheduledAt`, and `scheduledDelay`. `setTimeScale(0)` adds the `player` pause reason; any nonzero supported value removes it, cancels the old timer, and schedules one new timer. `getProgress()` returns a clamped 0–1 real-time fraction and returns 0 while unscheduled. Existing `hidden`, `story`, `quiz`, `reset`, and `final-report` reasons remain independent entries in the Set.

- [x] **Step 5: Run focused tests**

Run: `npx playwright test tests/e2e/unit/calendar.spec.js tests/e2e/unit/simulation.spec.js`

Expected: PASS.

- [x] **Step 6: Review the diff without staging**

Run: `git diff --check -- src/core/Constants.js src/systems/CalendarSystem.js src/systems/SimulationSystem.js tests/e2e/unit/calendar.spec.js tests/e2e/unit/simulation.spec.js`

Expected: no whitespace errors.

---

### Task 2: v4 state and safe migration pipeline

**Files:**
- Modify: `src/core/GameState.js`
- Modify: `src/systems/SaveSystem.js`
- Modify: `tests/e2e/unit/state-v2.spec.js`
- Create: `tests/e2e/unit/state-v4.spec.js`

**State contract:**

```js
{
  v: 4,
  elapsedGameHours: 0,
  timeScale: 1,
  lastSettlementDelta: 0,
  onboardingVersionSeen: 0,
  tutorialStep: 'build-button',
  tutorialComplete: false,
  researchMenuUnlocked: false,
  research: {
    active: null,
    completedIds: Set<string>,
    techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0 },
  },
}
```

- [x] **Step 1: Write state default, round-trip, and migration tests**

The tests must assert all of the following:

- new state has 10C, elapsed hour 0, 1× speed, no active research, and no `badges`, `advisorQuestions`, or `transcripts` property;
- `serialize()` converts `research.completedIds` to an array and hydrates it back to a Set;
- a v3 hex save gains v4 defaults without changing coordinates, cells, quest index, credits, levels, priority, or battery mix;
- a v2 square save flows through `migrateV2ToV3` before `migrateV3ToV4`;
- legacy `evidence`, `badges`, `advisorQuestions`, `transcripts`, and AI fields never appear in the v4 payload;
- a renewable already at Lv.2/Lv.3 in a legacy save remains at that level even if the corresponding tech level starts lower;
- migration parse failure returns a fresh in-memory state but leaves the original storage string present.

- [x] **Step 2: Run focused tests and confirm failure**

Run: `npx playwright test tests/e2e/unit/state-v2.spec.js tests/e2e/unit/state-v4.spec.js`

Expected: FAIL on v4 fields and removed obsolete properties.

- [x] **Step 3: Replace direct version checks with staged migration**

Export these functions from `SaveSystem.js` for deterministic tests:

```js
export function migrateSaveData(raw) {
  let data = structuredClone(raw);
  if (data.v === 1) data = migrateV1ToV2(data);
  if (data.v === 2) data = migrateV2ToV3(data);
  if (data.v === 3) data = migrateV3ToV4(data);
  if (data.v !== 4) throw new Error(`Unsupported save version: ${data.v}`);
  return stripObsoleteState(data);
}
```

Do not clear localStorage in the parse/migration catch path. Log one concise error, call `gameState.reset()`, and return `false`.

- [x] **Step 4: Update `GameState` defaults, serialization, and hydration**

Remove obsolete fields and `logTranscript`. Keep `simulationDay`/`simulationHour` only as migration inputs; runtime UI and serialization use `elapsedGameHours` plus `calendarAtElapsedHour`. Preserve existing quiz, diagnosis, totals, cell, quest, audio, and theme-relevant state.

- [x] **Step 5: Run focused tests**

Run: `npx playwright test tests/e2e/unit/state-v2.spec.js tests/e2e/unit/state-v4.spec.js tests/e2e/unit/hex-grid.spec.js`

Expected: PASS.

- [x] **Step 6: Review the diff without staging**

Run: `git diff --check -- src/core/GameState.js src/systems/SaveSystem.js tests/e2e/unit/state-v2.spec.js tests/e2e/unit/state-v4.spec.js`

---

### Task 3: Research definitions and lifecycle

**Files:**
- Create: `src/core/ResearchDefinitions.js`
- Create: `src/systems/ResearchSystem.js`
- Create: `tests/e2e/unit/research.spec.js`
- Modify: `src/core/EventBus.js`

**Interfaces:**
- Produces: `RESEARCH` keyed by `solar2`, `wind2`, `battery2`, `tidal1`, `renewable3`
- Produces: `listResearchAvailability(state): ResearchAvailability[]`
- Produces: `startResearch(state, researchId, dataCenterIndex): CommandResult`
- Produces: `cancelResearch(state): CommandResult`
- Produces: `assignResearchDataCenter(state, index): CommandResult`
- Produces: `researchDemandByIndex(state): Record<number, number>`
- Produces: `advanceResearchOneHour(state, facilityPower): ProgressResult`
- Produces: `handleResearchFacilityRemoved(state, index): void`

- [x] **Step 1: Write lifecycle tests**

```js
test('research costs credits once and adds 2E only to its assigned data center', () => {
  const state = researchState({ credits: 20, completed: [], dataCenters: [{ index: 3, level: 1 }] });
  expect(startResearch(state, 'solar2', 3)).toMatchObject({ ok: true });
  expect(state.credits).toBe(12);
  expect(researchDemandByIndex(state)).toEqual({ 3: 2 });
  expect(startResearch(state, 'wind2', 3)).toEqual({ ok: false, reason: 'research_active' });
});

test('research pauses below 90 percent power and advances at the data-center level speed', () => {
  const state = researchState({ active: activeResearch('solar2', 3), dataCenters: [{ index: 3, level: 2 }] });
  expect(advanceResearchOneHour(state, { 3: { ratio: 0.89 } }).status).toBe('underpowered');
  expect(state.research.active.elapsedEffectiveHours).toBe(0);
  expect(advanceResearchOneHour(state, { 3: { ratio: 0.9 } }).advancedHours).toBe(1.25);
});

test('cancel refunds floor 50 percent and demolition preserves progress for reassignment', () => {
  const state = researchState({ credits: 0, active: activeResearch('battery2', 4, 100) });
  handleResearchFacilityRemoved(state, 4);
  expect(state.research.active).toMatchObject({ dataCenterIndex: null, elapsedEffectiveHours: 100, status: 'unassigned' });
  expect(cancelResearch(state)).toMatchObject({ ok: true, refund: 6 });
  expect(state.credits).toBe(6);
});
```

Also test all prerequisites, 14/14/21/21/30-day durations, 8/8/12/14/18C costs, one-time completion, and technology outcomes.

- [x] **Step 2: Run and confirm failure**

Run: `npx playwright test tests/e2e/unit/research.spec.js`

Expected: FAIL because research modules do not exist.

- [x] **Step 3: Define the immutable tree**

```js
export const RESEARCH = Object.freeze({
  solar2: research('solar2', '고효율 태양전지', 14, 8, ['facility:solar'], { tech: ['solar', 2] }),
  wind2: research('wind2', '풍력 예측 제어', 14, 8, ['facility:wind'], { tech: ['wind', 2] }),
  battery2: research('battery2', '차세대 저장 화학', 21, 12, ['facility:battery'], { tech: ['battery', 2] }),
  tidal1: research('tidal1', '조력 발전 실증', 21, 14, ['tech:solar:2', 'tech:wind:2'], { tech: ['tidal', 1], unlockFacility: 'tidal' }),
  renewable3: research('renewable3', '통합 재생전력망', 30, 18, ['research:solar2', 'research:wind2', 'research:battery2', 'research:tidal1'], { techAll: { solar: 3, wind: 3, tidal: 3 } }),
});
```

The helper converts days to `durationHours: days * 24`. Prerequisite evaluation returns exact reason codes and human-readable labels without mutating state.

- [x] **Step 4: Implement commands and completion**

Use `DATA_CENTER_RESEARCH_SPEED = [0, 1, 1.25, 1.5]`, `RESEARCH_POWER_THRESHOLD = 0.9`, `RESEARCH_EXTRA_DEMAND = 2`, and `RESEARCH_CANCEL_REFUND_RATIO = 0.5` from `Constants.js`. Completion clears active research, adds the ID to `completedIds`, applies the outcome, and emits no event itself; the orchestrator emits `research:completed` using the returned result.

- [x] **Step 5: Add events**

Add:

```js
RESEARCH_START_REQUESTED: 'research:startRequested',
RESEARCH_STARTED: 'research:started',
RESEARCH_CANCEL_REQUESTED: 'research:cancelRequested',
RESEARCH_CANCELLED: 'research:cancelled',
RESEARCH_ASSIGN_REQUESTED: 'research:assignRequested',
RESEARCH_ASSIGNED: 'research:assigned',
RESEARCH_PROGRESS: 'research:progress',
RESEARCH_COMPLETED: 'research:completed',
```

- [x] **Step 6: Run focused tests and diff check**

Run: `npx playwright test tests/e2e/unit/research.spec.js`

Run: `git diff --check -- src/core/ResearchDefinitions.js src/systems/ResearchSystem.js src/core/EventBus.js tests/e2e/unit/research.spec.js`

Expected: PASS and no whitespace errors.

---

### Task 4: Hourly settlement order, additional research demand, and selective-pause plumbing

**Files:**
- Modify: `src/systems/PowerNetworkSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/ui/Modal.js`
- Modify: `src/main.js`
- Modify: `tests/e2e/unit/power-network.spec.js`
- Modify: `tests/e2e/unit/economy.spec.js`
- Modify: `tests/e2e/unit/simulation.spec.js`
- Create: `tests/e2e/nonpausing-panels.spec.js`

**Settlement contract:**

```text
calendar/climate → research demand → power/storage/routes → labor/economy
→ credits/delta → research progress → quest progress → elapsed hour/totals
→ save request → one UI/3D refresh
```

- [x] **Step 1: Write order and power-demand tests**

Test that an assigned data center with base 8E demand reports 10E before level multipliers where applicable, and that its supply ratio is calculated against the augmented demand. Test that `advanceResearchOneHour` sees the exact `facilityPower` result from that same tick. Use spies that push stage names and assert the exact order above.

- [x] **Step 2: Write the browser regression before changing modal policy**

`tests/e2e/nonpausing-panels.spec.js` must:

1. create a deterministic profitable powered city;
2. record credits;
3. open a facility inspector and invoke `window.__settleSimulationHour()`;
4. assert credits increased and `window.__getSimulationState().paused` is false;
5. repeat for build, quest map, status, settings, and research panels;
6. assert story, quiz, reset confirmation, and final report each expose their own pause reason.

- [x] **Step 3: Run tests and confirm the inspector failure**

Run: `npx playwright test tests/e2e/unit/power-network.spec.js tests/e2e/unit/economy.spec.js tests/e2e/unit/simulation.spec.js tests/e2e/nonpausing-panels.spec.js`

Expected: unit failures for additional demand and browser failure because every modal currently pauses with reason `modal`.

- [x] **Step 4: Add `additionalDemandByIndex` to the power solver**

Change the signature to:

```js
calculatePowerNetwork({
  grid,
  coords,
  hour,
  tickIndex,
  heatwave,
  additionalDemandByIndex = {},
  batteryHubEfficiency,
})
```

For each consumer, add `Number(additionalDemandByIndex[index] || 0)` to level/climate-adjusted base demand. Ignore keys that are absent, empty, generation facilities, or demolished cells. Include `tidal` in the low-carbon source set.

- [x] **Step 5: Refactor `createHourSettler` to accept research hooks**

```js
createHourSettler({
  calculatePowerNetwork,
  settleEconomy,
  getResearchDemand,
  advanceResearch,
  evaluateQuest,
  getCalendar,
  updateClimate,
})
```

Set `state.lastSettlementDelta = economy.netCredits`, increment `state.elapsedGameHours` exactly once, and return `{ power, economy, research, summary }`. Do not refresh from inside any subsystem.

- [x] **Step 6: Implement the explicit modal pause payload, wire it in `main.js`, and make this regression pass**

Add the Task 5 `setModal(html, policy)` signature now because the income regression depends on it. `Modal.js` stores the active `{ id, pauseReason }`; open/close events carry that payload. The main listener uses `pauseReason`, never a generic `modal` reason, and pauses or resumes only when it is non-null. Task 5 then converts every caller and verifies HUD behavior.

- [x] **Step 7: Run focused tests and diff check**

Run: `npx playwright test tests/e2e/unit/power-network.spec.js tests/e2e/unit/economy.spec.js tests/e2e/unit/simulation.spec.js tests/e2e/nonpausing-panels.spec.js`

Run: `git diff --check -- src/systems/PowerNetworkSystem.js src/systems/EconomySystem.js src/systems/SimulationSystem.js src/main.js tests/e2e/nonpausing-panels.spec.js`

Expected: PASS and credits change while non-pausing panels are open.

---

### Task 5: Complete modal call-site policies and build the minimal world HUD

**Files:**
- Modify: `src/ui/Modal.js`
- Modify: `src/ui/WorldHud.js`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/core/EventBus.js`
- Modify: `src/ui/HudView.js`
- Modify: `src/ui/SimulationHudView.js`
- Modify: `src/ui/ChartView.js`
- Modify: `src/main.js`
- Modify: `tests/e2e/hud.spec.js`
- Modify: `tests/e2e/mobile.spec.js`

**Modal API:**

```js
setModal(html, {
  id = 'generic',
  pauseReason = null,
  closeOnBackdrop = true,
  restorePanel = null,
} = {})
```

- [x] **Step 1: Write HUD and pause-policy browser tests**

Assert:

- exactly four desktop and four mobile actions exist: `build`, `quests`, `status`, `settings`;
- no `advisorPanel`, `achievementsPanel`, `aiBlindBuildBtn`, `advisorLog`, `badges`, development score, board-size resource card, or evidence UI exists;
- top HUD contains calendar/time, pause/1×/2×/4×, credits/delta, supply/demand, and climate alert;
- status panel contains carbon, water, workforce, jobs, employment, transmission efficiency, storage, overcrowding, health, and upkeep/cost;
- opening and closing non-pausing panels never changes the simulation pause Set;
- Escape closes the active HUD panel and build close clears selection preview;
- mobile bottom bar respects safe-area inset and remains keyboard accessible.

- [x] **Step 2: Run and confirm failures**

Run: `npx playwright test tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/nonpausing-panels.spec.js`

Expected: FAIL on obsolete actions and generic modal pause.

- [x] **Step 3: Complete and regression-test modal identity and balanced pause events**

Convert every modal caller to an explicit policy. Replacing a modal must emit a close event for the previous non-null reason before emitting the new open event unless the ID and pause reason are unchanged. `closeModal()` emits `{ id, pauseReason }` once, clears state, and never resumes unrelated reasons. Quiz question-to-question replacement therefore retains `quiz`; a final close removes only `quiz`.

- [x] **Step 4: Reduce HUD navigation and markup**

Replace `VALID_PANELS` with:

```js
new Set(['build', 'quests', 'status', 'settings'])
```

The persistent quest mini-card remains outside the panel host and its map button opens/focuses the quests panel. Settings owns guide, story replay, music, sound, theme, and reset actions. Remove the old brand/phase/resource clutter if it competes with the operational strip; the canvas remains the full viewport background.

- [x] **Step 5: Add speed controls and settlement progress**

Add `TIME_SCALE_REQUESTED: 'time:scaleRequested'` and `TIME_SCALE_CHANGED: 'time:scaleChanged'`. `SimulationHudView` emits the request; `main.js` validates `[0, 1, 2, 4]`, changes the controller/state, emits the result, and requests a save. The view renders `calendarAtElapsedHour`, applies `aria-pressed` to the active speed, flashes `lastSettlementDelta`, and updates the thin progress line at no more than 10Hz. The 3D scene is not rendered for progress-only DOM updates.

- [x] **Step 6: Replace score chart with operational status**

Retain a lightweight chart only if it communicates carbon/water history. All current point-in-time values are text rows fed from `lastTickSummary`; no `devScore` or stage labels remain.

- [x] **Step 7: Run tests and visual spot checks**

Run: `npx playwright test tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/nonpausing-panels.spec.js`

Expected: PASS.

- [x] **Step 8: Review the diff without staging**

Run: `git diff --check -- index.html src/style.css src/ui/Modal.js src/ui/WorldHud.js src/ui/HudView.js src/ui/SimulationHudView.js src/ui/ChartView.js src/main.js`

---

### Task 6: Authoritative facility validation, tidal generation, and technology gates

**Files:**
- Modify: `src/core/Constants.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/systems/PowerNetworkSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Create: `tests/e2e/unit/facility-tech.spec.js`
- Modify: `tests/e2e/unit/power-network.spec.js`
- Modify: `tests/e2e/unit/economy.spec.js`

**Interfaces:**
- Produces: `validatePlacement(state, facilityKey, index): ValidationResult`
- Produces: `validateUpgrade(state, index): ValidationResult`
- Updates: `placeFacility(index)` and `upgradeCell(index)` to call those validators first
- Adds: facility `tidal`

**Reason codes:** `not_editable`, `invalid_cell`, `occupied`, `locked_quest`, `locked_research`, `outer_ring_only`, `insufficient_credits`, `city_permit_required`, `technology_required`, `max_level`.

- [x] **Step 1: Write validator and tidal tests**

Assert card/ghost/build parity by calling `validatePlacement` and then `placeFacility` with unchanged state. Test tidal rejection on center and inner rings, acceptance on the current outer ring, cost 7C, 10E stable output at every hour/tick, zero carbon/water, and 0.3C/h upkeep. Test solar/wind/battery/tidal upgrades independently reject missing city permits, missing tech, or credits.

- [x] **Step 2: Run and confirm failure**

Run: `npx playwright test tests/e2e/unit/facility-tech.spec.js tests/e2e/unit/power-network.spec.js tests/e2e/unit/economy.spec.js`

- [x] **Step 3: Extend facility constants without hardcoded card copy**

Each facility definition gains normalized `economy`, `power`, `environment`, `labor`, `placement`, `unlock`, and `description` fields, or helper functions expose those views from existing constants. Add:

```js
tidal: {
  name: '조력발전', icon: '🌊', cost: 7,
  supply: 10, demand: 0, carbon: 0, water: 0,
  maxLevel: 3, placement: 'outer_ring',
  desc: '외곽 육각에서 일정한 저탄소 전력을 공급',
}
```

Add `tidal: { income: 0, upkeep: 0.3 }` to facility economy and include tidal in energy-source lists and asset mappings/fallbacks.

- [x] **Step 4: Implement shared validation**

`validatePlacement` checks, in order: editability, index existence in active coordinates, occupancy, quest unlock, research unlock, tidal ring, credits. It returns `{ ok, reason, facility, missingCredits, message }`. `validateUpgrade` first honors grandfathered legacy levels, then checks max level, city permit, energy technology level, and credits.

Refactor `selectFacility`, `placeFacility`, `upgradeCell`, and `demolishCell` to return their complete result payloads without emitting. `main.js` emits `BOARD_FACILITY_SELECTED`, `BOARD_PLACED`, `BOARD_UPGRADED`, or `BOARD_DEMOLISHED` exactly once after a successful command and emits `facility:commandRejected` after a rejected inspector command.

- [x] **Step 5: Run focused tests and diff check**

Run: `npx playwright test tests/e2e/unit/facility-tech.spec.js tests/e2e/unit/power-network.spec.js tests/e2e/unit/economy.spec.js`

Run: `git diff --check -- src/core/Constants.js src/systems/BoardSystem.js src/systems/PowerNetworkSystem.js src/systems/EconomySystem.js tests/e2e/unit/facility-tech.spec.js`

Expected: PASS.

---

### Task 7: Exactly 15 research-aware quests and quest celebration

**Files:**
- Modify: `src/core/QuestDefinitions.js`
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/systems/QuizSystem.js`
- Modify: `src/core/Constants.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/ui/QuestView.js`
- Modify: `src/ui/FeedbackBridge.js`
- Rename/replace: `src/ui/AchievementCelebration.js` → `src/ui/QuestCelebration.js`
- Modify: `tests/e2e/unit/quest.spec.js`
- Modify: `tests/e2e/unit/quest-quiz.spec.js`
- Modify: `tests/e2e/quest-ui.spec.js`
- Modify: `tests/e2e/visual.spec.js`

**Canonical campaign:**

| # | ID | Title | Completion | Reward |
|---:|---|---|---|---|
| 1 | `first-citizens` | 2040, 첫 시민 | 2 homes | 4C + thermal |
| 2 | `power-on` | 도시의 불을 켜라 | all homes ≥90% for 2h | 5C + factory |
| 3 | `jobs-and-tax` | 일자리와 세금 | profitable factory adjacent to generation for 2h | 6C + data center |
| 4 | `research-seed` | 연구도시의 씨앗 | data center ≥90% for 2h | 8C + nuclear + research menu |
| 5 | `growth-cost` | 성장의 숨은 비용 | pollution/upkeep quiz | 8C + cooling |
| 6 | `risk-map` | 위험 지도 | find 3 risks | 14C + radius 3 + solar |
| 7 | `cooling-loop` | 냉각 회로 | linked data/cooling operate for 2h | 6C + battery |
| 8 | `solar-efficiency` | 태양의 효율 | renewable quiz + solar2 research + one solar Lv.2 | 8C + wind |
| 9 | `storage-hub` | 7칸 저장 허브 | route cumulative 8E low-carbon through a battery | 8C + green |
| 10 | `wind-forecast` | 바람을 예측하다 | wind2 research + one wind Lv.2 | 10C + general Lv.2 permit |
| 11 | `living-neighborhood` | 숨 쉬는 생활권 | home-green adjacency + positive net for 3h | 10C |
| 12 | `extreme-heat` | 극한 폭염 | essential supply ≥90% during heat for 3h | 10C |
| 13 | `night-grid` | 긴 밤의 전력망 | night storage ≥5E and stable supply for 3h | 12C + Lv.3 permit |
| 14 | `low-carbon-water` | 저탄소 물순환 도시 | ≥70% low carbon, water below baseline, positive net for 4h | 14C |
| 15 | `climate-council` | 기후시민위원회 | final operations quiz | final report |

This table intentionally removes the duplicated quest 4 row in the design document and renames the square-era “8-direction” quest to the approved center-plus-six-neighbors rule. There are still exactly 15 entries.

- [x] **Step 1: Rewrite tests from the canonical table**

Use table-driven unit tests for every completion threshold, reset-on-failure behavior, reward amount, unlock, grid expansion, research menu unlock, and permit. Quest 8 must require all three conditions; quiz alone is insufficient. Quest 10 must require both research and upgrade. Quest 14 must use four consecutive hours. Keep one-emergency-support-per-quest behavior at 1C or less.

- [x] **Step 2: Run and confirm failures**

Run: `npx playwright test tests/e2e/unit/quest.spec.js tests/e2e/unit/quest-quiz.spec.js tests/e2e/quest-ui.spec.js`

- [x] **Step 3: Make definitions self-describing**

Each quest contains `id`, `index`, `title`, `goal`, `reward`, `progressKind`, and optional `quizKind`. Remove the duplicated `GOALS` array from `QuestView`; the view reads `quest.goal` and formats structured rewards.

- [x] **Step 4: Implement progress using the shared hex/research state**

`applySimulationQuestProgress(state, summary)` reads research completion and current facility levels but never starts research or upgrades automatically. It returns `{ becameReady, quest, progress }`; `main.js` emits `QUEST_PROGRESSED` and, only on the false-to-true transition, `QUEST_READY`. `evaluateCurrentQuest` handles immediate conditions and quiz completion. Claim/quiz commands return payloads without emitting, and `main.js` emits each result exactly once. Claiming quest 6 calls the radius expansion command; claiming quest 4 sets `researchMenuUnlocked`.

Add `QUEST_CLAIM_REQUESTED`, `QUIZ_START_REQUESTED`, `QUIZ_ANSWER_REQUESTED`, `QUIZ_ADVANCE_REQUESTED`, and `QUIZ_RETRY_REQUESTED`. `QuestView` renders state and emits these requests; it no longer imports `QuestSystem`, `QuizSystem`, or `BoardSystem`. `main.js` owns command calls, emits existing result events, applies board expansion after quest 6, and passes result payloads back to the view.

- [x] **Step 5: Replace badge effects with quest effects**

`QuestCelebration` listens to `QUEST_CLAIMED`, shows one pooled burst/card, announces the reward via `aria-live`, and hides after `QUEST_CELEBRATION_MS`. `QUEST_READY` raises a persistent notification on quests navigation; claiming clears it. There is no badge state or notification.

- [x] **Step 6: Remove AI-specific quiz content**

Delete `verification-question` and AI framing. Keep or rewrite questions around power balance, pollution/upkeep, cooling, renewable variability/storage, transmission distance, and operational tradeoffs. Quiz feedback remains educational but never asks the player to fill “evidence.”

- [x] **Step 7: Run focused tests and diff check**

Run: `npx playwright test tests/e2e/unit/quest.spec.js tests/e2e/unit/quest-quiz.spec.js tests/e2e/quest-ui.spec.js tests/e2e/visual.spec.js`

Run: `git diff --check -- src/core/QuestDefinitions.js src/systems/QuestSystem.js src/systems/QuizSystem.js src/ui/QuestView.js src/ui/FeedbackBridge.js src/ui/QuestCelebration.js`

Expected: PASS; the old achievement snapshot is replaced with a quest-completion snapshot.

---

### Task 8: First-run story and action-driven tutorial

**Files:**
- Create: `src/ui/OnboardingView.js`
- Create: `tests/e2e/onboarding.spec.js`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/core/Constants.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/main.js`
- Modify: `src/ui/WorldHud.js`

**Interfaces:**
- Produces: `initOnboardingView({ root, state, emit })`
- Produces: `showStory({ replay = false })`
- Produces: `syncTutorial(state, hudState): TutorialStep`
- Produces: `disposeOnboardingView()`

- [x] **Step 1: Write the full first-run browser flow**

The test clears storage, loads the game, and asserts:

- story page 1/3 mentions 2040, heat, power, and water crisis;
- next reaches operator/10C page 2 and low-carbon transition page 3;
- simulation has pause reason `story` until the last page closes;
- closing stores `onboardingVersionSeen === ONBOARDING_VERSION`;
- the build action is highlighted first;
- opening build advances highlight to residential card;
- selecting residential advances highlight to a hex cell/ghost instruction;
- placing two homes advances to calendar/speed, then to claim reward;
- reload does not auto-show the story;
- settings “스토리 다시 보기” replays without changing credits, grid, quest, or research.

- [x] **Step 2: Run and confirm failure**

Run: `npx playwright test tests/e2e/onboarding.spec.js`

- [x] **Step 3: Add semantic story markup and constants**

Use a dedicated full-screen root, not the generic card modal, so story layout can fill the viewport while still emitting `ui:modalOpen` with `pauseReason: 'story'`. Add `ONBOARDING_VERSION`, exact page copy from the spec, and stable `data-story-page` selectors.

- [x] **Step 4: Implement event-driven tutorial progression**

The tutorial listens to `HUD_PANEL_CHANGED`, `BOARD_FACILITY_SELECTED`, `BUILD_PREVIEW_CHANGED`, `BOARD_PLACED`, `SIMULATION_TICKED`, and `QUEST_READY/CLAIMED`. It derives the next incomplete step from actual state every time, so migrated or fast-playing users skip already-completed instructions. Highlighting uses a single overlay/callout and `data-tutorial-active`; it never captures canvas input except its own dismiss button.

- [x] **Step 5: Wire replay through settings and persist progress**

Add `ONBOARDING_REPLAY_REQUESTED: 'onboarding:replayRequested'` and `ONBOARDING_STEP_CHANGED: 'onboarding:stepChanged'`. Settings emits the replay request; the orchestrator calls `showStory({ replay: true })`. Only automatic first display writes the current version on completion; replay does not reset tutorial or game state.

- [x] **Step 6: Run focused tests and accessibility check**

Run: `npx playwright test tests/e2e/onboarding.spec.js tests/e2e/mobile.spec.js`

Verify focus starts on the story heading, stays within story controls, and returns to the prior settings button after replay.

- [x] **Step 7: Review the diff without staging**

Run: `git diff --check -- index.html src/style.css src/ui/OnboardingView.js src/core/Constants.js src/core/EventBus.js src/main.js tests/e2e/onboarding.spec.js`

---

### Task 9: Expanded build cards, one reusable ghost, and mobile confirmation

**Files:**
- Modify: `src/ui/DockView.js`
- Modify: `src/ui/GridView.js`
- Modify: `src/ui/CityScene3D.js`
- Modify: `src/ui/WorldHud.js`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `tests/e2e/hud.spec.js`
- Modify: `tests/e2e/mobile.spec.js`
- Modify: `tests/e2e/motion.spec.js`
- Modify: `tests/e2e/perf.spec.js`

**Preview contract:**

```js
{
  facilityKey,
  index,
  valid,
  reason,
  message,
  goodNeighborIndices: number[],
  badNeighborIndices: number[],
}
```

- [x] **Step 1: Write card, desktop preview, cleanup, and mobile tests**

Assert every unlocked/locked card renders cost, income/upkeep, generation/demand, carbon, water, workforce/jobs, adjacency description, and lock reason. A 3C player cannot select a 5C facility. Desktop pointer movement over an empty hex shows the correct registered model at the same transform as Lv.1; valid is teal and invalid is red. Closing build, deselecting, pointer leave, placing, opening another panel, and reset all hide the ghost and good/bad tiles. On mobile, first tap previews, a separate confirm button builds, cancel clears, and changing cell moves the one candidate.

- [x] **Step 2: Run tests and record baseline renderer counts**

Run: `npx playwright test tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/motion.spec.js tests/e2e/perf.spec.js`

Before implementation, record `window.__getCityRendererStats()` for an idle 19-cell city and while pointer-moving across ten cells.

- [x] **Step 3: Render all cards from normalized facility data**

Locked facilities stay visible in quest/research order with a disabled state and exact unlock copy. Affordability uses `validatePlacement` with an otherwise empty eligible cell or a dedicated `validateFacilitySelection` wrapper built from the same reason helper. Do not duplicate prices or stat formulas in HTML.

- [x] **Step 4: Add preview events and one ghost object**

Add:

```js
BUILD_PREVIEW_REQUESTED: 'build:previewRequested',
BUILD_PREVIEW_CHANGED: 'build:previewChanged',
BUILD_PREVIEW_CLEARED: 'build:previewCleared',
BUILD_CONFIRM_REQUESTED: 'build:confirmRequested',
BOARD_FACILITY_SELECT_REQUESTED: 'board:facilitySelectRequested',
```

`DockView` emits the facility-selection request and no longer imports the mutating BoardSystem command. `main.js` validates selection, calls `selectFacility`, and emits `BOARD_FACILITY_SELECTED`; it also validates and emits preview results. `CityScene3D` creates one ghost group, swaps its primitive references only when the selected facility changes, clones shared ghost materials once per primitive, and otherwise updates matrix/color/visibility only. Pointer movement inside the same cell is ignored.

- [x] **Step 5: Keep model load and render cost bounded**

Use the asset cache from the asset plan. While a GLB is pending, show the facility’s code fallback; replace it once when ready. Never call `loader.load` from `pointermove`. The renderer count test must show no monotonic scene-child/material growth after 100 alternating previews.

- [x] **Step 6: Implement mobile candidate/confirm flow**

`getWorldHudState().mobile` chooses candidate mode. `onCellClick` no longer calls `placeFacility` immediately on mobile; it emits preview, opens a compact confirmation sheet showing cost/reason/effects, and requires confirm. Desktop click still places only while build is open and a selectable facility is active.

- [x] **Step 7: Run tests and compare performance**

Run: `npx playwright test tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/motion.spec.js tests/e2e/perf.spec.js`

Expected: all pass; idle render behavior remains render-on-demand, one ghost exists, and renderer resources return to baseline after clear.

- [x] **Step 8: Review the diff without staging**

Run: `git diff --check -- src/ui/DockView.js src/ui/GridView.js src/ui/CityScene3D.js src/ui/WorldHud.js src/main.js src/style.css`

---

### Task 10: Data-center inspector research UI and live non-pausing details

**Files:**
- Create: `src/ui/ResearchView.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Create: `tests/e2e/research-ui.spec.js`
- Modify: `tests/e2e/nonpausing-panels.spec.js`

**UI states:** `locked`, `available`, `insufficient_credits`, `prerequisite_locked`, `active_powered`, `active_underpowered`, `active_unassigned`, `completed`.

- [x] **Step 1: Write browser research flow**

Set a deterministic quest-4+ state with two data centers. Open the first inspector and assert Overview/Research tabs, complete live facility values, and no simulation pause. Start solar research, assert 8C is charged and +2E appears in demand after settlement. Drop assigned power below 90%, settle, and assert progress stays fixed with `전력 부족`. Restore power and assert progress increases. Demolish the assigned data center and assert `담당 시설 없음`; assign the second and resume. Cancel battery research and assert floor-50% refund. Complete research through a test hook and assert notification, tech level, card state, and saved state.

- [x] **Step 2: Run and confirm failure**

Run: `npx playwright test tests/e2e/research-ui.spec.js tests/e2e/nonpausing-panels.spec.js`

- [x] **Step 3: Split inspector shell from research content**

The facility inspector remains a non-pausing modal/panel with stable ID `facility-inspector`. Its Overview tab shows current income, upkeep, demand/supply ratio, carbon, water, workforce/jobs, adjacency, investment/refund/loss, priority, and upgrade lock reason. The Research tab exists only for data centers and shows research even if this data center is not currently assigned.

- [x] **Step 4: Make the view command-only**

`ResearchView` renders from state/definitions and emits start/cancel/assign request events. It never imports `ResearchSystem`. `main.js` handles commands, emits success/failure events, refreshes once, requests save, and keeps the inspector open. Failed commands show the exact reason near the button and in an accessible live region.

Apply the same boundary to the inspector shell: add `FACILITY_UPGRADE_REQUESTED`, `FACILITY_DEMOLISH_REQUESTED`, and `FACILITY_PRIORITY_REQUESTED`. `StageModals` no longer imports mutating BoardSystem commands; `main.js` executes them, emits `BOARD_UPGRADED`, `BOARD_DEMOLISHED`, or `FACILITY_PRIORITY_CHANGED`, and passes failures back as `facility:commandRejected`.

- [x] **Step 5: Refresh open live panels after each settlement**

Track the inspected cell index. After `SIMULATION_TICKED`, update only numeric/status nodes or rerender the inspector while preserving active tab and focus. Do not close/reopen the modal and do not emit pause events.

- [x] **Step 6: Run focused tests and diff check**

Run: `npx playwright test tests/e2e/research-ui.spec.js tests/e2e/nonpausing-panels.spec.js tests/e2e/unit/research.spec.js`

Run: `git diff --check -- src/ui/ResearchView.js src/ui/StageModals.js src/main.js src/style.css tests/e2e/research-ui.spec.js`

Expected: PASS.

---

### Task 11: Settings guide, obsolete-system removal, and public test contract

**Files:**
- Modify: `src/ui/StageModals.js`
- Modify: `src/main.js`
- Modify: `src/core/Constants.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/core/GameState.js`
- Modify: `src/systems/ReportSystem.js`
- Delete: `src/systems/AdvisorSystem.js`
- Delete: `src/systems/AchievementSystem.js`
- Delete: `src/ui/PanelViews.js`
- Delete after Task 7 rename: `src/ui/AchievementCelebration.js`
- Modify: `tests/e2e/game.spec.js`
- Modify: `tests/e2e/unit/campaign-report.spec.js`
- Modify: `tests/e2e/assets.spec.js`

- [x] **Step 1: Write absence, guide, and text-contract tests**

Assert the production bundle and runtime contain no advisor/auto-build/evidence/achievement UI or state keys. Settings guide must describe calendar/economy, six-neighbor hex placement, distance loss, seven-cell storage hub, pollution/overcrowding penalty, research, and 50% demolition refund. `render_game_to_text()` must include coordinate system, mode, quest, calendar, time scale, credits/delta, axial entities, visible preview, power, research, and climate, but no badges, evidence, AI, dev score, or square grid description.

- [x] **Step 2: Run and confirm failures**

Run: `npx playwright test tests/e2e/game.spec.js tests/e2e/unit/campaign-report.spec.js tests/e2e/assets.spec.js`

- [x] **Step 3: Add static guide and story replay actions**

`openHelpModal` becomes `openOperationsGuide` with `pauseReason: null`. Correct the old “8방향” text to “중심+인접 6칸”. Reset confirmation text lists city, quests, research, and operational totals—not achievements.

- [x] **Step 4: Remove obsolete imports, events, constants, state, files, and CSS selectors**

Use `rg` before deletion:

Run: `rg -n "Advisor|Achievement|ADVISOR_|AI_BLIND|BADGE_|BADGES|advisor|achievement|evidence|transcript" src index.html tests/e2e`

Remove only product concepts. Do not blindly remove Korean quiz text containing legitimate general words such as “검증”; rewrite based on game mechanics.

- [x] **Step 5: Update the text renderer**

The compact payload uses:

```js
{
  coords: 'pointy-top axial hex; index maps to {q,r}; world x/z from HexGridSystem',
  mode: 'playing',
  quest: { index, status },
  calendar: calendarAtElapsedHour(state.elapsedGameHours),
  timeScale,
  credits,
  lastSettlementDelta,
  boardRadius,
  entities: [{ index, q, r, type, level }],
  preview: null | { index, facilityKey, valid, reason },
  power: { delivered, demand, lowCarbonPercent },
  research: { active, completedIds, techLevels },
  climateAlert,
}
```

- [x] **Step 6: Run focused tests and check for stale code**

Run: `npx playwright test tests/e2e/game.spec.js tests/e2e/unit/campaign-report.spec.js tests/e2e/assets.spec.js`

Run: `rg -n "AdvisorSystem|AchievementSystem|PanelViews|AchievementCelebration|AI_BLIND|ADVISOR_|BADGE_|badges|advisorQuestions|transcripts|evidence" src index.html`

Expected: no matches except an intentional migration-strip key list in `SaveSystem.js` and test assertions verifying absence.

- [x] **Step 7: Review the diff without staging**

Run: `git diff --check -- src index.html tests/e2e/game.spec.js tests/e2e/unit/campaign-report.spec.js`

---

### Task 12: Integrated QA, visual/performance gate, and progress handoff

**Files:**
- Modify: `tests/e2e/visual.spec.js`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/assets.spec.js`
- Modify: `progress.md`
- Update only when intentionally accepted: `tests/e2e/visual.spec.js-snapshots/*.png`

- [x] **Step 1: Run deterministic unit suites**

Run:

```bash
npx playwright test \
  tests/e2e/unit/calendar.spec.js \
  tests/e2e/unit/state-v4.spec.js \
  tests/e2e/unit/research.spec.js \
  tests/e2e/unit/facility-tech.spec.js \
  tests/e2e/unit/hex-grid.spec.js \
  tests/e2e/unit/hex-board-rules.spec.js \
  tests/e2e/unit/power-network.spec.js \
  tests/e2e/unit/economy.spec.js \
  tests/e2e/unit/simulation.spec.js \
  tests/e2e/unit/quest.spec.js \
  tests/e2e/unit/quest-quiz.spec.js
```

Expected: PASS.

- [x] **Step 2: Run gameplay/UI suites**

Run:

```bash
npx playwright test \
  tests/e2e/onboarding.spec.js \
  tests/e2e/nonpausing-panels.spec.js \
  tests/e2e/research-ui.spec.js \
  tests/e2e/game.spec.js \
  tests/e2e/hud.spec.js \
  tests/e2e/mobile.spec.js \
  tests/e2e/quest-ui.spec.js \
  tests/e2e/camera.spec.js \
  tests/e2e/motion.spec.js \
  tests/e2e/assets.spec.js
```

Expected: PASS with zero page errors and zero unexpected console errors.

- [x] **Step 3: Capture and inspect representative screens**

Capture desktop 1440×900 and mobile 390×844 for:

- story page 1 and page 3;
- normal light and dark world HUD;
- build panel with full cards and valid ghost;
- invalid tidal ghost on inner ring;
- city status panel;
- data-center research available/underpowered/completed;
- quest-ready and quest-completion effect;
- radius-3 city with selected CC0 assets.

Inspect screenshots manually for readable Korean text, no overlap, adequate light/dark contrast, safe-area spacing, canvas dominance, correct ghost footprint, and no clipped panels. Update snapshots only after explaining each intentional difference in `progress.md`.

- [x] **Step 4: Run performance and asset audit gates**

Run: `npx playwright test tests/e2e/perf.spec.js tests/e2e/visual.spec.js`

Run: `npm run audit:assets`

Verify:

- idle scene does not render continuously;
- 100 ghost moves create one ghost group and no increasing geometry/material count;
- 37-cell board stays within current renderer memory/draw-call thresholds established by the perf plan;
- no new citizens/cars are spawned per facility beyond existing caps;
- birds remain pooled and visit every 10–30 seconds;
- public 3D assets target ≤12MB, critical assets target ≤3MB, with any exception documented rather than hidden.

- [x] **Step 5: Run the full suite and production build**

Run: `npm test`

Run: `npm run build`

Expected: all tests pass and Vite production build succeeds.

- [x] **Step 6: Inspect browser runtime**

Start the app locally and inspect one fresh game plus one migrated-save game. Confirm the browser console has no GLTF, Meshopt, missing asset, event listener, WebGL, or accessibility errors. Confirm inspector-open income changes over at least two settlements at 1×.

- [x] **Step 7: Update `progress.md`**

Record:

- original requirements and the three-plan dependency order;
- final 15 quest table and balance values;
- save v4 migration behavior;
- exact official asset sources, selected counts, total/critical bytes, and manual-download items;
- test/build commands and results;
- visual/performance observations;
- known non-blocking loose ends;
- explicit statement: no commit, push, deploy, staging, or remote mutation performed.

- [x] **Step 8: Final diff and repository safety check**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --stat`

Expected: no whitespace errors. Review the dirty tree without staging or discarding any user-owned changes.

## Completion Criteria

- All 12 tasks and their focused tests are complete.
- New game starts with the story at 2040-01-01 08:00 and 10C.
- Calendar, 0/1/2/4× controls, credits, power, and climate are the only top operational HUD data.
- Non-pausing panels no longer stop income; explicit pause screens still pause independently.
- Research follows cost, prerequisite, +2E demand, ≥90% power, speed, pause, reassignment, cancellation, and completion rules.
- Exactly 15 quests gate facilities/features and culminate in the final report.
- Build cards and one reusable desktop/mobile ghost use the same placement validator as construction.
- Tidal generation and renewable upgrade technology gates behave as specified.
- AI/evidence/achievement product features and stale state are absent.
- Light/dark desktop and mobile layouts keep the 3D world dominant.
- Full tests, build, visual review, performance checks, asset audit, and runtime console review pass.
- No Git commit, stage, push, deployment, PR, or remote mutation occurs.
