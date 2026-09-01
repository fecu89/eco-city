import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  applySimulationQuestProgress,
  claimCurrentQuest,
  evaluateCurrentQuest,
  requestEmergencySupport,
} from '../../../src/systems/QuestSystem.js';
import { createHexCoordinates, neighborIndices } from '../../../src/systems/HexGridSystem.js';
import { QUESTS } from '../../../src/core/QuestDefinitions.js';
import { createBuildProject } from '../../../src/systems/ConstructionProjectSystem.js';

const powered = (ratio = 1) => ({ demand: 2, delivered: 2 * ratio, ratio });
const summary = (overrides = {}) => ({
  netCredits: 1,
  dailyCarbon: 4,
  dailyWater: 4,
  lowCarbonPercent: 80,
  deliveredPower: 10,
  demand: 8,
  batteryStored: 6,
  facilityPower: {},
  facilityEconomy: {},
  routes: [],
  ...overrides,
});

test('quest one becomes ready with two completed homes and claims its reward once', () => {
  const state = new GameState();
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };

  expect(evaluateCurrentQuest(state).ready).toBe(true);
  const before = state.credits;
  expect(claimCurrentQuest(state)).toMatchObject({
    ok: true,
    unlockedFacilities: ['factory', 'thermal'],
    nextQuest: 2,
  });
  expect(state.credits).toBe(before + 4);
  expect(state.unlockedFacilities.has('factory')).toBe(true);
  expect(state.unlockedFacilities.has('thermal')).toBe(true);
  expect(claimCurrentQuest(state)).toMatchObject({ ok: false });
  expect(state.credits).toBe(before + 4);
});

test('unfinished home construction does not satisfy the first quest', () => {
  const state = new GameState();
  state.grid[0] = {
    type: 'residential', level: 1,
    project: createBuildProject({ type: 'residential', paidCost: 2 }),
  };
  state.grid[1] = {
    type: 'residential', level: 1,
    project: createBuildProject({ type: 'residential', paidCost: 2 }),
  };
  expect(evaluateCurrentQuest(state).ready).toBe(false);
});

test('quest two requires an adjacent profitable factory and thermal pair for two days', () => {
  const state = new GameState();
  const thermalIndex = neighborIndices(0, createHexCoordinates(2))[0];
  state.questIndex = 2;
  state.grid[0] = { type: 'factory', level: 1 };
  state.grid[thermalIndex] = { type: 'thermal', level: 1 };
  const operating = summary({
    facilityPower: { 0: powered(0.6) },
    facilityEconomy: { 0: { operationRatio: 0.6, income: 1 } },
  });

  applySimulationQuestProgress(state, operating);
  expect(state.questProgress.consecutiveDays).toBe(1);
  applySimulationQuestProgress(state, summary({
    facilityPower: { 0: powered(0.6) },
    facilityEconomy: { 0: { operationRatio: 0.6, income: 0 } },
  }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  applySimulationQuestProgress(state, operating);
  applySimulationQuestProgress(state, operating);
  expect(state.questStatus).toBe('ready_to_claim');

  const separated = new GameState();
  separated.questIndex = 2;
  separated.grid[0] = { type: 'factory', level: 1 };
  separated.grid[18] = { type: 'thermal', level: 1 };
  applySimulationQuestProgress(separated, operating);
  applySimulationQuestProgress(separated, operating);
  expect(separated.questStatus).toBe('active');
});

test('quest three becomes ready only after the first green space is completed', () => {
  const state = new GameState();
  state.questIndex = 3;
  expect(evaluateCurrentQuest(state).ready).toBe(false);
  state.grid[0] = { type: 'green', level: 1 };
  expect(evaluateCurrentQuest(state).ready).toBe(true);
});

test('quest four keeps the powered data-center two-day gate', () => {
  const state = new GameState();
  state.questIndex = 4;
  state.grid[0] = { type: 'data', level: 1 };
  const tick = summary({ facilityPower: { 0: powered(0.95) } });
  applySimulationQuestProgress(state, tick);
  expect(state.questStatus).toBe('active');
  applySimulationQuestProgress(state, tick);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest five is a reachable daily transition gate and no quest is quiz-only', () => {
  expect(QUESTS.filter((quest) => quest.progressKind === 'quiz')).toEqual([]);
  expect(QUESTS[4]).toMatchObject({ index: 5, progressKind: 'days', quizKind: null });
  const state = new GameState();
  state.questIndex = 5;
  state.grid[0] = { type: 'nuclear', level: 1 };

  applySimulationQuestProgress(state, summary({ dailyCarbon: 12, lowCarbonPercent: 39 }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  applySimulationQuestProgress(state, summary({ dailyCarbon: 12.1, lowCarbonPercent: 60 }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  applySimulationQuestProgress(state, summary({ dailyCarbon: 12, lowCarbonPercent: 40 }));
  applySimulationQuestProgress(state, summary({ dailyCarbon: 12, lowCarbonPercent: 40 }));
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest six completes when powered adjacent data and cooling keep water at baseline', () => {
  expect(QUESTS[5]).toMatchObject({ index: 6, id: 'water-cycle', progressKind: 'days' });
  const state = new GameState();
  const coolingIndex = neighborIndices(0, createHexCoordinates(2))[0];
  state.questIndex = 6;
  state.baseline = { dailyWater: 5 };
  state.grid[0] = { type: 'data', level: 1 };
  state.grid[coolingIndex] = { type: 'cooling', level: 1 };
  const operating = summary({
    dailyWater: 5,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.95) },
  });

  applySimulationQuestProgress(state, operating);
  applySimulationQuestProgress(state, operating);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest six resets when cooling is separated, underpowered, or above baseline water', () => {
  const state = new GameState();
  const coolingIndex = neighborIndices(0, createHexCoordinates(2))[0];
  state.questIndex = 6;
  state.baseline = { dailyWater: 5 };
  state.grid[0] = { type: 'data', level: 1 };
  state.grid[coolingIndex] = { type: 'cooling', level: 1 };
  applySimulationQuestProgress(state, summary({
    dailyWater: 6,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.95) },
  }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  applySimulationQuestProgress(state, summary({
    dailyWater: 5,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.5) },
  }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  state.grid[coolingIndex] = null;
  state.grid[18] = { type: 'cooling', level: 1 };
  applySimulationQuestProgress(state, summary({
    dailyWater: 5,
    facilityPower: { 0: powered(0.95), 18: powered(0.95) },
  }));
  expect(state.questProgress.consecutiveDays).toBe(0);
});

test('emergency support is limited to once per campaign at one credit or less', () => {
  const state = new GameState();
  state.credits = 1;
  expect(requestEmergencySupport(state)).toEqual({ ok: true, credits: 5 });
  expect(requestEmergencySupport(state)).toEqual({ ok: false, reason: 'already_used' });
});
