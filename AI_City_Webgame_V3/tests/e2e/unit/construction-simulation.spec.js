import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { createBuildProject, createUpgradeProject } from '../../../src/systems/ConstructionProjectSystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';

function realSettler() {
  return createDaySettler({ calculatePowerNetwork, settleEconomy });
}

test('a build completed at the tick boundary operates during that same settlement', () => {
  const state = new GameState();
  state.grid[0] = {
    type: 'thermal',
    level: 1,
    operationMode: 'normal',
    project: { ...createBuildProject({ type: 'thermal', paidCost: 5 }), elapsedDays: 11 },
  };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };

  const result = realSettler()(state);

  expect(result.construction.completed).toEqual([
    expect.objectContaining({ index: 0, kind: 'build', type: 'thermal' }),
  ]);
  expect(state.grid[0].project).toBeNull();
  expect(result.power.facilityPower[1].ratio).toBe(1);
  expect(result.power.generationAvailable).toBe(13);
  expect(result.economy.facilityEconomy[0].upkeep).toBe(0.5);
});

test('an upgrade completing on a tick settles at the new level instead of the construction ratio', () => {
  const state = new GameState();
  const thermal = { type: 'thermal', level: 1, operationMode: 'normal' };
  state.grid[0] = {
    ...thermal,
    project: { ...createUpgradeProject({ cell: thermal, paidCost: 5 }), elapsedDays: 7 },
  };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };

  const result = realSettler()(state);

  expect(state.grid[0]).toMatchObject({ level: 2, project: null });
  expect(result.power.generationAvailable).toBe(19.24);
});

test('settlement summary exposes available generation separately from demand-limited delivery', () => {
  const state = new GameState();
  state.grid[0] = { type: 'tidal', level: 2, operationMode: 'normal' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };

  const result = realSettler()(state);

  expect(result.summary).toMatchObject({
    generationAvailable: 14.8,
    generationAvailableByIndex: { 0: 14.8 },
    deliveredPower: 2,
    demand: 2,
  });
});

test('an event beginning on the new game day changes that day power demand', () => {
  const state = new GameState();
  state.progression.chapter = 3;
  state.events.schedule = [{ id: 'heat-1', type: 'heatwave', announceAt: 0, startAt: 1, endAt: 5 }];
  state.grid[0] = { type: 'thermal', level: 1, operationMode: 'normal' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };

  const result = realSettler()(state);

  expect(state.elapsedGameDays).toBe(1);
  expect(result.cityEvent.started).toMatchObject({ id: 'heat-1', type: 'heatwave' });
  expect(result.power.demand).toBe(2.5);
});

test('unavoidable pre-grid construction does not pollute the report outage total', () => {
  const state = new GameState();
  state.questIndex = 2;
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
  state.grid[1] = {
    type: 'thermal', level: 1, operationMode: 'normal',
    project: createBuildProject({ type: 'thermal', paidCost: 4 }),
  };
  const settle = realSettler();

  settle(state);
  expect(state.simulationTotals.essentialOutageDays).toBe(0);

  state.claimedQuestIds.add('power-on');
  settle(state);
  expect(state.simulationTotals.essentialOutageDays).toBe(1);
});
