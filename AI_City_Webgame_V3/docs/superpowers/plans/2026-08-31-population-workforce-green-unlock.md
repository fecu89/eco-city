# Population Capacity and Early Green Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주거지가 공급하는 인구를 모든 운영 시설이 소비하고, 인구를 초과하는 건설·강화·주거지 철거를 막으며, 녹지를 LEVEL 3부터 해금한다.

**Architecture:** 새 `WorkforceSystem`이 최대 37칸 도시의 인구 공급과 사용량을 한 번 계산한다. 건설 계획·강화·철거·경제·UI는 이 순수 함수의 동일 결과를 소비하며 파생 인구 값은 저장하지 않는다.

**Tech Stack:** JavaScript ES modules, Three.js r185, Vite 8, Playwright

**Spec:** `docs/superpowers/specs/2026-08-31-population-workforce-green-unlock-design.md`

## Global Constraints

- 주거지 공급은 레벨별 10/15/22명이다.
- 공장 4/6/8, 화력 2/3/4, 데이터센터 3/5/7, 핵발전 5/7/9명을 사용한다.
- 태양광·풍력·저장장치·순환냉각은 1/2/3, 조력은 2/3/4, 녹지는 0명을 사용한다.
- 최종 일괄 건설 계획만 인구를 검증해 같은 계획의 주거지 공급을 인정한다.
- 기존 저장 건물은 삭제하지 않고 부족을 악화하는 동작만 막는다.
- 녹지는 퀘스트 2 완료 보상, LEVEL 3 허가 1개다.
- Git add/commit/push, 배포, PR, worktree 작업을 수행하지 않는다.

---

### Task 1: Population calculation source of truth

**Files:**
- Create: `src/systems/WorkforceSystem.js`
- Modify: `src/core/Constants.js`
- Modify: `src/systems/EconomySystem.js`
- Test: `tests/e2e/unit/workforce.spec.js`
- Test: `tests/e2e/unit/economy.spec.js`

**Interfaces:**
- Produces: `calculateWorkforce(grid)`, `workforceDeltaForCell(type, fromLevel, toLevel)`, `validateWorkforceGrid(grid)`.
- `calculateWorkforce` returns `{ capacity, used, available, shortage, utilization, workforce, jobs, industryFill, employmentRate }`.

- [ ] Write tests asserting a Lv.1 home supplies 10, thermal uses 2, data uses 3, all facility mappings respect levels, and an empty city is valid.
- [ ] Run `npm test -- --reporter=line --retries=0 tests/e2e/unit/workforce.spec.js tests/e2e/unit/economy.spec.js` and confirm the new tests fail because `WorkforceSystem.js` does not exist.
- [ ] Add all balance arrays to `WORKFORCE_LEVELS`, implement the pure workforce functions, and make `EconomySystem.calculateLabor` delegate to `calculateWorkforce`.
- [ ] Re-run the focused tests and confirm the literal population totals and existing credit rules pass.

### Task 2: Atomic construction, upgrade, and demolition constraints

**Files:**
- Modify: `src/systems/ConstructionPlanSystem.js`
- Modify: `src/systems/BoardSystem.js`
- Modify: `src/systems/FacilityPermitSystem.js`
- Modify: `src/ui/StageModals.js`
- Test: `tests/e2e/unit/construction-plan.spec.js`
- Test: `tests/e2e/unit/facility-permits.spec.js`
- Test: `tests/e2e/demolition-warning.spec.js`

**Interfaces:**
- `assessConstructionPlan` adds a `{ reason: 'insufficient_workforce', shortage, message }` error when its final projected grid is short.
- `validateUpgrade` returns `insufficient_workforce` with the projected population result.
- `validateDemolitionPermit` composes the nuclear reserve and workforce rules and returns a blocking message.

- [ ] Write failing tests for a staffed facility-only plan, a balanced home+facility batch, a worker-heavy upgrade, a residence demolition that creates shortage, and a legacy shortage recovery action.
- [ ] Run the focused tests and confirm each new assertion fails for the missing workforce rule.
- [ ] Validate only the final projected construction grid, validate upgrade/demolition projected grids, and reuse the existing topmost demolition-blocked modal.
- [ ] Re-run focused tests and confirm atomicity, exact shortage messages, nuclear reserve behavior, and recovery behavior pass.

### Task 3: Population HUD and build forecast

**Files:**
- Modify: `index.html`
- Modify: `src/ui/SimulationHudView.js`
- Modify: `src/ui/DockView.js`
- Modify: `src/ui/GridView.js`
- Modify: `src/ui/StageModals.js`
- Modify: `src/style.css`
- Test: `tests/e2e/hud.spec.js`
- Test: `tests/e2e/mobile.spec.js`
- Test: `tests/e2e/build-preview.spec.js`

**Interfaces:**
- HUD text is `${used}/${capacity}` with label `사용 인력 N, 전체 인구 M`.
- The construction forecast adds `data-metric="labor"` and reads `current.labor` and `projected.labor`.
- Facility detail uses `인구 +N`, `필요 인력 N명`, or `필요 인력 없음`.

- [ ] Write failing browser tests for the top HUD ordering/value, facility details, insufficient-workforce confirmation state, and a balanced batch becoming confirmable.
- [ ] Run those tests and confirm they fail on the old `workforce/jobs` order and missing forecast metric.
- [ ] Implement the fifth compact metric, exact accessibility labels, facility copy, console labor metric, and responsive five-column layout.
- [ ] Re-run desktop and mobile focused tests and inspect one screenshot at 390×844 and one at 1280×720.

### Task 4: Early green unlock and quest feasibility

**Files:**
- Modify: `src/core/QuestDefinitions.js`
- Modify: `src/core/Constants.js`
- Test: `tests/e2e/unit/quest.spec.js`
- Test: `tests/e2e/unit/facility-permits.spec.js`
- Test: `tests/e2e/unit/quest-feasibility.spec.js`
- Test: `tests/e2e/quest-ui.spec.js`

**Interfaces:**
- Quest 2 reward has `unlockFacilities: ['green']`.
- Quest 3 cumulative permit includes `green: 1`; quests 6 and 9 increase it to 2 and 3.
- Quest 9 no longer unlocks green.

- [ ] Write failing tests for green locked at LEVEL 2, unlocked after claiming quest 2, one green permit at LEVEL 3, and no duplicate quest 9 unlock.
- [ ] Run focused tests and confirm the old quest 9-only unlock fails the new expectations.
- [ ] Move the unlock and permit increases, update reward text, and add sufficient homes to representative feasibility fixtures without weakening quest conditions.
- [ ] Re-run all quest and feasibility tests and confirm all 15 quests remain reachable.

### Task 5: Integrated verification and documentation

**Files:**
- Modify: `progress.md`
- Test: all Playwright suites

- [ ] Run `npm test -- --reporter=line` and confirm zero failures.
- [ ] Run `npm run build` and confirm Vite exits 0; record the existing Three.js chunk warning separately.
- [ ] Run `git diff --check` and confirm no whitespace errors without writing Git state.
- [ ] Update `progress.md` with population rules, early green progression, smoke improvement, exact test count, build sizes, and the no-Git guarantee.

