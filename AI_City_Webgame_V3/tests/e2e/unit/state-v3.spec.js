import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import {
  mapLegacySquareGrid,
  migrateSaveData,
  migrateV2ToV3,
} from '../../../src/systems/SaveSystem.js';

test('new state starts with a radius-two 19-cell board', () => {
  const state = new GameState();
  expect(SAVE_VERSION).toBe(6);
  expect(state.boardRadius).toBe(2);
  expect(state.grid).toHaveLength(19);
  expect(state.grid.every((cell) => cell === null)).toBe(true);
});

test('migrates 25 occupied square cells without dropping facility state', () => {
  const oldGrid = Array.from({ length: 25 }, (_, index) => ({
    type: index % 2 ? 'residential' : 'factory',
    level: index % 3 + 1,
    priority: index % 2 ? 'normal' : 'essential',
    legacyIndex: index,
  }));
  const migrated = mapLegacySquareGrid(oldGrid, 5);
  expect(migrated.boardRadius).toBe(3);
  expect(migrated.grid).toHaveLength(37);
  expect(migrated.grid.filter(Boolean)).toHaveLength(25);
  expect(migrated.grid.filter(Boolean).map((cell) => cell.legacyIndex).sort((a, b) => a - b))
    .toEqual(Array.from({ length: 25 }, (_, index) => index));
  expect(migrated.indexMap.size).toBe(25);
});

test('migrates a full 6x6 board into radius three and preserves all 36 facilities', () => {
  const oldGrid = Array.from({ length: 36 }, (_, index) => ({ type: 'residential', level: 1, legacyIndex: index }));
  const migrated = mapLegacySquareGrid(oldGrid, 6);
  expect(migrated.grid.filter(Boolean)).toHaveLength(36);
  expect(migrated.grid).toHaveLength(37);
});

test('v2 migration remaps related indices and resets only transient quest progress', () => {
  const grid = Array(25).fill(null);
  grid[0] = { type: 'battery', level: 2, priority: 'normal', batteryStoredLowCarbon: 9, batteryStoredFossil: 3 };
  grid[24] = { type: 'residential', level: 1 };
  const migrated = migrateV2ToV3({
    v: 2,
    gridSize: 5,
    grid,
    firstCitySnapshot: grid,
    selectedCell: 24,
    diagnosisFound: [0, 24],
    questIndex: 9,
    questProgress: { consecutiveHours: 2, hubEnergy: 7 },
  });
  expect(migrated.v).toBe(3);
  expect(migrated.boardRadius).toBe(3);
  expect(migrated.grid[migrated.selectedCell].type).toBe('residential');
  expect(migrated.diagnosisFound).toHaveLength(2);
  expect(migrated.questProgress).toEqual({});
  expect(migrated.grid.find((cell) => cell?.type === 'battery')).toMatchObject({
    level: 2,
    batteryStoredLowCarbon: 9,
    batteryStoredFossil: 3,
  });
});

test('empty v2 square save becomes a radius-two board', () => {
  const migrated = migrateSaveData({ v: 2, gridSize: 5, grid: Array(25).fill(null), credits: 7 });
  expect(migrated).toMatchObject({ v: 6, boardRadius: 2, credits: 7 });
  expect(migrated.grid).toHaveLength(19);
});
