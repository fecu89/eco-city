import { test, expect } from '@playwright/test';
import { Events } from '../../../src/core/EventBus.js';
import { gameState } from '../../../src/core/GameState.js';
import { classifyCity, computeReport, exportReport } from '../../../src/systems/ReportSystem.js';
import { STRESS_PHASES } from '../../../src/core/EventDefinitions.js';

function completedStress(overrides = {}) {
  return {
    blackoutDays: 1, minimumEssentialSupply: 82, averageEssentialSupply: 94,
    averageNetIncome: 3.5, carbonRiskDays: 2, waterViolationDays: 1,
    batteryEnergyUsed: 12, recoveryDays: 2, maxConsecutiveBankruptcyDays: 0,
    finalCredits: 18, passed: true, ...overrides,
  };
}

function operatingState() {
  gameState.reset();
  gameState.grid[0] = { type: 'residential', level: 2, priority: 'essential' };
  gameState.grid[1] = { type: 'solar', level: 2 };
  gameState.grid[2] = { type: 'wind', level: 2 };
  gameState.grid[3] = { type: 'battery', level: 2, batteryStoredLowCarbon: 10 };
  gameState.stressTest = { status: 'passed', result: completedStress(), phaseIndex: 5, phaseDay: 0 };
  gameState.simulationTotals = {
    hours: 20, netCredits: 60, transmissionEfficiency: 18.8, lowCarbonPercent: 1700,
    employmentRate: 16, industryFill: 15, essentialOutageDays: 1,
    overcrowding: 1, health: 2, deliveredEnergy: 300, renewableDeliveredEnergy: 240,
    nuclearDeliveredEnergy: 0, batteryEnergyUsed: 42, grossIncome: 100,
    factoryIncome: 20, peakDemand: 24, peakAvailableSupply: 28,
  };
  gameState.decisionCounts = {
    priorityChanges: 3, researchPauses: 1, emergencySupport: 0, batteryPolicyChanges: 1,
  };
}

test('product state and events contain no evidence or batch redesign concepts', () => {
  gameState.reset();
  expect(gameState.evidence).toBeUndefined();
  expect(Events.EVIDENCE_SAVED).toBeUndefined();
  expect(Events.REDESIGN_VALIDATED).toBeUndefined();
  expect(Events.BADGE_UNLOCKED).toBeUndefined();
  expect(Events.ADVISOR_ASKED).toBeUndefined();
});

test('report exposes five weighted axes totaling one hundred operating points', () => {
  operatingState();
  const report = computeReport();
  expect(report.axes).toEqual({
    powerStability: expect.objectContaining({ max: 30, value: expect.any(Number), score: expect.any(Number) }),
    environment: expect.objectContaining({ max: 20, value: expect.any(Number), score: expect.any(Number) }),
    economy: expect.objectContaining({ max: 20, value: expect.any(Number), score: expect.any(Number) }),
    resourceUse: expect.objectContaining({ max: 15, value: expect.any(Number), score: expect.any(Number) }),
    operatingResponse: expect.objectContaining({ max: 15, value: expect.any(Number), score: expect.any(Number) }),
  });
  expect(Object.values(report.axes).reduce((sum, axis) => sum + axis.max, 0)).toBe(100);
  expect(report.operatingTotal).toBeCloseTo(
    Object.values(report.axes).reduce((sum, axis) => sum + axis.score, 0) - report.penalties,
    1,
  );
  expect(report.operatingTotal).toBeGreaterThan(0);
  expect(report.operatingTotal).toBeLessThanOrEqual(100);
});

test('report rates stress days against the full final exam length', () => {
  const examDays = STRESS_PHASES.reduce((sum, phase) => sum + phase.durationDays, 0);
  expect(examDays).toBe(41);

  operatingState();
  // 정전 1일 / 41일 = 97.56 무정전 점수. 27일로 나누면 96.3이 되어 비율이 부풀려진다.
  expect(computeReport().axes.powerStability.value).toBe(92.7);
});

test('the post-report concept quiz adds up to ten bonus points without changing operating score', () => {
  operatingState();
  const before = computeReport();
  gameState.quizResults['research:solar2'] = { correct: 4, total: 4 };
  expect(computeReport().quizBonus).toBe(0);
  gameState.quizResults['climate-council'] = { correct: 3, total: 4 };
  const after = computeReport();
  expect(after.operatingTotal).toBe(before.operatingTotal);
  expect(after.quizBonus).toBe(7.5);
  expect(after.totalWithBonus).toBe(after.operatingTotal + 7.5);
});

test('city profiles distinguish renewable, stable, smart-grid, and industrial strategies', () => {
  expect(classifyCity({ renewableShare: 82, batteryEnergyUsed: 30, batteryDeliveredShare: 15, outageRate: 1, reserveMargin: 10, nuclearShare: 0, transmissionEfficiency: 91, playerDecisionCount: 2, installedPeakRatio: 1.1, averageNetIncome: 3, factoryIncomeShare: 20 }).id).toBe('renewable-self-reliant');
  expect(classifyCity({ renewableShare: 20, batteryEnergyUsed: 2, batteryDeliveredShare: 1, outageRate: 1, reserveMargin: 25, nuclearShare: 50, transmissionEfficiency: 88, playerDecisionCount: 1, installedPeakRatio: 1.4, averageNetIncome: 3, factoryIncomeShare: 20 }).id).toBe('stable-energy');
  expect(classifyCity({ renewableShare: 45, batteryEnergyUsed: 8, batteryDeliveredShare: 5, outageRate: 4, reserveMargin: 8, nuclearShare: 10, transmissionEfficiency: 95, playerDecisionCount: 5, installedPeakRatio: 1.15, averageNetIncome: 3, factoryIncomeShare: 20 }).id).toBe('smart-grid');
  expect(classifyCity({ renewableShare: 30, batteryEnergyUsed: 1, batteryDeliveredShare: 1, outageRate: 5, reserveMargin: 5, nuclearShare: 5, transmissionEfficiency: 85, playerDecisionCount: 1, installedPeakRatio: 1.5, averageNetIncome: 5, factoryIncomeShare: 42 }).id).toBe('industrial-growth');
});

test('export includes stress result, axes, profile, objectives, events, and decision counts', () => {
  operatingState();
  gameState.progression.completedObjectiveSetIds = ['transition-choice', 'specialization', 'resilience'];
  gameState.events.completed = [{ id: 'heat-1', type: 'heatwave' }];
  const exported = exportReport();
  expect(exported.finalScore.axes.powerStability.max).toBe(30);
  expect(exported.profile.id).toBeTruthy();
  expect(exported.stressTest.passed).toBe(true);
  expect(exported.completedObjectiveSets).toHaveLength(3);
  expect(exported.eventResults).toHaveLength(1);
  expect(exported.decisionCounts.batteryPolicyChanges).toBe(1);
  expect(exported).not.toHaveProperty('evidence');
});
