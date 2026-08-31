import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { applyOperationalRisk } from '../../../src/systems/CityFailureSystem.js';
import { requestEmergencySupport } from '../../../src/systems/QuestSystem.js';

const summary = (overrides = {}) => ({ essentialSupplyPercent: 100, ...overrides });

test('negative credit pressure warns at six, pauses at twelve, fails at twenty-four, and recovers by one', () => {
  const state = new GameState();
  state.credits = -1;
  let result;
  for (let hour = 1; hour <= 24; hour += 1) {
    result = applyOperationalRisk(state, summary());
    if (hour === 6) expect(result.warnings).toContain('credit-6');
    if (hour === 12) expect(result.pauseTransition).toBe('credit-12');
  }
  expect(result.gameOverTransition).toBe(true);
  expect(state.gameOverReason).toBe('bankruptcy');

  const recovering = new GameState();
  recovering.operationalRisk.negativeCreditHours = 8;
  recovering.credits = 1;
  expect(applyOperationalRisk(recovering, summary()).negativeCreditHours).toBe(7);
});

test('near-total essential blackout warns at three, pauses at six, and fails at twelve hours', () => {
  const state = new GameState();
  let result;
  for (let hour = 1; hour <= 12; hour += 1) {
    result = applyOperationalRisk(state, summary({ essentialSupplyPercent: 5 }));
    if (hour === 3) expect(result.warnings).toContain('essential-3');
    if (hour === 6) expect(result.pauseTransition).toBe('essential-6');
  }
  expect(result.gameOverTransition).toBe(true);
  expect(state.gameOverReason).toBe('essential_blackout');
});

test('operational warnings are emitted only once even after recovery', () => {
  const state = new GameState();
  state.credits = -1;
  for (let hour = 0; hour < 6; hour += 1) applyOperationalRisk(state, summary());
  state.credits = 1;
  for (let hour = 0; hour < 6; hour += 1) applyOperationalRisk(state, summary());
  state.credits = -1;
  let repeated = [];
  for (let hour = 0; hour < 6; hour += 1) repeated = applyOperationalRisk(state, summary()).warnings;
  expect(repeated).not.toContain('credit-6');
});

test('emergency support is campaign-wide, adds four credits, and records its report cost', () => {
  const state = new GameState();
  state.credits = -2;
  expect(requestEmergencySupport(state)).toEqual({ ok: true, credits: 2 });
  expect(state.emergencySupport).toEqual({ used: true, economyScorePenalty: 2 });
  expect(state.decisionCounts.emergencySupport).toBe(1);
  state.questIndex += 1;
  expect(requestEmergencySupport(state)).toEqual({ ok: false, reason: 'already_used' });
});
