import { REPORT_TIERS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { calcMetrics, getBoardCoordinates } from './BoardSystem.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// 15개 퀘스트의 실제 운영 기록을 요약한다. 별도 일괄 검증 관문은 만들지 않는다.
export function computeReport() {
  const m = calcMetrics(gameState.grid, getBoardCoordinates(gameState));
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
  const autonomy = clamp((gameState.claimedQuestIds.size / 15) * 80 + Object.values(gameState.quizResults).filter((result) => result.passed).length * 7, 0, 100);
  const total = Math.round(sustainability * 0.4 + spatial * 0.25 + autonomy * 0.25 + clamp(m.dev, 0, 100) * 0.1);
  const tier = REPORT_TIERS.find((t) => total >= t.min);

  return {
    metrics: m,
    baseline: b,
    sustainability: Math.round(sustainability),
    spatial: Math.round(spatial),
    autonomy: Math.round(autonomy),
    total,
    tier,
    operations,
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
