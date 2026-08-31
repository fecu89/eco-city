import { test, expect } from '@playwright/test';
import { calculateLabor, settleEconomy } from '../../../src/systems/EconomySystem.js';
import { calcMetrics, demolitionRefund } from '../../../src/systems/BoardSystem.js';
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

test('level three production increases live income and environmental load', () => {
  const grid = [
    { type: 'residential', level: 3, priority: 'essential' },
    { type: 'factory', level: 3, priority: 'normal' },
    { type: 'data', level: 3, priority: 'normal' },
  ];
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 10 });

  expect(result.facilityEconomy[1].income).toBe(1.92);
  expect(result.facilityEconomy[2].income).toBe(3.84);
  expect(result.hourlyCarbon).toBe(2.6);
  expect(result.hourlyWater).toBe(9.1);
});

test('cooling reduces water only for adjacent data centers and nuclear plants', () => {
  const coords = createHexCoordinates(2);
  const adjacent = neighborIndices(0, coords)[0];
  const linkedGrid = Array(19).fill(null);
  linkedGrid[0] = { type: 'data', level: 1, priority: 'normal' };
  linkedGrid[adjacent] = { type: 'cooling', level: 1, priority: 'essential' };
  const separatedGrid = linkedGrid.map((cell) => cell && { ...cell });
  separatedGrid[adjacent] = null;
  separatedGrid[18] = { type: 'cooling', level: 1, priority: 'essential' };

  const linked = settleEconomy({ grid: linkedGrid, coords, facilityPower: fullyPowered(linkedGrid), credits: 10 });
  const separated = settleEconomy({ grid: separatedGrid, coords, facilityPower: fullyPowered(separatedGrid), credits: 10 });

  expect(linked.hourlyWater).toBe(1);
  expect(separated.hourlyWater).toBe(5);

  const nuclearGrid = Array(19).fill(null);
  nuclearGrid[0] = { type: 'nuclear', level: 1, priority: 'normal' };
  nuclearGrid[adjacent] = { type: 'cooling', level: 1, priority: 'essential' };
  expect(settleEconomy({ grid: nuclearGrid, coords, facilityPower: fullyPowered(nuclearGrid), credits: 10 }).hourlyWater).toBe(3);
});

test('green space reduces live hourly carbon without making the city negative', () => {
  const poweredFactory = [
    { type: 'residential', level: 1, priority: 'essential' },
    { type: 'factory', level: 1, priority: 'normal' },
    { type: 'green', level: 1, priority: 'normal' },
  ];
  const greenOnly = [{ type: 'green', level: 1, priority: 'normal' }];

  expect(settleEconomy({ grid: poweredFactory, facilityPower: fullyPowered(poweredFactory), credits: 10 }).hourlyCarbon).toBe(1);
  expect(settleEconomy({ grid: greenOnly, facilityPower: fullyPowered(greenOnly), credits: 10 }).hourlyCarbon).toBe(0);
});

test('a minimal transition grid pays no climate recovery cost at 10 CO2', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  grid[1] = { type: 'factory', level: 1, priority: 'normal' };
  grid[3] = { type: 'residential', level: 1, priority: 'normal' };
  grid[4] = { type: 'residential', level: 1, priority: 'normal' };
  const atSafeLine = settleEconomy({
    grid,
    coords,
    facilityPower: { 1: { ratio: 1 }, 3: { ratio: 1 }, 4: { ratio: 1 } },
    credits: 10,
  });
  grid[2] = { type: 'nuclear', level: 1, priority: 'normal' };
  const aboveSafeLine = settleEconomy({
    grid,
    coords,
    facilityPower: { 1: { ratio: 1 }, 3: { ratio: 1 }, 4: { ratio: 1 } },
    credits: 10,
  });

  expect(atSafeLine.hourlyCarbon).toBe(10);
  expect(atSafeLine.climateRecovery).toBe(0);
  expect(aboveSafeLine.hourlyCarbon).toBe(11);
  expect(aboveSafeLine.climateRecovery).toBeGreaterThan(0);
});

test('static preview and fully powered live operation share carbon and water rules', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = { type: 'data', level: 1, priority: 'normal' };
  grid[3] = { type: 'cooling', level: 1, priority: 'essential' };
  grid[4] = { type: 'nuclear', level: 1, priority: 'normal' };
  grid[5] = { type: 'factory', level: 1, priority: 'normal' };
  grid[14] = { type: 'thermal', level: 1, priority: 'normal' };
  grid[1] = { type: 'green', level: 1, priority: 'normal' };
  grid[2] = { type: 'residential', level: 3, priority: 'essential' };

  const preview = calcMetrics(grid, coords);
  const live = settleEconomy({ grid, coords, facilityPower: fullyPowered(grid), credits: 10 });

  expect({ carbon: preview.carbon, water: preview.water }).toEqual({
    carbon: live.hourlyCarbon,
    water: live.hourlyWater,
  });
});
