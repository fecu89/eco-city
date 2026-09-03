import { test, expect } from '@playwright/test';
import { calculateLabor, settleEconomy } from '../../../src/systems/EconomySystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { calcMetrics, demolitionRefund } from '../../../src/systems/BoardSystem.js';
import { createHexCoordinates, neighborIndices } from '../../../src/systems/HexGridSystem.js';
import {
  BOARD,
  DIRECTION_RULES,
  ECONOMY_RULES,
  FACILITIES,
  FACILITY_DEMAND_BY_LEVEL,
  FACILITY_DIRECTIONS,
  FACILITY_ECONOMY,
  FACILITY_WATER_BY_LEVEL,
  LEVEL_MULTIPLIERS,
} from '../../../src/core/Constants.js';
import { GameState } from '../../../src/core/GameState.js';
import { calculateEnvironmentalOperations } from '../../../src/systems/FacilityOperationSystem.js';
import { buildCityModifierContext, effectiveFacilityStats, facilityModifierAt } from '../../../src/systems/CityModifierSystem.js';
import {
  createEnvironment,
  isCoastalCell,
  optimalRotationFor,
  tidalFactor,
} from '../../../src/systems/EnvironmentSystem.js';
import { weatherAt } from '../../../src/systems/WeatherSystem.js';

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
  // 주거지 Lv.3 물은 인구(15명)에 비례해 2.4다 — impact 배율(1.3)이 아니라 표를 따른다.
  expect(result.dailyWater).toBe(11.2);
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
  // (대기 바닥선이 50%라 화력 급전이 절반을 넘도록 주거지를 넉넉히 붙인다.)
  const dispatchedGrid = idleGrid.map((cell) => cell && { ...cell });
  [3, 4, 5, 6, 7].forEach((index) => { dispatchedGrid[index] = { type: 'residential', level: 1, priority: 'essential' }; });
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
  const floorRatio = ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO;
  const idleFloor = full * floorRatio;
  // 바닥선 바로 위의 비율 — 소수 첫째 자리로 반올림하면 값이 달라지는 지점을 고른다.
  const aboveFloor = Math.round((floorRatio + 0.06) * 100) / 100;

  // 급전 4%는 대기 배출 바닥선 아래라 바닥선만큼만 나온다 — 반올림 때문이 아니다.
  expect(carbonAt(0.04)).toBeCloseTo(idleFloor, 2);
  // 바닥선 위 비율은 반올림된 표시값이 아니라 원본 그대로여야 한다.
  expect(carbonAt(aboveFloor)).toBeCloseTo(full * aboveFloor, 2);
  expect(carbonAt(aboveFloor)).toBeLessThan(full * round1(aboveFloor));
  // 바닥선 바로 아래는 여전히 바닥선이다 — 경계는 바닥선에서만 갈린다.
  expect(carbonAt(floorRatio - 0.01)).toBeCloseTo(idleFloor, 2);
});

test('정산이 내보내는 발전 가동률은 표시값과 원본값을 함께 싣는다', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  grid[1] = { type: 'solar', level: 1, priority: 'normal' };
  [2, 3, 4, 5, 6, 7].forEach((index) => { grid[index] = { type: 'residential', level: 1, priority: 'essential' }; });

  const settled = settleDispatchedGrid(grid, coords);
  const economy = settled.facilityEconomy[0];
  // 이 배치의 실제 급전 비율은 대기 바닥선 위이고 반올림 경계를 넘는다.
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

// ─────────────────────────────────────────────────────────────────────────────
// 방향(회전)과 해안 조차가 실제 공급으로 이어지는지 — 도시 보정 문맥을 거쳐 확인한다.
// ─────────────────────────────────────────────────────────────────────────────

const ENVIRONMENT_SEED = 20400134;

function directionState(index, cell) {
  const state = new GameState();
  state.environment = createEnvironment(ENVIRONMENT_SEED);
  state.boardRadius = BOARD.EXPANDED_RADIUS;
  state.grid = Array(BOARD.EXPANDED_CELLS).fill(null);
  state.expansion.activeCellIndices = Array.from({ length: BOARD.EXPANDED_CELLS }, (_, i) => i);
  state.grid[index] = cell;
  const context = buildCityModifierContext(state, { coords: createHexCoordinates(BOARD.EXPANDED_RADIUS) });
  return effectiveFacilityStats(state.grid[index], facilityModifierAt(context, index)).supply;
}

test('풍력은 그 칸의 풍향을 향할 때 가장 많이, 반대편을 향할 때 가장 적게 공급한다', () => {
  // 지역 특성이 없는 안쪽 칸을 골라 풍황 우수지역(+20%) 보정과 섞이지 않게 한다.
  const index = 5;
  const state = new GameState();
  state.environment = createEnvironment(ENVIRONMENT_SEED);
  const best = optimalRotationFor(state, 'wind', index);
  const worst = (best + 4) % FACILITY_DIRECTIONS.length;
  // 풍력은 그날의 풍속 배율(날씨)도 곱한다. 0일의 풍속이 시동 풍속 위여야 방향 차이가 드러난다.
  const { windFactor } = weatherAt(state, 0);
  expect(windFactor).toBeGreaterThan(0);

  const aligned = directionState(index, { type: 'wind', level: 1, rotation: best });
  const opposed = directionState(index, { type: 'wind', level: 1, rotation: worst });

  expect(aligned).toBeCloseTo(FACILITIES.wind.supply * DIRECTION_RULES.WIND_FACTORS_BY_DEVIATION[0] * windFactor, 6);
  expect(opposed).toBeCloseTo(FACILITIES.wind.supply * DIRECTION_RULES.WIND_FACTORS_BY_DEVIATION[4] * windFactor, 6);
  expect(opposed).toBeLessThan(aligned);
});

test('북향 태양광은 남향의 최대 이탈 배율만큼만 공급한다', () => {
  const index = 5;
  const south = FACILITY_DIRECTIONS.findIndex(({ id }) => id === DIRECTION_RULES.SOLAR_OPTIMAL);
  const north = FACILITY_DIRECTIONS.findIndex(({ id }) => id === 'N');

  // 태양광은 그날의 날씨 배율도 곱한다. 0일은 언제나 맑음(100~120%)이다.
  const state = new GameState();
  state.environment = createEnvironment(ENVIRONMENT_SEED);
  const weather = weatherAt(state, 0);
  expect(weather.kind).toBe('clear');

  const facingSouth = directionState(index, { type: 'solar', level: 1, rotation: south });
  const facingNorth = directionState(index, { type: 'solar', level: 1, rotation: north });

  expect(facingSouth).toBeCloseTo(FACILITIES.solar.supply * weather.solarFactor, 6);
  expect(facingNorth).toBeCloseTo(facingSouth * DIRECTION_RULES.SOLAR_FACTORS_BY_DEVIATION[4], 6);
});

test('조력 공급은 그 해안 칸의 조수간만의 차를 그대로 따라간다', () => {
  const state = new GameState();
  state.environment = createEnvironment(ENVIRONMENT_SEED);
  const coastal = Array.from({ length: BOARD.EXPANDED_CELLS }, (_, index) => index).filter(isCoastalCell);
  const weakest = coastal.reduce((low, index) => (tidalFactor(state, index) < tidalFactor(state, low) ? index : low));
  const strongest = coastal.reduce((high, index) => (tidalFactor(state, index) > tidalFactor(state, high) ? index : high));

  coastal.forEach((index) => {
    expect(directionState(index, { type: 'tidal', level: 1 }), `cell ${index}`)
      .toBeCloseTo(FACILITIES.tidal.supply * tidalFactor(state, index), 6);
  });
  expect(directionState(weakest, { type: 'tidal', level: 1 }))
    .toBeLessThan(directionState(strongest, { type: 'tidal', level: 1 }));
});

// ─────────────────────────────────────────────────────────────────────────────
// 소비 시설의 레벨별 전력 수요 — 강화는 인구·생산과 함께 전력도 실제로 더 요구한다.
// ─────────────────────────────────────────────────────────────────────────────

const levelled = (type, level) => ({ type, level, priority: 'normal' });

test('소비 시설의 레벨별 전력 수요는 배율이 아니라 종류별 표를 따른다', () => {
  Object.entries(FACILITY_DEMAND_BY_LEVEL).forEach(([type, table]) => {
    // Lv.1은 언제나 시설 기본값과 같아야 한다 — 건설 카드가 Lv.1 기준으로 수요를 보여 준다.
    expect(table[1], type).toBe(FACILITIES[type].demand);
    for (let level = 1; level <= 3; level += 1) {
      expect(effectiveFacilityStats(levelled(type, level)).demand, `${type} Lv.${level}`)
        .toBeCloseTo(table[level], 10);
    }
  });

  expect(effectiveFacilityStats(levelled('residential', 2)).demand).toBe(4);
  expect(effectiveFacilityStats(levelled('residential', 3)).demand).toBe(6);
  expect(effectiveFacilityStats(levelled('factory', 3)).demand).toBe(8);
  expect(effectiveFacilityStats(levelled('data', 2)).demand).toBe(12);
  expect(effectiveFacilityStats(levelled('cooling', 3)).demand).toBe(3);
  expect(effectiveFacilityStats(levelled('battery', 2)).demand).toBe(1.5);
});

test('발전 시설과 녹지는 레벨이 올라도 전력 수요가 0이다', () => {
  ['thermal', 'nuclear', 'solar', 'wind', 'tidal', 'green'].forEach((type) => {
    expect(FACILITY_DEMAND_BY_LEVEL[type], type).toBeUndefined();
    expect(effectiveFacilityStats(levelled(type, 3)).demand, type).toBe(0);
  });
});

test('주거지 물 사용은 인구에 비례하고 표가 없는 시설은 일반 배율을 그대로 쓴다', () => {
  expect(FACILITY_WATER_BY_LEVEL.residential[1]).toBe(FACILITIES.residential.water);
  expect(effectiveFacilityStats(levelled('residential', 1)).water).toBe(1);
  expect(effectiveFacilityStats(levelled('residential', 2)).water).toBeCloseTo(1.6, 10);
  expect(effectiveFacilityStats(levelled('residential', 3)).water).toBeCloseTo(2.4, 10);
  expect(effectiveFacilityStats(levelled('data', 2)).water)
    .toBeCloseTo(FACILITIES.data.water * LEVEL_MULTIPLIERS.impact[2], 10);
  expect(effectiveFacilityStats(levelled('green', 3)).carbon)
    .toBeCloseTo(FACILITIES.green.carbon * LEVEL_MULTIPLIERS.negative[3], 10);
});

test('수요 표는 출력·수입·유지비의 일반 레벨 배율을 건드리지 않는다', () => {
  expect(effectiveFacilityStats(levelled('data', 2)).income)
    .toBeCloseTo(FACILITY_ECONOMY.data.income * LEVEL_MULTIPLIERS.output[2], 10);
  expect(effectiveFacilityStats(levelled('residential', 3)).income)
    .toBeCloseTo(FACILITY_ECONOMY.residential.income * LEVEL_MULTIPLIERS.output[3], 10);
  expect(effectiveFacilityStats(levelled('factory', 3)).dev)
    .toBeCloseTo(FACILITIES.factory.dev * LEVEL_MULTIPLIERS.output[3], 10);
  expect(effectiveFacilityStats(levelled('cooling', 3)).upkeep)
    .toBeCloseTo(FACILITY_ECONOMY.cooling.upkeep * ECONOMY_RULES.UPKEEP_LEVEL_MULTIPLIERS[3], 10);
});
