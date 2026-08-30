import { test, expect } from '@playwright/test';

const Ambient = await import('../../../src/systems/CityAmbientMotionSystem.js').catch(() => ({}));
const { createAmbientMotionController, nextAmbientDelay } = Ambient;

function timerHarness() {
  let nextId = 0;
  const timers = new Map();
  return {
    timers,
    setTimer(fn, ms) {
      const id = ++nextId;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    fireFirst() {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.fn();
    },
  };
}

test('facility ambient delay spans exactly four to nine seconds', () => {
  expect(nextAmbientDelay(() => 0)).toBe(4000);
  expect(nextAmbientDelay(() => 1)).toBe(9000);
  expect(nextAmbientDelay(() => 0.5)).toBe(6500);
});

test('one ambient batch starts at most three unique non-green cells', () => {
  const clock = timerHarness();
  const starts = [];
  const randomValues = [0, 0.99, 0, 0, 0, 0, 0];
  const controller = createAmbientMotionController({
    random: () => randomValues.shift() ?? 0,
    getCandidates: () => [
      { type: 'factory', cellIndex: 1 },
      { type: 'thermal', cellIndex: 2 },
      { type: 'green', cellIndex: 3 },
      { type: 'wind', cellIndex: 4 },
      { type: 'data', cellIndex: 5 },
    ],
    onStart: (effect) => starts.push(effect),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  controller.start();
  expect([...clock.timers.values()][0].ms).toBe(4000);
  clock.fireFirst();
  expect(starts).toHaveLength(3);
  expect(new Set(starts.map((effect) => effect.cellIndex)).size).toBe(3);
  expect(starts.some((effect) => effect.type === 'green')).toBe(false);
  expect(starts.every((effect) => effect.durationMs >= 600 && effect.durationMs <= 1600)).toBe(true);
  expect(controller.getState()).toMatchObject({ activeCount: 3, scheduled: false });
});

test('ambient scheduling pauses cleanly and resumes after all effects complete', () => {
  const clock = timerHarness();
  const starts = [];
  const stops = [];
  const controller = createAmbientMotionController({
    random: () => 0,
    getCandidates: () => [{ type: 'factory', cellIndex: 1 }],
    onStart: (effect) => starts.push(effect),
    onStop: (effect) => stops.push(effect),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  controller.start();
  clock.fireFirst();
  expect(starts).toHaveLength(1);
  controller.pause('modal');
  expect(stops).toHaveLength(1);
  expect(controller.getState()).toMatchObject({ paused: true, activeCount: 0, scheduled: false });
  controller.resume('modal');
  expect(clock.timers.size).toBe(1);
  clock.fireFirst();
  controller.complete(starts.at(-1).id);
  expect(controller.getState()).toMatchObject({ activeCount: 0, scheduled: true });
});
