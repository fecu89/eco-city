import { REPORT_RULES, REPORT_TIERS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { calcMetrics, getBoardCoordinates } from './BoardSystem.js';
import { carbonPressureForHours } from './CarbonCrisisSystem.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const percent = (part, whole, fallback = 0) => whole > 0 ? part / whole * 100 : fallback;

function axis(value, max) {
  const normalized = round1(clamp(value));
  return { value: normalized, max, score: round1(normalized / 100 * max) };
}

function operationSnapshot(state, metrics) {
  const totals = state.simulationTotals;
  const hours = Math.max(1, totals.hours || 0);
  const deliveredEnergy = totals.deliveredEnergy || 0;
  const averageLowCarbonPercent = round1((totals.lowCarbonPercent || 0) / hours);
  const peakDemand = totals.peakDemand || metrics.demand || 0;
  const peakAvailableSupply = totals.peakAvailableSupply || metrics.reliableSupply || 0;
  const playerDecisionCount = (state.decisionCounts.modeChanges || 0)
    + (state.decisionCounts.priorityChanges || 0)
    + (state.decisionCounts.researchPauses || 0)
    + (state.decisionCounts.batteryPolicyChanges || 0);
  return {
    hours: totals.hours || 0,
    averageNetIncome: round2((totals.netCredits || 0) / hours),
    averageTransmissionEfficiency: round1((totals.transmissionEfficiency || 0) / hours * 100),
    averageLowCarbonPercent,
    averageEmploymentRate: round1((totals.employmentRate || 0) / hours * 100),
    averageIndustryFill: round1((totals.industryFill || 0) / hours * 100),
    essentialOutageHours: totals.essentialOutageHours || 0,
    overcrowdingCost: round1(totals.overcrowding || 0),
    healthCost: round1(totals.health || 0),
    deliveredEnergy: round2(deliveredEnergy),
    renewableShare: round1(percent(totals.renewableDeliveredEnergy || 0, deliveredEnergy, averageLowCarbonPercent)),
    nuclearShare: round1(percent(totals.nuclearDeliveredEnergy || 0, deliveredEnergy)),
    batteryEnergyUsed: round2(totals.batteryEnergyUsed || 0),
    batteryDeliveredShare: round1(percent(totals.batteryEnergyUsed || 0, deliveredEnergy)),
    outageRate: round1(percent(totals.essentialOutageHours || 0, hours)),
    reserveMargin: round1(peakDemand > 0 ? (peakAvailableSupply - peakDemand) / peakDemand * 100 : 0),
    installedPeakRatio: round2(peakDemand > 0 ? (metrics.reliableSupply || peakAvailableSupply) / peakDemand : 0),
    factoryIncomeShare: round1(percent(totals.factoryIncome || 0, totals.grossIncome || 0)),
    playerDecisionCount,
    peakDemand: round2(peakDemand),
    peakAvailableSupply: round2(peakAvailableSupply),
  };
}

function fallbackStress(operations, state) {
  const hours = Math.max(1, operations.hours);
  return {
    blackoutHours: operations.essentialOutageHours,
    minimumEssentialSupply: operations.essentialOutageHours ? 0 : 100,
    averageEssentialSupply: clamp(100 - operations.outageRate),
    averageNetIncome: operations.averageNetIncome,
    carbonRiskHours: state.carbonCrisisHours || 0,
    waterViolationHours: 0,
    batteryEnergyUsed: operations.batteryEnergyUsed,
    recoveryHours: 4,
    maxConsecutiveBankruptcyHours: 0,
    finalCredits: state.credits,
    passed: state.campaignComplete,
    hours,
  };
}

function scoreAxes(operations, stress, state) {
  const stressHours = 27;
  const outageSafety = clamp(100 - percent(stress.blackoutHours || 0, stressHours));
  const powerStability = clamp(
    (stress.averageEssentialSupply || 0) * 0.5
      + outageSafety * 0.3
      + (stress.minimumEssentialSupply || 0) * 0.2,
  );
  const carbonSafety = clamp(100 - percent(stress.carbonRiskHours || 0, stressHours));
  const environment = clamp(operations.averageLowCarbonPercent * 0.65 + carbonSafety * 0.35);
  const incomeHealth = clamp((operations.averageNetIncome + 2) / 7 * 100);
  const creditRecovery = clamp((stress.finalCredits || 0) / 20 * 100);
  const economy = incomeHealth * 0.7 + creditRecovery * 0.3;
  const waterSafety = clamp(100 - percent(stress.waterViolationHours || 0, stressHours));
  const socialCostPerHour = (operations.overcrowdingCost + operations.healthCost) / Math.max(1, operations.hours);
  const socialSafety = clamp(100 - socialCostPerHour / 2 * 100);
  const resourceUse = operations.averageTransmissionEfficiency * 0.6 + waterSafety * 0.25 + socialSafety * 0.15;
  const decisionScore = clamp(operations.playerDecisionCount / 5 * 100);
  const recoveryScore = clamp((5 - (stress.recoveryHours || 4)) / 4 * 100);
  const reserveResponse = clamp((stress.batteryEnergyUsed || 0) / 10 * 100);
  const operatingResponse = decisionScore * 0.5 + recoveryScore * 0.3 + reserveResponse * 0.2;
  const weights = REPORT_RULES.AXIS_WEIGHTS;
  return {
    powerStability: axis(powerStability, weights.powerStability),
    environment: axis(environment, weights.environment),
    economy: axis(economy, weights.economy),
    resourceUse: axis(resourceUse, weights.resourceUse),
    operatingResponse: axis(operatingResponse, weights.operatingResponse),
  };
}

function profileCandidate(id, title, qualifies, margin, reasons) {
  return { id, title, qualifies, margin, reasons };
}

export function classifyCity(report) {
  const thresholds = REPORT_RULES.PROFILE;
  const candidates = [
    profileCandidate(
      'renewable-self-reliant',
      '재생에너지 자립형',
      report.renewableShare >= thresholds.renewable.renewable
        && report.batteryEnergyUsed >= thresholds.renewable.batteryEnergy
        && report.batteryDeliveredShare >= thresholds.renewable.batteryShare,
      (report.renewableShare / thresholds.renewable.renewable
        + report.batteryEnergyUsed / thresholds.renewable.batteryEnergy
        + report.batteryDeliveredShare / thresholds.renewable.batteryShare) / 3 - 1,
      [`재생전력 ${report.renewableShare}%`, `배터리 공급 ${report.batteryEnergyUsed}E · ${report.batteryDeliveredShare}%`],
    ),
    profileCandidate(
      'stable-energy',
      '안정 에너지형',
      report.outageRate <= thresholds.stable.outageRate
        && report.reserveMargin >= thresholds.stable.reserveMargin
        && report.nuclearShare >= thresholds.stable.nuclearShare,
      ((thresholds.stable.outageRate + 1) / (report.outageRate + 1)
        + report.reserveMargin / thresholds.stable.reserveMargin
        + report.nuclearShare / thresholds.stable.nuclearShare) / 3 - 1,
      [`정전율 ${report.outageRate}%`, `예비율 ${report.reserveMargin}% · 원전 ${report.nuclearShare}%`],
    ),
    profileCandidate(
      'smart-grid',
      '스마트 그리드형',
      report.transmissionEfficiency >= thresholds.smart.transmissionEfficiency
        && report.playerDecisionCount >= thresholds.smart.decisions
        && report.installedPeakRatio <= thresholds.smart.peakRatio,
      (report.transmissionEfficiency / thresholds.smart.transmissionEfficiency
        + report.playerDecisionCount / thresholds.smart.decisions
        + thresholds.smart.peakRatio / Math.max(0.01, report.installedPeakRatio)) / 3 - 1,
      [`송전효율 ${report.transmissionEfficiency}%`, `직접 운영 ${report.playerDecisionCount}회 · 설비비 ${report.installedPeakRatio}`],
    ),
    profileCandidate(
      'industrial-growth',
      '산업 성장형',
      report.averageNetIncome >= thresholds.industrial.netIncome
        && report.factoryIncomeShare >= thresholds.industrial.factoryIncomeShare,
      (report.averageNetIncome / thresholds.industrial.netIncome
        + report.factoryIncomeShare / thresholds.industrial.factoryIncomeShare) / 2 - 1,
      [`평균 순수익 ${report.averageNetIncome}/h`, `공장 수입 비중 ${report.factoryIncomeShare}%`],
    ),
  ];
  const qualified = candidates.filter(({ qualifies }) => qualifies);
  const selected = [...(qualified.length ? qualified : candidates)].sort((a, b) => b.margin - a.margin)[0];
  return { ...selected, developing: qualified.length === 0 };
}

export function computeReport() {
  const staticMetrics = calcMetrics(gameState.grid, getBoardCoordinates(gameState));
  const live = gameState.lastTickSummary;
  const metrics = {
    ...staticMetrics,
    carbon: live?.hourlyCarbon ?? staticMetrics.carbon,
    water: live?.hourlyWater ?? staticMetrics.water,
    demand: live?.demand ?? staticMetrics.demand,
    reliableSupply: live?.deliveredPower ?? staticMetrics.reliableSupply,
    balance: live ? round1(live.deliveredPower - live.demand) : staticMetrics.balance,
  };
  const operations = operationSnapshot(gameState, metrics);
  const stress = gameState.stressTest?.result || fallbackStress(operations, gameState);
  const axes = scoreAxes(operations, stress, gameState);
  const penalties = (gameState.emergencySupport?.economyScorePenalty || 0)
    + carbonPressureForHours(gameState.carbonCrisisHours).reportPenalty;
  const rawOperating = Object.values(axes).reduce((sum, item) => sum + item.score, 0);
  const operatingTotal = round1(clamp(rawOperating - penalties));
  const finalQuiz = gameState.quizResults?.['climate-council'];
  const quizCorrect = clamp(Number(finalQuiz?.correct) || 0, 0, 4);
  const quizBonus = round1(Math.min(
    REPORT_RULES.QUIZ_MAX_BONUS,
    quizCorrect * REPORT_RULES.QUIZ_POINTS_PER_CORRECT,
  ));
  const totalWithBonus = round1(operatingTotal + quizBonus);
  const profileMetrics = {
    renewableShare: operations.renewableShare,
    batteryEnergyUsed: operations.batteryEnergyUsed,
    batteryDeliveredShare: operations.batteryDeliveredShare,
    outageRate: operations.outageRate,
    reserveMargin: operations.reserveMargin,
    nuclearShare: operations.nuclearShare,
    transmissionEfficiency: operations.averageTransmissionEfficiency,
    playerDecisionCount: operations.playerDecisionCount,
    installedPeakRatio: operations.installedPeakRatio,
    averageNetIncome: operations.averageNetIncome,
    factoryIncomeShare: operations.factoryIncomeShare,
  };
  const profile = classifyCity(profileMetrics);
  const tier = REPORT_TIERS.find((item) => totalWithBonus >= item.min) || REPORT_TIERS.at(-1);
  return {
    metrics,
    baseline: gameState.baseline || metrics,
    axes,
    operatingTotal,
    quizBonus,
    totalWithBonus,
    profile,
    profileMetrics,
    operations,
    stress,
    penalties,
    tier,
    quizCorrect,
    quizTotal: finalQuiz?.total || 4,
    // v5 report consumers retain readable aliases while new UI uses the fields above.
    operationsScore: operatingTotal,
    designScore: 0,
    knowledgeScore: quizBonus,
    knowledgeAccuracy: finalQuiz ? Math.round(quizCorrect / 4 * 100) : 0,
    total: totalWithBonus,
  };
}

export function exportReport() {
  const report = computeReport();
  return {
    title: '2040 기후 생존 도시',
    note: '게임 밸런스 수치는 기후·에너지 시스템 학습용 상대값입니다.',
    boardRadius: gameState.boardRadius,
    baselineMetrics: gameState.baseline,
    finalMetrics: report.metrics,
    finalScore: report,
    profile: report.profile,
    stressTest: gameState.stressTest.result,
    grid: gameState.grid,
    completedQuests: [...gameState.claimedQuestIds],
    completedObjectiveSets: [...gameState.progression.completedObjectiveSetIds],
    eventResults: [...gameState.events.completed],
    decisionCounts: { ...gameState.decisionCounts },
    research: {
      completedIds: [...gameState.research.completedIds],
      techLevels: { ...gameState.research.techLevels },
    },
    operations: report.operations,
    quizResults: gameState.quizResults,
    createdAt: new Date().toISOString(),
  };
}
