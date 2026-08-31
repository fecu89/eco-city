import { test, expect } from '@playwright/test';

const Workforce = await import('../../../src/systems/WorkforceSystem.js').catch(() => ({}));
const { calculateWorkforce, workforceDeltaForCell, validateWorkforceGrid } = Workforce;

function workforceFor(grid) {
  expect(typeof calculateWorkforce).toBe('function');
  return calculateWorkforce(grid);
}

const cell = (type, level = 1) => ({ type, level, priority: 'normal' });

test('one level-one home supplies ten residents to staffed facilities', () => {
  expect(workforceFor([
    cell('residential'),
    cell('thermal'),
    cell('data'),
    cell('factory'),
  ])).toEqual({
    capacity: 10,
    used: 9,
    available: 1,
    shortage: 0,
    utilization: 0.9,
    workforce: 10,
    jobs: 9,
    industryFill: 1,
    employmentRate: 0.9,
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
    capacity: 22,
    used: 32,
    available: 0,
    shortage: 10,
    utilization: 1,
    industryFill: 0.7,
  });
});

test('workforce deltas distinguish housing supply from facility demand', () => {
  expect(typeof workforceDeltaForCell).toBe('function');
  expect(workforceDeltaForCell('residential', 1, 2)).toEqual({ capacity: 5, used: 0 });
  expect(workforceDeltaForCell('data', 1, 2)).toEqual({ capacity: 0, used: 2 });
  expect(workforceDeltaForCell('green', 1, 3)).toEqual({ capacity: 0, used: 0 });
});

test('workforce validation accepts an empty city and reports an exact shortage', () => {
  expect(typeof validateWorkforceGrid).toBe('function');
  expect(validateWorkforceGrid([])).toMatchObject({ ok: true, shortage: 0 });
  expect(validateWorkforceGrid([cell('residential'), cell('nuclear', 3), cell('thermal')]))
    .toMatchObject({ ok: false, shortage: 1, capacity: 10, used: 11 });
});
