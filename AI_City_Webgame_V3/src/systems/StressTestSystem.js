import { CARBON_CRISIS, STAGES, STRESS_TEST_RULES } from '../core/Constants.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';
import { QUESTS } from '../core/QuestDefinitions.js';
import { STRESS_PHASES, stressTestTotalDays } from '../core/EventDefinitions.js';
import {
  cityModifierForClimate,
  facilityModifierForClimate,
} from './ClimateModifierSystem.js';
import { isOperationalCell } from './ConstructionProjectSystem.js';

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

function emptyMetrics() {
  return {
    days: 0,
    essentialSupplyTotal: 0,
    blackoutDays: 0,
    minimumEssentialSupply: 100,
    netIncome: 0,
    carbonTotal: 0,
    carbonRiskDays: 0,
    daysAtOrBelowEight: 0,
    daysAboveTen: 0,
    waterViolationDays: 0,
    batteryEnergyUsed: 0,
    tidalEnergyDelivered: 0,
    recoveryAchievedAtDay: null,
    consecutiveBankruptcyDays: 0,
    maxConsecutiveBankruptcyDays: 0,
  };
}

// 최종시험 진행률(0~1). 퀘스트 진행 바와 시험 패널이 같은 값을 쓴다.
export function stressTestProgressFraction(state) {
  const stress = state?.stressTest;
  if (!stress) return 0;
  if (stress.status === 'passed') return 1;
  const completedDays = STRESS_PHASES
    .slice(0, stress.phaseIndex)
    .reduce((sum, phase) => sum + phase.durationDays, 0) + (stress.phaseDay || 0);
  return Math.max(0, Math.min(1, completedDays / stressTestTotalDays()));
}

export function currentStressPhase(state) {
  if (state.stressTest?.status !== 'running') return null;
  return STRESS_PHASES[state.stressTest.phaseIndex] || null;
}

export function stressModifierForFacility(state, facilityType, level = 1) {
  return facilityModifierForClimate(currentStressPhase(state), facilityType, level);
}

// 시험 물 한도는 절대값이 아니라 "시험을 시작한 날 도시가 쓰던 물"을 기준으로 잡는다.
export function stressTestWaterBaseline(state) {
  const stored = Number(state?.stressTest?.waterBaseline);
  return Number.isFinite(stored) && stored > 0 ? stored : STRESS_TEST_RULES.DEFAULT_WATER_LIMIT;
}

export function stressCityModifier(state, { baselineWater = stressTestWaterBaseline(state) } = {}) {
  return cityModifierForClimate(currentStressPhase(state), { baselineWater });
}

function hasTidalEntry(state) {
  return state.research?.completedIds?.has?.('tidal1') === true
    && state.grid.some((cell) => isOperationalCell(cell) && cell.type === 'tidal');
}

export function startStressTest(state) {
  if (!['ready', 'failed'].includes(state.stressTest?.status)) {
    return { ok: false, reason: 'stress_test_not_ready' };
  }
  if (!hasTidalEntry(state)) return { ok: false, reason: 'tidal_required' };
  state.events.activeId = null;
  state.events.currentMetrics = null;
  const measuredWater = Number(state.lastTickSummary?.dailyWater);
  state.stressTest = {
    status: 'running',
    phaseIndex: 0,
    phaseDay: 0,
    result: null,
    metrics: emptyMetrics(),
    startedAtDay: state.elapsedGameDays,
    attempts: (state.stressTest.attempts || 0) + 1,
    // 시험 내내 쓰이는 물 기준선은 시작 순간의 실제 사용량으로 고정한다.
    waterBaseline: round1(Number.isFinite(measuredWater) && measuredWater > 0
      ? measuredWater
      : STRESS_TEST_RULES.DEFAULT_WATER_LIMIT),
  };
  return { ok: true, phase: STRESS_PHASES[0], attempts: state.stressTest.attempts };
}

function tidalDelivered(summary) {
  const delivered = Number(summary?.generationDeliveredByType?.tidal);
  return Number.isFinite(delivered) ? Math.max(0, delivered) : 0;
}

// 물 한도는 건조 위기 구간에만 걸린다. 그 밖의 날은 한도 자체가 없다.
function waterLimitFor(summary) {
  const limit = Number(summary?.waterLimit);
  return Number.isFinite(limit) && summary?.waterLimit != null ? limit : Infinity;
}

function recordDay(state, summary) {
  const metrics = state.stressTest.metrics;
  const phase = currentStressPhase(state);
  const essential = Math.max(0, Math.min(100, Number(summary.essentialSupplyPercent) || 0));
  const carbon = round1(Math.max(0, Number(summary.dailyCarbon) || 0));
  metrics.days += 1;
  metrics.essentialSupplyTotal += essential;
  metrics.minimumEssentialSupply = Math.min(metrics.minimumEssentialSupply, essential);
  if (essential < STRESS_TEST_RULES.HEALTHY_ESSENTIAL_SUPPLY_PERCENT) metrics.blackoutDays += 1;
  metrics.netIncome += Number(summary.netCredits) || 0;
  metrics.carbonTotal += carbon;
  if (carbon > STRESS_TEST_RULES.SAFE_CARBON_RATE) metrics.carbonRiskDays += 1;
  if (carbon <= STRESS_TEST_RULES.SAFE_CARBON_RATE) metrics.daysAtOrBelowEight += 1;
  if (carbon > STRESS_TEST_RULES.HIGH_CARBON_RATE) metrics.daysAboveTen += 1;
  if ((Number(summary.dailyWater) || 0) > waterLimitFor(summary)) metrics.waterViolationDays += 1;
  metrics.batteryEnergyUsed += Object.values(summary.batteryOperations || {})
    .reduce((sum, operation) => sum + (Number(operation.discharged) || 0), 0);
  if (phase?.id === 'coastalSuperstorm') metrics.tidalEnergyDelivered += tidalDelivered(summary);
  metrics.consecutiveBankruptcyDays = state.credits < 0
    ? metrics.consecutiveBankruptcyDays + 1
    : 0;
  metrics.maxConsecutiveBankruptcyDays = Math.max(
    metrics.maxConsecutiveBankruptcyDays,
    metrics.consecutiveBankruptcyDays,
  );
  if (phase?.id === 'recovery' && metrics.recoveryAchievedAtDay == null
    && essential >= STRESS_TEST_RULES.HEALTHY_ESSENTIAL_SUPPLY_PERCENT
    && (Number(summary.netCredits) || 0) >= 0) {
    metrics.recoveryAchievedAtDay = state.stressTest.phaseDay + 1;
  }
}

function diagnosis(result) {
  if (result.averageEssentialSupply < STRESS_TEST_RULES.PASS_ESSENTIAL_SUPPLY_PERCENT) {
    return { id: 'essential_average', label: `필수시설 평균 전력 공급이 ${STRESS_TEST_RULES.PASS_ESSENTIAL_SUPPLY_PERCENT}% 미만이었습니다.` };
  }
  if (result.minimumEssentialSupply < STRESS_TEST_RULES.MINIMUM_ESSENTIAL_SUPPLY_PERCENT) {
    return { id: 'essential_floor', label: `필수시설 공급률이 하루라도 ${STRESS_TEST_RULES.MINIMUM_ESSENTIAL_SUPPLY_PERCENT}% 아래로 내려갔습니다.` };
  }
  if (result.maxConsecutiveBankruptcyDays >= STRESS_TEST_RULES.BANKRUPTCY_FAILURE_DAYS) {
    return { id: 'bankruptcy', label: `연속 적자 상태가 ${STRESS_TEST_RULES.BANKRUPTCY_FAILURE_DAYS}일 이상 이어졌습니다.` };
  }
  if (result.finalCredits < 0) return { id: 'credit_recovery', label: '시험 종료까지 크레딧을 0 이상으로 복구하지 못했습니다.' };
  if (result.waterViolationDays > STRESS_TEST_RULES.MAX_WATER_VIOLATION_DAYS) {
    return { id: 'water', label: `물 제한 초과가 ${STRESS_TEST_RULES.MAX_WATER_VIOLATION_DAYS}일을 넘었습니다.` };
  }
  if (result.recoveryAchievedAtDay > STRESS_TEST_RULES.RECOVERY_DEADLINE_DAYS) {
    return { id: 'recovery', label: `최종 복구 ${STRESS_TEST_RULES.RECOVERY_DEADLINE_DAYS}일 안에 전력과 수익을 정상화하지 못했습니다.` };
  }
  if (result.tidalEnergyDelivered < STRESS_TEST_RULES.MIN_TIDAL_DELIVERY) {
    return { id: 'tidal', label: `해안 초강풍 구간의 조력 공급이 ${STRESS_TEST_RULES.MIN_TIDAL_DELIVERY}E 미만이었습니다.` };
  }
  if (result.averageCarbon > STRESS_TEST_RULES.MAX_AVERAGE_CARBON
    || result.daysAtOrBelowEight < STRESS_TEST_RULES.MIN_SAFE_CARBON_DAYS
    || result.daysAboveTen > STRESS_TEST_RULES.MAX_HIGH_CARBON_DAYS) {
    return { id: 'carbon', label: `${stressTestTotalDays()}일 탄소 조건을 모두 만족하지 못했습니다.` };
  }
  if (result.carbonExtreme) return { id: 'carbon_extreme', label: '탄소 위험이 극단 단계에 도달했습니다.' };
  return { id: 'survived', label: '도시가 모든 복합 위기를 견뎠습니다.' };
}

export function finishStressTest(state) {
  if (state.stressTest?.status !== 'running') return state.stressTest?.result || null;
  const metrics = state.stressTest.metrics || emptyMetrics();
  const averageEssentialSupply = metrics.days ? metrics.essentialSupplyTotal / metrics.days : 0;
  const averageCarbon = metrics.days ? metrics.carbonTotal / metrics.days : Infinity;
  const result = {
    days: metrics.days,
    blackoutDays: metrics.blackoutDays,
    minimumEssentialSupply: round1(metrics.minimumEssentialSupply),
    averageEssentialSupply: round1(averageEssentialSupply),
    averageNetIncome: round2(metrics.days ? metrics.netIncome / metrics.days : 0),
    carbonRiskDays: metrics.carbonRiskDays,
    daysAtOrBelowEight: metrics.daysAtOrBelowEight,
    daysAboveTen: metrics.daysAboveTen,
    averageCarbon: round2(averageCarbon),
    waterViolationDays: metrics.waterViolationDays,
    batteryEnergyUsed: round2(metrics.batteryEnergyUsed),
    tidalEnergyDelivered: round2(metrics.tidalEnergyDelivered),
    recoveryAchievedAtDay: metrics.recoveryAchievedAtDay ?? Infinity,
    recoveryDays: metrics.recoveryAchievedAtDay ?? STRESS_TEST_RULES.PHASE_DAYS.RECOVERY,
    maxConsecutiveBankruptcyDays: metrics.maxConsecutiveBankruptcyDays,
    finalCredits: round2(state.credits),
    carbonExtreme: state.carbonCrisisDays >= CARBON_CRISIS.GAME_OVER_DAYS || state.gameOverReason === 'carbon_extreme',
  };
  // 통과 총 일수는 최종시험 구간 일수의 합(settings.json FINAL_CLIMATE_PHASES)에서 파생한다. 리터럴로 두면 구간을
  // 조정하는 순간 어긋나 시험이 영구 실패한다.
  result.passed = result.days === stressTestTotalDays()
    && result.averageEssentialSupply >= STRESS_TEST_RULES.PASS_ESSENTIAL_SUPPLY_PERCENT
    && result.minimumEssentialSupply >= STRESS_TEST_RULES.MINIMUM_ESSENTIAL_SUPPLY_PERCENT
    && result.maxConsecutiveBankruptcyDays < STRESS_TEST_RULES.BANKRUPTCY_FAILURE_DAYS
    && result.finalCredits >= 0
    && result.waterViolationDays <= STRESS_TEST_RULES.MAX_WATER_VIOLATION_DAYS
    && result.recoveryAchievedAtDay <= STRESS_TEST_RULES.RECOVERY_DEADLINE_DAYS
    && result.tidalEnergyDelivered >= STRESS_TEST_RULES.MIN_TIDAL_DELIVERY
    && result.averageCarbon <= STRESS_TEST_RULES.MAX_AVERAGE_CARBON
    && result.daysAtOrBelowEight >= STRESS_TEST_RULES.MIN_SAFE_CARBON_DAYS
    && result.daysAboveTen <= STRESS_TEST_RULES.MAX_HIGH_CARBON_DAYS
    && !result.carbonExtreme;
  result.diagnosis = diagnosis(result);
  state.stressTest.status = result.passed ? 'passed' : 'failed';
  state.stressTest.result = result;
  state.stressTest.metrics = null;
  state.campaignComplete = result.passed;
  if (result.passed) {
    state.progression.chapter = 4;
    // 최종시험 통과가 곧 19단계 완료다. 보고서의 완료 퀘스트 목록에도 들어가야 한다.
    state.claimedQuestIds.add(QUESTS[CAMPAIGN_QUEST_INDEXES.FINAL_TEST - 1].id);
    state.questStatus = 'claimed';
    state.stage = STAGES.REPORT;
  }
  return result;
}

export function advanceStressTest(state, summary) {
  if (state.stressTest?.status !== 'running') return null;
  const phase = currentStressPhase(state);
  recordDay(state, summary);
  state.stressTest.phaseDay += 1;
  let phaseEnded = null;
  let phaseStarted = null;
  if (state.stressTest.phaseDay >= phase.durationDays) {
    phaseEnded = phase;
    state.stressTest.phaseIndex += 1;
    state.stressTest.phaseDay = 0;
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
