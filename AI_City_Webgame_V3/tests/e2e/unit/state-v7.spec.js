import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import { migrateSaveData, migrateV6ToV7 } from '../../../src/systems/SaveSystem.js';
import { createBuildProject, createUpgradeProject } from '../../../src/systems/ConstructionProjectSystem.js';

function saveShapedState() {
  return new GameState().serialize();
}

test('v6 migration keeps every facility complete and creates no construction projects', () => {
  const v6 = saveShapedState();
  v6.v = 6;
  v6.grid[0] = { type: 'residential', level: 1, operationMode: 'normal' };
  v6.grid[1] = { type: 'thermal', level: 2, operationMode: 'eco' };

  const migrated = migrateV6ToV7(v6);

  expect(migrated.v).toBe(7);
  expect(migrated.grid[0]).toMatchObject({ type: 'residential', level: 1, project: null });
  expect(migrated.grid[1]).toMatchObject({ type: 'thermal', level: 2, operationMode: 'eco', project: null });
});

test('v7 round trip preserves concurrent build and upgrade progress with battery and research state', () => {
  const state = new GameState();
  const thermal = { type: 'thermal', level: 1, operationMode: 'eco' };
  state.grid[0] = {
    type: 'battery',
    level: 1,
    operationMode: 'normal',
    batteryPolicy: 'auto',
    batteryStoredLowCarbon: 6,
    batteryStoredFossil: 2,
    project: { ...createBuildProject({ type: 'battery', paidCost: 4 }), elapsedHours: 3 },
  };
  state.grid[1] = {
    ...thermal,
    project: { ...createUpgradeProject({ cell: thermal, paidCost: 5 }), elapsedHours: 4 },
  };
  state.research.jobs.solar2 = { id: 'solar2', dataCenterIndex: 4, elapsedEffectiveHours: 12, paidCost: 8, status: 'running' };

  const payload = state.serialize();
  const restored = new GameState();

  expect(SAVE_VERSION).toBe(7);
  expect(restored.hydrate(payload)).toBe(true);
  expect(restored.grid[0]).toMatchObject({
    batteryStoredLowCarbon: 6,
    batteryStoredFossil: 2,
    project: { kind: 'build', elapsedHours: 3, durationHours: 10, paidCost: 4 },
  });
  expect(restored.grid[1]).toMatchObject({
    level: 1,
    project: { kind: 'upgrade', fromLevel: 1, toLevel: 2, elapsedHours: 4, durationHours: 8, suspendedOperationMode: 'eco' },
  });
  expect(restored.research.jobs.solar2.elapsedEffectiveHours).toBe(12);
  expect(JSON.stringify(payload)).not.toContain('startedAtRealTime');
});

test('malformed build projects clear only their construction site', () => {
  const payload = saveShapedState();
  payload.v = 7;
  payload.grid[0] = {
    type: 'factory',
    level: 1,
    project: { kind: 'build', elapsedHours: 2, durationHours: 0, paidCost: 4 },
  };
  payload.grid[1] = { type: 'residential', level: 1, operationMode: 'normal', project: null };

  const restored = new GameState();
  expect(restored.hydrate(payload)).toBe(true);
  expect(restored.grid[0]).toBeNull();
  expect(restored.grid[1]).toMatchObject({ type: 'residential', level: 1, project: null });
});

test('malformed upgrade projects restore the previous level and suspended mode without refund', () => {
  const payload = saveShapedState();
  payload.v = 7;
  payload.credits = 3;
  payload.grid[0] = {
    type: 'thermal',
    level: 1,
    operationMode: 'normal',
    project: {
      kind: 'upgrade',
      fromLevel: 1,
      toLevel: 3,
      elapsedHours: 2,
      durationHours: 8,
      paidCost: 5,
      suspendedOperationMode: 'eco',
    },
  };

  const restored = new GameState();
  expect(restored.hydrate(payload)).toBe(true);
  expect(restored.grid[0]).toMatchObject({ level: 1, operationMode: 'eco', project: null });
  expect(restored.credits).toBe(3);
});

test('the full migration chain ends at v7', () => {
  const v6 = saveShapedState();
  v6.v = 6;
  expect(migrateSaveData(v6).v).toBe(7);
});
