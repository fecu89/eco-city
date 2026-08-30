import { test, expect } from '@playwright/test';
import {
  getSolarMultiplier,
  getWindMultiplier,
  getWorldPhase,
  getDemandMultiplier,
  getThreeHourForecast,
} from '../../../src/systems/ClimateSystem.js';

test('solar and world light follow deterministic game hours', () => {
  expect(getSolarMultiplier(5)).toBe(0);
  expect(getSolarMultiplier(7)).toBe(0.5);
  expect(getSolarMultiplier(12)).toBe(1);
  expect(getSolarMultiplier(19)).toBe(0);
  expect(getWorldPhase(7)).toBe('dawn');
  expect(getWorldPhase(12)).toBe('day');
  expect(getWorldPhase(19)).toBe('dusk');
  expect(getWorldPhase(23)).toBe('night');
});

test('wind and three-hour forecast are deterministic', () => {
  expect([0, 1, 2, 3, 4].map(getWindMultiplier)).toEqual([0.6, 0.9, 1.1, 0.75, 0.6]);
  expect(getThreeHourForecast(18, 2)).toEqual([
    { hour: 19, solar: 0, wind: 0.75 },
    { hour: 20, solar: 0, wind: 0.6 },
    { hour: 21, solar: 0, wind: 0.9 },
  ]);
});

test('green softens residential heatwave demand without changing factories', () => {
  expect(getDemandMultiplier('residential', { heatwave: true, adjacentGreen: false })).toBe(1.25);
  expect(getDemandMultiplier('residential', { heatwave: true, adjacentGreen: true })).toBe(1.1);
  expect(getDemandMultiplier('data', { heatwave: true, adjacentGreen: false })).toBe(1.25);
  expect(getDemandMultiplier('factory', { heatwave: true, adjacentGreen: false })).toBe(1);
});
