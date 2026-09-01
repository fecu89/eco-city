import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  availableOperationModes,
  operationModeDefinition,
} from '../../../src/core/OperationDefinitions.js';
import {
  buildCityModifierContext,
  effectiveFacilityStats,
  identityModifier,
  setFacilityPriority,
  setFacilityOperationMode,
} from '../../../src/systems/CityModifierSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { advanceResearchOneHour } from '../../../src/systems/ResearchSystem.js';

const factory = (level = 1, operationMode = 'normal') => ({
  type: 'factory', level, priority: 'normal', operationMode,
});

test('level mode event zone and research modifiers compose once', () => {
  const stats = effectiveFacilityStats(factory(2, 'boost'), {
    mode: operationModeDefinition('factory', 'boost').modifier,
    event: identityModifier(),
    zone: identityModifier(),
    research: identityModifier(),
  });

  expect(stats.demand).toBeCloseTo(4 * 1.24 * 1.4);
  expect(stats.income).toBeCloseTo(1 * 1.48 * 1.35);
  expect(stats.carbon).toBeCloseTo(2 * 1.16 * 1.2);
  expect(stats.workforce).toBe(7);
});

test('only normal mode is available at level one and all facility modes unlock at level two', () => {
  const state = new GameState();
  expect(availableOperationModes(factory(1), state).map(({ id }) => id)).toEqual(['normal']);
  expect(availableOperationModes(factory(2), state).map(({ id }) => id)).toEqual(['eco', 'normal', 'boost']);
  expect(availableOperationModes({ type: 'data', level: 2 }, state).map(({ id }) => id)).toEqual(['eco', 'normal', 'research']);
});

test('operation context applies factory mode equally to power and economy', () => {
  const state = new GameState();
  state.grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
  state.grid[2] = factory(2, 'eco');
  const modifierContext = buildCityModifierContext(state);
  const power = calculatePowerNetwork({ grid: state.grid, modifierContext, hour: 12 });
  const economy = settleEconomy({
    grid: state.grid,
    modifierContext,
    facilityPower: power.facilityPower,
    credits: 10,
  });

  expect(power.facilityPower[2].demand).toBeCloseTo(4 * 1.24 * 0.65);
  expect(economy.facilityEconomy[2].income).toBeCloseTo(1 * 1.48 * 0.7);
  expect(economy.facilityEnvironment[2].carbon).toBeCloseTo(2 * 1.16 * 0.85);
});

test('mode change rejects locked choices and returns a before-after operating forecast', () => {
  const state = new GameState();
  state.grid[2] = factory(1);
  expect(setFacilityOperationMode(state, 2, 'boost')).toMatchObject({ ok: false, reason: 'mode_locked' });

  state.grid[2].level = 2;
  const changed = setFacilityOperationMode(state, 2, 'boost');
  expect(changed).toMatchObject({ ok: true, before: 'normal', after: 'boost' });
  expect(changed.forecast.demand.after).toBeGreaterThan(changed.forecast.demand.before);
  expect(changed.forecast.income.after).toBeGreaterThan(changed.forecast.income.before);
  expect(changed.forecast.carbon.after).toBeGreaterThan(changed.forecast.carbon.before);
  expect(changed.forecast.workforce.after).toBe(changed.forecast.workforce.before + 1);
  expect(state.decisionCounts.modeChanges).toBe(1);
});

test('priority changes are validated and counted only when the player selects a different priority', () => {
  const state = new GameState();
  state.grid[2] = factory(2);
  expect(setFacilityPriority(state, 2, 'essential')).toMatchObject({ ok: true, before: 'normal', after: 'essential' });
  expect(setFacilityPriority(state, 2, 'essential')).toMatchObject({ ok: true, before: 'essential', after: 'essential' });
  expect(setFacilityPriority(state, 2, 'invalid')).toMatchObject({ ok: false, reason: 'invalid_priority' });
  expect(state.decisionCounts.priorityChanges).toBe(1);
});

test('data eco mode stops research while focused research mode advances forty percent faster', () => {
  const eco = new GameState();
  eco.grid[3] = { type: 'data', level: 2, priority: 'normal', operationMode: 'eco' };
  eco.research.jobs.solar2 = { id: 'solar2', dataCenterIndex: 3, elapsedEffectiveHours: 0, status: 'running', paidCost: 10 };
  const ecoContext = buildCityModifierContext(eco);
  const stopped = advanceResearchOneHour(eco, { 3: { ratio: 1 } }, ecoContext);
  expect(stopped.jobs.solar2).toMatchObject({ status: 'mode_paused', advancedHours: 0 });

  const focused = new GameState();
  focused.grid[3] = { type: 'data', level: 2, priority: 'normal', operationMode: 'research' };
  focused.research.jobs.solar2 = { id: 'solar2', dataCenterIndex: 3, elapsedEffectiveHours: 0, status: 'running', paidCost: 10 };
  const focusedContext = buildCityModifierContext(focused);
  const advanced = advanceResearchOneHour(focused, { 3: { ratio: 1 } }, focusedContext);
  expect(advanced.jobs.solar2.advancedHours).toBeCloseTo(1.25 * 1.4);
});
