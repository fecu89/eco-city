# Operations, Research, and Quest UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a coherent early-game economy, readable quest flow, targeted research quizzes, polished facility console, movable HUD panels, audible BGM, and verified 15-quest campaign.

**Architecture:** Quest and research content remain definition-driven, while systems expose deterministic state transitions and UI modules render them. A reusable floating-panel controller replaces the quest-only singleton. The global modal remains the single top layer for blocking actions and the EventBus carries cross-module requests and feedback.

**Tech Stack:** JavaScript ES modules, Three.js 0.185, Web Audio API, anime.js, Lucide, Vite 8, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-operations-research-quest-ux-design.md`

## Global Constraints

- Use test-driven development: add a failing focused test, run it, implement the smallest complete behavior, and rerun it.
- Put gameplay thresholds, durations, colors, and layout constants in `src/core/Constants.js`.
- Preserve EventBus communication between UI modules and systems.
- Desktop panels drag from their ordinary header; mobile panels remain bottom sheets.
- Do not add external audio or asset dependencies.
- Do not run Git write operations of any kind.

---

### Task 1: Blocking demolition alert and tool-rail cleanup

**Files:**
- Modify: `src/ui/StageModals.js`
- Modify: `index.html`
- Modify: `src/style.css`
- Test: `tests/e2e/demolition-warning.spec.js`

**Interfaces:**
- Produces: `openDemolitionBlockedModal(index, permit)` inside `StageModals.js`.
- Preserves: `openFacilityInspectorModal(index)` as the return destination.

- [ ] Add a browser test that clicks demolition on the final thermal reserve and expects modal id `demolition-blocked`, restriction text inside `#modalCard`, no competing priority toast, and an unchanged grid.
- [ ] Run `npx playwright test tests/e2e/demolition-warning.spec.js` and confirm the new expectation fails.
- [ ] Replace both blocked-demolition toast branches with a top-level modal that includes `확인` and returns to the inspector.
- [ ] Delete the `.hud-rail-label` markup and remove its obsolete CSS.
- [ ] Rerun the focused test and the HUD test file.

### Task 2: Early quest progression, expanded details, and reward alerts

**Files:**
- Modify: `src/core/QuestDefinitions.js`
- Modify: `src/core/Constants.js`
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/ui/QuestView.js`
- Modify: `src/ui/FeedbackBridge.js`
- Modify: `src/ui/QuestCelebration.js`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `src/main.js`
- Test: `tests/e2e/unit/quest.spec.js`
- Test: `tests/e2e/quest-ui.spec.js`

**Interfaces:**
- Produces: `quest.reward.unlockFacilities: readonly string[]` and `quest.details: readonly string[]`.
- Produces: `claimCurrentQuest(state)` result with `unlockedFacilities`, `nextQuest`, and `campaignComplete`.
- Produces: quest detail controls `#questPanelExpandBtn` and `#questPanelDetails`.

- [ ] Add unit expectations that quest 1 unlocks factory and thermal, quest 2 requires an adjacent pair, quest 3 retains two profitable operating hours, quest 5 uses low-carbon 40% and `CO₂/h <= 12`, and quest 8 has no duplicate quiz gate.
- [ ] Add browser expectations that quest details expand in place and a claim produces a reward alert without opening a level-up modal.
- [ ] Run the two focused test files and confirm the new expectations fail.
- [ ] Extend quest definitions with detailed conditions and multiple unlocks; update reward formatting and claim application.
- [ ] Make quest 2 immediately claimable once the adjacent pair exists; add factory to the quest-2 cap and order factory before thermal in the unlocked dock.
- [ ] Remove `openRewardModal`; emit the reward alert and next-quest event after claiming, while opening the final report directly after quest 15.
- [ ] Implement accessible expand/collapse state and wrapped detail markup inside the quest panel.
- [ ] Rerun both focused test files.

### Task 3: Research-specific quiz definitions and deterministic option shuffling

**Files:**
- Create: `src/core/ResearchQuizDefinitions.js`
- Modify: `src/core/Constants.js`
- Modify: `src/core/GameState.js`
- Modify: `src/systems/QuizSystem.js`
- Modify: `src/systems/ResearchSystem.js`
- Modify: `src/systems/SaveSystem.js`
- Test: `tests/e2e/unit/quest-quiz.spec.js`
- Test: `tests/e2e/unit/research.spec.js`
- Test: `tests/e2e/unit/state-v5.spec.js`

**Interfaces:**
- Produces: `RESEARCH_QUIZZES: Readonly<Record<researchId, readonly Question[]>>`, exactly four questions for each of `solar2`, `wind2`, `battery2`, `tidal1`, and `renewable3`.
- Produces: `startResearchQuiz(state, researchId, random?)`.
- Changes: `accelerateResearchFromQuiz(state, researchId, hours)` targets one active job.
- Stores: `state.quizResearchId: string | null`.

- [ ] Add unit tests asserting 5×4 unique research questions, seeded answer-order variation, preserved correct-answer identity, no source mutation, and no acceleration of unrelated jobs.
- [ ] Run the focused unit tests and confirm failures.
- [ ] Add the 20 concise energy questions and materialize shuffled options into each quiz session.
- [ ] Add targeted acceleration equal to `definition.durationHours / 4` for each correct research answer; do not bank or apply final-quest answers.
- [ ] Add save defaults/migration for `quizResearchId` without changing save-version compatibility.
- [ ] Rerun the focused unit tests.

### Task 4: Tabbed facility console and research acceleration flow

**Files:**
- Modify: `src/ui/StageModals.js`
- Modify: `src/ui/ResearchView.js`
- Modify: `src/ui/QuestView.js`
- Modify: `src/core/EventBus.js`
- Modify: `src/style.css`
- Test: `tests/e2e/research-ui.spec.js`
- Test: `tests/e2e/quest-ui.spec.js`
- Test: `tests/e2e/visual.spec.js`

**Interfaces:**
- Emits: `Events.RESEARCH_QUIZ_REQUESTED` with `{ researchId, dataCenterIndex }`.
- Produces: facility-console tabs with `data-facility-tab="operation|research|management"`.
- Produces: `data-research-accelerate="<researchId>"` only for the active job assigned to the current center.

- [ ] Add browser tests for sticky console zones, data-center tab order, a scrollable research body, and the acceleration button opening the selected research's four-question quiz.
- [ ] Run focused UI tests and confirm failures.
- [ ] Split inspector content into operation, research, and management render functions; preserve live power/income refresh.
- [ ] Add the research acceleration event and render a quiz launch button beside the active job.
- [ ] Reuse the quiz modal renderer for research sessions and show targeted acceleration feedback after each answer.
- [ ] Add responsive console styling matching the quest panel; rerun focused and visual tests.

### Task 5: Reusable floating panel controller

**Files:**
- Create: `src/ui/FloatingPanelController.js`
- Modify: `src/ui/QuestPanelController.js`
- Modify: `src/core/Constants.js`
- Modify: `src/main.js`
- Modify: `index.html`
- Modify: `src/style.css`
- Test: `tests/e2e/hud.spec.js`
- Test: `tests/e2e/quest-ui.spec.js`

**Interfaces:**
- Produces: `createFloatingPanelController({ panel, dragSurface, keyboardSurface, storageKey, topSafeElement, rightSafeElement, mobileQuery, onPositionChanged? })` returning `{ applyPosition, destroy }`.
- Keeps: quest pin behavior in `QuestPanelController` as a thin wrapper around the shared controller.

- [ ] Add desktop pointer and keyboard tests for independent quest/status/settings positions and persistence, plus a mobile test proving inline drag positioning is cleared.
- [ ] Run focused HUD tests and confirm failures.
- [ ] Extract clamping, pointer capture, keyboard movement, persistence, and responsive reset into an instance-based controller.
- [ ] Wire status and settings headers as drag surfaces; keep close buttons interactive and bring the active panel forward while dragging.
- [ ] Preserve quest pin semantics and rerun focused tests.

### Task 6: Background music startup and audible procedural loop

**Files:**
- Modify: `src/audio/AudioManager.js`
- Modify: `src/audio/bgm.js`
- Modify: `src/core/Constants.js`
- Modify: `src/core/GameState.js`
- Modify: `src/main.js`
- Test: `tests/e2e/audio.spec.js`

**Interfaces:**
- Produces: `getAmbientPlaybackState()` for deterministic diagnostics.
- Guarantees: enabling music before or during the first pointer gesture starts one ambient graph after `AudioContext.resume()` resolves.

- [ ] Add a fake-AudioContext browser test for first-click enable, resume/start ordering, duplicate prevention, toggle-off cleanup, and saved disabled preference.
- [ ] Run the audio test and confirm it fails at first-click startup.
- [ ] Await context resume before calling `startAmbientIfReady`; make new games music-enabled while respecting restored values.
- [ ] Replace the barely audible static drone with a low-volume procedural chord/pulse loop whose nodes are completely stopped on disable.
- [ ] Synchronize the music button's active/title state after save load and rerun the audio test.

### Task 7: Fifteen-quest real-system feasibility audit

**Files:**
- Create: `tests/e2e/unit/quest-feasibility.spec.js`
- Modify: `src/core/QuestDefinitions.js` only if the audit exposes contradictory copy.
- Modify: `src/systems/QuestSystem.js` only if the audit exposes an unreachable condition.
- Modify: `progress.md`

**Interfaces:**
- Uses: `calculatePowerNetwork`, `settleEconomy`, `applySimulationQuestProgress`, `claimCurrentQuest`, and research completion APIs.
- Proves: each quest has at least one reachable state under its unlocks, caps, credits, adjacency rules, and required consecutive duration.

- [ ] Build a deterministic representative campaign state without forging `hourlyCarbon`, `hourlyWater`, `lowCarbonPercent`, power ratios, or net credits.
- [ ] Run the feasibility test and record any failing quest with its actual summary.
- [ ] Correct only contradictions revealed by actual-system output, keeping quest 5 at `CO₂/h <= 12`.
- [ ] Rerun the feasibility test until all 15 levels pass in order.
- [ ] Record the changed progression and audit result in `progress.md`.

### Task 8: Full verification

**Files:**
- Verify only; repair regressions in their owning task files.

**Interfaces:**
- Produces: build, runtime, visual, and full-suite evidence.

- [ ] Run focused unit and browser suites for quest, quiz, research, demolition, HUD, save, and audio behavior.
- [ ] Run `npm run build` and capture bundle warnings without treating the existing Three.js size warning as a failure.
- [ ] Run `npx playwright test tests/e2e/visual.spec.js` and inspect desktop/mobile screenshots for clipping and overlap.
- [ ] Run `npm test` once focused suites pass.
- [ ] Stop the local Vite server and report exact pass/fail totals, file changes, remaining risks, and that no Git write operation was performed.
