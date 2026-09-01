import { test, expect } from '@playwright/test';
import * as ChartView from '../../../src/ui/ChartView.js';

test('visible city chart interpolates linearly for ninety percent of the current tick interval', () => {
  expect(typeof ChartView.chartAnimationOptions).toBe('function');
  expect(ChartView.chartAnimationOptions({ panelVisible: true, reducedMotion: false, timeScale: 1 }))
    .toEqual({ duration: 900, easing: 'linear' });
  expect(ChartView.chartAnimationOptions({ panelVisible: true, reducedMotion: false, timeScale: 4 }))
    .toEqual({ duration: 225, easing: 'linear' });
});

test('hidden, paused, and reduced-motion charts update without animation', () => {
  expect(typeof ChartView.chartAnimationOptions).toBe('function');
  expect(ChartView.chartAnimationOptions({ panelVisible: false, reducedMotion: false, timeScale: 1 }).duration).toBe(0);
  expect(ChartView.chartAnimationOptions({ panelVisible: true, reducedMotion: false, timeScale: 0 }).duration).toBe(0);
  expect(ChartView.chartAnimationOptions({ panelVisible: true, reducedMotion: true, timeScale: 1 }).duration).toBe(0);
});
