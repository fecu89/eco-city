import { STAGES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { calcMetrics } from './BoardSystem.js';
import { setStage } from './StageSystem.js';

// 2단계 진입: 1차 도시(5×5)의 숨은 비용을 계산해 공개하고, 4단계 진단에서 다시 쓸 스냅샷을 남긴다.
export function revealCrisis() {
  if (gameState.stage !== STAGES.EXECUTION) return { ok: false };
  const baseline = calcMetrics(gameState.grid, gameState.gridSize);
  gameState.baseline = baseline;
  gameState.firstCitySnapshot = gameState.grid.map((c) => (c ? { ...c } : null));
  gameState.metrics = baseline;
  setStage(STAGES.CRISIS);
  return { ok: true, baseline };
}

export function proceedToConcepts() {
  if (gameState.stage !== STAGES.CRISIS) return;
  setStage(STAGES.CONCEPTS);
}
