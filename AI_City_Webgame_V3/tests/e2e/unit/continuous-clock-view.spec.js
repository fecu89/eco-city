import { test, expect } from '@playwright/test';
import { createContinuousClockView } from '../../../src/ui/ContinuousClockView.js';

test('continuous clock forwards every real-time tick fraction to visual progress consumers', () => {
  let progress = 0;
  let nextFrame = null;
  const observed = [];
  const view = createContinuousClockView({
    timeElement: { textContent: '' },
    getElapsedDays: () => 0,
    getProgress: () => progress,
    onProgress: (value) => observed.push(value),
    requestFrame: (callback) => { nextFrame = callback; return 1; },
    cancelFrame: () => {},
  });

  view.start();
  progress = 0.25;
  nextFrame();
  progress = 0.5;
  nextFrame();
  view.stop();

  expect(observed).toEqual([0, 0.25, 0.5]);
});

test('the clock renders once and idles while nothing needs per-frame updates', () => {
  let animate = false;
  let requested = 0;
  let nextFrame = null;
  const observed = [];
  const view = createContinuousClockView({
    timeElement: { textContent: '' },
    getElapsedDays: () => 0,
    getProgress: () => 0,
    onProgress: (value) => observed.push(value),
    shouldAnimate: () => animate,
    requestFrame: (callback) => { requested += 1; nextFrame = callback; return requested; },
    cancelFrame: () => {},
  });

  view.start();
  expect(observed).toEqual([0]);
  expect(requested).toBe(0);

  animate = true;
  view.resume();
  expect(requested).toBe(1);
  nextFrame();
  expect(observed).toEqual([0, 0]);
  expect(requested).toBe(2);

  animate = false;
  nextFrame();
  expect(observed).toEqual([0, 0, 0]);
  expect(requested).toBe(2);
});

test('resume never stacks a second frame on an already running loop', () => {
  let requested = 0;
  const view = createContinuousClockView({
    timeElement: { textContent: '' },
    getElapsedDays: () => 0,
    getProgress: () => 0,
    requestFrame: () => { requested += 1; return requested; },
    cancelFrame: () => {},
  });

  view.start();
  view.resume();
  view.renderNow();

  expect(requested).toBe(1);
});
