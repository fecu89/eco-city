import { test, expect } from '@playwright/test';
import {
  directEfficiency,
  isBatteryNeighbor,
  calculatePowerNetwork,
} from '../../../src/systems/PowerNetworkSystem.js';
import {
  coordKey,
  createHexCoordinates,
  hexDistance,
  neighborIndices,
} from '../../../src/systems/HexGridSystem.js';

const cell = (type, extra = {}) => ({
  type,
  level: 1,
  priority: ['residential', 'cooling'].includes(type) ? 'essential' : 'normal',
  batteryStoredLowCarbon: 0,
  batteryStoredFossil: 0,
  ...extra,
});

test('direct transmission loses six percent per extra tile with a 55 percent floor', () => {
  expect(directEfficiency(1)).toBe(1);
  expect(directEfficiency(2)).toBe(0.94);
  expect(directEfficiency(4)).toBe(0.82);
  expect(directEfficiency(20)).toBe(0.55);
});

test('battery hub covers all six adjacent hexes, but not radius two', () => {
  const coords = createHexCoordinates(2);
  for (const neighbor of neighborIndices(0, coords)) {
    expect(isBatteryNeighbor(0, neighbor, coords)).toBe(true);
  }
  expect(isBatteryNeighbor(0, 7, coords)).toBe(false);
});

test('all six adjacent directions have identical distance and direct transmission efficiency', () => {
  const coords = createHexCoordinates(2);
  for (const neighbor of neighborIndices(0, coords)) {
    expect(hexDistance(coords[0], coords[neighbor])).toBe(1);
    const grid = Array(19).fill(null);
    grid[0] = cell('thermal');
    grid[neighbor] = cell('data');
    const result = calculatePowerNetwork({ grid, coords, hour: 12 });
    expect(result.facilityPower[neighbor]).toMatchObject({ ratio: 1 });
    expect(result.routes.find((route) => route.to === neighbor)?.efficiency).toBe(1);
  }
});

test('rotating an identical hex city cannot change data-center power priority', () => {
  const coords = createHexCoordinates(2);
  const indexByCoord = new Map(coords.map((coord, index) => [coordKey(coord), index]));
  const rotateCoord = ({ q, r }) => ({ q: -r, r: q + r });
  const rotateIndex = (index, turns) => {
    let coord = coords[index];
    for (let turn = 0; turn < turns; turn += 1) coord = rotateCoord(coord);
    return indexByCoord.get(coordKey(coord));
  };
  const placements = [
    [6, 'thermal'],
    [7, 'data'],
    [15, 'factory'],
    [17, 'residential'],
    [18, 'residential'],
    [10, 'green'],
  ];

  const samples = Array.from({ length: 6 }, (_, turns) => {
    const grid = Array(19).fill(null);
    placements.forEach(([index, type]) => { grid[rotateIndex(index, turns)] = cell(type); });
    const dataIndex = rotateIndex(7, turns);
    const result = calculatePowerNetwork({ grid, coords, hour: 12 });
    return {
      ratio: result.facilityPower[dataIndex].ratio,
      efficiency: result.routes.find((route) => route.to === dataIndex)?.efficiency,
    };
  });

  expect(samples.every(({ ratio }) => ratio >= 0.9)).toBe(true);
  expect(new Set(samples.map(({ ratio }) => ratio)).size).toBe(1);
  expect(new Set(samples.map(({ efficiency }) => efficiency)).size).toBe(1);
});

test('essential consumers receive scarce power before normal consumers', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = cell('solar');
  grid[1] = cell('data');
  grid[2] = cell('residential');

  const result = calculatePowerNetwork({ grid, coords, hour: 12, tickIndex: 0, heatwave: false });

  expect(result.facilityPower[2].delivered).toBe(2);
  expect(result.facilityPower[1].delivered).toBeGreaterThan(0);
  expect(result.facilityPower[1].delivered).toBeLessThan(8);
});

test('a neighboring hex battery provides a local hub route and preserves low-carbon storage', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[7] = cell('solar');
  grid[0] = cell('battery', { batteryStoredLowCarbon: 10 });
  grid[1] = cell('data');
  grid[11] = cell('thermal'); // powers battery controls; the nearby battery remains the best delivery route

  const result = calculatePowerNetwork({ grid, coords, hour: 23, tickIndex: 0, heatwave: false });

  expect(result.facilityPower[1].delivered).toBeGreaterThan(0);
  expect(result.routes.some((route) => route.kind === 'battery' && route.to === 1)).toBe(true);
  expect(result.routes.find((route) => route.kind === 'battery' && route.to === 1).lowCarbonDelivered).toBeGreaterThan(0);
  expect(result.lowCarbonDelivered).toBeGreaterThan(0);
  expect(result.nextBatteries[0].lowCarbon).toBeLessThan(10);
});

for (const [level, expectedDemand] of [
  [1, 1],
  [2, 1.24],
  [3, 1.45],
]) {
  test(`battery Lv.${level} contributes ${expectedDemand}E auxiliary demand before storage operation`, () => {
    const coords = createHexCoordinates(2);
    const grid = Array(19).fill(null);
    grid[0] = cell('thermal');
    grid[1] = cell('battery', { level });
    grid[2] = cell('residential');

    const result = calculatePowerNetwork({ grid, coords, hour: 12 });

    expect(result.facilityPower[1].demand).toBeCloseTo(expectedDemand);
    expect(result.facilityPower[1].ratio).toBe(1);
    expect(result.demand).toBeCloseTo(2 + expectedDemand);
    expect(result.batteryOperations[1].canOperate).toBe(true);
  });
}

test('an unpowered battery cannot discharge or charge', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = cell('battery', { batteryStoredLowCarbon: 5 });
  grid[1] = cell('residential');

  const result = calculatePowerNetwork({ grid, coords, hour: 12 });

  expect(result.facilityPower[0]).toMatchObject({ demand: 1, delivered: 0, ratio: 0 });
  expect(result.facilityPower[1].delivered).toBe(0);
  expect(result.batteryOperations[0]).toMatchObject({ canOperate: false, charged: 0, discharged: 0 });
  expect(result.nextBatteries[0]).toEqual({ lowCarbon: 5, fossil: 0 });
});

test('research demand is included in the assigned data center power ratio', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[0] = cell('thermal');
  grid[1] = cell('data');
  const result = calculatePowerNetwork({ grid, coords, additionalDemandByIndex: { 1: 2 }, hour: 8 });
  expect(result.facilityPower[1].demand).toBe(10);
  expect(result.facilityPower[1].ratio).toBe(1);
});
