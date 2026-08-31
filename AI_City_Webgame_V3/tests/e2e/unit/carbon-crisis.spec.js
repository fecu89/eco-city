import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { applyCarbonCrisis, carbonPressureForHours } from '../../../src/systems/CarbonCrisisSystem.js';

function crisisState({ questIndex = 6, carbonCrisisHours = 0 } = {}) {
  const state = new GameState();
  state.questIndex = questIndex;
  state.carbonCrisisHours = carbonCrisisHours;
  return state;
}

test('carbon above 10 accumulates and operation at 10 recovers two hours', () => {
  const state = crisisState({ carbonCrisisHours: 10 });
  expect(applyCarbonCrisis(state, 10.01).hours).toBe(11);
  expect(applyCarbonCrisis(state, 10).hours).toBe(9);
});

test('warnings occur once at 24, 72, and 144 hours', () => {
  const state = crisisState({ carbonCrisisHours: 23 });
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([24]);
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([]);
  state.carbonCrisisHours = 71;
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([72]);
  state.carbonCrisisHours = 143;
  expect(applyCarbonCrisis(state, 11).warnings).toEqual([144]);
});

test('168 crisis hours transitions to carbon game over once', () => {
  const state = crisisState({ carbonCrisisHours: 167 });
  expect(applyCarbonCrisis(state, 11).gameOverTransition).toBe(true);
  expect(state).toMatchObject({ gameOver: true, gameOverReason: 'carbon_crisis' });
  expect(applyCarbonCrisis(state, 11).gameOverTransition).toBe(false);
});

test('carbon crisis is inactive until quest 5 has been completed', () => {
  for (const questIndex of [1, 2, 3, 4, 5]) {
    const state = crisisState({ questIndex });
    expect(applyCarbonCrisis(state, 99)).toMatchObject({ active: false, hours: 0 });
  }
});

test('carbon pressure tiers change exactly at 24, 72, 144, and 168 hours', () => {
  expect(carbonPressureForHours(23)).toMatchObject({ tier: 'normal', healthMultiplier: 1, residentialIncomeMultiplier: 1, waterMultiplier: 1, reportPenalty: 0 });
  expect(carbonPressureForHours(24)).toMatchObject({ tier: 'watch', healthMultiplier: 1.25, residentialIncomeMultiplier: 1, waterMultiplier: 1 });
  expect(carbonPressureForHours(71).tier).toBe('watch');
  expect(carbonPressureForHours(72)).toMatchObject({ tier: 'danger', healthMultiplier: 1.5, residentialIncomeMultiplier: 0.9, waterMultiplier: 1.05 });
  expect(carbonPressureForHours(143).tier).toBe('danger');
  expect(carbonPressureForHours(144)).toMatchObject({ tier: 'severe', reportPenalty: 5 });
  expect(carbonPressureForHours(167).tier).toBe('severe');
  expect(carbonPressureForHours(168).tier).toBe('extreme');
});
