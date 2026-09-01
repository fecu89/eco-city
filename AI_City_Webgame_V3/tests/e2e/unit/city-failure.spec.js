import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { applyOperationalRisk } from '../../../src/systems/CityFailureSystem.js';
import { requestEmergencySupport } from '../../../src/systems/QuestSystem.js';

const summary = (overrides = {}) => ({ essentialSupplyPercent: 100, ...overrides });
const operatingState = () => {
  const state = new GameState();
  state.claimedQuestIds.add('power-on');
  return state;
};

test('tutorial construction time does not count as an essential blackout before the first power grid', () => {
  const state = new GameState();
  let result;
  for (let day = 0; day < 24; day += 1) {
    result = applyOperationalRisk(state, summary({ essentialSupplyPercent: 0 }));
  }
  expect(result).toMatchObject({ essentialBlackoutDays: 0, warnings: [], pauseTransition: null });
  expect(state.gameOver).toBe(false);
});

test('negative credit pressure warns at six, pauses at twelve, fails at twenty-four, and recovers by one', () => {
  const state = operatingState();
  state.credits = -1;
  let result;
  for (let day = 1; day <= 24; day += 1) {
    result = applyOperationalRisk(state, summary());
    if (day === 6) expect(result.warnings).toContain('credit-6');
    if (day === 12) expect(result.pauseTransition).toBe('credit-12');
  }
  expect(result.gameOverTransition).toBe(true);
  expect(state.gameOverReason).toBe('bankruptcy');

  const recovering = operatingState();
  recovering.operationalRisk.negativeCreditDays = 8;
  recovering.credits = 1;
  expect(applyOperationalRisk(recovering, summary()).negativeCreditDays).toBe(7);
});

test('near-total essential blackout warns at three, pauses at six, and fails at twelve days', () => {
  const state = operatingState();
  let result;
  for (let day = 1; day <= 12; day += 1) {
    result = applyOperationalRisk(state, summary({ essentialSupplyPercent: 5 }));
    if (day === 3) expect(result.warnings).toContain('essential-3');
    if (day === 6) expect(result.pauseTransition).toBe('essential-6');
  }
  expect(result.gameOverTransition).toBe(true);
  expect(state.gameOverReason).toBe('essential_blackout');
});

test('operational warnings are emitted only once even after recovery', () => {
  const state = operatingState();
  state.credits = -1;
  for (let day = 0; day < 6; day += 1) applyOperationalRisk(state, summary());
  state.credits = 1;
  for (let day = 0; day < 6; day += 1) applyOperationalRisk(state, summary());
  state.credits = -1;
  let repeated = [];
  for (let day = 0; day < 6; day += 1) repeated = applyOperationalRisk(state, summary()).warnings;
  expect(repeated).not.toContain('credit-6');
});

test('migrated cities keep real deficit reporting without accumulating bankruptcy risk during grace', () => {
  const state = operatingState();
  state.credits = -5;
  state.workforceRebalanceGraceDays = 24;

  const result = applyOperationalRisk(state, summary());

  expect(result.negativeCreditDays).toBe(0);
  expect(state.credits).toBe(-5);
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
