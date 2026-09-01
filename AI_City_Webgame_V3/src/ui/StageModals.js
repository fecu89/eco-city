import anime from 'animejs';
import { CARBON_CRISIS, FACILITIES, RESEARCH_RULES, WORKFORCE_LEVELS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { setModal, closeModal, getModalState, $modal, $$modal } from './Modal.js';
import { escapeHtml, formatCredits, round1 } from './format.js';
import {
  cellStats,
  demolitionRefund,
  demolishCell,
  expandGrid,
  getBoardCoordinates,
  getCellSpatial,
  investedCost,
  stageLevelCap,
  upgradeCell,
  upgradeCost,
  upgradeRequirementMessage,
  validateUpgrade,
} from '../systems/BoardSystem.js';
import { handleResearchFacilityRemoved } from '../systems/ResearchSystem.js';
import { bindResearchPanel, refreshResearchPanelLive, researchPanelMarkup } from './ResearchView.js';
import * as Report from '../systems/ReportSystem.js';
import { validateDemolitionPermit } from '../systems/FacilityPermitSystem.js';
import { BATTERY_POLICIES, OPERATION_MODES, availableOperationModes } from '../core/OperationDefinitions.js';
import { EXPANSION_SIDES, ZONE_TRAITS } from '../core/ZoneDefinitions.js';
import { CITY_EVENTS, EVENT_FORECAST_DAYS, STRESS_PHASES } from '../core/EventDefinitions.js';
import { startStressTest } from '../systems/StressTestSystem.js';
import {
  buildCityModifierContext,
  availableBatteryPolicies,
  facilityModifierAt,
  previewFacilityOperationMode,
  setFacilityPriority,
  setFacilityOperationMode,
  setBatteryPolicy,
} from '../systems/CityModifierSystem.js';
import {
  cancelConstructionProject,
  operationProfileForCell,
  projectProgress,
  projectRefund,
  projectStage,
} from '../systems/ConstructionProjectSystem.js';
import { generationAvailabilityMultiplier } from '../systems/PowerNetworkSystem.js';

let refreshAll = () => {};
let inspectorIndex = null;
let getUpgradeForecast = null;

function signedCreditRate(value) {
  const numeric = Number(value) || 0;
  const prefix = numeric > 0 ? '+' : numeric < 0 ? '-' : '±';
  return `${prefix}${formatCredits(Math.abs(numeric))}/일`;
}

function facilityBalanceText(economy) {
  if (!economy) return '정산 대기';
  return signedCreditRate((Number(economy.income) || 0) - (Number(economy.upkeep) || 0));
}

function facilityPowerText(cell, stats, power) {
  if (stats.supply > 0) {
    const multiplier = generationAvailabilityMultiplier(cell.type, {
      dayIndex: gameState.elapsedGameDays,
      tickIndex: gameState.tickIndex,
    });
    return `+${round1(stats.supply * multiplier)}E/일`;
  }
  if (stats.demand > 0) {
    if (!power) return `-${round1(stats.demand)}E/일`;
    return `${round1(power.delivered)}/${round1(power.demand)}E · ${Math.round(power.ratio * 100)}%`;
  }
  return '0E/일';
}
export function initStageModals(refreshCallback, options = {}) {
  refreshAll = refreshCallback;
  getUpgradeForecast = options.getUpgradeForecast || null;
  eventBus.on(Events.SIMULATION_TICKED, () => refreshOpenInspector());
  eventBus.on(Events.RESEARCH_QUIZ_CLOSED, ({ dataCenterIndex }) => {
    if (Number.isInteger(dataCenterIndex) && gameState.grid[dataCenterIndex]?.type === 'data') {
      openFacilityInspectorModal(dataCenterIndex);
    }
  });
  eventBus.on(Events.EXPANSION_CHOICE_REQUESTED, openExpansionChoiceModal);
}

export function openExpansionChoiceModal() {
  const traitMarkup = (side) => EXPANSION_SIDES[side].traits.map((traitId) => {
    const trait = ZONE_TRAITS[traitId];
    return `<li><i data-lucide="${trait.icon}"></i><span><strong>${trait.label}</strong><small>${trait.description}</small></span></li>`;
  }).join('');
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">CITY EXPANSION</span><h2>첫 확장 방향을 선택하세요</h2></div></div>
    <p class="expansion-choice-intro">선택한 9칸만 먼저 개방됩니다. 각 지역은 이점과 부담이 함께 있으며, 기후 대응 단계에서 반대편도 순차 개방됩니다.</p>
    <div class="expansion-choice-grid">
      ${Object.values(EXPANSION_SIDES).map((side) => `<button type="button" class="expansion-choice-card" data-expansion-side="${side.id}">
        <span class="expansion-direction">${side.id === 'east' ? 'EAST · 동부' : 'WEST · 서부'}</span>
        <strong>${side.label}</strong>
        <p>${side.description}</p>
        <ul>${traitMarkup(side.id)}</ul>
        <b>9칸 개방 · 유지비 +1.00 💰/일</b>
      </button>`).join('')}
    </div>
  `, { id: 'expansion-choice', pausesSimulation: true, dismissible: false });
  $$modal('[data-expansion-side]').forEach((button) => button.addEventListener('click', () => {
    const result = expandGrid(button.dataset.expansionSide);
    if (!result.ok) return;
    eventBus.emit(Events.EXPANSION_CHOSEN, result);
    closeModal();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, {
      title: `${EXPANSION_SIDES[result.side].label} 완료`,
      text: '새 대지 9칸 개방 · 도시 유지비 +1.00 💰/일',
      priority: true,
    });
  }));
}

function refreshOpenInspector(tickProgress = 0) {
  if (inspectorIndex == null || getModalState()?.id !== 'facility') return;
  const live = gameState.lastTickSummary;
  const power = live?.facilityPower?.[inspectorIndex];
  const economy = live?.facilityEconomy?.[inspectorIndex];
  const environment = live?.facilityEnvironment?.[inspectorIndex];
  const cell = gameState.grid[inspectorIndex];
  if (!cell) return;
  if (cell.project) {
    const progress = projectProgress(cell.project, tickProgress);
    const percent = Math.round(progress * 100);
    const remaining = Math.max(0, cell.project.durationDays - cell.project.elapsedDays);
    const progressEl = $modal('[data-project-progress]');
    const remainingEl = $modal('[data-project-remaining]');
    const barEl = $modal('[data-project-progress-bar]');
    if (!progressEl || !remainingEl || !barEl) {
      openFacilityInspectorModal(inspectorIndex);
      return;
    }
    progressEl.textContent = `${percent}%`;
    remainingEl.textContent = `남은 ${remaining}일`;
    barEl.style.width = `${progress * 100}%`;
    barEl.closest('.construction-project-bar')?.setAttribute('aria-valuenow', progress.toFixed(3));
    return;
  }
  if ($modal('[data-construction-console]')) {
    openFacilityInspectorModal(inspectorIndex);
    return;
  }
  const modifierContext = buildCityModifierContext(gameState);
  const stats = cellStats(cell, facilityModifierAt(modifierContext, inspectorIndex));
  const balanceEl = $modal('#facilityLiveBalance');
  const cityNetEl = $modal('#facilityCityNet');
  const powerEl = $modal('#facilityLivePower');
  const carbonEl = $modal('#facilityLiveCarbon');
  const waterEl = $modal('#facilityLiveWater');
  if (balanceEl) balanceEl.textContent = facilityBalanceText(economy);
  if (cityNetEl) cityNetEl.textContent = signedCreditRate(live?.netCredits || 0);
  if (powerEl) powerEl.textContent = facilityPowerText(cell, stats, power);
  if (carbonEl) carbonEl.textContent = `${round1(environment?.carbon ?? stats.carbon)} CO₂/일`;
  if (waterEl) waterEl.textContent = `${round1(environment?.water ?? stats.water)}/일`;
  const researchRoot = $modal('.research-panel');
  if (researchRoot && refreshResearchPanelLive(researchRoot)) openFacilityInspectorModal(inspectorIndex);
}

export function refreshStageConstructionProgress(tickProgress = 0) {
  refreshOpenInspector(tickProgress);
}

export function openHelpModal() {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">HOW TO PLAY · 15~30 MIN</span><h2>기후 생존 도시 · 4개 챕터</h2></div><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div>
    <div class="help-grid">
      <article><span>01</span><h3>건설 계획</h3><p>건설 창에서 여러 시설을 반투명 계획으로 올린 뒤, 하단의 N개 확정을 눌러 한꺼번에 건설합니다.</p></article>
      <article><span>02</span><h3>운영</h3><p>1배속에서 1초마다 1일이 흐르며 수입·전력·탄소·물이 정산됩니다. 화면에는 날짜만 표시됩니다.</p></article>
      <article><span>03</span><h3>전력망</h3><p>거리가 멀수록 송전 손실이 커지고 저장장치는 중심과 인접한 6방향의 손실을 줄입니다.</p></article>
      <article><span>04</span><h3>기후 퀘스트</h3><p>6개 기초 임무 뒤에는 폭염·장마·태풍·한파 등 8개 기후에 각각 24일 동안 대비합니다.</p></article>
      <article><span>05</span><h3>기후 대응</h3><p>기상이변은 ${EVENT_FORECAST_DAYS}일 전에 예보되며 첫 예보 때 자동 일시정지됩니다. 일일 탄소 ${CARBON_CRISIS.SAFE_DAILY}을 넘긴 채 ${CARBON_CRISIS.GAME_OVER_DAYS}일이 지나면 도시가 중단됩니다.</p></article>
      <article><span>06</span><h3>철거</h3><p>철거 환급은 누적 건설·강화 비용의 50%입니다.</p></article>
    </div>
    <div class="callout"><strong>작전 흐름</strong><p>기초 도시 → 첫 확장 → 8개 한국형 기후 대응 → 41일 복합기후 시험 → 성적표 순서로 진행합니다. 퀴즈는 연구 가속과 최종 보너스이며 승리 조건이 아닙니다.</p></div>
    <div class="callout"><strong>시설 허가</strong><p>퀘스트 레벨마다 시설별 최대 수가 정해집니다. 핵발전은 처음에는 화력발전 1기가 필요하지만, 저탄소 저장 허브 완료 후에는 에너지저장 시설이 예비력을 대신합니다.</p></div>
    <div class="callout"><strong>인구와 필요 인력</strong><p>주거지는 전체 인구를 늘리고, 발전소·공장·데이터센터 같은 운영 시설은 인력을 사용합니다. 계획 전체의 필요 인력이 인구를 넘으면 건설을 확정할 수 없습니다.</p></div>
    <div class="callout"><strong>연구와 퀴즈</strong><p>데이터센터마다 서로 다른 연구를 동시에 진행할 수 있습니다. 연구는 1×에서 최대 ${RESEARCH_RULES.DURATION_DAYS.CAPSTONE / RESEARCH_RULES.GAME_DAYS_PER_REAL_MINUTE}분이며, 각 연구의 전용 퀴즈 4문제를 모두 맞히면 해당 연구의 남은 시간을 전부 단축할 수 있습니다.</p></div>
    <div class="callout"><strong>게임 모델 안내</strong><p>설정에서 낮·노을·밤 조명을 고정할 수 있습니다. 수치는 실제 실측값이 아닌 기후·에너지 시스템 학습용 상대값이며, 조력발전은 섬의 현재 최외곽에만 배치할 수 있습니다.</p></div>
  `);
  $modal('.close-modal').addEventListener('click', closeModal);
}

export function openEventPreparationModal(cityEvent) {
  const definition = CITY_EVENTS[cityEvent?.type];
  if (!definition) return false;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">${EVENT_FORECAST_DAYS}D EARLY WARNING · PAUSED</span><h2>${definition.label} 대비 기간</h2></div></div>
    <div class="demolition-warning event-preparation-warning">
      <strong>기상이변이 시작되기 전에 도시 시간을 자동으로 일시정지했습니다.</strong>
      <p>창을 닫아도 시간은 멈춰 있습니다. 건설·운영 모드·전력 우선순위·배터리 정책을 조정한 뒤 상단 재생 버튼을 누르세요.</p>
    </div>
    <div class="callout"><strong>예상 영향 · ${definition.durationDays}일 지속</strong><p>${definition.description}</p></div>
    <div class="callout"><strong>권장 대비</strong><p>${definition.preparation}</p></div>
    <div class="modal-actions"><button class="btn primary" id="eventPreparationCloseBtn">준비 시작</button></div>
  `, { id: 'event-preparation', dismissible: false });
  $modal('#eventPreparationCloseBtn').addEventListener('click', closeModal);
  return true;
}

function activePressure() {
  if (gameState.stressTest?.status === 'running') {
    const phase = STRESS_PHASES[gameState.stressTest.phaseIndex];
    return phase ? { type: phase.id, label: phase.label } : null;
  }
  const active = gameState.events?.schedule?.find(({ id }) => id === gameState.events.activeId);
  return active ? { type: active.type, label: CITY_EVENTS[active.type]?.label || active.type } : null;
}

function groupedFacilityValues(values, key) {
  const grouped = {};
  Object.entries(values || {}).forEach(([rawIndex, item]) => {
    const cell = gameState.grid[Number(rawIndex)];
    const value = Number(item?.[key]) || 0;
    if (!cell || value <= 0) return;
    grouped[cell.type] = (grouped[cell.type] || 0) + value;
  });
  return Object.entries(grouped)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([type, value]) => `${FACILITIES[type]?.name || type} ${round1(value)}`);
}

function metricCauseData(metric) {
  const summary = gameState.lastTickSummary || {};
  const pressure = activePressure();
  const margin = round1((summary.deliveredPower || 0) - (summary.demand || 0));
  const activeResearchCount = Object.values(gameState.research?.jobs || {}).filter((job) => (
    Number.isInteger(job.dataCenterIndex)
    && gameState.grid[job.dataCenterIndex]?.operationMode !== 'eco'
  )).length;
  const titles = {
    credit: '크레딧 적자 원인',
    power: '전력 부족 원인',
    battery: '배터리 부족 원인',
    carbon: 'CO₂ 초과 원인',
    water: '물 사용 초과 원인',
  };
  const data = { title: titles[metric] || '도시 지표 원인', current: '', causes: [], action: '' };

  if (metric === 'power') {
    data.current = margin < 0 ? `전력 부족 ${round1(Math.abs(margin))}E` : `전력 여유 +${margin}E`;
    if (activeResearchCount) data.causes.push(`집중 연구 +${round1(activeResearchCount * RESEARCH_RULES.EXTRA_DEMAND)}E`);
    if (pressure?.type === 'lowWind') data.causes.push('무풍 · 풍력 출력이 평소의 35%로 감소');
    if (pressure?.type === 'lowWindNight') data.causes.push('무풍 야간 · 풍력 -60%, 태양광 출력 정지');
    if (pressure?.type === 'nightPeak') data.causes.push('야간 피크 · 주거 수요 +25%, 태양광 출력 감소');
    if (pressure?.type === 'heatwave') data.causes.push('폭염 · 주거 전력 수요 +25%');
    groupedFacilityValues(summary.facilityPower, 'demand').forEach((label) => data.causes.push(`${label}E 수요`));
    data.action = '시설 모드를 절약으로 바꾸거나, 필수시설 우선순위·배터리 정책·발전 여유를 조정하세요.';
  } else if (metric === 'credit') {
    data.current = `일일 ${gameState.lastSettlementDelta >= 0 ? '+' : ''}${round1(gameState.lastSettlementDelta)} 💰`;
    groupedFacilityValues(summary.facilityEconomy, 'upkeep').forEach((label) => data.causes.push(`${label} 💰/일 유지비`));
    if (summary.expansionUpkeep > 0) data.causes.push(`확장 대지 ${round1(summary.expansionUpkeep)} 💰/일 유지비`);
    if (summary.health > 0) data.causes.push(`오염 건강비 ${round1(summary.health)} 💰/일`);
    data.action = '공장 운영 모드와 불필요한 유지비를 조정하고, 전력이 끊긴 수익 시설을 먼저 복구하세요.';
  } else if (metric === 'battery') {
    data.current = `현재 저장 ${round1(summary.batteryStored || 0)}E`;
    const operations = Object.values(summary.batteryOperations || {});
    const charged = operations.reduce((sum, operation) => sum + (Number(operation.charged) || 0), 0);
    const discharged = operations.reduce((sum, operation) => sum + (Number(operation.discharged) || 0), 0);
    if (discharged > 0) data.causes.push(`오늘 방전 ${round1(discharged)}E`);
    if (charged <= 0) data.causes.push('충전 잉여 전력 없음 또는 배터리 보조전력 부족');
    data.action = '배터리와 수요 시설을 인접시키고, 수요가 낮은 날에 발전 잉여를 확보하세요.';
  } else if (metric === 'carbon') {
    data.current = `현재 ${round1(summary.dailyCarbon || 0)} CO₂/일 · 안전선 ${CARBON_CRISIS.SAFE_DAILY}`;
    groupedFacilityValues(summary.facilityEnvironment, 'carbon').forEach((label) => data.causes.push(`${label} CO₂/일`));
    data.action = '공장을 친환경 모드로 전환하거나 저탄소 발전 비중과 녹지 완충을 늘리세요.';
  } else if (metric === 'water') {
    const hasLimit = summary.waterLimit != null && Number.isFinite(Number(summary.waterLimit));
    const limit = hasLimit ? Number(summary.waterLimit) : null;
    data.current = `현재 ${round1(summary.dailyWater || 0)}/일${limit != null ? ` · 한도 ${round1(limit)}/일` : ''}`;
    groupedFacilityValues(summary.facilityEnvironment, 'water').forEach((label) => data.causes.push(`${label}/일`));
    if (pressure?.type === 'drought') data.causes.push('물 부족 예보 · 도시 물 한도 25% 감소');
    data.action = '데이터센터·발전소 가까이에 냉각순환 시설을 배치하고 운영 모드를 조정하세요.';
  }
  if (!data.causes.length) data.causes.push('직전 정산에서 추가 원인이 기록되지 않았습니다. 다음 일일 정산 후 다시 확인하세요.');
  return data;
}

export function openHudMetricCausesModal(metric) {
  const data = metricCauseData(metric);
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">LIVE DIAGNOSIS</span><h2>${escapeHtml(data.title)}</h2></div><button class="icon-btn close-modal" aria-label="원인 창 닫기"><i data-lucide="x"></i></button></div>
    <section class="metric-cause-current"><span>직전 정산</span><strong>${escapeHtml(data.current)}</strong></section>
    <ol class="metric-cause-list">${data.causes.map((cause) => `<li><i data-lucide="scan-search" aria-hidden="true"></i><span>${escapeHtml(cause)}</span></li>`).join('')}</ol>
    <div class="callout metric-cause-action"><strong>대응 선택지</strong><p>${escapeHtml(data.action)}</p></div>
    <div class="modal-actions"><button class="btn primary close-modal" type="button">확인</button></div>
  `, { id: 'hud-metric-causes', pausesSimulation: false });
  $$modal('.close-modal').forEach((button) => button.addEventListener('click', closeModal));
}

export function openFacilityInspectorModal(index) {
  const cell = gameState.grid[index];
  if (!cell) return;
  inspectorIndex = index;

  if (cell.project) {
    openConstructionProjectModal(index);
    return;
  }

  const facility = FACILITIES[cell.type];
  const modifierContext = buildCityModifierContext(gameState);
  const stats = cellStats(cell, facilityModifierAt(modifierContext, index));
  const spatial = getCellSpatial(gameState.grid, index, getBoardCoordinates(gameState));
  const cap = Math.min(facility.maxLevel, stageLevelCap());
  const nextCost = upgradeCost(cell);
  const canLevel = cell.level < cap;
  const upgradeValidation = validateUpgrade(gameState, index);
  const upgradeRequirement = upgradeRequirementMessage(gameState, upgradeValidation);
  const investment = investedCost(cell);
  const refund = demolitionRefund(cell);
  const loss = investment - refund;
  const priorityUnlocked = gameState.questIndex >= 11 || gameState.claimedQuestIds.has('living-neighborhood');
  const positive = spatial.positive.length
    ? spatial.positive.map((item) => `<span class="spatial-tag good">🔗 ${item}</span>`).join('')
    : '<span class="spatial-tag neutral">연결 보너스 없음</span>';
  const warnings = spatial.warnings.map((item) => `<span class="spatial-tag warn">⚠ ${item}</span>`).join('');
  const live = gameState.lastTickSummary;
  const power = live?.facilityPower?.[index];
  const economy = live?.facilityEconomy?.[index];
  const environment = live?.facilityEnvironment?.[index];
  const workforceValue = WORKFORCE_LEVELS[cell.type]?.[cell.level] ?? 0;
  const workforceLabel = cell.type === 'residential' ? '전체 인구' : '필요 인력';
  const workforceText = cell.type === 'residential' ? `+${workforceValue}명` : `${workforceValue}명`;
  const priorityMarkup = priorityUnlocked ? `<div class="facility-priority"><strong>전력 공급 우선순위</strong><div class="segmented-control" id="facilityPriorityControls">
    ${[['essential', '필수'], ['normal', '일반'], ['saving', '절약']].map(([value, label]) => `<button type="button" data-priority="${value}" class="${(cell.priority || 'normal') === value ? 'active' : ''}">${label}</button>`).join('')}
  </div></div>` : '';
  const supportedModes = OPERATION_MODES[cell.type];
  const availableModes = new Set(availableOperationModes(cell, gameState).map(({ id }) => id));
  const selectedMode = cell.operationMode || 'normal';
  const selectedModeLabel = selectedMode === 'auto'
    ? `${supportedModes?.auto?.label || '자동'} · ${supportedModes?.[cell.automaticOperationMode || 'normal']?.label || '표준'}`
    : supportedModes?.[selectedMode]?.label || '표준';
  const operationModeMarkup = supportedModes ? `
    <section class="facility-mode-control" aria-label="시설 운영 모드">
      <div class="facility-mode-head"><div><span>OPERATION MODE</span><strong>운영 모드</strong></div><b>${selectedModeLabel}</b></div>
      <div class="segmented-control facility-mode-options" id="facilityModeControls">
        ${Object.values(supportedModes).map((definition) => {
          const unlocked = availableModes.has(definition.id);
          return `<button type="button" data-operation-mode="${definition.id}" class="${(cell.operationMode || 'normal') === definition.id ? 'active' : ''}" ${unlocked ? '' : 'disabled'} title="${unlocked ? escapeHtml(definition.description) : 'Lv.2부터 해금'}"><strong>${definition.label}</strong><small>${unlocked ? definition.description : 'Lv.2 해금'}</small></button>`;
        }).join('')}
      </div>
      <div class="mode-change-forecast" id="modeChangeForecast" aria-live="polite"><p>모드를 선택하면 변경 전후 운영 수치를 확인할 수 있습니다.</p></div>
    </section>` : '';
  const batteryPolicies = cell.type === 'battery'
    ? new Set(availableBatteryPolicies(gameState, cell).map(({ id }) => id))
    : new Set();
  const batteryPolicyMarkup = cell.type === 'battery' ? `
    <section class="facility-mode-control" aria-label="배터리 운영 정책">
      <div class="facility-mode-head"><div><span>RESERVE POLICY</span><strong>저장 전력 사용 정책</strong></div><b>${BATTERY_POLICIES[cell.batteryPolicy || 'auto'].label}</b></div>
      <div class="segmented-control facility-mode-options" id="batteryPolicyControls">
        ${Object.values(BATTERY_POLICIES).map((policy) => {
          const unlocked = batteryPolicies.has(policy.id);
          const lockReason = policy.id === 'essential'
            ? '배터리 Lv.3와 비상 저장망 연구 필요'
            : policy.id === 'auto'
              ? ''
              : '배터리 Lv.2와 차세대 저장 화학 연구 필요';
          return `<button type="button" data-battery-policy="${policy.id}" class="${(cell.batteryPolicy || 'auto') === policy.id ? 'active' : ''}" ${unlocked ? '' : 'disabled'} title="${unlocked ? `${Math.round(policy.reserveRatio * 100)}% 예비량` : lockReason}"><strong>${policy.label}</strong><small>${unlocked ? policy.essentialOnlyBelowReserve ? '50% 아래는 필수시설만 사용' : policy.reserveRatio ? `${Math.round(policy.reserveRatio * 100)}% 이하 방전 금지` : '필요에 따라 자동 충방전' : lockReason}</small></button>`;
        }).join('')}
      </div>
    </section>` : '';
  const liveEconomyLabel = cell.type === 'residential'
    ? '주거 세금'
    : stats.income > 0 ? '시설 수익' : '일일 운영비';
  const operationMarkup = `
    <div class="facility-inspector-grid">
      <div><span>${liveEconomyLabel}</span><strong id="facilityLiveBalance">${facilityBalanceText(economy)}</strong></div>
      <div><span>${stats.supply ? '현재 발전' : stats.demand ? '전력 공급/수요' : '전력'}</span><strong id="facilityLivePower">${facilityPowerText(cell, stats, power)}</strong></div>
      <div><span>탄소</span><strong id="facilityLiveCarbon">${round1(environment?.carbon ?? stats.carbon)} CO₂/일</strong></div>
      <div><span>물</span><strong id="facilityLiveWater">${round1(environment?.water ?? stats.water)}/일</strong></div>
      <div><span>${workforceLabel}</span><strong>${workforceText}</strong></div>
    </div>
    <p class="facility-settlement-note">도시 전체 순수익 <strong id="facilityCityNet">${signedCreditRate(live?.netCredits || 0)}</strong> · 다른 시설 운영비와 환경·확장 비용까지 포함</p>
    <div class="spatial-tags">${positive}${warnings}</div>
    <div class="callout"><strong>공간 규칙</strong><p>${facility.desc}</p></div>
    ${operationModeMarkup}
    ${batteryPolicyMarkup}
    ${priorityMarkup}`;
  const managementMarkup = `
    <section class="facility-action-ledger" aria-label="강화와 철거 정보">
      <div class="demolition-breakdown" id="demolitionBreakdown"><span>총 투자 ${formatCredits(investment)}</span><span>환급 ${formatCredits(refund)}</span><span>손실 ${formatCredits(loss)}</span></div>
      <p class="upgrade-requirement ${upgradeValidation.ok ? 'ready' : ''}" id="upgradeRequirement">${escapeHtml(upgradeRequirement)}</p>
    </section>`;
  const bodyMarkup = `${operationMarkup}${cell.type === 'data' ? researchPanelMarkup(index) : ''}${managementMarkup}`;

  setModal(`
    <div class="facility-console" data-facility-console="${cell.type}">
      <header class="facility-console-header">
        <div class="facility-console-identity"><span class="facility-console-icon">${facility.icon}</span><div><span class="eyebrow">FACILITY CONTROL</span><h2>${facility.name}</h2><p>도시 시설 #${index} · LEVEL ${cell.level}</p></div></div>
        <div class="facility-console-live"><span>${facilityPowerText(cell, stats, power)}</span><b>${round1(environment?.carbon ?? stats.carbon)} CO₂/일</b></div>
        <button class="icon-btn close-modal" aria-label="시설 창 닫기"><i data-lucide="x"></i></button>
      </header>
      <div class="facility-console-scroll">${bodyMarkup}</div>
      <footer class="facility-console-footer">
        <button class="btn secondary" type="button" data-console-close>닫기</button>
        <div>
          <button class="btn secondary" id="demolishBtn" ${gameState.isEditable ? '' : 'disabled'}><i data-lucide="trash-2"></i> 철거 +${formatCredits(refund)}</button>
          <button class="btn primary ${upgradeValidation.ok ? '' : 'condition-check'}" id="upgradeBtn" title="${escapeHtml(upgradeRequirement)}"><i data-lucide="chevrons-up"></i> ${canLevel ? `Lv.${cell.level + 1} · ${formatCredits(nextCost)}` : cell.level < facility.maxLevel ? '강화 조건 확인' : '최대 레벨'}</button>
        </div>
      </footer>
    </div>
  `, { id: 'facility', pausesSimulation: false });
  $$modal('.close-modal,[data-console-close]').forEach((button) => button.addEventListener('click', closeModal));
  if (cell.type === 'data') bindResearchPanel($modal('.research-panel'), index, () => {
    refreshAll();
    openFacilityInspectorModal(index);
  });
  $$modal('#facilityPriorityControls button').forEach((button) => button.addEventListener('click', () => {
    const result = setFacilityPriority(gameState, index, button.dataset.priority);
    if (!result.ok) return;
    if (result.before !== result.after) {
      eventBus.emit(Events.FACILITY_PRIORITY_CHANGED, { index, priority: result.after });
    }
    refreshAll();
    openFacilityInspectorModal(index);
  }));
  $$modal('#facilityModeControls [data-operation-mode]').forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.operationMode;
    const preview = previewFacilityOperationMode(gameState, index, mode);
    if (!preview.ok) return;
    const labels = [
      ['전력 수요', 'demand', 'E/일'],
      ['순수입', 'netIncome', '💰/일'],
      ['탄소', 'carbon', 'CO₂/일'],
      ['물', 'water', '/일'],
      ['필요 인력', 'workforce', '명'],
    ];
    const target = $modal('#modeChangeForecast');
    target.innerHTML = `
      <div class="mode-forecast-grid">
        ${labels.map(([label, key, unit]) => `<div><span>${label}</span><strong>${round1(preview.forecast[key].before)} → ${round1(preview.forecast[key].after)} ${unit}</strong></div>`).join('')}
      </div>
      <button class="btn primary" type="button" id="confirmOperationMode">${supportedModes[mode].label} 모드 적용</button>`;
    $modal('#confirmOperationMode').addEventListener('click', () => {
      const result = setFacilityOperationMode(gameState, index, mode);
      if (!result.ok) return;
      eventBus.emit(Events.OPERATION_MODE_CHANGED, { index, ...result });
      eventBus.emit(Events.SAVE_REQUESTED, {});
      refreshAll();
      openFacilityInspectorModal(index);
    });
  }));
  $$modal('#batteryPolicyControls [data-battery-policy]').forEach((button) => button.addEventListener('click', () => {
    const result = setBatteryPolicy(gameState, index, button.dataset.batteryPolicy);
    if (!result.ok) return;
    eventBus.emit(Events.BATTERY_POLICY_CHANGED, { index, ...result });
    eventBus.emit(Events.SAVE_REQUESTED, {});
    refreshAll();
    openFacilityInspectorModal(index);
  }));
  $modal('#demolishBtn')?.addEventListener('click', () => {
    const demolitionPermit = validateDemolitionPermit(gameState, index);
    if (!demolitionPermit.ok) {
      openDemolitionBlockedModal(index, demolitionPermit);
      return;
    }
    openDemolitionConfirmModal(index);
  });
  $modal('#upgradeBtn')?.addEventListener('click', () => {
    const currentValidation = validateUpgrade(gameState, index);
    if (!currentValidation.ok) {
      closeModal();
      eventBus.emit(Events.TOAST_SHOW, {
        title: '강화 조건 미충족',
        text: upgradeRequirementMessage(gameState, currentValidation),
        priority: true,
      });
      return;
    }
    openUpgradeForecastModal(index, currentValidation);
  });
}

function startUpgradeProject(index) {
  const cell = gameState.grid[index];
  const facility = FACILITIES[cell?.type];
  const result = upgradeCell(index);
  if (!result.ok) return result;
  eventBus.emit(Events.UPGRADE_STARTED, result);
  eventBus.emit(Events.SAVE_REQUESTED, {});
  closeModal();
  refreshAll();
  eventBus.emit(Events.TOAST_SHOW, {
    kicker: 'UPGRADE STARTED',
    title: `${facility.name} 강화 공사 시작`,
    text: `Lv.${result.targetLevel} 완공까지 ${result.durationDays}게임일 · 현재 성능은 제한 가동됩니다.`,
  });
  return result;
}

function forecastValue(snapshot, key, suffix = '') {
  return `${round1(snapshot?.[key] || 0)}${suffix}`;
}

function openUpgradeForecastModal(index, validation) {
  const cell = gameState.grid[index];
  if (!cell || !validation.ok) return;
  const facility = FACILITIES[cell.type];
  const forecast = getUpgradeForecast?.(index, validation.cost);
  if (!forecast) return startUpgradeProject(index);
  const eventDay = forecast.daily.find((day) => day.summary.cityEvent?.started)?.dayOffset;
  const worst = forecast.worstInterval;
  const warningText = worst?.warnings?.length
    ? `${worst.dayOffset}일 뒤 ${worst.warnings.map((warning) => ({
      power_shortfall: '전력 부족',
      negative_income: '운영 적자',
      workforce_shortage: '인력 부족',
      battery_empty: '배터리 고갈',
      city_event_started: '기상이변 시작',
    }[warning] || warning)).join(' · ')}`
    : '예측 구간에 즉시 감지된 운영 위험이 없습니다.';
  const snapshots = [
    ['현재', forecast.current],
    ['공사 중', forecast.during],
    ['완공 후', forecast.completed],
  ];
  setModal(`
    <div data-upgrade-forecast>
      <div class="modal-head"><div><span class="eyebrow">UPGRADE FORECAST</span><h2>${facility.icon} ${facility.name} Lv.${cell.level} → Lv.${validation.nextLevel}</h2></div><button class="icon-btn close-modal" aria-label="강화 예측 닫기"><i data-lucide="x"></i></button></div>
      <p class="muted">${forecast.horizonDays}게임일 동안 기존 시설은 제한 가동되며, 완공 틱부터 새 레벨 성능으로 정산됩니다.</p>
      <div class="upgrade-forecast-grid">
        ${snapshots.map(([label, snapshot]) => `<section><strong>${label}</strong><span>전력 ${forecastValue(snapshot, 'deliveredPower', 'E')} / ${forecastValue(snapshot, 'demand', 'E')}</span><span>순수익 ${forecastValue(snapshot, 'netCredits', ' 💰/일')}</span><span>CO₂ ${forecastValue(snapshot, 'dailyCarbon', '/일')}</span><span>물 ${forecastValue(snapshot, 'dailyWater', '/일')}</span></section>`).join('')}
      </div>
      <div class="callout ${worst?.warnings?.length ? 'danger-callout' : ''}"><strong>가장 위험한 예측 구간</strong><p>${escapeHtml(warningText)}${eventDay ? ` · 기상이변이 ${eventDay}일 뒤 공사 중 시작됩니다.` : ''}</p></div>
      <div class="modal-actions"><button class="btn secondary" id="cancelUpgradeProjectBtn">돌아가기</button><button class="btn primary" id="confirmUpgradeProjectBtn">${formatCredits(validation.cost)} 지불 · 강화 착공</button></div>
    </div>
  `, { id: 'upgrade-forecast', pausesSimulation: false });
  $modal('.close-modal').addEventListener('click', closeModal);
  $modal('#cancelUpgradeProjectBtn').addEventListener('click', () => openFacilityInspectorModal(index));
  $modal('#confirmUpgradeProjectBtn').addEventListener('click', () => {
    const current = validateUpgrade(gameState, index);
    if (!current.ok) return openFacilityInspectorModal(index);
    startUpgradeProject(index);
  });
}

const PROJECT_STAGE_LABELS = Object.freeze({
  foundation: '기초 공사',
  skeleton: '골조 조립',
  shell: '외장 마감',
  complete: '완공',
});

function projectOperationDescription(cell) {
  if (cell.project.kind === 'build') return '공사 중에는 수입·발전·소비·운영비·인력·인접 효과가 모두 0입니다.';
  const profile = operationProfileForCell(cell);
  if (cell.type === 'residential') return '기존 인구·수입·전력·물 성능의 80%로 운영하며, 운영비는 100% 유지됩니다.';
  if (cell.type === 'battery') return '저장량과 기존 용량은 유지되며 충·방전 출력이 50%로 제한됩니다.';
  if (cell.type === 'data') return '전력 70% · 연구 50% · 수입 60%로 가동하며, 운영비와 인력은 100% 유지됩니다.';
  return `기존 레벨 성능의 ${Math.round(profile.supply * 100)}%로 가동하며, 운영비와 인력은 100% 유지됩니다.`;
}

function openConstructionProjectModal(index) {
  const cell = gameState.grid[index];
  const project = cell?.project;
  if (!cell || !project) return;
  const facility = FACILITIES[cell.type];
  const percent = Math.round(projectProgress(project) * 100);
  const remaining = Math.max(0, project.durationDays - project.elapsedDays);
  const refund = projectRefund(project);
  const kindLabel = project.kind === 'build' ? '신규 건설' : `Lv.${project.fromLevel} → Lv.${project.toLevel} 강화`;
  const targetLabel = project.kind === 'build' ? `Lv.${cell.level}` : `Lv.${project.toLevel}`;

  setModal(`
    <div class="facility-console construction-console" data-facility-console="${cell.type}" data-construction-console="${project.kind}">
      <header class="facility-console-header">
        <div class="facility-console-identity"><span class="facility-console-icon">${facility.icon}</span><div><span class="eyebrow">${project.kind === 'build' ? 'CONSTRUCTION SITE' : 'FACILITY UPGRADE'}</span><h2>${facility.name} · ${kindLabel}</h2><p>도시 시설 #${index} · 목표 ${targetLabel}</p></div></div>
        <div class="facility-console-live"><span>남은 ${remaining}일</span><b>${PROJECT_STAGE_LABELS[projectStage(project)]}</b></div>
        <button class="icon-btn close-modal" aria-label="공사 창 닫기"><i data-lucide="x"></i></button>
      </header>
      <div class="facility-console-scroll">
        <section class="construction-project-status">
          <div class="construction-project-heading"><span>${kindLabel}</span><strong data-project-progress>${percent}%</strong></div>
          <div class="construction-project-bar" role="progressbar" aria-label="공사 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i data-project-progress-bar style="width:${percent}%"></i></div>
          <div class="construction-project-time"><span>${project.elapsedDays} / ${project.durationDays} 게임일</span><b data-project-remaining>남은 ${remaining}일</b></div>
        </section>
        <div class="construction-stage-row" aria-label="공사 단계">
          ${['foundation', 'skeleton', 'shell'].map((stage) => `<span class="${projectStage(project) === stage ? 'active' : ''}">${PROJECT_STAGE_LABELS[stage]}</span>`).join('')}
        </div>
        <div class="callout"><strong>${project.kind === 'build' ? '아직 운영 전' : '제한 가동 중'}</strong><p>${projectOperationDescription(cell)}</p></div>
        <div class="demolition-breakdown"><span>실제 결제 ${formatCredits(project.paidCost)}</span><span>현재 환급 ${formatCredits(refund || 0)}</span><span>완공 틱부터 새 성능 적용</span></div>
      </div>
      <footer class="facility-console-footer">
        <button class="btn secondary" type="button" data-console-close>닫기</button>
        <button class="btn danger" type="button" id="cancelProjectBtn"><i data-lucide="${project.kind === 'build' ? 'trash-2' : 'x'}"></i> ${project.kind === 'build' ? '현장 철거' : '강화 취소'} · +${formatCredits(refund || 0)}</button>
      </footer>
    </div>
  `, { id: 'facility', pausesSimulation: false });
  $$modal('.close-modal,[data-console-close]').forEach((button) => button.addEventListener('click', closeModal));
  $modal('#cancelProjectBtn')?.addEventListener('click', () => openProjectCancelConfirmModal(index));
}

function openProjectCancelConfirmModal(index) {
  const cell = gameState.grid[index];
  const project = cell?.project;
  if (!cell || !project) return;
  const facility = FACILITIES[cell.type];
  const refund = projectRefund(project);
  const actionLabel = project.kind === 'build' ? '건설 현장을 철거' : '강화를 취소';
  setModal(`
    <div data-project-cancel-confirm>
      <div class="modal-head"><div><span class="eyebrow danger-label">CANCEL PROJECT</span><h2>${facility.icon} ${facility.name} ${actionLabel}할까요?</h2></div></div>
      <div class="demolition-warning">
        <strong>${project.kind === 'build' ? '건설 현장이 제거됩니다.' : `기존 Lv.${project.fromLevel} 성능으로 즉시 복귀합니다.`}</strong>
        <p>진행 기간은 복구되지 않습니다. 실제 결제 ${formatCredits(project.paidCost)} 중 현재 구간 환급액은 ${formatCredits(refund || 0)}입니다.</p>
      </div>
      <div class="modal-actions"><button class="btn secondary" id="keepProjectBtn">공사 계속</button><button class="btn danger" id="confirmCancelProjectBtn">취소 확정 · +${formatCredits(refund || 0)}</button></div>
    </div>
  `, { id: 'project-cancel', pausesSimulation: false, dismissible: false });
  $modal('#keepProjectBtn').addEventListener('click', () => openFacilityInspectorModal(index));
  $modal('#confirmCancelProjectBtn').addEventListener('click', () => {
    const result = cancelConstructionProject(gameState, index);
    if (!result.ok) return;
    eventBus.emit(result.kind === 'build' ? Events.CONSTRUCTION_CANCELLED : Events.UPGRADE_CANCELLED, result);
    eventBus.emit(Events.SAVE_REQUESTED, {});
    closeModal();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, {
      title: `${facility.name} 공사 취소`,
      text: `${formatCredits(result.refund)} 환급${result.kind === 'upgrade' ? ' · 기존 레벨 정상 가동 복귀' : ''}`,
    });
  });
}

function openDemolitionBlockedModal(index, permit) {
  setModal(`
    <div data-demolition-blocked>
      <div class="modal-head"><div><span class="eyebrow danger-label">CITY SAFETY RULE</span><h2>철거 제한</h2></div></div>
      <div class="demolition-warning">
        <strong>이 시설은 지금 철거할 수 없습니다.</strong>
        <p>${escapeHtml(permit.message)}</p>
      </div>
      <div class="callout"><strong>해결 방법</strong><p>${escapeHtml(permit.resolution || '철거 조건을 충족한 뒤 다시 시도하세요.')}</p></div>
      <div class="modal-actions"><button class="btn primary" id="confirmDemolitionBlocked">확인</button></div>
    </div>
  `, { id: 'demolition-blocked', pausesSimulation: false, dismissible: false });
  $modal('#confirmDemolitionBlocked').addEventListener('click', () => openFacilityInspectorModal(index));
}

function openDemolitionConfirmModal(index) {
  const cell = gameState.grid[index];
  if (!cell) return;
  const demolitionPermit = validateDemolitionPermit(gameState, index);
  if (!demolitionPermit.ok) {
    openDemolitionBlockedModal(index, demolitionPermit);
    return;
  }
  const facility = FACILITIES[cell.type];
  const investment = investedCost(cell);
  const refund = demolitionRefund(cell);
  const loss = investment - refund;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow danger-label">IRREVERSIBLE ACTION</span><h2>${facility.icon} ${facility.name}을 철거할까요?</h2></div></div>
    <div class="demolition-warning">
      <strong>이 작업은 되돌릴 수 없습니다.</strong>
      <p>시설과 강화 단계가 즉시 사라집니다. 다시 건설하면 전체 비용을 다시 지불해야 합니다.</p>
    </div>
    <div class="demolition-breakdown"><span>총 투자 ${formatCredits(investment)}</span><span>환급 ${formatCredits(refund)}</span><span>영구 손실 ${formatCredits(loss)}</span></div>
    <div class="modal-actions"><button class="btn secondary" id="cancelDemolishBtn">취소</button><button class="btn danger" id="confirmDemolishBtn">철거 확정 · +${formatCredits(refund)}</button></div>
  `, { id: 'demolition-confirm', pausesSimulation: false });
  $modal('#cancelDemolishBtn').addEventListener('click', () => openFacilityInspectorModal(index));
  $modal('#confirmDemolishBtn').addEventListener('click', () => {
    const result = demolishCell(index);
    if (!result.ok) return;
    handleResearchFacilityRemoved(gameState, index);
    eventBus.emit(Events.BOARD_DEMOLISHED, result);
    closeModal();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, { title: '철거 완료', text: `${facility.name} 제거 · ${formatCredits(result.refund)} 환급` });
    eventBus.emit(Events.AUDIO_SFX, { name: 'demolish' });
  });
}

export function openReportModal() {
  const report = Report.computeReport();
  const operation = report.operations;
  const axisLabels = {
    powerStability: '전력 안정성',
    environment: '환경',
    economy: '경제',
    resourceUse: '자원 효율',
    operatingResponse: '운영 대응',
  };
  const quizComplete = Object.hasOwn(gameState.quizResults, 'climate-council');
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">FINAL REPORT</span><h2>기후 생존 도시 성적표</h2></div></div>
    <div class="final-rank"><div class="rank-icon">${report.tier.icon}</div><h2>${escapeHtml(report.profile.title)} · 운영 ${report.operatingTotal}점</h2><p>${report.profile.developing ? '현재 도시에서 가장 가까운 발전 방향입니다.' : '운영 기록에서 뚜렷하게 나타난 도시 유형입니다.'} ${report.profile.reasons.map(escapeHtml).join(' · ')}</p></div>
    <div class="summary-grid final-score-breakdown">
      <div class="summary-card"><span>도시 운영</span><strong>${report.operatingTotal} / 100</strong></div>
      <div class="summary-card"><span>퀴즈 보너스</span><strong>+${report.quizBonus} / 10</strong></div>
      <div class="summary-card"><span>최종 합계</span><strong>${report.totalWithBonus} / 110</strong></div>
      <div class="summary-card"><span>생존 시험</span><strong>${report.stress.passed ? '통과' : '기록 없음'}</strong></div>
    </div>
    <div class="report-axis-grid">
      ${Object.entries(report.axes).map(([id, item]) => `<article><div><span>${axisLabels[id]}</span><b>${item.score} / ${item.max}</b></div><div class="objective-card-progress"><i style="width:${item.value}%"></i></div><small>${item.value}점 지표</small></article>`).join('')}
    </div>
    <div class="summary-grid">
      <div class="summary-card"><span>일일 순수익</span><strong>${formatCredits(operation.averageNetIncome)}/일</strong></div>
      <div class="summary-card"><span>평균 송전 효율</span><strong>${operation.averageTransmissionEfficiency}%</strong></div>
      <div class="summary-card"><span>재생전력 비중</span><strong>${operation.renewableShare}%</strong></div>
      <div class="summary-card"><span>배터리 공급</span><strong>${operation.batteryEnergyUsed}E</strong></div>
      <div class="summary-card"><span>필수시설 평균</span><strong>${report.stress.averageEssentialSupply}%</strong></div>
      <div class="summary-card"><span>최저 공급</span><strong>${report.stress.minimumEssentialSupply}%</strong></div>
      <div class="summary-card"><span>탄소 위험</span><strong>${report.stress.carbonRiskDays}일</strong></div>
      <div class="summary-card"><span>물 초과</span><strong>${report.stress.waterViolationDays}일</strong></div>
    </div>
    <div class="callout"><strong>운영 패널티 ${report.penalties}점</strong><p>긴급지원과 장기 탄소 압력이 있을 때만 운영 100점에서 차감됩니다. 과밀 ${formatCredits(operation.overcrowdingCost)} · 건강/민원 ${formatCredits(operation.healthCost)}</p></div>
    <div class="modal-actions"><button class="btn secondary" id="exportBtn"><i data-lucide="download"></i> 결과 저장</button>${quizComplete ? '' : '<button class="btn secondary" id="finalBonusQuizBtn">개념 퀴즈 · 최대 +10</button>'}<button class="btn primary" id="closeFinalBtn">도시 계속 보기</button></div>
  `, { id: 'final-report', pausesSimulation: true });
  anime({ targets: '.final-rank .rank-icon', scale: [0.4, 1], rotate: [-15, 0], duration: 500, easing: 'easeOutElastic(1, .6)' });
  $modal('#closeFinalBtn').addEventListener('click', closeModal);
  $modal('#exportBtn').addEventListener('click', exportResultFile);
  $modal('#finalBonusQuizBtn')?.addEventListener('click', () => eventBus.emit(Events.FINAL_QUIZ_REQUESTED, {}));
}

export function openStressTestModal(onStarted = null) {
  const previous = gameState.stressTest.result;
  const totalDays = STRESS_PHASES.reduce((sum, phase) => sum + phase.durationDays, 0);
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">CHAPTER 4 · FINAL TEST</span><h2>도시 스트레스 테스트</h2></div><button class="icon-btn close-modal" aria-label="닫기"><i data-lucide="x"></i></button></div>
    <p class="expansion-choice-intro">지금까지 만든 도시를 ${totalDays}일 동안 복합 위기에 노출합니다. 도시를 멈추지 않고 운영 결정을 내려 생존시키세요.</p>
    <div class="stress-phase-list">
      ${STRESS_PHASES.map((phase, index) => `<article><span>${index + 1}</span><i data-lucide="${phase.icon}"></i><strong>${phase.label}</strong><b>${phase.durationDays}일</b></article>`).join('')}
    </div>
    <div class="callout"><strong>테스트 중에도 가능한 행동</strong><p>운영 모드·전력 우선순위·배터리 정책·연구·강화·긴급 건설을 계속 사용할 수 있습니다. 단, 신규 건설비는 20% 증가합니다.</p></div>
    <div class="callout"><strong>8개 통과 조건</strong><p>평균 공급 82% 이상 · 최저 공급 50% 이상 · 연속 적자 4일 미만 · 종료 크레딧 0 이상 · 물 초과 6일 이하 · 복구 3일 이내 · 조력 8E 이상 · CO₂ 평균 8/일 이하(35일 안전, 10 초과 최대 3일)</p></div>
    ${previous && !previous.passed ? `<div class="demolition-warning"><strong>이전 시도 진단</strong><p>${escapeHtml(previous.diagnosis?.label || '도시 운영을 보완한 뒤 다시 시도하세요.')}</p></div>` : ''}
    <div class="modal-actions"><button class="btn secondary close-modal">아직 준비하기</button><button class="btn primary" id="startStressTestBtn">${previous ? '테스트 재시작' : '테스트 시작'}</button></div>
  `, { id: 'stress-test-start', pausesSimulation: true });
  $$modal('.close-modal').forEach((button) => button.addEventListener('click', closeModal));
  $modal('#startStressTestBtn').addEventListener('click', () => {
    const result = startStressTest(gameState);
    if (!result.ok) {
      eventBus.emit(Events.TOAST_SHOW, {
        title: '최종시험 시작 조건 미충족',
        text: result.reason === 'tidal_required'
          ? '조력 발전 실증 연구와 가동 가능한 조력발전 1기가 필요합니다.'
          : '현재 단계에서는 최종시험을 시작할 수 없습니다.',
        priority: true,
      });
      return;
    }
    closeModal();
    eventBus.emit(Events.STRESS_TEST_STARTED, result);
    eventBus.emit(Events.SAVE_REQUESTED, {});
    onStarted?.(result);
  });
}

export function openStressResultModal(result, { onReport = null, onClose = null } = {}) {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">STRESS TEST RESULT</span><h2>${result.passed ? '도시 생존 성공' : '도시 보완 필요'}</h2></div></div>
    <div class="final-rank"><div class="rank-icon">${result.passed ? '🛡️' : '🧰'}</div><h2>${result.passed ? '복합 위기를 견뎠습니다.' : '이번 시도는 통과하지 못했습니다.'}</h2><p>${escapeHtml(result.diagnosis?.label || '')}</p></div>
    <div class="summary-grid">
      <div class="summary-card"><span>필수시설 평균</span><strong>${result.averageEssentialSupply}%</strong></div>
      <div class="summary-card"><span>최저 공급률</span><strong>${result.minimumEssentialSupply}%</strong></div>
      <div class="summary-card"><span>정전</span><strong>${result.blackoutDays}일</strong></div>
      <div class="summary-card"><span>평균 순수익</span><strong>${formatCredits(result.averageNetIncome)}/일</strong></div>
      <div class="summary-card"><span>연속 파산 최대</span><strong>${result.maxConsecutiveBankruptcyDays}일</strong></div>
      <div class="summary-card"><span>배터리 사용</span><strong>${round1(result.batteryEnergyUsed)}E</strong></div>
      <div class="summary-card"><span>탄소 위험</span><strong>${result.carbonRiskDays}일</strong></div>
      <div class="summary-card"><span>물 초과</span><strong>${result.waterViolationDays}일</strong></div>
    </div>
    <div class="modal-actions"><button class="btn ${result.passed ? 'secondary' : 'primary'}" id="stressResultClose">${result.passed ? '도시 계속 보기' : '도시 보완하기'}</button>${result.passed ? '<button class="btn primary" id="stressResultReport">최종 운영 보고서</button>' : ''}</div>
  `, { id: 'stress-test-result', pausesSimulation: true });
  $modal('#stressResultClose').addEventListener('click', () => {
    closeModal();
    onClose?.();
  });
  $modal('#stressResultReport')?.addEventListener('click', () => onReport?.());
}

function exportResultFile() {
  const blob = new Blob([JSON.stringify(Report.exportReport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'climate-city-result.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openResetConfirmModal(onConfirm) {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">RESET</span><h2>처음부터 다시 시작?</h2></div></div>
    <p class="muted">도시·퀘스트·연구·운영 기록이 모두 초기화됩니다.</p>
    <div class="modal-actions"><button class="btn secondary" id="cancelReset">취소</button><button class="btn primary" id="confirmReset">초기화</button></div>
  `, { id: 'reset', pausesSimulation: true });
  $modal('#cancelReset').addEventListener('click', closeModal);
  $modal('#confirmReset').addEventListener('click', () => { closeModal(); onConfirm(); });
}

export function openConstructionRiskModal({ facility = null, planCount = 1, currentEconomy, projectedEconomy, onConfirm }) {
  const signedRate = (value) => `${value > 0 ? '+' : ''}${formatCredits(value)}/일`;
  const subject = facility ? `${facility.icon} ${facility.name}` : `건설 계획 ${planCount}개`;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow danger-label">OPERATING RISK</span><h2>운영 적자 경고</h2></div></div>
    <div class="demolition-warning construction-risk-warning">
      <strong>${subject}를 확정하면 일일 크레딧이 감소합니다.</strong>
      <p>현재 생산량으로 운영비를 감당하기 어렵습니다. 수익 시설과 전력을 먼저 확보하면 파산 위험을 줄일 수 있습니다.</p>
    </div>
    <div class="construction-risk-comparison">
      <span><small>현재 예상 순수익</small><strong>${signedRate(currentEconomy.netCredits)}</strong></span>
      <i aria-hidden="true">→</i>
      <span class="danger-value"><small>건설 후 예상 순수익</small><strong>${signedRate(projectedEconomy.netCredits)}</strong></span>
    </div>
    <div class="callout"><strong>건설 후 일일 정산</strong><p>총수입 ${formatCredits(projectedEconomy.grossIncome)}/일 · 운영비 ${formatCredits(projectedEconomy.maintenance)}/일 · 기타 부담 ${formatCredits(projectedEconomy.overcrowding + projectedEconomy.health + projectedEconomy.climateRecovery)}/일</p></div>
    <div class="modal-actions"><button class="btn secondary" id="cancelRiskyBuild">건설 취소</button><button class="btn danger" id="confirmRiskyBuild">그래도 건설</button></div>
  `, { id: 'construction-risk', pausesSimulation: false });
  $modal('#cancelRiskyBuild').addEventListener('click', closeModal);
  $modal('#confirmRiskyBuild').addEventListener('click', () => {
    closeModal();
    onConfirm?.();
  });
}

export function openCarbonGameOverModal({ dailyCarbon = 0, onReset } = {}) {
  const reason = gameState.gameOverReason || 'carbon_crisis';
  const content = reason === 'bankruptcy'
    ? {
      kicker: 'ECONOMIC FAILURE',
      title: '도시 재정이 회복 불능 상태입니다',
      strong: '크레딧 적자가 24일 연속 지속되어 필수 운영 계약이 중단됐습니다.',
      detail: '공장 절전·증산 모드와 확장 유지비를 조정하고, 긴급지원은 위기 초기에 사용하세요.',
    }
    : reason === 'essential_blackout'
      ? {
        kicker: 'GRID FAILURE',
        title: '필수시설 전력망이 붕괴했습니다',
        strong: '필수시설 공급률 5% 이하가 12일 지속되어 도시 운영이 중단됐습니다.',
        detail: '주거지·냉각시설 우선순위를 높이고 저장 전력을 소비지 가까이에 배치하세요.',
      }
      : {
        kicker: 'CLIMATE FAILURE',
        title: '탄소 임계치를 넘었습니다',
        strong: `탄소 위기가 ${CARBON_CRISIS.GAME_OVER_DAYS}일 지속되어 도시 운영이 중단됐습니다.`,
        detail: `안전 기준은 일일 ${CARBON_CRISIS.SAFE_DAILY} 이하입니다. 마지막 배출량은 ${round1(dailyCarbon)}이며, 기준 이하로 운영하면 위험 기간이 매일 ${CARBON_CRISIS.RECOVERY_PER_SAFE_DAY}일씩 회복됩니다.`,
      };
  setModal(`
    <div class="modal-head"><div><span class="eyebrow danger-label">${content.kicker}</span><h2>${content.title}</h2></div></div>
    <div class="demolition-warning">
      <strong>${content.strong}</strong>
      <p>${content.detail}</p>
    </div>
    <div class="callout"><strong>다음 도시의 생존 전략</strong><p>화력·공장 증설만 반복하지 말고 태양광·풍력·저장 허브와 녹지를 먼저 연결하세요.</p></div>
    <div class="modal-actions"><button class="btn danger" id="restartAfterGameOver">새 도시 시작</button></div>
  `, { id: 'game-over', pausesSimulation: true, dismissible: false });
  $modal('#restartAfterGameOver').addEventListener('click', () => onReset?.());
}

export function openOperationalRiskModal({ reason } = {}) {
  const credit = reason === 'credit-12';
  setModal(`
    <div class="modal-head"><div><span class="eyebrow danger-label">OPERATING PAUSE</span><h2>${credit ? '재정 적자 12일' : '필수시설 정전 6일'}</h2></div></div>
    <div class="demolition-warning">
      <strong>${credit ? '현재 추세가 이어지면 12일 뒤 파산합니다.' : '현재 추세가 이어지면 6일 뒤 전력망이 붕괴합니다.'}</strong>
      <p>${credit ? '공장을 절전 모드로 전환하거나 확장·시설 운영비를 줄이고 흑자 시설을 확보하세요.' : '주거지·냉각 우선순위를 높이고 발전·저장 예비력을 확보하세요.'}</p>
    </div>
    <div class="modal-actions"><button class="btn primary" id="acknowledgeOperationalRisk">운영 조정하기</button></div>
  `, { id: 'operational-risk', pausesSimulation: true, dismissible: false });
  $modal('#acknowledgeOperationalRisk').addEventListener('click', closeModal);
}
