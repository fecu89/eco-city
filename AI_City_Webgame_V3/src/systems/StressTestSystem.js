import { CARBON_CRISIS, STRESS_TEST_RULES } from '../core/Constants.js';
import { STRESS_PHASES } from '../core/EventDefinitions.js';
import { eventModifierForFacility } from './CityEventSystem.js';

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

function emptyMetrics() {
  return {
    hours: 0,
    essentialSupplyTotal: 0,
    blackoutHours: 0,
    minimumEssentialSupply: 100,
    netIncome: 0,
    carbonRiskHours: 0,
    waterViolationHours: 0,
    batteryEnergyUsed: 0,
    recoveryHours: null,
    consecutiveBankruptcyHours: 0,
    maxConsecutiveBankruptcyHours: 0,
  };
}

export function currentStressPhase(state) {
  if (state.stressTest?.status !== 'running') return null;
  return STRESS_PHASES[state.stressTest.phaseIndex] || null;
}

export function stressModifierForFacility(state, facilityType) {
  const phase = currentStressPhase(state);
  if (!phase) return {};
  if (phase.id === 'heatwave' || phase.id === 'nightPeak') {
    return eventModifierForFacility(phase.id, facilityType);
  }
  if (phase.id === 'lowWindNight') {
    if (facilityType === 'wind') return { supply: 0.4 };
    if (facilityType === 'solar') return { supply: 0 };
  }
  return {};
}

export function startStressTest(state) {
  if (!['ready', 'failed'].includes(state.stressTest?.status)) {
    return { ok: false, reason: 'stress_test_not_ready' };
  }
  state.events.activeId = null;
  state.events.currentMetrics = null;
  state.stressTest = {
    status: 'running',
    phaseIndex: 0,
    phaseHour: 0,
    result: null,
    metrics: emptyMetrics(),
    startedAtHour: state.elapsedGameHours,
    attempts: (state.stressTest.attempts || 0) + 1,
  };
  return { ok: true, phase: STRESS_PHASES[0], attempts: state.stressTest.attempts };
}

function recordHour(state, summary) {
  const metrics = state.stressTest.metrics;
  const essential = Math.max(0, Math.min(100, Number(summary.essentialSupplyPercent) || 0));
  metrics.hours += 1;
  metrics.essentialSupplyTotal += essential;
  metrics.minimumEssentialSupply = Math.min(metrics.minimumEssentialSupply, essential);
  if (essential < STRESS_TEST_RULES.HEALTHY_ESSENTIAL_SUPPLY_PERCENT) metrics.blackoutHours += 1;
  metrics.netIncome += Number(summary.netCredits) || 0;
  if ((Number(summary.hourlyCarbon) || 0) > STRESS_TEST_RULES.SAFE_CARBON_RATE) metrics.carbonRiskHours += 1;
  const waterLimit = Number(summary.waterLimit) || STRESS_TEST_RULES.DEFAULT_WATER_LIMIT;
  if ((Number(summary.hourlyWater) || 0) > waterLimit) metrics.waterViolationHours += 1;
  metrics.batteryEnergyUsed += Object.values(summary.batteryOperations || {})
    .reduce((sum, operation) => sum + (Number(operation.discharged) || 0), 0);
  metrics.consecutiveBankruptcyHours = state.credits < 0
    ? metrics.consecutiveBankruptcyHours + 1
    : 0;
  metrics.maxConsecutiveBankruptcyHours = Math.max(
    metrics.maxConsecutiveBankruptcyHours,
    metrics.consecutiveBankruptcyHours,
  );
  const phase = currentStressPhase(state);
  if (phase?.id === 'recovery' && metrics.recoveryHours == null
    && essential >= STRESS_TEST_RULES.HEALTHY_ESSENTIAL_SUPPLY_PERCENT
    && (Number(summary.netCredits) || 0) >= 0) {
    metrics.recoveryHours = state.stressTest.phaseHour + 1;
  }
}

function diagnosis(result) {
  if (result.averageEssentialSupply < STRESS_TEST_RULES.PASS_ESSENTIAL_SUPPLY_PERCENT) {
    return { id: 'essential_supply', label: '필수시설 평균 전력 공급이 부족했습니다.' };
  }
  if (result.maxConsecutiveBankruptcyHours >= STRESS_TEST_RULES.BANKRUPTCY_FAILURE_HOURS) {
    return { id: 'bankruptcy', label: '연속 적자 상태가 6시간 이상 이어졌습니다.' };
  }
  if (result.finalCredits < 0) return { id: 'credit_recovery', label: '회복 단계 종료까지 크레딧이 0 이상으로 복구되지 않았습니다.' };
  if (result.carbonExtreme) return { id: 'carbon_extreme', label: '탄소 위험이 극단 단계에 도달했습니다.' };
  return { id: 'survived', label: '도시가 모든 복합 위기를 견뎠습니다.' };
}

export function finishStressTest(state) {
  if (state.stressTest?.status !== 'running') return state.stressTest?.result || null;
  const metrics = state.stressTest.metrics || emptyMetrics();
  const averageEssentialSupply = metrics.hours ? metrics.essentialSupplyTotal / metrics.hours : 0;
  const result = {
    blackoutHours: metrics.blackoutHours,
    minimumEssentialSupply: round1(metrics.minimumEssentialSupply),
    averageEssentialSupply: round1(averageEssentialSupply),
    averageNetIncome: round2(metrics.hours ? metrics.netIncome / metrics.hours : 0),
    carbonRiskHours: metrics.carbonRiskHours,
    waterViolationHours: metrics.waterViolationHours,
    batteryEnergyUsed: round2(metrics.batteryEnergyUsed),
    recoveryHours: metrics.recoveryHours ?? STRESS_TEST_RULES.PHASE_HOURS.RECOVERY,
    maxConsecutiveBankruptcyHours: metrics.maxConsecutiveBankruptcyHours,
    finalCredits: round2(state.credits),
    carbonExtreme: state.carbonCrisisHours >= CARBON_CRISIS.GAME_OVER_HOURS || state.gameOverReason === 'carbon_extreme',
  };
  result.passed = result.averageEssentialSupply >= STRESS_TEST_RULES.PASS_ESSENTIAL_SUPPLY_PERCENT
    && result.maxConsecutiveBankruptcyHours < STRESS_TEST_RULES.BANKRUPTCY_FAILURE_HOURS
    && result.finalCredits >= 0
    && !result.carbonExtreme;
  result.diagnosis = diagnosis(result);
  state.stressTest.status = result.passed ? 'passed' : 'failed';
  state.stressTest.result = result;
  state.stressTest.metrics = null;
  state.campaignComplete = result.passed;
  if (result.passed) state.progression.chapter = 4;
  return result;
}

export function advanceStressTest(state, summary) {
  if (state.stressTest?.status !== 'running') return null;
  const phase = currentStressPhase(state);
  recordHour(state, summary);
  state.stressTest.phaseHour += 1;
  let phaseEnded = null;
  let phaseStarted = null;
  if (state.stressTest.phaseHour >= phase.durationHours) {
    phaseEnded = phase;
    state.stressTest.phaseIndex += 1;
    state.stressTest.phaseHour = 0;
    phaseStarted = currentStressPhase(state);
  }
  const result = state.stressTest.phaseIndex >= STRESS_PHASES.length
    ? finishStressTest(state)
    : null;
  return {
    active: currentStressPhase(state),
    phaseEnded,
    phaseStarted,
    result,
    status: state.stressTest.status,
  };
}
