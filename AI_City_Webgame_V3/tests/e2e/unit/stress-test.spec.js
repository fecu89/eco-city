import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { STRESS_PHASES } from '../../../src/core/EventDefinitions.js';
import { assessConstructionPlan } from '../../../src/systems/ConstructionPlanSystem.js';
import { buildCityModifierContext } from '../../../src/systems/CityModifierSystem.js';
import {
  advanceStressTest,
  finishStressTest,
  startStressTest,
  stressModifierForFacility,
  stressCityModifier,
} from '../../../src/systems/StressTestSystem.js';

function readyState({ greenLevels = [1, 1, 2] } = {}) {
  const state = new GameState();
  state.questIndex = 15;
  state.stressTest.status = 'ready';
  state.credits = 20;
  state.research.completedIds.add('tidal1');
  state.research.techLevels.tidal = 1;
  state.grid[0] = { type: 'tidal', level: 1 };
  greenLevels.forEach((level, offset) => {
    state.grid[offset + 1] = { type: 'green', level };
  });
  return state;
}

function safeSummary(overrides = {}) {
  return {
    essentialSupplyPercent: 100,
    netCredits: 2,
    dailyCarbon: 5,
    dailyWater: 5,
    waterLimit: 10,
    batteryOperations: {},
    generationDeliveredByType: {},
    ...overrides,
  };
}

function runFortyOneDays(state, summaryForDay = () => safeSummary()) {
  const days = STRESS_PHASES.reduce((sum, phase) => sum + phase.durationDays, 0);
  for (let day = 0; day < days; day += 1) {
    const phase = STRESS_PHASES[state.stressTest.phaseIndex];
    advanceStressTest(state, summaryForDay(day, phase));
  }
  return state.stressTest.result;
}

test('final test runs eight phases for exactly forty-one days', () => {
  expect(STRESS_PHASES.map(({ id, durationDays }) => [id, durationDays])).toEqual([
    ['baseline', 3], ['heatDome', 6], ['monsoonFront', 5], ['coastalSuperstorm', 6],
    ['winterDisaster', 6], ['stagnantAir', 5], ['dryEmergency', 5], ['recovery', 5],
  ]);
  expect(STRESS_PHASES.reduce((sum, phase) => sum + phase.durationDays, 0)).toBe(41);
});

test('final test entry requires completed tidal research and an operational tidal facility', () => {
  const state = new GameState();
  state.questIndex = 15;
  state.stressTest.status = 'ready';
  expect(startStressTest(state)).toMatchObject({ ok: false, reason: 'tidal_required' });

  state.research.completedIds.add('tidal1');
  state.grid[0] = { type: 'tidal', level: 1, project: { kind: 'build' } };
  expect(startStressTest(state)).toMatchObject({ ok: false, reason: 'tidal_required' });

  state.grid[0] = { type: 'tidal', level: 1 };
  expect(startStressTest(state)).toMatchObject({ ok: true, phase: expect.objectContaining({ id: 'baseline' }) });
});

test('stress phases reuse shared facility and city climate modifiers', () => {
  const state = readyState();
  startStressTest(state);
  state.stressTest.phaseIndex = 1;
  expect(stressModifierForFacility(state, 'residential')).toMatchObject({ demand: 1.35 });
  expect(stressModifierForFacility(state, 'data')).toMatchObject({ water: 1.3 });
  expect(stressCityModifier(state, { baselineWater: 10 })).toMatchObject({ waterLimit: 7 });
  state.stressTest.phaseIndex = 3;
  expect(stressModifierForFacility(state, 'wind')).toMatchObject({ supply: 0.1 });
  expect(stressModifierForFacility(state, 'tidal')).toMatchObject({ supply: 1 });
  state.stressTest.phaseIndex = 6;
  expect(stressModifierForFacility(state, 'green', 1)).toMatchObject({ negative: 0.5 });
  expect(stressCityModifier(state)).toMatchObject({ carbonFlat: 2 });
});

test('the live city modifier context applies stress city limits and facility levels', () => {
  const state = readyState({ greenLevels: [2] });
  state.baseline = { dailyWater: 10 };
  startStressTest(state);
  state.stressTest.phaseIndex = 1;
  expect(buildCityModifierContext(state).city).toMatchObject({ waterLimit: 7 });
  state.stressTest.phaseIndex = 6;
  const context = buildCityModifierContext(state);
  expect(context.city).toMatchObject({ carbonFlat: 2 });
  expect(context.byFacility[1].stress).toMatchObject({ negative: 0.75 });
});

test('a safe city passes without green level three when tidal power is actually delivered', () => {
  const state = readyState({ greenLevels: [1, 1, 2] });
  expect(startStressTest(state)).toMatchObject({ ok: true });
  const result = runFortyOneDays(state, (_day, phase) => safeSummary({
    generationDeliveredByType: phase.id === 'coastalSuperstorm' ? { tidal: 1.5 } : {},
  }));

  expect(result).toMatchObject({
    passed: true,
    averageEssentialSupply: 100,
    minimumEssentialSupply: 100,
    daysAtOrBelowEight: 41,
    daysAboveTen: 0,
    averageCarbon: 5,
    waterViolationDays: 0,
    tidalEnergyDelivered: 9,
    recoveryAchievedAtDay: 1,
  });
  expect(state.campaignComplete).toBe(true);
});

test('carbon, hard supply floor, water, recovery, and tidal gates each prevent a pass', () => {
  const cases = [
    {
      label: 'carbon average',
      summary: (day, phase) => safeSummary({
        dailyCarbon: 8.1,
        generationDeliveredByType: phase.id === 'coastalSuperstorm' ? { tidal: 2 } : {},
      }),
      expected: { averageCarbon: 8.1 },
    },
    {
      label: 'hard supply floor',
      summary: (day, phase) => safeSummary({
        essentialSupplyPercent: day === 2 ? 49 : 100,
        generationDeliveredByType: phase.id === 'coastalSuperstorm' ? { tidal: 2 } : {},
      }),
      expected: { minimumEssentialSupply: 49 },
    },
    {
      label: 'water violations',
      summary: (day, phase) => safeSummary({
        dailyWater: day < 7 ? 11 : 5,
        generationDeliveredByType: phase.id === 'coastalSuperstorm' ? { tidal: 2 } : {},
      }),
      expected: { waterViolationDays: 7 },
    },
    {
      label: 'late recovery',
      summary: (day, phase) => safeSummary({
        essentialSupplyPercent: phase.id === 'recovery' && day < 39 ? 80 : 100,
        netCredits: phase.id === 'recovery' && day < 39 ? -1 : 2,
        generationDeliveredByType: phase.id === 'coastalSuperstorm' ? { tidal: 2 } : {},
      }),
      expected: { recoveryAchievedAtDay: 4 },
    },
    {
      label: 'tidal delivery',
      summary: () => safeSummary(),
      expected: { tidalEnergyDelivered: 0 },
    },
  ];

  for (const scenario of cases) {
    const state = readyState();
    startStressTest(state);
    const result = runFortyOneDays(state, scenario.summary);
    expect(result, scenario.label).toMatchObject({ passed: false, ...scenario.expected });
  }
});

test('four consecutive bankrupt days fail without deleting the city and retry remains non-destructive', () => {
  const state = readyState();
  startStressTest(state);
  state.credits = -1;
  for (let day = 0; day < 4; day += 1) advanceStressTest(state, safeSummary({ netCredits: -1 }));
  const result = finishStressTest(state);

  expect(result).toMatchObject({ passed: false, maxConsecutiveBankruptcyDays: 4, finalCredits: -1 });
  expect(state.stressTest.status).toBe('failed');
  expect(state.grid[0]).toMatchObject({ type: 'tidal', level: 1 });
  state.credits = 5;
  expect(startStressTest(state)).toMatchObject({ ok: true });
});

test('construction costs twenty percent more while the final test is running', () => {
  const state = readyState();
  state.grid[5] = null;
  state.unlockedFacilities.add('residential');
  state.constructionPlan = [{ index: 5, type: 'residential' }];
  expect(assessConstructionPlan(state).totalCost).toBe(2);
  startStressTest(state);
  expect(assessConstructionPlan(state).totalCost).toBe(2.4);
});
