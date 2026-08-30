import { BOARD } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { scanTile, diagnosisProgress, diagnosisRiskAt, useHint, problemTileIndices, nextDiagnosisTarget, setDiagnosisScannerActive } from '../systems/DiagnosisSystem.js';
import { renderCityScene3D, setCellClickHandler } from './CityScene3D.js';
import { eventBus, Events } from '../core/EventBus.js';

let sizeChipEl = null;
let progressEl = null;
let hintBtnEl = null;
let toggleBtnEl = null;

export function initDiagnosisView(gridElement, sizeChipElement, progressElement, hintButtonElement, toggleButtonElement) {
  // gridElement는 GridView.initGridView()가 이미 3D 씬을 마운트해뒀으므로 여기서는 참조만 한다.
  sizeChipEl = sizeChipElement;
  progressEl = progressElement;
  hintBtnEl = hintButtonElement;
  toggleBtnEl = toggleButtonElement;
  toggleBtnEl?.addEventListener('click', () => {
    setDiagnosisScannerActive(!gameState.diagnosisScannerActive);
    renderDiagnosisGrid();
  });
}

function buildDiagnosisConfigs() {
  const snapshot = gameState.firstCitySnapshot || [];
  const target = gameState.diagnosisScannerActive ? nextDiagnosisTarget() : null;
  return snapshot.map((cell, i) => {
    if (!cell) return { empty: true, disabled: true };
    const found = gameState.diagnosisFound.has(i);
    let diagnosisState = 'unknown';
    if (found) diagnosisState = diagnosisRiskAt(i) ? 'problem' : 'ok';
    return { empty: false, type: cell.type, level: cell.level, diagnosisState, diagnosisTarget: target === i };
  });
}

export function renderDiagnosisGrid() {
  setCellClickHandler(handleScan);
  sizeChipEl.textContent = `육각 반경 ${BOARD.INITIAL_RADIUS} · 1차 도시 스캔`;
  renderCityScene3D(buildDiagnosisConfigs(), BOARD.INITIAL_RADIUS);
  renderProgress();
  updateHintButton();
  if (toggleBtnEl) {
    toggleBtnEl.textContent = `스캐너 ${gameState.diagnosisScannerActive ? '켜짐' : '꺼짐'}`;
    toggleBtnEl.classList.toggle('off', !gameState.diagnosisScannerActive);
    toggleBtnEl.setAttribute('aria-pressed', String(gameState.diagnosisScannerActive));
  }
}

function handleScan(index) {
  const result = scanTile(index);
  if (result.reason === 'scanner_off') {
    eventBus.emit(Events.TOAST_SHOW, { title: '위험 스캐너가 꺼져 있습니다.', text: '퀘스트 카드나 지도 왼쪽 아래에서 스캐너를 켜세요.' });
  }
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
  progressEl.textContent = total
    ? `스캐너 ${gameState.diagnosisScannerActive ? 'ON' : 'OFF'} · 청록색 표시를 눌러 위험 지점 발견 ${found} / ${total}`
    : '이 도시에는 눈에 띄는 배치 문제가 없습니다 — 재설계로 진행하세요.';
}
