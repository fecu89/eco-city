import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { expandBoard } from '../../../src/systems/BoardSystem.js';
import {
  claimObjectiveSet,
  evaluateObjectiveSet,
  startObjectiveCampaign,
} from '../../../src/systems/ObjectiveSystem.js';
import { createBuildProject } from '../../../src/systems/ConstructionProjectSystem.js';

const summary = (overrides = {}) => ({
  netCredits: 0,
  dailyCarbon: 10,
  dailyWater: 5,
  lowCarbonPercent: 0,
  transmissionEfficiency: 100,
  employmentRate: 0,
  batteryStored: 0,
  facilityPower: {},
  ...overrides,
});

function expandedState(side = 'east') {
  const state = new GameState();
  state.credits = 20;
  state.progression.tutorialQuestIndex = 6;
  state.progression.tutorialQuestStatus = 'complete';
  expandBoard(state, side);
  startObjectiveCampaign(state);
  return state;
}

test('transition set requires any two of three sustained goals', () => {
  const state = expandedState();
  let result;
  for (let hour = 0; hour < 3; hour += 1) {
    result = evaluateObjectiveSet(state, summary({ lowCarbonPercent: 45, dailyCarbon: 9, netCredits: 1 }));
  }
  expect(result).toMatchObject({ setId: 'transition-choice', completedCount: 2, required: 2, ready: true });
  expect(result.cards.find(({ id }) => id === 'transition-economy').completed).toBe(false);
});

test('claiming transition reward pays once, unlocks operations, and opens the second side', () => {
  const state = expandedState('west');
  for (let hour = 0; hour < 3; hour += 1) {
    evaluateObjectiveSet(state, summary({ lowCarbonPercent: 50, netCredits: 5, dailyCarbon: 15 }));
  }
  const before = state.credits;
  const result = claimObjectiveSet(state);
  expect(result).toMatchObject({ ok: true, reward: { credits: 8 }, nextSetId: 'specialization' });
  expect(state.credits).toBe(before + 8);
  expect(state.unlockedFacilities.has('battery')).toBe(true);
  expect(state.unlockedFacilities.has('wind')).toBe(true);
  expect(state.upgradePermitLevel).toBe(2);
  expect(state.expansion).toMatchObject({ phase: 2, firstChoice: 'west' });
  expect(state.expansion.activeCellIndices).toHaveLength(37);
  expect(claimObjectiveSet(state)).toMatchObject({ ok: false, reason: 'not_ready' });
});

test('specialization offers technology, grid, and citizen paths but requires only two', () => {
  const state = expandedState();
  state.progression.objectiveSetId = 'specialization';
  state.progression.objectiveProgress = {};
  state.research.completedIds.add('solar2');
  state.grid[0] = { type: 'solar', level: 2, priority: 'normal', operationMode: 'normal' };
  let result;
  for (let hour = 0; hour < 3; hour += 1) {
    result = evaluateObjectiveSet(state, summary({ transmissionEfficiency: 92, employmentRate: 0.2 }));
  }
  expect(result).toMatchObject({ completedCount: 2, required: 2, ready: true });
  expect(result.cards.find(({ id }) => id === 'specialization-citizen').completed).toBe(false);
  expect(claimObjectiveSet(state)).toMatchObject({ ok: true, reward: { credits: 10 }, nextSetId: 'resilience' });
});

test('unfinished essential facilities do not dilute objective supply evaluation', () => {
  const state = expandedState();
  state.progression.objectiveSetId = 'specialization';
  state.progression.objectiveProgress = {};
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  state.grid[1] = {
    type: 'residential',
    level: 1,
    priority: 'essential',
    project: createBuildProject({ type: 'residential', paidCost: 2 }),
  };

  let result;
  for (let hour = 0; hour < 3; hour += 1) {
    result = evaluateObjectiveSet(state, summary({ employmentRate: 0.9, facilityPower: { 0: { ratio: 1 } } }));
  }

  expect(result.cards.find(({ id }) => id === 'specialization-citizen').completed).toBe(true);
});

test('resilience set passes with three of four independent strategies and readies stress test', () => {
  const state = expandedState();
  state.progression.objectiveSetId = 'resilience';
  state.progression.objectiveProgress = {};
  state.research.completedIds.add('renewable3');
  let result;
  for (let hour = 0; hour < 4; hour += 1) {
    result = evaluateObjectiveSet(state, summary({
      netCredits: 1,
      lowCarbonPercent: 75,
      dailyWater: 6,
      waterLimit: 8,
    }));
  }
  expect(result).toMatchObject({ completedCount: 3, required: 3, ready: true });
  expect(claimObjectiveSet(state)).toMatchObject({
    ok: true,
    reward: { credits: 12 },
    nextSetId: null,
    chapterChanged: true,
  });
  expect(state.stressTest.status).toBe('ready');
  expect(state.progression.chapter).toBe(4);
});
