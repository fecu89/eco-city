import { test, expect } from '@playwright/test';
import { WORKFORCE_LEVELS } from '../../../src/core/Constants.js';

const Workforce = await import('../../../src/systems/WorkforceSystem.js').catch(() => ({}));
const { calculateWorkforce, workforceDeltaForCell, validateWorkforceGrid } = Workforce;

function workforceFor(grid) {
  expect(typeof calculateWorkforce).toBe('function');
  return calculateWorkforce(grid);
}

const cell = (type, level = 1) => ({ type, level, priority: 'normal' });

test('housing and facility workforce follow the climate campaign balance table', () => {
  expect(WORKFORCE_LEVELS.residential).toEqual([0, 6, 10, 15]);
  expect(WORKFORCE_LEVELS.factory).toEqual([0, 4, 6, 8]);
  expect(WORKFORCE_LEVELS.thermal).toEqual([0, 3, 4, 5]);
  expect(WORKFORCE_LEVELS.data).toEqual([0, 4, 6, 8]);
  expect(WORKFORCE_LEVELS.nuclear).toEqual([0, 6, 8, 10]);
  expect(WORKFORCE_LEVELS.tidal).toEqual([0, 3, 4, 5]);
});

test('five level-one homes support the reference diversified city', () => {
  expect(workforceFor([
    ...Array.from({ length: 5 }, () => cell('residential')),
    cell('factory'), cell('thermal'), cell('data'), cell('nuclear'),
    cell('solar'), cell('wind'), cell('battery'), cell('cooling'), cell('tidal'),
  ])).toMatchObject({
    capacity: 30,
    used: 26,
    available: 4,
    shortage: 0,
    workforce: 30,
    jobs: 26,
    industryFill: 1,
  });
});

test('every operating facility consumes its approved level-specific population', () => {
  const grid = [
    cell('residential', 3),
    cell('factory', 2),
    cell('thermal', 2),
    cell('data', 2),
    cell('nuclear', 2),
    cell('solar', 2),
    cell('wind', 2),
    cell('battery', 2),
    cell('cooling', 2),
    cell('green', 2),
    cell('tidal', 2),
  ];

  expect(workforceFor(grid)).toMatchObject({
    capacity: 15,
    used: 38,
    available: 0,
    shortage: 23,
    utilization: 1,
    industryFill: 0.4,
  });
});

test('workforce deltas distinguish housing supply from facility demand', () => {
  expect(typeof workforceDeltaForCell).toBe('function');
  expect(workforceDeltaForCell('residential', 1, 2)).toEqual({ capacity: 4, used: 0 });
  expect(workforceDeltaForCell('data', 1, 2)).toEqual({ capacity: 0, used: 2 });
  expect(workforceDeltaForCell('green', 1, 3)).toEqual({ capacity: 0, used: 0 });
});

test('workforce validation accepts an empty city and reports an exact shortage', () => {
  expect(typeof validateWorkforceGrid).toBe('function');
  expect(validateWorkforceGrid([])).toMatchObject({ ok: true, shortage: 0 });
  expect(validateWorkforceGrid([cell('residential'), cell('nuclear', 3), cell('thermal')]))
    .toMatchObject({ ok: false, shortage: 7, capacity: 6, used: 13 });
});
