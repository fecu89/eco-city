import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { CAMPAIGN_PACING } from '../../../src/core/Constants.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import {
  applySimulationQuestProgress,
  claimCurrentQuest,
  evaluateCurrentQuest,
} from '../../../src/systems/QuestSystem.js';
import { acknowledgeClimateBriefing } from '../../../src/systems/ClimateQuestSystem.js';
import { startStressTest } from '../../../src/systems/StressTestSystem.js';

const settleDay = createDaySettler({
  calculatePowerNetwork,
  settleEconomy,
  evaluateQuest: applySimulationQuestProgress,
});

function facility(type, level = 1, extra = {}) {
  return {
    type,
    level,
    priority: ['residential', 'cooling'].includes(type) ? 'essential' : 'normal',
    operationMode: 'normal',
    ...extra,
  };
}

function place(state, placements, { clear = false } = {}) {
  if (clear) state.grid = Array(state.grid.length).fill(null);
  placements.forEach(([index, type, level = 1, extra = {}]) => {
    state.grid[index] = facility(type, level, extra);
  });
}

function settleDays(state, days) {
  for (let day = 0; day < days; day += 1) {
    settleDay(state);
    expect(state.gameOver, `day ${state.elapsedGameDays}: ${state.gameOverReason}`).toBe(false);
  }
}

function settleUntilReady(state, maximumDays = 48) {
  for (let day = 0; day < maximumDays && state.questStatus !== 'ready_to_claim'; day += 1) {
    settleDays(state, 1);
  }
  expect(state.questStatus, `quest ${state.questIndex}: ${JSON.stringify(state.questProgress)}`).toBe('ready_to_claim');
}

function claim(state, expectedQuest) {
  expect(state.questIndex).toBe(expectedQuest);
  const result = claimCurrentQuest(state);
  expect(result.ok, `claim quest ${expectedQuest}: ${result.reason}`).toBe(true);
  return result;
}

function finishFoundation(state) {
  place(state, [[1, 'residential'], [2, 'residential']]);
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  claim(state, 1);

  place(state, [[13, 'thermal'], [4, 'factory']]);
  settleUntilReady(state);
  claim(state, 2);

  place(state, [[8, 'green']]);
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  claim(state, 3);

  place(state, [[0, 'data'], [3, 'residential'], [7, 'residential'], [12, 'thermal']]);
  settleUntilReady(state);
  claim(state, 4);

  state.grid[12] = null;
  place(state, [[5, 'nuclear']]);
  settleUntilReady(state);
  claim(state, 5);

  place(state, [[6, 'cooling']]);
  settleUntilReady(state);
  claim(state, 6);

  expect(state).toMatchObject({
    questIndex: 7,
    questStatus: 'active',
    climateCampaign: { status: 'locked' },
    progression: { chapter: 2 },
  });
}

function finishPreparation(state) {
  state.research.completedIds.add('solar2');
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  claim(state, 7);

  state.grid[0].level = 2;
  state.research.completedIds.add('smartGrid');
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  claim(state, 8);

  place(state, [[9, 'wind']]);
  state.research.completedIds.add('wind2');
  const windSummary = { routes: [{ from: 9, to: 1, delivered: 1 }] };
  applySimulationQuestProgress(state, windSummary);
  applySimulationQuestProgress(state, windSummary);
  claim(state, 9);

  place(state, [[10, 'tidal']]);
  state.research.completedIds.add('tidal1');
  state.unlockedFacilities.add('tidal');
  const tidalSummary = { routes: [{ from: 10, to: 1, delivered: 1 }] };
  applySimulationQuestProgress(state, tidalSummary);
  applySimulationQuestProgress(state, tidalSummary);
  claim(state, 10);

  expect(state).toMatchObject({
    questIndex: 11,
    climateCampaign: { status: 'briefing' },
    progression: { chapter: 3 },
  });
}

const CLIMATE_FIXTURES = Object.freeze({
  11: [
    [0, 'thermal'], [1, 'factory'],
    [2, 'residential'], [3, 'residential'], [4, 'residential'], [5, 'residential'],
  ],
  12: [
    [0, 'thermal'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }], [2, 'data'],
    [3, 'residential'], [4, 'residential'], [5, 'residential'],
    [6, 'residential'], [7, 'residential'], [8, 'residential'],
    [9, 'solar'], [10, 'solar'], [11, 'solar'],
  ],
  13: [
    [0, 'nuclear'], [1, 'thermal'], [2, 'data'], [3, 'factory'],
    [4, 'residential'], [5, 'residential'], [6, 'residential'],
    [7, 'residential'], [8, 'residential'], [9, 'residential'],
  ],
  14: [
    [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
    [2, 'solar'], [3, 'solar'], [4, 'data'], [20, 'factory'],
    [5, 'residential'], [6, 'residential'], [7, 'residential'], [8, 'residential'],
  ],
  15: [
    [0, 'data'], [5, 'nuclear'], [6, 'cooling', 2],
    [1, 'battery', 1, { batteryStoredLowCarbon: 20 }], [2, 'solar'],
    [7, 'residential', 2], [8, 'residential'],
  ],
  16: [
    [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
    [2, 'residential'], [3, 'residential'], [4, 'residential'],
    [5, 'residential'], [6, 'residential'], [7, 'residential'],
  ],
  17: [
    [0, 'nuclear'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
    [2, 'solar'], [3, 'solar'], [4, 'solar'],
    [20, 'factory'], [21, 'factory'], [22, 'data'], [23, 'green', 2],
    [5, 'residential'], [6, 'residential'], [7, 'residential'], [8, 'residential'],
  ],
  18: [
    [19, 'tidal'],
    [20, 'residential'], [7, 'residential'], [36, 'residential'], [8, 'residential'],
  ],
});

function finishClimateCampaign(state) {
  state.boardRadius = 3;
  state.grid = Array(37).fill(null);
  state.expansion.activeCellIndices = Array.from({ length: 37 }, (_, index) => index);
  for (let quest = 11; quest <= 18; quest += 1) {
    place(state, CLIMATE_FIXTURES[quest], { clear: true });
    if (quest === 18) state.research.completedIds.add('tidal1');
    const briefing = acknowledgeClimateBriefing(state);
    expect(briefing.ok, `quest ${quest}: ${briefing.reason}`).toBe(true);
    settleUntilReady(state);
    expect(state.climateCampaign.lastResult).toMatchObject({ passed: true, questIndex: quest });
    claim(state, quest);
  }
}

function stressState(placements) {
  const state = new GameState();
  state.questIndex = 19;
  state.questStatus = 'active';
  state.progression.chapter = 4;
  state.boardRadius = 3;
  state.grid = Array(37).fill(null);
  state.expansion.activeCellIndices = Array.from({ length: 37 }, (_, index) => index);
  state.credits = 500;
  state.claimedQuestIds.add('extreme-heat');
  state.research.completedIds.add('tidal1');
  state.stressTest.status = 'ready';
  place(state, placements);
  return state;
}

function runStress(state) {
  // 실제 플레이처럼 하루를 먼저 정산해 시험 물 기준선이 도시의 진짜 사용량으로 잡히게 한다.
  settleDays(state, 1);
  expect(startStressTest(state)).toMatchObject({ ok: true });
  expect(state.stressTest.waterBaseline).toBe(state.lastTickSummary.dailyWater);
  settleDays(state, 41);
  expect(state.stressTest.status).not.toBe('running');
  return state.stressTest.result;
}

const REFERENCE_CITY = Object.freeze([
  [19, 'tidal'], [1, 'battery', 1, { batteryStoredLowCarbon: 20 }],
  [5, 'nuclear'], [25, 'solar'], [29, 'wind'],
  [0, 'data'], [6, 'cooling'], [4, 'factory'],
  [7, 'residential'], [36, 'residential'], [20, 'residential', 2], [8, 'residential', 2],
  [18, 'green'], [21, 'green'], [9, 'green', 2],
]);

test('one quest cursor advances through four preparation quests and all eight climate events to quest nineteen', () => {
  const state = new GameState();
  state.credits = 500;
  finishFoundation(state);
  finishPreparation(state);
  finishClimateCampaign(state);

  expect(state.questIndex).toBe(19);
  expect(state.stressTest.status).toBe('ready');
  expect(state.climateCampaign.completedEventTypes).toEqual([
    'heatwave', 'monsoon', 'typhoon', 'coldWave',
    'drought', 'stagnantAir', 'dryWildfire', 'stormSurge',
  ]);
  expect(new Set(state.climateCampaign.completedEventTypes).size).toBe(8);
  expect(state.progression.objectiveSetId).toBeNull();
});

test('the 41-day reference city passes without green or residential level three', () => {
  const state = stressState(REFERENCE_CITY);
  const result = runStress(state);

  expect(state.grid.filter((cell) => cell?.type === 'green').map(({ level }) => level).sort()).toEqual([1, 1, 2]);
  expect(state.grid.filter((cell) => cell?.type === 'residential').map(({ level }) => level).sort()).toEqual([1, 1, 2, 2]);
  expect(result, JSON.stringify(result)).toMatchObject({ passed: true, days: 41 });
  // 건조 위기 5일은 데이터센터·핵발전 물을 15% 밀어올린다. 두 시설에 붙은 순환냉각이
  // 그만큼을 되돌려 주기 때문에 기준선을 그대로 지킨다.
  expect(result.waterViolationDays).toBe(0);
  expect(result.tidalEnergyDelivered).toBeGreaterThanOrEqual(8);
  expect(state.campaignComplete).toBe(true);
});

test('the same city fails the dry emergency once its cooling is gone', () => {
  const state = stressState(REFERENCE_CITY.filter(([, type]) => type !== 'cooling'));
  const result = runStress(state);

  // 냉각이 없으면 건조 위기의 +15% 냉각수를 상쇄할 방법이 없어 5일 내내 기준선을 넘는다.
  expect(result, JSON.stringify(result)).toMatchObject({
    passed: false,
    waterViolationDays: 5,
    diagnosis: { id: 'water' },
  });
});

test('green level three cannot rescue a city whose essential power is insufficient', () => {
  const state = stressState([
    [19, 'tidal'], [18, 'green', 3],
    [0, 'residential'], [1, 'residential'], [2, 'residential'], [3, 'residential'],
    [4, 'residential'], [5, 'residential'], [6, 'residential'], [7, 'residential'],
  ]);
  const result = runStress(state);

  expect(result.passed).toBe(false);
  expect(['essential_average', 'essential_floor']).toContain(result.diagnosis.id);
  expect(state.campaignComplete).toBe(false);
  expect(state.grid.some((cell) => cell?.type === 'green' && cell.level === 3)).toBe(true);
});

test('human pacing keeps a fifteen-to-thirty minute target and meaningful decision windows', () => {
  expect(CAMPAIGN_PACING.humanMinutes).toEqual({ min: 15, target: 25, max: 30 });
  expect(CAMPAIGN_PACING.phases[0]).toMatchObject({ startMinute: 0 });
  expect(CAMPAIGN_PACING.phases.at(-1)).toMatchObject({ endMinute: 30 });
  CAMPAIGN_PACING.representativeWindows.forEach((window) => {
    expect(window.endMinute - window.startMinute).toBe(2);
    expect(window.decisions.length).toBeGreaterThanOrEqual(2);
    expect(window.decisions.length).toBeLessThanOrEqual(4);
    expect(new Set(window.decisions).size).toBe(window.decisions.length);
  });
});
