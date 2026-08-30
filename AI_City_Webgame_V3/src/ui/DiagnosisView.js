import { GAME } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { scanTile, diagnosisProgress, diagnosisRiskAt, useHint, problemTileIndices } from '../systems/DiagnosisSystem.js';
import { renderCityScene3D, setCellClickHandler } from './CityScene3D.js';

let sizeChipEl = null;
let progressEl = null;
let hintBtnEl = null;

export function initDiagnosisView(gridElement, sizeChipElement, progressElement, hintButtonElement) {
  // gridElement는 GridView.initGridView()가 이미 3D 씬을 마운트해뒀으므로 여기서는 참조만 한다.
  sizeChipEl = sizeChipElement;
  progressEl = progressElement;
  hintBtnEl = hintButtonElement;
}

function buildDiagnosisConfigs() {
  const snapshot = gameState.firstCitySnapshot || [];
  const size = GAME.INITIAL_GRID_SIZE;
  return snapshot.map((cell, i) => {
    if (!cell) return { empty: true, disabled: true };
    const found = gameState.diagnosisFound.has(i);
    let diagnosisState = 'unknown';
    if (found) diagnosisState = diagnosisRiskAt(i) ? 'problem' : 'ok';
    return { empty: false, type: cell.type, level: cell.level, diagnosisState };
  });
}

export function renderDiagnosisGrid() {
  setCellClickHandler(handleScan);
  sizeChipEl.textContent = `${GAME.INITIAL_GRID_SIZE}×${GAME.INITIAL_GRID_SIZE} · 1차 도시 스캔`;
  renderCityScene3D(buildDiagnosisConfigs(), GAME.INITIAL_GRID_SIZE);
  renderProgress();
  updateHintButton();
}

function handleScan(index) {
  const result = scanTile(index);
  if (!result.ok) return;
}

export function handleUseHint() {
  const index = useHint();
  if (index == null) return null;
  scanTile(index);
  return index;
}

function updateHintButton() {
  if (!hintBtnEl) return;
  const remaining = problemTileIndices().some((i) => !gameState.diagnosisFound.has(i));
  hintBtnEl.disabled = !remaining;
}

function renderProgress() {
  if (!progressEl) return;
  const { found, total } = diagnosisProgress();
  progressEl.textContent = total ? `문제 지점 발견: ${found} / ${total}` : '이 도시에는 눈에 띄는 배치 문제가 없습니다 — 재설계로 진행하세요.';
}
