import { test, expect } from '@playwright/test';
import {
  getSolarMultiplier,
  getDailySolarMultiplier,
  getDemandMultiplier,
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

// 정산은 시(hour)가 아니라 게임일 단위이며, 태양광은 하루 평균(11/24)을 쓴다.
// 풍력의 4일 고정 패턴은 날씨 풍속으로 대체됐다(weather.spec.js).
test('daily solar keeps the 11/24 day-night average', () => {
  expect(getDailySolarMultiplier()).toBeCloseTo(11 / 24, 8);
});

test('green softens residential heatwave demand without changing factories', () => {
  expect(getDemandMultiplier('residential', { heatwave: true, adjacentGreen: false })).toBe(1.25);
  expect(getDemandMultiplier('residential', { heatwave: true, adjacentGreen: true })).toBe(1.1);
  expect(getDemandMultiplier('data', { heatwave: true, adjacentGreen: false })).toBe(1.25);
  expect(getDemandMultiplier('factory', { heatwave: true, adjacentGreen: false })).toBe(1);
});
