import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createHourSettler } from '../../../src/systems/SimulationSystem.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';
import { getFacilityLimits } from '../../../src/systems/FacilityPermitSystem.js';
import { calculateWorkforce } from '../../../src/systems/WorkforceSystem.js';
import {
  applySimulationQuestProgress,
  evaluateCurrentQuest,
  markQuestQuizResult,
} from '../../../src/systems/QuestSystem.js';

function stateFor(questIndex, placements) {
  const state = new GameState();
  state.questIndex = questIndex;
  state.questStatus = 'active';
  state.credits = 500;
  placements.forEach(([index, type, extra = {}]) => {
    state.grid[index] = { type, level: 1, priority: ['residential', 'cooling'].includes(type) ? 'essential' : 'normal', ...extra };
  });
  const limits = getFacilityLimits(questIndex);
  Object.entries(state.grid.reduce((counts, cell) => {
    if (cell) counts[cell.type] = (counts[cell.type] || 0) + 1;
    return counts;
  }, {})).forEach(([type, count]) => expect(count, `quest ${questIndex} ${type} cap`).toBeLessThanOrEqual(limits[type]));
  expect(calculateWorkforce(state.grid).shortage, `quest ${questIndex} workforce shortage`).toBe(0);
  return state;
}

function realSettler(state) {
  return createHourSettler({
    calculatePowerNetwork,
    settleEconomy,
    evaluateQuest: applySimulationQuestProgress,
  });
}

function settleHours(state, hours) {
  const settle = realSettler(state);
  const summaries = [];
  for (let hour = 0; hour < hours; hour++) summaries.push(settle(state).summary);
  return summaries;
}

test('quests 1 through 7 have reachable gates under their actual caps, grid, power, and economy rules', () => {
  const quest1 = stateFor(1, [[1, 'residential'], [2, 'residential']]);
  expect(evaluateCurrentQuest(quest1).ready).toBe(true);

  const quest2 = stateFor(2, [[0, 'thermal'], [1, 'factory'], [2, 'residential']]);
  settleHours(quest2, 2);
  expect(quest2.questStatus).toBe('ready_to_claim');

  const quest3 = stateFor(3, [[0, 'green']]);
  expect(evaluateCurrentQuest(quest3).ready).toBe(true);

  const quest4 = stateFor(4, [[0, 'thermal'], [13, 'thermal'], [1, 'data'], [2, 'residential'], [3, 'residential'], [4, 'factory']]);
  settleHours(quest4, 2);
  expect(quest4.questStatus).toBe('ready_to_claim');

  const quest5 = stateFor(5, [[0, 'nuclear'], [13, 'thermal'], [1, 'data'], [2, 'factory'], [3, 'residential'], [4, 'residential'], [5, 'residential'], [6, 'residential']]);
  const quest5Summaries = settleHours(quest5, 2);
  expect(quest5Summaries.at(-1)).toMatchObject({ lowCarbonPercent: expect.any(Number), hourlyCarbon: expect.any(Number) });
  expect(quest5Summaries.at(-1).lowCarbonPercent).toBeGreaterThanOrEqual(40);
  expect(quest5Summaries.at(-1).hourlyCarbon).toBeLessThanOrEqual(12);
  expect(quest5Summaries.at(-1).netCredits).toBeGreaterThan(0);
  expect(quest5.questStatus).toBe('ready_to_claim');

  const quest6 = stateFor(6, [[0, 'nuclear'], [13, 'thermal'], [1, 'data'], [2, 'cooling'], [4, 'factory'], [3, 'residential'], [5, 'residential']]);
  quest6.baseline = { hourlyWater: 15 };
  const quest6Summaries = settleHours(quest6, 2);
  expect(quest6Summaries.at(-1).hourlyWater).toBeLessThanOrEqual(15);
  expect(quest6.questStatus).toBe('ready_to_claim');

  const quest7 = stateFor(7, [[0, 'solar'], [11, 'nuclear'], [13, 'thermal'], [1, 'data'], [2, 'cooling'], [3, 'factory'], [4, 'residential'], [5, 'residential']]);
  const quest7Summaries = settleHours(quest7, 2);
  expect(quest7Summaries.at(-1).routes.some((route) => quest7.grid[route.from]?.type === 'solar' && route.delivered > 0)).toBe(true);
  expect(quest7.questStatus).toBe('ready_to_claim');
});

test('quests 8 through 15 each have a reachable real-system completion state', () => {
  const quest8 = stateFor(8, [[0, 'solar', { level: 2 }], [1, 'residential']]);
  quest8.research.completedIds.add('solar2');
  expect(evaluateCurrentQuest(quest8).ready).toBe(true);

  const quest9 = stateFor(9, [[0, 'battery', { batteryStoredLowCarbon: 20 }], [1, 'data'], [13, 'solar'], [2, 'residential']]);
  const quest9Summaries = settleHours(quest9, 3);
  expect(quest9Summaries[0].routes.some((route) => route.kind === 'battery' && route.lowCarbonDelivered > 0)).toBe(true);
  expect(quest9.questStatus).toBe('ready_to_claim');

  const quest10 = stateFor(10, [[0, 'wind', { level: 2 }], [1, 'residential']]);
  quest10.research.completedIds.add('wind2');
  expect(evaluateCurrentQuest(quest10).ready).toBe(true);

  const profitable = [[0, 'nuclear'], [13, 'thermal'], [1, 'residential'], [2, 'residential'], [3, 'residential'], [4, 'residential'], [5, 'factory'], [6, 'data'], [7, 'green']];
  const quest11 = stateFor(11, profitable);
  const quest11Summaries = settleHours(quest11, 3);
  expect(quest11Summaries.at(-1).netCredits).toBeGreaterThan(0);
  expect(quest11.questStatus).toBe('ready_to_claim');

  const quest12 = stateFor(12, [[0, 'nuclear'], [11, 'nuclear'], [13, 'thermal'], [1, 'residential'], [2, 'residential'], [3, 'cooling'], [4, 'data']]);
  quest12.climateAlert = 'extreme_heat';
  const quest12Summaries = settleHours(quest12, 3);
  expect(Object.values(quest12Summaries.at(-1).facilityPower).every(({ ratio }) => ratio >= 0.9)).toBe(true);
  expect(quest12.questStatus).toBe('ready_to_claim');

  const quest13 = stateFor(13, [[0, 'nuclear'], [13, 'thermal'], [1, 'residential'], [2, 'residential'], [3, 'battery', { batteryStoredLowCarbon: 5 }]]);
  quest13.elapsedGameHours = 11;
  const quest13Summaries = settleHours(quest13, 3);
  expect(quest13Summaries.map(({ hour }) => hour)).toEqual([19, 20, 21]);
  expect(quest13Summaries.every(({ batteryStored }) => batteryStored >= 5)).toBe(true);
  expect(quest13.questStatus).toBe('ready_to_claim');

  const quest14 = stateFor(14, [[0, 'nuclear'], [11, 'solar', { level: 3 }], [12, 'wind'], [13, 'thermal'], [1, 'residential'], [2, 'residential'], [3, 'residential'], [4, 'residential'], [5, 'factory'], [6, 'data'], [17, 'cooling']]);
  quest14.baseline = { hourlyWater: 15 };
  const quest14Summaries = settleHours(quest14, 4);
  expect(quest14Summaries.at(-1).lowCarbonPercent).toBeGreaterThanOrEqual(70);
  expect(quest14Summaries.at(-1).hourlyWater).toBeLessThan(15);
  expect(quest14Summaries.at(-1).netCredits).toBeGreaterThan(0);
  expect(quest14.questStatus).toBe('ready_to_claim');

  const quest15 = stateFor(15, []);
  markQuestQuizResult(quest15, true);
  expect(quest15.questStatus).toBe('ready_to_claim');
});

test('the feasibility fixtures use the same 19-cell pointy-top topology as the game', () => {
  expect(createHexCoordinates(2)).toHaveLength(19);
});
