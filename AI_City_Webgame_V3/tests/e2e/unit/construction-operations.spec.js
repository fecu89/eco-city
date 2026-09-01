import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { effectiveFacilityStats } from '../../../src/systems/CityModifierSystem.js';
import { calculateWorkforce } from '../../../src/systems/WorkforceSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { advanceResearchOneDay } from '../../../src/systems/ResearchSystem.js';
import { createBuildProject, createUpgradeProject } from '../../../src/systems/ConstructionProjectSystem.js';
import { calculateEnvironmentalOperations } from '../../../src/systems/FacilityOperationSystem.js';

function buildCell(type, paidCost = 1) {
  return {
    type,
    level: 1,
    operationMode: 'normal',
    project: createBuildProject({ type, paidCost }),
  };
}

function upgradeCell(type, operationMode = 'normal') {
  const cell = { type, level: 1, operationMode };
  cell.project = createUpgradeProject({ cell, paidCost: 4 });
  return cell;
}

test('new construction contributes no facility stats, upkeep, or workforce', () => {
  const stats = effectiveFacilityStats(buildCell('factory'));

  expect(stats).toMatchObject({
    dev: 0,
    supply: 0,
    demand: 0,
    income: 0,
    upkeep: 0,
    carbon: 0,
    water: 0,
    workforce: 0,
  });
});

test('general upgrades reduce variable operation but retain fixed upkeep and workforce', () => {
  const stats = effectiveFacilityStats(upgradeCell('thermal', 'boost'));

  expect(stats.supply).toBeCloseTo(9.1, 8);
  expect(stats.carbon).toBeCloseTo(5.6, 8);
  expect(stats.water).toBeCloseTo(1.4, 8);
  expect(stats.upkeep).toBe(0.5);
  expect(stats.workforce).toBe(3);
});

test('residential upgrades retain eighty percent population and operating values', () => {
  const home = upgradeCell('residential');
  const stats = effectiveFacilityStats(home);
  const labor = calculateWorkforce([home]);

  expect(stats.demand).toBeCloseTo(1.6, 8);
  expect(stats.income).toBeCloseTo(0.4, 8);
  expect(stats.water).toBeCloseTo(0.8, 8);
  expect(stats.workforce).toBeCloseTo(4.8, 8);
  expect(labor.capacity).toBeCloseTo(4.8, 8);
});

test('data-center upgrades use their dedicated demand, income, water, and research ratios', () => {
  const stats = effectiveFacilityStats(upgradeCell('data'));

  expect(stats.demand).toBeCloseTo(5.6, 8);
  expect(stats.income).toBeCloseTo(1.2, 8);
  expect(stats.water).toBeCloseTo(3.5, 8);
  expect(stats.researchSpeed).toBe(0.5);
  expect(stats.workforce).toBe(4);
});

test('build sites do not generate power or create economy count and health effects', () => {
  const grid = Array(19).fill(null);
  grid[0] = buildCell('thermal', 5);
  grid[1] = buildCell('factory', 4);
  grid[2] = buildCell('factory', 4);
  grid[3] = buildCell('factory', 4);
  grid[4] = buildCell('factory', 4);
  grid[5] = buildCell('residential', 2);

  const power = calculatePowerNetwork({ grid, hour: 12, tickIndex: 0 });
  const economy = settleEconomy({ grid, facilityPower: power.facilityPower, credits: 10 });

  expect(power.generationAvailable).toBe(0);
  expect(power.demand).toBe(0);
  expect(economy).toMatchObject({ maintenance: 0, overcrowding: 0, health: 0, dailyCarbon: 0, dailyWater: 0 });
});

test('an upgrading battery retains stored energy and capacity but halves throughput', () => {
  const grid = Array(19).fill(null);
  grid[0] = { type: 'thermal', level: 1, operationMode: 'normal' };
  grid[1] = {
    ...upgradeCell('battery'),
    batteryStoredLowCarbon: 2,
    batteryStoredFossil: 1,
    batteryPolicy: 'auto',
  };

  const power = calculatePowerNetwork({ grid, hour: 12, tickIndex: 0 });

  expect(power.batteryOperations[1].charged).toBe(4);
  expect(power.nextBatteries[1].lowCarbon + power.nextBatteries[1].fossil).toBe(7);
});

test('active research in an upgrading data center advances at half speed', () => {
  const state = new GameState();
  state.grid[0] = upgradeCell('data');
  state.research.jobs = {
    solar2: {
      id: 'solar2',
      dataCenterIndex: 0,
      elapsedEffectiveDays: 0,
      status: 'running',
      paidCost: 3,
    },
  };

  const result = advanceResearchOneDay(state, { 0: { demand: 5.6, delivered: 5.6, ratio: 1 } });

  expect(result.jobs.solar2).toMatchObject({ status: 'running', advancedDays: 0.5 });
  expect(state.research.jobs.solar2.elapsedEffectiveDays).toBe(0.5);
});

test('an upgrading cooling facility provides only its construction-stage cooling effect', () => {
  const grid = Array(19).fill(null);
  grid[0] = { type: 'data', level: 1, operationMode: 'normal' };
  grid[1] = upgradeCell('cooling');

  const environment = calculateEnvironmentalOperations({
    grid,
    facilityOperations: {
      0: { powerRatio: 1, operationRatio: 1 },
      1: { powerRatio: 1, operationRatio: 1 },
    },
  });

  expect(environment.byFacility[0].water).toBe(2.2);
});
