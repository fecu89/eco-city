import { test, expect } from '@playwright/test';
import { BADGES } from '../../../src/core/Constants.js';
import { Events } from '../../../src/core/EventBus.js';
import { gameState } from '../../../src/core/GameState.js';
import { computeReport, exportReport } from '../../../src/systems/ReportSystem.js';

test('product state and events contain no evidence or batch redesign concepts', () => {
  gameState.reset();
  expect(gameState.evidence).toBeUndefined();
  expect(Events.EVIDENCE_SAVED).toBeUndefined();
  expect(Events.REDESIGN_VALIDATED).toBeUndefined();
  expect(BADGES.some((badge) => badge.id === 'evidence')).toBe(false);
  expect(BADGES.some((badge) => badge.id === 'low-carbon')).toBe(true);
});

test('final campaign report evaluates operations and exports no evidence field', () => {
  gameState.reset();
  gameState.baseline = { dev: 10, balance: -2, carbon: 8, water: 9, hourlyCarbon: 8, hourlyWater: 9 };
  gameState.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  gameState.simulationTotals = {
    hours: 4,
    netCredits: 8,
    transmissionEfficiency: 3.2,
    lowCarbonPercent: 300,
    employmentRate: 3,
    industryFill: 2.8,
    essentialOutageHours: 1,
    overcrowding: 2,
    health: 1,
  };
  gameState.claimedQuestIds = new Set(['first-citizens', 'power-on']);
  gameState.quizResults = { 'growth-cost': { passed: true, correct: 2, total: 3 } };

  const report = computeReport();
  expect(report.operations).toMatchObject({
    averageNetCredits: 2,
    averageTransmissionEfficiency: 80,
    averageLowCarbonPercent: 75,
    essentialOutageHours: 1,
  });
  const exported = exportReport();
  expect(exported.completedQuests).toEqual(['first-citizens', 'power-on']);
  expect(exported.quizResults['growth-cost'].passed).toBe(true);
  expect(exported.evidence).toBeUndefined();
});
