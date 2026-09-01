import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  acknowledgeClimateBriefing,
  advanceClimateQuest,
  claimClimateQuest,
  currentClimateQuestEvaluation,
  retryClimateQuest,
} from '../../../src/systems/ClimateQuestSystem.js';
import {
  claimCurrentQuest,
  evaluateCurrentQuest,
} from '../../../src/systems/QuestSystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import { cloneSimulationState, forecastSimulation } from '../../../src/systems/SimulationForecastSystem.js';

function climateState(index) {
  const state = new GameState();
  state.questIndex = index;
  state.questStatus = 'active';
  state.progression.chapter = 3;
  state.climateCampaign = {
    status: 'briefing',
    eventType: null,
    attempt: 0,
    scheduledEventId: null,
    progress: {},
    lastResult: null,
    completedEventTypes: [],
  };
  return state;
}

function activeClimateState(index) {
  const state = climateState(index);
  const acknowledged = acknowledgeClimateBriefing(state);
  expect(acknowledged.ok).toBe(true);
  const event = state.events.schedule[0];
  state.elapsedGameDays = event.startAt;
  state.events.activeId = event.id;
  state.climateCampaign.status = 'active';
  return state;
}

const summary = (overrides = {}) => ({
  essentialSupplyPercent: 100,
  batteryOperations: {},
  generationDeliveredByType: {},
  facilityPower: {},
  routes: [],
  netCredits: 1,
  dailyCarbon: 4,
  dailyWater: 4,
  waterLimit: 10,
  ...overrides,
});

test('acknowledging quest seven schedules one heatwave exactly 24 days ahead', () => {
  const state = climateState(7);
  state.elapsedGameDays = 13;

  const result = acknowledgeClimateBriefing(state);

  expect(result).toMatchObject({ ok: true, eventType: 'heatwave', startsInDays: 24 });
  expect(state.climateCampaign).toMatchObject({
    status: 'preparation',
    eventType: 'heatwave',
    attempt: 1,
    scheduledEventId: 'climate-q7-a1',
  });
  expect(state.events.schedule).toEqual([{
    id: 'climate-q7-a1',
    source: 'campaign',
    type: 'heatwave',
    announceAt: 13,
    startAt: 37,
    endAt: 45,
  }]);
});

test('quest eight counts real battery discharge and resets consecutive supply on outage', () => {
  const state = activeClimateState(8);

  advanceClimateQuest(state, summary({ essentialSupplyPercent: 100, batteryOperations: { 4: { discharged: 2 } } }));
  advanceClimateQuest(state, summary({ essentialSupplyPercent: 80, batteryOperations: { 4: { discharged: 2 } } }));

  expect(currentClimateQuestEvaluation(state)).toMatchObject({
    ready: false,
    consecutiveDays: 0,
    batteryEnergy: 4,
  });
});

test('quest nine requires two actual generation types on every qualifying day', () => {
  const state = activeClimateState(9);

  advanceClimateQuest(state, summary({ generationDeliveredByType: { solar: 2, wind: 0.09 } }));
  expect(currentClimateQuestEvaluation(state).consecutiveDays).toBe(0);

  for (let day = 0; day < 4; day += 1) {
    advanceClimateQuest(state, summary({ generationDeliveredByType: { solar: 2, wind: 0.1 } }));
  }
  expect(currentClimateQuestEvaluation(state).consecutiveDays).toBe(4);
});

test('quest fourteen cannot start without completed tidal research and an operational tidal facility', () => {
  const state = climateState(14);
  state.grid[0] = { type: 'tidal', level: 1, project: { kind: 'build' } };

  expect(acknowledgeClimateBriefing(state)).toMatchObject({
    ok: false,
    reason: 'tidal_preparation_required',
  });

  state.research.completedIds.add('tidal1');
  state.grid[0] = { type: 'tidal', level: 1 };
  expect(acknowledgeClimateBriefing(state)).toMatchObject({ ok: true, eventType: 'stormSurge' });
});

test('a failed attempt can be retried without rebuilding the city or receiving rewards', () => {
  const state = activeClimateState(7);
  const creditsBefore = state.credits;
  const gridBefore = state.grid;

  const event = state.events.schedule[0];
  state.elapsedGameDays = event.endAt;
  advanceClimateQuest(state, summary({ essentialSupplyPercent: 40 }), { ended: event });

  expect(state.climateCampaign.status).toBe('result');
  expect(state.questStatus).toBe('active');
  expect(claimClimateQuest(state)).toMatchObject({ ok: false, reason: 'not_ready' });
  expect(retryClimateQuest(state)).toMatchObject({ ok: true, eventType: 'heatwave', startsInDays: 24 });
  expect(state.climateCampaign.attempt).toBe(2);
  expect(state.credits).toBe(creditsBefore);
  expect(state.grid).toBe(gridBefore);
});

test('passing and claiming quest fourteen advances the single cursor to the final test', () => {
  const state = climateState(14);
  state.research.completedIds.add('tidal1');
  state.grid[0] = { type: 'tidal', level: 1 };
  acknowledgeClimateBriefing(state);
  const event = state.events.schedule[0];
  state.elapsedGameDays = event.startAt;
  state.events.activeId = event.id;
  state.climateCampaign.status = 'active';

  for (let day = 0; day < 4; day += 1) {
    advanceClimateQuest(state, summary({ generationDeliveredByType: { tidal: 2 } }));
  }
  state.elapsedGameDays = event.endAt;
  advanceClimateQuest(state, summary(), { ended: event });
  expect(state.questStatus).toBe('ready_to_claim');

  const creditsBefore = state.credits;
  expect(claimClimateQuest(state)).toMatchObject({ ok: true, nextQuest: 15, stressTest: true });
  expect(state.questIndex).toBe(15);
  expect(state.stressTest.status).toBe('ready');
  expect(state.progression.chapter).toBe(4);
  expect(state.credits).toBe(creditsBefore + 14);
  expect(state.climateCampaign.completedEventTypes).toEqual(['stormSurge']);
});

test('claiming foundation quest six opens the first climate briefing without an objective loop', () => {
  const state = new GameState();
  state.questIndex = 6;
  state.questStatus = 'ready_to_claim';
  state.progression.objectiveSetId = 'specialization';

  expect(claimCurrentQuest(state)).toMatchObject({ ok: true, nextQuest: 7, expandGrid: true });
  expect(state).toMatchObject({ questIndex: 7, questStatus: 'active' });
  expect(state.progression).toMatchObject({ chapter: 3, objectiveSetId: null });
  expect(state.climateCampaign).toMatchObject({ status: 'briefing' });
});

test('the public quest API delegates climate evaluation and claiming to the climate lifecycle', () => {
  const state = activeClimateState(7);
  for (let day = 0; day < 4; day += 1) advanceClimateQuest(state, summary());
  const event = state.events.schedule[0];
  state.elapsedGameDays = event.endAt;
  advanceClimateQuest(state, summary(), { ended: event });

  expect(evaluateCurrentQuest(state)).toMatchObject({ ready: true, status: 'result' });
  expect(claimCurrentQuest(state)).toMatchObject({ ok: true, nextQuest: 8 });
  expect(state.climateCampaign.status).toBe('briefing');
});

test('daily settlement advances the active climate quest from event start through result', () => {
  const state = climateState(7);
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  acknowledgeClimateBriefing(state);
  const event = state.events.schedule[0];
  state.elapsedGameDays = event.startAt - 1;
  const settleDay = createDaySettler({
    calculatePowerNetwork: () => ({
      nextBatteries: {},
      facilityPower: { 0: { demand: 2, delivered: 2, ratio: 1 } },
      routes: [],
      batteryOperations: {},
      demand: 2,
      delivered: 2,
      lowCarbonPercent: 100,
      lowCarbonDelivered: 2,
      lowCarbonSurplus: 0,
      generationAvailable: 2,
    }),
    settleEconomy: ({ credits }) => ({
      nextCredits: credits + 1,
      netCredits: 1,
      dailyCarbon: 4,
      dailyWater: 2,
      labor: { capacity: 6, used: 0, workforce: 6, jobs: 0, employmentRate: 0, industryFill: 1 },
      facilityEconomy: {},
      facilityEnvironment: {},
      overcrowding: 0,
      health: 1,
      expansionUpkeep: 0,
      grossIncome: 1,
    }),
  });

  const first = settleDay(state);
  expect(first.summary).toMatchObject({
    dailyCarbonTarget: 10,
    climateQuest: { status: 'active', consecutiveDays: 1 },
  });
  while (state.elapsedGameDays < event.endAt) settleDay(state);
  expect(state.questStatus).toBe('ready_to_claim');
  expect(state.climateCampaign.lastResult).toMatchObject({ passed: true, eventType: 'heatwave' });
});

test('a 24-day climate prediction matches an actual cloned run without mutating the source', () => {
  const source = climateState(7);
  source.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  acknowledgeClimateBriefing(source);
  const settleDay = createDaySettler({
    calculatePowerNetwork: () => ({
      nextBatteries: {},
      facilityPower: { 0: { demand: 2, delivered: 2, ratio: 1 } },
      routes: [], batteryOperations: {}, demand: 2, delivered: 2,
      lowCarbonPercent: 100, lowCarbonDelivered: 2, lowCarbonSurplus: 0, generationAvailable: 2,
    }),
    settleEconomy: ({ credits }) => ({
      nextCredits: credits + 1, netCredits: 1, dailyCarbon: 4, dailyWater: 2,
      labor: { capacity: 6, used: 0, workforce: 6, jobs: 0, employmentRate: 0, industryFill: 1 },
      facilityEconomy: {}, facilityEnvironment: {}, overcrowding: 0, health: 1,
      expansionUpkeep: 0, grossIncome: 1,
    }),
  });
  const before = source.serialize();
  const actual = cloneSimulationState(source);

  const prediction = forecastSimulation(source, 24, { settleDay });
  for (let day = 0; day < 24; day += 1) settleDay(actual);

  expect({
    credits: prediction.finalState.credits,
    elapsedGameDays: prediction.finalState.elapsedGameDays,
    activeEventId: prediction.finalState.events.activeId,
    campaign: prediction.finalState.climateCampaign,
  }).toEqual({
    credits: actual.credits,
    elapsedGameDays: actual.elapsedGameDays,
    activeEventId: actual.events.activeId,
    campaign: actual.climateCampaign,
  });
  expect(source.serialize()).toEqual(before);
});
