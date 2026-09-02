import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { applyCarbonCrisis, carbonPressureForDays } from '../../../src/systems/CarbonCrisisSystem.js';

function crisisState({ questIndex = 6, carbonCrisisDays = 0 } = {}) {
  const state = new GameState();
  state.questIndex = questIndex;
  state.carbonCrisisDays = carbonCrisisDays;
  return state;
}

test('carbon above 10 accumulates and operation at 10 recovers two days', () => {
  const state = crisisState({ carbonCrisisDays: 10 });
  expect(applyCarbonCrisis(state, 10.01).days).toBe(11);
  expect(applyCarbonCrisis(state, 10).days).toBe(9);
});

test('warnings occur once at 24, 72, and 144 hours', () => {
  const state = crisisState({ carbonCrisisDays: 23 });
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([24]);
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([]);
  state.carbonCrisisDays = 71;
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([72]);
  state.carbonCrisisDays = 143;
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([144]);
});

test('168 crisis hours transitions to carbon game over once', () => {
  const state = crisisState({ carbonCrisisDays: 167 });
  expect(applyCarbonCrisis(state, 11).gameOverTransition).toBe(true);
  expect(state).toMatchObject({ gameOver: true, gameOverReason: 'carbon_crisis' });
  expect(applyCarbonCrisis(state, 11).gameOverTransition).toBe(false);
});

test('carbon crisis is inactive until quest 5 has been completed', () => {
  for (const questIndex of [1, 2, 3, 4, 5]) {
    const state = crisisState({ questIndex });
    expect(applyCarbonCrisis(state, 99)).toMatchObject({ active: false, days: 0 });
  }
});

test('carbon pressure tiers change exactly at 24, 72, 144, and 168 hours', () => {
  expect(carbonPressureForDays(23)).toMatchObject({ tier: 'normal', healthMultiplier: 1, residentialIncomeMultiplier: 1, waterMultiplier: 1, reportPenalty: 0 });
  expect(carbonPressureForDays(24)).toMatchObject({ tier: 'watch', healthMultiplier: 1.25, residentialIncomeMultiplier: 1, waterMultiplier: 1 });
  expect(carbonPressureForDays(71).tier).toBe('watch');
  expect(carbonPressureForDays(72)).toMatchObject({ tier: 'danger', healthMultiplier: 1.5, residentialIncomeMultiplier: 0.9, waterMultiplier: 1.05 });
  expect(carbonPressureForDays(143).tier).toBe('danger');
  expect(carbonPressureForDays(144)).toMatchObject({ tier: 'severe', reportPenalty: 5 });
  expect(carbonPressureForDays(167).tier).toBe('severe');
  expect(carbonPressureForDays(168).tier).toBe('extreme');
});

test('a city that recovers to zero crisis days can be warned a second time', () => {
  const state = crisisState({ carbonCrisisDays: 23 });
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([24]);

  // 안전 운전으로 위기 일수를 0까지 되돌린다.
  while (state.carbonCrisisDays > 0) applyCarbonCrisis(state, 8);
  expect(state.carbonWarningMilestones.size).toBe(0);

  state.carbonCrisisDays = 23;
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([24]);
});
