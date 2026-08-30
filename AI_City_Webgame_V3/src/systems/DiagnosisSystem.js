import { GAME } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';

// 진단은 항상 1차 도시(스냅샷, 5×5)를 대상으로 한다 — 재설계 전 원본 실수를 되짚어보는 단계이기 때문.
function snapshotSize() {
  return GAME.INITIAL_GRID_SIZE;
}

export function problemTileIndices() {
  const snapshot = gameState.firstCitySnapshot || [];
  const size = snapshotSize();
  const risks = new Map();
  snapshot.forEach((cell, i) => {
    if (!cell) return;
    if (['thermal', 'factory'].includes(cell.type)) {
      risks.set(i, { kind: 'carbon', label: '탄소·대기오염 집중 위험' });
    }
  });
  snapshot.forEach((cell, index) => {
    if (!cell || !['data', 'nuclear'].includes(cell.type) || risks.has(index)) return;
    const row = Math.floor(index / size);
    const column = index % size;
    const hasCooling = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
      const r = row + dr;
      const c = column + dc;
      return r >= 0 && r < size && c >= 0 && c < size && snapshot[r * size + c]?.type === 'cooling';
    });
    if (!hasCooling) risks.set(index, { kind: 'cooling', label: '냉각·물 사용 집중 위험' });
  });
  (gameState.baseline?.routes || []).forEach((route) => {
    if (route.efficiency >= 0.88 || risks.has(route.to) || !snapshot[route.to]) return;
    risks.set(route.to, { kind: 'transmission', label: `송전 효율 ${Math.round(route.efficiency * 100)}% 위험` });
  });
  snapshot.forEach((cell, index) => {
    if (!cell || risks.size >= 3 || risks.has(index) || !['residential', 'factory', 'data', 'cooling'].includes(cell.type)) return;
    risks.set(index, { kind: 'transmission', label: '전력 공급 경로 점검 필요' });
  });
  snapshot.forEach((cell, index) => {
    if (!cell || risks.size >= 3 || risks.has(index)) return;
    risks.set(index, { kind: 'operation', label: '운영 비용·공간 연결 점검 필요' });
  });
  return [...risks.keys()].slice(0, 3);
}

export function diagnosisRiskAt(index) {
  if (!problemTileIndices().includes(index)) return null;
  const snapshot = gameState.firstCitySnapshot || [];
  const cell = snapshot[index];
  if (['thermal', 'factory'].includes(cell?.type)) return { kind: 'carbon', label: '탄소·대기오염 집중 위험' };
  if (['data', 'nuclear'].includes(cell?.type)) return { kind: 'cooling', label: '냉각·물 사용 집중 위험' };
  const route = (gameState.baseline?.routes || []).find((item) => item.to === index && item.efficiency < 0.88);
  if (route) return { kind: 'transmission', label: `송전 효율 ${Math.round(route.efficiency * 100)}% 위험` };
  if (['residential', 'factory', 'data', 'cooling'].includes(cell?.type)) return { kind: 'transmission', label: '전력 공급 경로 점검 필요' };
  return { kind: 'operation', label: '운영 비용·공간 연결 점검 필요' };
}

export function scanTile(index) {
  const snapshot = gameState.firstCitySnapshot || [];
  const cell = snapshot[index];
  if (!cell) return { ok: false, reason: 'empty' };
  const risk = diagnosisRiskAt(index);
  if (risk && gameState.diagnosisFound.has(index)) return { ok: false, reason: 'already_found' };
  const isProblem = !!risk;
  if (isProblem) gameState.diagnosisFound.add(index);
  eventBus.emit(Events.DIAGNOSIS_TILE_FOUND, { index, isProblem, warnings: risk ? [risk.label] : [], positive: [], cell, risk });

  const problems = problemTileIndices();
  const foundAll = problems.length > 0 && problems.every((i) => gameState.diagnosisFound.has(i));
  if (foundAll) {
    eventBus.emit(Events.DIAGNOSIS_COMPLETE, { noHints: !gameState.diagnosisHintUsed, total: problems.length });
  }
  return { ok: true, isProblem, warnings: risk ? [risk.label] : [] };
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
