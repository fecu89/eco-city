import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import { migrateV1Save } from '../../../src/systems/SaveSystem.js';

test('new state starts quest 1 at 08:00 with only residential unlocked', () => {
  const state = new GameState();

  expect(SAVE_VERSION).toBe(2);
  expect(state.questIndex).toBe(1);
  expect(state.simulationHour).toBe(8);
  expect([...state.unlockedFacilities]).toEqual(['residential']);
  expect(state.evidence).toBeUndefined();
  expect(state.serialize().evidence).toBeUndefined();
});

test('v1 redesign saves migrate to quest 10 without evidence', () => {
  const migrated = migrateV1Save({
    v: 1,
    stage: 5,
    credits: 22,
    gridSize: 5,
    grid: [{ type: 'solar', level: 1 }, ...Array(24).fill(null)],
    evidence: [{ reason: 'legacy' }],
  });

  expect(migrated.v).toBe(2);
  expect(migrated.questIndex).toBe(10);
  expect(migrated.credits).toBe(22);
  expect(migrated.unlockedFacilities).toContain('green');
  expect(migrated.evidence).toBeUndefined();
});

test('v2 round trip preserves quest, priority, and battery energy mix', () => {
  const source = new GameState();
  source.questIndex = 9;
  source.claimedQuestIds.add('renewable-network');
  source.grid[0] = {
    type: 'battery',
    level: 2,
    priority: 'normal',
    batteryStoredLowCarbon: 9,
    batteryStoredFossil: 3,
  };

  const restored = new GameState();
  expect(restored.hydrate(source.serialize())).toBe(true);
  expect(restored.questIndex).toBe(9);
  expect([...restored.claimedQuestIds]).toContain('renewable-network');
  expect(restored.grid[0].priority).toBe('normal');
  expect(restored.grid[0].batteryStoredLowCarbon).toBe(9);
  expect(restored.grid[0].batteryStoredFossil).toBe(3);
});
