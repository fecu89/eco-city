# Korean Climate Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly requests delegation.

**Goal:** Convert the simulation to one game day per real second, replace the post-tutorial objective loop with eight required Korean climate scenarios, add guaranteed tidal and optional green-space research progression, rebalance workforce, and finish with a stronger 41-day composite climate test.

**Architecture:** Replace hourly clock fields with day-based fields while preserving every numeric duration and the one-second 1× settlement interval. Keep `questIndex` as the single 1–15 campaign cursor. Add a focused climate-campaign definition module and lifecycle system, while routing both individual events and the final stress test through one data-driven climate modifier core.

**Tech Stack:** JavaScript ES modules, Three.js 0.185.1, Vite 8.2.2, Playwright Test 1.62.1, DOM/CSS HUD.

**Spec:** `docs/superpowers/specs/2026-09-01-korean-climate-campaign-design.md`

## Global Constraints

- Never run `git add`, `git commit`, `git push`, create branches/worktrees, or deploy; this repository is not owned by the user.
- Preserve all unrelated dirty-worktree changes and edit files only with `apply_patch`.
- All simulation timing uses Game Clock: pause stops climate, research, construction, and stress progress; 2×/4× accelerates all equally.
- At 1× one real second advances exactly one game day; 2× uses 0.5 seconds and 4× uses 0.25 seconds.
- Preserve duration numbers while renaming their unit: 8 hours becomes 8 days and still takes 8 real seconds at 1×.
- Display all resource rates per day (`/일`), never per hour (`/h`).
- Normal solar output uses the former hourly curve's daily average multiplier `11/24`; graphical day/dusk/night settings never affect production.
- Keep `questIndex` as the sole visible 1–15 campaign index; legacy objective-set state is migration input only.
- Individual climate quests receive a 24-game-day forecast and do not overlap random events.
- Final test duration is exactly 41 game days.
- Final carbon rules are: average ≤8/day, at least 35 of 41 days ≤8/day, at most 3 days >10/day.
- Green Lv.3 and residential Lv.3 must not be required for campaign completion.
- Tidal research, one completed tidal facility, and actual tidal delivery are required before final-test entry.
- UI values must be derived from shared definitions and live calculations; do not duplicate numeric rules in templates.
- New climate HUD uses DOM updates and must not introduce a continuous WebGL render loop.

---

## File Structure

### New files

- `src/core/ClimateCampaignDefinitions.js` — quest 7–14 lifecycle metadata, target values, rewards, and the final-test entry predicate.
- `src/systems/ClimateModifierSystem.js` — pure conversion from an event/phase definition to per-facility and city modifiers.
- `src/systems/ClimateQuestSystem.js` — briefing, preparation, active, result, retry, and completion state for quests 7–14.
- `tests/e2e/unit/daily-clock.spec.js` — day-based calendar, interval, solar average, duration, and naming contracts.
- `tests/e2e/unit/climate-campaign-definitions.spec.js` — campaign order and numeric-contract tests.
- `tests/e2e/unit/climate-modifiers.spec.js` — all training and final climate modifier tests.
- `tests/e2e/unit/climate-quests.spec.js` — lifecycle, target, reward, retry, and tidal-gate tests.
- `tests/e2e/unit/state-v8.spec.js` — v7→v8 migration and round-trip tests.
- `tests/e2e/climate-campaign-ui.spec.js` — forecast, quest panel, research locks, and result UI.

### Modified definition/state files

- `src/core/Constants.js`
- `src/core/EventBus.js`
- `src/core/EventDefinitions.js`
- `src/core/GameState.js`
- `src/core/QuestDefinitions.js`
- `src/core/ResearchDefinitions.js`
- `src/core/ResearchQuizDefinitions.js`
- `src/systems/SaveSystem.js`

### Modified simulation/gameplay files

- `src/systems/BoardSystem.js`
- `src/systems/CityEventSystem.js`
- `src/systems/CalendarSystem.js`
- `src/systems/ClimateSystem.js`
- `src/systems/CityModifierSystem.js`
- `src/systems/FacilityOperationSystem.js`
- `src/systems/QuestSystem.js`
- `src/systems/ResearchSystem.js`
- `src/systems/SimulationForecastSystem.js`
- `src/systems/SimulationSystem.js`
- `src/systems/StressTestSystem.js`
- `src/systems/WorkforceSystem.js`
- `src/main.js`

### Modified presentation files

- `src/ui/CityScene3D.js`
- `src/ui/ContinuousClockView.js`
- `src/ui/DockView.js`
- `src/ui/EventResultView.js`
- `src/ui/FeedbackBridge.js`
- `src/ui/ForecastView.js`
- `src/ui/HudView.js`
- `src/ui/QuestView.js`
- `src/ui/ResearchView.js`
- `src/ui/SimulationHudView.js`
- `src/ui/StageModals.js`
- `src/style.css`

### Modified regression/documentation files

- `tests/helpers/playthrough.js`
- `tests/e2e/gameplay-redesign.spec.js`
- `tests/e2e/objectives-ui.spec.js`
- `tests/e2e/quest-ui.spec.js`
- `tests/e2e/event-forecast.spec.js`
- `tests/e2e/research-ui.spec.js`
- `tests/e2e/stress-test-ui.spec.js`
- `tests/e2e/unit/campaign-playthrough.spec.js`
- `tests/e2e/unit/quest-feasibility.spec.js`
- `tests/e2e/unit/research.spec.js`
- `tests/e2e/unit/stress-test.spec.js`
- `tests/e2e/unit/workforce.spec.js`
- `progress.md`
- `docs/tech.md`

---

### Task 1: Lock the campaign and climate data contracts

**Files:**
- Create: `src/core/ClimateCampaignDefinitions.js`
- Create: `tests/e2e/unit/climate-campaign-definitions.spec.js`
- Modify: `src/core/QuestDefinitions.js`

**Interfaces:**
- Produces: `CLIMATE_QUESTS`, `CLIMATE_QUEST_ORDER`, `CLIMATE_EVENT_DEFINITIONS`, `FINAL_CLIMATE_PHASES`, `climateQuestByIndex(index)`.
- Leaves the live pre-migration `EventDefinitions` module untouched until Task 2 completes the day-clock migration; Tasks 5 and 8 route the new data into runtime events and stress phases.
- Preserves: `QUESTS`, `QUEST_COUNT` export names.

- [ ] **Step 1: Write the failing definition contract**

```js
import { test, expect } from '@playwright/test';
import {
  CLIMATE_EVENT_DEFINITIONS, CLIMATE_QUEST_ORDER, CLIMATE_QUESTS, FINAL_CLIMATE_PHASES,
} from '../../../src/core/ClimateCampaignDefinitions.js';
import { QUESTS } from '../../../src/core/QuestDefinitions.js';

test('campaign contains six foundations, eight Korean climates, and one final test', () => {
  expect(QUESTS).toHaveLength(15);
  expect(CLIMATE_QUEST_ORDER).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
  expect(CLIMATE_QUEST_ORDER.map((index) => CLIMATE_QUESTS[index].eventType)).toEqual([
    'heatwave', 'monsoon', 'typhoon', 'coldWave',
    'drought', 'stagnantAir', 'dryWildfire', 'stormSurge',
  ]);
  expect(Object.keys(CLIMATE_EVENT_DEFINITIONS)).toEqual([
    'heatwave', 'monsoon', 'typhoon', 'coldWave',
    'drought', 'stagnantAir', 'dryWildfire', 'stormSurge',
  ]);
  expect(FINAL_CLIMATE_PHASES.reduce((sum, phase) => sum + phase.durationDays, 0)).toBe(41);
});

test('tidal and green unlocks are explicit campaign rewards', () => {
  expect(CLIMATE_QUESTS[7].reward).toMatchObject({ unlockFacilities: ['battery'], upgradePermitLevel: 2 });
  expect(CLIMATE_QUESTS[12].reward).toMatchObject({ unlockResearch: ['tidal1'] });
  expect(CLIMATE_QUESTS[13].reward).toMatchObject({ unlockResearch: ['green3'] });
  expect(CLIMATE_QUESTS[14].entry).toMatchObject({ facility: 'tidal', research: 'tidal1' });
});
```

- [ ] **Step 2: Run the contract and observe missing exports**

Run: `npx playwright test tests/e2e/unit/climate-campaign-definitions.spec.js --workers=1`

Expected: FAIL because `ClimateCampaignDefinitions.js` and the new event IDs do not exist.

- [ ] **Step 3: Add the exact campaign definitions**

Implement immutable entries with this public shape:

```js
export const CLIMATE_QUESTS = Object.freeze({
  7: Object.freeze({ index: 7, eventType: 'heatwave', forecastDays: 24, targetDays: 4,
    objective: 'essential', reward: Object.freeze({ credits: 8, unlockFacilities: ['battery'], unlockResearch: ['green2'], upgradePermitLevel: 2 }) }),
  8: Object.freeze({ index: 8, eventType: 'monsoon', forecastDays: 24, targetDays: 4,
    objective: 'battery', batteryTarget: 4, reward: Object.freeze({ credits: 8, unlockFacilities: ['wind'] }) }),
  9: Object.freeze({ index: 9, eventType: 'typhoon', forecastDays: 24, targetDays: 4,
    objective: 'diversity', generationTypeTarget: 2, reward: Object.freeze({ credits: 10 }) }),
  10: Object.freeze({ index: 10, eventType: 'coldWave', forecastDays: 24, targetDays: 4,
    objective: 'winter', reward: Object.freeze({ credits: 10 }) }),
  11: Object.freeze({ index: 11, eventType: 'drought', forecastDays: 24, targetDays: 4,
    objective: 'water', reward: Object.freeze({ credits: 10 }) }),
  12: Object.freeze({ index: 12, eventType: 'stagnantAir', forecastDays: 24, targetDays: 4,
    objective: 'cleanAir', carbonTarget: 8, reward: Object.freeze({ credits: 12, unlockResearch: ['tidal1'] }) }),
  13: Object.freeze({ index: 13, eventType: 'dryWildfire', forecastDays: 24, targetDays: 4,
    objective: 'wildfire', carbonTarget: 8, reward: Object.freeze({ credits: 12, unlockResearch: ['green3'] }) }),
  14: Object.freeze({ index: 14, eventType: 'stormSurge', forecastDays: 24, targetDays: 4,
    objective: 'tidal', tidalEnergyTarget: 8, entry: Object.freeze({ research: 'tidal1', facility: 'tidal' }),
    reward: Object.freeze({ credits: 14, stressTest: true }) }),
});
```

Define all eight immutable `CLIMATE_EVENT_DEFINITIONS` with the exact durations and modifiers in the spec. Define immutable final phases as `baseline(3)`, `heatDome(6)`, `monsoonFront(5)`, `coastalSuperstorm(6)`, `winterDisaster(6)`, `stagnantAir(5)`, `dryEmergency(5)`, `recovery(5)`. Tasks 5 and 8 expose them through the legacy runtime export names after the daily clock exists.

- [ ] **Step 4: Replace unreachable quest 7–15 copy**

Keep quest 1–6 definitions unchanged. Rebuild quest 7–14 titles, goals, details, and rewards from `CLIMATE_QUESTS`. Make quest 15 `대한민국 복합기후 시험` and remove the old final mandatory quiz. Preserve the optional post-test quiz path.

- [ ] **Step 5: Run definition tests and syntax checks**

Run: `npx playwright test tests/e2e/unit/climate-campaign-definitions.spec.js --workers=1`

Expected: PASS without requiring the live event or simulation modules to change yet.

- [ ] **Step 6: Local checkpoint without Git writes**

Run: `git diff --check -- src/core/ClimateCampaignDefinitions.js src/core/QuestDefinitions.js tests/e2e/unit/climate-campaign-definitions.spec.js`

Expected: no output. Do not stage or commit.

---

### Task 2: Convert the simulation clock to days and add save v8

**Files:**
- Create: `tests/e2e/unit/daily-clock.spec.js`
- Create: `tests/e2e/unit/state-v8.spec.js`
- Modify: `src/core/Constants.js`
- Modify: `src/core/GameState.js`
- Modify: `src/core/EventDefinitions.js`
- Modify: `src/core/ResearchDefinitions.js`
- Modify: `src/systems/CalendarSystem.js`
- Modify: `src/systems/ClimateSystem.js`
- Modify: `src/systems/ConstructionProjectSystem.js`
- Modify: `src/systems/ResearchSystem.js`
- Modify: `src/systems/SaveSystem.js`
- Modify: `src/systems/SimulationForecastSystem.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/ui/ContinuousClockView.js`
- Modify: `src/ui/SimulationHudView.js`
- Modify: all source/test call sites containing persisted `Hours` progress names or `/h` display units

**Interfaces:**
- Produces: `calendarAtElapsedDay(elapsedGameDays)` and `intervalForTimeScale(scale)`.
- Produces: `getDailySolarMultiplier()` returning `11 / 24` and preserves `getWindMultiplier(tickIndex)` as a four-day pattern.
- Produces: `createDaySettler(...)`; `createHourSettler` is removed.
- Produces: `createClimateCampaignState()` through the GameState default and `migrateV7ToV8(data)`.
- Canonical time fields: `elapsedGameDays`, `durationDays`, `elapsedDays`, `simulationTotals.days`, `dailyCarbon`, `dailyWater`.

- [ ] **Step 1: Write the daily clock contract**

```js
import { test, expect } from '@playwright/test';
import { calendarAtElapsedDay, intervalForTimeScale } from '../../../src/systems/CalendarSystem.js';
import { getDailySolarMultiplier, getWindMultiplier } from '../../../src/systems/ClimateSystem.js';

test('one tick represents one calendar day while real intervals stay unchanged', () => {
  expect(calendarAtElapsedDay(0)).toMatchObject({ year: 2040, month: 1, day: 1, elapsedGameDays: 0 });
  expect(calendarAtElapsedDay(1)).toMatchObject({ year: 2040, month: 1, day: 2, elapsedGameDays: 1 });
  expect(intervalForTimeScale(1)).toBe(1000);
  expect(intervalForTimeScale(2)).toBe(500);
  expect(intervalForTimeScale(4)).toBe(250);
});

test('solar uses the previous curve daily average and lighting cannot change it', () => {
  expect(getDailySolarMultiplier()).toBeCloseTo(11 / 24, 8);
  expect([0, 1, 2, 3].map(getWindMultiplier)).toEqual([0.6, 0.9, 1.1, 0.75]);
});
```

- [ ] **Step 2: Write day-based project, research, settlement, and UI failures**

```js
test('one settlement advances one day and applies resources once', () => {
  const state = new GameState();
  createDaySettler(dependencies)(state);
  expect(state.elapsedGameDays).toBe(1);
  expect(state.lastTickSummary).toMatchObject({ dayIndex: 1, dailyCarbon: 0, dailyWater: 0 });
});

test('duration numbers keep the same real completion time', () => {
  expect(createBuildProject({ type: 'factory', paidCost: 4 })).toMatchObject({ durationDays: 8, elapsedDays: 0 });
  expect(RESEARCH.solar2).toMatchObject({ durationDays: 120, realMinutesAt1x: 2 });
});
```

Add a browser assertion that the HUD contains `/일`, a construction project contains `남은 8일`, and no visible `[data-rate]`/project/research element contains `/h` or `시간`.

- [ ] **Step 3: Run and verify the old hourly contracts fail**

Run: `npx playwright test tests/e2e/unit/daily-clock.spec.js tests/e2e/unit/simulation.spec.js tests/e2e/continuous-clock.spec.js --workers=1`

Expected: FAIL because the calendar, settler, state fields, and labels are hourly.

- [ ] **Step 4: Rename the core constants and state fields**

Apply these exact mappings across source and tests:

```text
SIMULATION.HOUR_MS                  → SIMULATION.DAY_MS
TIME.BASE_HOUR_MS                  → TIME.BASE_DAY_MS
CALENDAR.MS_PER_GAME_HOUR          → CALENDAR.MS_PER_GAME_DAY
CONSTRUCTION.BUILD_HOURS           → CONSTRUCTION.BUILD_DAYS
CONSTRUCTION.UPGRADE_HOURS         → CONSTRUCTION.UPGRADE_DAYS
RESEARCH_RULES.GAME_HOURS_PER_REAL_MINUTE → GAME_DAYS_PER_REAL_MINUTE
RESEARCH_RULES.DURATION_HOURS      → DURATION_DAYS
EVENT_FORECAST_HOURS               → EVENT_FORECAST_DAYS
EVENT_GAP_HOURS                    → EVENT_GAP_DAYS
STRESS_TEST_RULES.PHASE_HOURS      → PHASE_DAYS
elapsedGameHours                   → elapsedGameDays
durationHours / elapsedHours       → durationDays / elapsedDays
hourlyCarbon / hourlyWater         → dailyCarbon / dailyWater
carbonCrisisHours                  → carbonCrisisDays
negativeCreditHours               → negativeCreditDays
essentialBlackoutHours             → essentialBlackoutDays
```

Rename corresponding result metrics, warning IDs, data attributes, formatter arguments, and test helpers. Keep numeric values unchanged. Remove persisted hourly aliases after migration so two clocks cannot diverge.

- [ ] **Step 5: Implement day calendar and daily renewable behavior**

`calendarAtElapsedDay(n)` adds `n * 86_400_000` milliseconds to 2040-01-01 UTC and returns no hour/minute fields. Replace `getSolarMultiplier(hour)` with the constant daily average `11/24`. Rename `getThreeHourForecast` to `getThreeDayForecast`; it returns the next three day indices with the constant solar average and deterministic wind values.

Keep `WORLD_LIGHTING_MODES` independent by renaming its `hour` property to `visualHour`. `getSkyState(visualHour)` remains a graphics-only helper and must never be passed into power calculation.

- [ ] **Step 6: Convert projects, research, forecasts, and summaries**

Every tick increments project/research/campaign/stress elapsed values by one day. Power receives `dayIndex` and `tickIndex`, not calendar hour. Summary exposes `dayIndex`, calendar date, `dailyCarbon`, and `dailyWater`. Continuous clock interpolation may calculate fractional visual days for the progress bar, but resource settlement still occurs once at the day boundary.

- [ ] **Step 7: Write v8 migration and round-trip failures**

```js
test('v7 save preserves its displayed date and real remaining durations', () => {
  const old = v7Save({
    elapsedGameHours: 120,
    grid: [{ type: 'factory', level: 1, project: { kind: 'upgrade', durationHours: 8, elapsedHours: 3 } }],
    research: { jobs: { solar2: { id: 'solar2', durationHours: 120, elapsedEffectiveHours: 30 } } },
  });
  const migrated = migrateSaveData(old);
  expect(migrated).toMatchObject({ v: 8, elapsedGameDays: 5 });
  expect(migrated.grid[0].project).toMatchObject({ durationDays: 8, elapsedDays: 3 });
  expect(migrated.research.jobs.solar2).toMatchObject({ durationDays: 120, elapsedEffectiveDays: 30 });
});

test('v7 post-tutorial save starts quest seven without losing its city', () => {
  const migrated = migrateSaveData(v7Save({ questIndex: 7, credits: 31, grid: [{ type: 'nuclear', level: 2 }] }));
  expect(migrated).toMatchObject({ v: 8, questIndex: 7, credits: 31 });
  expect(migrated.climateCampaign).toMatchObject({ status: 'briefing', completedEventTypes: [] });
});
```

- [ ] **Step 8: Implement canonical v8 state and migration**

Set `SAVE_VERSION = 8`. Add:

```js
this.elapsedGameDays = 0;
this.climateCampaign = {
  status: 'locked', eventType: null, attempt: 0, scheduledEventId: null,
  progress: {}, lastResult: null, completedEventTypes: [],
};
this.workforceRebalanceGraceDays = 0;
this.research.techLevels.green = 1;
```

For v7, set `elapsedGameDays = Math.floor(elapsedGameHours / 24)` to preserve the displayed date. Move every timer/progress number unchanged into its `Days` field so real remaining time is unchanged. Completed v7 campaigns remain complete; incomplete post-tutorial saves start quest 7 while retaining facilities, credits, unlocks, research, battery energy, and projects.

- [ ] **Step 9: Run clock, save, project, research, and HUD regressions**

Run: `npx playwright test tests/e2e/unit/daily-clock.spec.js tests/e2e/unit/state-v2.spec.js tests/e2e/unit/state-v3.spec.js tests/e2e/unit/state-v4.spec.js tests/e2e/unit/state-v5.spec.js tests/e2e/unit/state-v6.spec.js tests/e2e/unit/state-v7.spec.js tests/e2e/unit/state-v8.spec.js tests/e2e/unit/simulation.spec.js tests/e2e/unit/construction-projects.spec.js tests/e2e/unit/research.spec.js tests/e2e/continuous-clock.spec.js tests/e2e/hud.spec.js --workers=1`

Expected: all PASS with daily fields and labels.

- [ ] **Step 10: Local checkpoint without Git writes**

Run: `rg -n "elapsedGameHours|durationHours|elapsedHours|hourlyCarbon|hourlyWater|/h|시간" src tests/e2e`

Expected: no game-clock or rate occurrence. Graphics-only comments may use ordinary Korean prose but must not expose an hourly simulation API.

Run: `git diff --check`

Expected: no output. Do not stage or commit.

---

### Task 3: Rebalance population and workforce

**Files:**
- Modify: `src/core/Constants.js`
- Modify: `src/systems/WorkforceSystem.js`
- Modify: `src/systems/CityFailureSystem.js`
- Modify: `tests/e2e/unit/workforce.spec.js`
- Modify: `tests/e2e/unit/facility-tech.spec.js`
- Modify: `tests/e2e/unit/construction-plan.spec.js`

**Interfaces:**
- Preserves: `calculateWorkforce`, `workforceDeltaForCell`, `validateWorkforceGrid`, `validateWorkforceTransition`.
- Adds no new public workforce API; the simulation decrements the saved grace counter and the operational-risk system reads it.

- [ ] **Step 1: Write exact workforce table tests**

```js
test('housing and facility workforce follow the climate campaign balance table', () => {
  expect(WORKFORCE_LEVELS.residential).toEqual([0, 6, 10, 15]);
  expect(WORKFORCE_LEVELS.factory).toEqual([0, 4, 6, 8]);
  expect(WORKFORCE_LEVELS.thermal).toEqual([0, 3, 4, 5]);
  expect(WORKFORCE_LEVELS.data).toEqual([0, 4, 6, 8]);
  expect(WORKFORCE_LEVELS.nuclear).toEqual([0, 6, 8, 10]);
  expect(WORKFORCE_LEVELS.tidal).toEqual([0, 3, 4, 5]);
});

test('five level-one homes support the reference diversified city', () => {
  const grid = [
    ...Array.from({ length: 5 }, () => ({ type: 'residential', level: 1 })),
    { type: 'factory', level: 1 }, { type: 'thermal', level: 1 },
    { type: 'data', level: 1 }, { type: 'nuclear', level: 1 },
    { type: 'solar', level: 1 }, { type: 'wind', level: 1 },
    { type: 'battery', level: 1 }, { type: 'cooling', level: 1 },
    { type: 'tidal', level: 1 },
  ];
  expect(calculateWorkforce(grid)).toMatchObject({ capacity: 30, used: 26, shortage: 0 });
});
```

- [ ] **Step 2: Run workforce tests and observe old values**

Run: `npx playwright test tests/e2e/unit/workforce.spec.js --workers=1`

Expected: FAIL with residential capacity 10 instead of 6 and old facility demands.

- [ ] **Step 3: Apply the exact workforce table**

Set residential `[0,6,10,15]`; factory `[0,4,6,8]`; thermal `[0,3,4,5]`; data `[0,4,6,8]`; nuclear `[0,6,8,10]`; solar `[0,1,2,3]`; wind `[0,2,3,4]`; battery `[0,1,2,3]`; cooling `[0,2,3,4]`; green `[0,0,0,0]`; tidal `[0,3,4,5]`.

- [ ] **Step 4: Add migration grace handling**

Decrement `workforceRebalanceGraceDays` once per settlement while positive. In `CityFailureSystem`, do not increment `negativeCreditDays` while grace is positive, but continue to calculate and display real capacity, employment, industry fill, income, essential supply, carbon, and water. Residential construction and upgrades continue to pass `validateWorkforceTransition` when they reduce shortage.

- [ ] **Step 5: Update construction and upgrade expectations**

Change tests that assumed one Lv.1 home supplied 10 workers. Add an upgrade warning case where an upgrading Lv.1 home supplies `6 × 0.8 = 4.8` and the projected city temporarily has a shortage.

- [ ] **Step 6: Run workforce and construction gates**

Run: `npx playwright test tests/e2e/unit/workforce.spec.js tests/e2e/unit/facility-tech.spec.js tests/e2e/unit/construction-plan.spec.js tests/e2e/unit/construction-operations.spec.js --workers=1`

Expected: all PASS.

---

### Task 4: Add green-space research, technology gates, and quiz banks

**Files:**
- Modify: `src/core/Constants.js`
- Modify: `src/core/ResearchDefinitions.js`
- Modify: `src/core/ResearchQuizDefinitions.js`
- Modify: `src/systems/ResearchSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `tests/e2e/unit/research.spec.js`
- Modify: `tests/e2e/unit/facility-tech.spec.js`

**Interfaces:**
- Extends research definitions with `unlockAfterQuestId`.
- Adds research IDs `green2`, `green3` and tech level `research.techLevels.green`.
- Extends `validateUpgrade` technology gating to `green`.

- [ ] **Step 1: Write failing research availability tests**

```js
test('green research appears only after its campaign quest and gates upgrades', () => {
  state.unlockedFacilities.add('green');
  state.grid[0] = { type: 'green', level: 1 };
  expect(listResearchAvailability(state).find(({ id }) => id === 'green2')).toMatchObject({ available: false });
  state.claimedQuestIds.add('extreme-heat');
  expect(listResearchAvailability(state).find(({ id }) => id === 'green2')).toMatchObject({ available: true, cost: 10, durationDays: 90 });
});

test('every green research has four dedicated quiz questions', () => {
  expect(RESEARCH_QUIZZES.green2).toHaveLength(4);
  expect(RESEARCH_QUIZZES.green3).toHaveLength(4);
  expect(new Set([...RESEARCH_QUIZZES.green2, ...RESEARCH_QUIZZES.green3].map(({ id }) => id)).size).toBe(8);
});
```

- [ ] **Step 2: Run and observe missing research IDs**

Run: `npx playwright test tests/e2e/unit/research.spec.js tests/e2e/unit/facility-tech.spec.js --workers=1`

Expected: FAIL because green remains maxLevel 1 and `green2`/`green3` are undefined.

- [ ] **Step 3: Define green research and campaign prerequisites**

Add:

```js
green2: research('green2', '도시 수관 네트워크', 'trees', 90, 10,
  all('facility:green'), { tech: ['green', 2], effect: 'green_canopy' }, 'environment', 'extreme-heat'),
green3: research('green3', '기후회복 생태축', 'leaf', 150, 16,
  all('tech:green:2'), { tech: ['green', 3], effect: 'green_corridor' }, 'environment', 'dry-wildfire'),
```

Extend the `research()` builder to store `unlockAfterQuestId`. `listResearchAvailability` must return reason code `quest:<id>` and a Korean label naming the exact quest when it is unmet. Apply the same explicit unlock gate to `tidal1` using `stagnant-air` while retaining its solar2-or-wind2 prerequisite.

- [ ] **Step 4: Add eight exact green quiz cards**

Add these exact question contracts, each with the listed correct meaning, three distinct distractors, and a one-sentence explanation:

```js
green2: [
  ['green-heat-island', '도시 열섬', '그늘과 증산작용이 지표·공기 온도 상승을 완화한다.'],
  ['green-infiltration', '빗물 침투', '식생과 투수성 토양이 빗물의 지표 유출을 늦춘다.'],
  ['green-transpiration', '증산작용', '식물이 물을 수증기로 내보내 주변 열을 분산한다.'],
  ['green-canopy', '수관 연속성', '이어진 수관이 그늘과 생물 이동 경로를 넓힌다.'],
],
green3: [
  ['green-corridor', '생태 통로', '단절된 서식지를 연결해 생물 이동을 돕는다.'],
  ['green-carbon-limit', '흡수의 한계', '녹지는 배출 감축을 보조하지만 무제한 상쇄 수단은 아니다.'],
  ['green-fire-buffer', '산불 완충', '관리된 완충지대와 수종 구성이 불길 확산 위험을 낮춘다.'],
  ['green-native-species', '토착 수종', '지역 기후와 생태에 맞는 수종을 다양하게 구성한다.'],
],
```

- [ ] **Step 5: Enable green upgrades**

Set `FACILITIES.green.maxLevel = 3`. Include `green` in the technology-gated facility list. Add `green2`/`green3` to `upgradeRequirementMessage`. Preserve the city-wide Lv.2/Lv.3 permit check before the technology check.

- [ ] **Step 6: Run research and upgrade tests**

Run: `npx playwright test tests/e2e/unit/research.spec.js tests/e2e/unit/facility-tech.spec.js tests/e2e/unit/quest-quiz.spec.js --workers=1`

Expected: all PASS.

---

### Task 5: Build one shared climate modifier core

**Files:**
- Create: `src/systems/ClimateModifierSystem.js`
- Create: `tests/e2e/unit/climate-modifiers.spec.js`
- Modify: `src/systems/CityEventSystem.js`
- Modify: `src/systems/CityModifierSystem.js`
- Modify: `src/systems/FacilityOperationSystem.js`
- Modify: `tests/e2e/unit/city-events.spec.js`
- Modify: `tests/e2e/unit/facility-specialization.spec.js`

**Interfaces:**
- Produces: `facilityModifierForClimate(definition, facilityType, level = 1)`.
- Produces: `cityModifierForClimate(definition, { baselineWater = 10 } = {})`.
- Produces: `composeClimateDefinitions(definitions)` for final compound phases.
- `CityEventSystem.eventModifierForFacility` becomes a compatibility wrapper over this core.

- [ ] **Step 1: Write table-driven modifier failures**

```js
for (const [eventType, facilityType, expected] of [
  ['heatwave', 'residential', { demand: 1.25 }],
  ['monsoon', 'solar', { supply: 0.4 }],
  ['typhoon', 'wind', { supply: 0.2 }],
  ['coldWave', 'residential', { demand: 1.35 }],
  ['stagnantAir', 'thermal', { carbon: 1.25 }],
  ['stormSurge', 'tidal', { supply: 1 }],
]) {
  test(`${eventType} modifies ${facilityType}`, () => {
    expect(facilityModifierForClimate(CITY_EVENTS[eventType], facilityType)).toMatchObject(expected);
  });
}

test('wildfire weakens only lower-level green absorption', () => {
  expect(facilityModifierForClimate(CITY_EVENTS.dryWildfire, 'green', 1)).toMatchObject({ negative: 0.5 });
  expect(facilityModifierForClimate(CITY_EVENTS.dryWildfire, 'green', 2)).toMatchObject({ negative: 0.75 });
  expect(facilityModifierForClimate(CITY_EVENTS.dryWildfire, 'green', 3)).toMatchObject({ negative: 1 });
});
```

- [ ] **Step 2: Run and confirm the missing shared core**

Run: `npx playwright test tests/e2e/unit/climate-modifiers.spec.js --workers=1`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure modifier resolution**

Read frozen modifier maps from the supplied definition. Return an identity object for missing types. Resolve `greenAbsorptionByLevel` into the modifier channel used for negative carbon stats. Resolve `waterLimitRatio`, `coolingEffectiveness`, and `carbonFlat` into the city result. Do not read or mutate `gameState` inside this module.

- [ ] **Step 4: Route events and stress through the same functions**

Replace `CityEventSystem.eventModifierForFacility` switch statements with the compatibility wrapper. Change `CityModifierSystem` to pass the cell level. Extend modifier composition with a `negative` channel for negative environmental values. In `FacilityOperationSystem`, add `modifierContext.city.carbonFlat` after per-facility carbon is summed and clamp only the final city value at zero.

- [ ] **Step 5: Implement level-aware green effects**

Use green levels to produce these live rules:

```text
Lv.1 carbon -1.00, residential income ×1.05, heat demand ×1.20 instead of ×1.25
Lv.2 carbon -1.35, residential income ×1.07, heat demand ×1.15 instead of ×1.25
Lv.3 carbon -1.65, residential income ×1.09 and heat demand ×1.15 at distance 1,
     residential income ×1.045 and heat demand ×1.20 at hex distance 2
```

Select the strongest residential green modifier; do not stack income or heat multipliers. Keep each green facility's carbon absorption additive.

- [ ] **Step 6: Run climate, environment, and hex tests**

Run: `npx playwright test tests/e2e/unit/climate-modifiers.spec.js tests/e2e/unit/city-events.spec.js tests/e2e/unit/economy.spec.js tests/e2e/unit/facility-specialization.spec.js tests/e2e/unit/hex-board-rules.spec.js --workers=1`

Expected: all PASS.

---

### Task 6: Implement the quest 7–14 climate lifecycle

**Files:**
- Create: `src/systems/ClimateQuestSystem.js`
- Create: `tests/e2e/unit/climate-quests.spec.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/systems/CityEventSystem.js`
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/systems/FacilityPermitSystem.js`

**Interfaces:**
- Produces: `isClimateQuestActive(state)`.
- Produces: `acknowledgeClimateBriefing(state)`.
- Produces: `advanceClimateQuest(state, summary, eventTransition)`.
- Produces: `currentClimateQuestEvaluation(state)`.
- Produces: `retryClimateQuest(state)`.
- `QuestSystem.evaluateCurrentQuest` and `claimCurrentQuest` delegate for indices 7–14.

- [ ] **Step 1: Write lifecycle and target tests**

```js
test('acknowledging quest seven schedules one heatwave exactly 24 days ahead', () => {
  const state = climateState(7);
  const result = acknowledgeClimateBriefing(state);
  expect(result).toMatchObject({ ok: true, eventType: 'heatwave', startsInDays: 24 });
  expect(state.climateCampaign.status).toBe('preparation');
  expect(state.events.schedule).toHaveLength(1);
});

test('quest eight counts real battery discharge and resets consecutive supply on outage', () => {
  const state = activeClimateState(8);
  advanceClimateQuest(state, summary({ essentialSupplyPercent: 100, batteryDischarged: 2 }));
  advanceClimateQuest(state, summary({ essentialSupplyPercent: 80, batteryDischarged: 2 }));
  expect(currentClimateQuestEvaluation(state)).toMatchObject({ ready: false, consecutiveDays: 0, batteryEnergy: 4 });
});

test('quest fourteen cannot start its forecast without completed tidal research and facility', () => {
  const state = climateState(14);
  expect(acknowledgeClimateBriefing(state)).toMatchObject({ ok: false, reason: 'tidal_preparation_required' });
});
```

- [ ] **Step 2: Run and verify the missing lifecycle**

Run: `npx playwright test tests/e2e/unit/climate-quests.spec.js --workers=1`

Expected: FAIL because `ClimateQuestSystem.js` does not exist.

- [ ] **Step 3: Implement deterministic briefing and scheduling**

Create a single schedule item:

```js
{
  id: `climate-q${quest.index}-a${attempt}`,
  source: 'campaign',
  type: quest.eventType,
  announceAt: state.elapsedGameDays,
  startAt: state.elapsedGameDays + 24,
  endAt: state.elapsedGameDays + 24 + CITY_EVENTS[quest.eventType].durationDays,
}
```

While `source === 'campaign'`, `CityEventSystem.ensureSchedule` must not append random deck events. After campaign completion, sandbox random scheduling can resume.

- [ ] **Step 4: Implement all objective evaluators**

Use live `summary` data only:

- Q7: essential ≥90% for 4 consecutive active days.
- Q8: essential ≥90% for 4 consecutive active days and cumulative battery discharge ≥4E in the attempt.
- Q9: essential ≥90% for 4 consecutive active days and at least two generation types each deliver ≥0.1E on the same qualifying day.
- Q10: residential facility ratios all ≥90% and `netCredits > 0` for 4 consecutive active days.
- Q11: at least one data center and one nuclear facility are operational; `dailyWater <= waterLimit`, and every operational data/nuclear facility ratio is ≥90% for 4 consecutive active days.
- Q12: `dailyCarbon <= 8` and essential ≥90% for 4 consecutive active days.
- Q13: `dailyCarbon <= 8` and `netCredits > 0` for 4 consecutive active days.
- Q14: tidal routes deliver cumulative ≥8E and essential ≥90% for 4 consecutive active days.

At event end, store a result and set `ready_to_claim` only when all targets passed. Otherwise set `result`, increment no rewards, and expose `retryClimateQuest`.

- [ ] **Step 5: Route claims through one quest cursor**

On claim, add exact credits, facilities, research unlocks, and permit values; append the event type once to `completedEventTypes`; increment `questIndex`; initialize the next briefing. Q14 claim sets `questIndex = 15`, `stressTest.status = 'ready'`, and chapter 4. Emit existing quest events plus new `CLIMATE_QUEST_*` events for forecast/result UI.

- [ ] **Step 6: Remove objective-set runtime routing**

Stop calling `startObjectiveCampaign`, `evaluateObjectiveSet`, and `claimObjectiveSet` from `QuestSystem`, `QuestView`, and modal entry paths for new saves. Keep the modules only for v7 migration tests until final cleanup. Ensure no visible HUD path can display `운영 챕터 2/4` after quest 6.

- [ ] **Step 7: Run quest lifecycle tests**

Run: `npx playwright test tests/e2e/unit/climate-quests.spec.js tests/e2e/unit/quest.spec.js tests/e2e/unit/city-events.spec.js --workers=1`

Expected: all PASS.

---

### Task 7: Integrate climate lifecycle into settlement and prediction

**Files:**
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/systems/SimulationForecastSystem.js`
- Modify: `src/main.js`
- Modify: `tests/e2e/unit/construction-simulation.spec.js`
- Modify: `tests/e2e/unit/simulation.spec.js`
- Add tests to: `tests/e2e/unit/climate-quests.spec.js`

**Interfaces:**
- `createDaySettler` accepts `advanceCampaign = advanceClimateQuest`.
- Prediction continues to call the same settler with suppressed events and cloned state.
- Summary adds `generationDeliveredByType`, `climateQuest`, and `dailyCarbonTarget`.

- [ ] **Step 1: Write prediction parity failure**

```js
test('a 24-day climate prediction matches an actual cloned run', () => {
  const source = preparedMonsoonState();
  const predicted = forecastSimulation(source, 24);
  const actual = structuredCloneState(source);
  for (let day = 0; day < 24; day += 1) settleDay(actual);
  expect(pickClimateMetrics(predicted.finalState)).toEqual(pickClimateMetrics(actual));
});
```

Compare credits, battery energy, CO₂, water, essential supply, research elapsed days, construction completion, event state, and climate quest progress.

- [ ] **Step 2: Run and observe campaign progress missing from prediction**

Run: `npx playwright test tests/e2e/unit/climate-quests.spec.js tests/e2e/unit/construction-simulation.spec.js --workers=1`

Expected: FAIL because the simulation does not advance climate quest state.

- [ ] **Step 3: Add summary source accounting**

Reduce `power.routes` into:

```js
summary.generationDeliveredByType = power.routes.reduce((totals, route) => {
  const type = state.grid[route.from]?.type;
  if (['thermal', 'nuclear', 'solar', 'wind', 'tidal'].includes(type)) {
    totals[type] = (totals[type] || 0) + route.delivered;
  }
  return totals;
}, {});
```

Add current campaign carbon target: 12 for quests 1–6, 10 for 7–11, 8 for 12–15.

- [ ] **Step 4: Advance the campaign in settlement order**

After economy, power, and event recording, call `advanceClimateQuest` before carbon failure checks. Keep construction completion before all facility calculations. Do not call legacy objective evaluation. Attach the result to `summary.climateQuest` and emit forecast/start/result/ready events from `main.js`.

- [ ] **Step 5: Preserve pure prediction**

Clone campaign state, events, battery state, deterministic wind position, construction, research, modes, and priorities. Run the exact settler under `eventBus.withSuppressedEvents`. Never autosave, open UI, play sound, award a real quest reward, or mutate the source state.

- [ ] **Step 6: Run simulation and forecast tests**

Run: `npx playwright test tests/e2e/unit/simulation.spec.js tests/e2e/unit/construction-simulation.spec.js tests/e2e/unit/construction-forecast.spec.js tests/e2e/unit/climate-quests.spec.js --workers=1`

Expected: all PASS.

---

### Task 8: Replace the final test with the 41-day composite test

**Files:**
- Modify: `src/core/Constants.js`
- Modify: `src/core/EventDefinitions.js`
- Modify: `src/systems/StressTestSystem.js`
- Modify: `tests/e2e/unit/stress-test.spec.js`

**Interfaces:**
- Preserves: `startStressTest`, `advanceStressTest`, `finishStressTest`, `currentStressPhase`, `stressModifierForFacility`.
- Result adds: `daysAtOrBelowEight`, `daysAboveTen`, `averageCarbon`, `waterViolationDays`, `tidalEnergyDelivered`, `recoveryAchievedAtDay`.

- [ ] **Step 1: Write the stronger pass/fail boundary tests**

```js
test('final test runs eight phases for exactly forty-one days', () => {
  expect(STRESS_PHASES.map(({ id, durationDays }) => [id, durationDays])).toEqual([
    ['baseline', 3], ['heatDome', 6], ['monsoonFront', 5], ['coastalSuperstorm', 6],
    ['winterDisaster', 6], ['stagnantAir', 5], ['dryEmergency', 5], ['recovery', 5],
  ]);
});

test('green level three is not required for a passing result', () => {
  const state = readyReferenceCity({ greenLevels: [1, 1, 2] });
  runStress(state, safeFortyOneDaySummaries());
  expect(state.stressTest.result).toMatchObject({ passed: true });
});

test('an otherwise strong city fails when carbon compliance or tidal delivery is missing', () => {
  expect(runResult({ averageCarbon: 8.1 }).passed).toBe(false);
  expect(runResult({ daysAtOrBelowEight: 34 }).passed).toBe(false);
  expect(runResult({ daysAboveTen: 4 }).passed).toBe(false);
  expect(runResult({ tidalEnergyDelivered: 0 }).passed).toBe(false);
});
```

- [ ] **Step 2: Run and confirm the old 27-tick behavior**

Run: `npx playwright test tests/e2e/unit/stress-test.spec.js --workers=1`

Expected: FAIL with old five-phase duration and 70% threshold.

- [ ] **Step 3: Implement metrics and exact pass gates**

Set essential average threshold 82%, hard daily floor 50%, bankruptcy streak limit 4 days, water violation limit 6 days, tidal delivery minimum 8E, and recovery deadline 3 days. Count carbon compliance using rounded daily values: at least 35 days ≤8, no more than 3 days >10, average ≤8. Require final credits ≥0 and no carbon-extreme state.

- [ ] **Step 4: Reuse the shared climate modifier core**

Remove stress-specific switch statements. Each `STRESS_PHASES` entry carries the exact facility and city modifiers from the spec and passes through `facilityModifierForClimate`/`cityModifierForClimate`.

- [ ] **Step 5: Add entry validation**

`startStressTest` returns `{ ok:false, reason:'tidal_required' }` unless `tidal1` is complete and at least one operational tidal facility exists. It continues to accept `ready` and `failed` statuses and keeps retry non-destructive.

- [ ] **Step 6: Run stress and report tests**

Run: `npx playwright test tests/e2e/unit/stress-test.spec.js tests/e2e/unit/campaign-report.spec.js --workers=1`

Expected: all PASS.

---

### Task 9: Replace objective UI with climate campaign UI

**Files:**
- Create: `tests/e2e/climate-campaign-ui.spec.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/ui/DockView.js`
- Modify: `src/ui/EventResultView.js`
- Modify: `src/ui/FeedbackBridge.js`
- Modify: `src/ui/ForecastView.js`
- Modify: `src/ui/HudView.js`
- Modify: `src/ui/QuestView.js`
- Modify: `src/ui/ResearchView.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/style.css`
- Modify: `tests/e2e/objectives-ui.spec.js`
- Modify: `tests/e2e/quest-ui.spec.js`
- Modify: `tests/e2e/event-forecast.spec.js`
- Modify: `tests/e2e/research-ui.spec.js`
- Modify: `tests/e2e/stress-test-ui.spec.js`

**Interfaces:**
- Consumes only `QUESTS`, `CLIMATE_QUESTS`, `CITY_EVENTS`, `STRESS_PHASES`, live state, and system evaluation results.
- Adds event names: `CLIMATE_QUEST_BRIEFING_ACKNOWLEDGED`, `CLIMATE_QUEST_RESULT`, `CLIMATE_QUEST_RETRY_REQUESTED`.

- [ ] **Step 1: Write failing desktop/mobile UI assertions**

```js
test('quest seven shows the actual heatwave quest and preparation countdown', async ({ gamePage: page }) => {
  await setClimateQuest(page, 7, 'preparation', { startsInDays: 18 });
  await expect(page.locator('#phaseLabel')).toContainText('기후 대응 1 / 8');
  await expect(page.locator('#questPanel')).toContainText('폭염 경보');
  await expect(page.locator('#forecastStrip')).toContainText('18일 후 폭염');
});

test('locked tidal research explains the complete unlock path', async ({ gamePage: page }) => {
  await openResearch(page);
  await expect(page.getByText('조력 발전 실증').locator('..')).toContainText('12단계');
  await expect(page.getByText('조력 발전 실증').locator('..')).toContainText('태양광 또는 풍력');
});
```

- [ ] **Step 2: Run and observe old objective-set copy**

Run: `npx playwright test tests/e2e/climate-campaign-ui.spec.js --workers=1`

Expected: FAIL because the HUD still renders objective chapters.

- [ ] **Step 3: Render the canonical campaign status**

Use exactly these headers:

```text
quests 1–6: 복구 퀘스트 x / 6
quests 7–14: 기후 대응 x / 8
quest 15 ready/failed: 최종 기후시험 · 준비/재도전
quest 15 running: 최종 기후시험 · 구간 x / 8
passed: 도시 복구 완료
```

The compact quest line contains title, primary target, and preparation/active remaining days. Expanded content contains all conditions, current values, event effects, reward, and next unlock.

- [ ] **Step 4: Add centered forecast and result flows**

The first forecast emits a centered, top-layer modal and pauses once. Closing it never disables the persistent forecast strip. Event completion uses a priority toast containing outage days, battery use, net credits, average/max daily CO₂, water-violation days, and one diagnosis. Failed climate quests show `24일 준비부터 재도전`; successful ones enable the normal claim action.

- [ ] **Step 5: Update research and facility locks**

Render green2/green3 as three-column icon cards using `trees` and `leaf`. Touch/hover tooltips show exact quest and prerequisite names. Tidal facility and research cards show the Q12→solar2/wind2→tidal1→outer-ring path. Dock and inspector values read `effectiveFacilityStats`, including green level effects and new workforce values.

- [ ] **Step 6: Render the final test timeline and criteria**

Show all eight phases, total `41일`, current phase, forecasted city metrics, eight hard pass criteria, and the tidal entry gate. On failure, show the failed metric and phase; on retry, keep the city.

- [ ] **Step 7: Run UI suites**

Run: `npx playwright test tests/e2e/climate-campaign-ui.spec.js tests/e2e/quest-ui.spec.js tests/e2e/event-forecast.spec.js tests/e2e/research-ui.spec.js tests/e2e/stress-test-ui.spec.js tests/e2e/objectives-ui.spec.js --workers=1`

Expected: all PASS with objective-set UI expectations replaced by climate campaign expectations.

---

### Task 10: Add level-specific green 3D presentation without new frame cost

**Files:**
- Modify: `src/core/Constants.js`
- Modify: `src/ui/CityScene3D.js`
- Modify: `tests/e2e/assets.spec.js`
- Modify: `tests/e2e/perf.spec.js`

**Interfaces:**
- Reuses existing tree assets, geometries, materials, construction progress HUD, and dirty-render invalidation.
- Produces: exported `GREEN_VISUAL_LAYOUTS` with immutable item arrays for levels 1–3.
- Produces no new animation loop and no new network-loaded asset.

- [ ] **Step 1: Write a visual-structure test**

```js
test('green levels use progressively richer but bounded shared geometry', () => {
  expect(Object.fromEntries(Object.entries(GREEN_VISUAL_LAYOUTS).map(([level, items]) => [level, items.length])))
    .toEqual({ 1: 2, 2: 4, 3: 6 });
});
```

- [ ] **Step 2: Run and observe the missing debug contract**

Run: `npx playwright test tests/e2e/assets.spec.js --workers=1`

Expected: FAIL because `GREEN_VISUAL_LAYOUTS` does not exist and all green levels use the same two-tree fallback.

- [ ] **Step 3: Build deterministic level layouts**

Use shared tree/brush geometry and materials:

```text
Lv.1: 2 trees
Lv.2: 3 trees + 1 bush
Lv.3: 4 trees + 2 bushes/path markers
```

Use cell index and level for deterministic rotations. Do not add per-green mixers, lights, shadows, or continuous motion. The existing 10–30 second shared bird visit remains the only green animation.

- [ ] **Step 4: Confirm generic upgrade progress bars cover green**

Start green Lv.1→2 and Lv.2→3 projects in a test state. Assert each cell receives the same DOM progress bar and inspector countdown as other facilities; do not create a second green-specific progress implementation.

- [ ] **Step 5: Run asset and performance checks**

Run: `npx playwright test tests/e2e/assets.spec.js tests/e2e/perf.spec.js tests/e2e/construction-progress.spec.js --workers=1`

Expected: all PASS; draw-call contract remains within the existing test threshold.

---

### Task 11: Prove campaign feasibility and finish documentation

**Files:**
- Modify: `tests/helpers/playthrough.js`
- Modify: `tests/e2e/gameplay-redesign.spec.js`
- Modify: `tests/e2e/unit/campaign-playthrough.spec.js`
- Modify: `tests/e2e/unit/quest-feasibility.spec.js`
- Modify: `progress.md`
- Modify: `docs/tech.md`

**Interfaces:**
- Produces deterministic fixtures for quest 1→15 and final-test reference cities.
- Does not add production APIs.

- [ ] **Step 1: Write the end-to-end campaign regression**

```js
test('tutorial 1–6, eight climate quests, and final test complete once in order', async ({ gamePage: page }) => {
  const result = await playFullClimateCampaign(page);
  expect(result.claimedQuestIndices).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  expect(result.completedClimateTypes).toEqual([
    'heatwave', 'monsoon', 'typhoon', 'coldWave',
    'drought', 'stagnantAir', 'dryWildfire', 'stormSurge',
  ]);
  expect(result).toMatchObject({ questIndex: 15, stressStatus: 'passed', campaignComplete: true });
});
```

- [ ] **Step 2: Add two explicit balance fixtures**

Fixture A passes with green levels `[1,1,2]`, residential levels `[1,1,2,2]`, no green/residential Lv.3, one battery, one tidal, and three low-carbon source types. Fixture B has green Lv.3 but insufficient essential supply and must fail. Both fixtures use real settlement functions, not hand-written summaries.

- [ ] **Step 3: Run the focused campaign suite**

Run: `npx playwright test tests/e2e/unit/climate-campaign-definitions.spec.js tests/e2e/unit/climate-modifiers.spec.js tests/e2e/unit/climate-quests.spec.js tests/e2e/unit/campaign-playthrough.spec.js tests/e2e/unit/quest-feasibility.spec.js tests/e2e/unit/stress-test.spec.js tests/e2e/gameplay-redesign.spec.js --workers=1`

Expected: all PASS.

- [ ] **Step 4: Run the full regression suite**

Run: `npm test -- --workers=1`

Expected: all tests PASS. If an existing visual snapshot changes only because intentional campaign text or green geometry changed, inspect it before updating that specific snapshot; never bulk-update snapshots.

- [ ] **Step 5: Build production output**

Run: `npm run build`

Expected: Vite build succeeds with no new errors. The existing large-chunk warning may remain; no new dependency or asset bundle is introduced.

- [ ] **Step 6: Update project continuity docs**

Add one dated section to `progress.md` listing the implemented campaign, climate events, final-test thresholds, tidal gate, green research, workforce table, save v8, and exact verification commands/results. Update `docs/tech.md` module map with `ClimateCampaignDefinitions`, `ClimateModifierSystem`, and `ClimateQuestSystem`.

- [ ] **Step 7: Final local integrity check without Git writes**

Run: `git diff --check`

Expected: no output. Then run `git status --short` only to report changed paths. Do not stage, commit, push, branch, deploy, or alter remotes.
