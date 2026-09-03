import { test, expect } from '@playwright/test';
import { GameState, gameState } from '../../../src/core/GameState.js';
import { CAMPAIGN_PACING, STAGES, STRESS_TEST_RULES } from '../../../src/core/Constants.js';
import { questForState } from '../../../src/core/QuestDefinitions.js';
import { stressTestTotalDays } from '../../../src/core/EventDefinitions.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import { commitConstructionPlan } from '../../../src/systems/ConstructionPlanSystem.js';
import {
  demolishCell,
  expandBoard,
  upgradeCell,
  validatePlacement,
} from '../../../src/systems/BoardSystem.js';
import {
  createEnvironment,
  defaultRotationFor,
  isCoastalCell,
  optimalRotationFor,
  tidalRangeAt,
} from '../../../src/systems/EnvironmentSystem.js';
import {
  accelerateResearchFromQuiz,
  advanceResearchOneDay,
  researchDemandByIndex,
  startResearch,
} from '../../../src/systems/ResearchSystem.js';
import {
  applySimulationQuestProgress,
  claimCurrentQuest,
  evaluateCurrentQuest,
} from '../../../src/systems/QuestSystem.js';
import { acknowledgeClimateBriefing } from '../../../src/systems/ClimateQuestSystem.js';
import { startStressTest } from '../../../src/systems/StressTestSystem.js';

const settleDay = createDaySettler({
  calculatePowerNetwork,
  settleEconomy,
  evaluateQuest: applySimulationQuestProgress,
});

// 칸별 풍향과 해안 조차는 판마다 무작위다. 이 캠페인은 자연 조건 운이 아니라 도시 설계가
// 19단계를 통과하는지를 검증하므로 씨앗을 고정한다. 20400134는 기준 도시가 조력을 세우는
// 19번 해안 칸의 조차가 정확히 기준값(5m → 출력 100%)이라 예전 밸런스를 그대로 잰다.
const ENVIRONMENT_SEED = 20400134;

function seededState() {
  const state = new GameState();
  state.environment = createEnvironment(ENVIRONMENT_SEED);
  return state;
}

function facility(state, type, index, level = 1, extra = {}) {
  return {
    type,
    level,
    // 방향은 건설할 때만 고른다. 고정 배치도 "모달을 확인한 플레이어"처럼 최적 방향으로 세운다.
    rotation: optimalRotationFor(state, type, index) ?? defaultRotationFor(type),
    priority: ['residential', 'cooling'].includes(type) ? 'essential' : 'normal',
    ...extra,
  };
}

function place(state, placements, { clear = false } = {}) {
  if (clear) state.grid = Array(state.grid.length).fill(null);
  placements.forEach(([index, type, level = 1, extra = {}]) => {
    state.grid[index] = facility(state, type, index, level, extra);
  });
}

function settleDays(state, days) {
  for (let day = 0; day < days; day += 1) {
    settleDay(state);
    expect(state.gameOver, `day ${state.elapsedGameDays}: ${state.gameOverReason}`).toBe(false);
  }
}

function settleUntilReady(state, maximumDays = 48) {
  for (let day = 0; day < maximumDays && state.questStatus !== 'ready_to_claim'; day += 1) {
    settleDays(state, 1);
  }
  expect(state.questStatus, `quest ${state.questIndex}: ${JSON.stringify(state.questProgress)}`).toBe('ready_to_claim');
}

function claim(state, expectedQuest) {
  expect(state.questIndex).toBe(expectedQuest);
  const result = claimCurrentQuest(state);
  expect(result.ok, `claim quest ${expectedQuest}: ${result.reason}`).toBe(true);
  return result;
}

function finishFoundation(state) {
  place(state, [[1, 'residential'], [2, 'residential']]);
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  claim(state, 1);

  place(state, [[13, 'thermal'], [4, 'factory']]);
  settleUntilReady(state);
  claim(state, 2);

  place(state, [[8, 'green']]);
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  claim(state, 3);

  place(state, [[0, 'data'], [3, 'residential'], [7, 'residential'], [12, 'thermal']]);
  settleUntilReady(state);
  claim(state, 4);

  state.grid[12] = null;
  place(state, [[5, 'nuclear']]);
  settleUntilReady(state);
  claim(state, 5);

  place(state, [[6, 'cooling']]);
  settleUntilReady(state);
  claim(state, 6);

  expect(state).toMatchObject({
    questIndex: 7,
    questStatus: 'active',
    climateCampaign: { status: 'locked' },
    progression: { chapter: 2 },
  });
}

function finishPreparation(state) {
  state.research.completedIds.add('solar2');
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  claim(state, 7);

  state.grid[0].level = 2;
  state.research.completedIds.add('smartGrid');
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  claim(state, 8);

  place(state, [[9, 'wind']]);
  state.research.completedIds.add('wind2');
  const windSummary = { routes: [{ from: 9, to: 1, delivered: 1 }] };
  applySimulationQuestProgress(state, windSummary);
  applySimulationQuestProgress(state, windSummary);
  claim(state, 9);

  place(state, [[10, 'tidal']]);
  state.research.completedIds.add('tidal1');
  state.unlockedFacilities.add('tidal');
  const tidalSummary = { routes: [{ from: 10, to: 1, delivered: 1 }] };
  applySimulationQuestProgress(state, tidalSummary);
  applySimulationQuestProgress(state, tidalSummary);
  claim(state, 10);

  expect(state).toMatchObject({
    questIndex: 11,
    climateCampaign: { status: 'briefing' },
    progression: { chapter: 3 },
  });
}

const CLIMATE_FIXTURES = Object.freeze({
  11: [
    [0, 'thermal'], [1, 'factory'],
    [2, 'residential'], [3, 'residential'], [4, 'residential'], [5, 'residential'],
  ],
  12: [
    [0, 'thermal'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }], [2, 'data'],
    [3, 'residential'], [4, 'residential'], [5, 'residential'],
    [6, 'residential'], [7, 'residential'], [8, 'residential'],
    [9, 'solar'], [10, 'solar'], [11, 'solar'],
  ],
  13: [
    [0, 'nuclear'], [1, 'thermal'], [2, 'data'], [3, 'factory'],
    [4, 'residential'], [5, 'residential'], [6, 'residential'],
    [7, 'residential'], [8, 'residential'], [9, 'residential'],
  ],
  14: [
    [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
    [2, 'solar'], [3, 'solar'], [4, 'data'], [20, 'factory'],
    [5, 'residential'], [6, 'residential'], [7, 'residential'], [8, 'residential'],
  ],
  15: [
    [0, 'data'], [5, 'nuclear'], [6, 'cooling', 2],
    [1, 'battery', 1, { batteryStoredLowCarbon: 20 }], [2, 'solar'],
    [7, 'residential', 2], [8, 'residential'],
  ],
  16: [
    [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
    [2, 'residential'], [3, 'residential'], [4, 'residential'],
    [5, 'residential'], [6, 'residential'], [7, 'residential'],
  ],
  17: [
    [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
    [2, 'solar'], [3, 'solar'], [4, 'solar'],
    [20, 'factory'], [21, 'factory'], [22, 'data'], [23, 'green', 2],
    [5, 'residential'], [6, 'residential'], [7, 'residential'], [8, 'residential'],
  ],
  18: [
    [19, 'tidal'],
    [20, 'residential'], [7, 'residential'], [36, 'residential'], [8, 'residential'],
  ],
});

function finishClimateCampaign(state) {
  state.boardRadius = 3;
  state.grid = Array(37).fill(null);
  state.expansion.activeCellIndices = Array.from({ length: 37 }, (_, index) => index);
  for (let quest = 11; quest <= 18; quest += 1) {
    place(state, CLIMATE_FIXTURES[quest], { clear: true });
    if (quest === 18) state.research.completedIds.add('tidal1');
    const briefing = acknowledgeClimateBriefing(state);
    expect(briefing.ok, `quest ${quest}: ${briefing.reason}`).toBe(true);
    settleUntilReady(state);
    expect(state.climateCampaign.lastResult).toMatchObject({ passed: true, questIndex: quest });
    claim(state, quest);
  }
}

function stressState(placements) {
  const state = seededState();
  state.questIndex = 19;
  state.questStatus = 'active';
  state.progression.chapter = 4;
  state.boardRadius = 3;
  state.grid = Array(37).fill(null);
  state.expansion.activeCellIndices = Array.from({ length: 37 }, (_, index) => index);
  state.credits = 500;
  state.claimedQuestIds.add('extreme-heat');
  state.research.completedIds.add('tidal1');
  state.stressTest.status = 'ready';
  place(state, placements);
  return state;
}

function runStress(state) {
  // 실제 플레이처럼 하루를 먼저 정산해 시험 물 기준선이 도시의 진짜 사용량으로 잡히게 한다.
  settleDays(state, 1);
  expect(startStressTest(state)).toMatchObject({ ok: true });
  expect(state.stressTest.waterBaseline).toBe(state.lastTickSummary.dailyWater);
  settleDays(state, 41);
  expect(state.stressTest.status).not.toBe('running');
  return state.stressTest.result;
}

const REFERENCE_CITY = Object.freeze([
  [19, 'tidal'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
  [5, 'nuclear'], [25, 'solar'], [29, 'wind'],
  [0, 'data'], [6, 'cooling'], [4, 'factory'],
  [7, 'residential'], [36, 'residential'], [20, 'residential', 2], [8, 'residential', 2],
  [18, 'green'], [21, 'green'], [9, 'green', 2],
]);

test('one quest cursor advances through four preparation quests and all eight climate events to quest nineteen', () => {
  const state = seededState();
  state.credits = 500;
  finishFoundation(state);
  finishPreparation(state);
  finishClimateCampaign(state);

  expect(state.questIndex).toBe(19);
  expect(state.stressTest.status).toBe('ready');
  expect(state.climateCampaign.completedEventTypes).toEqual([
    'heatwave', 'monsoon', 'typhoon', 'coldWave',
    'drought', 'stagnantAir', 'dryWildfire', 'stormSurge',
  ]);
  expect(new Set(state.climateCampaign.completedEventTypes).size).toBe(8);
  expect(state.progression.objectiveSetId).toBeNull();
});

test('the 41-day reference city passes without green or residential level three', () => {
  const state = stressState(REFERENCE_CITY);
  const result = runStress(state);

  expect(state.grid.filter((cell) => cell?.type === 'green').map(({ level }) => level).sort()).toEqual([1, 1, 2]);
  expect(state.grid.filter((cell) => cell?.type === 'residential').map(({ level }) => level).sort()).toEqual([1, 1, 2, 2]);
  expect(result, JSON.stringify(result)).toMatchObject({ passed: true, days: 41 });
  // 건조 위기 5일은 데이터센터·핵발전 물을 15% 밀어올린다. 두 시설에 붙은 순환냉각이
  // 그만큼을 되돌려 주기 때문에 기준선을 그대로 지킨다.
  expect(result.waterViolationDays).toBe(0);
  expect(result.tidalEnergyDelivered).toBeGreaterThanOrEqual(8);
  expect(state.campaignComplete).toBe(true);
});

test('the same city fails the dry emergency once its cooling is gone', () => {
  const state = stressState(REFERENCE_CITY.filter(([, type]) => type !== 'cooling'));
  const result = runStress(state);

  // 냉각이 없으면 건조 위기의 +15% 냉각수를 상쇄할 방법이 없어 5일 내내 기준선을 넘는다.
  expect(result, JSON.stringify(result)).toMatchObject({
    passed: false,
    waterViolationDays: 5,
    diagnosis: { id: 'water' },
  });
});

test('green level three cannot rescue a city whose essential power is insufficient', () => {
  const state = stressState([
    [19, 'tidal'], [18, 'green', 3],
    [0, 'residential'], [1, 'residential'], [2, 'residential'], [3, 'residential'],
    [4, 'residential'], [5, 'residential'], [6, 'residential'], [7, 'residential'],
  ]);
  const result = runStress(state);

  expect(result.passed).toBe(false);
  expect(['essential_average', 'essential_floor']).toContain(result.diagnosis.id);
  expect(state.campaignComplete).toBe(false);
  expect(state.grid.some((cell) => cell?.type === 'green' && cell.level === 3)).toBe(true);
});

test('human pacing keeps a fifteen-to-thirty minute target and meaningful decision windows', () => {
  expect(CAMPAIGN_PACING.humanMinutes).toEqual({ min: 15, target: 25, max: 30 });
  expect(CAMPAIGN_PACING.phases[0]).toMatchObject({ startMinute: 0 });
  expect(CAMPAIGN_PACING.phases.at(-1)).toMatchObject({ endMinute: 30 });
  CAMPAIGN_PACING.representativeWindows.forEach((window) => {
    expect(window.endMinute - window.startMinute).toBe(2);
    expect(window.decisions.length).toBeGreaterThanOrEqual(2);
    expect(window.decisions.length).toBeLessThanOrEqual(4);
    expect(new Set(window.decisions).size).toBe(window.decisions.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 실제 건설 경로만 쓰는 기준 캠페인(서부 분기).
//
// 위의 테스트들은 배치 고정용으로 state.grid에 직접 쓴다 — 특정 도시 모양에서 규칙이
// 어떻게 계산되는지를 빠르게 못 박기 위해서다. 그 대신 시설 허가·비용·인력·공사일 같은
// "실제로 지을 수 있는가"는 전혀 검증되지 않는다(리뷰 M6가 그렇게 빠져나갔다).
// 이 캠페인은 반대다: 1단계부터 19단계까지 모든 건물을 validatePlacement로 확인하고
// commitConstructionPlan으로 세우며, 강화·철거도 실제 보드 API를 쓴다. 크레딧은 시작
// 10에서 시작해 퀘스트 보상과 도시 수입으로만 충당한다.
// ─────────────────────────────────────────────────────────────────────────────

const referenceSettle = createDaySettler({
  calculatePowerNetwork,
  settleEconomy,
  getResearchDemand: researchDemandByIndex,
  advanceResearch: advanceResearchOneDay,
  evaluateQuest: applySimulationQuestProgress,
});

function settleReferenceDays(days) {
  for (let day = 0; day < days; day += 1) {
    referenceSettle(gameState);
    expect(gameState.gameOver, `day ${gameState.elapsedGameDays}: ${gameState.gameOverReason}`).toBe(false);
    expect(gameState.credits, `day ${gameState.elapsedGameDays} credits`).toBeGreaterThanOrEqual(0);
  }
}

// 계획에 담기 전에 validatePlacement이 통과해야 하고, 확정 뒤에는 공사가 실제 게임일만큼 걸린다.
function buildReference(...placements) {
  // 방향 모달을 확인한 플레이어처럼, 방향이 있는 시설은 그 칸의 최적 방향으로 계획에 담는다.
  gameState.constructionPlan = placements.map(([index, type]) => ({
    index,
    type,
    rotation: optimalRotationFor(gameState, type, index) ?? defaultRotationFor(type),
  }));
  placements.forEach(([index, type]) => {
    expect(
      validatePlacement(gameState, type, index, {
        plan: gameState.constructionPlan.filter((item) => item.index !== index),
      }),
      `${type} at ${index} on quest ${gameState.questIndex}`,
    ).toMatchObject({ ok: true });
  });
  const result = commitConstructionPlan(gameState);
  expect(result.ok, result.errors?.map(({ message }) => message).join(' | ')).toBe(true);
  settleReferenceDays(Math.max(...result.projects.map(({ durationDays }) => durationDays)));
  result.projects.forEach(({ index }) => expect(gameState.grid[index].project).toBeNull());
  return result;
}

function upgradeReference(index) {
  const result = upgradeCell(index);
  expect(result, `upgrade ${index}`).toMatchObject({ ok: true });
  settleReferenceDays(result.durationDays);
  expect(gameState.grid[index]).toMatchObject({ level: result.targetLevel, project: null });
}

// 퀴즈 4문항을 맞히면 연구가 끝난다(전용 문항 수 = RESEARCH_RULES.QUIZ_QUESTION_COUNT).
function researchReference(researchId, dataCenterIndex) {
  expect(startResearch(gameState, researchId, dataCenterIndex), researchId).toMatchObject({ ok: true });
  for (let answer = 0; answer < 4; answer += 1) accelerateResearchFromQuiz(gameState, researchId);
  expect(gameState.research.completedIds.has(researchId), researchId).toBe(true);
}

function settleUntilReferenceReady(maximumDays = 80) {
  for (let day = 0; day < maximumDays && gameState.questStatus !== 'ready_to_claim'; day += 1) {
    settleReferenceDays(1);
  }
  expect(
    gameState.questStatus,
    `quest ${gameState.questIndex}: ${JSON.stringify(gameState.questProgress)}`,
  ).toBe('ready_to_claim');
}

function claimReference(expectedQuest) {
  expect(gameState.questIndex).toBe(expectedQuest);
  const result = claimCurrentQuest(gameState);
  expect(result.ok, `claim quest ${expectedQuest}: ${result.reason}`).toBe(true);
  return result;
}

test('a west-branch city earns every one of the nineteen quests through the real placement path', () => {
  gameState.reset();
  gameState.environment = createEnvironment(ENVIRONMENT_SEED);
  expect(gameState.credits).toBe(10);

  // 1블록 — 도시 기반 (1~6).
  buildReference([1, 'residential'], [2, 'residential']);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claimReference(1);

  buildReference([13, 'thermal']);
  buildReference([4, 'factory']);
  settleUntilReferenceReady();
  claimReference(2);

  buildReference([8, 'green']);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claimReference(3);

  buildReference([0, 'data']);
  settleUntilReferenceReady();
  claimReference(4);
  // 4단계 보상 시점에 기준 도시가 저장되고 연구 메뉴가 열린다.
  expect(gameState.researchMenuUnlocked).toBe(true);
  expect(gameState.baseline.dailyWater).toBeGreaterThan(0);

  // 핵발전은 인력을 6명 더 쓴다 — 주거지를 같은 계획에 넣지 않으면 확정이 거부된다.
  buildReference([5, 'nuclear'], [3, 'residential'], [7, 'residential']);
  settleUntilReferenceReady();
  claimReference(5);

  buildReference([6, 'cooling']);
  settleUntilReferenceReady();
  const foundationClaim = claimReference(6);
  expect(foundationClaim.expandGrid).toBe(true);
  expect(expandBoard(gameState, 'west')).toMatchObject({ ok: true, phase: 1, unlockedFacility: 'wind' });

  // 2블록 — 재난 대비 준비 (7~10), 서부 분기.
  expect(questForState(gameState).goal).toContain('풍력 예측 제어');
  researchReference('wind2', 0);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claimReference(7);

  upgradeReference(0);
  researchReference('smartGrid', 0);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  const secondExpansion = claimReference(8);
  expect(secondExpansion).toMatchObject({ secondExpansionSide: 'east', unlockedFacilities: ['solar'] });
  expect(expandBoard(gameState, 'east')).toMatchObject({ ok: true, phase: 2 });

  const eastSite = gameState.expansion.activeCellIndices.find((index) => index >= 21 && index <= 29);
  buildReference([eastSite, 'solar']);
  researchReference('solar2', 0);
  settleUntilReferenceReady();
  claimReference(9);

  researchReference('tidal1', 0);
  // 조력은 해안 칸에만 설 수 있다. 좋은 플레이어는 그중 조차가 가장 큰 칸을 고른다.
  const coast = gameState.expansion.activeCellIndices
    .filter((index) => !gameState.grid[index] && isCoastalCell(index))
    .sort((a, b) => tidalRangeAt(gameState, b) - tidalRangeAt(gameState, a))[0];
  buildReference([coast, 'tidal'], [20, 'residential']);
  settleUntilReferenceReady();
  claimReference(10);
  expect(gameState).toMatchObject({
    questIndex: 11,
    progression: { chapter: 3 },
    climateCampaign: { status: 'briefing' },
  });

  // 3블록 — 대한민국 기후재난 (11~18). 12단계 배터리 조건을 미리 준비한다.
  buildReference([9, 'battery'], [10, 'residential']);

  // 브리핑을 수락한 순간 24일 예보가 걸리고, 그 준비 기간에 도시를 고칠 수 있다.
  const preparations = {
    // 가뭄은 데이터센터·핵발전 물을 밀어올린다. 냉각 감축량은 시설 레벨에 비례하므로
    // 핵발전을 Lv.2로 올리면 예보 직전 사용량을 그대로 지킬 수 있다.
    15: () => upgradeReference(5),
    // 저장 허브를 갖춘 도시는 화력 예비력을 은퇴시킬 수 있다 — 대기 정체 구간의 화력 탄소
    // 계수(1.35배)를 아예 없애는 선택이다.
    16: () => {
      const retirement = demolishCell(13);
      expect(retirement, 'retire the fossil reserve').toMatchObject({ ok: true });
    },
  };
  for (let quest = 11; quest <= 18; quest += 1) {
    expect(acknowledgeClimateBriefing(gameState), `briefing ${quest}`).toMatchObject({ ok: true });
    preparations[quest]?.();
    settleUntilReferenceReady();
    expect(gameState.climateCampaign.lastResult).toMatchObject({ passed: true, questIndex: quest });
    claimReference(quest);
  }

  expect(gameState.questIndex).toBe(19);
  expect(gameState.stressTest.status).toBe('ready');
  expect(gameState.climateCampaign.completedEventTypes).toEqual([
    'heatwave', 'monsoon', 'typhoon', 'coldWave',
    'drought', 'stagnantAir', 'dryWildfire', 'stormSurge',
  ]);
  expect(gameState.progression.objectiveSetId).toBeNull();

  // 4블록 — 최종시험 (19). 시험 중에도 보드는 편집 가능한 재설계 단계로 남는다.
  expect(gameState.stage).toBe(STAGES.REDESIGN);
  settleReferenceDays(1);
  expect(startStressTest(gameState)).toMatchObject({ ok: true, attempts: 1 });
  expect(gameState.stressTest.waterBaseline).toBe(gameState.lastTickSummary.dailyWater);
  settleReferenceDays(stressTestTotalDays());

  expect(gameState.stressTest.result, JSON.stringify(gameState.stressTest.result))
    .toMatchObject({ passed: true, days: stressTestTotalDays(), waterViolationDays: 0 });
  expect(gameState.stressTest.result.tidalEnergyDelivered)
    .toBeGreaterThanOrEqual(STRESS_TEST_RULES.MIN_TIDAL_DELIVERY);
  expect(gameState.campaignComplete).toBe(true);
  expect(gameState.stage).toBe(STAGES.REPORT);
  expect(gameState.credits).toBeGreaterThan(0);
});
