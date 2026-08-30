import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';

const PlanSystem = await import('../../../src/systems/ConstructionPlanSystem.js').catch(() => ({}));
const {
  assessConstructionPlan,
  clearConstructionPlan,
  commitConstructionPlan,
  removePlannedFacility,
  upsertPlannedFacility,
} = PlanSystem;

function preparedState(questIndex, credits, unlocked) {
  const state = new GameState();
  state.questIndex = questIndex;
  state.credits = credits;
  state.unlockedFacilities = new Set(unlocked);
  return state;
}

test('plan supports mixed add, replace, toggle removal, and cumulative cost', () => {
  const state = preparedState(5, 30, ['residential', 'thermal', 'factory']);
  upsertPlannedFacility(state, 'residential', 0);
  upsertPlannedFacility(state, 'thermal', 1);
  expect(assessConstructionPlan(state)).toMatchObject({ ok: true, totalCost: 7, projectedCredits: 23 });

  upsertPlannedFacility(state, 'factory', 0);
  expect(state.constructionPlan).toEqual([{ index: 0, type: 'factory' }, { index: 1, type: 'thermal' }]);
  upsertPlannedFacility(state, 'factory', 0);
  expect(state.constructionPlan).toEqual([{ index: 1, type: 'thermal' }]);
});

test('remove and clear operations never touch committed city cells', () => {
  const state = preparedState(5, 30, ['residential', 'thermal']);
  state.grid[5] = { type: 'residential', level: 1 };
  state.constructionPlan = [{ index: 0, type: 'residential' }, { index: 1, type: 'thermal' }];
  expect(removePlannedFacility(state, 0).items).toEqual([{ index: 1, type: 'thermal' }]);
  expect(clearConstructionPlan(state).items).toEqual([]);
  expect(state.grid[5]).toEqual({ type: 'residential', level: 1 });
});

test('one unaffordable item makes the entire batch commit atomic', () => {
  const state = preparedState(2, 6, ['residential', 'thermal']);
  state.constructionPlan = [{ index: 0, type: 'residential' }, { index: 1, type: 'thermal' }];
  const beforeGrid = state.grid.map((cell) => cell && { ...cell });
  const result = commitConstructionPlan(state);
  expect(result).toMatchObject({ ok: false, reason: 'invalid_plan' });
  expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'insufficient_credits' })]));
  expect(state.grid).toEqual(beforeGrid);
  expect(state.credits).toBe(6);
  expect(state.constructionPlan).toHaveLength(2);
});

test('nuclear and its thermal reserve can be queued in either order', () => {
  const state = preparedState(5, 30, ['nuclear', 'thermal']);
  state.constructionPlan = [{ index: 0, type: 'nuclear' }, { index: 1, type: 'thermal' }];
  expect(assessConstructionPlan(state)).toMatchObject({ ok: true, totalCost: 13 });
  expect(commitConstructionPlan(state)).toMatchObject({ ok: true, totalCost: 13 });
  expect(state.grid[0]?.type).toBe('nuclear');
  expect(state.grid[1]?.type).toBe('thermal');
});

test('successful commit writes every planned facility and charges once', () => {
  const state = preparedState(5, 30, ['residential', 'thermal']);
  state.constructionPlan = [{ index: 0, type: 'residential' }, { index: 1, type: 'thermal' }];
  const result = commitConstructionPlan(state);
  expect(result).toMatchObject({ ok: true, totalCost: 7 });
  expect(result.placements).toHaveLength(2);
  expect(state.credits).toBe(23);
  expect(state.turn).toBe(2);
  expect(state.constructionPlan).toEqual([]);
});
