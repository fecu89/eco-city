import { test, expect } from '@playwright/test';
import * as ChartView from '../../../src/ui/ChartView.js';

test('city chart uses live operating power, carbon, and water instead of stale static metrics', () => {
  const state = {
    metrics: {
      dev: 40,
      reliability: 15,
      carbon: 20,
      water: 20,
      synergyLinks: 2,
    },
    lastTickSummary: {
      deliveredPower: 9,
      demand: 10,
      hourlyCarbon: 2,
      hourlyWater: 4,
    },
  };

  expect(ChartView.chartValues?.(state)).toEqual([40, 90, 92, 84, 40]);
});
