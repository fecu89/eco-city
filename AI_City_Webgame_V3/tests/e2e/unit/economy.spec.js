import { test, expect } from '@playwright/test';
import { calculateLabor, settleEconomy } from '../../../src/systems/EconomySystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { calcMetrics, demolitionRefund } from '../../../src/systems/BoardSystem.js';
import { createHexCoordinates, neighborIndices } from '../../../src/systems/HexGridSystem.js';
import { ECONOMY_RULES, FACILITIES } from '../../../src/core/Constants.js';
import { calculateEnvironmentalOperations } from '../../../src/systems/FacilityOperationSystem.js';

const cells = (types) => types.map((type) => ({ type, level: 1, priority: 'normal' }));
const fullyPowered = (grid) => Object.fromEntries(grid.map((_, index) => [index, { demand: 1, delivered: 1, ratio: 1 }]));

// 실제 급전 결과를 그대로 정산에 넘긴다. 발전 시설 가동률은 송전된 전력에서만 나온다.
function settleDispatchedGrid(grid, coords) {
  const power = calculatePowerNetwork({ grid, coords, dayIndex: 1, tickIndex: 1 });
  return settleEconomy({
    grid,
    coords,
    facilityPower: power.facilityPower,
    generationAvailableByIndex: power.generationAvailableByIndex,
    generationDispatchedByIndex: power.generationDispatchedByIndex,
    credits: 10,
  });
}

test('residential tax falls to its 25 percent floor without jobs', () => {
  const grid = cells(['residential', 'residential']);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 10 });

  expect(result.labor).toEqual({
    capacity: 12,
    used: 0,
    available: 12,
    shortage: 0,
    utilization: 0,
    workforce: 12,
    jobs: 0,
    industryFill: 0,
    employmentRate: 0,
  });
  expect(result.grossIncome).toBe(0.25);
});

test('an unpowered residential facility still earns its base tax instead of zero', () => {
  const grid = cells(['residential']);
  const result = settleEconomy({ grid, facilityPower: {}, credits: 10 });

  expect(result.facilityEconomy[0]).toMatchObject({
    income: 0.13,
    powerRatio: 0,
  });
  expect(result.netCredits).toBe(0.13);
  expect(result.nextCredits).toBe(10.13);
});

test('one level-one home cannot fully staff both a factory and data center', () => {
  const grid = cells(['residential', 'factory', 'data']);
  const labor = calculateLabor(grid);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 10 });

  expect(labor).toMatchObject({ capacity: 6, used: 8, available: 0, shortage: 2, industryFill: 0.8 });
  expect(result.facilityEconomy[1].income).toBe(0.8);
  expect(result.facilityEconomy[2].income).toBe(1.6);
});

test('six factories add 1.2 credits per day in overcrowding cost', () => {
  const grid = cells(['factory', 'factory', 'factory', 'factory', 'factory', 'factory']);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 10 });

  expect(result.overcrowding).toBe(1.2);
});

test('daily credit settlement preserves cent precision', () => {
  const grid = cells(['residential', 'factory', 'data']);
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 1.005 });

  expect(result.nextCredits).toBe(3.91);
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
    { type: 'residential', level: 1, priority: 'essential' },
    { type: 'factory', level: 3, priority: 'normal' },
    { type: 'data', level: 3, priority: 'normal' },
  ];
  const result = settleEconomy({ grid, facilityPower: fullyPowered(grid), credits: 10 });

  expect(result.facilityEconomy[2].income).toBe(1.92);
  expect(result.facilityEconomy[3].income).toBe(3.84);
  expect(result.dailyCarbon).toBe(2.6);
  expect(result.dailyWater).toBe(10.1);
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

  expect(linked.dailyWater).toBe(1);
  expect(separated.dailyWater).toBe(5);

  const nuclearGrid = Array(19).fill(null);
  nuclearGrid[0] = { type: 'nuclear', level: 1, priority: 'normal' };
  nuclearGrid[adjacent] = { type: 'cooling', level: 1, priority: 'essential' };
  expect(settleEconomy({ grid: nuclearGrid, coords, facilityPower: fullyPowered(nuclearGrid), credits: 10 }).dailyWater).toBe(3);
});

for (const [ratio, expectedDataWater] of [[1, 1], [0.5, 0.5], [0.2, 0.2], [0, 0]]) {
  test(`cooled data center at ${ratio * 100}% power cannot cancel another facility's water`, () => {
    const coords = createHexCoordinates(2);
    const grid = Array(19).fill(null);
    grid[0] = { type: 'data', level: 1, priority: 'normal' };
    grid[1] = { type: 'cooling', level: 1, priority: 'essential' };
    grid[2] = { type: 'residential', level: 1, priority: 'essential' };
    const facilityPower = {
      0: { demand: 8, delivered: 8 * ratio, ratio },
      1: { demand: 4, delivered: 4 * ratio, ratio },
      2: { demand: 2, delivered: 2, ratio: 1 },
    };

    const result = settleEconomy({ grid, coords, facilityPower, credits: 10 });

    expect(result.facilityEnvironment[0].water).toBe(expectedDataWater);
    expect(result.facilityEnvironment[0].water).toBeGreaterThanOrEqual(0);
    expect(result.dailyWater).toBe(1 + expectedDataWater);
  });
}

test('green space reduces live daily carbon without making the city negative', () => {
  const poweredFactory = [
    { type: 'residential', level: 1, priority: 'essential' },
    { type: 'factory', level: 1, priority: 'normal' },
    { type: 'green', level: 1, priority: 'normal' },
  ];
  const greenOnly = [{ type: 'green', level: 1, priority: 'normal' }];

  expect(settleEconomy({ grid: poweredFactory, facilityPower: fullyPowered(poweredFactory), credits: 10 }).dailyCarbon).toBe(1);
  expect(settleEconomy({ grid: greenOnly, facilityPower: fullyPowered(greenOnly), credits: 10 }).dailyCarbon).toBe(0);
});

test('a minimal transition grid pays no climate recovery cost at 10 CO2', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  grid[1] = { type: 'factory', level: 1, priority: 'normal' };
  grid[3] = { type: 'residential', level: 1, priority: 'normal' };
  grid[4] = { type: 'residential', level: 1, priority: 'normal' };
  grid[5] = { type: 'residential', level: 1, priority: 'normal' };
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

  expect(atSafeLine.dailyCarbon).toBe(10);
  expect(atSafeLine.climateRecovery).toBe(0);
  expect(aboveSafeLine.dailyCarbon).toBe(11);
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
  grid[6] = { type: 'residential', level: 1, priority: 'essential' };

  const preview = calcMetrics(grid, coords);
  const live = settleEconomy({ grid, coords, facilityPower: fullyPowered(grid), credits: 10 });

  expect({ carbon: preview.carbon, water: preview.water }).toEqual({
    carbon: live.dailyCarbon,
    water: live.dailyWater,
  });
});

test('a thermal plant emits only the idle floor while low-carbon dispatch covers the city', () => {
  const coords = createHexCoordinates(2);
  const idleGrid = Array(19).fill(null);
  idleGrid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  idleGrid[1] = { type: 'solar', level: 1, priority: 'normal' };
  idleGrid[2] = { type: 'residential', level: 1, priority: 'essential' };

  const idle = settleDispatchedGrid(idleGrid, coords);
  const idleFloor = FACILITIES.thermal.carbon * ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO;

  expect(idle.facilityEconomy[0].operationRatio).toBe(0);
  expect(idle.facilityEnvironment[0].carbon).toBeCloseTo(idleFloor, 2);

  // 태양광 한 기로는 덮을 수 없는 수요를 붙이면 화력이 실제로 급전되고 탄소가 바닥선 위로 올라간다.
  const dispatchedGrid = idleGrid.map((cell) => cell && { ...cell });
  [3, 4, 5].forEach((index) => { dispatchedGrid[index] = { type: 'residential', level: 1, priority: 'essential' }; });
  const dispatched = settleDispatchedGrid(dispatchedGrid, coords);

  expect(dispatched.facilityEconomy[0].operationRatio).toBeGreaterThan(ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO);
  expect(dispatched.facilityEnvironment[0].carbon).toBeGreaterThan(idleFloor);
});

// 화면에 찍는 operationRatio는 소수 첫째 자리로 반올림된다. 그 값을 배출 계산에 그대로
// 쓰면 급전 26%가 30%로 튀고 4%가 0%로 떨어져 급전→탄소 곡선이 계단이 된다.
// EconomySystem은 반올림하지 않은 operationRatioRaw를 함께 실어야 한다.
test('발전소 탄소는 반올림된 표시값이 아니라 실제 급전 비율을 따른다', () => {
  const grid = [{ type: 'thermal', level: 1, priority: 'normal' }];
  const round1 = (value) => Math.round(value * 10) / 10;
  const carbonAt = (ratio) => calculateEnvironmentalOperations({
    grid,
    coords: createHexCoordinates(2),
    facilityOperations: { 0: { powerRatio: 1, operationRatio: round1(ratio), operationRatioRaw: ratio } },
  }).byFacility[0].carbon;
  const full = FACILITIES.thermal.carbon;
  const idleFloor = full * ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO;

  // 급전 4%는 대기 배출 바닥선(25%) 아래라 바닥선만큼만 나온다 — 반올림 때문이 아니다.
  expect(carbonAt(0.04)).toBeCloseTo(idleFloor, 2);
  // 급전 26%는 바닥선 위다. 반올림된 0.3이 아니라 0.26 그대로여야 한다.
  expect(carbonAt(0.26)).toBeCloseTo(full * 0.26, 2);
  expect(carbonAt(0.26)).toBeLessThan(full * 0.3);
  // 24%는 바닥선 아래이므로 여전히 바닥선이다 — 경계가 0.25에서만 갈린다.
  expect(carbonAt(0.24)).toBeCloseTo(idleFloor, 2);
});

test('정산이 내보내는 발전 가동률은 표시값과 원본값을 함께 싣는다', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  grid[1] = { type: 'solar', level: 1, priority: 'normal' };
  [2, 3, 4, 5].forEach((index) => { grid[index] = { type: 'residential', level: 1, priority: 'essential' }; });

  const settled = settleDispatchedGrid(grid, coords);
  const economy = settled.facilityEconomy[0];
  // 이 배치의 실제 급전 비율은 반올림 경계를 넘는다(0.37 → 표시값 0.4).
  expect(economy.operationRatioRaw).toBeGreaterThan(ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO);
  expect(economy.operationRatioRaw).not.toBe(economy.operationRatio);
  expect(economy.operationRatio).toBe(Math.round(economy.operationRatioRaw * 10) / 10);

  // 탄소는 표시값(0.4)이 아니라 원본 급전 비율을 따른다.
  expect(settled.facilityEnvironment[0].carbon).toBeCloseTo(FACILITIES.thermal.carbon * economy.operationRatioRaw, 2);
  expect(settled.facilityEnvironment[0].carbon).toBeLessThan(FACILITIES.thermal.carbon * economy.operationRatio);
});

test('nuclear cooling water scales with the energy the plant actually dispatches', () => {
  const coords = createHexCoordinates(2);
  const idleGrid = Array(19).fill(null);
  idleGrid[0] = { type: 'nuclear', level: 1, priority: 'normal' };
  idleGrid[1] = { type: 'thermal', level: 1, priority: 'normal' };
  idleGrid[2] = { type: 'residential', level: 1, priority: 'essential' };

  const idle = settleDispatchedGrid(idleGrid, coords);
  const fullWater = FACILITIES.nuclear.water;

  expect(idle.facilityEnvironment[0].water).toBeCloseTo(fullWater * ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO, 2);

  const loadedGrid = idleGrid.map((cell) => cell && { ...cell });
  [3, 4, 5, 6].forEach((index) => { loadedGrid[index] = { type: 'data', level: 1, priority: 'normal' }; });
  const loaded = settleDispatchedGrid(loadedGrid, coords);

  expect(loaded.facilityEnvironment[0].water).toBeGreaterThan(idle.facilityEnvironment[0].water);
});

test('a level two facility keeps its upkeep at cent precision', () => {
  const grid = [{ type: 'solar', level: 2, priority: 'normal' }];
  const result = settleEconomy({ grid, facilityPower: {}, credits: 10 });

  expect(result.facilityEconomy[0].upkeep).toBe(0.14);
  expect(result.maintenance).toBe(0.14);
});
