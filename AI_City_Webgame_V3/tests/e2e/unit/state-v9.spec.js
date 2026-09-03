import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION } from '../../../src/core/GameState.js';
import { BOARD, STAGES } from '../../../src/core/Constants.js';
import { CAMPAIGN_QUEST_INDEXES, PREPARATION_QUEST_IDS } from '../../../src/core/CampaignProgression.js';
import { migrateSaveData, migrateV8ToV9 } from '../../../src/systems/SaveSystem.js';
import { listResearchAvailability } from '../../../src/systems/ResearchSystem.js';
import { advanceCityEvents } from '../../../src/systems/CityEventSystem.js';

function v8Save(overrides = {}) {
  const serialized = new GameState().serialize();
  return {
    ...serialized,
    v: 8,
    ...overrides,
  };
}

function hydrated(save) {
  const state = new GameState();
  expect(state.hydrate(migrateSaveData(save))).toBe(true);
  return state;
}

function reasonCodesFor(state, researchId) {
  return listResearchAvailability(state).find(({ id }) => id === researchId).reasonCodes;
}

const FOUNDATION_UNLOCKS = ['residential', 'factory', 'thermal', 'green', 'data', 'nuclear', 'cooling'];

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
    // 기후전으로 옮겨진 저장은 건너뛴 준비 퀘스트 4개를 완료한 것으로 채워진다(H3).
    claimedQuestIds: ['extreme-heat', ...PREPARATION_QUEST_IDS],
    climateCampaign: {
      status: 'preparation', eventType: 'monsoon', attempt: 2,
      progress: { consecutiveDays: 1, batteryEnergy: 2 }, completedEventTypes: ['heatwave'],
    },
  });
  expect(migrated.events.schedule).toHaveLength(1);
});

test('a save moved into the climate campaign carries the preparation rewards it skipped', () => {
  const state = hydrated(v8Save({
    questIndex: 8,
    expansion: {
      phase: 1,
      firstChoice: 'east',
      activeCellIndices: Array.from({ length: 28 }, (_, index) => index),
    },
    unlockedFacilities: [...FOUNDATION_UNLOCKS, 'solar'],
    climateCampaign: {
      status: 'preparation', eventType: 'monsoon', attempt: 1, scheduledEventId: null,
      progress: {}, lastResult: null, completedEventTypes: ['heatwave'],
    },
    research: {
      jobs: {}, completedIds: [], techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0, green: 1 },
      quizAccelerationBankDays: 0, quizCreditQuestionIds: {},
    },
  }));

  expect(state.questIndex).toBe(12);
  expect(PREPARATION_QUEST_IDS.every((id) => state.claimedQuestIds.has(id))).toBe(true);
  expect(['battery', 'solar', 'wind'].every((type) => state.unlockedFacilities.has(type))).toBe(true);
  // 7단계 보상은 Lv.2 강화 허가다. 완료로 채워 넣었으면 허가도 함께 와야 한다.
  expect(state.upgradePermitLevel).toBe(2);
  expect(state.expansion.phase).toBe(2);
  expect(state.expansion.activeCellIndices).toHaveLength(BOARD.MAX_CELLS);
  expect(state.boardRadius).toBe(BOARD.EXPANDED_RADIUS);
  expect(state.grid).toHaveLength(BOARD.EXPANDED_CELLS);
  expect(reasonCodesFor(state, 'tidal1')).not.toContain('quest:wind-pilot-grid');
});

test('a west-branch save keeps the renewable its first expansion unlocked', () => {
  const state = hydrated(v8Save({
    questIndex: 7,
    expansion: {
      phase: 1,
      firstChoice: 'west',
      activeCellIndices: Array.from({ length: 28 }, (_, index) => index),
    },
    unlockedFacilities: [...FOUNDATION_UNLOCKS],
    climateCampaign: {
      status: 'briefing', eventType: null, attempt: 0, scheduledEventId: null,
      progress: {}, lastResult: null, completedEventTypes: [],
    },
  }));

  expect(state.questIndex).toBe(7);
  expect(state.expansion.phase).toBe(1);
  expect(state.unlockedFacilities.has('wind')).toBe(true);
  expect(state.unlockedFacilities.has('solar')).toBe(false);
  expect(reasonCodesFor(state, 'wind2')).not.toContain('facility:wind');
});

test('a final-exam save written under the old report stage reopens its board on load', () => {
  const source = new GameState();
  source.questIndex = CAMPAIGN_QUEST_INDEXES.FINAL_TEST;
  source.stage = STAGES.REPORT;
  const payload = source.serialize();

  const running = new GameState();
  expect(running.hydrate({ ...payload, campaignComplete: false })).toBe(true);
  expect(running.stage).toBe(STAGES.REDESIGN);
  expect(running.isEditable).toBe(true);

  const finished = new GameState();
  expect(finished.hydrate({ ...payload, campaignComplete: true })).toBe(true);
  expect(finished.stage).toBe(STAGES.REPORT);
  expect(finished.isEditable).toBe(false);
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
    v: 10,
    questIndex: 19,
    questStatus: 'claimed',
    campaignComplete: true,
    stressTest: { status: 'passed', result: { passed: true } },
  });
  expect(SAVE_VERSION).toBe(10);
});

// 기후전 구간(11~18)에서는 캠페인이 이벤트 일정을 소유한다(campaignOwnsSchedule). v8의
// climateCampaign.status는 'locked'일 수 있고 그대로 옮기면 캠페인이 일정을 놓아 버려
// 무작위 이벤트 덱이 기후 퀘스트 위에 겹쳐 깔린다.
test('기후전 구간으로 옮겨진 저장은 브리핑 상태로 정규화되어 캠페인이 일정을 소유한다', () => {
  const save = v8Save({
    questIndex: 9,
    climateCampaign: {
      status: 'locked',
      eventType: 'drought',
      attempt: 2,
      scheduledEventId: 'stale-1',
      progress: { days: 3 },
      lastResult: null,
      completedEventTypes: ['heatwave'],
    },
  });

  const migrated = migrateV8ToV9(save);
  expect(migrated.questIndex).toBe(13);
  expect(migrated.climateCampaign).toMatchObject({
    status: 'briefing',
    eventType: null,
    scheduledEventId: null,
    progress: {},
    attempt: 2,
    completedEventTypes: ['heatwave'],
  });

  const state = hydrated(save);
  expect(state.climateCampaign.status).toBe('briefing');
  expect(state.events.schedule).toEqual([]);
  // 캠페인이 일정을 소유하므로 무작위 덱을 새로 만들지 않는다.
  advanceCityEvents(state);
  expect(state.events.schedule).toEqual([]);
  expect(state.events.activeId).toBe(null);
});
