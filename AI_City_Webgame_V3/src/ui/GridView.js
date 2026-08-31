import { gameState } from '../core/GameState.js';
import { getBoardCoordinates, placementPreview, validatePlacement } from '../systems/BoardSystem.js';
import { eventBus, Events } from '../core/EventBus.js';
import { initCityScene3D, renderCityScene3D, setBuildPreviewMode, setCellClickHandler } from './CityScene3D.js';
import { formatCompactNumber, formatCredits, round1 } from './format.js';
import {
  assessConstructionPlan,
  clearConstructionPlan,
  upsertPlannedFacility,
} from '../systems/ConstructionPlanSystem.js';
import {
  cellZoneTrait,
  constructionCostForCell,
  isExpansionCellActive,
} from '../systems/ZoneSystem.js';

let sizeChipEl = null;
let onCellClick = () => {};
let sceneMounted = false;
let placementPreviewVisible = false;
let buildConfirmEls = null;

function signed(value, digits = 1) {
  const rounded = digits === 2 ? Number(value.toFixed(2)) : round1(value);
  const prefix = rounded > 0 ? '+' : rounded < 0 ? '-' : '±';
  return `${prefix}${formatCompactNumber(Math.abs(rounded), { fractionDigits: digits })}`;
}

function setForecastMetric(metric, value, delta) {
  const root = buildConfirmEls?.metrics?.querySelector(`[data-metric="${metric}"]`);
  if (!root) return;
  root.querySelector('[data-value]').textContent = value;
  root.querySelector('[data-delta]').textContent = delta;
}

function syncForecastMetrics(assessment) {
  if (!buildConfirmEls?.metrics) return;
  const forecast = assessment.items.length
    ? buildConfirmEls.getForecast?.(assessment.projectedGrid)
    : null;
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
  setForecastMetric(
    'labor',
    `${formatCompactNumber(projected.labor.used, { fractionDigits: 0 })}/${formatCompactNumber(projected.labor.capacity, { fractionDigits: 0 })}명`,
    `필요 Δ ${signed(projected.labor.used - current.labor.used, 0)} · 인구 Δ ${signed(projected.labor.capacity - current.labor.capacity, 0)}`,
  );
}

function clearPlan() {
  const hadItems = gameState.constructionPlan.length > 0;
  const assessment = clearConstructionPlan(gameState);
  buildConfirmEls?.root.classList.add('hidden');
  if (hadItems) eventBus.emit(Events.BUILD_PLAN_CLEARED, assessment);
  return assessment;
}

function syncBuildConfirm() {
  const assessment = assessConstructionPlan(gameState);
  if (!buildConfirmEls || !assessment.items.length || !placementPreviewVisible) {
    buildConfirmEls?.root.classList.add('hidden');
    return;
  }
  const firstError = assessment.errors[0];
  buildConfirmEls.text.textContent = `계획 ${assessment.items.length}개`;
  buildConfirmEls.cost.textContent = formatCredits(assessment.totalCost, { compact: true });
  buildConfirmEls.balance.textContent = `잔액 ${formatCredits(assessment.projectedCredits, { compact: true })}`;
  buildConfirmEls.error.textContent = firstError?.message || '';
  buildConfirmEls.error.classList.toggle('hidden', !firstError);
  buildConfirmEls.confirm.textContent = `${assessment.items.length}개 건설 확정`;
  buildConfirmEls.confirm.disabled = !assessment.ok;
  syncForecastMetrics(assessment);
  buildConfirmEls.root.classList.remove('hidden');
}

function handleSceneCellClick(index) {
  const occupied = Boolean(gameState.grid[index]);
  if (!placementPreviewVisible || occupied) {
    onCellClick(index);
    return;
  }
  const assessment = upsertPlannedFacility(gameState, gameState.selectedFacility, index);
  gameState.selectedCell = gameState.constructionPlan.some((item) => item.index === index) ? index : null;
  eventBus.emit(Events.BUILD_PLAN_CHANGED, assessment);
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
    if (gameState.isEditable) renderGrid();
  });
  eventBus.on(Events.HUD_PANEL_CHANGED, ({ activePanel }) => {
    const nextVisible = activePanel === 'build';
    if (placementPreviewVisible === nextVisible) return;
    placementPreviewVisible = nextVisible;
    if (!nextVisible) clearPlan();
    if (gameState.isEditable) renderGrid();
  });
  buildConfirmEls?.cancel.addEventListener('click', () => {
    clearPlan();
    renderGrid();
  });
  buildConfirmEls?.confirm.addEventListener('click', () => {
    const assessment = assessConstructionPlan(gameState);
    if (!assessment.ok) return syncBuildConfirm();
    eventBus.emit(Events.BUILD_PLAN_COMMIT_REQUESTED, assessment);
  });
}

function buildCellConfigs() {
  const { grid, selectedCell, expandedCells, selectedFacility } = gameState;
  const underpoweredResearchCenters = new Set(Object.values(gameState.research.jobs || {})
    .filter((job) => job.status === 'underpowered' && Number.isInteger(job.dataCenterIndex))
    .map((job) => job.dataCenterIndex));
  const coords = getBoardCoordinates(gameState);
  const assessment = assessConstructionPlan(gameState);
  const planByIndex = new Map(assessment.items.map((item) => [item.index, item]));
  const preview = gameState.isEditable && placementPreviewVisible
    ? placementPreview(selectedFacility, assessment.projectedGrid, coords)
    : null;

  return grid.map((cell, i) => {
    const active = isExpansionCellActive(gameState, i);
    const base = {
      selected: selectedCell === i,
      newLand: expandedCells.has(i),
      researchWarning: underpoweredResearchCenters.has(i),
      disabled: !active,
      zoneTrait: cellZoneTrait(gameState, i),
    };
    if (!cell) {
      const planned = planByIndex.get(i);
      const otherPlan = assessment.items.filter((item) => item.index !== i);
      const reservedCost = otherPlan.reduce((sum, item) => (
        sum + constructionCostForCell(gameState, item.index, item.type)
      ), 0);
      const validation = validatePlacement(gameState, selectedFacility, i, {
        availableCredits: gameState.credits - reservedCost,
        plan: otherPlan,
      });
      const plannedInvalid = Boolean(planned && assessment.errors.some((error) => error.index === i
        || (error.index == null && error.type === planned.type)
        || (error.index == null && error.type == null)));
      return {
        ...base,
        empty: true,
        placementAllowed: validation.ok,
        plannedType: planned?.type || null,
        plannedInvalid,
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
  const assessment = assessConstructionPlan(gameState);
  setCellClickHandler(handleSceneCellClick);
  sizeChipEl.textContent = `사용 가능 ${gameState.expansion.activeCellIndices.length}/${gameState.grid.length}칸`;
  renderCityScene3D(buildCellConfigs(), gameState.boardRadius);
  setBuildPreviewMode({
    enabled: gameState.isEditable && placementPreviewVisible,
    type: gameState.selectedFacility,
    candidateIndex: null,
    plannedItems: gameState.constructionPlan,
    invalidIndices: assessment.errors.filter((error) => Number.isInteger(error.index)).map((error) => error.index),
  });
  syncBuildConfirm();
}
