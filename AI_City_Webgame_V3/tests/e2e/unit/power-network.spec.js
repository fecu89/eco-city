import { test, expect } from '@playwright/test';
import {
  directEfficiency,
  isBatteryNeighbor,
  calculatePowerNetwork,
} from '../../../src/systems/PowerNetworkSystem.js';
import { createHexCoordinates, neighborIndices } from '../../../src/systems/HexGridSystem.js';

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

  const result = calculatePowerNetwork({ grid, coords, hour: 23, tickIndex: 0, heatwave: false });

  expect(result.facilityPower[1].delivered).toBeGreaterThan(0);
  expect(result.routes.some((route) => route.kind === 'battery' && route.to === 1)).toBe(true);
  expect(result.routes.find((route) => route.kind === 'battery' && route.to === 1).lowCarbonDelivered).toBeGreaterThan(0);
  expect(result.lowCarbonDelivered).toBeGreaterThan(0);
  expect(result.nextBatteries[0].lowCarbon).toBeLessThan(10);
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
