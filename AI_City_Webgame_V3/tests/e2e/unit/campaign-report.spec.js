import { test, expect } from '@playwright/test';
import { Events } from '../../../src/core/EventBus.js';
import { gameState } from '../../../src/core/GameState.js';
import { computeReport, exportReport } from '../../../src/systems/ReportSystem.js';

test('product state and events contain no evidence or batch redesign concepts', () => {
  gameState.reset();
  expect(gameState.evidence).toBeUndefined();
  expect(Events.EVIDENCE_SAVED).toBeUndefined();
  expect(Events.REDESIGN_VALIDATED).toBeUndefined();
  expect(Events.BADGE_UNLOCKED).toBeUndefined();
  expect(Events.ADVISOR_ASKED).toBeUndefined();
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
  expect(exported.badges).toBeUndefined();
  expect(exported.transcripts).toBeUndefined();
  expect(exported.boardRadius).toBe(2);
});

test('research quiz completion without correct answers earns no knowledge score', () => {
  gameState.reset();
  gameState.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  gameState.quizResults = {
    'research:solar2': { passed: true, correct: 0, total: 4 },
  };
  const wrong = computeReport();

  gameState.quizResults = {
    'research:solar2': { passed: true, correct: 4, total: 4 },
  };
  const correct = computeReport();

  expect(wrong.knowledgeScore).toBe(0);
  expect(wrong.knowledgeAccuracy).toBe(0);
  expect(correct.knowledgeScore).toBe(20);
  expect(correct.knowledgeAccuracy).toBe(100);
  expect(correct.total - wrong.total).toBe(20);
});

test('actual operating history materially changes the final score', () => {
  gameState.reset();
  gameState.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  gameState.quizResults = { 'climate-council': { passed: true, correct: 3, total: 4 } };
  gameState.simulationTotals = {
    hours: 10,
    netCredits: -20,
    transmissionEfficiency: 5,
    lowCarbonPercent: 0,
    employmentRate: 2,
    industryFill: 2,
    essentialOutageHours: 10,
    overcrowding: 10,
    health: 10,
  };
  const struggling = computeReport();

  gameState.simulationTotals = {
    hours: 10,
    netCredits: 30,
    transmissionEfficiency: 10,
    lowCarbonPercent: 900,
    employmentRate: 8,
    industryFill: 8,
    essentialOutageHours: 0,
    overcrowding: 0,
    health: 0,
  };
  const resilient = computeReport();

  expect(struggling.operationsScore).toBeLessThan(15);
  expect(resilient.operationsScore).toBeGreaterThan(40);
  expect(resilient.total - struggling.total).toBeGreaterThan(25);
  expect(resilient.total).toBe(Math.round(
    resilient.operationsScore + resilient.designScore + resilient.knowledgeScore,
  ));
});
