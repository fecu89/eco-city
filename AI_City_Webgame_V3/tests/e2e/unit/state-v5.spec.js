import { test, expect } from '@playwright/test';
import { STAGES } from '../../../src/core/Constants.js';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import { migrateSaveData, migrateV4ToV5 } from '../../../src/systems/SaveSystem.js';

function v4Save(overrides = {}) {
  return {
    v: 4,
    stage: 5,
    credits: 1.005,
    questIndex: 8,
    questStatus: 'active',
    boardRadius: 2,
    grid: Array(19).fill(null),
    unlockedFacilities: ['residential', 'solar'],
    upgradePermitLevel: 1,
    research: {
      active: {
        id: 'solar2',
        dataCenterIndex: 3,
        elapsedEffectiveHours: 12,
        status: 'running',
        paidCost: 8,
      },
      completedIds: [],
      techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0 },
    },
    ...overrides,
  };
}

test('v4 saves migrate the active research job and quest-eight permit to v5', () => {
  const migrated = migrateV4ToV5(v4Save());

  expect(migrated.v).toBe(5);
  expect(migrated.credits).toBe(1.01);
  expect(migrated.upgradePermitLevel).toBe(2);
  expect(migrated.research.jobs.solar2).toMatchObject({
    id: 'solar2',
    dataCenterIndex: 3,
    elapsedEffectiveHours: 12,
    paidCost: 8,
  });
  expect(migrated.research.quizAccelerationBankHours).toBe(0);
  expect(migrated).toMatchObject({
    carbonCrisisHours: 0,
    gameOver: false,
    gameOverReason: null,
    diagnosisScannerActive: true,
  });
  expect(migrated.carbonWarningMilestones).toEqual([]);
});

test('the complete migration chain ends at the current save version', () => {
  const migrated = migrateSaveData(v4Save({ questIndex: 6, upgradePermitLevel: 1 }));
  expect(SAVE_VERSION).toBe(5);
  expect(migrated.v).toBe(5);
  expect(migrated.upgradePermitLevel).toBe(1);
});

test('a saved legacy quest-six diagnosis session resumes in editable redesign mode', () => {
  const source = new GameState();
  const saved = source.serialize();
  saved.questIndex = 6;
  saved.stage = STAGES.DIAGNOSIS;

  const restored = new GameState();
  expect(restored.hydrate(saved)).toBe(true);
  expect(restored.stage).toBe(STAGES.REDESIGN);
  expect(restored.isEditable).toBe(true);
});

test('construction plans are transient across serialization and hydration', () => {
  const source = new GameState();
  source.constructionPlan = [{ index: 0, type: 'residential' }];
  const saved = source.serialize();
  expect(saved).not.toHaveProperty('constructionPlan');

  const restored = new GameState();
  expect(restored.hydrate(saved)).toBe(true);
  expect(restored.constructionPlan).toEqual([]);
});

test('research quiz target is serialized and missing legacy values hydrate safely', () => {
  const source = new GameState();
  source.quizResearchId = 'solar2';
  const saved = source.serialize();
  expect(saved.quizResearchId).toBe('solar2');

  const restored = new GameState();
  expect(restored.hydrate(saved)).toBe(true);
  expect(restored.quizResearchId).toBe('solar2');

  delete saved.quizResearchId;
  const legacy = new GameState();
  expect(legacy.hydrate(saved)).toBe(true);
  expect(legacy.quizResearchId).toBeNull();
});

test('new games enable music while an explicit saved disabled preference remains off', () => {
  const fresh = new GameState();
  expect(fresh.musicEnabled).toBe(true);
  const saved = fresh.serialize();
  saved.musicEnabled = false;
  const restored = new GameState();
  expect(restored.hydrate(saved)).toBe(true);
  expect(restored.musicEnabled).toBe(false);
});
