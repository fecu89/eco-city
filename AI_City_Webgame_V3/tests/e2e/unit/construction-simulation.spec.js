import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { createBuildProject, createUpgradeProject } from '../../../src/systems/ConstructionProjectSystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createEnvironment, demandVariationFactor } from '../../../src/systems/EnvironmentSystem.js';

function realSettler() {
  return createDaySettler({ calculatePowerNetwork, settleEconomy });
}

// 도시 수요는 날마다 조금씩 흔들린다(DEMAND_VARIATION). 판의 씨앗에서 결정론적으로 나오므로
// 정확한 수요를 기대하는 테스트는 씨앗을 고정하고 그날의 계수를 함께 곱한다.
const round2 = (value) => Math.round(value * 100) / 100;

function seededState() {
  const state = new GameState();
  state.environment = createEnvironment(20400134);
  return state;
}

test('a build completed at the tick boundary operates during that same settlement', () => {
  const state = new GameState();
  state.grid[0] = {
    type: 'thermal',
    level: 1,
    project: { ...createBuildProject({ type: 'thermal', paidCost: 5 }), elapsedDays: 11 },
  };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };

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
  const thermal = { type: 'thermal', level: 1 };
  state.grid[0] = {
    ...thermal,
    project: { ...createUpgradeProject({ cell: thermal, paidCost: 5 }), elapsedDays: 7 },
  };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };

  const result = realSettler()(state);

  expect(state.grid[0]).toMatchObject({ level: 2, project: null });
  expect(result.power.generationAvailable).toBe(19.24);
});

test('settlement summary exposes available generation separately from demand-limited delivery', () => {
  const state = seededState();
  state.grid[0] = { type: 'tidal', level: 2 };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };

  const result = realSettler()(state);
  const demand = round2(2 * demandVariationFactor(state, 1));

  expect(result.summary).toMatchObject({
    generationAvailable: 14.8,
    generationAvailableByIndex: { 0: 14.8 },
    deliveredPower: demand,
    demand,
  });
  // 발전 가능량은 수요 변동과 무관하다 — 조력 Lv.2는 언제나 14.8E를 낼 수 있다.
  expect(result.summary.generationAvailable).toBeGreaterThan(result.summary.demand);
});

test('an event beginning on the new game day changes that day power demand', () => {
  const state = seededState();
  state.progression.chapter = 3;
  state.events.schedule = [{ id: 'heat-1', type: 'heatwave', announceAt: 0, startAt: 1, endAt: 5 }];
  state.grid[0] = { type: 'thermal', level: 1 };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };

  const result = realSettler()(state);

  expect(state.elapsedGameDays).toBe(1);
  expect(result.cityEvent.started).toMatchObject({ id: 'heat-1', type: 'heatwave' });
  // 폭염은 주거 수요를 1.25배로 올린다. 그 위에 그날의 도시 수요 변동이 곱해진다.
  expect(result.power.demand).toBe(round2(2 * (1.25 * demandVariationFactor(state, 1))));
  expect(result.power.demand).toBeGreaterThan(2);
});

test('unavoidable pre-grid construction does not pollute the report outage total', () => {
  const state = new GameState();
  state.questIndex = 2;
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  state.grid[1] = {
    type: 'thermal', level: 1,
    project: createBuildProject({ type: 'thermal', paidCost: 4 }),
  };
  const settle = realSettler();

  settle(state);
  expect(state.simulationTotals.essentialOutageDays).toBe(0);

  state.claimedQuestIds.add('power-on');
  settle(state);
  expect(state.simulationTotals.essentialOutageDays).toBe(1);
});
