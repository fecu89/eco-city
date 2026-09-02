// 점수 가중치·강화 배수·철거 환급률을 Constants로 옮기는 리팩터가 값에 영향을 주지 않는지 고정한다.
// 아래 기대값은 리팩터 직전 코드에서 그대로 캡처한 것이다.
import { test, expect } from '@playwright/test';
import { calcMetrics, demolitionRefund, investedCost, upgradeCost } from '../../../src/systems/BoardSystem.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';

const coords = createHexCoordinates(2);

function gridOf(entries) {
  const grid = Array.from({ length: coords.length }, () => null);
  Object.entries(entries).forEach(([index, cell]) => {
    grid[Number(index)] = { level: 1, priority: 'normal', operationMode: 'normal', ...cell };
  });
  return grid;
}

test('혼합 5시설 도시의 점수는 리팩터 전과 같다', () => {
  const grid = gridOf({
    0: { type: 'residential', level: 2, priority: 'essential' },
    1: { type: 'green' },
    2: { type: 'thermal' },
    3: { type: 'factory', level: 2 },
    4: { type: 'data' },
  });

  expect(calcMetrics(grid, coords)).toEqual({
    dev: 48,
    demand: 15.4,
    supply: 13,
    reliableSupply: 13,
    balance: -2.4,
    carbon: 9.3,
    water: 9.3,
    heatCluster: 0,
    renewableSupply: 0,
    dataCount: 1,
    thermalCount: 1,
    synergyScore: 32,
    synergyLinks: 2,
    conflictPairs: 4,
    sustainability: 36,
    reliability: 61,
  });
});

test('소비지에 연결된 재생에너지는 5% 페널티만 받는다', () => {
  const grid = gridOf({
    0: { type: 'battery' },
    1: { type: 'residential', priority: 'essential' },
    2: { type: 'solar' },
    3: { type: 'wind' },
    10: { type: 'nuclear' },
    11: { type: 'cooling', priority: 'essential' },
  });

  expect(calcMetrics(grid, coords)).toEqual({
    dev: 17,
    demand: 4,
    supply: 34,
    reliableSupply: 33.3,
    balance: 29.3,
    carbon: 1,
    water: 4,
    heatCluster: 0,
    renewableSupply: 15,
    dataCount: 0,
    thermalCount: 0,
    synergyScore: 5,
    synergyLinks: 2,
    conflictPairs: 0,
    sustainability: 96,
    reliability: 100,
  });
});

test('저장 허브가 없는 재생에너지는 25% 페널티를 받고 데이터센터 군집은 안정성을 깎는다', () => {
  const grid = gridOf({
    0: { type: 'data' },
    1: { type: 'data' },
    2: { type: 'solar' },
    3: { type: 'wind' },
    4: { type: 'residential', priority: 'essential' },
  });

  expect(calcMetrics(grid, coords)).toEqual({
    dev: 29,
    demand: 18,
    supply: 15,
    reliableSupply: 11.3,
    balance: -6.7,
    carbon: 0,
    water: 11,
    heatCluster: 1,
    renewableSupply: 15,
    dataCount: 2,
    thermalCount: 0,
    synergyScore: 0,
    synergyLinks: 0,
    conflictPairs: 1,
    sustainability: 53,
    reliability: 43,
  });
});

test('강화 비용·투자액·철거 환급은 리팩터 전과 같다', () => {
  const cases = [
    { cell: { type: 'residential', level: 1 }, upgradeCost: 2, investedCost: 2, demolitionRefund: 1 },
    { cell: { type: 'residential', level: 2 }, upgradeCost: 3, investedCost: 4, demolitionRefund: 2 },
    { cell: { type: 'data', level: 2 }, upgradeCost: 9, investedCost: 12, demolitionRefund: 6 },
    { cell: { type: 'nuclear', level: 1 }, upgradeCost: 8, investedCost: 8, demolitionRefund: 4 },
  ];
  cases.forEach((expected) => {
    expect({
      cell: expected.cell,
      upgradeCost: upgradeCost(expected.cell),
      investedCost: investedCost(expected.cell),
      demolitionRefund: demolitionRefund(expected.cell),
    }).toEqual(expected);
  });
});
