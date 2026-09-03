import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { RESEARCH } from '../../../src/core/ResearchDefinitions.js';
import { RESEARCH_QUIZZES } from '../../../src/core/ResearchQuizDefinitions.js';
import {
  activeResearchJobs,
  advanceResearchOneDay,
  assignResearchDataCenter,
  cancelResearch,
  handleResearchFacilityRemoved,
  listResearchAvailability,
  researchDemandByIndex,
  researchEffects,
  startResearch,
} from '../../../src/systems/ResearchSystem.js';
import { createUpgradeProject } from '../../../src/systems/ConstructionProjectSystem.js';
import { startResearchQuiz } from '../../../src/systems/QuizSystem.js';
import { buildCityModifierContext } from '../../../src/systems/CityModifierSystem.js';
import { RESEARCH_TUNING } from '../../../src/core/Constants.js';

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

  const result = advanceResearchOneDay(state, { 3: { ratio: 1 }, 5: { ratio: 1 } });
  expect(result.jobs.solar2.advancedDays).toBe(1);
  expect(result.jobs.wind2.advancedDays).toBe(1.25);
  expect(state.research.jobs.solar2.elapsedEffectiveDays).toBe(1);
  expect(state.research.jobs.wind2.elapsedEffectiveDays).toBe(1.25);
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

test('an upgrading data center cannot start a research job', () => {
  const state = stateWithDataCenter();
  state.unlockedFacilities.add('solar');
  state.grid[3].project = createUpgradeProject({ cell: state.grid[3], paidCost: 6 });
  const creditsBefore = state.credits;

  expect(startResearch(state, 'solar2', 3)).toEqual({
    ok: false,
    reason: 'data_center_upgrading',
  });
  expect(state.credits).toBe(creditsBefore);
  expect(state.research.jobs).toEqual({});
});

test('underpowered research pauses without stopping another powered center', () => {
  const state = stateWithDataCenter();
  state.grid[5] = { type: 'data', level: 2, priority: 'normal' };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  startResearch(state, 'solar2', 3);
  startResearch(state, 'wind2', 5);
  const result = advanceResearchOneDay(state, { 3: { ratio: 0.89 }, 5: { ratio: 0.9 } });
  expect(result.jobs.solar2).toMatchObject({ status: 'underpowered', advancedDays: 0 });
  expect(result.jobs.wind2).toMatchObject({ status: 'running', advancedDays: 1.25 });
  expect(state.research.jobs.solar2.elapsedEffectiveDays).toBe(0);
  expect(state.research.jobs.wind2.elapsedEffectiveDays).toBe(1.25);
});

test('research reports only real power-loss and recovery transitions', () => {
  const state = stateWithDataCenter();
  state.unlockedFacilities.add('solar');
  startResearch(state, 'solar2', 3);

  const firstLoss = advanceResearchOneDay(state, { 3: { ratio: 0.4 } });
  expect(firstLoss.jobs.solar2).toMatchObject({
    status: 'underpowered',
    dataCenterIndex: 3,
    becameUnderpowered: true,
    recoveredPower: false,
  });

  const repeatedLoss = advanceResearchOneDay(state, { 3: { ratio: 0.4 } });
  expect(repeatedLoss.jobs.solar2).toMatchObject({
    status: 'underpowered',
    becameUnderpowered: false,
    recoveredPower: false,
  });

  const recovery = advanceResearchOneDay(state, { 3: { ratio: 1 } });
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
  state.research.jobs.battery2.elapsedEffectiveDays = 100;
  handleResearchFacilityRemoved(state, 4);
  expect(state.research.jobs.battery2).toMatchObject({ dataCenterIndex: null, elapsedEffectiveDays: 100, status: 'unassigned' });
  expect(state.research.jobs.wind2).toMatchObject({ dataCenterIndex: 5, status: 'running' });
  expect(assignResearchDataCenter(state, 'battery2', 6)).toMatchObject({ ok: true, dataCenterIndex: 6 });
  expect(cancelResearch(state, 'battery2')).toMatchObject({ ok: true, refund: 7 });
  expect(state.credits).toBe(42);
});

test('every research finishes within three real minutes at 1x speed', () => {
  expect(Object.fromEntries(Object.entries(RESEARCH).map(([id, item]) => [id, [item.durationDays, item.cost]]))).toEqual({
    solar2: [120, 10],
    wind2: [120, 10],
    battery2: [150, 15],
    smartGrid: [150, 15],
    tidal1: [150, 18],
    solar3: [180, 20],
    wind3: [180, 20],
    battery3: [180, 22],
    green2: [90, 10],
    green3: [150, 16],
  });
  expect(Math.max(...Object.values(RESEARCH).map((item) => item.durationDays))).toBe(180);
});

test('green level-three research is available after the monsoon quest so every upgrade path is open by quest thirteen', () => {
  const state = stateWithDataCenter({ credits: 100 });
  state.questIndex = 12;
  state.unlockedFacilities.add('green');
  state.research.completedIds.add('green2');
  state.research.techLevels.green = 2;

  expect(listResearchAvailability(state).find(({ id }) => id === 'green3')).toMatchObject({
    available: false,
    reasonCodes: ['quest:monsoon-response'],
  });

  state.questIndex = 13;
  state.claimedQuestIds.add('monsoon-response');
  expect(listResearchAvailability(state).find(({ id }) => id === 'green3')).toMatchObject({
    available: true,
    reasonCodes: [],
  });
});

test('tidal research accepts either generation branch and legacy capstone is not listed', () => {
  const state = stateWithDataCenter({ credits: 100 });
  state.research.completedIds.add('wind2');
  state.claimedQuestIds.add('wind-pilot-grid');
  const availability = listResearchAvailability(state);
  expect(availability.find(({ id }) => id === 'tidal1')).toMatchObject({ available: true, reasonCodes: [] });
  expect(availability.some(({ id }) => id === 'renewable3')).toBe(false);
});

test('green research appears only after its campaign quest and gates the next level', () => {
  const state = stateWithDataCenter({ credits: 100 });
  state.unlockedFacilities.add('green');
  expect(listResearchAvailability(state).find(({ id }) => id === 'green2')).toMatchObject({
    available: false,
    reasonCodes: ['quest:extreme-heat'],
  });
  state.claimedQuestIds.add('extreme-heat');
  expect(listResearchAvailability(state).find(({ id }) => id === 'green2')).toMatchObject({
    available: true,
    cost: 10,
    durationDays: 90,
  });
});

test('tidal research remains quest-locked even when its technology prerequisite is complete', () => {
  const state = stateWithDataCenter({ credits: 100 });
  state.research.completedIds.add('wind2');
  expect(listResearchAvailability(state).find(({ id }) => id === 'tidal1')).toMatchObject({
    available: false,
    reasonCodes: ['quest:wind-pilot-grid'],
  });
  state.claimedQuestIds.add('wind-pilot-grid');
  expect(listResearchAvailability(state).find(({ id }) => id === 'tidal1')).toMatchObject({
    available: true,
    reasonCodes: [],
  });
});

test('every green research has four dedicated quiz questions', () => {
  expect(RESEARCH_QUIZZES.green2).toHaveLength(4);
  expect(RESEARCH_QUIZZES.green3).toHaveLength(4);
  expect(new Set([...RESEARCH_QUIZZES.green2, ...RESEARCH_QUIZZES.green3].map(({ id }) => id)).size).toBe(8);
});

test('completed branch research exposes its distinct simulation effects', () => {
  const state = new GameState();
  expect(researchEffects(state)).toMatchObject({
    solarSupply: 1,
    windSupply: 1,
    lowWindSupply: 0.35,
    batteryCapacity: 1,
    transmissionLossPerTile: 0.06,
  });
  state.research.completedIds = new Set(['solar2', 'wind2', 'battery2', 'smartGrid', 'battery3']);
  expect(researchEffects(state)).toMatchObject({
    solarSupply: 1.2,
    windSupply: 1.15,
    lowWindSupply: 0.5,
    batteryCapacity: 1.3,
    transmissionLossPerTile: 0.04,
    batteryReservePolicies: true,
    batteryEmergencyReserve: true,
  });
});

// 풍력 완화 연구(wind2)는 원래 은퇴한 이벤트 id 'lowWind'에만 걸려 있어 어떤 재난에서도
// 발동하지 않았다. 지금 덱에서 바람을 깎는 재난은 stagnantAir(풍력 0.25)다.
function windResearchSupplyUnder(eventType, { researched } = {}) {
  const state = new GameState();
  state.grid[0] = { type: 'wind', level: 1, priority: 'normal' };
  state.events.schedule = [{ id: 'evt-1', type: eventType, announceAt: 0, startAt: 0, endAt: 6 }];
  state.events.activeId = 'evt-1';
  if (researched) state.research.completedIds = new Set(['wind2']);
  return buildCityModifierContext(state).byFacility[0].research.supply;
}

test('풍력 완화 연구가 바람을 깎는 재난에서 실제로 출력을 되돌린다', () => {
  const relief = RESEARCH_TUNING.LOW_WIND_SUPPLY_RESEARCHED / RESEARCH_TUNING.LOW_WIND_SUPPLY_BASE;

  // 무풍·미세먼지(stagnantAir): 연구 전에는 완화가 없고, wind2를 마치면 완화가 더 붙는다.
  const stagnantBase = windResearchSupplyUnder('stagnantAir');
  const stagnantResearched = windResearchSupplyUnder('stagnantAir', { researched: true });
  expect(stagnantBase).toBeCloseTo(1, 5);
  expect(stagnantResearched).toBeCloseTo(1.15 * relief, 5);
  expect(stagnantResearched).toBeGreaterThan(stagnantBase * 1.15);

  // 바람을 깎지 않는 재난(폭염)에서는 상시 보너스(1.15)만 남는다.
  expect(windResearchSupplyUnder('heatwave', { researched: true })).toBeCloseTo(1.15, 5);
  expect(windResearchSupplyUnder('heatwave')).toBeCloseTo(1, 5);
});

test('finishing one job applies its technology once and leaves other jobs running', () => {
  const state = stateWithDataCenter({ credits: 100 });
  state.grid[5] = { type: 'data', level: 1, priority: 'normal' };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  expect(listResearchAvailability(state).find(({ id }) => id === 'solar2').available).toBe(true);
  startResearch(state, 'solar2', 3);
  startResearch(state, 'wind2', 5);
  state.research.jobs.solar2.elapsedEffectiveDays = RESEARCH.solar2.durationDays - 1;
  const completed = advanceResearchOneDay(state, { 3: { ratio: 1 }, 5: { ratio: 1 } });
  expect(completed.completed).toEqual([expect.objectContaining({ researchId: 'solar2' })]);
  expect(state.research.techLevels.solar).toBe(2);
  expect(state.research.completedIds.has('solar2')).toBe(true);
  expect(state.research.jobs.solar2).toBeUndefined();
  expect(state.research.jobs.wind2).toBeDefined();
  expect(activeResearchJobs(state).map(({ id }) => id)).toEqual(['wind2']);
});

test('cancelling a research clears its quiz credit so a restart can be accelerated again', () => {
  const state = stateWithDataCenter();
  state.unlockedFacilities.add('solar');
  expect(startResearch(state, 'solar2', 3)).toMatchObject({ ok: true });
  state.research.quizCreditQuestionIds.solar2 = RESEARCH_QUIZZES.solar2.map(({ id }) => id);

  expect(cancelResearch(state, 'solar2')).toMatchObject({ ok: true });
  expect(state.research.quizCreditQuestionIds.solar2).toBeUndefined();

  expect(startResearch(state, 'solar2', 3)).toMatchObject({ ok: true });
  expect(startResearchQuiz(state, 'solar2', () => 0.5)).toMatchObject({
    ok: true,
    total: RESEARCH_QUIZZES.solar2.length,
  });
});

test('research state carries no always-zero quiz acceleration bank', () => {
  const state = stateWithDataCenter();
  expect(state.research).not.toHaveProperty('quizAccelerationBankDays');
  expect(state.serialize().research).not.toHaveProperty('quizAccelerationBankDays');
});
