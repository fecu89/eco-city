import { gameState } from '../core/GameState.js';
import { FACILITIES } from '../core/Constants.js';
import { getBoardCoordinates, placementPreview, validatePlacement } from '../systems/BoardSystem.js';
import { eventBus, Events } from '../core/EventBus.js';
import { initCityScene3D, renderCityScene3D, setBuildPreviewMode, setCellClickHandler } from './CityScene3D.js';
import { formatCredits, round1 } from './format.js';

let sizeChipEl = null;
let onCellClick = () => {};
let sceneMounted = false;
let placementPreviewVisible = false;
let buildConfirmEls = null;
let candidateIndex = null;

function signed(value, digits = 1) {
  const rounded = digits === 2 ? Number(value.toFixed(2)) : round1(value);
  const prefix = rounded > 0 ? '+' : rounded < 0 ? '-' : '±';
  return `${prefix}${Math.abs(rounded).toFixed(digits)}`;
}

function setForecastMetric(metric, value, delta) {
  const root = buildConfirmEls?.metrics?.querySelector(`[data-metric="${metric}"]`);
  if (!root) return;
  root.querySelector('[data-value]').textContent = value;
  root.querySelector('[data-delta]').textContent = delta;
}

function syncForecastMetrics(validation) {
  if (!buildConfirmEls?.metrics) return;
  const forecast = validation.ok ? buildConfirmEls.getForecast?.(candidateIndex) : null;
  buildConfirmEls.metrics.classList.toggle('hidden', !forecast);
  if (!forecast) return;
  const { current, projected } = forecast;
  setForecastMetric('credit', `${signed(projected.netCredits, 2)}/h`, `Δ ${signed(projected.netCredits - current.netCredits, 2)}`);
  setForecastMetric(
    'power',
    `${round1(projected.deliveredPower)}/${round1(projected.demand)}E`,
    `공급 Δ ${signed(projected.deliveredPower - current.deliveredPower)}E`,
  );
  setForecastMetric('carbon', `CO₂ ${round1(projected.hourlyCarbon)}/h`, `Δ ${signed(projected.hourlyCarbon - current.hourlyCarbon)}`);
  setForecastMetric('water', `${round1(projected.hourlyWater)}/h`, `Δ ${signed(projected.hourlyWater - current.hourlyWater)}`);
}

function clearCandidate({ clearSelection = true } = {}) {
  if (clearSelection && gameState.selectedCell === candidateIndex) gameState.selectedCell = null;
  candidateIndex = null;
  buildConfirmEls?.root.classList.add('hidden');
}

function syncBuildConfirm() {
  if (!buildConfirmEls || candidateIndex == null || !placementPreviewVisible) {
    buildConfirmEls?.root.classList.add('hidden');
    return;
  }
  const facility = FACILITIES[gameState.selectedFacility];
  const validation = validatePlacement(gameState, gameState.selectedFacility, candidateIndex);
  buildConfirmEls.text.textContent = validation.ok
    ? `${facility.icon} ${facility.name} · ${formatCredits(facility.cost)} · ${candidateIndex + 1}번 대지`
    : validation.message;
  buildConfirmEls.confirm.disabled = !validation.ok;
  syncForecastMetrics(validation);
  buildConfirmEls.root.classList.remove('hidden');
}

function handleSceneCellClick(index) {
  const occupied = Boolean(gameState.grid[index]);
  if (!placementPreviewVisible || occupied) {
    onCellClick(index);
    return;
  }
  candidateIndex = index;
  gameState.selectedCell = index;
  syncBuildConfirm();
  renderGrid();
}

export function initGridView(gridElement, sizeChipElement, clickHandler, confirmElements = null) {
  sizeChipEl = sizeChipElement;
  onCellClick = clickHandler;
  buildConfirmEls = confirmElements;
  if (!sceneMounted) {
    initCityScene3D(gridElement);
    sceneMounted = true;
  }
  // 독에서 시설을 바꿔 고르면(같은 시설 다시 클릭해도) 미리보기가 즉시 갱신되도록 한다.
  eventBus.on(Events.BOARD_FACILITY_SELECTED, () => {
    clearCandidate();
    if (gameState.isEditable) renderGrid();
  });
  eventBus.on(Events.HUD_PANEL_CHANGED, ({ activePanel }) => {
    const nextVisible = activePanel === 'build';
    if (placementPreviewVisible === nextVisible) return;
    placementPreviewVisible = nextVisible;
    if (!nextVisible) clearCandidate();
    if (gameState.isEditable) renderGrid();
  });
  buildConfirmEls?.cancel.addEventListener('click', () => {
    clearCandidate();
    renderGrid();
  });
  buildConfirmEls?.confirm.addEventListener('click', () => {
    if (candidateIndex == null) return;
    const index = candidateIndex;
    if (!validatePlacement(gameState, gameState.selectedFacility, index).ok) {
      syncBuildConfirm();
      return;
    }
    clearCandidate({ clearSelection: false });
    onCellClick(index);
  });
}

function buildCellConfigs() {
  const { grid, selectedCell, expandedCells, selectedFacility } = gameState;
  const coords = getBoardCoordinates(gameState);
  const preview = gameState.isEditable && placementPreviewVisible
    ? placementPreview(selectedFacility, grid, coords)
    : null;

  return grid.map((cell, i) => {
    const base = {
      selected: selectedCell === i,
      newLand: expandedCells.has(i),
    };
    if (!cell) {
      return {
        ...base,
        empty: true,
        placementAllowed: validatePlacement(gameState, selectedFacility, i).ok,
        previewGood: !!preview?.good.has(i),
        previewBad: !!preview?.bad.has(i),
      };
    }
    return {
      ...base,
      empty: false,
      type: cell.type,
      level: cell.level,
    };
  });
}

export function renderGrid() {
  setCellClickHandler(handleSceneCellClick);
  sizeChipEl.textContent = `육각 반경 ${gameState.boardRadius} · ${gameState.grid.length}칸`;
  renderCityScene3D(buildCellConfigs(), gameState.boardRadius);
  setBuildPreviewMode({
    enabled: gameState.isEditable && placementPreviewVisible,
    type: gameState.selectedFacility,
    candidateIndex,
  });
  syncBuildConfirm();
}
