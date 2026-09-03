import { test, expect } from '@playwright/test';
import {
  getSolarMultiplier,
  getWindMultiplier,
  getDemandMultiplier,
  getThreeDayForecast,
} from '../../../src/systems/ClimateSystem.js';

test('solar output follows deterministic game hours', () => {
  expect(getSolarMultiplier(5)).toBe(0);
  expect(getSolarMultiplier(6)).toBe(0.5);
  expect(getSolarMultiplier(7)).toBe(0.5);
  expect(getSolarMultiplier(8)).toBe(1);
  expect(getSolarMultiplier(12)).toBe(1);
  expect(getSolarMultiplier(17)).toBe(0.5);
  expect(getSolarMultiplier(19)).toBe(0);
  expect(getSolarMultiplier(23)).toBe(0);
  // 시간은 24로 감싼다 — 27시는 3시와 같다.
  expect(getSolarMultiplier(27)).toBe(0);
  expect(getSolarMultiplier(36)).toBe(1);
});

// 예보는 시(hour)가 아니라 게임일 단위이며, 태양광은 하루 평균(11/24)을 쓴다.
test('wind and three-day forecast are deterministic', () => {
  expect([0, 1, 2, 3, 4].map(getWindMultiplier)).toEqual([0.6, 0.9, 1.1, 0.75, 0.6]);
  expect(getThreeDayForecast(18, 2)).toEqual([
    { dayIndex: 19, solar: 11 / 24, wind: 0.75 },
    { dayIndex: 20, solar: 11 / 24, wind: 0.6 },
    { dayIndex: 21, solar: 11 / 24, wind: 0.9 },
  ]);
});

test('green softens residential heatwave demand without changing factories', () => {
  expect(getDemandMultiplier('residential', { heatwave: true, adjacentGreen: false })).toBe(1.25);
  expect(getDemandMultiplier('residential', { heatwave: true, adjacentGreen: true })).toBe(1.1);
  expect(getDemandMultiplier('data', { heatwave: true, adjacentGreen: false })).toBe(1.25);
  expect(getDemandMultiplier('factory', { heatwave: true, adjacentGreen: false })).toBe(1);
});
