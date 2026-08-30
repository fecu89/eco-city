import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import { migrateSaveData, migrateV3ToV4 } from '../../../src/systems/SaveSystem.js';

test('new 2040 state uses ten credits, a deterministic clock, and no obsolete AI or badge state', () => {
  const state = new GameState();
  expect(SAVE_VERSION).toBe(5);
  expect(state.credits).toBe(10);
  expect(state.elapsedGameHours).toBe(0);
  expect(state.timeScale).toBe(1);
  expect(state.lastSettlementDelta).toBe(0);
  expect(state.research).toMatchObject({ jobs: {}, techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0 } });
  expect(state.research.completedIds).toBeInstanceOf(Set);
  for (const key of ['badges', 'advisorQuestions', 'transcripts', 'evidence']) expect(key in state).toBe(false);
});

test('v5 round trip restores research completion as a Set', () => {
  const state = new GameState();
  state.research.completedIds.add('solar2');
  state.research.techLevels.solar = 2;
  state.research.jobs.wind2 = { id: 'wind2', dataCenterIndex: 3, elapsedEffectiveHours: 12, status: 'running' };
  const payload = state.serialize();
  expect(payload.research.completedIds).toEqual(['solar2']);
  const restored = new GameState();
  expect(restored.hydrate(payload)).toBe(true);
  expect(restored.research.completedIds).toBeInstanceOf(Set);
  expect([...restored.research.completedIds]).toEqual(['solar2']);
  expect(restored.research.jobs.wind2).toMatchObject({ id: 'wind2', elapsedEffectiveHours: 12 });
});

test('v3 hex saves gain v4 defaults without moving cells or retaining obsolete fields', () => {
  const grid = Array(19).fill(null);
  grid[3] = { type: 'solar', level: 3, priority: 'normal' };
  const migrated = migrateV3ToV4({
    v: 3,
    boardRadius: 2,
    grid,
    credits: 7,
    questIndex: 8,
    simulationDay: 3,
    simulationHour: 10,
    evidence: ['legacy'],
    badges: ['builder'],
    advisorQuestions: 4,
    transcripts: { execution: ['legacy'] },
  });
  expect(migrated).toMatchObject({ v: 4, boardRadius: 2, credits: 7, questIndex: 8 });
  expect(migrated.grid[3]).toMatchObject({ type: 'solar', level: 3 });
  expect(migrated.research.techLevels.solar).toBe(1);
  expect(migrated.elapsedGameHours).toBe(50);
  for (const key of ['evidence', 'badges', 'advisorQuestions', 'transcripts', 'simulationDay', 'simulationHour']) {
    expect(key in migrated).toBe(false);
  }
});

test('v2 square saves flow through v3 hex mapping before v4 defaults', () => {
  const grid = Array(25).fill(null);
  grid[24] = { type: 'battery', level: 2, priority: 'normal', batteryStoredLowCarbon: 5, batteryStoredFossil: 2 };
  const migrated = migrateSaveData({ v: 2, gridSize: 5, grid, credits: 9, questIndex: 9 });
  expect(migrated.v).toBe(5);
  expect(migrated.boardRadius).toBe(3);
  expect(migrated.grid).toHaveLength(37);
  expect(migrated.grid.find(Boolean)).toMatchObject({ type: 'battery', level: 2, batteryStoredLowCarbon: 5, batteryStoredFossil: 2 });
});
