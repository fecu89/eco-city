# AI City Gameplay Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. This repository is not owned by the user, so do not create branches, worktrees, commits, pushes, PRs, deployments, or any other Git write/history operation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing Three.js hex-city foundation while changing the campaign from a linear condition checklist into a 15–30 minute operating simulation driven by choices, forecasts, facility modes, events, specialization, and a final stress test.

**Architecture:** Keep `GameState`, the hourly `SimulationSystem`, the atomic construction plan, and the current 19/37-cell hex grid. Add focused definition/system/view modules for objectives, operating modes, events, zones, and the stress test; compute all facility modifiers through one operation context before power and economy settlement. The first six quests remain tutorials, while the old Q7–Q15 sequence is replaced by objective sets, event outcomes, a stress test, a profile report, and an optional quiz bonus.

**Tech Stack:** JavaScript ES modules, Three.js 0.185.1, Vite 8.2.2, Playwright 1.62.1, Chart.js 4.5.1, Lucide 1.35.0.

**Primary Spec:** `docs/AI_CITY_GAMEPLAY_REDESIGN_SPEC.md`

**Defect Reference:** `docs/game-system-audit-recheck-2026-08-31.md`

## Global Constraints

- The game remains single-player, non-combat, and playable in a 15–30 minute class session.
- Do not add multiplayer, PvP, enemy cities, a separate world map, citizen-level AI, traffic/logistics simulation, complex taxes, or a large new resource/facility catalog.
- Preserve the 19-cell to 37-cell pointy-top hex board, atomic multi-building construction, distance-based transmission, research, batteries, carbon, water, workforce, and facility levels.
- Every operating problem must have at least two viable responses; no late-game objective may prescribe one mandatory building path.
- Events always follow `forecast → active → result`; deterministic seeded order is allowed, surprise failure is not.
- Factory and data-center modes are the first operating modes. Residential demand response and battery reserve policies arrive with their stated level/research gates.
- Level 2 unlocks an operating choice; Level 3 unlocks automation, range, or emergency behavior rather than only larger numbers.
- The final stress test, not the quiz, determines campaign completion. The quiz adds 0–10 bonus points after the operating report.
- Desktop remains a full-screen city with floating controls; mobile uses bounded sheets. Existing 44px touch targets and keyboard focus behavior remain regression requirements.
- Keep the existing player-selected day/sunset/night graphics preset fixed. Do not reintroduce sun/moon objects, a continuous visual day/night cycle, or dense power-connection lines; communicate time and network causes through date/forecast and facility/HUD details.
- Preserve the current performance contracts: one WebGL context, representative 37-cell city at 24 draw calls or fewer, idle rendering stops, and preview/HUD toggles cause zero post-warm-up WebGL buffer churn.
- New UI-to-system commands travel through the EventBus, durable state remains in the GameState singleton, and `main.js` remains the lifecycle orchestrator. Pure calculators may import shared definitions, but must not import UI modules or mutate the singleton implicitly.
- Put every new balance scalar and timing threshold in `src/core/Constants.js`; definition modules assemble named rules from those constants instead of introducing logic-level magic numbers.
- Preserve both test hooks: `window.render_game_to_text()` must expose the current chapter, objectives, forecast/event, operating modes, and stress phase succinctly; `window.advanceTime(ms)` must continue to resolve deterministically.
- Do not perform Git write/history operations. Verification is local only.

## Decisions That Resolve Spec Ambiguities

1. **Battery topology:** a battery is a consumer-adjacent hub. Source-to-battery distance still incurs transmission loss; the battery must be within one hex of a receiving facility to provide the 0.95 hub route. Preview, scoring, copy, objectives, and power routing use this same rule.
2. **Battery operation:** battery auxiliary demand is allocated before charge/discharge. A battery needs at least 90% auxiliary supply to charge, discharge, or satisfy nuclear reserve. The power network uses a two-pass calculation so an unpowered battery cannot keep a nuclear source online.
3. **Cooling floor:** cooling scales with both the target and supporting cooler power ratios, and can never reduce an individual facility below 0 water per hour.
4. **Expansion cost:** use the fixed model from the spec: +1.0 credits/hour after the first nine-cell expansion and +1.5 additional credits/hour after the second.
5. **Expansion split:** after Q6, the 18 outer-ring cells are split deterministically into west/east groups of nine by world X coordinate. The player opens one side first and the other after the first objective set.
6. **Objective progression:** three objective sets replace old Q7–Q14. Sets require 2/3, 2/3, and 3/4 cards respectively. Events supply the chapter progression between the second and third sets. Old quest IDs remain migration inputs only.
7. **Event timing:** every event uses a six-game-hour forecast. Heatwave lasts 8 hours, night peak lasts 5 hours, low wind lasts 6 hours, and later-game drought lasts 6 hours. No more than one event is active until the final sequential stress test.
8. **Carbon pressure:** retain the common safe line of 10 CO₂/h and the 168-hour extreme failure ceiling, but apply escalating economic/operating penalties at 24, 72, and 144 unsafe hours before game over.
9. **Research:** preserve per-data-center parallel jobs and quizzes, but expose independent specialization branches. Existing `renewable3` v5 saves are honored through migration; new sessions use branch-specific advanced research instead of one mandatory all-research capstone.
10. **Stress bankruptcy:** a stress test fails for economy only after six consecutive negative-credit settlements or if credits have not recovered to at least 0 by the end; a brief recoverable deficit is recorded for scoring rather than treated as instant failure.
11. **Legacy campaign mapping:** v5 Q1–Q6 retain their tutorial position; Q7–Q9 map to `transition-choice`, Q10–Q12 map to `specialization`, Q13–Q14 map to `resilience`, and an active Q15 maps to stress-test readiness. Previously completed campaigns remain completed and are labeled `legacy_complete`; no mapped objective reward is paid a second time. A 37-cell legacy save keeps every occupied/visible cell active and pays the full +2.5 expansion upkeep instead of hiding buildings to force a new side choice.

## Target Module Map

**Create**

- `src/core/OperationDefinitions.js` — mode/policy IDs, unlocks, multipliers, labels.
- `src/core/ObjectiveDefinitions.js` — three post-tutorial objective sets and rewards.
- `src/core/EventDefinitions.js` — event/forecast/phase constants and modifiers.
- `src/core/ZoneDefinitions.js` — four zone traits and expansion costs.
- `src/systems/CityModifierSystem.js` — one per-facility context combining mode, event, zone, research, and level effects.
- `src/systems/ObjectiveSystem.js` — objective progress, set completion, chapter transitions.
- `src/systems/CityEventSystem.js` — seeded schedule, forecast, active event, outcome metrics.
- `src/systems/CityFailureSystem.js` — recoverable bankruptcy/essential-blackout counters, warnings, and terminal transitions.
- `src/systems/ZoneSystem.js` — east/west cells, active land, zone modifiers, expansion upkeep.
- `src/systems/StressTestSystem.js` — five deterministic phases, result capture, survival decision.
- `src/ui/ObjectiveView.js` — desktop cards and mobile sheet content.
- `src/ui/ForecastView.js` — current event, next event, causes, remaining hours.
- `src/ui/EventResultView.js` — compact post-event result and diagnosis.
- `tests/e2e/unit/city-modifiers.spec.js`
- `tests/e2e/unit/objectives.spec.js`
- `tests/e2e/unit/city-events.spec.js`
- `tests/e2e/unit/city-failure.spec.js`
- `tests/e2e/unit/zones.spec.js`
- `tests/e2e/unit/stress-test.spec.js`
- `tests/e2e/gameplay-redesign.spec.js`

**Modify**

- `index.html`, `src/style.css`
- `src/core/Constants.js`, `src/core/EventBus.js`, `src/core/GameState.js`
- `src/core/QuestDefinitions.js`, `src/core/ResearchDefinitions.js`, `src/core/ResearchQuizDefinitions.js`
- `src/systems/FacilityOperationSystem.js`, `src/systems/PowerNetworkSystem.js`, `src/systems/EconomySystem.js`
- `src/systems/SimulationSystem.js`, `src/systems/CarbonCrisisSystem.js`, `src/systems/ResearchSystem.js`
- `src/systems/BoardSystem.js`, `src/systems/ConstructionPlanSystem.js`, `src/systems/FacilityPermitSystem.js`
- `src/systems/QuestSystem.js`, `src/systems/SaveSystem.js`, `src/systems/ReportSystem.js`
- `src/ui/GridView.js`, `src/ui/SimulationHudView.js`, `src/ui/QuestView.js`, `src/ui/StageModals.js`
- `src/ui/ResearchView.js`, `src/ui/FeedbackBridge.js`, `src/ui/WorldHud.js`, `src/main.js`
- Existing unit, browser, visual, and performance tests affected by the new progression and HUD.

**Remove after v6 migration is verified**

- `src/systems/DiagnosisSystem.js`
- `src/ui/DiagnosisView.js`
- `tests/e2e/unit/diagnosis-v2.spec.js`
- Obsolete diagnosis events and state fields.

---

## Gate A — Rule Integrity and Save Safety

### Task 1: Fix battery auxiliary power and hub topology

**Files:**

- Modify: `src/systems/PowerNetworkSystem.js`
- Modify: `src/systems/FacilityPermitSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/core/Constants.js`
- Test: `tests/e2e/unit/power-network.spec.js`
- Test: `tests/e2e/unit/facility-permits.spec.js`
- Test: `tests/e2e/unit/hex-board-rules.spec.js`

**Interfaces:**

- Produces: `calculatePowerNetwork(args).batteryOperations[index] = { demand, delivered, ratio, canOperate, charged, discharged }`.
- Produces: `isBatteryHubForConsumer(batteryIndex, consumerIndex, coordinates): boolean` as the single topology predicate.
- Consumes: `facilityLevelStats(cell).demand`, `STORAGE_LEVELS`, and the existing direct-efficiency rules.

- [ ] **Step 1: Write failing power-network tests**

```js
test('battery auxiliary demand is included before charge and discharge', () => {
  const result = calculatePowerNetwork({ grid: poweredBatteryGrid(), hour: 12 });
  expect(result.demand).toBe(3);
  expect(result.facilityPower[1]).toMatchObject({ demand: 1, ratio: 1 });
  expect(result.batteryOperations[1].canOperate).toBe(true);
});

test.each([[1, 1], [2, 1.24], [3, 1.45]])('battery Lv.%s contributes %sE live demand', (level, demand) => {
  const result = calculatePowerNetwork({ grid: poweredBatteryGrid({ level }), hour: 12 });
  expect(result.facilityPower[1].demand).toBeCloseTo(demand);
  expect(result.demand).toBeCloseTo(2 + demand); // fixture has one 2E residential consumer
});

test('an unpowered battery cannot charge discharge or reserve nuclear generation', () => {
  const result = calculatePowerNetwork({ grid: starvedBatteryGrid(), hour: 12 });
  expect(result.batteryOperations[1]).toMatchObject({ ratio: 0, canOperate: false, charged: 0, discharged: 0 });
  expect(result.nextBatteries[1]).toEqual({ lowCarbon: 5, fossil: 0 });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npx playwright test tests/e2e/unit/power-network.spec.js tests/e2e/unit/facility-permits.spec.js --reporter=line --retries=0`

Expected: FAIL because battery demand is absent and an unpowered battery can still operate.

- [ ] **Step 3: Implement a two-pass battery-aware network**

```js
const BATTERY_OPERATION_MIN_RATIO = 0.9;

function allocateBatteryAuxiliaryDemand(context) {
  // Allocate facilityLevelStats(cell).demand first and populate facilityPower.
}

function activeBatteries(batteries, facilityPower) {
  return batteries.filter(({ index }) => (facilityPower[index]?.ratio ?? 0) >= BATTERY_OPERATION_MIN_RATIO);
}
```

Pass one allocates battery auxiliary demand. Pass two excludes nuclear sources when neither thermal nor an operational post-`storage-hub` battery reserve exists, then performs normal consumer routing and leftover charging using only operational batteries.

- [ ] **Step 4: Unify preview and spatial scoring around consumer adjacency**

`PARTNER_RULES.battery.good` becomes consumer types (`residential`, `factory`, `data`, `cooling`), renewable preview highlights batteries that can actually serve a consumer route, and `calcMetrics()` awards a battery link only for a real consumer-adjacent hub.

- [ ] **Step 5: Run targeted verification**

Run: `npx playwright test tests/e2e/unit/power-network.spec.js tests/e2e/unit/facility-permits.spec.js tests/e2e/unit/hex-board-rules.spec.js tests/e2e/unit/quest.spec.js --reporter=line --retries=0`

Expected: all targeted tests PASS; Q9 progress only counts routes through powered consumer-adjacent batteries.

### Task 2: Clamp cooling to real, powered water use

**Files:**

- Modify: `src/systems/FacilityOperationSystem.js`
- Test: `tests/e2e/unit/economy.spec.js`
- Test: `tests/e2e/unit/quest-feasibility.spec.js`

**Interfaces:**

- Produces: facility water values that are individually non-negative.
- Consumes: target `powerRatio` and the greatest valid supporting cooler `powerRatio`.

- [ ] **Step 1: Add failing monotonic-water tests**

```js
for (const [ratio, expected] of [[1, 1], [0.5, 0.5], [0.2, 0.2], [0, 0]]) {
  test(`cooled data center at ${ratio} power never exports negative water`, () => {
    const result = calculateEnvironmentalOperations(cooledDataFixture(ratio));
    expect(result.byFacility[0].water).toBe(expected);
    expect(result.byFacility[0].water).toBeGreaterThanOrEqual(0);
    expect(result.hourlyWater).toBeGreaterThanOrEqual(1); // powered home still consumes water
  });
}
```

- [ ] **Step 2: Verify RED**

Run: `npx playwright test tests/e2e/unit/economy.spec.js --grep "never exports negative water" --reporter=line --retries=0`

Expected: FAIL at partial and zero power.

- [ ] **Step 3: Apply per-facility floor and support scaling**

```js
const effectiveCoolingRatio = Math.min(targetPowerRatio, strongestCoolingPowerRatio);
const reduction = coolingReduction(cell, cooler) * effectiveCoolingRatio;
water = round2(Math.max(0, baseWater - reduction));
```

- [ ] **Step 4: Verify economy and quest feasibility**

Run: `npx playwright test tests/e2e/unit/economy.spec.js tests/e2e/unit/quest-feasibility.spec.js tests/e2e/unit/quest.spec.js --reporter=line --retries=0`

Expected: all tests PASS; Q6 and the late water objective remain reachable without cross-facility negative offsets.

### Task 3: Introduce save v6 semantic migration and state normalization

**Files:**

- Modify: `src/core/GameState.js`
- Modify: `src/systems/SaveSystem.js`
- Create: `tests/e2e/unit/state-v6.spec.js`
- Modify: `tests/e2e/unit/state-v5.spec.js`

**Interfaces:**

- Produces: `SAVE_VERSION = 6`.
- Produces: `migrateV5ToV6(data): SaveV6`.
- Produces: normalized cells with `operationMode`, `batteryPolicy`, and bounded level/storage values.

- [ ] **Step 1: Write migration failures**

```js
test('v5 renewable3 completion restores every legacy level-three technology', () => {
  const migrated = migrateSaveData(v5Renewable3AtBatteryTwo());
  expect(migrated.research.techLevels).toMatchObject({ solar: 3, wind: 3, battery: 3, tidal: 3 });
});

test.each([[9, 'transition-choice'], [14, 'resilience']])('v5 ready quest %s is safely mapped', (questIndex, objectiveSetId) => {
  const migrated = migrateSaveData(v5ReadyQuest(questIndex));
  expect(migrated.progression).toMatchObject({ objectiveSetId, objectiveProgress: {} });
});

test('a completed v5 campaign stays complete without paying redesigned rewards again', () => {
  const migrated = migrateSaveData(v5CompletedCampaign());
  expect(migrated).toMatchObject({ campaignComplete: true, stressTest: { status: 'legacy_complete' } });
  expect(migrated.credits).toBe(v5CompletedCampaign().credits);
});

test('a legacy 37-cell city keeps all built outer cells active', () => {
  const migrated = migrateSaveData(v5ExpandedCity());
  expect(migrated.expansion).toMatchObject({ phase: 2, firstChoice: 'legacy_full' });
  expect(migrated.expansion.activeCellIndices).toHaveLength(37);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx playwright test tests/e2e/unit/state-v6.spec.js --reporter=line --retries=0`

Expected: FAIL because v6 and `migrateV5ToV6` do not exist.

- [ ] **Step 3: Implement v5→v6 normalization**

```js
export function migrateV5ToV6(data) {
  const completed = new Set(data.research?.completedIds || []);
  const techLevels = { ...data.research?.techLevels };
  if (completed.has('renewable3')) {
    for (const type of ['solar', 'wind', 'battery', 'tidal']) techLevels[type] = Math.max(3, techLevels[type] || 0);
  }
  const changedReady = [9, 14].includes(Number(data.questIndex)) && data.questStatus === 'ready_to_claim';
  return normalizeSaveV6({
    ...data,
    v: 6,
    questStatus: changedReady ? 'active' : data.questStatus,
    questProgress: changedReady ? {} : data.questProgress,
    progression: migrateLegacyProgression(data, { clearUnsafeReady: changedReady }),
    expansion: migrateLegacyExpansion(data),
    research: { ...data.research, techLevels },
  });
}
```

`migrateLegacyProgression()` applies Decision 11, clears unsafe ready/progress state for Q9/Q14, and never grants credits/unlocks while loading. `migrateLegacyExpansion()` preserves all 37 legacy cells, while new 19-cell saves enter the normal post-Q6 side-choice flow. Normalize time scale to `TIME.ALLOWED_SCALES`, facility levels to `1..FACILITIES[type].maxLevel`, stored energy to battery capacity, missing modes to `normal`, and missing battery policy to `auto`. Convert any non-empty legacy `emergencySupportUsedQuestIds` into the v6 campaign-wide `emergencySupport.used = true` flag.

- [ ] **Step 4: Verify the whole migration chain**

Run: `npx playwright test tests/e2e/unit/state-v2.spec.js tests/e2e/unit/state-v3.spec.js tests/e2e/unit/state-v4.spec.js tests/e2e/unit/state-v5.spec.js tests/e2e/unit/state-v6.spec.js --reporter=line --retries=0`

Expected: every v1→v6 and v5→v6 path PASS.

### Task 4: Establish the redesigned progression state and remove legacy diagnosis state

**Files:**

- Modify: `src/core/GameState.js`
- Modify: `src/systems/SaveSystem.js`
- Modify: `src/core/EventBus.js`
- Remove: `src/systems/DiagnosisSystem.js`
- Remove: `src/ui/DiagnosisView.js`
- Remove: `tests/e2e/unit/diagnosis-v2.spec.js`
- Test: `tests/e2e/unit/state-v6.spec.js`

**Interfaces:**

- Produces state:

```js
progression: {
  chapter: 1,
  tutorialQuestIndex: 1,
  tutorialQuestStatus: 'active',
  tutorialProgress: {},
  objectiveSetId: null,
  objectiveProgress: {},
  completedObjectiveSetIds: [],
},
expansion: { phase: 0, firstChoice: null, activeCellIndices: [...Array(19).keys()] },
events: { seed: 20400101, schedule: [], activeId: null, completed: [], forecastAcknowledgedIds: [] },
stressTest: { status: 'locked', phaseIndex: 0, phaseHour: 0, result: null },
operationalRisk: { negativeCreditHours: 0, essentialBlackoutHours: 0, warningIds: [] },
emergencySupport: { used: false, economyScorePenalty: 0 },
decisionCounts: { modeChanges: 0, priorityChanges: 0, researchPauses: 0, emergencySupport: 0 },
```

- Produces events: `OBJECTIVES_CHANGED`, `EXPANSION_SELECTED`, `EVENT_FORECAST`, `EVENT_STARTED`, `EVENT_ENDED`, `OPERATION_MODE_CHANGED`, `BATTERY_POLICY_CHANGED`, `STRESS_TEST_CHANGED`.

- [ ] **Step 1: Add reset/serialize/hydrate tests for every new state group**
- [ ] **Step 2: Run `state-v6.spec.js` and verify failures for missing fields**
- [ ] **Step 3: Add reset defaults, serialization, hydration, and v6 fallback normalization**
- [ ] **Step 4: Strip diagnosis fields/events in `stripObsoleteState()` and remove dead diagnosis modules; retain legacy quest aliases through Gate A so the pre-redesign campaign remains testable**
- [ ] **Step 5: Extend `render_game_to_text()` with succinct redesign state and verify `advanceTime(ms)` still resolves through the orchestrator**
- [ ] **Step 6: Run state, import-cycle, boot, render-text, and controlled-time tests**

Run: `npx playwright test tests/e2e/unit/state-v6.spec.js tests/e2e/game.spec.js --reporter=line --retries=0`

Expected: redesigned state survives reload/reset, obsolete diagnosis state is absent, both browser test hooks work, and `render_game_to_text()` remains valid JSON.

**Gate A exit criteria**

- Battery demand and operation are consistent in preview/live values.
- Individual water use cannot become negative.
- All v1–v5 saves migrate to v6, including completed `renewable3` saves.
- Existing Q1–Q15 campaign still passes before its post-Q6 replacement begins.

---

## Gate B — Player-Driven Operating Loop

### Task 5: Create one operation/modifier calculation pipeline

**Files:**

- Create: `src/core/OperationDefinitions.js`
- Create: `src/systems/CityModifierSystem.js`
- Modify: `src/systems/FacilityOperationSystem.js`
- Modify: `src/systems/PowerNetworkSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Create: `tests/e2e/unit/city-modifiers.spec.js`

**Interfaces:**

- Produces: `buildCityModifierContext(state, { coords, calendar }): { byFacility, city }`.
- Produces: `effectiveFacilityStats(cell, modifier): FacilityStats`.
- Every modifier uses named multiplicative fields: `supply`, `demand`, `income`, `upkeep`, `carbon`, `water`, `researchSpeed`, `workforce`; the only additive fields are explicitly named `workforceFlat`, `healthCostFlat`, and `buildCostFlat`.

- [ ] **Step 1: Write a failing composition test**

```js
test('level mode event zone and research modifiers compose once', () => {
  const stats = effectiveFacilityStats(factoryLv2Boost(), {
    mode: { demand: 1.4, income: 1.35, carbon: 1.2, workforce: 1 },
    event: identityModifier(), zone: identityModifier(), research: identityModifier(),
  });
  expect(stats.demand).toBeCloseTo(baseFactoryLv2Demand * 1.4);
  expect(stats.income).toBeCloseTo(baseFactoryLv2Income * 1.35);
});
```

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement pure modifier composition without importing UI or `gameState`**
- [ ] **Step 4: Pass the same context into preview, power, economy, research, chart, and facility inspector**
- [ ] **Step 5: Verify static preview equals fully powered live settlement under identical context**

Run: `npx playwright test tests/e2e/unit/city-modifiers.spec.js tests/e2e/unit/economy.spec.js tests/e2e/unit/power-network.spec.js tests/e2e/unit/chart.spec.js --reporter=line --retries=0`

### Task 6: Add factory and data-center operating modes with preview

**Files:**

- Modify: `src/core/OperationDefinitions.js`
- Modify: `src/systems/FacilityOperationSystem.js`
- Modify: `src/systems/ResearchSystem.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/style.css`
- Test: `tests/e2e/unit/city-modifiers.spec.js`
- Test: `tests/e2e/game.spec.js`
- Test: `tests/e2e/research-ui.spec.js`

**Interfaces:**

- Produces: `availableOperationModes(cell, state): OperationModeDefinition[]`.
- Produces: `setFacilityOperationMode(state, index, mode): { ok, before, after, forecast }`.

**Exact definitions:**

```js
factory: {
  eco:    { demand: 0.65, income: 0.70, carbon: 0.85, workforce: 1 },
  normal: { demand: 1.00, income: 1.00, carbon: 1.00, workforce: 1 },
  boost:  { demand: 1.40, income: 1.35, carbon: 1.20, workforceFlat: 1 },
},
data: {
  eco:      { demand: 0.50, researchSpeed: 0, water: 1.00 },
  normal:   { demand: 1.00, researchSpeed: 1.00, water: 1.00 },
  research: { demand: 1.50, researchSpeed: 1.40, water: 1.20 },
},
```

Only `normal` is available at Lv.1; all three modes unlock at Lv.2.

- [ ] **Step 1: Write failing mode, lock, and preview tests**
- [ ] **Step 2: Verify RED against mode-less cells**
- [ ] **Step 3: Apply modes in the shared modifier context and research advance rate**
- [ ] **Step 4: Add a three-option segmented control to the existing facility console**
- [ ] **Step 5: Before applying a mode, show current→projected power margin, net income, CO₂, water, and workforce**
- [ ] **Step 6: Emit/save `OPERATION_MODE_CHANGED` and increment `decisionCounts.modeChanges`**
- [ ] **Step 7: Verify desktop, keyboard, and 390×844 touch behavior**

Run: `npx playwright test tests/e2e/unit/city-modifiers.spec.js tests/e2e/game.spec.js tests/e2e/research-ui.spec.js --reporter=line --retries=0`

### Task 7: Replace post-Q6 linear quests with objective sets

**Files:**

- Create: `src/core/ObjectiveDefinitions.js`
- Create: `src/systems/ObjectiveSystem.js`
- Create: `src/ui/ObjectiveView.js`
- Modify: `src/core/QuestDefinitions.js`
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/core/GameState.js`, `src/systems/SaveSystem.js`
- Modify: `src/ui/QuestView.js`
- Modify: `src/ui/WorldHud.js`
- Modify: `index.html`, `src/style.css`, `src/main.js`
- Create: `tests/e2e/unit/objectives.spec.js`
- Modify: `tests/e2e/unit/campaign-playthrough.spec.js`
- Modify: `tests/e2e/quest-ui.spec.js`, `tests/e2e/mobile.spec.js`

**Interfaces:**

- Produces: `evaluateObjectiveSet(state, summary): ObjectiveSetEvaluation`.
- Produces: `claimObjectiveSet(state): { ok, reward, nextSetId, chapterChanged }`.
- Q1–Q6 continue through existing quest predicates using `state.progression.tutorial*`; post-Q6 progress goes only through `ObjectiveSystem`.

**Exact objective sets:**

```text
SET transition-choice — complete 2 of 3
energy:      low-carbon delivered power ≥40% for 3 consecutive hours
economy:     net income ≥+4.00 for 3 consecutive hours
environment: CO₂ ≤10 for 3 consecutive hours
reward: 8 credits, battery + wind unlock, Lv.2 city permit, second expansion side

SET specialization — complete 2 of 3
technology: complete any specialization research and upgrade its matching facility to Lv.2
grid:       powered battery route delivers 8E over 3 consecutive hours OR average transmission efficiency ≥90% for 3 hours
citizen:    essential supply ≥90% and employment ≥80% for 3 consecutive hours
reward: 10 credits, Chapter 3 and scheduled events

SET resilience — complete 3 of 4
economy:     positive net income for 4 consecutive hours
energy:      essential supply ≥90% and stored energy ≥5E for 4 hours during an event
environment: low-carbon ≥70% and water within the current limit for 4 hours
technology:  one advanced branch research OR one Lv.3 functional facility
reward: 12 credits, final stress test permission
```

- [ ] **Step 1: Write failing independent-card and threshold tests**
- [ ] **Step 2: Verify RED because only one quest can currently progress**
- [ ] **Step 3: Implement per-card consecutive counters and alternative predicates**
- [ ] **Step 4: Change Q6 claim to enter `pending_expansion_choice`; Task 8 activates `transition-choice` after the player selects east or west**
- [ ] **Step 5: Remove the temporary top-level quest aliases from v6 serialization after all Q1–Q6 callers use `progression`; keep them only as v1–v5 migration inputs**
- [ ] **Step 6: Render all active cards, the required completion count, and per-card causes/progress**
- [ ] **Step 7: Make the former quest map a four-chapter progress map**
- [ ] **Step 8: Verify a stable and a renewable playthrough can both reach `resilience`**

Run: `npx playwright test tests/e2e/unit/objectives.spec.js tests/e2e/unit/campaign-playthrough.spec.js tests/e2e/quest-ui.spec.js tests/e2e/mobile.spec.js --reporter=line --retries=0`

### Task 8: Implement two-stage expansion and four zone traits

**Files:**

- Create: `src/core/ZoneDefinitions.js`
- Create: `src/systems/ZoneSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/systems/ConstructionPlanSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Modify: `src/systems/PowerNetworkSystem.js`
- Modify: `src/ui/GridView.js`, `src/ui/CityScene3D.js`, `src/ui/StageModals.js`
- Create: `tests/e2e/unit/zones.spec.js`
- Modify: `tests/e2e/hex-scene.spec.js`, `tests/e2e/island-scene.spec.js`, `tests/e2e/visual.spec.js`

**Interfaces:**

- Produces: `expansionGroups(coords): { east: number[9], west: number[9] }`.
- Produces: `zoneModifierForCell(state, index, facilityType)`.
- Produces: `expansionUpkeep(state): 0 | 1 | 2.5`.
- Placement validation rejects inactive outer cells with `reason: 'inactive_expansion'`.

**Zone values:**

```js
solar:       { solarSupply: 1.20 },
wind:        { windAverage: 1.20, windVariance: 1.10 },
industrial:  { factoryBuildCost: 0.85, residentialPollutionHealth: 1.25 },
residential: { residentialIncome: 1.15, factoryThermalBuildCost: 1.20 },
```

- [ ] **Step 1: Write failing 9+9 split, inactive-cell, cost, modifier, and Q6→choice→objective handoff tests**
- [ ] **Step 2: Verify RED against full instant expansion**
- [ ] **Step 3: Expand the backing grid to 37 cells but activate only the chosen side**
- [ ] **Step 4: Present east `solar/residential` versus west `wind/industrial` in the Q6 reward modal**
- [ ] **Step 5: Calculate construction-plan cost per index and include fixed expansion upkeep in economy**
- [ ] **Step 6: Encode traits with subtle tile overlays without adding draw calls per tile**
- [ ] **Step 7: Verify both expansion choices and the second-side unlock**
- [ ] **Step 8: Add a spatial-trade-off matrix test showing that each key facility has at least two competing placement consequences**

Run: `npx playwright test tests/e2e/unit/zones.spec.js tests/e2e/unit/construction-plan.spec.js tests/e2e/hex-scene.spec.js tests/e2e/perf.spec.js --reporter=line --retries=0`

**Gate B exit criteria**

- A player can change factory/data behavior and see projected effects before committing.
- Q1–Q6 remain instructional; Q6 requires an expansion-side choice, and every post-Q6 gate offers more cards than are required.
- First expansion adds +1.0 credits/hour upkeep; the first objective reward opens the second side and raises total expansion upkeep to +2.5.
- At least two deterministic campaign fixtures reach Chapter 3 using different expansion and objective combinations.

---

## Gate C — Forecasts, Pressure, and Specialization

### Task 9: Add deterministic events, forecast UI, and result reports

**Files:**

- Create: `src/core/EventDefinitions.js`
- Create: `src/systems/CityEventSystem.js`
- Create: `src/ui/ForecastView.js`
- Create: `src/ui/EventResultView.js`
- Modify: `src/systems/SimulationSystem.js`
- Modify: `src/systems/ClimateSystem.js`
- Modify: `src/systems/PowerNetworkSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Modify: `src/core/EventBus.js`, `src/main.js`, `index.html`, `src/style.css`
- Create: `tests/e2e/unit/city-events.spec.js`
- Create: `tests/e2e/event-forecast.spec.js`

**Interfaces:**

- Produces: `createEventSchedule(seed, startHour): CityEvent[]`.
- Produces: `advanceCityEvents(state, summary): { forecasted, started, ended, activeModifiers, result }`.
- Produces active modifiers through `CityModifierSystem`; systems never read UI state.

**Event definitions:**

```js
heatwave:  { durationHours: 8, residentialDemand: 1.25, dataWater: 1.20, solarSupply: 1.10 },
nightPeak: { durationHours: 5, residentialDemand: 1.25, solarSupply: 0.05, requiredWindow: [19, 23] },
lowWind:   { durationHours: 6, windSupply: 0.35 },
drought:   { durationHours: 6, waterLimit: 0.75, coolingEffectiveness: 1.25 },
```

Every event is announced six game hours before start. The P0 three-event deck contains heatwave, night peak, and low wind once each before repetition. Drought unlocks only after two completed events and enters the following deck, so the opening loop stays readable while the full four-event design is still implemented.

- [ ] **Step 1: Write failing schedule, boundary, modifier, drought-unlock, and no-overlap tests**
- [ ] **Step 2: Verify RED because `climateAlert` is currently a quest toggle**
- [ ] **Step 3: Implement forecast/active/end state transitions in the hourly settlement**
- [ ] **Step 4: Record event metrics: outage hours, battery energy used, minimum essential supply, net income, carbon/water violations**
- [ ] **Step 5: Add a compact always-visible current/next forecast strip and priority toast**
- [ ] **Step 6: Show a non-blocking result card with a deterministic diagnosis based on the worst metric**
- [ ] **Step 7: Verify forecast and active effects at 1× and 4× without continuous rendering**

Run: `npx playwright test tests/e2e/unit/city-events.spec.js tests/e2e/event-forecast.spec.js tests/e2e/perf.spec.js --reporter=line --retries=0`

### Task 10: Convert terminal failures into staged, recoverable operating pressure

**Files:**

- Modify: `src/systems/CarbonCrisisSystem.js`
- Create: `src/systems/CityFailureSystem.js`
- Modify: `src/systems/EconomySystem.js`
- Modify: `src/systems/QuestSystem.js`, `src/systems/SimulationSystem.js`
- Modify: `src/systems/ReportSystem.js`
- Modify: `src/core/EventBus.js`, `src/core/GameState.js`, `src/main.js`
- Modify: `src/ui/SimulationHudView.js`, `src/ui/StageModals.js`
- Modify: `tests/e2e/unit/carbon-crisis.spec.js`, `tests/e2e/carbon-game-over.spec.js`
- Create: `tests/e2e/unit/city-failure.spec.js`

**Interfaces:**

- Produces: `carbonPressure = { tier, unsafeHours, healthMultiplier, residentialIncomeMultiplier, waterMultiplier, reportPenalty }`.
- Produces: `operationalRisk = { negativeCreditHours, essentialBlackoutHours, warnings, gameOverTransition }`.

**Exact tiers:**

```text
0–23h normal: no added penalty
24–71h watch: health cost ×1.25
72–143h danger: health cost ×1.5, residential income ×0.90, water ×1.05
144–167h severe: prior effects, final operating-response score -5
168h extreme: existing blocking game over

credit balance < 0: warn at 6h, pause once at 12h, game over at 24 consecutive hours
essential supply ≤5%: warn at 3h, pause once at 6h, game over at 12 consecutive hours
safe credit/essential settlements reduce their respective counters by 1h instead of erasing history instantly
```

- [ ] **Step 1: Write failing boundary and recovery tests at 23/24, 71/72, 143/144, 167/168**
- [ ] **Step 2: Verify RED against the binary counter**
- [ ] **Step 3: Return tier modifiers from `applyCarbonCrisis()` and apply them on the following settlement**
- [ ] **Step 4: Implement bankruptcy and near-total essential-blackout counters with recovery, distinct game-over reasons, and saved warning milestones**
- [ ] **Step 5: Make emergency support campaign-wide and one-time: grant 4 credits, record one decision, and apply a final economy-score penalty of 2**
- [ ] **Step 6: Explain the current cause and next threshold in the HUD/help modal; show the first tier as a non-blocking warning**
- [ ] **Step 7: On first entry into carbon `danger`/`severe` or the pause milestones above, pause once through the existing pause-reason stack and open a centered warning, so 4× never consumes the player's reading time**
- [ ] **Step 8: Run 1×/4× response-time play probes and record warning-to-action time plus recovery success in `progress.md`**

Run: `npx playwright test tests/e2e/unit/carbon-crisis.spec.js tests/e2e/unit/city-failure.spec.js tests/e2e/carbon-game-over.spec.js tests/e2e/hud.spec.js --reporter=line --retries=0`

### Task 11: Replace the linear research chain with specialization branches and functional levels

**Files:**

- Modify: `src/core/ResearchDefinitions.js`, `src/core/ResearchQuizDefinitions.js`
- Modify: `src/systems/ResearchSystem.js`
- Modify: `src/core/OperationDefinitions.js`, `src/systems/CityModifierSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/ui/ResearchView.js`, `src/ui/StageModals.js`
- Modify: `tests/e2e/unit/research.spec.js`, `tests/e2e/unit/facility-tech.spec.js`, `tests/e2e/unit/quest-quiz.spec.js`

**Interfaces:**

- Research prerequisites support `{ mode: 'all' | 'any', items: string[] }`.
- `researchEffects(state)` returns modifiers/unlocks without UI coupling.

**New-session research tree:**

```text
solar2          10 credits / 120h → solar +20%, solar Lv.2
wind2           10 credits / 120h → wind average +15%, low-wind penalty -15 points, wind Lv.2
battery2        15 credits / 150h → capacity +30%, reserve policies, battery Lv.2
smartGrid       15 credits / 150h → transmission loss per extra tile 6% → 4%
demandResponse  15 credits / 150h → residential modes and factory automatic saving permission
tidal1          18 credits / 150h → requires solar2 OR wind2; tidal unlock/Lv.1
solar3          20 credits / 180h → requires solar2; solar Lv.3
wind3           20 credits / 180h → requires wind2; wind Lv.3
battery3        22 credits / 180h → requires battery2; battery Lv.3 emergency reserve
```

Each new research receives four shuffled questions. Each question can reduce that job only once by 25% of its base duration, so four correct answers can remove the full research time; answer positions are shuffled per question and persisted to prevent save/reload rerolls. The v5 `renewable3` ID remains recognized only by migration/report export and is not listed for new sessions.

**Functional level behavior:**

- Residential Lv.2: request/forced-saving modes; Lv.3: automatic demand response when margin ≤1E.
- Factory Lv.2: eco/normal/boost; Lv.3: auto eco at margin ≤1E and boost at margin ≥5E.
- Data Lv.2: focused research; Lv.3: +25% research only when current low-carbon surplus ≥3E.
- Battery Lv.2: auto/30%/50% reserve; Lv.3: essential-only discharge below the reserve line.
- Cooling Lv.2: adjacent reduction ×1.25; Lv.3: distance-two support at half the adjacent reduction.
- Green next to residential adds +5% residential income; green next to a factory reduces that adjacency's health cost by 25%; a cluster of three green cells reduces heatwave residential demand from +25% to +20%.

- [ ] **Step 1: Write failing branch availability, per-data-center parallelism, four-question acceleration, shuffled-answer, research outcome, and level-function tests**
- [ ] **Step 2: Verify RED against the current all-prerequisite capstone**
- [ ] **Step 3: Implement research branches and effects in the modifier system**
- [ ] **Step 4: Add residential/battery policies and Lv.3 automatic decisions with visible state labels**
- [ ] **Step 5: Keep automatic decisions deterministic and count them separately from player decisions**
- [ ] **Step 6: Verify that completing every research is unaffordable/unnecessary in both 25-minute reference paths**

Run: `npx playwright test tests/e2e/unit/research.spec.js tests/e2e/unit/facility-tech.spec.js tests/e2e/unit/quest-quiz.spec.js tests/e2e/unit/city-modifiers.spec.js --reporter=line --retries=0`

**Gate C exit criteria**

- East and west starts produce materially different costs/output but are both viable.
- Forecasts give six game hours of notice and event results explain the dominant failure.
- Factory/data modes and at least one research branch change the preferred response.
- A nuclear/battery stable city and a distributed renewable/demand-response city can both reach the final objective set.

---

## Gate D — Final Stress Test, Profile Report, and Release QA

### Task 12: Implement the five-phase final stress test

**Files:**

- Create: `src/systems/StressTestSystem.js`
- Create: `tests/e2e/unit/stress-test.spec.js`
- Modify: `src/core/EventDefinitions.js`, `src/core/GameState.js`, `src/core/EventBus.js`
- Modify: `src/systems/SimulationSystem.js`, `src/systems/ConstructionPlanSystem.js`
- Modify: `src/ui/StageModals.js`, `src/ui/ForecastView.js`, `src/main.js`

**Interfaces:**

- Produces: `startStressTest(state)`, `advanceStressTest(state, summary)`, `finishStressTest(state)`.
- Produces result:

```js
{
  blackoutHours,
  minimumEssentialSupply,
  averageNetIncome,
  carbonRiskHours,
  waterViolationHours,
  batteryEnergyUsed,
  recoveryHours,
  maxConsecutiveBankruptcyHours,
  finalCredits,
  passed,
}
```

**Exact phase sequence:**

```text
normal       4h
heatwave     8h
night peak   5h
low-wind night 6h
recovery     4h
```

The heatwave and night-peak phases reuse their event modifiers. The combined low-wind-night phase uses the stress-specific values `windSupply: 0.40` and `solarSupply: 0`, matching the specification's -60% wind output and zero solar output.

During the test the player may change modes, priority, battery policy, research status, upgrade, or build. New construction costs 20% more.

- [ ] **Step 1: Write failing phase, action, surcharge, and result tests**
- [ ] **Step 2: Verify RED because no stress-test state machine exists**
- [ ] **Step 3: Implement deterministic phase advancement through the shared modifier pipeline, including the stress-specific low-wind-night combination**
- [ ] **Step 4: Pass when average essential supply is at least 70%, the credit balance is not negative for six consecutive settlements and recovers to at least 0 by the end, and carbon never reaches extreme game over**
- [ ] **Step 5: On failure, preserve the city and return to preparation with the result diagnosis; do not reset the campaign**
- [ ] **Step 6: Verify stable and distributed reference cities both pass with different score profiles**

Run: `npx playwright test tests/e2e/unit/stress-test.spec.js tests/e2e/unit/construction-plan.spec.js tests/e2e/event-forecast.spec.js --reporter=line --retries=0`

### Task 13: Redesign report scoring, city profiles, and post-report quiz bonus

**Files:**

- Modify: `src/systems/ReportSystem.js`
- Modify: `src/systems/QuizSystem.js`
- Modify: `src/ui/StageModals.js`, `src/ui/QuestView.js`
- Modify: `src/core/GameState.js`, `src/main.js`
- Modify: `tests/e2e/unit/campaign-report.spec.js`, `tests/e2e/quest-ui.spec.js`

**Interfaces:**

- Produces five 0–100 profile axes and a 100-point operating total:

```text
power stability 30
environment     20
economy         20
resource use    15
operating response 15
quiz bonus       0–10, displayed separately
```

- Produces: `classifyCity(report): { id, title, reasons[] }`.

**City profiles and precedence:**

1. Renewable self-reliant: low-carbon ≥75%, renewable share ≥60%, battery supplies at least 10E and 10% of delivered campaign energy.
2. Stable energy: outage rate ≤2%, reserve margin ≥15%, nuclear share ≥35%.
3. Smart grid: transmission efficiency ≥92%, player mode/policy changes ≥3, installed peak supply ÷ observed peak demand ≤1.20.
4. Industrial growth: average net income ≥4, factory income share ≥35%.

If multiple profiles qualify, select the greatest normalized margin above its thresholds; otherwise select the closest profile and phrase it as the city's developing strength, never as failure.

- [ ] **Step 1: Write failing score-axis, profile, and quiz-order tests**
- [ ] **Step 2: Verify RED against the current 50/30/20 report**
- [ ] **Step 3: Score the stress result plus whole-session totals**
- [ ] **Step 4: Mark campaign complete immediately after stress success and open the report**
- [ ] **Step 5: Offer the four-question concept quiz from the report; add 2.5 bonus points per correct answer without altering the operating total**
- [ ] **Step 6: Export operating score, bonus, axes, profile, event results, objectives, and decision counts**

Run: `npx playwright test tests/e2e/unit/campaign-report.spec.js tests/e2e/unit/quest-quiz.spec.js tests/e2e/quest-ui.spec.js --reporter=line --retries=0`

### Task 14: Rebuild the HUD around causes, objectives, and forecasts

**Files:**

- Modify: `index.html`, `src/style.css`
- Modify: `src/ui/SimulationHudView.js`, `src/ui/WorldHud.js`, `src/ui/ObjectiveView.js`, `src/ui/ForecastView.js`
- Modify: `src/ui/StageModals.js`, `src/ui/GridView.js`
- Modify: `tests/e2e/hud.spec.js`, `tests/e2e/mobile.spec.js`, `tests/e2e/visual.spec.js`

**Desktop always-visible order:**

```text
date/forecast | credits+net | power margin | battery stored | CO₂ | water | play/4×
```

Workforce remains in the city-status panel and facility/build forecasts. The right-side objective panel shows the active 2/3 or 3/4 cards. Selecting a red metric opens a cause list, for example `residential peak +3E`, `focused research +2E`, `low wind -5E`.

- [ ] **Step 1: Add failing DOM/accessibility tests for metric order, battery, forecast, cards, and cause text**
- [ ] **Step 2: Verify RED against the current five-metric HUD**
- [ ] **Step 3: Add battery and forecast slots without reducing the 3D city viewport**
- [ ] **Step 4: Replace the post-Q6 quest presentation with objective cards; retain Q1–Q6 compact quest UI**
- [ ] **Step 5: Implement mobile sheets with no hover-only controls and three or fewer visible forecast entries**
- [ ] **Step 6: Update and inspect desktop 1440×900 and mobile 390×844 snapshots**

Run: `npx playwright test tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/visual.spec.js --reporter=line --retries=0`

### Task 15: Add real-input campaign, balance, performance, and teardown coverage

**Files:**

- Create: `tests/e2e/gameplay-redesign.spec.js`
- Modify: `tests/helpers/playthrough.js`, `tests/fixtures/game-test.js`
- Modify: `tests/e2e/perf.spec.js`, `tests/e2e/visual.spec.js`
- Modify: `src/main.js`, `src/ui/CityScene3D.js` only if teardown probes expose leaks
- Modify: `progress.md`

**Reference campaigns:**

```text
Stable path: nuclear + battery + short routes + focused research
Distributed path: solar + wind + battery + smart grid + demand response
```

- [ ] **Step 1: Build browser helpers that use actual HUD buttons, tile clicks, construction confirmation, mode controls, expansion selection, research cards, and time controls**
- [ ] **Step 2: Add a real-input browser campaign from the 10-credit start through Q1–Q6, all three objective sets, at least two forecast events, and stress-test completion**
- [ ] **Step 3: Add deterministic unit campaigns that complete both full reference paths without injected credits or finished-city fixtures**
- [ ] **Step 4: Assert a 15–30 minute expected human action timeline, no softlock, 2–4 meaningful decisions in each representative two-minute Chapter 2+ window, and no mandatory identical research path; automated runs may use `advanceTime()` but may not inject resources or completion state**
- [ ] **Step 5: Re-run performance contracts with zone overlays, forecast UI, modes, and events active**
- [ ] **Step 6: Add an application disposer for document listeners, timers, EventBus listeners, audio, chart, forecast, event result, and 3D subsystems if repeated boot/dispose shows retained activity**
- [ ] **Step 7: Run the full release gate**

Run:

```bash
git diff --check
npm run audit:assets
npm audit --audit-level=high
npm test -- --reporter=line --retries=0
npm run build
```

Expected:

- All unit, browser, visual, accessibility, performance, migration, and dual-campaign tests PASS with zero retries.
- Build succeeds; the existing >500KB bundle warning may remain only if load-time tests stay within budget.
- Asset audit stays at 45 selected runtime GLBs with retained license records.
- No console/page errors, additional WebGL contexts, idle frames, draw-call regression, or GPU buffer churn.

### Task 16: Final plan/spec conformance review

**Files:**

- Modify: `progress.md`
- Read: `docs/AI_CITY_GAMEPLAY_REDESIGN_SPEC.md`
- Read: `docs/game-system-audit-recheck-2026-08-31.md`

- [ ] **Step 1: Check every MUST/MUST NOT and success-checklist item against a passing test or inspected UI**
- [ ] **Step 2: Confirm the audit regressions are present and passing: Lv.1/2/3 battery demand, dead-battery inactivity, non-negative facility water, monotonic partial-power water, v5 `renewable3`, ready Q9/Q14 migration, preview/live hub topology, and the new-campaign real-input replacement for the former Q1→Q15 smoke path**
- [ ] **Step 3: Record actual balance numbers, modeled session duration, both city profiles, bundle size, draw calls, and remaining non-blocking risks in `progress.md`**
- [ ] **Step 4: Confirm no Git write/history or remote operation occurred**

**Gate D exit criteria**

- The final stress test, not a quiz, completes the campaign.
- Stable and distributed cities both survive and receive distinct, non-failing profiles.
- The player sees upcoming pressure, can explain why a metric changed, and has at least two valid responses.
- Full local QA and build gates pass before completion is reported.

## Execution Order and Checkpoints

1. Tasks 1–4, then run Gate A and review the save migration before gameplay changes.
2. Tasks 5–6, then Task 8's expansion contract, then Task 7's progression switch; run Gate B only after playing Q1–Q6, both expansion choices, and both first-objective combinations.
3. Tasks 9–11, then compare stable/distributed event and research responses.
4. Tasks 12–16, then run the full release gate and visual review.

Do not start the next gate when the current gate has failing tests, an unreachable objective, a save migration gap, or a performance regression.
