import { test, expect } from '@playwright/test';
import {
  directEfficiency,
  isBatteryNeighbor,
  calculatePowerNetwork,
} from '../../../src/systems/PowerNetworkSystem.js';

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

test('battery hub covers orthogonal and diagonal neighbors, but not radius two', () => {
  expect(isBatteryNeighbor(12, 6, 5)).toBe(true);
  expect(isBatteryNeighbor(12, 13, 5)).toBe(true);
  expect(isBatteryNeighbor(12, 14, 5)).toBe(false);
});

test('essential consumers receive scarce power before normal consumers', () => {
  const grid = Array(9).fill(null);
  grid[0] = cell('solar');
  grid[1] = cell('data');
  grid[3] = cell('residential');

  const result = calculatePowerNetwork({ grid, size: 3, hour: 12, tickIndex: 0, heatwave: false });

  expect(result.facilityPower[3].delivered).toBe(2);
  expect(result.facilityPower[1].delivered).toBeGreaterThan(0);
  expect(result.facilityPower[1].delivered).toBeLessThan(8);
});

test('a diagonal battery provides a local hub route and preserves low-carbon storage', () => {
  const grid = Array(25).fill(null);
  grid[0] = cell('solar');
  grid[12] = cell('battery', { batteryStoredLowCarbon: 10 });
  grid[18] = cell('data');

  const result = calculatePowerNetwork({ grid, size: 5, hour: 23, tickIndex: 0, heatwave: false });

  expect(result.facilityPower[18].delivered).toBeGreaterThan(0);
  expect(result.routes.some((route) => route.kind === 'battery' && route.to === 18)).toBe(true);
  expect(result.routes.find((route) => route.kind === 'battery' && route.to === 18).lowCarbonDelivered).toBeGreaterThan(0);
  expect(result.lowCarbonDelivered).toBeGreaterThan(0);
  expect(result.nextBatteries[12].lowCarbon).toBeLessThan(10);
});
