import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { STRESS_PHASES } from '../../../src/core/EventDefinitions.js';
import { assessConstructionPlan } from '../../../src/systems/ConstructionPlanSystem.js';
import {
  advanceStressTest,
  finishStressTest,
  startStressTest,
  stressModifierForFacility,
} from '../../../src/systems/StressTestSystem.js';

function readyState() {
  const state = new GameState();
  state.stressTest.status = 'ready';
  state.credits = 20;
  return state;
}

function safeSummary(overrides = {}) {
  return {
    essentialSupplyPercent: 100,
    netCredits: 2,
    hourlyCarbon: 5,
    hourlyWater: 5,
    waterLimit: 10,
    batteryOperations: {},
    ...overrides,
  };
}

test('stress test advances through the exact five phases and records a passing result', () => {
  const state = readyState();
  expect(STRESS_PHASES.map(({ id, durationHours }) => [id, durationHours])).toEqual([
    ['normal', 4], ['heatwave', 8], ['nightPeak', 5], ['lowWindNight', 6], ['recovery', 4],
  ]);
  expect(startStressTest(state)).toMatchObject({ ok: true, phase: expect.objectContaining({ id: 'normal' }) });

  for (let hour = 0; hour < 27; hour++) advanceStressTest(state, safeSummary());

  expect(state.stressTest.status).toBe('passed');
  expect(state.campaignComplete).toBe(true);
  expect(state.stressTest.result).toMatchObject({
    blackoutHours: 0,
    minimumEssentialSupply: 100,
    averageEssentialSupply: 100,
    averageNetIncome: 2,
    carbonRiskHours: 0,
    waterViolationHours: 0,
    maxConsecutiveBankruptcyHours: 0,
    finalCredits: 20,
    passed: true,
  });
});

test('stress modifiers reuse event pressure and make low-wind night deterministic', () => {
  const state = readyState();
  startStressTest(state);
  state.stressTest.phaseIndex = 1;
  expect(stressModifierForFacility(state, 'residential')).toMatchObject({ demand: 1.25 });
  expect(stressModifierForFacility(state, 'data')).toMatchObject({ water: 1.2 });
  state.stressTest.phaseIndex = 2;
  expect(stressModifierForFacility(state, 'solar')).toMatchObject({ supply: 0.05 });
  state.stressTest.phaseIndex = 3;
  expect(stressModifierForFacility(state, 'wind')).toMatchObject({ supply: 0.4 });
  expect(stressModifierForFacility(state, 'solar')).toMatchObject({ supply: 0 });
});

test('six consecutive bankrupt settlements fail without deleting the city and can be retried', () => {
  const state = readyState();
  state.grid[0] = { type: 'residential', level: 1 };
  startStressTest(state);
  state.credits = -1;
  for (let hour = 0; hour < 6; hour++) advanceStressTest(state, safeSummary({ netCredits: -1 }));
  const result = finishStressTest(state);

  expect(result).toMatchObject({ passed: false, maxConsecutiveBankruptcyHours: 6, finalCredits: -1 });
  expect(state.stressTest.status).toBe('failed');
  expect(state.campaignComplete).toBe(false);
  expect(state.grid[0]).toMatchObject({ type: 'residential', level: 1 });
  state.credits = 5;
  expect(startStressTest(state)).toMatchObject({ ok: true });
});

test('construction costs twenty percent more while the stress test is running', () => {
  const state = readyState();
  state.unlockedFacilities.add('residential');
  state.constructionPlan = [{ index: 0, type: 'residential' }];
  expect(assessConstructionPlan(state).totalCost).toBe(2);
  startStressTest(state);
  expect(assessConstructionPlan(state).totalCost).toBe(2.4);
});
