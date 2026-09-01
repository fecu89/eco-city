import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import { migrateSaveData, migrateV7ToV8 } from '../../../src/systems/SaveSystem.js';

function v7Save(overrides = {}) {
  const fresh = new GameState().serialize();
  const legacy = {
    ...fresh,
    v: 7,
    elapsedGameHours: 0,
    grid: fresh.grid,
    research: {
      ...fresh.research,
      techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0 },
    },
    ...overrides,
  };
  delete legacy.elapsedGameDays;
  delete legacy.climateCampaign;
  delete legacy.workforceRebalanceGraceDays;
  return legacy;
}

test('v7 save preserves its displayed date and real remaining durations', () => {
  const old = v7Save({
    elapsedGameHours: 120,
    grid: [{
      type: 'factory',
      level: 1,
      project: { kind: 'upgrade', fromLevel: 1, toLevel: 2, durationHours: 8, elapsedHours: 3, paidCost: 4 },
    }],
    research: {
      jobs: { solar2: { id: 'solar2', dataCenterIndex: 3, durationHours: 120, elapsedEffectiveHours: 30, paidCost: 10 } },
      completedIds: [],
      techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0 },
      quizAccelerationBankHours: 0,
      quizCreditQuestionIds: {},
    },
  });

  const migrated = migrateSaveData(old);

  expect(migrated).toMatchObject({ v: 8, elapsedGameDays: 5, workforceRebalanceGraceDays: 24 });
  expect(migrated.grid[0].project).toMatchObject({ durationDays: 8, elapsedDays: 3 });
  expect(migrated.research.jobs.solar2).toMatchObject({ durationDays: 120, elapsedEffectiveDays: 30 });
  expect(migrated.research.techLevels.green).toBe(1);
  expect(JSON.stringify(migrated)).not.toContain('elapsedGameHours');
});

test('v7 post-tutorial save starts quest seven without losing its city', () => {
  const migrated = migrateSaveData(v7Save({
    questIndex: 11,
    campaignComplete: false,
    credits: 31,
    grid: [{ type: 'nuclear', level: 2, project: null }],
    unlockedFacilities: ['residential', 'nuclear'],
  }));

  expect(migrated).toMatchObject({ v: 8, questIndex: 7, credits: 31 });
  expect(migrated.grid[0]).toMatchObject({ type: 'nuclear', level: 2 });
  expect(migrated.climateCampaign).toMatchObject({ status: 'briefing', completedEventTypes: [] });
});

test('completed v7 campaign remains complete and fresh v8 state uses daily fields only', () => {
  const completed = migrateV7ToV8(v7Save({ questIndex: 15, campaignComplete: true }));
  expect(completed).toMatchObject({ v: 8, questIndex: 15, campaignComplete: true });

  const fresh = new GameState();
  const serialized = fresh.serialize();
  expect(SAVE_VERSION).toBe(8);
  expect(serialized.elapsedGameDays).toBe(0);
  expect(serialized.simulationTotals.days).toBe(0);
  expect(serialized.research.techLevels.green).toBe(1);
  expect(JSON.stringify(serialized)).not.toContain('Hours');
});

test('v8 round trip preserves daily project and research progress', () => {
  const state = new GameState();
  state.grid[0] = {
    type: 'factory',
    level: 1,
    project: { kind: 'build', durationDays: 8, elapsedDays: 3, paidCost: 4 },
  };
  state.research.jobs.solar2 = {
    id: 'solar2', dataCenterIndex: 2, elapsedEffectiveDays: 30, status: 'running', paidCost: 10,
  };

  const restored = new GameState();
  expect(restored.hydrate(state.serialize())).toBe(true);
  expect(restored.grid[0].project).toMatchObject({ durationDays: 8, elapsedDays: 3 });
  expect(restored.research.jobs.solar2.elapsedEffectiveDays).toBe(30);
});
