import { FACILITIES } from '../core/Constants.js';
import { roundCredits } from '../core/Money.js';
import { calcMetrics, getBoardCoordinates, validatePlacement } from './BoardSystem.js';
import { getFacilityPermitForCount, validateGridFacilityDependencies } from './FacilityPermitSystem.js';

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
  const projectedGrid = copyGrid(state.grid);
  const errors = [];
  const counts = typeCounts(items);
  let totalCost = 0;

  Object.entries(counts).forEach(([type, plannedCount]) => {
    const permit = getFacilityPermitForCount(state, type, plannedCount - 1);
    if (!permit.ok) errors.push({ index: null, type, ...permit });
  });

  items.forEach((item) => {
    const facility = FACILITIES[item.type];
    if (facility) totalCost = roundCredits(totalCost + facility.cost);
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
    projectedGrid[item.index] = { type: item.type, level: 1 };
  });

  if (items.some((item) => item.type === 'nuclear')) {
    const dependency = validateGridFacilityDependencies(projectedGrid);
    if (!dependency.ok) errors.push({ index: null, type: 'nuclear', ...dependency });
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
  };
}

export function upsertPlannedFacility(state, type, index) {
  const current = state.constructionPlan.find((item) => item.index === index);
  if (current?.type === type) {
    state.constructionPlan = state.constructionPlan.filter((item) => item.index !== index);
  } else if (current) {
    state.constructionPlan = state.constructionPlan.map((item) => item.index === index ? { index, type } : item);
  } else {
    state.constructionPlan = [...state.constructionPlan, { index, type }];
  }
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

  const placements = assessment.items.map(({ index, type }) => ({
    index,
    key: type,
    type: FACILITIES[type].name,
    level: 1,
  }));
  state.grid = assessment.projectedGrid;
  state.credits = assessment.projectedCredits;
  state.turn += placements.length;
  state.metrics = calcMetrics(state.grid, getBoardCoordinates(state));
  state.constructionPlan = [];
  state.selectedCell = placements.at(-1)?.index ?? null;
  return {
    ok: true,
    reason: null,
    placements,
    totalCost: assessment.totalCost,
    projectedCredits: state.credits,
    metrics: state.metrics,
    placedCount: state.grid.filter(Boolean).length,
  };
}
