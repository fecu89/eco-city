import { WORKFORCE_LEVELS } from '../core/Constants.js';

const round1 = (value) => Math.round(value * 10) / 10;

function levelValue(type, level = 0) {
  return WORKFORCE_LEVELS[type]?.[level] ?? 0;
}

export function calculateWorkforce(grid = []) {
  let capacity = 0;
  let used = 0;

  grid.forEach((cell) => {
    if (!cell) return;
    const value = levelValue(cell.type, cell.level);
    if (cell.type === 'residential') capacity += value;
    else used += value;
  });

  const available = Math.max(0, capacity - used);
  const shortage = Math.max(0, used - capacity);
  return {
    capacity,
    used,
    available,
    shortage,
    utilization: capacity ? round1(Math.min(1, used / capacity)) : (used ? 1 : 0),
    workforce: capacity,
    jobs: used,
    industryFill: used ? round1(Math.min(1, capacity / used)) : 0,
    employmentRate: capacity ? round1(Math.min(1, used / capacity)) : 0,
  };
}

export function workforceDeltaForCell(type, fromLevel = 0, toLevel = 0) {
  const delta = levelValue(type, toLevel) - levelValue(type, fromLevel);
  return type === 'residential'
    ? { capacity: delta, used: 0 }
    : { capacity: 0, used: delta };
}

export function validateWorkforceGrid(grid = []) {
  const population = calculateWorkforce(grid);
  return { ok: population.shortage === 0, ...population };
}

export function validateWorkforceTransition(currentGrid = [], projectedGrid = []) {
  const current = calculateWorkforce(currentGrid);
  const projected = calculateWorkforce(projectedGrid);
  return {
    ok: projected.shortage <= current.shortage,
    ...projected,
    previousShortage: current.shortage,
  };
}
