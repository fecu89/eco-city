import { test, expect } from '@playwright/test';
import {
  axialToWorld,
  buildHexIndex,
  coordKey,
  createHexCoordinates,
  expandHexGrid,
  hexDistance,
  isOuterRing,
  neighborIndices,
} from '../../../src/systems/HexGridSystem.js';

test('radius two and three generate stable center-first 19/37 cell orders', () => {
  const radius2 = createHexCoordinates(2);
  const radius3 = createHexCoordinates(3);
  expect(radius2).toHaveLength(19);
  expect(radius3).toHaveLength(37);
  expect(radius2[0]).toEqual({ q: 0, r: 0 });
  expect(radius3.slice(0, 19)).toEqual(radius2);
  expect(new Set(radius3.map(coordKey)).size).toBe(37);
});

test('center has six neighbors and edge cells have fewer', () => {
  const coords = createHexCoordinates(2);
  expect(neighborIndices(0, coords)).toHaveLength(6);
  const corner = coords.findIndex((coord) => coord.q === 2 && coord.r === 0);
  expect(neighborIndices(corner, coords).length).toBeLessThan(6);
  expect(isOuterRing(corner, coords, 2)).toBe(true);
});

test('hex distance and pointy-top world placement are deterministic', () => {
  expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
  expect(hexDistance({ q: -3, r: 2 }, { q: 1, r: -1 })).toBe(4);
  expect(axialToWorld({ q: 0, r: 0 }, 1)).toEqual({ x: 0, z: 0 });
  const east = axialToWorld({ q: 1, r: 0 }, 1);
  expect(east.x).toBeCloseTo(Math.sqrt(3));
  expect(east.z).toBe(0);
});

test('index lookup and expansion preserve every existing index', () => {
  const radius2 = createHexCoordinates(2);
  const index = buildHexIndex(radius2);
  radius2.forEach((coord, cellIndex) => expect(index.get(coordKey(coord))).toBe(cellIndex));
  const grid = Array.from({ length: 19 }, (_, cellIndex) => (cellIndex % 3 === 0 ? { type: 'residential', level: 1 } : null));
  const expanded = expandHexGrid(grid, 2, 3);
  expect(expanded).toHaveLength(37);
  expect(expanded.slice(0, 19)).toEqual(grid);
  expect(expanded.slice(19).every((cell) => cell === null)).toBe(true);
});
