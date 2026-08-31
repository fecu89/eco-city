import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { RESEARCH } from '../../../src/core/ResearchDefinitions.js';
import {
  activeResearchJobs,
  advanceResearchOneHour,
  assignResearchDataCenter,
  cancelResearch,
  handleResearchFacilityRemoved,
  listResearchAvailability,
  researchDemandByIndex,
  researchEffects,
  startResearch,
} from '../../../src/systems/ResearchSystem.js';

function stateWithDataCenter({ credits = 60, index = 3, level = 1 } = {}) {
  const state = new GameState();
  state.credits = credits;
  state.researchMenuUnlocked = true;
  state.grid[index] = { type: 'data', level, priority: 'normal' };
  return state;
}

test('two data centers run different research jobs and consume power independently', () => {
  const state = stateWithDataCenter({ credits: 40 });
  state.grid[5] = { type: 'data', level: 2, priority: 'normal' };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');

  expect(startResearch(state, 'solar2', 3)).toMatchObject({ ok: true, cost: 10 });
  expect(startResearch(state, 'wind2', 5)).toMatchObject({ ok: true, cost: 10 });
  expect(state.credits).toBe(20);
  expect(researchDemandByIndex(state)).toEqual({ 3: 2, 5: 2 });

  const result = advanceResearchOneHour(state, { 3: { ratio: 1 }, 5: { ratio: 1 } });
  expect(result.jobs.solar2.advancedHours).toBe(1);
  expect(result.jobs.wind2.advancedHours).toBe(1.25);
  expect(state.research.jobs.solar2.elapsedEffectiveHours).toBe(1);
  expect(state.research.jobs.wind2.elapsedEffectiveHours).toBe(1.25);
});

test('one center and one research id cannot be occupied twice', () => {
  const state = stateWithDataCenter();
  state.grid[5] = { type: 'data', level: 1, priority: 'normal' };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  expect(startResearch(state, 'solar2', 3).ok).toBe(true);
  expect(startResearch(state, 'wind2', 3)).toEqual({ ok: false, reason: 'data_center_busy' });
  expect(startResearch(state, 'solar2', 5)).toEqual({ ok: false, reason: 'research_active' });
});

test('underpowered research pauses without stopping another powered center', () => {
  const state = stateWithDataCenter();
  state.grid[5] = { type: 'data', level: 2, priority: 'normal' };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  startResearch(state, 'solar2', 3);
  startResearch(state, 'wind2', 5);
  const result = advanceResearchOneHour(state, { 3: { ratio: 0.89 }, 5: { ratio: 0.9 } });
  expect(result.jobs.solar2).toMatchObject({ status: 'underpowered', advancedHours: 0 });
  expect(result.jobs.wind2).toMatchObject({ status: 'running', advancedHours: 1.25 });
  expect(state.research.jobs.solar2.elapsedEffectiveHours).toBe(0);
  expect(state.research.jobs.wind2.elapsedEffectiveHours).toBe(1.25);
});

test('research reports only real power-loss and recovery transitions', () => {
  const state = stateWithDataCenter();
  state.unlockedFacilities.add('solar');
  startResearch(state, 'solar2', 3);

  const firstLoss = advanceResearchOneHour(state, { 3: { ratio: 0.4 } });
  expect(firstLoss.jobs.solar2).toMatchObject({
    status: 'underpowered',
    dataCenterIndex: 3,
    becameUnderpowered: true,
    recoveredPower: false,
  });

  const repeatedLoss = advanceResearchOneHour(state, { 3: { ratio: 0.4 } });
  expect(repeatedLoss.jobs.solar2).toMatchObject({
    status: 'underpowered',
    becameUnderpowered: false,
    recoveredPower: false,
  });

  const recovery = advanceResearchOneHour(state, { 3: { ratio: 1 } });
  expect(recovery.jobs.solar2).toMatchObject({
    status: 'running',
    dataCenterIndex: 3,
    becameUnderpowered: false,
    recoveredPower: true,
  });
});

test('demolishing one data center preserves only its job for reassignment', () => {
  const state = stateWithDataCenter({ index: 4 });
  state.grid[5] = { type: 'data', level: 1, priority: 'normal' };
  state.grid[6] = { type: 'data', level: 1, priority: 'normal' };
  state.unlockedFacilities.add('battery');
  state.unlockedFacilities.add('wind');
  startResearch(state, 'battery2', 4);
  startResearch(state, 'wind2', 5);
  state.research.jobs.battery2.elapsedEffectiveHours = 100;
  handleResearchFacilityRemoved(state, 4);
  expect(state.research.jobs.battery2).toMatchObject({ dataCenterIndex: null, elapsedEffectiveHours: 100, status: 'unassigned' });
  expect(state.research.jobs.wind2).toMatchObject({ dataCenterIndex: 5, status: 'running' });
  expect(assignResearchDataCenter(state, 'battery2', 6)).toMatchObject({ ok: true, dataCenterIndex: 6 });
  expect(cancelResearch(state, 'battery2')).toMatchObject({ ok: true, refund: 7 });
  expect(state.credits).toBe(42);
});

test('every research finishes within three real minutes at 1x speed', () => {
  expect(Object.fromEntries(Object.entries(RESEARCH).map(([id, item]) => [id, [item.durationHours, item.cost]]))).toEqual({
    solar2: [120, 10],
    wind2: [120, 10],
    battery2: [150, 15],
    smartGrid: [150, 15],
    demandResponse: [150, 15],
    tidal1: [150, 18],
    solar3: [180, 20],
    wind3: [180, 20],
    battery3: [180, 22],
  });
  expect(Math.max(...Object.values(RESEARCH).map((item) => item.durationHours))).toBe(180);
});

test('tidal research accepts either generation branch and legacy capstone is not listed', () => {
  const state = stateWithDataCenter({ credits: 100 });
  state.research.completedIds.add('wind2');
  const availability = listResearchAvailability(state);
  expect(availability.find(({ id }) => id === 'tidal1')).toMatchObject({ available: true, reasonCodes: [] });
  expect(availability.some(({ id }) => id === 'renewable3')).toBe(false);
});

test('completed branch research exposes its distinct simulation effects', () => {
  const state = new GameState();
  expect(researchEffects(state)).toMatchObject({
    solarSupply: 1,
    windSupply: 1,
    lowWindSupply: 0.35,
    batteryCapacity: 1,
    transmissionLossPerTile: 0.06,
    demandResponse: false,
  });
  state.research.completedIds = new Set(['solar2', 'wind2', 'battery2', 'smartGrid', 'demandResponse', 'battery3']);
  expect(researchEffects(state)).toMatchObject({
    solarSupply: 1.2,
    windSupply: 1.15,
    lowWindSupply: 0.5,
    batteryCapacity: 1.3,
    transmissionLossPerTile: 0.04,
    demandResponse: true,
    batteryReservePolicies: true,
    batteryEmergencyReserve: true,
  });
});

test('finishing one job applies its technology once and leaves other jobs running', () => {
  const state = stateWithDataCenter({ credits: 100 });
  state.grid[5] = { type: 'data', level: 1, priority: 'normal' };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  expect(listResearchAvailability(state).find(({ id }) => id === 'solar2').available).toBe(true);
  startResearch(state, 'solar2', 3);
  startResearch(state, 'wind2', 5);
  state.research.jobs.solar2.elapsedEffectiveHours = RESEARCH.solar2.durationHours - 1;
  const completed = advanceResearchOneHour(state, { 3: { ratio: 1 }, 5: { ratio: 1 } });
  expect(completed.completed).toEqual([expect.objectContaining({ researchId: 'solar2' })]);
  expect(state.research.techLevels.solar).toBe(2);
  expect(state.research.completedIds.has('solar2')).toBe(true);
  expect(state.research.jobs.solar2).toBeUndefined();
  expect(state.research.jobs.wind2).toBeDefined();
  expect(activeResearchJobs(state).map(({ id }) => id)).toEqual(['wind2']);
});
