import { test, expect } from '@playwright/test';
import { nextBirdDelay, createBirdVisitController } from '../../../src/systems/AmbientBirdSystem.js';

test('bird visit delay spans exactly ten to thirty seconds', () => {
  expect(nextBirdDelay(() => 0)).toBe(10000);
  expect(nextBirdDelay(() => 1)).toBe(30000);
  expect(nextBirdDelay(() => 0.5)).toBe(20000);
});

test('bird visits pause cleanly and reuse one flock', () => {
  let id = 0;
  const timers = new Map();
  const visits = [];
  const controller = createBirdVisitController({
    random: () => 0,
    getGreenIndices: () => [4, 9],
    onVisit: (visit) => visits.push(visit),
    setTimer: (fn, ms) => { const timerId = ++id; timers.set(timerId, { fn, ms }); return timerId; },
    clearTimer: (timerId) => timers.delete(timerId),
  });

  controller.start();
  expect([...timers.values()][0].ms).toBe(10000);
  controller.pause('modal');
  expect(timers.size).toBe(0);
  controller.resume('modal');
  const pending = [...timers.values()][0];
  pending.fn();
  expect(visits).toEqual([{ flockId: 'shared-bird-flock', greenIndex: 4, birdCount: 2, durationMs: 2000 }]);
  expect(timers.size).toBe(1);
});

test('no green means no bird visit is emitted', () => {
  let pending;
  const visits = [];
  const controller = createBirdVisitController({
    random: () => 0,
    getGreenIndices: () => [],
    onVisit: (visit) => visits.push(visit),
    setTimer: (fn) => { pending = fn; return 1; },
    clearTimer: () => {},
  });
  controller.start();
  pending();
  expect(visits).toEqual([]);
});
