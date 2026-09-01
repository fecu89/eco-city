import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { createHexCoordinates, hexDistance } from '../../../src/systems/HexGridSystem.js';
import {
  applyAutomaticOperationModes,
  buildCityModifierContext,
  setBatteryPolicy,
  setFacilityOperationMode,
} from '../../../src/systems/CityModifierSystem.js';
import { batteryDischargeAvailable, calculatePowerNetwork, directEfficiency } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { calculateEnvironmentalOperations } from '../../../src/systems/FacilityOperationSystem.js';

test('demand-response research unlocks residential modes and deterministic level-three automation', () => {
  const state = new GameState();
  state.research.completedIds.add('demandResponse');
  state.grid[0] = { type: 'residential', level: 2, operationMode: 'normal' };
  state.grid[1] = { type: 'factory', level: 3, operationMode: 'auto' };

  expect(setFacilityOperationMode(state, 0, 'request')).toMatchObject({ ok: true });
  expect(setFacilityOperationMode(state, 0, 'forced')).toMatchObject({ ok: true });
  expect(setFacilityOperationMode(state, 0, 'auto')).toMatchObject({ ok: false, reason: 'mode_locked' });

  state.lastTickSummary = { deliveredPower: 10, demand: 9.5 };
  expect(applyAutomaticOperationModes(state)).toEqual(expect.arrayContaining([
    expect.objectContaining({ index: 1, resolvedMode: 'eco' }),
  ]));
  state.lastTickSummary = { deliveredPower: 20, demand: 14 };
  expect(applyAutomaticOperationModes(state)).toEqual(expect.arrayContaining([
    expect.objectContaining({ index: 1, resolvedMode: 'boost' }),
  ]));
  expect(state.decisionCounts.automaticModeChanges).toBe(2);
});

test('smart grid and generation research change actual route efficiency and supply', () => {
  const state = new GameState();
  state.research.completedIds = new Set(['solar2', 'smartGrid']);
  state.grid = Array(19).fill(null);
  state.grid[0] = { type: 'solar', level: 1 };
  state.grid[7] = { type: 'residential', level: 1 };
  const context = buildCityModifierContext(state, { coords: createHexCoordinates(2) });
  const result = calculatePowerNetwork({
    grid: state.grid,
    coords: createHexCoordinates(2),
    hour: 12,
    modifierContext: context,
  });
  expect(directEfficiency(2, 0.04)).toBe(0.96);
  expect(result.routes[0].efficiency).toBe(0.96);
  expect(context.byFacility[0].research.supply).toBe(1.2);
});

test('battery policies reserve stored power and level three releases reserve only to essential facilities', () => {
  const state = new GameState();
  state.research.completedIds = new Set(['battery2', 'battery3']);
  state.grid = Array(19).fill(null);
  state.grid[0] = { type: 'battery', level: 3, batteryStoredLowCarbon: 5, batteryStoredFossil: 0 };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
  state.grid[2] = { type: 'factory', level: 1, priority: 'normal' };
  expect(setBatteryPolicy(state, 0, 'reserve50')).toMatchObject({ ok: true });
  expect(setBatteryPolicy(state, 0, 'essential')).toMatchObject({ ok: true });
  const battery = { lowCarbon: 5, fossil: 0, capacity: 26, policy: 'essential' };
  expect(batteryDischargeAvailable(battery, 'essential')).toBe(5);
  expect(batteryDischargeAvailable(battery, 'normal')).toBe(0);
});

test('level-three cooling reaches distance two while green placement changes income, health, and heat demand', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = { type: 'data', level: 1 };
  grid[7] = { type: 'cooling', level: 3 };
  const operations = { 0: { powerRatio: 1, operationRatio: 1 }, 7: { powerRatio: 1, operationRatio: 1 } };
  const cooled = calculateEnvironmentalOperations({ grid, coords, facilityOperations: operations });
  expect(cooled.byFacility[0].water).toBe(2.5);

  const city = new GameState();
  city.grid = Array(19).fill(null);
  city.grid[0] = { type: 'residential', level: 1 };
  city.grid[1] = { type: 'green', level: 1 };
  city.grid[2] = { type: 'factory', level: 1 };
  city.grid[3] = { type: 'green', level: 1 };
  city.grid[4] = { type: 'green', level: 1 };
  const context = buildCityModifierContext(city, { coords });
  const economy = settleEconomy({
    grid: city.grid,
    coords,
    facilityPower: { 0: { ratio: 1 }, 2: { ratio: 1 } },
    credits: 0,
    modifierContext: context,
  });
  expect(context.byFacility[0].research.income).toBe(1.05);
  expect(context.city.greenFactoryHealthMultiplierByIndex[2]).toBe(0.75);
  expect(economy.health).toBeLessThan(0.4);
});

test('a connected three-green cluster reduces the heatwave residential spike to twenty percent', () => {
  const state = new GameState();
  state.grid = Array(19).fill(null);
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[1] = { type: 'green', level: 1 };
  state.grid[2] = { type: 'green', level: 1 };
  state.grid[7] = { type: 'green', level: 1 };
  state.events.schedule = [{ id: 'heat', type: 'heatwave', startAt: 0, endAt: 8 }];
  state.events.activeId = 'heat';
  const context = buildCityModifierContext(state, { coords: createHexCoordinates(2) });
  expect(context.city.greenCluster).toBe(true);
  expect(context.byFacility[0].event.demand).toBeCloseTo(1.2);
});

for (const [level, income, demand, carbon] of [
  [1, 1.05, 1.2, -1],
  [2, 1.07, 1.15, -1.35],
  [3, 1.09, 1.15, -1.65],
]) {
  test(`green level ${level} applies its exact adjacent housing and carbon effects`, () => {
    const state = new GameState();
    state.grid = Array(19).fill(null);
    state.grid[0] = { type: 'residential', level: 1 };
    state.grid[1] = { type: 'green', level };
    state.events.schedule = [{ id: 'heat', type: 'heatwave', startAt: 0, endAt: 8 }];
    state.events.activeId = 'heat';
    const context = buildCityModifierContext(state, { coords: createHexCoordinates(2) });
    const environment = calculateEnvironmentalOperations({
      grid: state.grid,
      coords: createHexCoordinates(2),
      facilityOperations: { 0: { powerRatio: 1, operationRatio: 1 } },
      modifierContext: context,
    });
    expect(context.byFacility[0].research.income).toBe(income);
    expect(context.byFacility[0].event.demand).toBeCloseTo(demand, 8);
    expect(environment.byFacility[1].carbon).toBe(carbon);
  });
}

test('level-three green extends a weaker housing benefit to hex distance two', () => {
  const state = new GameState();
  const coords = createHexCoordinates(2);
  const distanceTwo = coords.findIndex((coord) => hexDistance(coords[0], coord) === 2);
  state.grid = Array(19).fill(null);
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[distanceTwo] = { type: 'green', level: 3 };
  state.events.schedule = [{ id: 'heat', type: 'heatwave', startAt: 0, endAt: 8 }];
  state.events.activeId = 'heat';
  const context = buildCityModifierContext(state, { coords });
  expect(context.byFacility[0].research.income).toBe(1.045);
  expect(context.byFacility[0].event.demand).toBeCloseTo(1.2, 8);
});

test('level-three data centers gain research speed only with three units of low-carbon surplus', () => {
  const state = new GameState();
  state.grid[0] = { type: 'data', level: 3, operationMode: 'normal' };
  state.lastTickSummary = { lowCarbonSurplus: 2.9 };
  expect(buildCityModifierContext(state).byFacility[0].research.researchSpeed).toBe(1);
  state.lastTickSummary = { lowCarbonSurplus: 3 };
  expect(buildCityModifierContext(state).byFacility[0].research.researchSpeed).toBe(1.25);
});
