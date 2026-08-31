import { REPORT_TIERS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { calcMetrics, getBoardCoordinates } from './BoardSystem.js';
import { carbonPressureForHours } from './CarbonCrisisSystem.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round1 = (value) => Math.round(value * 10) / 10;

function knowledgeResult(quizResults) {
  const totals = Object.values(quizResults || {}).reduce((sum, result) => {
    const total = Math.max(0, Number(result?.total) || 0);
    const correct = clamp(Number(result?.correct) || 0, 0, total);
    return { correct: sum.correct + correct, total: sum.total + total };
  }, { correct: 0, total: 0 });
  const accuracy = totals.total ? totals.correct / totals.total : 0;
  return {
    correct: totals.correct,
    total: totals.total,
    accuracy: Math.round(accuracy * 100),
    score: round1(accuracy * 20),
  };
}

function operationsScore(operations) {
  if (!operations.hours) return 0;
  const lowCarbon = clamp(operations.averageLowCarbonPercent / 100, 0, 1) * 15;
  const outageRate = clamp(1 - operations.essentialOutageHours / operations.hours, 0, 1);
  const power = outageRate * 10
    + clamp(operations.averageTransmissionEfficiency / 100, 0, 1) * 5;
  const economy = clamp((operations.averageNetCredits + 2) / 6, 0, 1) * 10;
  const staffing = clamp((operations.averageEmploymentRate + operations.averageIndustryFill) / 200, 0, 1) * 6;
  const socialCostPerHour = (operations.overcrowdingCost + operations.healthCost) / operations.hours;
  const social = clamp(1 - socialCostPerHour / 2, 0, 1) * 4;
  return round1(lowCarbon + power + economy + staffing + social);
}

// 15개 퀘스트의 실제 운영 기록을 요약한다. 별도 일괄 검증 관문은 만들지 않는다.
export function computeReport() {
  const staticMetrics = calcMetrics(gameState.grid, getBoardCoordinates(gameState));
  const live = gameState.lastTickSummary;
  const m = {
    ...staticMetrics,
    carbon: live?.hourlyCarbon ?? staticMetrics.carbon,
    water: live?.hourlyWater ?? staticMetrics.water,
    demand: live?.demand ?? staticMetrics.demand,
    reliableSupply: live?.deliveredPower ?? staticMetrics.reliableSupply,
    balance: live ? Math.round((live.deliveredPower - live.demand) * 10) / 10 : staticMetrics.balance,
  };
  const b = gameState.baseline || m;
  const totals = gameState.simulationTotals;
  const hours = Math.max(1, totals.hours);
  const operations = {
    hours: totals.hours,
    averageNetCredits: Math.round((totals.netCredits / hours) * 100) / 100,
    averageTransmissionEfficiency: Math.round((totals.transmissionEfficiency / hours) * 100),
    averageLowCarbonPercent: Math.round(totals.lowCarbonPercent / hours),
    averageEmploymentRate: Math.round((totals.employmentRate / hours) * 100),
    averageIndustryFill: Math.round((totals.industryFill / hours) * 100),
    essentialOutageHours: totals.essentialOutageHours,
    overcrowdingCost: Math.round(totals.overcrowding * 10) / 10,
    healthCost: Math.round(totals.health * 10) / 10,
  };

  const sustainability = clamp(100 - Math.max(0, -m.balance) * 8 - m.carbon * 2.2 - Math.max(0, m.water - 10) * 2, 0, 100);
  const spatial = clamp(m.synergyLinks * 18 - m.conflictPairs * 12, 0, 100);
  const penalties = (gameState.emergencySupport?.economyScorePenalty || 0)
    + carbonPressureForHours(gameState.carbonCrisisHours).reportPenalty;
  const operationScore = Math.max(0, round1(operationsScore(operations) - penalties));
  const designScore = round1(
    sustainability / 100 * 15
    + spatial / 100 * 10
    + clamp(m.dev, 0, 100) / 100 * 5,
  );
  const knowledge = knowledgeResult(gameState.quizResults);
  const total = Math.round(operationScore + designScore + knowledge.score);
  const tier = REPORT_TIERS.find((t) => total >= t.min);

  return {
    metrics: m,
    baseline: b,
    sustainability: Math.round(sustainability),
    spatial: Math.round(spatial),
    autonomy: knowledge.accuracy,
    operationsScore: operationScore,
    designScore,
    knowledgeScore: knowledge.score,
    knowledgeAccuracy: knowledge.accuracy,
    quizCorrect: knowledge.correct,
    quizTotal: knowledge.total,
    total,
    tier,
    operations,
    penalties,
    devDelta: m.dev - b.dev,
    balanceDelta: Math.round((m.balance - b.balance) * 10) / 10,
    carbonDelta: m.carbon - (b.carbon ?? m.carbon),
    waterDelta: m.water - (b.water ?? m.water),
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
    grid: gameState.grid,
    completedQuests: [...gameState.claimedQuestIds],
    operations: report.operations,
    quizResults: gameState.quizResults,
    createdAt: new Date().toISOString(),
  };
}
