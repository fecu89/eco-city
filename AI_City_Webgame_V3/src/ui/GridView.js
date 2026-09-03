import { gameState } from '../core/GameState.js';
import { BOARD_KEYBOARD, FACILITIES } from '../core/Constants.js';
import { getBoardCoordinates, neighborIndices, placementPreview, validatePlacement } from '../systems/BoardSystem.js';
import { eventBus, Events } from '../core/EventBus.js';
import {
  initCityScene3D,
  projectCellToScreen,
  renderCityScene3D,
  setBuildOxWidget,
  setBuildPreviewMode,
  setCellClickHandler,
  setKeyboardCursor,
} from './CityScene3D.js';
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
let boardEl = null;
let announcerEl = null;
let onCellClick = () => {};
let sceneMounted = false;
let placementPreviewVisible = false;
let facilityArmed = false;
let buildConfirmEls = null;
// 키보드 커서는 보드에 포커스가 있는 동안만 존재한다. -1은 "커서 없음"이다.
let keyboardCursor = -1;

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
    ? buildConfirmEls.getForecast?.(assessment)
    : null;
  buildConfirmEls.metrics.classList.toggle('hidden', !forecast);
  buildConfirmEls.timeline?.classList.toggle('hidden', !forecast);
  if (!forecast) return;
  const { current, projected } = forecast;
  setForecastMetric('credit', `${signed(projected.netCredits, 2)}/일`, `Δ ${signed(projected.netCredits - current.netCredits, 2)}`);
  setForecastMetric(
    'power',
    `${round1(projected.deliveredPower)}/${round1(projected.demand)}E`,
    `공급 Δ ${signed(projected.deliveredPower - current.deliveredPower)}E`,
  );
  setForecastMetric('carbon', `CO₂ ${round1(projected.dailyCarbon)}/일`, `Δ ${signed(projected.dailyCarbon - current.dailyCarbon)}`);
  setForecastMetric('water', `${round1(projected.dailyWater)}/일`, `Δ ${signed(projected.dailyWater - current.dailyWater)}`);
  setForecastMetric(
    'labor',
    `${formatCompactNumber(projected.labor.used, { fractionDigits: 0 })}/${formatCompactNumber(projected.labor.capacity, { fractionDigits: 0 })}명`,
    `필요 Δ ${signed(projected.labor.used - current.labor.used, 0)} · 인구 Δ ${signed(projected.labor.capacity - current.labor.capacity, 0)}`,
  );
  if (buildConfirmEls.timeline) {
    const warningLabels = {
      power_shortfall: '전력 부족',
      negative_income: '운영 적자',
      workforce_shortage: '인력 부족',
      battery_empty: '배터리 고갈',
      city_event_started: '기상이변 시작',
    };
    const risk = forecast.worstInterval?.warnings?.length
      ? ` · 위험 ${forecast.worstInterval.dayOffset}일`
      : ' · 안정';
    buildConfirmEls.timeline.querySelector('[data-forecast-summary]').textContent = `${forecast.horizonDays}일${risk}`;
    buildConfirmEls.timeline.querySelector('[data-forecast-events]').innerHTML = forecast.timeline.map(({ dayOffset, completed, warnings }) => {
      const names = completed.map(({ type }) => FACILITIES[type]?.name || type).join(' · ');
      const warning = warnings.length ? ` · ${warnings.map((item) => warningLabels[item] || item).join(', ')}` : '';
      return `<li><b>+${dayOffset}일</b><span>${names} 완공${warning}</span></li>`;
    }).join('');
  }
}

function requestConfirmActivePlan() {
  const assessment = assessConstructionPlan(gameState);
  if (!assessment.ok) return syncBuildConfirm();
  return eventBus.emit(Events.BUILD_PLAN_COMMIT_REQUESTED, assessment);
}

function clearPlan() {
  const hadItems = gameState.constructionPlan.length > 0;
  const assessment = clearConstructionPlan(gameState);
  buildConfirmEls?.root.classList.add('hidden');
  setBuildOxWidget(null);
  if (hadItems) eventBus.emit(Events.BUILD_PLAN_CLEARED, assessment);
  return assessment;
}

function syncBuildConfirm() {
  const assessment = assessConstructionPlan(gameState);
  if (!assessment.items.length || !placementPreviewVisible) {
    buildConfirmEls?.root.classList.add('hidden');
    setBuildOxWidget(null);
    return;
  }
  const pending = assessment.items[0];
  const facility = FACILITIES[pending.type];
  setBuildOxWidget({
    index: pending.index,
    disabled: !assessment.ok,
    onConfirm: requestConfirmActivePlan,
    onCancel: () => {
      clearPlan();
      renderGrid();
    },
  });
  if (!buildConfirmEls) return;
  const firstError = assessment.errors[0];
  buildConfirmEls.text.textContent = assessment.items.length > 1
    ? `건설 계획 ${assessment.items.length}개 · 완공 후 예상`
    : `${facility.icon} ${facility.name} · 건설 후 예상`;
  buildConfirmEls.cost.textContent = formatCredits(assessment.totalCost, { compact: true });
  buildConfirmEls.balance.textContent = `잔액 ${formatCredits(assessment.projectedCredits, { compact: true })}`;
  buildConfirmEls.error.textContent = firstError?.message || '';
  buildConfirmEls.error.classList.toggle('hidden', !firstError);
  syncForecastMetrics(assessment);
  buildConfirmEls.root.classList.remove('hidden');
}

function handleSceneCellClick(index) {
  const occupied = Boolean(gameState.grid[index]);
  if (!placementPreviewVisible || !facilityArmed || occupied) {
    onCellClick(index);
    return;
  }
  const pending = gameState.constructionPlan[0];
  if (pending && pending.index !== index) {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '건설 대기 중',
      text: '먼저 현재 건물을 확정(O)하거나 취소(X)한 뒤 다른 위치를 선택하세요.',
    });
    return;
  }
  const assessment = upsertPlannedFacility(gameState, gameState.selectedFacility, index);
  if (assessment.rejected) {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '건설 허가 한도',
      text: assessment.rejected.message,
      priority: true,
    });
    renderGrid();
    return;
  }
  gameState.selectedCell = gameState.constructionPlan.some((item) => item.index === index) ? index : null;
  eventBus.emit(Events.BUILD_PLAN_CHANGED, assessment);
  renderGrid();
}

// 보드는 3D 캔버스라 DOM 칸이 없다. 포커스가 있는 동안 "지금 어느 칸인가"를 알려 주는
// 유일한 수단이 이 라이브 리전이므로, 커서가 움직일 때마다 칸 번호와 내용물을 읽어 준다.
function announceCell(index) {
  if (!announcerEl) return;
  // 커서는 열린 칸에만 놓이므로(moveKeyboardCursor) 여기서는 비었는지 지어졌는지만 가른다.
  const cell = gameState.grid[index];
  const description = cell
    ? BOARD_KEYBOARD.facilityDescription(
      FACILITIES[cell.type]?.name || cell.type,
      Math.max(1, Math.trunc(Number(cell.level) || 1)),
    )
    : BOARD_KEYBOARD.EMPTY_CELL_TEXT;
  announcerEl.textContent = BOARD_KEYBOARD.cellAnnouncement(index, description);
}

function moveKeyboardCursor(index) {
  if (!Number.isInteger(index) || index < 0 || index >= gameState.grid.length) return false;
  if (!isExpansionCellActive(gameState, index)) return false;
  keyboardCursor = index;
  setKeyboardCursor(index);
  announceCell(index);
  return true;
}

export function clearKeyboardCursor() {
  if (keyboardCursor < 0) return;
  keyboardCursor = -1;
  setKeyboardCursor(-1);
}

// 화살표는 화면에서 본 방향으로 움직여야 한다 — 카메라가 돌아가 있으면 축좌표 방향과
// 화면 방향이 어긋나기 때문이다. 여섯 이웃을 화면에 투영해 화살표 벡터와 내적이 가장 큰
// 칸을 고르고, 아직 열리지 않은 칸은 후보에서 아예 뺀다.
function neighborInScreenDirection(index, key) {
  const coords = getBoardCoordinates(gameState);
  const candidates = neighborIndices(index, coords)
    .filter((neighbor) => isExpansionCellActive(gameState, neighbor));
  if (!candidates.length) return -1;
  const vector = BOARD_KEYBOARD.MOVE_VECTORS[key];
  const origin = projectCellToScreen(index);
  if (origin) {
    let best = -1;
    let bestDot = BOARD_KEYBOARD.MIN_DIRECTION_DOT;
    candidates.forEach((neighbor) => {
      const point = projectCellToScreen(neighbor);
      if (!point) return;
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const length = Math.hypot(dx, dy);
      if (!length) return;
      const dot = (dx * vector.x + dy * vector.y) / length;
      if (dot > bestDot) {
        bestDot = dot;
        best = neighbor;
      }
    });
    return best;
  }
  // 카메라가 아직 준비되지 않은 경우에만 축좌표 방향으로 떨어진다.
  const coordinate = coords[index];
  if (!coordinate) return -1;
  const active = new Set(candidates);
  for (const step of BOARD_KEYBOARD.AXIAL_FALLBACK[key]) {
    const target = coords.findIndex((coord) => coord.q === coordinate.q + step.q
      && coord.r === coordinate.r + step.r);
    if (target >= 0 && active.has(target)) return target;
  }
  return -1;
}

function handleBoardKeydown(event) {
  // 보드 위에 떠 있는 O/X 버튼이 포커스를 가진 경우는 그 버튼이 처리한다.
  if (event.target !== boardEl || event.altKey || event.ctrlKey || event.metaKey) return;
  const { key } = event;
  if (BOARD_KEYBOARD.MOVE_VECTORS[key]) {
    event.preventDefault();
    // 첫 화살표는 보드 안으로 들어오는 동작이다 — 중앙 칸에 커서를 놓기만 한다.
    if (keyboardCursor < 0) {
      moveKeyboardCursor(BOARD_KEYBOARD.HOME_INDEX);
      return;
    }
    const next = neighborInScreenDirection(keyboardCursor, key);
    if (next >= 0) moveKeyboardCursor(next);
    return;
  }
  if (key === BOARD_KEYBOARD.HOME_KEY) {
    event.preventDefault();
    moveKeyboardCursor(BOARD_KEYBOARD.HOME_INDEX);
    return;
  }
  if (BOARD_KEYBOARD.ACTIVATE_KEYS.includes(key)) {
    if (keyboardCursor < 0 || !isExpansionCellActive(gameState, keyboardCursor)) return;
    event.preventDefault();
    handleSceneCellClick(keyboardCursor);
    return;
  }
  // Escape는 커서만 거둔다. 전파를 막지 않아 열려 있는 HUD 패널을 닫는 전역 동작은 그대로다.
  if (key === BOARD_KEYBOARD.CLEAR_KEY && keyboardCursor >= 0) {
    clearKeyboardCursor();
    boardEl.blur();
  }
}

export function initGridView(gridElement, sizeChipElement, clickHandler, confirmElements = null, { announcer = null } = {}) {
  sizeChipEl = sizeChipElement;
  boardEl = gridElement;
  announcerEl = announcer;
  onCellClick = clickHandler;
  buildConfirmEls = confirmElements;
  if (!sceneMounted) {
    initCityScene3D(gridElement);
    sceneMounted = true;
  }
  // 3D 보드를 키보드로도 쓸 수 있게 한다. tabindex는 마크업이 갖고(JS 없이도 포커스 가능),
  // 역할과 키 안내 문구는 Constants 한 곳에서만 관리한다.
  gridElement.setAttribute('role', BOARD_KEYBOARD.ROLE);
  gridElement.setAttribute('aria-label', BOARD_KEYBOARD.ARIA_LABEL);
  gridElement.addEventListener('keydown', handleBoardKeydown);
  // 포커스를 잃으면 커서는 사라진다. 남겨 두면 조작할 수 없는 칸에 표식만 떠 있게 된다.
  gridElement.addEventListener('blur', clearKeyboardCursor);
  // 독에서 시설을 바꿔 고르면(같은 시설 다시 클릭해도) 미리보기가 즉시 갱신되도록 한다.
  eventBus.on(Events.BOARD_FACILITY_SELECTED, () => {
    facilityArmed = true;
    if (gameState.isEditable) renderGrid();
  });
  eventBus.on(Events.HUD_PANEL_CHANGED, ({ activePanel }) => {
    const nextVisible = activePanel === 'build';
    if (placementPreviewVisible === nextVisible) return;
    placementPreviewVisible = nextVisible;
    facilityArmed = nextVisible;
    if (!nextVisible) clearPlan();
    if (gameState.isEditable) renderGrid();
  });
  // 건설을 확정하고 나면 다음 건물을 지으려면 독에서 다시 골라야 한다 — 확정 직후
  // 계속 무장 상태로 남아 마우스만 올려도 새 건설이 시작되는 것을 막는다.
  eventBus.on(Events.BUILD_PLAN_COMMITTED, () => {
    facilityArmed = false;
  });
  // 취소(X)도 같은 규칙이다 — 미리보기를 접었는데 고스트가 계속 마우스를 따라다니면
  // 여전히 건축 모드인 것처럼 보인다. 다시 지으려면 독에서 시설을 다시 고른다.
  eventBus.on(Events.BUILD_PLAN_CLEARED, () => {
    facilityArmed = false;
    if (gameState.isEditable) renderGrid();
  });
  // 초기화하면 이전 도시에서 고른 시설이 계속 무장돼 있어 새 도시에 고스트가 뜬다.
  // placementPreviewVisible은 현재 열린 패널을 그대로 비추는 값이라 HUD_PANEL_CHANGED가
  // 계속 소유한다 — 여기서 강제로 끄면 열려 있는 건설 패널로 배치를 할 수 없게 된다.
  eventBus.on(Events.GAME_RESET, () => {
    facilityArmed = false;
    clearKeyboardCursor();
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
  const preview = gameState.isEditable && placementPreviewVisible && facilityArmed
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
      project: cell.project ? {
        ...cell.project,
        progress: cell.project.elapsedDays / cell.project.durationDays,
      } : null,
    };
  });
}

export function renderGrid() {
  const assessment = assessConstructionPlan(gameState);
  setCellClickHandler(handleSceneCellClick);
  sizeChipEl.textContent = `사용 가능 ${gameState.expansion.activeCellIndices.length}/${gameState.grid.length}칸`;
  renderCityScene3D(buildCellConfigs(), gameState.boardRadius);
  setBuildPreviewMode({
    enabled: gameState.isEditable && placementPreviewVisible && facilityArmed,
    type: gameState.selectedFacility,
    candidateIndex: null,
    plannedItems: gameState.constructionPlan,
    invalidIndices: assessment.errors.filter((error) => Number.isInteger(error.index)).map((error) => error.index),
  });
  syncBuildConfirm();
}
