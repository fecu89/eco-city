import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { applyCarbonCrisis } from '../../../src/systems/CarbonCrisisSystem.js';

function crisisState({ questIndex = 6, carbonCrisisHours = 0 } = {}) {
  const state = new GameState();
  state.questIndex = questIndex;
  state.carbonCrisisHours = carbonCrisisHours;
  return state;
}

test('carbon above 8 accumulates and safe operation recovers two hours', () => {
  const state = crisisState({ carbonCrisisHours: 10 });
  expect(applyCarbonCrisis(state, 8.01).hours).toBe(11);
  expect(applyCarbonCrisis(state, 8).hours).toBe(9);
});

test('warnings occur once at 24, 72, and 144 hours', () => {
  const state = crisisState({ carbonCrisisHours: 23 });
  expect(applyCarbonCrisis(state, 9).warnings).toEqual([24]);
  expect(applyCarbonCrisis(state, 9).warnings).toEqual([]);
  state.carbonCrisisHours = 71;
  expect(applyCarbonCrisis(state, 9).warnings).toEqual([72]);
  state.carbonCrisisHours = 143;
  expect(applyCarbonCrisis(state, 9).warnings).toEqual([144]);
});

test('168 crisis hours transitions to carbon game over once', () => {
  const state = crisisState({ carbonCrisisHours: 167 });
  expect(applyCarbonCrisis(state, 9).gameOverTransition).toBe(true);
  expect(state).toMatchObject({ gameOver: true, gameOverReason: 'carbon_crisis' });
  expect(applyCarbonCrisis(state, 9).gameOverTransition).toBe(false);
});

test('carbon crisis is inactive until quest 5 has been completed', () => {
  for (const questIndex of [1, 2, 3, 4, 5]) {
    const state = crisisState({ questIndex });
    expect(applyCarbonCrisis(state, 99)).toMatchObject({ active: false, hours: 0 });
  }
});
