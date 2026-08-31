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

test('facility ambient delay spans exactly two and a half to five seconds', () => {
  expect(nextAmbientDelay(() => 0)).toBe(2500);
  expect(nextAmbientDelay(() => 1)).toBe(5000);
  expect(nextAmbientDelay(() => 0.5)).toBe(3750);
});

test('a smoke facility is guaranteed in each batch and thermal runs for at least 2.4 seconds', () => {
  const clock = timerHarness();
  const starts = [];
  const controller = createAmbientMotionController({
    random: () => 0,
    getCandidates: () => [
      { type: 'data', cellIndex: 1 },
      { type: 'residential', cellIndex: 2 },
      { type: 'thermal', cellIndex: 3 },
    ],
    onStart: (effect) => starts.push(effect),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  controller.start();
  clock.fireFirst();
  expect(starts).toEqual([
    expect.objectContaining({ type: 'thermal', cellIndex: 3, durationMs: 2400 }),
  ]);
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
  expect([...clock.timers.values()][0].ms).toBe(2500);
  clock.fireFirst();
  expect(starts).toHaveLength(3);
  expect(new Set(starts.map((effect) => effect.cellIndex)).size).toBe(3);
  expect(starts.some((effect) => effect.type === 'green')).toBe(false);
  const durationRanges = {
    factory: [1800, 3000],
    thermal: [2400, 4000],
    wind: [600, 1600],
    data: [600, 1600],
  };
  expect(starts.every((effect) => {
    const [minimum, maximum] = durationRanges[effect.type];
    return effect.durationMs >= minimum && effect.durationMs <= maximum;
  })).toBe(true);
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
