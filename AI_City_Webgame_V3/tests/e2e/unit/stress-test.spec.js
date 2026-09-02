import { test, expect } from '@playwright/test';
import { GameState, gameState } from '../../../src/core/GameState.js';
import { STAGES, STRESS_TEST_RULES } from '../../../src/core/Constants.js';
import { CAMPAIGN_QUEST_INDEXES } from '../../../src/core/CampaignProgression.js';
import { QUESTS } from '../../../src/core/QuestDefinitions.js';
import { STRESS_PHASES } from '../../../src/core/EventDefinitions.js';
import { assessConstructionPlan } from '../../../src/systems/ConstructionPlanSystem.js';
import { buildCityModifierContext } from '../../../src/systems/CityModifierSystem.js';
import { exportReport } from '../../../src/systems/ReportSystem.js';
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
    waterLimit: null,
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
  expect(stressCityModifier(state, { baselineWater: 10 })).toMatchObject({ waterLimit: null });
  state.stressTest.phaseIndex = 3;
  expect(stressModifierForFacility(state, 'wind')).toMatchObject({ supply: 0.1 });
  expect(stressModifierForFacility(state, 'tidal')).toMatchObject({ supply: 1 });
  state.stressTest.phaseIndex = 6;
  expect(stressModifierForFacility(state, 'green', 1)).toMatchObject({ negative: 0.5 });
  expect(stressModifierForFacility(state, 'cooling')).toMatchObject({ effectiveness: 1.25 });
  expect(stressCityModifier(state, { baselineWater: 10 })).toMatchObject({ carbonFlat: 2, waterLimit: 10 });
});

test('the live city modifier context applies stress city limits and facility levels', () => {
  const state = readyState({ greenLevels: [2] });
  state.baseline = { dailyWater: 10 };
  startStressTest(state);
  state.stressTest.phaseIndex = 1;
  expect(buildCityModifierContext(state).city).toMatchObject({ waterLimit: null });
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

test('exam water limits follow the water the city used when the exam started', () => {
  const state = readyState();
  state.lastTickSummary = { dailyWater: 14 };
  expect(startStressTest(state)).toMatchObject({ ok: true });
  expect(state.stressTest.waterBaseline).toBe(14);

  // 기준 측정·열돔 구간에는 물 한도가 아예 없다.
  expect(buildCityModifierContext(state).city.waterLimit).toBe(null);
  state.stressTest.phaseIndex = STRESS_PHASES.findIndex(({ id }) => id === 'heatDome');
  expect(buildCityModifierContext(state).city.waterLimit).toBe(null);
  advanceStressTest(state, safeSummary({ dailyWater: 99, waterLimit: null }));
  expect(state.stressTest.metrics.waterViolationDays).toBe(0);

  // 건조 위기 구간만 "시작 시점 사용량 그대로" 한도를 건다.
  state.stressTest.phaseIndex = STRESS_PHASES.findIndex(({ id }) => id === 'dryEmergency');
  const dryLimit = buildCityModifierContext(state).city.waterLimit;
  expect(dryLimit).toBe(14);
  advanceStressTest(state, safeSummary({ dailyWater: 14, waterLimit: dryLimit }));
  expect(state.stressTest.metrics.waterViolationDays).toBe(0);
  advanceStressTest(state, safeSummary({ dailyWater: 14.1, waterLimit: dryLimit }));
  expect(state.stressTest.metrics.waterViolationDays).toBe(1);
});

test('water violations fail the exam only above the three day allowance', () => {
  expect(STRESS_TEST_RULES.MAX_WATER_VIOLATION_DAYS).toBe(3);
  const dryEmergency = STRESS_PHASES.find(({ id }) => id === 'dryEmergency');
  expect(dryEmergency.durationDays).toBe(5);

  for (const [violationDays, passed] of [[3, true], [4, false]]) {
    const state = readyState();
    state.lastTickSummary = { dailyWater: 10 };
    startStressTest(state);
    let dryDay = 0;
    const result = runFortyOneDays(state, (_day, phase) => {
      const dry = phase.id === 'dryEmergency';
      const over = dry && dryDay++ < violationDays;
      return safeSummary({
        dailyWater: over ? 11 : 5,
        waterLimit: dry ? 10 : null,
        generationDeliveredByType: phase.id === 'coastalSuperstorm' ? { tidal: 2 } : {},
      });
    });
    expect(result, `${violationDays} violation days`).toMatchObject({ waterViolationDays: violationDays, passed });
  }
});

test('passing the final test claims quest nineteen so the report lists it', () => {
  const finalQuestId = QUESTS[CAMPAIGN_QUEST_INDEXES.FINAL_TEST - 1].id;
  const state = readyState();
  state.questIndex = CAMPAIGN_QUEST_INDEXES.FINAL_TEST;
  state.stage = STAGES.REDESIGN;
  startStressTest(state);
  runFortyOneDays(state, (_day, phase) => safeSummary({
    generationDeliveredByType: phase.id === 'coastalSuperstorm' ? { tidal: 1.5 } : {},
  }));

  expect(state.claimedQuestIds.has(finalQuestId)).toBe(true);
  expect(state.questStatus).toBe('claimed');
  expect(state.stage).toBe(STAGES.REPORT);

  expect(gameState.hydrate(state.serialize())).toBe(true);
  expect(exportReport().completedQuests).toContain(finalQuestId);
});

test('a failed final test leaves quest nineteen unclaimed and the board open for repairs', () => {
  const state = readyState();
  state.questIndex = CAMPAIGN_QUEST_INDEXES.FINAL_TEST;
  state.stage = STAGES.REDESIGN;
  startStressTest(state);
  const result = runFortyOneDays(state, () => safeSummary());

  expect(result.passed).toBe(false);
  expect(state.claimedQuestIds.has(QUESTS[CAMPAIGN_QUEST_INDEXES.FINAL_TEST - 1].id)).toBe(false);
  expect(state.isEditable).toBe(true);
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
        dailyWater: phase.id === 'dryEmergency' ? 11 : 5,
        waterLimit: phase.id === 'dryEmergency' ? 10 : null,
        generationDeliveredByType: phase.id === 'coastalSuperstorm' ? { tidal: 2 } : {},
      }),
      expected: { waterViolationDays: 5 },
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
