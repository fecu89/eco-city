import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  evaluateCurrentQuest,
  claimCurrentQuest,
  applySimulationQuestProgress,
  requestEmergencySupport,
  markQuestQuizResult,
} from '../../../src/systems/QuestSystem.js';

const powered = (ratio = 1) => ({ demand: 2, delivered: 2 * ratio, ratio });
const summary = (overrides = {}) => ({
  netCredits: 1,
  hourlyCarbon: 4,
  hourlyWater: 4,
  lowCarbonPercent: 80,
  deliveredPower: 10,
  demand: 8,
  batteryStored: 6,
  facilityPower: {},
  facilityEconomy: {},
  routes: [],
  ...overrides,
});

test('quest 1 becomes ready with two homes and claims its reward once', () => {
  const state = new GameState();
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };

  expect(evaluateCurrentQuest(state).ready).toBe(true);
  state.questStatus = 'ready_to_claim';
  const before = state.credits;
  expect(claimCurrentQuest(state)).toMatchObject({ ok: true, unlockedFacility: 'thermal', nextQuest: 2 });
  expect(state.credits).toBe(before + 4);
  expect(state.unlockedFacilities.has('thermal')).toBe(true);
  expect(claimCurrentQuest(state)).toMatchObject({ ok: false });
  expect(state.credits).toBe(before + 4);
});

test('quest 13 needs three consecutive low-carbon, lower-carbon hours', () => {
  const state = new GameState();
  state.questIndex = 13;
  state.baseline = { hourlyCarbon: 10 };

  applySimulationQuestProgress(state, { lowCarbonPercent: 75, hourlyCarbon: 8 });
  applySimulationQuestProgress(state, { lowCarbonPercent: 75, hourlyCarbon: 8 });
  expect(state.questStatus).toBe('active');
  applySimulationQuestProgress(state, { lowCarbonPercent: 60, hourlyCarbon: 8 });
  expect(state.questProgress.consecutiveHours).toBe(0);
  for (let i = 0; i < 3; i++) applySimulationQuestProgress(state, { lowCarbonPercent: 75, hourlyCarbon: 8 });
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quests 2, 3, 4 and 7 enforce their facility, adjacency, power and duration rules', () => {
  const cases = [
    {
      quest: 2,
      grid: [{ type: 'residential' }, { type: 'thermal' }],
      tick: summary({ facilityPower: { 0: powered(0.95) } }),
      hours: 2,
    },
    {
      quest: 3,
      grid: [{ type: 'factory' }, { type: 'thermal' }],
      tick: summary({ facilityPower: { 0: powered(0.6) }, facilityEconomy: { 0: { operationRatio: 0.6, income: 1 } } }),
      hours: 2,
    },
    {
      quest: 4,
      grid: [{ type: 'data' }, { type: 'thermal' }, { type: 'residential' }, { type: 'factory' }, { type: 'residential' }],
      tick: summary({ facilityPower: { 0: powered(0.6) } }),
      hours: 2,
    },
    {
      quest: 7,
      grid: [{ type: 'cooling' }, { type: 'data' }],
      tick: summary({ facilityPower: { 0: powered(0.95) } }),
      hours: 2,
    },
  ];

  for (const item of cases) {
    const state = new GameState();
    state.questIndex = item.quest;
    state.gridSize = 5;
    state.grid = [...item.grid, ...Array(25 - item.grid.length).fill(null)].map((cell) => cell && ({ level: 1, priority: 'normal', ...cell }));
    for (let hour = 0; hour < item.hours; hour++) applySimulationQuestProgress(state, item.tick);
    expect(state.questStatus, `quest ${item.quest}`).toBe('ready_to_claim');
  }

  const separated = new GameState();
  separated.questIndex = 3;
  separated.grid[0] = { type: 'factory', level: 1 };
  separated.grid[24] = { type: 'thermal', level: 1 };
  const factoryTick = summary({ facilityPower: { 0: powered(1) }, facilityEconomy: { 0: { operationRatio: 1, income: 1 } } });
  applySimulationQuestProgress(separated, factoryTick);
  applySimulationQuestProgress(separated, factoryTick);
  expect(separated.questStatus).toBe('active');
});

test('quest 9 requires a renewable battery route in each of three hours and 8E cumulative', () => {
  const state = new GameState();
  state.questIndex = 9;
  state.grid[0] = { type: 'solar', level: 1 };
  state.grid[1] = { type: 'battery', level: 1 };
  state.grid[2] = { type: 'residential', level: 1 };
  const route = { kind: 'battery', from: 0, via: 1, to: 2, delivered: 3 };

  applySimulationQuestProgress(state, summary({ routes: [route] }));
  applySimulationQuestProgress(state, summary({ routes: [route] }));
  expect(state.questStatus).toBe('active');
  applySimulationQuestProgress(state, summary({ routes: [route] }));
  expect(state.questProgress.hubEnergy).toBe(9);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest 10 requires an adjacent green home and resets consecutive profit on a loss', () => {
  const state = new GameState();
  state.questIndex = 10;
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[1] = { type: 'green', level: 1 };
  applySimulationQuestProgress(state, summary({ netCredits: 1 }));
  applySimulationQuestProgress(state, summary({ netCredits: -0.1 }));
  expect(state.questProgress.consecutiveHours).toBe(0);
  applySimulationQuestProgress(state, summary({ netCredits: 1 }));
  applySimulationQuestProgress(state, summary({ netCredits: 1 }));
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest 11 only counts extreme heat and quest 12 only counts the 19-23 night window', () => {
  const heat = new GameState();
  heat.questIndex = 11;
  heat.grid[0] = { type: 'residential', level: 1 };
  const heatTick = summary({ facilityPower: { 0: powered(0.95) } });
  applySimulationQuestProgress(heat, heatTick);
  expect(heat.questProgress.consecutiveHours || 0).toBe(0);
  heat.climateAlert = 'extreme_heat';
  for (let hour = 0; hour < 3; hour++) applySimulationQuestProgress(heat, heatTick);
  expect(heat.questStatus).toBe('ready_to_claim');

  const night = new GameState();
  night.questIndex = 12;
  night.simulationHour = 18;
  applySimulationQuestProgress(night, summary());
  expect(night.questProgress.consecutiveHours || 0).toBe(0);
  for (const hour of [19, 20, 21]) {
    night.simulationHour = hour;
    applySimulationQuestProgress(night, summary());
  }
  expect(night.questStatus).toBe('ready_to_claim');
});

test('quiz quests become claimable only after a passing result', () => {
  for (const questIndex of [5, 8, 15]) {
    const state = new GameState();
    state.questIndex = questIndex;
    markQuestQuizResult(state, false);
    expect(state.questStatus).toBe('active');
    markQuestQuizResult(state, true);
    expect(state.questStatus).toBe('ready_to_claim');
  }
});

test('all fifteen rewards follow the approved unlock, permit, credit, and completion sequence', () => {
  const state = new GameState();
  const expectedUnlocks = ['thermal', 'factory', 'data', 'nuclear', 'cooling', 'solar', 'battery', 'wind', 'green'];
  const expectedCredits = [4, 5, 6, 8, 8, 24, 6, 6, 8, 8, 10, 10, 10, 12, 0];
  const initialCredits = state.credits;
  let earned = 0;

  for (let questIndex = 1; questIndex <= 15; questIndex++) {
    state.questStatus = 'ready_to_claim';
    const result = claimCurrentQuest(state);
    expect(result.ok, `quest ${questIndex}`).toBe(true);
    earned += expectedCredits[questIndex - 1];
    expect(state.credits).toBe(initialCredits + earned);
    if (questIndex <= expectedUnlocks.length) expect(state.unlockedFacilities.has(expectedUnlocks[questIndex - 1])).toBe(true);
    if (questIndex === 6) expect(result.expandGrid).toBe(true);
    if (questIndex === 10) expect(state.upgradePermitLevel).toBe(2);
    if (questIndex === 13) expect(state.upgradePermitLevel).toBe(3);
  }

  expect(state.campaignComplete).toBe(true);
  expect(state.questStatus).toBe('claimed');
  expect(claimCurrentQuest(state)).toEqual({ ok: false, reason: 'already_claimed' });
});

test('emergency support is limited to once per quest at one credit or less', () => {
  const state = new GameState();
  state.credits = 1;
  expect(requestEmergencySupport(state)).toEqual({ ok: true, credits: 5 });
  expect(requestEmergencySupport(state)).toEqual({ ok: false, reason: 'already_used' });
});
