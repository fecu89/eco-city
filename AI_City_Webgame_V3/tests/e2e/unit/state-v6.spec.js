import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import { migrateSaveData, migrateV5ToV6 } from '../../../src/systems/SaveSystem.js';

function v5Save(overrides = {}) {
  return {
    v: 5,
    stage: 5,
    credits: 20,
    boardRadius: 2,
    grid: Array(19).fill(null),
    questIndex: 7,
    questStatus: 'active',
    questProgress: {},
    claimedQuestIds: ['first-home', 'city-foundation'],
    unlockedFacilities: ['residential', 'factory', 'thermal', 'green', 'data', 'nuclear', 'cooling', 'solar'],
    upgradePermitLevel: 1,
    campaignComplete: false,
    elapsedGameHours: 12,
    timeScale: 1,
    emergencySupportUsedQuestIds: [],
    research: {
      jobs: {},
      completedIds: [],
      techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0 },
      quizAccelerationBankHours: 0,
    },
    ...overrides,
  };
}

test('v5 renewable3 completion restores all four legacy level-three technologies', () => {
  const migrated = migrateV5ToV6(v5Save({
    research: {
      jobs: {},
      completedIds: ['solar2', 'wind2', 'battery2', 'tidal1', 'renewable3'],
      techLevels: { solar: 3, wind: 3, battery: 2, tidal: 3 },
    },
  }));

  expect(migrated.research.techLevels).toEqual({ solar: 3, wind: 3, battery: 3, tidal: 3 });
});

for (const [questIndex, objectiveSetId] of [[9, 'transition-choice'], [14, 'resilience']]) {
  test(`v5 ready quest ${questIndex} maps without keeping claimable progress`, () => {
    const migrated = migrateV5ToV6(v5Save({
      questIndex,
      questStatus: 'ready_to_claim',
      questProgress: { consecutiveHours: 9, hubEnergy: 99 },
    }));

    expect(migrated.questStatus).toBe('active');
    expect(migrated.questProgress).toEqual({});
    expect(migrated.progression.objectiveSetId).toBe(objectiveSetId);
    expect(migrated.progression.objectiveProgress).toEqual({});
  });
}

test('a completed v5 campaign stays complete without receiving redesigned rewards', () => {
  const source = v5Save({ questIndex: 15, questStatus: 'claimed', campaignComplete: true, credits: 37.25 });
  const migrated = migrateV5ToV6(source);

  expect(migrated.credits).toBe(37.25);
  expect(migrated.campaignComplete).toBe(true);
  expect(migrated.progression.chapter).toBe(4);
  expect(migrated.stressTest.status).toBe('legacy_complete');
});

test('a legacy 37-cell city keeps every outer cell active', () => {
  const grid = Array(37).fill(null);
  grid[36] = { type: 'wind', level: 2 };
  const migrated = migrateV5ToV6(v5Save({ boardRadius: 3, grid, questIndex: 11 }));

  expect(migrated.expansion).toMatchObject({ phase: 2, firstChoice: 'legacy_full' });
  expect(migrated.expansion.activeCellIndices).toEqual(Array.from({ length: 37 }, (_, index) => index));
  expect(migrated.grid[36]).toMatchObject({ type: 'wind', level: 2, operationMode: 'normal' });
});

test('v6 normalization clamps scale, facility level, and battery storage while adding operation defaults', () => {
  const grid = Array(19).fill(null);
  grid[0] = {
    type: 'battery',
    level: 9,
    batteryStoredLowCarbon: 80,
    batteryStoredFossil: 20,
  };
  const migrated = migrateV5ToV6(v5Save({ grid, timeScale: 99 }));

  expect(migrated.timeScale).toBe(1);
  expect(migrated.grid[0]).toMatchObject({
    level: 3,
    operationMode: 'normal',
    batteryPolicy: 'auto',
    batteryStoredLowCarbon: 52,
    batteryStoredFossil: 13,
  });
});

test('current state serializes and hydrates every redesign state group', () => {
  const state = new GameState();
  expect(SAVE_VERSION).toBe(8);
  state.progression.chapter = 3;
  state.progression.objectiveSetId = 'resilience';
  state.expansion.phase = 1;
  state.events.activeId = 'heatwave-1';
  state.operationalRisk.negativeCreditDays = 4;
  state.emergencySupport.used = true;
  state.decisionCounts.modeChanges = 2;

  const restored = new GameState();
  expect(restored.hydrate(state.serialize())).toBe(true);
  expect(restored.progression).toMatchObject({ chapter: 3, objectiveSetId: 'resilience' });
  expect(restored.expansion.phase).toBe(1);
  expect(restored.events.activeId).toBe('heatwave-1');
  expect(restored.operationalRisk.negativeCreditDays).toBe(4);
  expect(restored.emergencySupport.used).toBe(true);
  expect(restored.decisionCounts.modeChanges).toBe(2);
});

test('the full migration chain passes through v6 and ends at v8', () => {
  const migrated = migrateSaveData(v5Save());
  expect(migrated.v).toBe(8);
});

test('v6 state and migrated payloads omit obsolete diagnosis state', () => {
  const migrated = migrateSaveData(v5Save({
    diagnosisFound: [1, 2],
    diagnosisHintUsed: true,
    diagnosisScannerActive: false,
  }));
  const state = new GameState();

  for (const key of ['diagnosisFound', 'diagnosisHintUsed', 'diagnosisScannerActive']) {
    expect(migrated).not.toHaveProperty(key);
    expect(state).not.toHaveProperty(key);
    expect(state.serialize()).not.toHaveProperty(key);
  }
});
