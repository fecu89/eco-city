import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { eventBus, Events } from '../../../src/core/EventBus.js';
import { createBuildProject, createUpgradeProject } from '../../../src/systems/ConstructionProjectSystem.js';
import { forecastConstruction, forecastUpgrade } from '../../../src/systems/SimulationForecastSystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { advanceResearchOneDay, researchDemandByIndex } from '../../../src/systems/ResearchSystem.js';
import { applySimulationQuestProgress } from '../../../src/systems/QuestSystem.js';

function settler({ quests = false } = {}) {
  return createDaySettler({
    calculatePowerNetwork,
    settleEconomy,
    getResearchDemand: researchDemandByIndex,
    advanceResearch: advanceResearchOneDay,
    evaluateQuest: quests ? applySimulationQuestProgress : null,
  });
}

test('forecast uses the maximum remaining project time and records only completion days', () => {
  const state = new GameState();
  state.credits = 20;
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
  state.grid[1] = {
    type: 'thermal',
    level: 1,
    operationMode: 'normal',
    project: { ...createBuildProject({ type: 'thermal', paidCost: 5 }), elapsedDays: 5 },
  };

  const forecast = forecastConstruction(state, [
    { index: 2, type: 'factory', paidCost: 4 },
    { index: 3, type: 'green', paidCost: 2 },
  ], { settleDay: settler() });

  expect(forecast.horizonDays).toBe(8);
  expect(forecast.timeline.map(({ dayOffset }) => dayOffset)).toEqual([3, 7, 8]);
  expect(forecast.timeline[0].completed).toEqual([expect.objectContaining({ index: 3, type: 'green' })]);
  expect(forecast.timeline[2].completed).toEqual([expect.objectContaining({ index: 2, type: 'factory' })]);
});

test('prediction matches live settlement for economy, power, battery, and completion state', () => {
  const state = new GameState();
  const thermal = { type: 'thermal', level: 1, operationMode: 'normal' };
  state.credits = 20;
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
  state.grid[1] = {
    ...thermal,
    project: { ...createUpgradeProject({ cell: thermal, paidCost: 5 }), elapsedDays: 0 },
  };
  state.grid[2] = {
    type: 'battery', level: 1, operationMode: 'normal', batteryPolicy: 'auto',
    batteryStoredLowCarbon: 3, batteryStoredFossil: 1,
  };
  const live = new GameState();
  expect(live.hydrate(state.serialize())).toBe(true);
  const settleDay = settler();

  const prediction = forecastConstruction(state, [], { settleDay });
  let liveResult = null;
  for (let day = 0; day < prediction.horizonDays; day += 1) liveResult = settleDay(live);

  expect(prediction.finalState.credits).toBe(live.credits);
  expect(prediction.finalState.grid).toEqual(live.grid);
  expect(prediction.finalState.elapsedGameDays).toBe(live.elapsedGameDays);
  expect(prediction.finalSummary).toMatchObject({
    deliveredPower: liveResult.summary.deliveredPower,
    demand: liveResult.summary.demand,
    dailyCarbon: liveResult.summary.dailyCarbon,
    dailyWater: liveResult.summary.dailyWater,
    batteryStored: liveResult.summary.batteryStored,
  });
});

test('prediction can evaluate cloned quest transitions without mutating or emitting from the live game', () => {
  const state = new GameState();
  state.credits = 10;
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
  const before = state.serialize();
  let questReadyEvents = 0;
  const onReady = () => { questReadyEvents += 1; };
  eventBus.on(Events.QUEST_READY, onReady);

  const prediction = forecastConstruction(state, [
    { index: 1, type: 'residential', paidCost: 2 },
  ], { settleDay: settler({ quests: true }) });

  eventBus.off(Events.QUEST_READY, onReady);
  expect(prediction.finalState.questStatus).toBe('ready_to_claim');
  expect(questReadyEvents).toBe(0);
  expect(state.serialize()).toEqual(before);
});

test('upgrade forecast charges only the clone and predicts limited operation through target completion', () => {
  const state = new GameState();
  state.credits = 20;
  state.grid[0] = { type: 'thermal', level: 1, operationMode: 'normal' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
  const before = state.serialize();

  const prediction = forecastUpgrade(state, 0, { paidCost: 5, settleDay: settler() });

  expect(prediction.horizonDays).toBe(8);
  expect(prediction.finalState.credits).toBeLessThan(15);
  expect(prediction.daily[0].power.generationAvailable).toBeCloseTo(9.1);
  expect(prediction.finalState.grid[0]).toMatchObject({ level: 2, project: null });
  expect(state.serialize()).toEqual(before);
});
