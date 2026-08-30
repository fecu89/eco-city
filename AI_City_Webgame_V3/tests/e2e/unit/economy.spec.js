import { test, expect } from '@playwright/test';
import { calculateLabor, settleEconomy } from '../../../src/systems/EconomySystem.js';
import { demolitionRefund } from '../../../src/systems/BoardSystem.js';

const cells = (types) => types.map((type) => ({ type, level: 1, priority: 'normal' }));
const fullyPowered = (grid) => Object.fromEntries(grid.map((_, index) => [index, { demand: 1, delivered: 1, ratio: 1 }]));

test('residential tax falls to its 25 percent floor without jobs', () => {
  const grid = cells(['residential', 'residential']);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), hiddenCostsUnlocked: true, credits: 10 });

  expect(result.labor).toEqual({ workforce: 8, jobs: 0, industryFill: 0, employmentRate: 0 });
  expect(result.grossIncome).toBe(0.25);
});

test('industry income falls proportionally when workers are scarce', () => {
  const grid = cells(['residential', 'factory', 'data']);
  const labor = calculateLabor(grid);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), hiddenCostsUnlocked: true, credits: 10 });

  expect(labor.industryFill).toBe(0.4);
  expect(result.facilityEconomy[1].income).toBe(0.4);
  expect(result.facilityEconomy[2].income).toBe(0.8);
});

test('six factories add 1.2 credits per hour in overcrowding cost', () => {
  const grid = cells(['factory', 'factory', 'factory', 'factory', 'factory', 'factory']);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), hiddenCostsUnlocked: true, credits: 10 });

  expect(result.overcrowding).toBe(1.2);
});

test('polluting adjacency halves residential tax once and charges each unique pair', () => {
  const grid = Array(9).fill(null);
  grid[4] = { type: 'residential', level: 1, priority: 'essential' };
  grid[1] = { type: 'factory', level: 1, priority: 'normal' };
  grid[3] = { type: 'thermal', level: 1, priority: 'normal' };
  const result = settleEconomy({ grid, size: 3, facilityPower: fullyPowered(grid), hiddenCostsUnlocked: true, credits: 10 });

  expect(result.health).toBe(0.8);
  expect(result.facilityEconomy[4].pollutionMultiplier).toBe(0.5);
});

test('demolition returns floor half of every invested credit', () => {
  expect(demolitionRefund({ type: 'residential', level: 1 })).toBe(1);
  expect(demolitionRefund({ type: 'thermal', level: 1 })).toBe(2);
  expect(demolitionRefund({ type: 'thermal', level: 2 })).toBe(5);
});
