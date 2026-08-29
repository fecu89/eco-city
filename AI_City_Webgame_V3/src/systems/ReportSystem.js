import { REPORT_TIERS, BONUS_ROUND, STAGES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { calcMetrics } from './BoardSystem.js';
import { setStage } from './StageSystem.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// 4차시(발표·투표)는 게임 밖 교실 활동이라, 여기서 만드는 "성적표"는 발표를 대체하지 않는다.
// "진짜 시장"이라는 표현은 실제 학급 투표 결과와 겹치므로 등급 명칭에 쓰지 않는다.
export function computeReport() {
  const m = calcMetrics(gameState.grid, gameState.gridSize);
  const b = gameState.baseline;
  const good = gameState.evidence.filter((e) => e.good).length;

  const science = clamp(100 - Math.max(0, -m.balance) * 8 - m.carbon * 2.2 - Math.max(0, m.water - 10) * 2, 0, 100);
  const spatial = clamp(m.synergyLinks * 18 - m.conflictPairs * 12, 0, 100);
  const autonomy = clamp(good * 24 + (gameState.advisorQuestions >= 2 ? 10 : 4), 0, 100);
  const total = Math.round(science * 0.4 + spatial * 0.25 + autonomy * 0.25 + clamp(m.dev, 0, 100) * 0.1);
  const tier = REPORT_TIERS.find((t) => total >= t.min);

  return {
    metrics: m,
    baseline: b,
    science: Math.round(science),
    spatial: Math.round(spatial),
    autonomy: Math.round(autonomy),
    total,
    tier,
    devDelta: m.dev - b.dev,
    balanceDelta: Math.round((m.balance - b.balance) * 10) / 10,
    carbonDelta: m.carbon - b.carbon,
    evidenceGood: good,
  };
}

// 선택적 보너스 라운드: 예산을 줄인 채 이전보다 더 높은 종합 점수를 다시 달성해보는 도전.
// 빨리 끝낸 학생을 위한 확장 콘텐츠이며 필수 진행 단계가 아니다.
export function startBonusRound() {
  const report = computeReport();
  gameState.bonusRound = {
    active: true,
    creditMultiplier: BONUS_ROUND.creditMultiplier,
    priorTotal: report.total,
    targetTotal: report.total + 5,
  };
  gameState.credits = Math.max(4, Math.round(gameState.credits * BONUS_ROUND.creditMultiplier));
  setStage(STAGES.REDESIGN);
  eventBus.emit(Events.BONUS_ROUND_STARTED, gameState.bonusRound);
}

export function evaluateBonusRound() {
  const report = computeReport();
  const success = report.total >= gameState.bonusRound.targetTotal;
  if (success) {
    gameState.bonusRound.active = false;
    setStage(STAGES.REPORT);
  }
  return { ...report, success, target: gameState.bonusRound.targetTotal };
}

export function exportReport() {
  const report = computeReport();
  return {
    title: 'AI 시티를 구하라!',
    note: '게임 밸런스 수치는 교수학습용 상대값입니다. 에너지 비교 출처는 docs/gameplan.md 참고.',
    gridSize: gameState.gridSize,
    stage1Metrics: gameState.baseline,
    finalMetrics: report.metrics,
    finalScore: report,
    grid: gameState.grid,
    evidence: gameState.evidence,
    reflection: gameState.reflection,
    transcripts: gameState.transcripts,
    badges: [...gameState.badges],
    createdAt: new Date().toISOString(),
  };
}
