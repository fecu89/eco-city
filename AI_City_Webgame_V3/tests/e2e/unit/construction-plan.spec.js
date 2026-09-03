import { test, expect } from '@playwright/test';
import { GameState, normalizeCell } from '../../../src/core/GameState.js';
import { DIRECTION_RULES, FACILITY_DIRECTIONS } from '../../../src/core/Constants.js';
import { createBuildProject } from '../../../src/systems/ConstructionProjectSystem.js';
import { defaultRotationFor } from '../../../src/systems/EnvironmentSystem.js';

const PlanSystem = await import('../../../src/systems/ConstructionPlanSystem.js').catch(() => ({}));
const {
  assessConstructionPlan,
  clearConstructionPlan,
  commitConstructionPlan,
  removePlannedFacility,
  rotatePlannedFacility,
  upsertPlannedFacility,
} = PlanSystem;

// 계획 항목은 이제 건설 방향(rotation)까지 들고 다닌다.
const planned = (index, type, rotation = defaultRotationFor(type)) => ({ index, type, rotation });

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
  expect(state.constructionPlan).toEqual([planned(0, 'factory'), planned(1, 'thermal')]);
  upsertPlannedFacility(state, 'factory', 0);
  expect(state.constructionPlan).toEqual([planned(1, 'thermal')]);
});

test('a facility over its quest permit is rejected before entering the virtual plan', () => {
  const state = preparedState(1, 30, ['residential']);
  state.constructionPlan = [planned(0, 'residential'), planned(1, 'residential')];

  const result = upsertPlannedFacility(state, 'residential', 2);

  expect(result.rejected).toMatchObject({ reason: 'facility_limit', type: 'residential', limit: 2 });
  expect(state.constructionPlan).toEqual([planned(0, 'residential'), planned(1, 'residential')]);
  expect(result.items).toEqual(state.constructionPlan);
});

test('a rejected replacement preserves the existing planned facility and toggles can still remove it', () => {
  const state = preparedState(2, 30, ['residential', 'factory']);
  state.grid[5] = { type: 'residential', level: 1 };
  state.grid[6] = { type: 'residential', level: 1 };
  state.grid[7] = { type: 'residential', level: 1 };
  state.constructionPlan = [planned(0, 'factory')];

  expect(upsertPlannedFacility(state, 'residential', 0).rejected).toMatchObject({ reason: 'facility_limit' });
  expect(state.constructionPlan).toEqual([planned(0, 'factory')]);
  upsertPlannedFacility(state, 'factory', 0);
  expect(state.constructionPlan).toEqual([]);
});

test('remove and clear operations never touch committed city cells', () => {
  const state = preparedState(5, 30, ['residential', 'thermal']);
  state.grid[5] = { type: 'residential', level: 1 };
  state.constructionPlan = [planned(0, 'residential'), planned(1, 'thermal')];
  expect(removePlannedFacility(state, 0).items).toEqual([planned(1, 'thermal')]);
  expect(clearConstructionPlan(state).items).toEqual([]);
  expect(state.grid[5]).toEqual({ type: 'residential', level: 1 });
});

test('계획 항목은 시설별 기본 방향을 들고 다니고 회전은 8방위를 순환한다', () => {
  const state = preparedState(9, 30, ['residential', 'solar', 'wind']);
  state.expansion.activeCellIndices = Array.from({ length: 19 }, (_, index) => index);

  // 태양광은 남향(4), 풍력은 북향(0)에서 시작한다.
  upsertPlannedFacility(state, 'solar', 0);
  upsertPlannedFacility(state, 'wind', 1);
  expect(state.constructionPlan).toEqual([
    { index: 0, type: 'solar', rotation: DIRECTION_RULES.DEFAULT_ROTATION.solar },
    { index: 1, type: 'wind', rotation: DIRECTION_RULES.DEFAULT_ROTATION.wind },
  ]);

  // 7에서 한 칸 더 돌리면 0으로 돌아온다.
  const backToNorth = rotatePlannedFacility(state, 1, -1);
  expect(backToNorth.rotation).toBe(FACILITY_DIRECTIONS.length - 1);
  expect(rotatePlannedFacility(state, 1, 1).rotation).toBe(0);
  expect(rotatePlannedFacility(state, 1, 3).items.find(({ index }) => index === 1).rotation).toBe(3);

  // 계획에 없는 칸을 돌려도 계획은 그대로다.
  expect(rotatePlannedFacility(state, 5).rotation).toBeNull();
  expect(state.constructionPlan).toHaveLength(2);

  // 명시한 방향은 그대로 계획에 들어간다.
  upsertPlannedFacility(state, 'residential', 2, 6);
  expect(state.constructionPlan.at(-1)).toEqual({ index: 2, type: 'residential', rotation: 6 });
});

test('확정한 도시 칸은 계획에서 고른 방향을 그대로 물려받는다', () => {
  const state = preparedState(9, 30, ['solar', 'wind', 'residential']);
  state.grid[5] = { type: 'residential', level: 1 };
  state.constructionPlan = [planned(0, 'solar', 2), planned(1, 'wind', 5)];

  expect(commitConstructionPlan(state)).toMatchObject({ ok: true });
  expect(state.grid[0]).toMatchObject({ type: 'solar', rotation: 2 });
  expect(state.grid[1]).toMatchObject({ type: 'wind', rotation: 5 });
});

test('normalizeCell은 방향을 시설 기본값으로 채우고 0~7로 자른다', () => {
  expect(normalizeCell({ type: 'solar', level: 1 }).rotation).toBe(DIRECTION_RULES.DEFAULT_ROTATION.solar);
  expect(normalizeCell({ type: 'wind', level: 1 }).rotation).toBe(DIRECTION_RULES.DEFAULT_ROTATION.wind);
  expect(normalizeCell({ type: 'residential', level: 1 }).rotation).toBe(0);
  expect(normalizeCell({ type: 'wind', level: 1, rotation: 11 }).rotation).toBe(3);
  expect(normalizeCell({ type: 'wind', level: 1, rotation: -1 }).rotation).toBe(7);
  expect(normalizeCell({ type: 'solar', level: 1, rotation: 'x' }).rotation)
    .toBe(DIRECTION_RULES.DEFAULT_ROTATION.solar);
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
  state.grid[5] = { type: 'residential', level: 1 };
  state.grid[6] = { type: 'residential', level: 1 };
  state.constructionPlan = [{ index: 0, type: 'nuclear' }, { index: 1, type: 'thermal' }];
  expect(assessConstructionPlan(state)).toMatchObject({ ok: true, totalCost: 13 });
  expect(commitConstructionPlan(state)).toMatchObject({ ok: true, totalCost: 13 });
  expect(state.grid[0]).toMatchObject({ type: 'nuclear', project: { kind: 'build', durationDays: 18 } });
  expect(state.grid[1]).toMatchObject({ type: 'thermal', project: { kind: 'build', durationDays: 12 } });
});

test('a completed storage hub and existing battery satisfy a nuclear construction plan', () => {
  const state = preparedState(10, 30, ['nuclear', 'battery']);
  state.claimedQuestIds.add('extreme-heat');
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[1] = { type: 'battery', level: 1 };
  state.grid[3] = { type: 'residential', level: 1 };
  state.constructionPlan = [{ index: 2, type: 'nuclear' }];

  expect(assessConstructionPlan(state)).toMatchObject({ ok: true, totalCost: 8 });
});

test('successful commit writes every planned facility and charges once', () => {
  const state = preparedState(5, 30, ['residential', 'thermal']);
  state.constructionPlan = [{ index: 0, type: 'residential' }, { index: 1, type: 'thermal' }];
  const result = commitConstructionPlan(state);
  expect(result).toMatchObject({ ok: true, totalCost: 7 });
  expect(result.projects).toHaveLength(2);
  expect(state.credits).toBe(23);
  expect(state.turn).toBe(2);
  expect(state.constructionPlan).toEqual([]);
  expect(state.grid[0]).toMatchObject({
    type: 'residential',
    level: 1,
    project: { kind: 'build', elapsedDays: 0, durationDays: 5, paidCost: 2 },
  });
  expect(state.grid[1]).toMatchObject({
    type: 'thermal',
    level: 1,
    project: { kind: 'build', elapsedDays: 0, durationDays: 12, paidCost: 5 },
  });
  expect(result.metrics).toMatchObject({ supply: 0, demand: 0, carbon: 0, water: 0 });
});

test('new plans validate against the completed target of existing projects without recharging them', () => {
  const state = preparedState(5, 10, ['residential', 'thermal']);
  state.grid[0] = {
    type: 'residential',
    level: 1,
    project: createBuildProject({ type: 'residential', paidCost: 2 }),
  };
  state.constructionPlan = [{ index: 1, type: 'thermal' }];

  const assessment = assessConstructionPlan(state);

  expect(assessment).toMatchObject({ ok: true, totalCost: 5, projectedCredits: 5 });
  expect(commitConstructionPlan(state)).toMatchObject({ ok: true, totalCost: 5 });
  expect(state.grid[0].project).toMatchObject({ kind: 'build', paidCost: 2 });
  expect(state.grid[1].project).toMatchObject({ kind: 'build', paidCost: 5 });
});

test('a batch without enough residents is rejected with the exact shortage', () => {
  const state = preparedState(2, 30, ['thermal']);
  state.constructionPlan = [{ index: 0, type: 'thermal' }];

  const assessment = assessConstructionPlan(state);
  expect(assessment).toMatchObject({ ok: false });
  expect(assessment.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ reason: 'insufficient_workforce', capacity: 0, used: 3, shortage: 3 }),
  ]));
});

test('homes and staffed facilities can be committed together in either plan order', () => {
  const state = preparedState(2, 30, ['residential', 'factory', 'thermal']);
  const plans = [
    [{ index: 0, type: 'factory' }, { index: 1, type: 'thermal' }, { index: 2, type: 'residential' }, { index: 3, type: 'residential' }],
    [{ index: 3, type: 'residential' }, { index: 2, type: 'residential' }, { index: 1, type: 'thermal' }, { index: 0, type: 'factory' }],
  ];

  plans.forEach((plan) => {
    const result = assessConstructionPlan(state, plan);
    expect(result).toMatchObject({ ok: true });
    expect(result.workforce).toMatchObject({ capacity: 12, used: 7, available: 5, shortage: 0 });
  });
});

test('legacy understaffed cities may recover but cannot make the shortage worse', () => {
  const state = preparedState(10, 100, ['residential', 'solar']);
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[1] = { type: 'nuclear', level: 3 };
  state.grid[2] = { type: 'thermal', level: 1 };

  expect(assessConstructionPlan(state, [{ index: 3, type: 'residential' }])).toMatchObject({ ok: true });
  const worsened = assessConstructionPlan(state, [{ index: 3, type: 'solar' }]);
  expect(worsened).toMatchObject({ ok: false });
  expect(worsened.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ reason: 'insufficient_workforce', shortage: 8, previousShortage: 7 }),
  ]));
});
