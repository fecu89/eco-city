import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  expandBoard,
  getBoardCoordinates,
  getCellSpatial,
  placementPreview,
} from '../../../src/systems/BoardSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createHexCoordinates, isOuterRing, neighborIndices } from '../../../src/systems/HexGridSystem.js';

const powered = (grid) => Object.fromEntries(grid.map((cell, index) => [index, {
  ratio: cell ? 1 : 0,
  demand: cell ? 1 : 0,
  delivered: cell ? 1 : 0,
}]));

test('all six center neighbors produce the same residential green-space bonus', () => {
  const coords = createHexCoordinates(2);
  for (const neighbor of neighborIndices(0, coords)) {
    const grid = Array(19).fill(null);
    grid[0] = { type: 'residential', level: 1 };
    grid[neighbor] = { type: 'green', level: 1 };
    expect(getCellSpatial(grid, 0, coords).positive).toContain('녹지 생활권');
  }
});

test('placement preview uses all six shared neighbors', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  const neighbors = neighborIndices(0, coords);
  grid[0] = { type: 'battery', level: 1 };
  const preview = placementPreview('solar', grid, coords);
  expect([...preview.good].sort((a, b) => a - b)).toEqual([...neighbors].sort((a, b) => a - b));
});

test('pollution penalty applies across every hex direction exactly once', () => {
  const coords = createHexCoordinates(2);
  for (const neighbor of neighborIndices(0, coords)) {
    const grid = Array(19).fill(null);
    grid[0] = { type: 'factory', level: 1 };
    grid[neighbor] = { type: 'residential', level: 1 };
    const result = settleEconomy({
      grid,
      coords,
      facilityPower: powered(grid),
      credits: 10,
    });
    expect(result.health).toBe(0.4);
  }
});

test('board expands append-only from 19 to 37 cells', () => {
  const state = new GameState();
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[18] = { type: 'battery', level: 2, batteryStoredLowCarbon: 4 };
  const before = state.grid.map((cell) => cell && { ...cell });
  const result = expandBoard(state);
  expect(result).toMatchObject({ ok: true, oldRadius: 2, newRadius: 3 });
  expect(result.addedIndices).toEqual(Array.from({ length: 18 }, (_, offset) => 19 + offset));
  expect(state.grid.slice(0, 19)).toEqual(before);
  expect(state.grid).toHaveLength(37);
  expect(getBoardCoordinates(state)).toHaveLength(37);
  expect(getBoardCoordinates(state).filter((_, index, coords) => isOuterRing(index, coords, 3))).toHaveLength(18);
});
