import { test, expect } from '@playwright/test';
import { calculateLabor, settleEconomy } from '../../../src/systems/EconomySystem.js';
import { demolitionRefund } from '../../../src/systems/BoardSystem.js';
import { createHexCoordinates, neighborIndices } from '../../../src/systems/HexGridSystem.js';

const cells = (types) => types.map((type) => ({ type, level: 1, priority: 'normal' }));
const fullyPowered = (grid) => Object.fromEntries(grid.map((_, index) => [index, { demand: 1, delivered: 1, ratio: 1 }]));

test('residential tax falls to its 25 percent floor without jobs', () => {
  const grid = cells(['residential', 'residential']);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 10 });

  expect(result.labor).toEqual({
    capacity: 20,
    used: 0,
    available: 20,
    shortage: 0,
    utilization: 0,
    workforce: 20,
    jobs: 0,
    industryFill: 0,
    employmentRate: 0,
  });
  expect(result.grossIncome).toBe(0.25);
});

test('a staffed level-one factory and data center use seven of ten residents', () => {
  const grid = cells(['residential', 'factory', 'data']);
  const labor = calculateLabor(grid);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 10 });

  expect(labor).toMatchObject({ capacity: 10, used: 7, available: 3, shortage: 0, industryFill: 1 });
  expect(result.facilityEconomy[1].income).toBe(1);
  expect(result.facilityEconomy[2].income).toBe(2);
});

test('six factories add 1.2 credits per hour in overcrowding cost', () => {
  const grid = cells(['factory', 'factory', 'factory', 'factory', 'factory', 'factory']);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 10 });

  expect(result.overcrowding).toBe(1.2);
});

test('hourly credit settlement preserves cent precision', () => {
  const grid = cells(['residential', 'factory', 'data']);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 1.005 });

  expect(result.nextCredits).toBe(4.39);
  expect(Number(result.nextCredits.toFixed(2))).toBe(result.nextCredits);
});

test('polluting adjacency halves residential tax once and charges each unique pair', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  const [first, second] = neighborIndices(0, coords);
  grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  grid[first] = { type: 'factory', level: 1, priority: 'normal' };
  grid[second] = { type: 'thermal', level: 1, priority: 'normal' };
  const result = settleEconomy({ grid, coords, facilityPower: fullyPowered(grid), credits: 10 });

  expect(result.health).toBe(0.8);
  expect(result.facilityEconomy[0].pollutionMultiplier).toBe(0.5);
});

test('demolition returns floor half of every invested credit', () => {
  expect(demolitionRefund({ type: 'residential', level: 1 })).toBe(1);
  expect(demolitionRefund({ type: 'thermal', level: 1 })).toBe(2);
  expect(demolitionRefund({ type: 'thermal', level: 2 })).toBe(5);
});
