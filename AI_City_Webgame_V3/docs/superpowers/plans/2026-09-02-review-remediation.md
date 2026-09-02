# Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every High/Medium/Low finding in the 2026-09-02 review of `AI_City_Webgame_V3` and bring the full Playwright suite back to green.

**Architecture:** The game is a vanilla-JS + Vite + Three.js city simulation with the harness patterns EventBus / GameState / Constants / orchestrator (`src/main.js`). Fixes are grouped into batches by file ownership so each batch can be implemented, tested and reviewed as one unit. Behavior changes always come with a unit (`tests/e2e/unit/*.spec.js`, Playwright runner but pure-module imports) or browser test. The god-module splits recommended by the review (CityScene3D, StageModals) are deliberately out of scope for this plan.

**Tech Stack:** vanilla ES modules, Vite 8 (rolldown), Three.js 0.185, Chart.js 4, anime.js 3, lucide 1.35, Playwright 1.62 (`npx playwright test`, single worker, ~17 min full run).

**Spec:** `AI_City_Webgame_V3/docs/game-review-2026-09-02.md` (the review; finding ids H1–H7, M1–M25 and the Low list are referenced below).

## Global Constraints

- Work only inside `AI_City_Webgame_V3/`. Working directory for all commands: `/Users/fecu/game-creator/AI_City_Webgame_V3`.
- **Do not run `git add`, `git commit`, `git stash`, `git checkout`, `git reset` or any other git command that changes the index, HEAD or the working tree.** The user commits their own work. Leave all changes uncommitted in the working tree. (Read-only git commands such as `git diff`, `git status`, `git log` are fine.)
- Never edit `_legacy-v3/`, `public/assets/**/*.glb`, `assets-source/**`, `node_modules/`.
- All user-facing copy is Korean. Quest numbers must come from `src/core/CampaignProgression.js` (`CAMPAIGN_QUEST_INDEXES`: FOUNDATION_END 6, PREPARATION_START 7, PREPARATION_END 10, CLIMATE_START 11, CLIMATE_END 18, FINAL_TEST 19) or from quest definitions, never as literals in systems/ui.
- Every numeric game rule lives in `src/core/Constants.js` (or a `core/*Definitions.js` file). No new magic numbers in `systems/` or `ui/`.
- Events: only `Events.*` constants from `src/core/EventBus.js`, `domain:action` naming.
- Time model: one simulation tick = one game day; at 1× a tick is `TIME.BASE_DAY_MS` (1000 ms). Nothing new may use "hour" semantics.
- Tests: run the focused spec files for what you change with `npx playwright test <files> --reporter=line --retries=0`. Unit specs under `tests/e2e/unit/` import modules directly and run fast. Do not run the full suite except where a task says so.
- Test output must be pristine: no new console warnings/errors in the browser (the Playwright log echoes `[WebServer]` console output).
- Do not weaken tests: never replace a concrete assertion with `expect.any(...)`, never delete an assertion to make a test pass. If an expectation is stale because the design changed, update it to the new correct value and say why in your report.
- Keep the existing file structure; no new directories except `src/ui/modal/` is NOT wanted either — keep new modules flat inside the existing `core/ systems/ ui/ audio/ level/` folders.

---

### Task 1: Progression, final exam, expansion re-prompt and V9 migration (H1, H2, H3, M4, M5, M7, M8, Low)

**Files:**
- Modify: `src/systems/QuestSystem.js` (stageForQuest, evaluateCurrentQuest, claimCurrentQuest, delete cases 11–14 at ~199–219, hardcoded numbers at 43, 55, 62–66, 87–93, 115)
- Modify: `src/systems/ClimateQuestSystem.js:352` (REPORT → REDESIGN at CLIMATE_QUEST_MAX claim)
- Modify: `src/systems/SaveSystem.js` (migrateV8ToV9 additions; migrateV7ToV8 `/24` at ~485; hardcoded `workforceRebalanceGraceDays: 24` at ~523 and `timeScale: 1` at ~221)
- Modify: `src/systems/StressTestSystem.js` (add `national-climate-test` to `claimedQuestIds` when the stress test passes, near where `campaignComplete = true` is set ~182)
- Modify: `src/systems/CityEventSystem.js:161` (gate random events off during quest 19)
- Modify: `src/systems/SimulationSystem.js:16-19` (carbon targets keyed on campaign constants)
- Modify: `src/systems/BoardSystem.js:329,353` (branch-aware quest title via `questForState`)
- Modify: `src/main.js` boot (after `loadSavedGame()`): expansion-choice re-prompt
- Modify: `src/core/Constants.js` (new `WORKFORCE_RULES.REBALANCE_GRACE_DAYS: 24` if no equivalent exists)
- Test: `tests/e2e/unit/quest.spec.js`, `tests/e2e/unit/state-v9.spec.js`, `tests/e2e/unit/state-v8.spec.js`, `tests/e2e/unit/city-events.spec.js`, `tests/e2e/unit/stress-test.spec.js`, new `tests/e2e/expansion-reprompt.spec.js`

**Interfaces:**
- Produces: `export function expansionChoicePending(state)` in `src/systems/ZoneSystem.js` → `boolean`, true when `state.questIndex >= CAMPAIGN_QUEST_INDEXES.PREPARATION_START && (state.expansion?.phase ?? 0) === 0 && !state.gameOver`.
- Produces: `export const PREPARATION_QUEST_IDS = Object.freeze(['solar-research-foundation', 'data-center-modernization', 'wind-pilot-grid', 'tidal-coast-pilot'])` in `src/core/CampaignProgression.js` (verify these ids against `src/core/QuestDefinitions.js` first; use the real ids).

- [ ] **Step 1 — H1 final exam editable.** In `QuestSystem.js` `stageForQuest`: return `STAGES.REDESIGN` for `questIndex === CAMPAIGN_QUEST_INDEXES.FINAL_TEST` (REPORT is only set when `campaignComplete` becomes true — keep the existing `claimCurrentQuest` FINAL_TEST branch but set `state.stage = STAGES.REPORT` there). In `ClimateQuestSystem.js:352` change `state.stage = STAGES.REPORT` to `STAGES.REDESIGN`. Write the failing test first in `tests/e2e/unit/quest.spec.js`:

```js
test('quest 19 keeps the board editable so stress-test construction rules apply', () => {
  const state = new GameState();
  // drive state to quest 19 the same way existing tests in this file do (reuse helpers)
  state.questIndex = CAMPAIGN_QUEST_INDEXES.FINAL_TEST;
  state.stage = stageForQuest(state.questIndex); // export stageForQuest for tests
  state.stressTest.status = 'running';
  expect(state.isEditable).toBe(true);
  const validation = validatePlacement(state, 'residential', /* an empty active cell */ 1);
  expect(validation.ok).toBe(true);
  // cost multiplier is applied while the stress test runs
  const assessment = assessConstructionPlan({ ...state, constructionPlan: [{ index: 1, type: 'residential' }] });
  expect(assessment.totalCost).toBeCloseTo(FACILITIES.residential.cost * STRESS_TEST_RULES.CONSTRUCTION_COST_MULTIPLIER, 2);
});
```
Adapt names to the real exports (`assessConstructionPlan` return shape — read `ConstructionPlanSystem.js`). Run: `npx playwright test tests/e2e/unit/quest.spec.js --reporter=line --retries=0` → expect the new test to FAIL, then implement, then PASS.

- [ ] **Step 2 — H2 expansion re-prompt.** Add `expansionChoicePending(state)` to `ZoneSystem.js`. In `main.js` `boot()`, immediately after `refreshAll()` at the end of boot (after `bindEvents()`), add:

```js
if (expansionChoicePending(gameState)) eventBus.emit(Events.EXPANSION_CHOICE_REQUESTED, {});
```
Also emit it from `resetGame`? No — a fresh game is at quest 1. Browser test `tests/e2e/expansion-reprompt.spec.js`: boot, `page.evaluate` to set `questIndex = 7, expansion.phase = 0` on `window.__GAME_STATE__`, request a save (`window.__EVENT_BUS__.emit(window.__EVENTS__.SAVE_REQUESTED, {})`, wait 1s), `page.reload()`, wait for boot, then `expect(page.locator('#modalCard[data-modal-id="expansion-choice"]')).toBeVisible()` (read `StageModals.js` for the real modal id). Also assert choosing 동부 unlocks solar (`unlockedFacilities` contains 'solar') and `expansion.phase === 1`.

- [ ] **Step 3 — H3 migration.** In `migrateV8ToV9` after computing `questIndex`:
  - `const claimed = new Set(data.claimedQuestIds || [])`, `const unlocked = new Set(data.unlockedFacilities || ['residential'])`, `let expansion = structuredClone(data.expansion || {phase:0, firstChoice:null, activeCellIndices:[0..18]})`.
  - If `questIndex >= CAMPAIGN_QUEST_INDEXES.CLIMATE_START`: add all `PREPARATION_QUEST_IDS` to `claimed`; add `'battery', 'solar', 'wind'` to `unlocked`; if `expansion.phase === 1` set `expansion = { ...expansion, phase: 2, activeCellIndices: Array.from({ length: BOARD.MAX_CELLS }, (_, i) => i) }` and ensure `boardRadius = BOARD.EXPANDED_RADIUS` and `grid` has 37 entries (use `expandHexGrid` from `HexGridSystem.js` if the grid has 19).
  - If `expansion.phase >= 1 && expansion.firstChoice in EXPANSION_SIDES`: add `EXPANSION_SIDES[expansion.firstChoice].facility` to `unlocked`; if `phase === 2` add both sides' facilities.
  - Return `claimedQuestIds: [...claimed], unlockedFacilities: [...unlocked], expansion` in the migrated object.
  Tests in `state-v9.spec.js` (write first, watch fail):
  1. v8 `{ questIndex: 8, climateCampaign: { completedEventTypes: ['heatwave'] }, expansion: { phase: 1, firstChoice: 'east', activeCellIndices: [...28] }, unlockedFacilities: [...without wind], research: { completedIds: [] } }` → after `migrateSaveData` + `hydrate`: `questIndex === 12`, `claimedQuestIds` has all four preparation ids, `unlockedFacilities` has solar+wind+battery, `expansion.phase === 2`, 37 active cells, and `listResearchAvailability(state).find(r => r.id === 'tidal1').reasonCodes` does not contain `'quest:wind-pilot-grid'`.
  2. v8 `{ questIndex: 7, expansion: { phase: 1, firstChoice: 'west' }, unlockedFacilities: ['residential', ...no wind], climateCampaign: { completedEventTypes: [] } }` → `questIndex === 7`, `unlockedFacilities` has `'wind'`, and `listResearchAvailability(state).find(r => r.id === 'wind2').reasonCodes` does not contain `'facility:wind'`.

- [ ] **Step 4 — M4 no random events during the final exam.** In `CityEventSystem.advanceCityEvents` return the empty result when `state.questIndex >= CAMPAIGN_QUEST_INDEXES.FINAL_TEST` (in addition to the chapter < 3 check) so `ensureSchedule` never runs at 19. Test in `city-events.spec.js`: state at quest 19 with empty schedule → after `advanceCityEvents` the schedule is still `[]`.

- [ ] **Step 5 — M5 un-ready state quests.** In `evaluateCurrentQuest`, for quests 1, 3, 7 and 8 (the current-state predicates), compute `ready` from the predicate alone (drop the `ready = state.questStatus === 'ready_to_claim'` seed for those indexes) and when `wasReady && !ready` set `state.questStatus = 'active'`. Consecutive-day quests (handled in `applySimulationQuestProgress`) keep their existing behavior. Test: quest 8 ready with an Lv2 data center + smartGrid → set the data center cell to `null` → `evaluateCurrentQuest` → `questStatus === 'active'` and `claimCurrentQuest` returns `{ ok: false, reason: 'not_ready' }`.

- [ ] **Step 6 — M7 delete dead cases.** Remove the `case 11` … `case 14` block in `applySimulationQuestProgress` (~199–219) and any helper only they used. Confirm with `grep -n "summary.hour" src` → no matches.

- [ ] **Step 7 — M8 unit convention.** In `migrateV7ToV8` copy `elapsedGameHours` 1:1 into `elapsedGameDays` (remove the `/ 24`), matching every other counter (the tick was renamed, not rescaled). Update `state-v8.spec.js` expectation and add the comment `// v7 시(hour) 틱은 v8 일(day) 틱으로 1:1 이름만 바뀌었다.` Replace `workforceRebalanceGraceDays: 24` with a constant (`WORKFORCE_RULES.REBALANCE_GRACE_DAYS`, add it to Constants next to the existing workforce rules; grep for the value 24 used for the same purpose in `WorkforceSystem.js`/`SimulationSystem.js` and reuse one constant) and `timeScale: 1` with `TIME.DEFAULT_SCALE`.

- [ ] **Step 8 — Low: quest 19 claimed on pass.** Where `StressTestSystem` sets `state.campaignComplete = true`, also `state.claimedQuestIds.add(QUESTS[CAMPAIGN_QUEST_INDEXES.FINAL_TEST - 1].id)` and `state.questStatus = 'claimed'`, `state.stage = STAGES.REPORT`. Test in `stress-test.spec.js`: after a passing run `claimedQuestIds` contains the final quest id and `exportReport(state).completedQuests` (see `ReportSystem.js`) includes it.

- [ ] **Step 9 — Low: hardcoded quest numbers.** Replace literals in `QuestSystem.js` (43 `<= 5` → `CAMPAIGN_QUEST_INDEXES.FOUNDATION_END - 1` only if that is the real meaning: read the code — quests 1–5 are EXECUTION, 6+ REDESIGN; express as a named constant `EXECUTION_STAGE_LAST_QUEST = 5` in `CampaignProgression.js`), 55 (`Math.min(6, …)` → `FOUNDATION_END`), 62–66 (quest 4 baseline capture → `BASELINE_CAPTURE_QUEST = 4` constant), 87–93 and 115 (6 and 8 → `FOUNDATION_END` and `SECOND_EXPANSION_QUEST = 8` constant). `SimulationSystem.js:16-19`: key the carbon targets on `<= FOUNDATION_END`, `<= PREPARATION_END`, else. `BoardSystem.js:329,353`: use `questForState(state, index)` (from `QuestDefinitions.js`) so the west branch shows its own title. Run `grep -nE "questIndex (===|<=|>=|<|>) [0-9]+" src/systems src/ui` and eliminate every remaining literal that is not `1` (quest one) by naming it.

- [ ] **Step 10 — Run the covering tests.** `npx playwright test tests/e2e/unit/quest.spec.js tests/e2e/unit/state-v8.spec.js tests/e2e/unit/state-v9.spec.js tests/e2e/unit/city-events.spec.js tests/e2e/unit/stress-test.spec.js tests/e2e/unit/campaign-playthrough.spec.js tests/e2e/unit/quest-expansion-branch.spec.js tests/e2e/unit/climate-quests.spec.js tests/e2e/expansion-reprompt.spec.js --reporter=line --retries=0` → all pass. Note in the report any pre-existing failure you did not cause (list them by name; they are handled in Task 9).

---

### Task 2: State hygiene — load, save flush, storage guards, reset, layering, magic numbers (M9, M10, M11, M12, Low)

**Files:**
- Modify: `src/systems/SaveSystem.js` (`loadSavedGame` → recompute metrics; `pagehide`/`visibilitychange` flush; `stripObsoleteState` explicit key list; unknown-version handling; `SAVE_THROTTLE_MS` constant)
- Modify: `src/main.js` (remove duplicated 24/12/5% literals in toast copy at ~619–620; use `CITY_FAILURE_RULES`; `render_game_to_text` trimmed)
- Modify: `src/ui/SimulationHudView.js:93-94`, `src/ui/StageModals.js:820,827` (same literals → constants)
- Modify: `src/systems/CarbonCrisisSystem.js:5-6` (use `CARBON_CRISIS`)
- Modify: `src/systems/BoardSystem.js` (scoring weights 160–213, 1.45 at 231/236, 0.5 at 241, `4200` used at 475 before `GRID_EXPANSION_SETTLE_MS` is declared at 479 → move all to Constants: `SCORING`, `UPGRADE_COST_RATIOS`, `DEMOLITION_REFUND_RATIO`, `GRID_EXPANSION_SETTLE_MS`)
- Modify: `src/core/Constants.js` (add the constants above; remove the duplicate `SIMULATION.DAY_MS` in favor of `TIME.BASE_DAY_MS` and update the one caller)
- Move: `normalizeConstructionProject` and `isOperationalCell` helpers that `GameState.js` needs from `src/systems/ConstructionProjectSystem.js` to a new `src/core/ConstructionProject.js`; `ConstructionProjectSystem.js` re-exports them so no other import changes. `GameState.js` imports from `core/`.
- Modify: `src/ui/ThemeManager.js:21,38`, `src/ui/WorldLightingManager.js:21,38`, `src/ui/FloatingPanelController.js:25`, `src/ui/QuestPanelController.js:21` → use a new `src/core/safeStorage.js` (`readStorage(key)`, `writeStorage(key, value)`, `removeStorage(key)` wrapping try/catch, returning `null` on failure).
- Modify: `src/ui/QuestView.js:31-32`, `src/ui/StageModals.js:49`, `src/ui/DockView.js:12`, `src/ui/GridView.js:21-22`, `src/ui/OnboardingView.js:31` → each subscribes to `Events.GAME_RESET` in its init and resets its module-level state.
- Test: `tests/e2e/unit/state-v9.spec.js` (or new `tests/e2e/unit/save-system.spec.js`), `tests/e2e/game.spec.js` (reload keeps chart data), new `tests/e2e/unit/board-scoring.spec.js` only if scoring extraction changes any value (it must not — assert equality with the pre-change numbers you capture first).

**Interfaces:**
- Produces: `src/core/safeStorage.js` exports `readStorage(key): string|null`, `writeStorage(key, value): boolean`, `removeStorage(key): boolean`.
- Produces: `src/core/ConstructionProject.js` exports `normalizeConstructionProject`, `isOperationalCell` (same signatures as today).

- [ ] **Step 1 — M9.** In `loadSavedGame`, after a successful `hydrate`, call `refreshMetrics()` (import from `BoardSystem.js`; if that creates an import cycle SaveSystem→BoardSystem→SaveSystem, instead emit `Events.GAME_LOADED` and have `main.js` call `refreshMetrics()` in a `GAME_LOADED` listener registered before `loadSavedGame()`). Browser test in `game.spec.js`: place a facility, save, reload, then `render_game_to_text().metrics` is non-null and `#cityChart` canvas has non-transparent pixels after opening the 도시 panel (reuse the pixel helper from `chart-motion.spec.js`).
- [ ] **Step 2 — M10.** In `initSaveSystem` add `window.addEventListener('pagehide', persist)` and in the existing visibility handler (`main.js:629-632`) call `persist()` (export it as `flushSave()`) when hidden. Unit-style browser test: place a facility, immediately `page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))` with `document.hidden` stubbed true (use `Object.defineProperty(document, 'hidden', { value: true, configurable: true })`), reload, expect the facility present.
- [ ] **Step 3 — M11.** Create `safeStorage.js`; replace direct `localStorage` calls in the four UI files. Browser test: `page.addInitScript` that makes `localStorage` getters throw (`Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })`), boot, expect `#loadingScreen` gets class `done` and `#cityGrid` visible and zero page errors (`page.on('pageerror')`).
- [ ] **Step 4 — M12.** Add `GAME_RESET` listeners resetting `detailsExpanded`, `researchQuizReturnIndex`, `inspectorIndex`, `detailFacilityKey`, `facilityArmed`, `placementPreviewVisible`, `storyPage`. Browser test: arm a facility for placement (open build panel, click residential), trigger reset via `#resetBtn` + confirm, then hovering a cell must not show a ghost preview (`window.__getCityRendererStats().ghostVisible` or the existing preview hook — read `CityScene3D.js` `getCityRendererStats` for the field name; if none exists, assert via `window.__GAME_STATE__.constructionPlan.length === 0` after clicking a cell).
- [ ] **Step 5 — Low: layering.** Create `src/core/ConstructionProject.js`, move the pure helpers, re-export from the system, update `GameState.js` import. Verify `grep -rn "from '../systems" src/core` returns nothing.
- [ ] **Step 6 — Low: magic numbers.** Move the listed literals to Constants. Capture `calcMetrics` output for a fixed 5-facility grid BEFORE the change (write the test with the captured numbers) so the refactor is proven value-neutral. Replace the 24/12/5% copy in `main.js`, `SimulationHudView.js`, `StageModals.js` with template strings using `CITY_FAILURE_RULES.CREDIT_GAME_OVER_DAYS`, `ESSENTIAL_GAME_OVER_DAYS`, `ESSENTIAL_BLACKOUT_PERCENT`. `CarbonCrisisSystem.js` reads `CARBON_CRISIS.GAME_OVER_DAYS` and `WARNING_DAYS`. `SaveSystem.js:12` `10000` → `GAME.SIMULATION_SAVE_THROTTLE_MS`.
- [ ] **Step 7 — Low: stripObsoleteState / unknown version.** Replace the "delete every key starting with `ai`" rule with an explicit list of obsolete keys (grep the migration history for the names: `advisorQuestions`, `transcripts`, `aiAdvice`, plus whatever the current code deletes). For `migrated.v > SAVE_VERSION` in `loadSavedGame`, do NOT overwrite the newer save: keep the raw string under `${GAME.AUTOSAVE_KEY}-newer` and start fresh; unit test both.
- [ ] **Step 8 — Low: `render_game_to_text`.** Remove `stage`, `turn`, and replace `simulation: gameState.lastTickSummary` with a compact subset `{ netCredits, deliveredPower, demand, lowCarbonPercent, dailyCarbon, dailyWater, essentialSupplyPercent }`. Keep everything the existing tests read (grep `render_game_to_text` in `tests/` and keep those fields).
- [ ] **Step 9 — Run:** `npx playwright test tests/e2e/unit/state-v9.spec.js tests/e2e/unit/money.spec.js tests/e2e/unit/hex-board-rules.spec.js tests/e2e/game.spec.js tests/e2e/hud.spec.js tests/e2e/unit/carbon-crisis.spec.js --reporter=line --retries=0`, plus any new spec files. Report pre-existing failures by name.

---

### Task 3: Gameplay balance — dispatch-based carbon, water limits, report length, permits, dead rules (M1, M2, M3, M6, Low)

**Files:**
- Modify: `src/systems/PowerNetworkSystem.js` (expose per-source dispatched energy: `generationDispatchedByIndex`)
- Modify: `src/systems/EconomySystem.js` (generator `operationRatio` from dispatched/available; `round1(upkeep)` → `roundCredits`)
- Modify: `src/systems/FacilityOperationSystem.js:61-67` (idle floor constant)
- Modify: `src/systems/SimulationSystem.js:111-113` (essential ratio with zero essential facilities = 100)
- Modify: `src/systems/StressTestSystem.js` (water limits from exam-start baseline; violation cap), `src/systems/ClimateQuestSystem.js`/`CityEventSystem.js:149-151` (drought baseline captured at briefing acknowledgement)
- Modify: `src/systems/ReportSystem.js:71` (stressDays from phases; `designScore` hardcoded 0 at ~213 → compute from `state.metrics?.dev` or remove the axis and renormalize — read `SCORE_AXES` in Constants and pick the one the UI expects)
- Modify: `src/systems/CarbonCrisisSystem.js:29-35` (clear milestones when `carbonCrisisDays` returns to 0)
- Modify: `src/systems/ResearchSystem.js` (`cancelResearch` clears `quizCreditQuestionIds[researchId]`; remove `quizAccelerationBankDays` if nothing reads it — grep first; if removed, drop it from `GameState.serialize/hydrate/reset`, `render_game_to_text`, and adjust `state-v*.spec.js` expectations that assert it)
- Modify: `src/core/Constants.js` (row 7 add `wind: 2`; delete `FACILITY_LIMITS_BY_QUEST` rows that raise no limit (11 and 12 — verify with `getFacilityLimits`); remove `QUEST_REQUIREMENTS.FIRST_SOLAR_LOW_CARBON_PERCENT`; add `GENERATION_IDLE_EMISSION_RATIO: 0.25` under `ECONOMY_RULES`; `STRESS_TEST_RULES.MAX_WATER_VIOLATION_DAYS` 6 → 3; add `STRESS_TEST_RULES.BASE_WATER_LIMIT_RATIO: 1.0`)
- Delete: `src/systems/ObjectiveSystem.js`, `src/ui/ObjectiveView.js`, `src/core/ObjectiveDefinitions.js`, `Constants.FACILITY_LIMITS_BY_OBJECTIVE_STAGE`, `tests/e2e/unit/objectives.spec.js`, `tests/e2e/objectives-ui.spec.js` — but only after `grep -rn "ObjectiveView\|ObjectiveSystem\|OBJECTIVE_SETS\|FACILITY_LIMITS_BY_OBJECTIVE_STAGE" src` shows the only importer is `QuestView.js`; remove that import and any dead branch it fed. Keep `progression.objectiveSetId/objectiveProgress/completedObjectiveSetIds` in GameState (save compatibility) but stop writing them anywhere new.
- Test: `tests/e2e/unit/economy.spec.js`, `tests/e2e/unit/simulation.spec.js`, `tests/e2e/unit/stress-test.spec.js`, `tests/e2e/unit/campaign-report.spec.js`, `tests/e2e/unit/carbon-crisis.spec.js`, `tests/e2e/unit/research.spec.js`, `tests/e2e/unit/facility-permits.spec.js`, `tests/e2e/unit/quest-feasibility.spec.js`

**Interfaces:**
- Produces: `calculatePowerNetwork(...)` result gains `generationDispatchedByIndex: { [index]: number }` (energy actually routed from that source this tick, ≥ 0, ≤ `generationAvailableByIndex[index]`).
- Produces: `facilityEconomy[index].operationRatio` for generator cells (`supply > 0`, no demand) = `dispatched / available` (0 when available is 0).

- [ ] **Step 1 — M1 (write test first).** In `economy.spec.js`: grid = thermal (index 0) + solar (index 1) + one residential whose demand is fully covered by solar (use the real `FACILITIES` numbers to size it; if solar alone cannot cover it at the test's dayIndex, use two solar). Compute power via `calculatePowerNetwork` and economy via `settleEconomy`. Assert `facilityEnvironment[0].carbon` equals `FACILITIES.thermal.carbon * ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO` (±0.01) and that when the residential is removed from solar coverage (demand > solar), thermal carbon rises above that floor. Then implement: in `PowerNetworkSystem` accumulate `dispatched[index] += amount` wherever a route takes energy from `source.index` (routes already exist — read `routes` entries and sum by source index; add the field to the return object). In `EconomySystem` for cells with `stats.supply > 0 && !stats.demand`: `operationRatio = available > 0 ? dispatched/available : 0` using `power.generationDispatchedByIndex`/`generationAvailableByIndex` (pass them into `settleEconomy` via `facilityPower` — check what `facilityPower[index]` carries for generators and extend `main.js`/`SimulationSystem.js` callers only if needed). In `FacilityOperationSystem` replace the literal `0.25` with `ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO` and apply the same ratio to generator `water` (nuclear cooling water scales with output): `water = stats.water * (stats.demand > 0 ? powerRatio : stats.supply > 0 ? Math.max(idleRatio, operationRatio) : 1)`.
- [ ] **Step 2 — M2 water limits.** (a) Drought quest (`waterLimitRatio: 0.7` in `ClimateCampaignDefinitions.js:93`): when the briefing for that event is acknowledged (`acknowledgeClimateBriefing` in `ClimateQuestSystem.js`), store `state.climateCampaign.progress.waterBaseline = state.lastTickSummary?.dailyWater ?? state.baseline?.dailyWater ?? DEFAULT` and make `CityEventSystem.js:149-151` / `eventWaterLimit` prefer `climateCampaign.progress.waterBaseline` over `state.baseline.dailyWater`. (b) Final exam: in `startStressTest` store `state.stressTest.waterBaseline = state.lastTickSummary?.dailyWater ?? STRESS_TEST_RULES.DEFAULT_WATER_LIMIT`; `waterLimitFor(summary)` on non-limited days returns `round1(waterBaseline * STRESS_TEST_RULES.BASE_WATER_LIMIT_RATIO)` instead of the absolute default; heat-dome days keep `0.7 × waterBaseline` (pass `baselineWater: state.stressTest.waterBaseline` into `stressCityModifier`). Set `MAX_WATER_VIOLATION_DAYS: 3`. Tests in `stress-test.spec.js`: a city using 14 water before the exam does not violate on a baseline day at 14 but violates on a heat-dome day at 14; 4 violation days fail, 3 pass (adapt existing helper that builds a summary sequence). Update the copy that states water rules in `StageModals.js` (grep `물`) to describe "시험 시작 시 사용량 기준" instead of an absolute number.
- [ ] **Step 3 — M3.** `stressDays = STRESS_PHASES.reduce((s, p) => s + p.durationDays, 0)` (import from `EventDefinitions.js`); `campaign-report.spec.js` asserts blackout percentage uses 41.
- [ ] **Step 4 — M6 + dead rows.** Constants row 7 `wind: 2`; delete rows 11 and 12 after proving `getFacilityLimits(11)`/`(12)` equal `getFacilityLimits(10)` in `facility-permits.spec.js`, then assert row keys `[1..10, 13..19]`. Add a test: fresh state, `expandBoard(state, 'west')`, `questIndex = 7` → `validatePlacement(state, 'wind', <active west cell>)` is `ok: true`.
- [ ] **Step 5 — Low rules.** Essential ratio with no essential facilities → 100 (`simulation.spec.js`: empty grid summary `essentialSupplyPercent === 100` and `CityFailureSystem` does not count a blackout day). Carbon milestones: when `carbonCrisisDays` hits 0 clear `carbonWarningMilestones` (`carbon-crisis.spec.js`: warn at 24, recover to 0, climb to 24 again → second `warnings` entry). `round1(upkeep)` → `roundCredits(stats.upkeep)` (economy spec: Lv2 of a 0.1-upkeep facility yields 0.14). `cancelResearch` deletes `state.research.quizCreditQuestionIds[researchId]` (research spec: cancel then restart → `startResearchQuiz` returns ok with the full pool). `designScore`: read `ReportSystem.js` and `Constants` score axes; if `design` is an axis with weight, compute it as `clamp(state.metrics?.dev ?? 0)`; if the axis was removed, delete the field.
- [ ] **Step 6 — Objective layer removal** as listed in Files. Run `npx vite build` to prove no dangling imports.
- [ ] **Step 7 — Run:** the spec files listed under Test plus `tests/e2e/unit/campaign-playthrough.spec.js` and `tests/e2e/unit/climate-quests.spec.js`. If `quest-feasibility`/`campaign-playthrough` fail because thermal carbon dropped (quests got easier, never harder), update the expected numbers with a one-line justification in the test. Report pre-existing failures by name.

---

### Task 4: Modal queue, boot order, icons, modal accessibility, live regions (H4, H5, M14, M17, M19, Low)

**Files:**
- Modify: `src/ui/Modal.js` (priority queue; `role="dialog"`; focus trap; Escape; focus restore; `refreshIcons(root)`; export `hasIcon(name)`/`ICON_NAMES`)
- Modify: `src/main.js` boot order (~641–647) and every `refreshIcons()` call site (`HudView.js:108`, others via grep) to pass the node that was re-rendered
- Modify: `src/ui/StageModals.js` (assign `priority` to modal opens: game-over 2, operational-risk 2, stress-result 2, expansion-choice 1, climate briefing/result 1, event result 1, quest reward/celebration 1, everything else 0; fix `aria-valuenow` at 143 vs `aria-valuemax` at 567 to the same scale 0–100)
- Modify: `src/ui/OnboardingView.js` (story modal priority 0)
- Modify: `index.html:164-167` (`role="dialog" aria-modal="true" aria-labelledby="modalTitle"` on `#modalCard`; remove `aria-live="polite"` from `#simulationHud` and from `#facilityDetail`; add `<div id="srAnnouncer" class="sr-only" aria-live="polite"></div>`)
- Modify: `src/ui/SimulationHudView.js` (announce only when `climateAlert` changes, via `#srAnnouncer`), `src/ui/DockView.js:138`
- Test: new `tests/e2e/modal-queue.spec.js`, new `tests/e2e/unit/icon-registry.spec.js`, `tests/e2e/hud.spec.js` (Escape closes help modal; Tab stays inside)

**Interfaces:**
- Produces: `setModal(html, { id, pausesSimulation, dismissible, priority = 0, persistent = !dismissible })`. Rules: no active modal → show. Active with lower priority than the new one → displace: if active is `persistent`, push it to the FRONT of the queue, else emit its `MODAL_CLOSE` and drop it; show new. New priority lower than active → append to queue (queue is ordered by priority desc, then FIFO). Equal priority → replace (today's behavior: `MODAL_CLOSE` for the old one). `closeModal()` → emit `MODAL_CLOSE`, then if the queue is non-empty show its head. `clearModalQueue()` exported and called from `resetGame` in `main.js` and on `GAME_RESET`. `getModalState()` gains `queueLength`.
- Produces: `refreshIcons(root = document)`; `hasIcon(kebabName): boolean`; `ICON_NAMES: string[]` (kebab-case of every registered icon).

- [ ] **Step 1 — H4 queue (test first).** `modal-queue.spec.js`: (a) open the help modal (`#helpBtn`), then `page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.GAME_OVER, { summary: { dailyCarbon: 30 } }))` → `#modalCard[data-modal-id]` is the game-over id; (b) open the facility inspector on a placed cell (priority 0), emit `OPERATIONAL_RISK_PAUSE` with `{ reason: 'credit' }` → risk modal shown; close it → inspector is NOT re-shown (not persistent); (c) open the project-cancel confirmation (dismissible:false; find how `StageModals.js:602` is reached — cancel an in-progress build from the inspector), emit `OPERATIONAL_RISK_PAUSE` → risk modal; close → project-cancel modal is back; (d) boot with a game-over save and `onboardingVersionSeen: 0`: game-over modal is visible, `window.__getSimulationState().paused` (read the real field) is true, story not visible; after reset the story opens. Implement the queue in `Modal.js`.
- [ ] **Step 2 — boot order.** In `main.js` keep `openStory()` but give it priority 0 and open the game-over modal (priority 2) BEFORE it (it already is) — with the queue, the story is queued behind; on `resetGame` call `clearModalQueue()` then let the story open only if onboarding is unseen (the existing `openStory()` check).
- [ ] **Step 3 — H5 icons.** Add to `ICONS`: `Activity, BadgeCheck, Cloud, CloudFog, CloudRainWind, Factory, Flame, FlaskConical, HeartPulse, LockKeyhole, Recycle, ShieldCheck, Snowflake, ThermometerSun, Tornado, Wrench` (verify each exists in `node_modules/lucide` exports; if a name differs, use the real one and update the definition file's string). Unit test `icon-registry.spec.js`: read every `*.js` under `src/` and `index.html`, collect `data-lucide="…"`, `data-lucide='…'`, `icon: '…'` values, and assert each is in `ICON_NAMES` (skip a hardcoded allowlist of non-icon `icon:` strings if any turn up — list them in the test with a comment). Also assert the browser console has no `icon name was not found` warning during `hud.spec.js`'s first test (add `page.on('console')` capture there).
- [ ] **Step 4 — M14.** `refreshIcons(root = document)`: early return if `!root.querySelector('i[data-lucide]')`; call `createIcons({ icons: ICONS, root })` if lucide 1.35 supports `root` (check `node_modules/lucide/package.json` → main file for `root` in `createIcons`); otherwise implement with `createElement` from lucide over `root.querySelectorAll('i[data-lucide]')`, copying the `<i>` element's `class` and `aria-hidden` onto the SVG the way lucide's `replaceElement` does. Update `HudView.js:108` and every other call site found by `grep -rn "refreshIcons()" src` to pass the container they re-rendered. Keep the no-arg form working. Perf check: in `perf.spec.js` there is a HUD toggle test; add an assertion that after 20 ticks `document.querySelectorAll('svg[data-lucide]').length` is unchanged (icons are not re-created).
- [ ] **Step 5 — M17.** On `setModal`: set `cardEl` `role="dialog"`, `aria-modal="true"`, give the first `h1/h2/h3` inside the card `id="modalTitle"` and `aria-labelledby`; remember `document.activeElement` as opener; focus the first focusable element (`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`) after the anime enter animation starts; trap Tab/Shift+Tab within the card; `Escape` → `closeModal()` when `dismissible !== false`; on close restore focus to the opener if still connected. Tests in `hud.spec.js`: open help via keyboard (focus `#helpBtn`, press Enter), press `Tab` several times → `document.activeElement` stays inside `#modalCard`; press `Escape` → modal hidden and focus back on `#helpBtn`.
- [ ] **Step 6 — M19 + aria-valuenow.** Remove the two `aria-live` attributes; `SimulationHudView` writes `#srAnnouncer.textContent = '기후 경보: ' + label` only when `climateAlert` changes. Fix `StageModals.js:143` to write `Math.round(fraction * 100)`.
- [ ] **Step 7 — Run:** `npx playwright test tests/e2e/modal-queue.spec.js tests/e2e/unit/icon-registry.spec.js tests/e2e/hud.spec.js tests/e2e/mobile.spec.js tests/e2e/onboarding.spec.js tests/e2e/nonpausing-panels.spec.js tests/e2e/carbon-game-over.spec.js tests/e2e/stress-test-ui.spec.js tests/e2e/quest-ui.spec.js --reporter=line --retries=0`. Report pre-existing failures by name.

---

### Task 5: UI rule de-duplication, quest progress, emergency support, audio (M20, M21, M22, Low)

**Files:**
- Modify: `src/systems/QuestSystem.js` (add `export function questProgressFraction(state)` → 0..1 for the current quest, single source of truth; for research quests use the research job's `elapsedEffectiveDays / durationDays`, for modernization use `(hasLv2Data ? 0.5 : 0) + (smartGridDone ? 0.5 : 0)`, for consecutive-day quests `consecutiveDays / required`, for count quests `count / target`)
- Modify: `src/ui/QuestView.js:135-141, 404, 33, 66-71, 212-214, 230` (use `questProgressFraction`; remove `QUIZ_KINDS` and the dead quiz-quest branches; emergency support button also rendered in the quest panel when `credits <= EMERGENCY_SUPPORT.THRESHOLD` — move the `<= 1`, `+4`, penalty `2` from `QuestSystem.js:238-245` into `Constants.EMERGENCY_SUPPORT = { CREDIT_THRESHOLD: 1, GRANT: 4, ECONOMY_SCORE_PENALTY: 2 }`)
- Modify: `src/ui/DockView.js:78-79,107-114` (use `validatePlacement`/`facilityUnlockMessage`/`listResearchAvailability` results instead of recomputing lock/affordability/tidal research)
- Modify: `src/ui/ResearchView.js:65-68` (use `listResearchAvailability` + credits reason from the system; no local `canStart` formula)
- Modify: `src/ui/StageModals.js:303-304` (remove the `'living-neighborhood'` dead fallback; use the real quest via `FacilityPermitSystem` helper), `:719,754-758` (thresholds from `STRESS_TEST_RULES`), `:240` (credits via `formatCredits`)
- Modify: `src/ui/EventResultView.js:11`, `src/ui/QuestView.js:167` (use `formatCredits`)
- Modify: `src/ui/format.js` (single `compactMetric`; delete the copies in `DockView.js:25` and `SimulationHudView.js:19`)
- Modify: `src/ui/FeedbackBridge.js:8-28` + `src/ui/QuestView.js:107-127` (one `rewardText(quest, state)` in a new `src/ui/questText.js`)
- Modify: `src/audio/AudioManager.js` (BGM independent of SFX mute; resume on `pointerdown` OR `keydown`, each `{ once: true }`), `src/audio/sfx.js` (delete defs never emitted after wiring: keep `place, upgrade, demolish, correct, wrong, click`; wire `wrong` on a wrong quiz answer, `click` on quest claim; delete `problem-found`, `tile-ok`, `reveal`)
- Modify: `src/main.js:112` (remove `questPanelContextAction` dead ref) and `initQuestView` argument
- Test: `tests/e2e/unit/quest.spec.js` (progress fraction cases), `tests/e2e/quest-ui.spec.js` (emergency support in panel; quest 7 bar shows research progress), `tests/e2e/audio.spec.js` (SFX mute keeps BGM state; keyboard resume), `tests/e2e/research-ui.spec.js`, `tests/e2e/build-preview.spec.js`

**Interfaces:**
- Consumes: `questForState`, `listResearchAvailability`, `validatePlacement`, `facilityUnlockMessage` (existing).
- Produces: `questProgressFraction(state): number`, `Constants.EMERGENCY_SUPPORT`, `src/ui/questText.js` `rewardText(quest, state): string`.

- [ ] **Step 1 — M21/M22 (test first).** `quest.spec.js`: quest 7 (east) with `solar2` job at 60/120 days → `questProgressFraction` 0.5; quest 8 with Lv2 data center but no smartGrid → 0.5; quest 1 with one residential → 0.5. Implement, then make `QuestView` use it (delete the local `if questIndex === 1 …` block).
- [ ] **Step 2 — DockView/ResearchView.** Replace local rule copies with system calls; assert in `build-preview.spec.js` that a permit-capped facility card still shows the same title text as before (copy the exact current string from the test log or DOM before editing).
- [ ] **Step 3 — emergency support in panel.** Render the button in `.quest-panel-actions` when `gameState.credits <= EMERGENCY_SUPPORT.CREDIT_THRESHOLD && !state.emergencySupport.used`; clicking calls the same system function the quest-map modal uses. `quest-ui.spec.js`: set credits to 1, `__refreshGameForTest()`, expect the button in `#questPanel`, click, credits 5.
- [ ] **Step 4 — audio.** `startAmbientIfReady` depends on `musicEnabled` only; `AUDIO_TOGGLE_MUTE` no longer stops ambient; add `keydown` resume. `audio.spec.js`: toggle SFX mute → `window.__GAME_STATE__.musicEnabled` unchanged and `#musicBtn` still `aria-pressed="true"`; press a key first (no pointer) → audio context state becomes `running` (expose `window.__getAudioState()` returning `ctx?.state` from AudioManager).
- [ ] **Step 5 — copy/format dedupe** per Files list. `grep -rn "toFixed(" src/ui` must show no credit formatting outside `format.js`.
- [ ] **Step 6 — Run** the Test list with `--reporter=line --retries=0`. Report pre-existing failures by name.

---

### Task 6: Copy, CSS, touch targets, reduced motion, safe area, escaping (Low UI items)

**Files:**
- Modify: `index.html` (`#questPanelLevel` → empty; `#phaseText` → empty; `#questPanelReward` → empty; forecast strip default text → `예보 대기` and let `ForecastView` always render its state; `#buildForecastTimeline` summary `0시간` → `0일`; `.world-status` safe-area)
- Modify: `src/ui/ForecastView.js:25-28` (render the "locked until CH.3" text from JS using `CAMPAIGN_QUEST_INDEXES`)
- Modify: `src/style.css` (delete the 11 `.quest-tracker` rules; `.quest-panel-tools .icon-btn`, `.time-controls button`, `.simulation-hud > button` get `min-width: 44px; min-height: 44px` on coarse pointers via `@media (pointer: coarse)`; `.world-status { top: calc(5px + env(safe-area-inset-top)) }`; define `.forecasting`, `.climate-normal`, `.construction-console` or delete the JS toggles that reference them — grep each)
- Modify: `src/ui/HudView.js:107` (escape `header.guidance.text` with `escapeHtml`), `QuestCelebration.js:22`, `QuestView.js:402`, `StageModals.js:92,331` (escape dynamic parts)
- Modify: `src/ui/Modal.js:106`, `src/ui/ToastView.js:97`, `src/ui/StageModals.js:703` (skip/zero-duration anime when `matchMedia('(prefers-reduced-motion: reduce)').matches`; add `export const prefersReducedMotion = () => …` in `src/ui/format.js` or a new `src/ui/motionPreference.js`)
- Modify: terminology — in `src/ui/*.js` and `src/core/*Definitions.js` user-facing strings: "단계" when it means a quest → "퀘스트"; "임무" → "퀘스트"; "레벨"/"LEVEL" stays only in the quest-panel eyebrow `LEVEL n / 19`; "게임일" → "일". Produce the list of changed strings in the report.
- Test: `tests/e2e/mobile.spec.js` (touch target sizes ≥ 44 on the 390×844 project), `tests/e2e/hud.spec.js` (reduced-motion: with `page.emulateMedia({ reducedMotion: 'reduce' })` a toast appears with opacity 1 within 50 ms), `tests/e2e/unit/copy-terminology.spec.js` (new: scan `src/ui` and `src/core/*Definitions.js` for the regexes `/\d+\s*단계/` and `/임무/` and `/게임일/` and assert no matches except an allowlist you justify in the test)

- [ ] **Step 1** write `copy-terminology.spec.js` (fails), fix strings, passes.
- [ ] **Step 2** CSS + index.html changes; extend `mobile.spec.js` with a bounding-box check for the three control groups.
- [ ] **Step 3** escaping + reduced motion + tests.
- [ ] **Step 4 — Run:** `npx playwright test tests/e2e/mobile.spec.js tests/e2e/hud.spec.js tests/e2e/unit/copy-terminology.spec.js tests/e2e/event-forecast.spec.js tests/e2e/quest-ui.spec.js --reporter=line --retries=0`. Report pre-existing failures by name.

---

### Task 7: 3D renderer and performance (H6, M13, M15, M16, Low renderer items)

**Files:**
- Modify: `src/ui/CityScene3D.js` (`rebuildAmbientTopology` ~777–800; `syncConstructionHud` 692–724; `worldPosition` 654; `updateWindRotorInstances` 813; `syncBuildGhost` 1554; `renderFrame` 1629 tickProgress cache; `disposeCityScene3D` 1780+; construction badge clamp like the OX widget at 759–767; remove dead supplement/`energy.` branches; export `window.__disposeCitySceneForTest`)
- Modify: `src/ui/ContinuousClockView.js` (loop only while needed)
- Modify: `src/systems/CameraController.js:80-87` (`pointercancel` deletes its entry; `isGestureClick` computed from the live pointer entry so listener order does not matter)
- Modify: `src/systems/HexGridSystem.js:55-61` (`axialToWorld(coord, out)` writes into an optional scratch object)
- Modify: `src/assets/AssetLoader.js:72-86` (dispose `material.map` and other textures), `src/level/CityAssetLoader.js` (dispose fallback geometries after a successful swap; key jobs by `assetId + height` per the diff review's Low #5), `src/level/FacilityGeometryFactory.js` (`disposeFacilityFallbacks(types)`)
- Modify: `src/main.js` `simulateLoading` (drive `#loadingBar`/`#loadingText` from real asset progress via the existing `onProgress` callback in `initCityAssets`; delete the scripted fake steps)
- Modify: `docs/architectural-decisions/0003-city-kit-instanced-renderer.md` (ambient cadence 10 Hz; worst-case draw-call count)
- Test: `tests/e2e/perf.spec.js` (worst-case draw-call scenario: 37-cell mixed levels + night lighting + two active constructions + ambient effect + hover ghost; budget = measured worst case + 2, recorded in the ADR), `tests/e2e/unit/ambient-birds.spec.js`/`tests/e2e/ambient-city.spec.js` (bird visit survives a settle), `tests/e2e/construction-progress.spec.js` (no per-frame DOM writes when progress unchanged: count `MutationObserver` records on the badge pool over 300 ms while paused → 0), new `tests/e2e/dispose.spec.js` (after `__disposeCitySceneForTest()` `renderer.info.memory.geometries === 0 && textures === 0` — expose via the existing renderer stats)

- [ ] **Step 1 — H6 (test first).** `ambient-city.spec.js`: trigger a bird visit via `__triggerBirdVisitForTest`, call `__settleSimulationDay()` twice, assert `window.__getCityRendererStats().birds.active` (read the real stat name) is still true until `__finishBirdVisitForTest`. Fix `rebuildAmbientTopology` to keep `birdVisit` unless its `greenIndex` is no longer in `greenIndices`.
- [ ] **Step 2 — M13.** `ContinuousClockView`: `start()` keeps the rAF loop only while `shouldAnimate()` (injected: `() => timeScale > 0 && !paused && (hasActiveProjects || labelNeedsSubDayUpdates)`); when it returns false, render once and idle; `renderNow()`/`resume()` restart it. `main.js` passes `shouldAnimate: () => !simulationController.getState().paused && gameState.timeScale > 0 && gameState.grid.some(c => c?.project)`. In `syncConstructionHud`: cache child element refs on the badge object at acquire time; skip DOM writes when `Math.abs(tickProgress - badge.lastProgress) < 0.005`; reuse one scratch `Vector3`; call `getBoundingClientRect` once per frame; clamp badge positions into the container like the OX widget.
- [ ] **Step 3 — M15.** Extend `perf.spec.js` with the worst-case scenario; log the measured number in the report; set the budget constant in the test to measured + 2 and write the number and the scenario into ADR-0003.
- [ ] **Step 4 — M16.** Complete the dispose path (InstancedMesh `.dispose()` per layer, `instanceMatrix/instanceColor` freed, `material.map?.dispose()`, fallback geometries, extra level meshes, DOM overlay pools, listeners); expose `window.__disposeCitySceneForTest`; `dispose.spec.js` as above.
- [ ] **Step 5 — Low items** listed in Files (scratch objects, rotor map once per frame, ghost early-return, pointercancel, click detection, loading text, dead branches, ADR cadence). For `syncBuildGhost`: early-return when hovered index and armed type are unchanged.
- [ ] **Step 6 — Run:** `npx playwright test tests/e2e/perf.spec.js tests/e2e/ambient-city.spec.js tests/e2e/unit/ambient-birds.spec.js tests/e2e/unit/ambient-motion.spec.js tests/e2e/construction-progress.spec.js tests/e2e/continuous-clock.spec.js tests/e2e/unit/continuous-clock-view.spec.js tests/e2e/camera.spec.js tests/e2e/motion.spec.js tests/e2e/assets.spec.js tests/e2e/dispose.spec.js tests/e2e/build-preview.spec.js --reporter=line --retries=0`. Report pre-existing failures by name.

---

### Task 8: Docs, repository hygiene, build chunks (M23, M24, M25)

**Files:**
- Rewrite: `docs/gameplan.md` — describe the CURRENT game: title 2040 기후 생존 도시, hex board 19→28→37, continuous day ticks, 19 quests in four blocks with the east/west branch, research + quizzes, climate events 11–18, 41-day final exam, report axes (read `Constants.SCORE_AXES`/`ReportSystem.js`), out-of-scope list (no advisor, no presentation/vote). Keep a section `## 설계 변천` that summarizes the original 6-stage lesson-plan design (from the current file) and states which beats were dropped and why (cite `progress.md` session numbers). First line: `> 이 문서가 현재 구현의 기준이다. 지도안 원문은 lesson-plan-source.md, 개선 명세는 AI_CITY_GAMEPLAY_REDESIGN_SPEC.md.`
- Rewrite: `docs/tech.md` directory section — generate from the real `src/` tree (`find src -type f | sort`) with one-line responsibilities; time model "1틱 = 1게임일, 1× = 1000ms"; quest count 19; remove `DiagnosisSystem`, `AchievementSystem`, "5초=1시간".
- Modify: `.gitignore` (add `assets-source/archives/`, `.superpowers/`, `test-results/`) and run `git rm -r --cached assets-source/archives .superpowers` — **this is the one git index change this plan allows**; it untracks the files but keeps them on disk. Add to `assets-source/MANUAL_DOWNLOADS.md` a note that archives are not tracked and how to re-fetch (`npm run assets:fetch`).
- Modify: `vite.config.js` — split vendor chunks: `three` (+ `three/examples`), `chart.js`, and the rest; use `build.rollupOptions.output.manualChunks` (Vite 8/rolldown accepts it; if the build warns that the option is ignored, use `build.rolldownOptions.output.codeSplitting`/`advancedChunks` per the warning text) and verify with `npm run build` that `dist/assets/` contains at least three JS files and the largest is under 700 kB. Also lazy-load Chart.js: `ChartView.js` does `const { default: Chart } = await import('chart.js/auto')` (or the current import) on first `initChartView` render.
- Test: `tests/e2e/build-preview.spec.js` (already boots the built `dist`; add an assertion that more than one script chunk loaded), `tests/e2e/chart-motion.spec.js` (chart still renders after lazy load)

- [ ] **Step 1** gitignore + untrack + note. Verify `git status --short | grep archives | head` shows `D` lines only (not `??`).
- [ ] **Step 2** vite chunks + lazy chart; `npm run build`; run `tests/e2e/build-preview.spec.js tests/e2e/chart-motion.spec.js tests/e2e/unit/chart-view.spec.js`.
- [ ] **Step 3** docs rewrite. Ask no questions about design intent — derive it from `QuestDefinitions.js`, `ClimateCampaignDefinitions.js`, `EventDefinitions.js`, `Constants.js`, `progress.md`.

---

### Task 9: Test suite restoration and full green run (H7)

**Files:**
- Modify (stale expectations → current design): `tests/e2e/game.spec.js:229`, `tests/e2e/gameplay-redesign.spec.js`, `tests/e2e/hex-scene.spec.js:34`, `tests/e2e/hud.spec.js:185`, `tests/e2e/mobile.spec.js:91`, `tests/e2e/perf.spec.js:65,215`, `tests/e2e/unit/calendar.spec.js:10`, `tests/e2e/unit/carbon-crisis.spec.js:12,35`, `tests/e2e/unit/city-events.spec.js:103`, `tests/e2e/unit/city-modifiers.spec.js:43`, `tests/e2e/unit/climate.spec.js:41`, `tests/e2e/unit/construction-operations.spec.js:63,106`, `tests/e2e/unit/facility-tech.spec.js:87,148`, `tests/e2e/unit/zones.spec.js:95`, `tests/e2e/visual.spec.js:43,61,114,126,169` (snapshots: inspect each diff image under `test-results/` and only update when the change is an intended visual change from Tasks 1–8; describe each in the report)
- Restore (weakened tests): `tests/e2e/unit/quest-feasibility.spec.js:99` (numeric assertions back: quest 5 `lowCarbonPercent >= QUEST_REQUIREMENTS.TRANSITION_LOW_CARBON_PERCENT`, `dailyCarbon <= QUEST_REQUIREMENTS.TRANSITION_CARBON_MAX`, `netCredits > 0`; quest 6 `dailyWater <= 15` or the current rule's number), `tests/e2e/unit/campaign-playthrough.spec.js` (a west-branch reference campaign 1→19 that builds only through `validatePlacement`/`commitConstructionPlan`, never `state.grid[i] = …`), `tests/e2e/unit/quest-expansion-branch.spec.js:41,59` (replace grid injection with real placement), `tests/e2e/gameplay-redesign.spec.js` (one real HUD path for quests 1→6 using the helpers in `tests/helpers/playthrough.js`), `tests/e2e/unit/asset-registry.spec.js:99-105` (wind `triangles <= 800` back, or the measured real value with a comment)
- Real bugs surfaced by tests must be fixed in `src/` (e.g. `city-events.spec.js:103` — check whether the campaign briefing still owns the schedule or whether Task 1's gate is incomplete).

- [ ] **Step 1** Run the full suite once: `npx playwright test --reporter=line --retries=0 > /tmp/full-run.log 2>&1` (17 min). Classify each failure: stale expectation / intended visual change / real bug.
- [ ] **Step 2** Fix per classification. For each test you change, keep the same behavior under test; only the expected values move.
- [ ] **Step 3** Restore the weakened tests listed above.
- [ ] **Step 4** Full suite again with `--retries=0`; it must be 100 % green with zero `icon name was not found` warnings and zero page errors in the log. Include the final tally line in the report. `npm run build` must succeed.
