import { gameState } from '../core/GameState.js';
import { getCellSpatial, placementPreview } from '../systems/BoardSystem.js';
import { eventBus, Events } from '../core/EventBus.js';
import { initCityScene3D, renderCityScene3D, setCellClickHandler } from './CityScene3D.js';

let sizeChipEl = null;
let onCellClick = () => {};
let sceneMounted = false;

export function initGridView(gridElement, sizeChipElement, clickHandler) {
  sizeChipEl = sizeChipElement;
  onCellClick = clickHandler;
  if (!sceneMounted) {
    initCityScene3D(gridElement);
    sceneMounted = true;
  }
  // 독에서 시설을 바꿔 고르면(같은 시설 다시 클릭해도) 미리보기가 즉시 갱신되도록 한다.
  eventBus.on(Events.BOARD_FACILITY_SELECTED, () => {
    if (gameState.isEditable) renderGrid();
  });
}

function buildCellConfigs() {
  const { grid, gridSize, selectedCell, expandedCells, selectedFacility } = gameState;
  const preview = gameState.isEditable ? placementPreview(selectedFacility, grid, gridSize) : null;

  return grid.map((cell, i) => {
    const base = {
      selected: selectedCell === i,
      newLand: expandedCells.has(i),
    };
    if (!cell) {
      return {
        ...base,
        empty: true,
        previewGood: !!preview?.good.has(i),
        previewBad: !!preview?.bad.has(i),
      };
    }
    const sp = getCellSpatial(grid, i, gridSize);
    return {
      ...base,
      empty: false,
      type: cell.type,
      level: cell.level,
      linkMark: sp.positive.length ? 'good' : sp.warnings.length ? 'warn' : null,
    };
  });
}

export function renderGrid() {
  setCellClickHandler(onCellClick);
  sizeChipEl.textContent = `${gameState.gridSize}×${gameState.gridSize}`;
  renderCityScene3D(buildCellConfigs(), gameState.gridSize);
}
