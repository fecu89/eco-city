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
import { startObjectiveCampaign } from '../systems/ObjectiveSystem.js';
import { STRESS_PHASES } from '../core/EventDefinitions.js';
import { startStressTest } from '../systems/StressTestSystem.js';
import {
  buildCityModifierContext,
  availableBatteryPolicies,
  facilityModifierAt,
  previewFacilityOperationMode,
  setFacilityOperationMode,
  setBatteryPolicy,
} from '../systems/CityModifierSystem.js';

let refreshAll = () => {};
let inspectorIndex = null;
export function initStageModals(refreshCallback) {
  refreshAll = refreshCallback;
  eventBus.on(Events.SIMULATION_TICKED, refreshOpenInspector);
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
    <p class="expansion-choice-intro">선택한 9칸만 먼저 개방됩니다. 각 지역은 이점과 부담이 함께 있으며, 다음 목표 세트를 마치면 반대편도 열 수 있습니다.</p>
    <div class="expansion-choice-grid">
      ${Object.values(EXPANSION_SIDES).map((side) => `<button type="button" class="expansion-choice-card" data-expansion-side="${side.id}">
        <span class="expansion-direction">${side.id === 'east' ? 'EAST · 동부' : 'WEST · 서부'}</span>
        <strong>${side.label}</strong>
        <p>${side.description}</p>
        <ul>${traitMarkup(side.id)}</ul>
        <b>9칸 개방 · 유지비 +1.00 💰/h</b>
      </button>`).join('')}
    </div>
  `, { id: 'expansion-choice', pausesSimulation: true, dismissible: false });
  $$modal('[data-expansion-side]').forEach((button) => button.addEventListener('click', () => {
    const result = expandGrid(button.dataset.expansionSide);
    if (!result.ok) return;
    eventBus.emit(Events.EXPANSION_CHOSEN, result);
    startObjectiveCampaign(gameState);
    closeModal();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, {
      title: `${EXPANSION_SIDES[result.side].label} 완료`,
      text: '새 대지 9칸 개방 · 도시 유지비 +1.00 💰/h',
      priority: true,
    });
  }));
}

function refreshOpenInspector() {
  if (inspectorIndex == null || getModalState()?.id !== 'facility') return;
  const live = gameState.lastTickSummary;
  const power = live?.facilityPower?.[inspectorIndex];
  const economy = live?.facilityEconomy?.[inspectorIndex];
  const environment = live?.facilityEnvironment?.[inspectorIndex];
  const cell = gameState.grid[inspectorIndex];
  if (!cell) return;
  const modifierContext = buildCityModifierContext(gameState);
  const stats = cellStats(cell, facilityModifierAt(modifierContext, inspectorIndex));
  const incomeEl = $modal('#facilityLiveIncome');
  const powerEl = $modal('#facilityLivePower');
  const carbonEl = $modal('#facilityLiveCarbon');
  const waterEl = $modal('#facilityLiveWater');
  if (incomeEl) incomeEl.textContent = economy ? `${formatCredits(economy.income)}/h` : '대기';
  if (powerEl) powerEl.textContent = power ? `${Math.round(power.ratio * 100)}%` : stats.supply ? `+${round1(stats.supply)}E` : `-${round1(stats.demand)}E`;
  if (carbonEl) carbonEl.textContent = `${round1(environment?.carbon ?? stats.carbon)} CO₂/h`;
  if (waterEl) waterEl.textContent = `${round1(environment?.water ?? stats.water)}/h`;
  const researchRoot = $modal('.research-panel');
  if (researchRoot && refreshResearchPanelLive(researchRoot)) openFacilityInspectorModal(inspectorIndex);
}

export function openHelpModal() {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">HOW TO PLAY</span><h2>기후 생존 도시 · 15레벨</h2></div><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div>
    <div class="help-grid">
      <article><span>01</span><h3>건설 계획</h3><p>건설 창에서 여러 시설을 반투명 계획으로 올린 뒤, 하단의 N개 확정을 눌러 한꺼번에 건설합니다.</p></article>
      <article><span>02</span><h3>운영</h3><p>1초마다 1시간이 흐르며 수입·전력·탄소·물이 정산됩니다. 화면에는 날짜만 표시됩니다.</p></article>
      <article><span>03</span><h3>전력망</h3><p>거리가 멀수록 송전 손실이 커지고 저장장치는 중심과 인접한 6방향의 손실을 줄입니다.</p></article>
      <article><span>04</span><h3>퀘스트</h3><p>현재 퀘스트 조건을 유지한 뒤 직접 보상을 받아 다음 레벨로 갑니다.</p></article>
      <article><span>05</span><h3>기후 대응</h3><p>시간당 탄소 ${CARBON_CRISIS.SAFE_HOURLY}을 넘긴 채 ${CARBON_CRISIS.GAME_OVER_HOURS}시간이 지나면 도시가 중단됩니다. 기준 이하는 위험 시간을 회복합니다.</p></article>
      <article><span>06</span><h3>철거</h3><p>철거 환급은 누적 건설·강화 비용의 50%입니다.</p></article>
    </div>
    <div class="callout"><strong>시설 허가</strong><p>퀘스트 레벨마다 시설별 최대 수가 정해집니다. 핵발전은 처음에는 화력발전 1기가 필요하지만, 저탄소 저장 허브 완료 후에는 에너지저장 시설이 예비력을 대신합니다.</p></div>
    <div class="callout"><strong>인구와 필요 인력</strong><p>주거지는 전체 인구를 늘리고, 발전소·공장·데이터센터 같은 운영 시설은 인력을 사용합니다. 계획 전체의 필요 인력이 인구를 넘으면 건설을 확정할 수 없습니다.</p></div>
    <div class="callout"><strong>연구와 퀴즈</strong><p>데이터센터마다 서로 다른 연구를 동시에 진행할 수 있습니다. 연구는 1×에서 최대 ${RESEARCH_RULES.DURATION_HOURS.CAPSTONE / RESEARCH_RULES.GAME_HOURS_PER_REAL_MINUTE}분이며, 각 연구의 전용 퀴즈 4문제를 모두 맞히면 해당 연구의 남은 시간을 전부 단축할 수 있습니다.</p></div>
    <div class="callout"><strong>게임 모델 안내</strong><p>설정에서 낮·노을·밤 조명을 고정할 수 있습니다. 수치는 실제 실측값이 아닌 기후·에너지 시스템 학습용 상대값이며, 조력발전은 섬의 현재 최외곽에만 배치할 수 있습니다.</p></div>
  `);
  $modal('.close-modal').addEventListener('click', closeModal);
}

export function openFacilityInspectorModal(index) {
  const cell = gameState.grid[index];
  if (!cell) return;
  inspectorIndex = index;

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
  const operationMarkup = `
    <div class="facility-inspector-grid">
      <div><span>시간당 수입</span><strong id="facilityLiveIncome">${economy ? `${formatCredits(economy.income)}/h` : '대기'}</strong></div>
      <div><span>전력 공급</span><strong id="facilityLivePower">${power ? `${Math.round(power.ratio * 100)}%` : stats.supply ? `+${round1(stats.supply)}E` : `-${round1(stats.demand)}E`}</strong></div>
      <div><span>탄소</span><strong id="facilityLiveCarbon">${round1(environment?.carbon ?? stats.carbon)} CO₂/h</strong></div>
      <div><span>물</span><strong id="facilityLiveWater">${round1(environment?.water ?? stats.water)}/h</strong></div>
      <div><span>${workforceLabel}</span><strong>${workforceText}</strong></div>
    </div>
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
        <div class="facility-console-live"><span>${stats.supply ? `+${round1(stats.supply)}E/h` : `-${round1(stats.demand)}E/h`}</span><b>${round1(environment?.carbon ?? stats.carbon)} CO₂/h</b></div>
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
    cell.priority = button.dataset.priority;
    eventBus.emit(Events.FACILITY_PRIORITY_CHANGED, { index, priority: cell.priority });
    refreshAll();
    openFacilityInspectorModal(index);
  }));
  $$modal('#facilityModeControls [data-operation-mode]').forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.operationMode;
    const preview = previewFacilityOperationMode(gameState, index, mode);
    if (!preview.ok) return;
    const labels = [
      ['전력 수요', 'demand', 'E/h'],
      ['순수입', 'netIncome', '💰/h'],
      ['탄소', 'carbon', 'CO₂/h'],
      ['물', 'water', '/h'],
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
    const result = upgradeCell(index);
    if (!result.ok) return;
    eventBus.emit(Events.BOARD_UPGRADED, result);
    closeModal();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, { title: '시설 업그레이드', text: `${facility.name} → Lv.${cell.level}` });
    eventBus.emit(Events.AUDIO_SFX, { name: 'upgrade' });
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
  const delta = (value) => value > 0 ? `+${value}` : `${value}`;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">FINAL REPORT</span><h2>기후 생존 도시 성적표</h2></div></div>
    <div class="final-rank"><div class="rank-icon">${report.tier.icon}</div><h2>${escapeHtml(report.tier.title)} · ${report.total}점</h2><p>15개 퀘스트에서 만든 도시의 실제 운영 기록입니다.</p></div>
    <div class="summary-grid final-score-breakdown">
      <div class="summary-card"><span>운영 점수</span><strong>${report.operationsScore} / 50</strong></div>
      <div class="summary-card"><span>설계 점수</span><strong>${report.designScore} / 30</strong></div>
      <div class="summary-card"><span>지식 점수</span><strong>${report.knowledgeScore} / 20</strong></div>
      <div class="summary-card"><span>퀴즈 정답률</span><strong>${report.knowledgeAccuracy}%</strong></div>
    </div>
    <div class="summary-grid">
      <div class="summary-card"><span>시간당 순수익</span><strong>${formatCredits(operation.averageNetCredits)}/h</strong></div>
      <div class="summary-card"><span>평균 송전 효율</span><strong>${operation.averageTransmissionEfficiency}%</strong></div>
      <div class="summary-card"><span>저탄소 전력</span><strong>${operation.averageLowCarbonPercent}%</strong></div>
      <div class="summary-card"><span>필수시설 정전</span><strong>${operation.essentialOutageHours}시간</strong></div>
      <div class="summary-card"><span>고용률</span><strong>${operation.averageEmploymentRate}%</strong></div>
      <div class="summary-card"><span>산업 인력 충족</span><strong>${operation.averageIndustryFill}%</strong></div>
      <div class="summary-card"><span>탄소 변화</span><strong>${delta(report.carbonDelta)}</strong></div>
      <div class="summary-card"><span>물 변화</span><strong>${delta(report.waterDelta)}</strong></div>
    </div>
    <div class="callout"><strong>운영 패널티</strong><p>누적 과밀 ${formatCredits(operation.overcrowdingCost)} · 건강/민원 ${formatCredits(operation.healthCost)}</p></div>
    <div class="modal-actions"><button class="btn secondary" id="exportBtn"><i data-lucide="download"></i> 결과 저장</button><button class="btn primary" id="closeFinalBtn">도시 계속 보기</button></div>
  `, { id: 'final-report', pausesSimulation: true });
  anime({ targets: '.final-rank .rank-icon', scale: [0.4, 1], rotate: [-15, 0], duration: 500, easing: 'easeOutElastic(1, .6)' });
  $modal('#closeFinalBtn').addEventListener('click', closeModal);
  $modal('#exportBtn').addEventListener('click', exportResultFile);
}

export function openStressTestModal(onStarted = null) {
  const previous = gameState.stressTest.result;
  const totalHours = STRESS_PHASES.reduce((sum, phase) => sum + phase.durationHours, 0);
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">CHAPTER 4 · FINAL TEST</span><h2>도시 스트레스 테스트</h2></div><button class="icon-btn close-modal" aria-label="닫기"><i data-lucide="x"></i></button></div>
    <p class="expansion-choice-intro">지금까지 만든 도시를 ${totalHours}시간 동안 복합 위기에 노출합니다. 도시를 멈추지 않고 운영 결정을 내려 생존시키세요.</p>
    <div class="stress-phase-list">
      ${STRESS_PHASES.map((phase, index) => `<article><span>${index + 1}</span><i data-lucide="${phase.icon}"></i><strong>${phase.label}</strong><b>${phase.durationHours}h</b></article>`).join('')}
    </div>
    <div class="callout"><strong>테스트 중에도 가능한 행동</strong><p>운영 모드·전력 우선순위·배터리 정책·연구·강화·긴급 건설을 계속 사용할 수 있습니다. 단, 신규 건설비는 20% 증가합니다.</p></div>
    <div class="callout"><strong>최소 생존 조건</strong><p>필수시설 평균 공급 70% 이상 · 연속 파산 6시간 미만 · 종료 크레딧 0 이상 · 탄소 극단 위험 미도달</p></div>
    ${previous && !previous.passed ? `<div class="demolition-warning"><strong>이전 시도 진단</strong><p>${escapeHtml(previous.diagnosis?.label || '도시 운영을 보완한 뒤 다시 시도하세요.')}</p></div>` : ''}
    <div class="modal-actions"><button class="btn secondary close-modal">아직 준비하기</button><button class="btn primary" id="startStressTestBtn">${previous ? '테스트 재시작' : '테스트 시작'}</button></div>
  `, { id: 'stress-test-start', pausesSimulation: true });
  $$modal('.close-modal').forEach((button) => button.addEventListener('click', closeModal));
  $modal('#startStressTestBtn').addEventListener('click', () => {
    const result = startStressTest(gameState);
    if (!result.ok) return;
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
      <div class="summary-card"><span>정전</span><strong>${result.blackoutHours}시간</strong></div>
      <div class="summary-card"><span>평균 순수익</span><strong>${formatCredits(result.averageNetIncome)}/h</strong></div>
      <div class="summary-card"><span>연속 파산 최대</span><strong>${result.maxConsecutiveBankruptcyHours}시간</strong></div>
      <div class="summary-card"><span>배터리 사용</span><strong>${round1(result.batteryEnergyUsed)}E</strong></div>
      <div class="summary-card"><span>탄소 위험</span><strong>${result.carbonRiskHours}시간</strong></div>
      <div class="summary-card"><span>물 초과</span><strong>${result.waterViolationHours}시간</strong></div>
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
  const signedRate = (value) => `${value > 0 ? '+' : ''}${formatCredits(value)}/h`;
  const subject = facility ? `${facility.icon} ${facility.name}` : `건설 계획 ${planCount}개`;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow danger-label">OPERATING RISK</span><h2>운영 적자 경고</h2></div></div>
    <div class="demolition-warning construction-risk-warning">
      <strong>${subject}를 확정하면 시간당 크레딧이 감소합니다.</strong>
      <p>현재 생산량으로 운영비를 감당하기 어렵습니다. 수익 시설과 전력을 먼저 확보하면 파산 위험을 줄일 수 있습니다.</p>
    </div>
    <div class="construction-risk-comparison">
      <span><small>현재 예상 순수익</small><strong>${signedRate(currentEconomy.netCredits)}</strong></span>
      <i aria-hidden="true">→</i>
      <span class="danger-value"><small>건설 후 예상 순수익</small><strong>${signedRate(projectedEconomy.netCredits)}</strong></span>
    </div>
    <div class="callout"><strong>건설 후 시간당 정산</strong><p>총수입 ${formatCredits(projectedEconomy.grossIncome)}/h · 운영비 ${formatCredits(projectedEconomy.maintenance)}/h · 기타 부담 ${formatCredits(projectedEconomy.overcrowding + projectedEconomy.health + projectedEconomy.climateRecovery)}/h</p></div>
    <div class="modal-actions"><button class="btn secondary" id="cancelRiskyBuild">건설 취소</button><button class="btn danger" id="confirmRiskyBuild">그래도 건설</button></div>
  `, { id: 'construction-risk', pausesSimulation: false });
  $modal('#cancelRiskyBuild').addEventListener('click', closeModal);
  $modal('#confirmRiskyBuild').addEventListener('click', () => {
    closeModal();
    onConfirm?.();
  });
}

export function openCarbonGameOverModal({ hourlyCarbon = 0, onReset } = {}) {
  const reason = gameState.gameOverReason || 'carbon_crisis';
  const content = reason === 'bankruptcy'
    ? {
      kicker: 'ECONOMIC FAILURE',
      title: '도시 재정이 회복 불능 상태입니다',
      strong: '크레딧 적자가 24시간 연속 지속되어 필수 운영 계약이 중단됐습니다.',
      detail: '공장 절전·증산 모드와 확장 유지비를 조정하고, 긴급지원은 위기 초기에 사용하세요.',
    }
    : reason === 'essential_blackout'
      ? {
        kicker: 'GRID FAILURE',
        title: '필수시설 전력망이 붕괴했습니다',
        strong: '필수시설 공급률 5% 이하가 12시간 지속되어 도시 운영이 중단됐습니다.',
        detail: '주거지·냉각시설 우선순위를 높이고 저장 전력을 소비지 가까이에 배치하세요.',
      }
      : {
        kicker: 'CLIMATE FAILURE',
        title: '탄소 임계치를 넘었습니다',
        strong: `탄소 위기가 ${CARBON_CRISIS.GAME_OVER_HOURS}시간 지속되어 도시 운영이 중단됐습니다.`,
        detail: `안전 기준은 시간당 ${CARBON_CRISIS.SAFE_HOURLY} 이하입니다. 마지막 배출량은 ${round1(hourlyCarbon)}이며, 기준 이하로 운영하면 위험 시간이 시간당 ${CARBON_CRISIS.RECOVERY_PER_SAFE_HOUR}시간씩 회복됩니다.`,
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
    <div class="modal-head"><div><span class="eyebrow danger-label">OPERATING PAUSE</span><h2>${credit ? '재정 적자 12시간' : '필수시설 정전 6시간'}</h2></div></div>
    <div class="demolition-warning">
      <strong>${credit ? '현재 추세가 이어지면 12시간 뒤 파산합니다.' : '현재 추세가 이어지면 6시간 뒤 전력망이 붕괴합니다.'}</strong>
      <p>${credit ? '공장을 절전 모드로 전환하거나 확장·시설 운영비를 줄이고 흑자 시설을 확보하세요.' : '주거지·냉각 우선순위를 높이고 발전·저장 예비력을 확보하세요.'}</p>
    </div>
    <div class="modal-actions"><button class="btn primary" id="acknowledgeOperationalRisk">운영 조정하기</button></div>
  `, { id: 'operational-risk', pausesSimulation: true, dismissible: false });
  $modal('#acknowledgeOperationalRisk').addEventListener('click', closeModal);
}
