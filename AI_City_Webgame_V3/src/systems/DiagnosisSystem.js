import { GAME, STAGES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { getCellSpatial, expandGrid } from './BoardSystem.js';
import { setStage } from './StageSystem.js';

// 진단은 항상 1차 도시(스냅샷, 5×5)를 대상으로 한다 — 재설계 전 원본 실수를 되짚어보는 단계이기 때문.
function snapshotSize() {
  return GAME.INITIAL_GRID_SIZE;
}

export function problemTileIndices() {
  const snapshot = gameState.firstCitySnapshot || [];
  const size = snapshotSize();
  const indices = [];
  snapshot.forEach((cell, i) => {
    if (!cell) return;
    if (getCellSpatial(snapshot, i, size).warnings.length) indices.push(i);
  });
  return indices;
}

export function scanTile(index) {
  const snapshot = gameState.firstCitySnapshot || [];
  const cell = snapshot[index];
  if (!cell) return { ok: false, reason: 'empty' };
  if (gameState.diagnosisFound.has(index)) return { ok: false, reason: 'already_found' };

  const spatial = getCellSpatial(snapshot, index, snapshotSize());
  gameState.diagnosisFound.add(index);
  const isProblem = spatial.warnings.length > 0;
  eventBus.emit(Events.DIAGNOSIS_TILE_FOUND, { index, isProblem, warnings: spatial.warnings, positive: spatial.positive, cell });

  const problems = problemTileIndices();
  const foundAll = problems.length > 0 && problems.every((i) => gameState.diagnosisFound.has(i));
  if (foundAll) {
    eventBus.emit(Events.DIAGNOSIS_COMPLETE, { noHints: !gameState.diagnosisHintUsed, total: problems.length });
  }
  return { ok: true, isProblem, warnings: spatial.warnings };
}

export function useHint() {
  const remaining = problemTileIndices().filter((i) => !gameState.diagnosisFound.has(i));
  if (!remaining.length) return null;
  gameState.diagnosisHintUsed = true;
  return remaining[0];
}

export function diagnosisProgress() {
  const problems = problemTileIndices();
  const found = problems.filter((i) => gameState.diagnosisFound.has(i)).length;
  return { found, total: problems.length };
}

// 진단을 마치면 6×6으로 확장하고 3단계 전용 친환경 시설을 해금한다 — 재설계는 여기서부터 시작.
export function finishDiagnosis() {
  if (gameState.stage !== STAGES.DIAGNOSIS) return;
  gameState.credits += GAME.EXPANSION_BONUS_CREDITS;
  gameState.selectedFacility = 'solar';
  expandGrid(GAME.EXPANDED_GRID_SIZE);
  setStage(STAGES.REDESIGN);
}
