import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { QUEST_REQUIREMENTS } from '../../../src/core/Constants.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';
import {
  createEnvironment,
  defaultRotationFor,
  optimalRotationFor,
} from '../../../src/systems/EnvironmentSystem.js';
import { getFacilityLimits } from '../../../src/systems/FacilityPermitSystem.js';
import { calculateWorkforce } from '../../../src/systems/WorkforceSystem.js';
import { applySimulationQuestProgress, evaluateCurrentQuest } from '../../../src/systems/QuestSystem.js';
import {
  acknowledgeClimateBriefing,
  currentClimateQuestEvaluation,
} from '../../../src/systems/ClimateQuestSystem.js';

const settleDay = createDaySettler({
  calculatePowerNetwork,
  settleEconomy,
  evaluateQuest: applySimulationQuestProgress,
});

// 자연 조건(칸별 풍향·해안 조차)이 아니라 퀘스트가 실제 규칙으로 달성 가능한지를 재는
// 테스트다. 캠페인 기준 도시와 같은 씨앗을 써서 19번 해안 칸의 조차를 기준값(5m)에 고정한다.
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
    // 방향은 건설할 때만 고른다. 고정 배치도 방향을 확인한 플레이어처럼 최적 방향으로 세운다.
    rotation: optimalRotationFor(state, type, index) ?? defaultRotationFor(type),
    priority: type === 'residential' ? 'essential' : 'normal',
    ...extra,
  };
}

function stateForFoundation(questIndex, placements) {
  const state = seededState();
  state.questIndex = questIndex;
  state.questStatus = 'active';
  state.credits = 500;
  placements.forEach(([index, type, level = 1, extra = {}]) => {
    state.grid[index] = facility(state, type, index, level, extra);
  });
  return state;
}

function climateState(questIndex, placements) {
  const state = seededState();
  state.questIndex = questIndex;
  state.questStatus = 'active';
  state.progression.chapter = 3;
  state.boardRadius = 3;
  state.grid = Array(37).fill(null);
  state.expansion.activeCellIndices = Array.from({ length: 37 }, (_, index) => index);
  state.credits = 500;
  state.claimedQuestIds.add('extreme-heat');
  state.climateCampaign = {
    status: 'briefing', eventType: null, attempt: 0, scheduledEventId: null,
    progress: {}, lastResult: null, completedEventTypes: [],
  };
  placements.forEach(([index, type, level = 1, extra = {}]) => {
    state.grid[index] = facility(state, type, index, level, extra);
  });
  if (questIndex === 18) state.research.completedIds.add('tidal1');

  const limits = getFacilityLimits(questIndex);
  const counts = state.grid.reduce((result, cell) => {
    if (cell) result[cell.type] = (result[cell.type] || 0) + 1;
    return result;
  }, {});
  Object.entries(counts).forEach(([type, count]) => {
    expect(count, `quest ${questIndex} ${type} cap`).toBeLessThanOrEqual(limits[type]);
  });
  expect(calculateWorkforce(state.grid).shortage, `quest ${questIndex} workforce`).toBe(0);
  return state;
}

function runClimateAttempt(state) {
  const start = acknowledgeClimateBriefing(state);
  expect(start.ok, `quest ${state.questIndex} briefing: ${start.reason}`).toBe(true);
  for (let day = 0; day < 48 && state.climateCampaign.status !== 'result'; day += 1) {
    settleDay(state);
    expect(state.gameOver, `quest ${state.questIndex} game over on day ${state.elapsedGameDays}`).toBe(false);
  }
  return currentClimateQuestEvaluation(state);
}

test('foundation quests one through six remain reachable with the real power and economy rules', () => {
  const quest1 = stateForFoundation(1, [[1, 'residential'], [2, 'residential']]);
  expect(evaluateCurrentQuest(quest1).ready).toBe(true);

  const quest2 = stateForFoundation(2, [[0, 'thermal'], [1, 'factory'], [2, 'residential']]);
  settleDay(quest2); settleDay(quest2);
  expect(quest2.questStatus).toBe('ready_to_claim');

  const quest3 = stateForFoundation(3, [[0, 'green']]);
  expect(evaluateCurrentQuest(quest3).ready).toBe(true);

  const quest4 = stateForFoundation(4, [
    [6, 'thermal'], [7, 'data'], [15, 'factory'], [17, 'residential'], [18, 'residential'], [10, 'green'],
  ]);
  settleDay(quest4); settleDay(quest4);
  expect(quest4.questStatus).toBe('ready_to_claim');

  const quest5 = stateForFoundation(5, [
    [0, 'nuclear'], [13, 'thermal'], [1, 'data'], [2, 'factory'],
    [3, 'residential'], [4, 'residential'], [5, 'residential'], [6, 'residential'],
  ]);
  settleDay(quest5); settleDay(quest5);
  // 5단계 '탄소 전환선'의 세 조건을 실제 정산 수치로 확인한다 — 준비 상태만 보면
  // 어느 조건이 아슬아슬한지 회귀에서 드러나지 않는다.
  expect(quest5.lastTickSummary.lowCarbonPercent)
    .toBeGreaterThanOrEqual(QUEST_REQUIREMENTS.TRANSITION_LOW_CARBON_PERCENT);
  expect(quest5.lastTickSummary.dailyCarbon).toBeLessThanOrEqual(QUEST_REQUIREMENTS.TRANSITION_CARBON_MAX);
  expect(quest5.lastTickSummary.netCredits).toBeGreaterThan(0);
  expect(quest5.questStatus).toBe('ready_to_claim');

  const quest6 = stateForFoundation(6, [
    [0, 'nuclear'], [13, 'thermal'], [1, 'data'], [2, 'cooling'],
    [4, 'factory'], [3, 'residential'], [5, 'residential'],
  ]);
  quest6.baseline = { dailyWater: 15 };
  settleDay(quest6); settleDay(quest6);
  // 6단계 '도시 물순환'의 규칙: 5단계에서 새로 들어온 핵발전 몫을 뺀 사용량이
  // 4단계에 저장한 기준 도시(dailyWater 15) 이하여야 한다.
  const nuclearWater = Object.entries(quest6.lastTickSummary.facilityEnvironment)
    .reduce((total, [index, environment]) => (
      quest6.grid[Number(index)]?.type === 'nuclear' ? total + (Number(environment.water) || 0) : total
    ), 0);
  expect(nuclearWater).toBeGreaterThan(0);
  expect(quest6.lastTickSummary.dailyWater - nuclearWater).toBeLessThanOrEqual(quest6.baseline.dailyWater);
  expect(quest6.questStatus).toBe('ready_to_claim');
});

const climateFixtures = [
  {
    quest: 11,
    placements: [
      [0, 'thermal'], [1, 'factory'],
      [2, 'residential'], [3, 'residential'], [4, 'residential'], [5, 'residential'],
    ],
  },
  {
    quest: 12,
    placements: [
      [0, 'thermal'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }], [2, 'data'],
      [3, 'residential'], [4, 'residential'], [5, 'residential'],
      [6, 'residential'], [7, 'residential'], [8, 'residential'],
      [9, 'solar'], [10, 'solar'], [11, 'solar'],
    ],
  },
  {
    quest: 13,
    placements: [
      [0, 'nuclear'], [1, 'thermal'], [2, 'data'], [3, 'factory'],
      [4, 'residential'], [5, 'residential'], [6, 'residential'],
      [7, 'residential'], [8, 'residential'], [9, 'residential'],
    ],
  },
  {
    quest: 14,
    placements: [
      [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
      [2, 'solar'], [3, 'solar'], [4, 'data'], [20, 'factory'],
      [5, 'residential'], [6, 'residential'], [7, 'residential'], [8, 'residential'],
    ],
  },
  {
    quest: 15,
    placements: [
      [0, 'data'], [5, 'nuclear'], [6, 'cooling', 2],
      [1, 'battery', 1, { batteryStoredLowCarbon: 20 }], [2, 'solar'],
      [7, 'residential', 2], [8, 'residential'],
    ],
  },
  {
    quest: 16,
    placements: [
      [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
      [2, 'residential'], [3, 'residential'], [4, 'residential'],
      [5, 'residential'], [6, 'residential'], [7, 'residential'],
    ],
  },
  {
    quest: 17,
    placements: [
      [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
      [2, 'solar'], [3, 'solar'], [4, 'solar'],
      [20, 'factory'], [21, 'factory'], [22, 'data'], [23, 'green', 2],
      [5, 'residential'], [6, 'residential'], [7, 'residential'], [8, 'residential'],
    ],
  },
  {
    quest: 18,
    placements: [
      [19, 'tidal'],
      [20, 'residential'], [7, 'residential'], [36, 'residential'], [8, 'residential'],
    ],
  },
];

for (const fixture of climateFixtures) {
  test(`climate quest ${fixture.quest} is reachable through its real event settlement`, () => {
    const state = climateState(fixture.quest, fixture.placements);
    const evaluation = runClimateAttempt(state);
    expect(evaluation.result, JSON.stringify({
      quest: fixture.quest,
      progress: evaluation.progress,
      summary: {
        essential: state.lastTickSummary?.essentialSupplyPercent,
        net: state.lastTickSummary?.netCredits,
        carbon: state.lastTickSummary?.dailyCarbon,
        water: state.lastTickSummary?.dailyWater,
        waterLimit: state.lastTickSummary?.waterLimit,
        battery: state.lastTickSummary?.batteryOperations,
        generation: state.lastTickSummary?.generationDeliveredByType,
        facilityPower: state.lastTickSummary?.facilityPower,
        eventMetrics: state.events?.lastResult?.metrics,
      },
    })).toMatchObject({ passed: true });
    expect(state.questStatus).toBe('ready_to_claim');
  });
}

test('the feasibility fixtures use the expanded 37-cell pointy-top topology', () => {
  expect(createHexCoordinates(3)).toHaveLength(37);
});
