import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  applySimulationQuestProgress,
  claimCurrentQuest,
  evaluateCurrentQuest,
  requestEmergencySupport,
  stageForQuest,
} from '../../../src/systems/QuestSystem.js';
import { createHexCoordinates, neighborIndices } from '../../../src/systems/HexGridSystem.js';
import { QUESTS } from '../../../src/core/QuestDefinitions.js';
import { CAMPAIGN_QUEST_INDEXES } from '../../../src/core/CampaignProgression.js';
import { FACILITIES, STAGES, STRESS_TEST_RULES } from '../../../src/core/Constants.js';
import { validatePlacement } from '../../../src/systems/BoardSystem.js';
import { assessConstructionPlan } from '../../../src/systems/ConstructionPlanSystem.js';
import { createBuildProject } from '../../../src/systems/ConstructionProjectSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';

const powered = (ratio = 1) => ({ demand: 2, delivered: 2 * ratio, ratio });
const summary = (overrides = {}) => ({
  netCredits: 1,
  dailyCarbon: 4,
  dailyWater: 4,
  lowCarbonPercent: 80,
  deliveredPower: 10,
  demand: 8,
  batteryStored: 6,
  facilityPower: {},
  facilityEconomy: {},
  routes: [],
  ...overrides,
});

test('quest one becomes ready with two completed homes and claims its reward once', () => {
  const state = new GameState();
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };

  expect(evaluateCurrentQuest(state).ready).toBe(true);
  const before = state.credits;
  expect(claimCurrentQuest(state)).toMatchObject({
    ok: true,
    unlockedFacilities: ['factory', 'thermal'],
    nextQuest: 2,
  });
  expect(state.credits).toBe(before + 4);
  expect(state.unlockedFacilities.has('factory')).toBe(true);
  expect(state.unlockedFacilities.has('thermal')).toBe(true);
  expect(claimCurrentQuest(state)).toMatchObject({ ok: false });
  expect(state.credits).toBe(before + 4);
});

test('unfinished home construction does not satisfy the first quest', () => {
  const state = new GameState();
  state.grid[0] = {
    type: 'residential', level: 1,
    project: createBuildProject({ type: 'residential', paidCost: 2 }),
  };
  state.grid[1] = {
    type: 'residential', level: 1,
    project: createBuildProject({ type: 'residential', paidCost: 2 }),
  };
  expect(evaluateCurrentQuest(state).ready).toBe(false);
});

test('quest two requires an adjacent profitable factory and thermal pair for two days', () => {
  const state = new GameState();
  const thermalIndex = neighborIndices(0, createHexCoordinates(2))[0];
  state.questIndex = 2;
  state.grid[0] = { type: 'factory', level: 1 };
  state.grid[thermalIndex] = { type: 'thermal', level: 1 };
  const operating = summary({
    facilityPower: { 0: powered(0.6) },
    facilityEconomy: { 0: { operationRatio: 0.6, income: 1 } },
  });

  applySimulationQuestProgress(state, operating);
  expect(state.questProgress.consecutiveDays).toBe(1);
  applySimulationQuestProgress(state, summary({
    facilityPower: { 0: powered(0.6) },
    facilityEconomy: { 0: { operationRatio: 0.6, income: 0 } },
  }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  applySimulationQuestProgress(state, operating);
  applySimulationQuestProgress(state, operating);
  expect(state.questStatus).toBe('ready_to_claim');

  const separated = new GameState();
  separated.questIndex = 2;
  separated.grid[0] = { type: 'factory', level: 1 };
  separated.grid[18] = { type: 'thermal', level: 1 };
  applySimulationQuestProgress(separated, operating);
  applySimulationQuestProgress(separated, operating);
  expect(separated.questStatus).toBe('active');
});

test('quest three becomes ready only after the first green space is completed', () => {
  const state = new GameState();
  state.questIndex = 3;
  expect(evaluateCurrentQuest(state).ready).toBe(false);
  state.grid[0] = { type: 'green', level: 1 };
  expect(evaluateCurrentQuest(state).ready).toBe(true);
});

test('quest four keeps the powered data-center two-day gate', () => {
  const state = new GameState();
  state.questIndex = 4;
  state.grid[0] = { type: 'data', level: 1 };
  const tick = summary({ facilityPower: { 0: powered(0.95) } });
  applySimulationQuestProgress(state, tick);
  expect(state.questStatus).toBe('active');
  applySimulationQuestProgress(state, tick);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest five is a reachable daily transition gate and no quest is quiz-only', () => {
  expect(QUESTS.filter((quest) => quest.progressKind === 'quiz')).toEqual([]);
  expect(QUESTS[4]).toMatchObject({ index: 5, progressKind: 'days', quizKind: null });
  const state = new GameState();
  state.questIndex = 5;
  state.grid[0] = { type: 'nuclear', level: 1 };

  applySimulationQuestProgress(state, summary({ dailyCarbon: 12, lowCarbonPercent: 39 }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  applySimulationQuestProgress(state, summary({ dailyCarbon: 12.1, lowCarbonPercent: 60 }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  applySimulationQuestProgress(state, summary({ dailyCarbon: 12, lowCarbonPercent: 40 }));
  applySimulationQuestProgress(state, summary({ dailyCarbon: 12, lowCarbonPercent: 40 }));
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest six completes when powered adjacent data and cooling keep water at baseline', () => {
  expect(QUESTS[5]).toMatchObject({ index: 6, id: 'water-cycle', progressKind: 'days' });
  const state = new GameState();
  const coolingIndex = neighborIndices(0, createHexCoordinates(2))[0];
  state.questIndex = 6;
  state.baseline = { dailyWater: 5 };
  state.grid[0] = { type: 'data', level: 1 };
  state.grid[coolingIndex] = { type: 'cooling', level: 1 };
  const operating = summary({
    dailyWater: 5,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.95) },
  });

  applySimulationQuestProgress(state, operating);
  applySimulationQuestProgress(state, operating);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest six accepts every available cooling direction adjacent to data after nuclear adds water', () => {
  const coords = createHexCoordinates(2);
  const dataIndex = 0;
  const nuclearIndex = 1;
  const thermalIndex = 7;
  const coolingIndices = neighborIndices(dataIndex, coords).filter((index) => index !== nuclearIndex);

  for (const coolingIndex of coolingIndices) {
    const state = new GameState();
    state.questIndex = 6;
    state.baseline = { dailyWater: 7 };
    state.grid = Array(19).fill(null);
    state.grid[dataIndex] = { type: 'data', level: 1, priority: 'normal' };
    state.grid[nuclearIndex] = { type: 'nuclear', level: 1, priority: 'normal' };
    state.grid[thermalIndex] = { type: 'thermal', level: 1, priority: 'normal' };
    state.grid[coolingIndex] = { type: 'cooling', level: 1, priority: 'essential' };

    for (let day = 0; day < 2; day += 1) {
      const power = calculatePowerNetwork({ grid: state.grid, coords });
      const economy = settleEconomy({
        grid: state.grid,
        coords,
        facilityPower: power.facilityPower,
        credits: state.credits,
      });
      applySimulationQuestProgress(state, {
        ...economy,
        facilityPower: power.facilityPower,
        routes: power.routes,
        lowCarbonPercent: power.lowCarbonPercent,
        deliveredPower: power.delivered,
        demand: power.demand,
        batteryStored: 0,
      });
    }

    expect(
      state.questStatus,
      `cooling index ${coolingIndex} is one hex from data and must not depend on its angle to nuclear`,
    ).toBe('ready_to_claim');
  }
});

test('quest six resets when cooling is separated, underpowered, or above baseline water', () => {
  const state = new GameState();
  const coolingIndex = neighborIndices(0, createHexCoordinates(2))[0];
  state.questIndex = 6;
  state.baseline = { dailyWater: 5 };
  state.grid[0] = { type: 'data', level: 1 };
  state.grid[coolingIndex] = { type: 'cooling', level: 1 };
  applySimulationQuestProgress(state, summary({
    dailyWater: 6,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.95) },
  }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  applySimulationQuestProgress(state, summary({
    dailyWater: 5,
    facilityPower: { 0: powered(0.95), [coolingIndex]: powered(0.5) },
  }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  state.grid[coolingIndex] = null;
  state.grid[18] = { type: 'cooling', level: 1 };
  applySimulationQuestProgress(state, summary({
    dailyWater: 5,
    facilityPower: { 0: powered(0.95), 18: powered(0.95) },
  }));
  expect(state.questProgress.consecutiveDays).toBe(0);
});

test('quest seven completes only after high-efficiency solar research', () => {
  const state = new GameState();
  state.questIndex = 7;
  expect(evaluateCurrentQuest(state).ready).toBe(false);
  state.research.completedIds.add('solar2');
  expect(evaluateCurrentQuest(state).ready).toBe(true);
});

test('quest eight requires a completed level-two data center and smart-grid research', () => {
  const state = new GameState();
  state.questIndex = 8;
  state.research.completedIds.add('smartGrid');
  state.grid[0] = {
    type: 'data',
    level: 1,
    project: createBuildProject({ type: 'data', paidCost: 6 }),
  };
  expect(evaluateCurrentQuest(state).ready).toBe(false);
  state.grid[0] = { type: 'data', level: 2 };
  expect(evaluateCurrentQuest(state).ready).toBe(true);
});

test('a state quest that loses its condition stops being claimable', () => {
  const state = new GameState();
  state.questIndex = CAMPAIGN_QUEST_INDEXES.SECOND_EXPANSION_QUEST;
  state.research.completedIds.add('smartGrid');
  state.grid[0] = { type: 'data', level: 2 };
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  expect(state.questStatus).toBe('ready_to_claim');

  state.grid[0] = null;
  expect(evaluateCurrentQuest(state).ready).toBe(false);
  expect(state.questStatus).toBe('active');
  expect(claimCurrentQuest(state)).toMatchObject({ ok: false, reason: 'not_ready' });

  state.grid[0] = { type: 'data', level: 2 };
  expect(evaluateCurrentQuest(state).ready).toBe(true);
  expect(claimCurrentQuest(state)).toMatchObject({ ok: true });
});

test('a consecutive-day quest keeps its earned readiness after a single bad day', () => {
  const state = new GameState();
  state.questIndex = 4;
  state.grid[0] = { type: 'data', level: 1 };
  const tick = summary({ facilityPower: { 0: powered(0.95) } });
  applySimulationQuestProgress(state, tick);
  applySimulationQuestProgress(state, tick);
  expect(state.questStatus).toBe('ready_to_claim');

  applySimulationQuestProgress(state, summary({ facilityPower: { 0: powered(0.1) } }));
  expect(state.questProgress.consecutiveDays).toBe(0);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest nine requires completed wind research and real wind delivery for two consecutive days', () => {
  const state = new GameState();
  state.questIndex = 9;
  state.grid[0] = { type: 'wind', level: 1 };
  const delivered = summary({ routes: [{ from: 0, to: 1, delivered: 0.1 }] });

  applySimulationQuestProgress(state, delivered);
  expect(state.questProgress.consecutiveDays).toBe(0);
  state.research.completedIds.add('wind2');
  applySimulationQuestProgress(state, delivered);
  applySimulationQuestProgress(state, delivered);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('quest ten requires completed tidal research, an operational plant, and real delivery for two days', () => {
  const state = new GameState();
  state.questIndex = 10;
  state.research.completedIds.add('tidal1');
  state.grid[0] = {
    type: 'tidal',
    level: 1,
    project: createBuildProject({ type: 'tidal', paidCost: 7 }),
  };
  const delivered = summary({ routes: [{ from: 0, to: 1, delivered: 1 }] });

  applySimulationQuestProgress(state, delivered);
  expect(state.questProgress.consecutiveDays).toBe(0);
  state.grid[0] = { type: 'tidal', level: 1 };
  applySimulationQuestProgress(state, delivered);
  applySimulationQuestProgress(state, delivered);
  expect(state.questStatus).toBe('ready_to_claim');
});

test('the final test keeps the board editable so its construction cost rule applies', () => {
  const state = new GameState();
  state.questIndex = CAMPAIGN_QUEST_INDEXES.FINAL_TEST;
  state.stage = stageForQuest(state.questIndex);
  state.stressTest.status = 'running';

  expect(state.isEditable).toBe(true);
  expect(validatePlacement(state, 'residential', 1)).toMatchObject({ ok: true });

  state.constructionPlan = [{ index: 1, type: 'residential' }];
  expect(assessConstructionPlan(state).totalCost).toBeCloseTo(
    FACILITIES.residential.cost * STRESS_TEST_RULES.CONSTRUCTION_COST_MULTIPLIER,
    2,
  );
});

test('claiming the final quest closes the campaign and locks the board into the report stage', () => {
  const state = new GameState();
  state.questIndex = CAMPAIGN_QUEST_INDEXES.FINAL_TEST;
  state.stage = stageForQuest(state.questIndex);
  state.questStatus = 'ready_to_claim';

  expect(claimCurrentQuest(state)).toMatchObject({ ok: true, campaignComplete: true, nextQuest: null });
  expect(state.stage).toBe(STAGES.REPORT);
  expect(state.isEditable).toBe(false);
});

test('emergency support is limited to once per campaign at one credit or less', () => {
  const state = new GameState();
  state.credits = 1;
  expect(requestEmergencySupport(state)).toEqual({ ok: true, credits: 5 });
  expect(requestEmergencySupport(state)).toEqual({ ok: false, reason: 'already_used' });
});
