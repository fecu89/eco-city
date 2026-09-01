import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';
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

function facility(type, level = 1, extra = {}) {
  return { type, level, priority: type === 'residential' ? 'essential' : 'normal', operationMode: 'normal', ...extra };
}

function stateForFoundation(questIndex, placements) {
  const state = new GameState();
  state.questIndex = questIndex;
  state.questStatus = 'active';
  state.credits = 500;
  placements.forEach(([index, type, level = 1, extra = {}]) => {
    state.grid[index] = facility(type, level, extra);
  });
  return state;
}

function climateState(questIndex, placements) {
  const state = new GameState();
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
    state.grid[index] = facility(type, level, extra);
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
  expect(quest5.lastTickSummary).toMatchObject({ lowCarbonPercent: expect.any(Number), dailyCarbon: expect.any(Number) });
  expect(quest5.questStatus).toBe('ready_to_claim');

  const quest6 = stateForFoundation(6, [
    [0, 'nuclear'], [13, 'thermal'], [1, 'data'], [2, 'cooling'],
    [4, 'factory'], [3, 'residential'], [5, 'residential'],
  ]);
  quest6.baseline = { dailyWater: 15 };
  settleDay(quest6); settleDay(quest6);
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
