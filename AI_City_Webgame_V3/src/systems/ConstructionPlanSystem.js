import { FACILITIES, STRESS_TEST_RULES } from '../core/Constants.js';
import { roundCredits } from '../core/Money.js';
import { calcMetrics, getBoardCoordinates, validatePlacement } from './BoardSystem.js';
import { getFacilityPermitForCount, validateGridFacilityDependencies } from './FacilityPermitSystem.js';
import { validateWorkforceTransition } from './WorkforceSystem.js';
import { constructionCostForCell } from './ZoneSystem.js';
import { createBuildProject, finalGridAfterProjects } from './ConstructionProjectSystem.js';

function copyPlan(plan) {
  return (plan || []).map(({ index, type }) => ({ index, type }));
}

function copyGrid(grid) {
  return (grid || []).map((cell) => cell ? { ...cell } : null);
}

function typeCounts(plan) {
  return plan.reduce((counts, item) => {
    if (FACILITIES[item.type]) counts[item.type] = (counts[item.type] || 0) + 1;
    return counts;
  }, {});
}

export function assessConstructionPlan(state, planOverride = state.constructionPlan) {
  const items = copyPlan(planOverride);
  const finalCurrentGrid = finalGridAfterProjects(state.grid);
  const projectedGrid = copyGrid(finalCurrentGrid);
  const errors = [];
  const counts = typeCounts(items);
  let totalCost = 0;
  const paidCostByIndex = {};

  Object.entries(counts).forEach(([type, plannedCount]) => {
    const permit = getFacilityPermitForCount(state, type, plannedCount - 1);
    if (!permit.ok) errors.push({ index: null, type, ...permit });
  });

  items.forEach((item) => {
    const facility = FACILITIES[item.type];
    if (facility) {
      const stressMultiplier = state.stressTest?.status === 'running'
        ? STRESS_TEST_RULES.CONSTRUCTION_COST_MULTIPLIER
        : 1;
      const paidCost = roundCredits(constructionCostForCell(state, item.index, item.type) * stressMultiplier);
      paidCostByIndex[item.index] = paidCost;
      totalCost = roundCredits(totalCost + paidCost);
    }
    const validation = validatePlacement(state, item.type, item.index, {
      grid: projectedGrid,
      availableCredits: Number.POSITIVE_INFINITY,
      skipPermit: true,
      requireNuclearReserve: false,
    });
    if (!validation.ok) {
      errors.push({ index: item.index, type: item.type, ...validation });
      return;
    }
    projectedGrid[item.index] = {
      type: item.type,
      level: 1,
      operationMode: 'normal',
      ...(item.type === 'battery' ? { batteryPolicy: 'auto' } : {}),
    };
  });

  if (items.some((item) => item.type === 'nuclear')) {
    const dependency = validateGridFacilityDependencies(projectedGrid, state);
    if (!dependency.ok) errors.push({ index: null, type: 'nuclear', ...dependency });
  }

  const workforce = validateWorkforceTransition(finalCurrentGrid, projectedGrid);
  if (!workforce.ok) {
    errors.push({
      index: null,
      type: null,
      ...workforce,
      reason: 'insufficient_workforce',
      message: `인력이 ${workforce.shortage}명 부족합니다. 주거지를 계획에 함께 추가하세요.`,
    });
  }

  const projectedCredits = roundCredits(state.credits - totalCost);
  if (totalCost > state.credits) {
    errors.push({
      index: null,
      type: null,
      ok: false,
      reason: 'insufficient_credits',
      missingCredits: roundCredits(totalCost - state.credits),
      message: `계획 전체를 확정하려면 ${roundCredits(totalCost - state.credits).toFixed(2)} 💰가 더 필요합니다.`,
    });
  }

  return {
    ok: items.length > 0 && errors.length === 0,
    reason: items.length === 0 ? 'empty_plan' : errors.length ? 'invalid_plan' : null,
    items,
    errors,
    totalCost,
    projectedCredits,
    projectedGrid,
    paidCostByIndex,
    workforce,
  };
}

export function upsertPlannedFacility(state, type, index) {
  const current = state.constructionPlan.find((item) => item.index === index);
  let nextPlan;
  if (current?.type === type) {
    nextPlan = state.constructionPlan.filter((item) => item.index !== index);
  } else if (current) {
    nextPlan = state.constructionPlan.map((item) => item.index === index ? { index, type } : item);
  } else {
    nextPlan = [...state.constructionPlan, { index, type }];
  }

  // 같은 계획을 다시 누르는 제거 동작은 언제나 허용한다. 추가·교체는 시설 허가를 넘는
  // 순간 계획에 넣지 않아, 유령 건물과 비활성 확정 버튼이 생기는 것을 막는다.
  if (current?.type !== type) {
    const candidate = assessConstructionPlan(state, nextPlan);
    const permitError = candidate.errors.find((error) => (
      error.reason === 'facility_limit' && error.type === type
    ));
    if (permitError) {
      return {
        ...assessConstructionPlan(state),
        rejected: { ...permitError, attemptedIndex: index, attemptedType: type },
      };
    }
  }

  state.constructionPlan = nextPlan;
  return assessConstructionPlan(state);
}

export function removePlannedFacility(state, index) {
  state.constructionPlan = state.constructionPlan.filter((item) => item.index !== index);
  return assessConstructionPlan(state);
}

export function clearConstructionPlan(state) {
  state.constructionPlan = [];
  state.selectedCell = null;
  return assessConstructionPlan(state);
}

export function commitConstructionPlan(state) {
  const assessment = assessConstructionPlan(state);
  if (!assessment.ok) return { ...assessment, ok: false, reason: 'invalid_plan' };

  const nextGrid = copyGrid(state.grid);
  const projects = assessment.items.map(({ index, type }) => ({
    index,
    key: type,
    type: FACILITIES[type].name,
    level: 1,
    durationDays: createBuildProject({ type, paidCost: assessment.paidCostByIndex[index] }).durationDays,
  }));
  assessment.items.forEach(({ index, type }) => {
    nextGrid[index] = {
      type,
      level: 1,
      operationMode: 'normal',
      ...(type === 'battery' ? { batteryPolicy: 'auto' } : {}),
      project: createBuildProject({ type, paidCost: assessment.paidCostByIndex[index] }),
    };
  });
  state.grid = nextGrid;
  state.credits = assessment.projectedCredits;
  state.turn += projects.length;
  state.metrics = calcMetrics(state.grid, getBoardCoordinates(state));
  state.constructionPlan = [];
  state.selectedCell = projects.at(-1)?.index ?? null;
  return {
    ok: true,
    reason: null,
    projects,
    placements: projects,
    totalCost: assessment.totalCost,
    projectedCredits: state.credits,
    metrics: state.metrics,
    placedCount: state.grid.filter(Boolean).length,
  };
}
