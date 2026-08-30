# Climate Quest Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six-stage redesign gate with a saved 15-quest climate-survival campaign driven by deterministic five-second economy, power-routing, storage-hub, labor, and heatwave simulation.

**Architecture:** Keep GameState and EventBus as the shared contracts. Add pure Climate, PowerNetwork, and Economy calculators; inject them into a single SimulationSystem scheduler so tests can settle one hour without real time. QuestSystem consumes board, quiz, diagnosis, and simulation events; UI views only render state and emit intent events.

**Tech Stack:** Vanilla ES modules, Three.js 0.185, anime.js, Chart.js, Vite 8, Playwright Test.

**Spec:** docs/superpowers/specs/2026-08-30-climate-quest-economy-design.md

## Global Constraints

- Work only in /Users/fecu/game-creator/AI_City_Webgame_V3.
- Do not commit, push, open a PR, deploy, or merge; replace commit steps with local diff checkpoints.
- Preserve the existing EventBus singleton, GameState singleton, Constants module, main orchestrator, render_game_to_text(), and advanceTime(ms) test hooks.
- Five real seconds equal one game hour; central modals and hidden tabs pause; no offline catch-up.
- No new continuous requestAnimationFrame loop and no per-tick allocation of Three.js mesh, geometry, or material objects.
- Remove evidence UI, evidence progression, the evidence badge, and all-at-once redesign validation.
- Demolition refund is floor(total invested credits × 0.5).
- Use the existing local city-kit assets only.
- Preserve unrelated user-owned changes and untracked files.

---

## File Structure

**Create**

- src/core/QuestDefinitions.js — immutable 15-quest content, rewards, unlock order, quiz groups.
- src/systems/ClimateSystem.js — pure time, renewable profile, heatwave, carbon classification helpers.
- src/systems/PowerNetworkSystem.js — pure direct and battery-hub allocation.
- src/systems/EconomySystem.js — pure workforce, revenue, penalties, and hourly settlement.
- src/systems/SimulationSystem.js — injected hour settler plus one-shot five-second scheduler.
- src/systems/AmbientBirdSystem.js — injected 10–30 second pooled bird-visit scheduler.
- src/systems/QuestSystem.js — quest evaluation, claim, reward, and internal stage bridge.
- src/systems/QuizSystem.js — quest-scoped deterministic quiz sessions.
- src/ui/QuestView.js — persistent tracker and quest-map drawer content.
- src/ui/SimulationHudView.js — clock, forecast, net income, low-carbon and alert HUD.
- src/ui/QuestModals.js — quiz, level-up, unlock, emergency-support modal flows.
- tests/unit/climate.spec.js — deterministic clock/output/heatwave tests.
- tests/unit/power-network.spec.js — distance, hub, priority, storage tests.
- tests/unit/economy.spec.js — power/labor/income/penalty/refund tests.
- tests/unit/quest.spec.js — all quest gates and idempotent rewards.
- tests/unit/save-v2.spec.js — v1 migration and v2 round trip.
- tests/e2e/simulation.spec.js — live HUD, pause, routing, day/night.
- tests/unit/ambient-birds.spec.js — visit interval, pause, green selection, pool reuse contract.
- tests/e2e/quests.spec.js — representative and full quest progression.

**Modify**

- index.html, src/style.css — quest tracker, simulation HUD, responsive states, remove evidence tab.
- src/core/Constants.js — simulation/economy/power/quest constants, badge replacement, grouped quiz bank.
- src/core/EventBus.js — simulation, quest, priority events; remove evidence/redesign events after callers are gone.
- src/core/GameState.js — save v2 quest/simulation/cell state and derived getters.
- src/main.js — inject calculators, initialize systems/views, expose deterministic test hooks.
- src/systems/BoardSystem.js — quest unlocks, permit cap, priority defaults, floor-50% refund.
- src/systems/SaveSystem.js — tick/quest autosave triggers and v1 migration path.
- src/systems/DiagnosisSystem.js — stable carbon/cooling/transmission risk targets.
- src/systems/ConceptsSystem.js — retain energy-scale/reflection helpers only; delegate quizzes.
- src/systems/AchievementSystem.js — climate badge in place of evidence.
- src/systems/ReportSystem.js — simulation and quest results; no evidence score/export.
- src/ui/DockView.js — quest locks, NEW labels, live affordability.
- src/ui/HudView.js — quest-level copy instead of public stage progression.
- src/ui/PanelViews.js — achievements only, no evidence tab renderer.
- src/ui/StageModals.js — no evidence or redesign check; facility operations and legacy story/report only.
- src/ui/WorldHud.js — quest-map panel coordination and modal pause compatibility.
- src/ui/CityScene3D.js — four world-light phases and reuse of route LineSegments.
- tests/helpers/playthrough.js and existing e2e specs — quest-aware helpers and assertions.
- docs/tech.md, progress.md — file map, mechanics, verification evidence.

**Delete after all imports are removed**

- src/systems/RedesignSystem.js

---

### Task 1: Domain Constants and Save-v2 State

**Files:**
- Create: tests/unit/save-v2.spec.js
- Create: src/core/QuestDefinitions.js
- Modify: src/core/Constants.js
- Modify: src/core/GameState.js

**Interfaces:**
- Produces: SIMULATION, POWER_RULES, ECONOMY_RULES, STORAGE_LEVELS, CLIMATE_RULES constants.
- Produces: QUESTS: readonly array of 15 QuestDefinition objects.
- Produces: gameState cell shape { type, level, priority, batteryStoredLowCarbon, batteryStoredFossil }.
- Produces: gameState quest and simulation fields described in spec section 15.

- [ ] **Step 1: Write failing v2 reset/round-trip tests**

~~~js
import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../src/core/GameState.js';

test('new state starts quest 1 at 08:00 with residential unlocked', () => {
  const state = new GameState();
  expect(SAVE_VERSION).toBe(2);
  expect(state.questIndex).toBe(1);
  expect(state.simulationHour).toBe(8);
  expect([...state.unlockedFacilities]).toEqual(['residential']);
  expect(state.evidence).toBeUndefined();
});

test('v2 serialize and hydrate preserve battery mix and claimed quests', () => {
  const source = new GameState();
  source.grid[0] = { type: 'battery', level: 2, priority: 'normal', batteryStoredLowCarbon: 9, batteryStoredFossil: 3 };
  source.claimedQuestIds.add('first-citizens');
  const restored = new GameState();
  expect(restored.hydrate(source.serialize())).toBe(true);
  expect(restored.grid[0].batteryStoredLowCarbon).toBe(9);
  expect([...restored.claimedQuestIds]).toContain('first-citizens');
});
~~~

- [ ] **Step 2: Run the test and verify red**

Run: npx playwright test tests/unit/save-v2.spec.js --reporter=line --workers=1 --retries=0

Expected: FAIL because GameState is not exported and SAVE_VERSION is 1.

- [ ] **Step 3: Add exact domain constants and QUESTS definitions**

Define the approved five-second interval, direct-loss formula inputs, battery capacities 20/35/50, throughputs 8/12/16, facility hourly credit rates, workforce tables, overbuild factor 0.1, health cost 0.4, carbon threshold 8, and all 15 rewards. Freeze QUESTS and nested reward data to prevent view mutation.

- [ ] **Step 4: Implement GameState v2 defaults and normalization**

Export GameState for tests. Add normalizeCell(cell) so legacy {type, level} cells receive type-based default priority and zero battery buckets. Serialize Sets as arrays and restore them in hydrate without evidence.

- [ ] **Step 5: Run state tests and core boot regression**

Run: npx playwright test tests/unit/save-v2.spec.js tests/e2e/game.spec.js -g "boots into" --reporter=line --workers=1 --retries=0

Expected: PASS after updating the boot assertion from public stage 1 to quest 1.

- [ ] **Step 6: Local checkpoint**

Run: git diff --check

Expected: no whitespace errors; do not stage or commit.

### Task 2: Deterministic Climate Calculator

**Files:**
- Create: tests/unit/climate.spec.js
- Create: src/systems/ClimateSystem.js

**Interfaces:**
- Produces: getSolarMultiplier(hour): number.
- Produces: getWindMultiplier(tickIndex): number.
- Produces: getWorldPhase(hour): 'dawn'|'day'|'dusk'|'night'.
- Produces: getThreeHourForecast(hour, tickIndex): ForecastEntry[].
- Produces: getDemandMultiplier(type, { heatwave, adjacentGreen }): number.

- [ ] **Step 1: Write the output-profile and heatwave tests**

~~~js
test('solar is zero at night and full from 08 through 16', () => {
  expect(getSolarMultiplier(5)).toBe(0);
  expect(getSolarMultiplier(7)).toBe(0.5);
  expect(getSolarMultiplier(12)).toBe(1);
  expect(getSolarMultiplier(19)).toBe(0);
});

test('green softens residential heatwave demand only', () => {
  expect(getDemandMultiplier('residential', { heatwave: true, adjacentGreen: false })).toBe(1.25);
  expect(getDemandMultiplier('residential', { heatwave: true, adjacentGreen: true })).toBe(1.1);
  expect(getDemandMultiplier('factory', { heatwave: true, adjacentGreen: false })).toBe(1);
});
~~~

- [ ] **Step 2: Verify red**

Run: npx playwright test tests/unit/climate.spec.js --reporter=line --workers=1 --retries=0

Expected: FAIL with module not found.

- [ ] **Step 3: Implement pure table-driven helpers**

Use modulo-24 normalization for hours and [0.6, 0.9, 1.1, 0.75] for wind. Return new forecast objects without mutating input.

- [ ] **Step 4: Verify green and boundary coverage**

Run: npx playwright test tests/unit/climate.spec.js --reporter=line --workers=1 --retries=0

Expected: all climate unit tests pass.

### Task 3: Distance and 3×3 Storage-Hub Power Network

**Files:**
- Create: tests/unit/power-network.spec.js
- Create: src/systems/PowerNetworkSystem.js

**Interfaces:**
- Consumes: grid cells, FACILITIES, ClimateSystem supply/demand multipliers, STORAGE_LEVELS.
- Produces: directEfficiency(distance): number.
- Produces: isBatteryNeighbor(batteryIndex, consumerIndex, size): boolean.
- Produces: calculatePowerNetwork(input): PowerNetworkResult with facilityPower, routes, nextBatteries, totals, lowCarbonDelivered.

- [ ] **Step 1: Write direct-loss and diagonal-hub tests**

~~~js
test('direct efficiency loses six percent after the adjacent tile', () => {
  expect(directEfficiency(1)).toBe(1);
  expect(directEfficiency(2)).toBe(0.94);
  expect(directEfficiency(20)).toBe(0.55);
});

test('battery covers all eight surrounding cells but not radius two', () => {
  expect(isBatteryNeighbor(12, 6, 5)).toBe(true);
  expect(isBatteryNeighbor(12, 13, 5)).toBe(true);
  expect(isBatteryNeighbor(12, 14, 5)).toBe(false);
});
~~~

- [ ] **Step 2: Write allocation behavior tests**

Cover essential-before-normal-before-saving allocation, best-efficiency route selection, split supply, 95% hub efficiency, throughput cap, discharge before charge, low-carbon/fossil bucket preservation, no battery chaining, and empty-battery direct fallback.

- [ ] **Step 3: Verify red**

Run: npx playwright test tests/unit/power-network.spec.js --reporter=line --workers=1 --retries=0

Expected: FAIL with module not found.

- [ ] **Step 4: Implement deterministic candidates and greedy allocation**

Build route candidates as plain objects. Sort by priority rank, descending efficiency, consumer index, source index. Never depend on object insertion order. Return new battery bucket values rather than mutating grid.

- [ ] **Step 5: Verify green and no NaN edge cases**

Run: npx playwright test tests/unit/power-network.spec.js --reporter=line --workers=1 --retries=0

Expected: all power tests pass, including zero generators and zero demand.

### Task 4: Economy, Labor, Penalties, and Demolition

**Files:**
- Create: tests/unit/economy.spec.js
- Create: src/systems/EconomySystem.js
- Modify: src/systems/BoardSystem.js

**Interfaces:**
- Consumes: grid, facilityPower, generator utilization, hiddenCostsUnlocked.
- Produces: calculateLabor(grid): { workforce, jobs, industryFill, employmentRate }.
- Produces: settleEconomy(input): EconomyResult with facilityEconomy, grossIncome, maintenance, overcrowding, health, climateRecovery, netCredits, hourlyCarbon, hourlyWater.
- Produces: demolitionRefund(cell): integer using floor(investedCost × 0.5).

- [ ] **Step 1: Write anti-spam economy tests**

~~~js
test('residential tax falls to its 25 percent floor without jobs', () => {
  const result = settleEconomy(poweredCity(['residential', 'residential']));
  expect(result.labor.employmentRate).toBe(0);
  expect(result.grossIncome).toBe(0.25);
});

test('six factories add 1.2 credits per hour overcrowding cost', () => {
  const result = settleEconomy(poweredCity(Array(6).fill('factory'), { hiddenCostsUnlocked: true }));
  expect(result.overcrowding).toBe(1.2);
});
~~~

Add exact tests for proportional industry fill, 25% power shutdown, partial income, unique pollution pairs, non-stacking residential tax reduction, carbon recovery after quest 4 only, credit floor, and level multipliers.

- [ ] **Step 2: Write demolition tests against current ceil behavior**

Assert thermal invested 5 refunds 2, residential invested 2 refunds 1, and an upgraded facility uses all invested costs before floor-half.

- [ ] **Step 3: Verify red**

Run: npx playwright test tests/unit/economy.spec.js --reporter=line --workers=1 --retries=0

Expected: economy module missing and thermal currently refunds 3.

- [ ] **Step 4: Implement pure settlement and BoardSystem refund change**

Count unique polluted pairs once. Apply power × labor to industrial income and operating outputs. Apply hidden penalties only when hiddenCostsUnlocked is true. Change Math.ceil(investedCost * 0.5) to Math.floor(investedCost * 0.5).

- [ ] **Step 5: Verify green and placement regressions**

Run: npx playwright test tests/unit/economy.spec.js tests/e2e/game.spec.js -g "placing|upgrade|demol" --reporter=line --workers=1 --retries=0

Expected: economy and board operation tests pass.

### Task 5: Simulation Scheduler and Save Migration

**Files:**
- Create: src/systems/SimulationSystem.js
- Modify: src/systems/SaveSystem.js
- Modify: src/core/EventBus.js
- Modify: tests/unit/save-v2.spec.js

**Interfaces:**
- Produces: createHourSettler({ getClimate, getPower, getEconomy, evaluateQuest }): settleHour(state) => TickResult.
- Produces: initSimulationSystem({ gameState, settleHour, intervalMs }): controller with pause(reason), resume(reason), settleNow(), dispose(), getState().
- Produces: migrateV1Save(data): v2 plain object.

- [ ] **Step 1: Add failing scheduler tests with fake timers through Playwright clock or injected scheduler**

Test one callback equals one hour, no catch-up, nested pause reasons, MODAL_OPEN/MODAL_CLOSE, document visibility, dispose, and no duplicate schedule after repeated resume.

- [ ] **Step 2: Add failing migration cases**

Use v1 fixtures for stages 1, 3, 4, 5, 6. Assert grid/credits preservation, placed-facility unlock union, stage mapping, empty batteries, default priorities, and no evidence field.

- [ ] **Step 3: Verify red**

Run: npx playwright test tests/unit/save-v2.spec.js -g "scheduler|migrat" --reporter=line --workers=1 --retries=0

Expected: FAIL because scheduler and migration do not exist.

- [ ] **Step 4: Implement scheduler with injected setTimeout/clearTimeout**

Track pause reasons in a Set. Schedule only when the set is empty. Clear the pending timeout before adding a pause reason. On callback, settle exactly once, emit simulation:ticked, request save, then schedule the next one.

- [ ] **Step 5: Implement same-key v1 migration and autosave events**

Keep GAME.AUTOSAVE_KEY unchanged. GameState.hydrate accepts v1 only through migrateV1Save. Subscribe to tick, quest claim, and priority change saves; remove evidence/redesign save events.

- [ ] **Step 6: Verify green**

Run: npx playwright test tests/unit/save-v2.spec.js --reporter=line --workers=1 --retries=0

Expected: all state, scheduler, and migration tests pass.

### Task 6: Quest Engine, Rewards, Unlocks, and Stage Bridge

**Files:**
- Create: tests/unit/quest.spec.js
- Create: src/systems/QuestSystem.js
- Modify: src/systems/BoardSystem.js
- Modify: src/systems/DiagnosisSystem.js
- Modify: src/systems/StageSystem.js

**Interfaces:**
- Produces: evaluateCurrentQuest(state, trigger): QuestEvaluation.
- Produces: claimCurrentQuest(state): ClaimResult with credits, unlockedFacility, permitLevel, nextQuest.
- Produces: requestEmergencySupport(state): { ok, credits }.
- Consumes: board:* events, diagnosis:* events, quiz:finished, simulation:ticked.

- [ ] **Step 1: Write table-driven tests for all 15 quest conditions**

For each QUESTS entry, construct the smallest passing state and one failing state. Assert consecutive-hour reset for quests 2, 3, 4, 7, 9–14. Assert quest 12 only counts 19–23 and quest 13 requires both 70% low-carbon and lower-than-baseline carbon.

- [ ] **Step 2: Write reward and idempotency tests**

Claim each quest once, assert the exact credit reward and unlock sequence. Call claim twice and assert the second result is {ok:false, reason:'already_claimed'} with no credit change.

- [ ] **Step 3: Verify red**

Run: npx playwright test tests/unit/quest.spec.js --reporter=line --workers=1 --retries=0

Expected: FAIL with module not found.

- [ ] **Step 4: Implement pure evaluation plus event bridge**

Store only counters and boolean action facts in questProgress. On quest 4 claim capture firstCitySnapshot and recent hourly baseline. On quest 6 claim expand to 6×6. Map quest ranges to internal STAGES without exposing the label.

- [ ] **Step 5: Replace unlockStage and stageLevelCap decisions**

Board placement checks gameState.unlockedFacilities. stageLevelCap reads upgradePermitLevel. Dock rendering and selected facility normalization use the same state.

- [ ] **Step 6: Make diagnosis targets stable**

Classify first-city thermal/factory as carbon risks, data/nuclear without cooling as cooling risks, and any consumer route below 88% as a transmission risk. Ensure at least three distinct scannable targets by allowing one facility to expose only one highest-priority risk.

- [ ] **Step 7: Verify quest and board suites**

Run: npx playwright test tests/unit/quest.spec.js tests/e2e/game.spec.js --reporter=line --workers=1 --retries=0

Expected: unit suite passes; remaining legacy stage-flow failures are recorded for Task 10 rather than hidden with retries.

### Task 7: Quest-Scoped Quizzes and Evidence Removal

**Files:**
- Create: src/systems/QuizSystem.js
- Create: src/ui/QuestModals.js
- Modify: src/systems/ConceptsSystem.js
- Modify: src/ui/StageModals.js
- Modify: src/ui/PanelViews.js
- Modify: src/core/Constants.js
- Delete: src/systems/RedesignSystem.js

**Interfaces:**
- Produces: startQuestQuiz(kind), currentQuestion(), answerQuestion(index), nextQuestion(), retryQuiz().
- Produces UI: openQuestQuiz(), openQuestReward(result), openQuestMap(), openEmergencySupport().
- Emits quiz:finished with { kind, passed, correct, total }.

- [ ] **Step 1: Add failing quest quiz tests to quest.spec.js**

Assert quest 5 and 8 use three questions with threshold two; quest 15 uses four with threshold three; retry preserves city state and resets only quiz progress.

- [ ] **Step 2: Implement deterministic quiz groups and sessions**

Group existing questions into crisis, renewable, and final banks. Add the climate/low-carbon questions required for four final questions. Use a stable tick-based rotation rather than Math.random so tests and replays are deterministic.

- [ ] **Step 3: Move quiz/reward UI into QuestModals**

Retain answer feedback and accessibility. Reward modal receives ClaimResult and never mutates state directly.

- [ ] **Step 4: Remove evidence and redesign paths**

Remove evidence imports, constants, DOM, badge, inspector button, event definitions, validation button, report weighting, and export fields. Remove RedesignSystem only after rg shows no imports.

- [ ] **Step 5: Verify removal and tests**

Run: rg -n "evidence|EVIDENCE|recordEvidence|REDESIGN_VALIDATED|openRedesignCheck" src index.html tests

Expected: no product-code matches; migration test fixture comments may retain the word evidence.

Run: npx playwright test tests/unit/quest.spec.js tests/e2e/hud.spec.js -g "achievement|quiz" --reporter=line --workers=1 --retries=0

Expected: passes with achievements-only UI and quest quiz flow.

### Task 8: Persistent Quest Tracker and Simulation HUD

**Files:**
- Modify: index.html
- Modify: src/style.css
- Create: src/ui/QuestView.js
- Create: src/ui/SimulationHudView.js
- Modify: src/ui/DockView.js
- Modify: src/ui/HudView.js
- Modify: src/ui/WorldHud.js
- Modify: src/ui/StageModals.js

**Interfaces:**
- QuestView consumes quest state and emits quest:claimRequested, quest:mapRequested, quiz:startRequested, economy:emergencyRequested.
- SimulationHudView consumes the latest TickResult and forecast.
- Facility inspector emits facility:priorityChanged with { index, priority }.

- [ ] **Step 1: Add failing DOM assertions in hud.spec.js and mobile.spec.js**

Assert tracker visible by default, LEVEL 1 / 15 copy, compact mobile form, nonblocking canvas pointer, claim disabled before ready, quest map open, and absence of evidence tabs.

- [ ] **Step 2: Add semantic HTML**

Add questTracker outside hudControls so WorldHud panel changes do not hide it. Add simulation strip fields for time, next tick, net credits, delivered/demand, low-carbon percentage, and climate alert. Add polite live regions for tick and quest completion.

- [ ] **Step 3: Implement views with event-driven rendering**

Render only on quest, tick, claim, load, and reset events. Cache the last rendered primitive values so countdown text is the only once-per-second DOM update; do not rerender the full card each second.

- [ ] **Step 4: Implement facility economics and priority controls**

Show power ratio, operation ratio, source/hub, distance, loss, labor/employment, income/upkeep, overcrowding/health allocation, battery buckets, and total-invested/refund/loss. Hide priority control until quest 10 is claimed.

- [ ] **Step 5: Style desktop and mobile without covering controls**

Desktop tracker sits below the world status with max-width 340px. Mobile compact card sits below the resource strip and above the canvas; expanded details use a bounded scroll area and safe-area insets. Preserve 44px touch targets.

- [ ] **Step 6: Verify HUD and mobile**

Run: npx playwright test tests/e2e/hud.spec.js tests/e2e/mobile.spec.js --reporter=line --workers=1 --retries=0

Expected: all HUD panel, build mode, tracker, and mobile layout tests pass.

### Task 9: 3D Day/Night and Reused Power Routes

**Files:**
- Create: src/systems/AmbientBirdSystem.js
- Create: tests/e2e/unit/ambient-birds.spec.js
- Modify: src/ui/CityScene3D.js
- Modify: src/ui/ThemeManager.js
- Modify: tests/e2e/motion.spec.js
- Modify: tests/e2e/perf.spec.js
- Modify: tests/e2e/visual.spec.js

**Interfaces:**
- Produces: setCityWorldPhase(phase, uiTheme): void.
- Produces: updatePowerRoutes(routes): void using shared LineSegments buffers.
- Produces: createBirdVisitController(deps): pauseable controller using one pooled flock.
- Produces renderer stats with worldPhase, routeSegments, geometry/material/memory counters.

- [ ] **Step 1: Add failing phase and resource-stability tests**

Assert phase changes only at dawn/day/dusk/night boundaries, UI theme remains user-selected, route flash lasts 180ms, and 20 ticks do not increase geometry/material counts.

Add unit tests proving random values 0 and 1 schedule 10,000ms and 30,000ms, no green produces no visit, pause clears the pending timer, resume schedules exactly one timer, and repeated visits reuse the same flock id.

- [ ] **Step 2: Refactor existing energy line ownership, not object count**

Keep one shared BufferGeometry/LineBasicMaterial pair. Resize typed arrays only when a larger route count is first required; reuse capacity thereafter. Direct, hub, and severe-loss route colors live in one color attribute.

Remove per-green static bird meshes. Create one hidden flock containing at most three birds. AmbientBirdSystem selects one current green index per visit, starts a bounded two-second animation, then hides the flock. Inject random and timer functions so unit tests never wait in real time.

- [ ] **Step 3: Apply four lighting presets on event**

Update clear color, hemisphere intensity, rim intensity, ground tint, and emissive window multiplier only when ClimateSystem reports a new phase or ThemeManager reports a new UI theme.

- [ ] **Step 4: Verify motion/performance/visual subset**

Run: npx playwright test tests/e2e/motion.spec.js tests/e2e/perf.spec.js -g "energy|settled|resource|render" --reporter=line --workers=1 --retries=0

Expected: no continuous settled render and stable renderer resources.

### Task 10: Main Orchestration, Report, Achievements, and Full Flow

**Files:**
- Modify: src/main.js
- Modify: src/systems/AchievementSystem.js
- Modify: src/systems/ReportSystem.js
- Modify: src/ui/ChartView.js
- Modify: tests/helpers/playthrough.js
- Modify: tests/e2e/game.spec.js

**Interfaces:**
- main injects ClimateSystem, PowerNetworkSystem, EconomySystem, and QuestSystem callbacks into SimulationSystem.
- Exposes window.__settleSimulationHour(), window.__getSimulationState(), and existing render_game_to_text()/advanceTime(ms).

- [ ] **Step 1: Write failing integration assertions**

render_game_to_text must include quest, gameTime, netCreditsPerHour, deliveredPower, demand, lowCarbonPercent, climateAlert, workforce, jobs, and facility power ratios; it must omit evidenceCount.

- [ ] **Step 2: Wire one refresh path**

Initialize calculators and views once. simulation:ticked updates GameState, then refreshAll renders HUD, dock, quest, scene, achievements, and chart once. Board mutations recalculate a preview summary without advancing time.

- [ ] **Step 3: Replace handleAdvance with quest intents**

Remove the public stage advance button and its switch. Crisis reveal, energy scale, diagnosis, expansion, and report open from quest claim effects. Keep internal stage transitions for renderer/editability compatibility.

- [ ] **Step 4: Update achievements and report**

Replace evidence badge with low-carbon transition. Report average employment, industry fill, transmission efficiency, low-carbon share, carbon/water delta, blackout hours, net income, overcrowding/health costs, quiz results, and quest completion. No final metric blocks quest completion.

- [ ] **Step 5: Update playthrough helper**

Use __settleSimulationHour() to advance deterministic hours, claim rewards through the UI, answer grouped quizzes, scan three risks, and construct only the minimal facilities required by each quest.

- [ ] **Step 6: Run unit and primary integration suites**

Run: npx playwright test tests/unit tests/e2e/game.spec.js tests/e2e/hud.spec.js --reporter=line --workers=1 --retries=0

Expected: all pass with no retries.

### Task 11: Simulation and Complete Quest E2E Coverage

**Files:**
- Create: tests/e2e/simulation.spec.js
- Create: tests/e2e/quests.spec.js
- Modify: tests/e2e/assets.spec.js
- Modify: tests/e2e/camera.spec.js
- Modify: tests/e2e/mobile.spec.js
- Modify: tests/e2e/perf.spec.js
- Modify: tests/e2e/visual.spec.js

**Interfaces:**
- Uses public UI plus documented window test hooks only.

- [ ] **Step 1: Add simulation scenarios**

Cover active five-second tick, modal pause, hidden-tab pause through injected controller, no offline catch-up, day/night solar, fixed wind, diagonal battery delivery, direct-vs-hub choice, shortage priority, emergency support, and 0C recovery.

- [ ] **Step 2: Add full 1→15 quest scenario**

Assert every reward amount, facility unlock, NEW marker, permit level, heatwave retry behavior, night storage gate, quest 13 dual climate gate, final quiz, report, save reload, and duplicate claim rejection.

- [ ] **Step 3: Add anti-spam scenario**

Build repeated residential/factory cells through a seeded state, settle one hour, and assert employment/industry penalties, overcrowding, health cost, carbon recovery cost, and failure of quest 13.

- [ ] **Step 4: Update visual snapshots intentionally**

Capture quest tracker default/ready, light daytime, dark nighttime, heatwave alert, power hub overlay, level-up modal, and mobile compact tracker. Update only snapshots whose composition intentionally changed.

- [ ] **Step 5: Run complete suite with retries disabled**

Run: npm test -- --reporter=line --workers=1 --retries=0

Expected: every test passes once; record exact count and duration.

### Task 12: Build, Performance Audit, and Documentation

**Files:**
- Modify: docs/tech.md
- Modify: progress.md

**Interfaces:**
- No new runtime interfaces.

- [ ] **Step 1: Production build**

Run: npm run build

Expected: exit 0; record bundle sizes and any existing chunk-size warning.

- [ ] **Step 2: Static and repository-scope checks**

Run: git diff --check

Run: rg -n "evidence|EVIDENCE|recordEvidence|REDESIGN_VALIDATED|openRedesignCheck" src index.html

Expected: clean diff; no removed-flow matches.

- [ ] **Step 3: Inspect runtime diagnostics**

Use the existing renderer hooks after 20 manual simulation ticks. Confirm settled=false between ticks, route line count bounded, no resource growth, no console/page errors, and camera drag/zoom still works.

- [ ] **Step 4: Update docs**

Document new modules, save v2 migration, test hooks, quest/economy/power formulas, latest test count, build size, renderer measurements, and the no-commit/no-push constraint in progress.md.

- [ ] **Step 5: Final full verification**

Run: npm test -- --reporter=line --workers=1 --retries=0

Run: npm run build

Run: git diff --check

Expected: all tests pass with retries disabled, build exits 0, diff check clean.

- [ ] **Step 6: Local-only handoff**

Review git status and report changed files. Do not run git add, git commit, git push, PR, deployment, or merge commands.
