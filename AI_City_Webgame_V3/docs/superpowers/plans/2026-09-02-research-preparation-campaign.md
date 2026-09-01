# Research Preparation Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate and do not perform Git operations in this repository.

**Goal:** 연구 퀴즈 반복과 길이 단서를 제거하고, 연구·풍력·조력을 익히는 네 개의 준비 퀘스트를 추가해 캠페인을 19단계로 확장한다.

**Architecture:** 기존 `GameState`와 단일 퀘스트 커서를 유지한다. 일반 퀘스트 정산기에 7~10단계를 추가하고 기후 이벤트 구간만 11~18로 이동한다. 퀴즈 정답 기록과 연구 가용성 계산은 기존 상태를 재사용하며, V8 저장은 V9 마이그레이션으로 보존한다.

**Tech Stack:** JavaScript ES modules, Three.js web game architecture, Playwright Test, Vite.

**Spec:** `docs/superpowers/specs/2026-09-02-research-preparation-campaign-design.md`

## Global Constraints

- Git add, commit, push, branch, worktree, deploy를 실행하지 않는다.
- 단일 건설 확정 흐름과 3D 건설 UI를 수정하지 않는다.
- 맞힌 연구 문항만 재출제에서 제외하고 틀린 문항은 유지한다.
- 신규 캠페인은 1~19의 단일 퀘스트 커서를 사용한다.
- 기존 기후 이벤트 수치와 41일 최종시험 합격 기준은 바꾸지 않는다.
- 신규 공사 중 시설은 퀘스트 완료 조건에 포함하지 않는다.

---

### Task 1: 캠페인 경계와 퀘스트 정의

**Files:**
- Create: `src/core/CampaignProgression.js`
- Modify: `src/core/QuestDefinitions.js`
- Modify: `src/core/ClimateCampaignDefinitions.js`
- Test: `tests/e2e/unit/climate-campaign-definitions.spec.js`

**Interfaces:**
- Produces: `CAMPAIGN_QUEST_INDEXES` with `FOUNDATION_END`, `PREPARATION_START`, `PREPARATION_END`, `CLIMATE_START`, `CLIMATE_END`, `FINAL_TEST`.
- Produces: `QUESTS` containing preparation quests 7~10 and climate quests 11~18.
- Produces: `CLIMATE_QUEST_ORDER` equal to `[11,12,13,14,15,16,17,18]`.

- [ ] **Step 1: Write failing campaign-definition tests**

Assert literal quest count 19, the four new IDs and rewards, shifted climate order, unchanged event type order, and final test index 19.

- [ ] **Step 2: Run the definition tests and verify the old 15-quest layout fails**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/climate-campaign-definitions.spec.js`

- [ ] **Step 3: Add shared campaign boundaries and the new quest definitions**

Define:

```js
export const CAMPAIGN_QUEST_INDEXES = Object.freeze({
  FOUNDATION_END: 6,
  PREPARATION_START: 7,
  PREPARATION_END: 10,
  CLIMATE_START: 11,
  CLIMATE_END: 18,
  FINAL_TEST: 19,
});
```

Add `solar-research-foundation`, `data-center-modernization`, `wind-pilot-grid`, and `tidal-coast-pilot` between foundation and climate definitions. Extend normal quest rewards with `unlockResearch` and `upgradePermitLevel`.

- [ ] **Step 4: Shift climate definitions without changing their event values**

Move the eight definitions from 7~14 to 11~18. Remove duplicated battery, wind, tidal research, and Lv.2 permit rewards according to the spec.

- [ ] **Step 5: Run the definition tests and verify they pass**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/climate-campaign-definitions.spec.js`

### Task 2: 준비 퀘스트 평가와 상태 전환

**Files:**
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/systems/ClimateQuestSystem.js`
- Modify: `src/systems/CityEventSystem.js`
- Test: `tests/e2e/unit/quest.spec.js`
- Test: `tests/e2e/unit/climate-quests.spec.js`
- Test: `tests/e2e/unit/quest-feasibility.spec.js`

**Interfaces:**
- Consumes: `CAMPAIGN_QUEST_INDEXES` and shifted `QUESTS`.
- Produces: general quest evaluation for research completion, completed data-center upgrade, and delivered wind/tidal routes.
- Produces: climate lifecycle active only for quest 11~18.

- [ ] **Step 1: Write failing tests for quests 7~10**

Test these observable behaviors:

```text
Q7: solar2 completed -> ready immediately
Q8: operational data Lv.2 + smartGrid -> ready immediately
Q9: wind2 + wind route delivered >= 0.1 for two consecutive days -> ready
Q10: tidal1 + operational tidal + tidal route delivered >= 0.1 for two consecutive days -> ready
```

Also assert construction projects do not satisfy Q8 or Q10.

- [ ] **Step 2: Run the new quest tests and verify they fail on the old climate routing**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/quest.spec.js tests/e2e/unit/climate-quests.spec.js`

- [ ] **Step 3: Implement preparation evaluation and claiming**

Use `isOperationalCell`, `research.completedIds`, and real `summary.routes`. Apply Q7 reward upgrade permit, enter climate briefing only after Q10 claim, and move final-test handling to quest 19.

- [ ] **Step 4: Replace climate range literals with shared boundaries**

Update `ClimateQuestSystem` and `CityEventSystem` so 7~10 never schedules disasters and 11~18 preserves the existing event lifecycle.

- [ ] **Step 5: Run preparation and feasibility tests**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/quest.spec.js tests/e2e/unit/climate-quests.spec.js tests/e2e/unit/quest-feasibility.spec.js`

### Task 3: 연구 퀴즈 재출제 방지

**Files:**
- Modify: `src/systems/QuizSystem.js`
- Modify: `src/ui/QuestView.js`
- Test: `tests/e2e/unit/quest-quiz.spec.js`

**Interfaces:**
- Consumes: `state.research.quizCreditQuestionIds[researchId]`.
- Produces: `startResearchQuiz()` sessions containing only unanswered/incorrect questions.
- Produces: `{ ok: false, reason: 'no_questions_remaining' }` when no questions remain.

- [ ] **Step 1: Write failing tests for remaining-question sessions**

Verify one credited ID is absent, an incorrect ID remains, session `total` equals remaining count, and all four credited IDs return `no_questions_remaining`.

- [ ] **Step 2: Run the quiz tests and verify the credited question still appears**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/quest-quiz.spec.js`

- [ ] **Step 3: Filter credited questions before `startSession`**

Keep the existing duplicate-credit guard in `answerQuestQuiz`. Return the explicit empty result instead of opening a zero-question session.

- [ ] **Step 4: Show a clear no-questions notification**

Handle `no_questions_remaining` in the research quiz request listener with `이미 모든 가속 문항을 맞혔습니다.` and leave the data-center modal available.

- [ ] **Step 5: Run the quiz tests and verify they pass**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/quest-quiz.spec.js`

### Task 4: 퀴즈 선택지 길이와 내용 교정

**Files:**
- Modify: `src/core/ResearchQuizDefinitions.js`
- Test: `tests/e2e/unit/quest-quiz.spec.js`

**Interfaces:**
- Keeps: 11 research groups, four questions per group, 44 unique question IDs, exactly one correct option each.

- [ ] **Step 1: Add failing content-quality assertions**

Normalize each option with `Array.from(text.replace(/[\s\p{P}]/gu, '')).length`. Assert every question has two distractors within 25% of correct length and the correct option is not uniquely longest.

- [ ] **Step 2: Run the quiz test and record the failing question IDs**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/quest-quiz.spec.js`

- [ ] **Step 3: Rewrite only the failing distractors**

Use plausible domain-specific misconceptions rather than filler. Do not change question IDs, correct truth values, or explanations.

- [ ] **Step 4: Run the quiz content tests until all 44 questions pass**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/quest-quiz.spec.js`

### Task 5: 데이터센터 연구 목록 상태 정리

**Files:**
- Modify: `src/ui/ResearchView.js`
- Modify: `src/style.css`
- Test: `tests/e2e/research-ui.spec.js`

**Interfaces:**
- Consumes: `listResearchAvailability(gameState)`.
- Produces: no completed or active duplicate cards in `.research-grid`.
- Produces: locked cards with visible lock icon, `잠김` label, and existing detailed lock reason.

- [ ] **Step 1: Write failing browser tests**

Open a real data-center inspector and assert completed research cards are absent, active research appears only in the progress article, locked cards contain an SVG lock and readable status, and the empty state appears after all research is complete.

- [ ] **Step 2: Run the targeted UI tests and verify they fail**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/research-ui.spec.js`

- [ ] **Step 3: Filter and sort research availability in the view**

Remove `completed` and `active` items from the grid, sort available before locked, and render `모든 연구를 완료했습니다.` when the result is empty.

- [ ] **Step 4: Add an explicit locked visual state**

Keep titles readable. Dim and desaturate the card, add `lock-keyhole`, retain hover/focus tooltip, and keep the click toast for touch.

- [ ] **Step 5: Run the targeted UI tests and verify they pass**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/research-ui.spec.js`

### Task 6: 시설 허가와 캠페인 UI 번호 이동

**Files:**
- Modify: `src/core/Constants.js`
- Modify: `src/systems/FacilityPermitSystem.js`
- Modify: `src/ui/QuestView.js`
- Modify: `src/ui/HudView.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/systems/ReportSystem.js`
- Test: `tests/e2e/unit/facility-permits.spec.js`
- Test: `tests/e2e/quest-ui.spec.js`
- Test: `tests/e2e/climate-campaign-ui.spec.js`

**Interfaces:**
- Consumes: shared campaign boundaries.
- Produces: cumulative facility limits through quest 19 using maximum values rather than lowering a previous limit.
- Produces: correct `기후 대응 1/8` at quest 11 and final UI at quest 19.

- [ ] **Step 1: Write failing permit and UI-number tests**

Assert the exact preparation limits, wind availability for Q9, tidal allowance for Q10, no later limit regression, climate numbering 11~18, and final quest 19.

- [ ] **Step 2: Run the targeted tests and verify old index assumptions fail**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/facility-permits.spec.js tests/e2e/quest-ui.spec.js tests/e2e/climate-campaign-ui.spec.js`

- [ ] **Step 3: Update facility limit accumulation**

Add preparation limits, shift old increments by four, set the last quest to 19, and merge each type with `Math.max(previous, next)`.

- [ ] **Step 4: Update HUD and modal index consumers**

Use the shared boundaries for phase labels, climate positions, final test checks, priority availability, and help copy. Do not edit construction-panel behavior.

- [ ] **Step 5: Run targeted permit and UI tests**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/facility-permits.spec.js tests/e2e/quest-ui.spec.js tests/e2e/climate-campaign-ui.spec.js`

### Task 7: V8 to V9 save migration

**Files:**
- Modify: `src/core/GameState.js`
- Modify: `src/systems/SaveSystem.js`
- Create: `tests/e2e/unit/state-v9.spec.js`

**Interfaces:**
- Produces: `SAVE_VERSION = 9`.
- Produces: `migrateV8ToV9(data)` preserving city and research state while remapping quest progression.

- [ ] **Step 1: Write failing migration fixtures**

Cover foundation Q6, unclaimed first climate Q7, claimed heatwave/current old Q8, old final Q15, and campaign-complete saves. Assert buildings, projects, credits, jobs, quiz IDs, tech levels, and battery charge survive.

- [ ] **Step 2: Run the V9 tests and verify migration is missing**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/state-v9.spec.js`

- [ ] **Step 3: Implement and register `migrateV8ToV9`**

Reset an unclaimed first climate attempt to preparation Q7; otherwise shift old climate Q7~14 by four and old final Q15 to Q19. Preserve completed climate IDs and compatible scheduled event state.

- [ ] **Step 4: Run all save migration tests**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/state-v*.spec.js`

### Task 8: Quest-focused campaign regression and final verification

**Files:**
- Modify: `tests/e2e/unit/campaign-playthrough.spec.js`
- Modify: `tests/e2e/gameplay-redesign.spec.js`
- Modify: `tests/e2e/unit/stress-test.spec.js`
- Modify: `tests/e2e/unit/city-events.spec.js`
- Modify: `tests/e2e/unit/facility-tech.spec.js`
- Modify: `tests/e2e/game.spec.js`
- Modify: `tests/e2e/objectives-ui.spec.js`
- Modify: `tests/e2e/stress-test-ui.spec.js`
- Modify: `tests/e2e/visual.spec.js`
- Modify: `tests/e2e/perf.spec.js`
- Modify: `tests/e2e/demolition-warning.spec.js`

**Interfaces:**
- Verifies: one cursor reaches quest 19 through real research, power, economy, climate, and stress-test rules.

- [ ] **Step 1: Extend the reference playthrough through preparation quests 7~10**

Complete real research outcomes, a completed data-center upgrade, delivered wind routes, and delivered tidal routes before starting climate Q11.

- [ ] **Step 2: Shift existing climate fixtures to quests 11~18 and final state to 19**

Keep all event types and the 41-day reference city unchanged.

- [ ] **Step 3: Run the focused research and campaign suite**

Run: `npm test -- --workers=1 --retries=0 tests/e2e/unit/quest-quiz.spec.js tests/e2e/unit/research.spec.js tests/e2e/unit/quest.spec.js tests/e2e/unit/quest-feasibility.spec.js tests/e2e/unit/climate-quests.spec.js tests/e2e/unit/climate-campaign-definitions.spec.js tests/e2e/unit/campaign-playthrough.spec.js tests/e2e/unit/facility-permits.spec.js tests/e2e/unit/state-v*.spec.js tests/e2e/research-ui.spec.js tests/e2e/quest-ui.spec.js tests/e2e/climate-campaign-ui.spec.js`

- [ ] **Step 4: Run the production build**

Run: `npm run build`

- [ ] **Step 5: Review the implementation against the approved spec**

Confirm all four user requests are represented by observable behavior. Do not run construction, 3D, visual, performance, or unrelated full-suite regressions.
