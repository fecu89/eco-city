import { test, expect } from '@playwright/test';
import { createContinuousClockView } from '../../../src/ui/ContinuousClockView.js';

test('continuous clock forwards every real-time tick fraction to visual progress consumers', () => {
  let progress = 0;
  let nextFrame = null;
  const observed = [];
  const view = createContinuousClockView({
    timeElement: { textContent: '' },
    getElapsedHours: () => 0,
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
