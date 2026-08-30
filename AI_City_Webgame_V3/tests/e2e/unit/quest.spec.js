import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  evaluateCurrentQuest,
  claimCurrentQuest,
  applySimulationQuestProgress,
  requestEmergencySupport,
  markQuestQuizResult,
} from '../../../src/systems/QuestSystem.js';
import { createHexCoordinates, neighborIndices } from '../../../src/systems/HexGridSystem.js';
import { QUESTS } from '../../../src/core/QuestDefinitions.js';

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

test('quest 14 needs four consecutive low-carbon, lower-water profitable hours', () => {
  const state = new GameState();
  state.questIndex = 14;
  state.baseline = { hourlyWater: 10 };

  applySimulationQuestProgress(state, { lowCarbonPercent: 75, hourlyWater: 8, netCredits: 1 });
  applySimulationQuestProgress(state, { lowCarbonPercent: 75, hourlyWater: 8, netCredits: 1 });
  expect(state.questStatus).toBe('active');
  applySimulationQuestProgress(state, { lowCarbonPercent: 60, hourlyWater: 8, netCredits: 1 });
  expect(state.questProgress.consecutiveHours).toBe(0);
  for (let i = 0; i < 4; i++) applySimulationQuestProgress(state, { lowCarbonPercent: 75, hourlyWater: 8, netCredits: 1 });
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest 5 replaces the quiz-only gate with two safe profitable nuclear hours', () => {
  expect(QUESTS.filter((quest) => quest.progressKind === 'quiz').map((quest) => quest.index)).toEqual([15]);
  expect(QUESTS[4]).toMatchObject({ index: 5, progressKind: 'hours', quizKind: null });

  const state = new GameState();
  state.questIndex = 5;
  state.grid[0] = { type: 'nuclear', level: 1 };
  applySimulationQuestProgress(state, summary({ hourlyCarbon: 8, netCredits: 1 }));
  expect(state.questStatus).toBe('active');
  applySimulationQuestProgress(state, summary({ hourlyCarbon: 8.1, netCredits: 1 }));
  expect(state.questProgress.consecutiveHours).toBe(0);
  applySimulationQuestProgress(state, summary({ hourlyCarbon: 7, netCredits: 1 }));
  applySimulationQuestProgress(state, summary({ hourlyCarbon: 7, netCredits: 1 }));
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest 6 completes when powered adjacent data cooling keeps water at the baseline', () => {
  expect(QUESTS[5]).toMatchObject({
    index: 6,
    id: 'water-cycle',
    title: '도시 물순환',
    progressKind: 'hours',
  });
  const state = new GameState();
  const coolingIndex = neighborIndices(0, createHexCoordinates(2))[0];
  state.questIndex = 6;
  state.baseline = { hourlyWater: 5 };
  state.grid[0] = { type: 'data', level: 1 };
  state.grid[coolingIndex] = { type: 'cooling', level: 1 };
  const operating = summary({
    hourlyWater: 5,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.95) },
  });

  applySimulationQuestProgress(state, operating);
  expect(state.questStatus).toBe('active');
  applySimulationQuestProgress(state, operating);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest 6 resets when cooling is separated, underpowered, or above the water baseline', () => {
  const state = new GameState();
  const coolingIndex = neighborIndices(0, createHexCoordinates(2))[0];
  state.questIndex = 6;
  state.baseline = { hourlyWater: 5 };
  state.grid[0] = { type: 'data', level: 1 };
  state.grid[coolingIndex] = { type: 'cooling', level: 1 };
  applySimulationQuestProgress(state, summary({
    hourlyWater: 6,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.95) },
  }));
  expect(state.questProgress.consecutiveHours).toBe(0);
  applySimulationQuestProgress(state, summary({
    hourlyWater: 5,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.5) },
  }));
  expect(state.questProgress.consecutiveHours).toBe(0);
  state.grid[coolingIndex] = null;
  state.grid[18] = { type: 'cooling', level: 1 };
  applySimulationQuestProgress(state, summary({
    hourlyWater: 5,
    facilityPower: { 0: powered(0.95), 18: powered(0.95) },
  }));
  expect(state.questProgress.consecutiveHours).toBe(0);
});

test('quest 7 needs solar power delivered at a 30 percent low-carbon share for two hours', () => {
  expect(QUESTS[6]).toMatchObject({ index: 7, id: 'first-solar', progressKind: 'hours' });
  const state = new GameState();
  state.questIndex = 7;
  state.grid[0] = { type: 'solar', level: 1 };
  const solarTick = summary({
    lowCarbonPercent: 30,
    routes: [{ from: 0, to: 1, delivered: 2, kind: 'direct' }],
  });
  applySimulationQuestProgress(state, solarTick);
  applySimulationQuestProgress(state, solarTick);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quests 2, 3 and 4 enforce their facility, adjacency, power and duration rules', () => {
  const cases = [
    {
      quest: 2,
      grid: [{ type: 'residential' }, { type: 'thermal' }],
      tick: summary({ facilityPower: { 0: powered(0.95), 1: powered(0.95) } }),
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
      tick: summary({ facilityPower: { 0: powered(0.95) } }),
      hours: 2,
    },
  ];

  for (const item of cases) {
    const state = new GameState();
    state.questIndex = item.quest;
    state.grid = [...item.grid, ...Array(19 - item.grid.length).fill(null)].map((cell) => cell && ({ level: 1, priority: 'normal', ...cell }));
    for (let hour = 0; hour < item.hours; hour++) applySimulationQuestProgress(state, item.tick);
    expect(state.questStatus, `quest ${item.quest}`).toBe('ready_to_claim');
  }

  const separated = new GameState();
  separated.questIndex = 3;
  separated.grid[0] = { type: 'factory', level: 1 };
  separated.grid[18] = { type: 'thermal', level: 1 };
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

test('quest 11 requires an adjacent green home and resets three-hour profit on a loss', () => {
  const state = new GameState();
  state.questIndex = 11;
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[neighborIndices(0, createHexCoordinates(2))[0]] = { type: 'green', level: 1 };
  applySimulationQuestProgress(state, summary({ netCredits: 1 }));
  applySimulationQuestProgress(state, summary({ netCredits: -0.1 }));
  expect(state.questProgress.consecutiveHours).toBe(0);
  applySimulationQuestProgress(state, summary({ netCredits: 1 }));
  applySimulationQuestProgress(state, summary({ netCredits: 1 }));
  expect(state.questStatus).toBe('active');
  applySimulationQuestProgress(state, summary({ netCredits: 1 }));
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest 12 only counts extreme heat and quest 13 only counts the 19-23 night window', () => {
  const heat = new GameState();
  heat.questIndex = 12;
  heat.grid[0] = { type: 'residential', level: 1 };
  const heatTick = summary({ facilityPower: { 0: powered(0.95) } });
  applySimulationQuestProgress(heat, heatTick);
  expect(heat.questProgress.consecutiveHours || 0).toBe(0);
  heat.climateAlert = 'extreme_heat';
  for (let hour = 0; hour < 3; hour++) applySimulationQuestProgress(heat, heatTick);
  expect(heat.questStatus).toBe('ready_to_claim');

  const night = new GameState();
  night.questIndex = 13;
  applySimulationQuestProgress(night, summary({ hour: 18 }));
  expect(night.questProgress.consecutiveHours || 0).toBe(0);
  for (const hour of [19, 20, 21]) {
    applySimulationQuestProgress(night, summary({ hour }));
  }
  expect(night.questStatus).toBe('ready_to_claim');
});

test('the final quiz and integrated quest 8 become claimable only after complete requirements pass', () => {
  const final = new GameState();
  final.questIndex = 15;
  markQuestQuizResult(final, false);
  expect(final.questStatus).toBe('active');
  markQuestQuizResult(final, true);
  expect(final.questStatus).toBe('ready_to_claim');
  const solar = new GameState();
  solar.questIndex = 8;
  solar.grid[0] = { type: 'solar', level: 2 };
  markQuestQuizResult(solar, true);
  expect(solar.questStatus).toBe('active');
  solar.research.completedIds.add('solar2');
  expect(evaluateCurrentQuest(solar).ready).toBe(true);
});

test('quests 8 and 10 require their research and upgraded renewable facility together', () => {
  const solar = new GameState();
  solar.questIndex = 8;
  solar.questProgress.quizPassed = true;
  solar.research.completedIds.add('solar2');
  expect(evaluateCurrentQuest(solar).ready).toBe(false);
  solar.grid[0] = { type: 'solar', level: 2 };
  expect(evaluateCurrentQuest(solar).ready).toBe(true);

  const wind = new GameState();
  wind.questIndex = 10;
  wind.grid[0] = { type: 'wind', level: 2 };
  expect(evaluateCurrentQuest(wind).ready).toBe(false);
  wind.research.completedIds.add('wind2');
  expect(evaluateCurrentQuest(wind).ready).toBe(true);
});

test('all fifteen rewards follow the approved unlock, permit, credit, and completion sequence', () => {
  const state = new GameState();
  const expectedUnlocks = ['thermal', 'factory', 'data', 'nuclear', 'cooling', 'solar', 'battery', 'wind', 'green'];
  const expectedCredits = [4, 5, 6, 8, 8, 14, 6, 8, 8, 10, 10, 10, 12, 14, 0];
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
    if (questIndex === 4) expect(state.researchMenuUnlocked).toBe(true);
    if (questIndex === 7) expect(state.upgradePermitLevel).toBe(2);
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
