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

test('battery placement preview rewards all six consumer-adjacent hub positions', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  const neighbors = neighborIndices(0, coords);
  grid[0] = { type: 'residential', level: 1 };
  const preview = placementPreview('battery', grid, coords);
  expect([...preview.good].sort((a, b) => a - b)).toEqual([...neighbors].sort((a, b) => a - b));
});

test('spatial score only rewards a battery that is adjacent to a consumer', () => {
  const coords = createHexCoordinates(2);
  const sourceOnly = Array(19).fill(null);
  sourceOnly[0] = { type: 'solar', level: 1 };
  sourceOnly[1] = { type: 'battery', level: 1 };

  const consumerHub = Array(19).fill(null);
  consumerHub[0] = { type: 'battery', level: 1 };
  consumerHub[1] = { type: 'residential', level: 1 };
  consumerHub[7] = { type: 'solar', level: 1 };

  expect(getCellSpatial(sourceOnly, 1, coords).positive).not.toContain('소비지 저장 허브');
  expect(getCellSpatial(consumerHub, 0, coords).positive).toContain('소비지 저장 허브');
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

test('board expands append-only from 19 to 37 backing cells while opening one side', () => {
  const state = new GameState();
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[18] = { type: 'battery', level: 2, batteryStoredLowCarbon: 4 };
  const before = state.grid.map((cell) => cell && { ...cell });
  const result = expandBoard(state, 'east');
  expect(result).toMatchObject({ ok: true, oldRadius: 2, newRadius: 3, side: 'east', phase: 1 });
  expect(result.addedIndices).toHaveLength(9);
  expect(state.grid.slice(0, 19)).toEqual(before);
  expect(state.grid).toHaveLength(37);
  expect(state.expansion.activeCellIndices).toHaveLength(28);
  expect(getBoardCoordinates(state)).toHaveLength(37);
  expect(getBoardCoordinates(state).filter((_, index, coords) => isOuterRing(index, coords, 3))).toHaveLength(18);
});
