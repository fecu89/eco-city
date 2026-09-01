import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import { migrateSaveData, migrateV8ToV9 } from '../../../src/systems/SaveSystem.js';

function v8Save(overrides = {}) {
  const serialized = new GameState().serialize();
  return {
    ...serialized,
    v: 8,
    ...overrides,
  };
}

test('v9 keeps foundation progress unchanged', () => {
  const migrated = migrateV8ToV9(v8Save({
    questIndex: 6,
    questStatus: 'ready_to_claim',
    questProgress: { consecutiveDays: 2 },
  }));

  expect(migrated).toMatchObject({
    v: 9,
    questIndex: 6,
    questStatus: 'ready_to_claim',
    questProgress: { consecutiveDays: 2 },
  });
});

test('an unfinished first climate campaign restarts at preparation quest seven without losing the city', () => {
  const migrated = migrateV8ToV9(v8Save({
    questIndex: 7,
    questStatus: 'active',
    credits: 37.25,
    grid: [
      { type: 'battery', level: 2, project: null, batteryStoredLowCarbon: 8, batteryStoredFossil: 2 },
      { type: 'data', level: 1, project: { kind: 'upgrade', fromLevel: 1, toLevel: 2, durationDays: 8, elapsedDays: 3, paidCost: 6 } },
    ],
    questProgress: { consecutiveDays: 2 },
    events: {
      seed: 1,
      schedule: [{ id: 'climate-q7-a1', type: 'heatwave', startAt: 24, endAt: 30 }],
      activeId: 'climate-q7-a1',
      completed: [],
      forecastAcknowledgedIds: ['climate-q7-a1'],
      currentMetrics: { days: 1 },
    },
    climateCampaign: {
      status: 'active', eventType: 'heatwave', attempt: 1, scheduledEventId: 'climate-q7-a1',
      progress: { consecutiveDays: 2 }, lastResult: null, completedEventTypes: [],
    },
    research: {
      jobs: { solar2: { id: 'solar2', dataCenterIndex: 1, elapsedEffectiveDays: 30, paidCost: 10 } },
      completedIds: ['smartGrid'],
      techLevels: { solar: 2, wind: 1, battery: 2, tidal: 0, green: 1 },
      quizAccelerationBankDays: 0,
      quizCreditQuestionIds: { solar2: ['solar-angle'] },
    },
  }));

  expect(migrated).toMatchObject({
    v: 9,
    questIndex: 7,
    questStatus: 'active',
    questProgress: {},
    credits: 37.25,
    climateCampaign: {
      status: 'locked', eventType: null, attempt: 0, scheduledEventId: null,
      progress: {}, lastResult: null, completedEventTypes: [],
    },
    events: { schedule: [], activeId: null, forecastAcknowledgedIds: [], currentMetrics: null },
  });
  expect(migrated.grid[0]).toMatchObject({
    type: 'battery', level: 2, batteryStoredLowCarbon: 8, batteryStoredFossil: 2,
  });
  expect(migrated.grid[1].project).toMatchObject({ kind: 'upgrade', elapsedDays: 3, durationDays: 8 });
  expect(migrated.research).toMatchObject({
    jobs: { solar2: { elapsedEffectiveDays: 30 } },
    completedIds: ['smartGrid'],
    techLevels: { solar: 2, battery: 2 },
    quizCreditQuestionIds: { solar2: ['solar-angle'] },
  });
});

test('completed climate progress shifts the active climate cursor by four and keeps its attempt', () => {
  const migrated = migrateV8ToV9(v8Save({
    questIndex: 8,
    questStatus: 'active',
    claimedQuestIds: ['extreme-heat'],
    climateCampaign: {
      status: 'preparation', eventType: 'monsoon', attempt: 2, scheduledEventId: 'climate-q8-a2',
      progress: { consecutiveDays: 1, batteryEnergy: 2 }, lastResult: null,
      completedEventTypes: ['heatwave'],
    },
    events: {
      seed: 1,
      schedule: [{ id: 'climate-q8-a2', source: 'campaign', type: 'monsoon', startAt: 42, endAt: 48 }],
      activeId: null, completed: [], forecastAcknowledgedIds: [], currentMetrics: null,
    },
  }));

  expect(migrated).toMatchObject({
    v: 9,
    questIndex: 12,
    claimedQuestIds: ['extreme-heat'],
    climateCampaign: {
      status: 'preparation', eventType: 'monsoon', attempt: 2,
      progress: { consecutiveDays: 1, batteryEnergy: 2 }, completedEventTypes: ['heatwave'],
    },
  });
  expect(migrated.events.schedule).toHaveLength(1);
});

test('old final-test and completed campaign saves move to quest nineteen', () => {
  const ready = migrateV8ToV9(v8Save({
    questIndex: 15,
    stressTest: { status: 'ready', phaseIndex: 0, phaseDay: 0, result: null },
  }));
  expect(ready).toMatchObject({ v: 9, questIndex: 19, campaignComplete: false, stressTest: { status: 'ready' } });

  const completed = migrateSaveData(v8Save({
    questIndex: 15,
    questStatus: 'claimed',
    campaignComplete: true,
    stressTest: { status: 'passed', phaseIndex: 8, phaseDay: 0, result: { passed: true } },
  }));
  expect(completed).toMatchObject({
    v: 9,
    questIndex: 19,
    questStatus: 'claimed',
    campaignComplete: true,
    stressTest: { status: 'passed', result: { passed: true } },
  });
  expect(SAVE_VERSION).toBe(9);
});
