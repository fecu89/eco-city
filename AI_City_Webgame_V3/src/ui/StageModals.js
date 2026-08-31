import anime from 'animejs';
import { FACILITIES, RESEARCH_RULES, WORKFORCE_LEVELS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { setModal, closeModal, getModalState, $modal, $$modal } from './Modal.js';
import { escapeHtml, formatCredits, round1 } from './format.js';
import {
  cellStats,
  demolitionRefund,
  demolishCell,
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

let refreshAll = () => {};
let inspectorIndex = null;
let inspectorTab = 'operation';
export function initStageModals(refreshCallback) {
  refreshAll = refreshCallback;
  eventBus.on(Events.SIMULATION_TICKED, refreshOpenInspector);
  eventBus.on(Events.RESEARCH_QUIZ_CLOSED, ({ dataCenterIndex }) => {
    if (Number.isInteger(dataCenterIndex) && gameState.grid[dataCenterIndex]?.type === 'data') {
      openFacilityInspectorModal(dataCenterIndex, 'research');
    }
  });
}

function refreshOpenInspector() {
  if (inspectorIndex == null || getModalState()?.id !== 'facility') return;
  const live = gameState.lastTickSummary;
  const power = live?.facilityPower?.[inspectorIndex];
  const economy = live?.facilityEconomy?.[inspectorIndex];
  const cell = gameState.grid[inspectorIndex];
  if (!cell) return;
  const stats = cellStats(cell);
  const incomeEl = $modal('#facilityLiveIncome');
  const powerEl = $modal('#facilityLivePower');
  if (incomeEl) incomeEl.textContent = economy ? `${formatCredits(economy.income)}/h` : '대기';
  if (powerEl) powerEl.textContent = power ? `${Math.round(power.ratio * 100)}%` : stats.supply ? `+${round1(stats.supply)}E` : `-${round1(stats.demand)}E`;
  const researchRoot = $modal('.research-panel, .research-locked');
  if (researchRoot && refreshResearchPanelLive(researchRoot)) openFacilityInspectorModal(inspectorIndex, inspectorTab);
}

export function openHelpModal() {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">HOW TO PLAY</span><h2>기후 생존 도시 · 15레벨</h2></div><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div>
    <div class="help-grid">
      <article><span>01</span><h3>건설 계획</h3><p>건설 창에서 여러 시설을 반투명 계획으로 올린 뒤, 하단의 N개 확정을 눌러 한꺼번에 건설합니다.</p></article>
      <article><span>02</span><h3>운영</h3><p>1초마다 1시간이 흐르며 수입·전력·탄소·물이 정산됩니다. 화면에는 날짜만 표시됩니다.</p></article>
      <article><span>03</span><h3>전력망</h3><p>거리가 멀수록 송전 손실이 커지고 저장장치는 중심과 인접한 6방향의 손실을 줄입니다.</p></article>
      <article><span>04</span><h3>퀘스트</h3><p>현재 퀘스트 조건을 유지한 뒤 직접 보상을 받아 다음 레벨로 갑니다.</p></article>
      <article><span>05</span><h3>기후 대응</h3><p>시간당 탄소 8을 넘긴 채 168시간이 지나면 도시가 중단됩니다. 기준 이하는 위험 시간을 회복합니다.</p></article>
      <article><span>06</span><h3>철거</h3><p>철거 환급은 누적 건설·강화 비용의 50%입니다.</p></article>
    </div>
    <div class="callout"><strong>시설 허가</strong><p>퀘스트 레벨마다 시설별 최대 수가 정해집니다. 카드의 현재/계획/최대 수를 확인하세요. 핵발전은 도시의 기반 전력을 위해 화력발전 1기 이상을 함께 유지해야 합니다.</p></div>
    <div class="callout"><strong>인구와 필요 인력</strong><p>주거지는 전체 인구를 늘리고, 발전소·공장·데이터센터 같은 운영 시설은 인력을 사용합니다. 계획 전체의 필요 인력이 인구를 넘으면 건설을 확정할 수 없습니다.</p></div>
    <div class="callout"><strong>연구와 퀴즈</strong><p>데이터센터마다 서로 다른 연구를 동시에 진행할 수 있습니다. 연구는 1×에서 최대 ${RESEARCH_RULES.DURATION_HOURS.CAPSTONE / RESEARCH_RULES.GAME_HOURS_PER_REAL_MINUTE}분이며, 각 연구의 전용 퀴즈 4문제를 모두 맞히면 해당 연구의 남은 시간을 전부 단축할 수 있습니다.</p></div>
    <div class="callout"><strong>게임 모델 안내</strong><p>설정에서 낮·노을·밤 조명을 고정할 수 있습니다. 수치는 실제 실측값이 아닌 기후·에너지 시스템 학습용 상대값이며, 조력발전은 섬의 현재 최외곽에만 배치할 수 있습니다.</p></div>
  `);
  $modal('.close-modal').addEventListener('click', closeModal);
}

export function openFacilityInspectorModal(index, requestedTab = null) {
  const cell = gameState.grid[index];
  if (!cell) return;
  if (inspectorIndex !== index) inspectorTab = 'operation';
  const availableTabs = cell.type === 'data' ? ['operation', 'research', 'management'] : ['operation', 'management'];
  if (requestedTab && availableTabs.includes(requestedTab)) inspectorTab = requestedTab;
  if (!availableTabs.includes(inspectorTab)) inspectorTab = 'operation';
  inspectorIndex = index;

  const facility = FACILITIES[cell.type];
  const stats = cellStats(cell);
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
  const workforceValue = WORKFORCE_LEVELS[cell.type]?.[cell.level] ?? 0;
  const workforceLabel = cell.type === 'residential' ? '전체 인구' : '필요 인력';
  const workforceText = cell.type === 'residential' ? `+${workforceValue}명` : `${workforceValue}명`;
  const priorityMarkup = priorityUnlocked ? `<div class="facility-priority"><strong>전력 공급 우선순위</strong><div class="segmented-control" id="facilityPriorityControls">
    ${[['essential', '필수'], ['normal', '일반'], ['saving', '절약']].map(([value, label]) => `<button type="button" data-priority="${value}" class="${(cell.priority || 'normal') === value ? 'active' : ''}">${label}</button>`).join('')}
  </div></div>` : '';
  const operationMarkup = `
    <div class="facility-inspector-grid">
      <div><span>시간당 수입</span><strong id="facilityLiveIncome">${economy ? `${formatCredits(economy.income)}/h` : '대기'}</strong></div>
      <div><span>전력 공급</span><strong id="facilityLivePower">${power ? `${Math.round(power.ratio * 100)}%` : stats.supply ? `+${round1(stats.supply)}E` : `-${round1(stats.demand)}E`}</strong></div>
      <div><span>탄소</span><strong>${round1(stats.carbon)} CO₂/h</strong></div>
      <div><span>물</span><strong>${round1(stats.water)}/h</strong></div>
      <div><span>${workforceLabel}</span><strong>${workforceText}</strong></div>
    </div>
    <div class="spatial-tags">${positive}${warnings}</div>
    <div class="callout"><strong>공간 규칙</strong><p>${facility.desc}</p></div>
    ${priorityMarkup}`;
  const managementMarkup = `
    <div class="facility-management-summary">
      <span class="eyebrow">ASSET MANAGEMENT</span>
      <h3>${facility.name} 투자와 강화</h3>
      <p>철거 시 누적 투자비의 50%만 환급됩니다. 강화 조건과 영구 손실을 확인하세요.</p>
    </div>
    <div class="demolition-breakdown" id="demolitionBreakdown"><span>총 투자 ${formatCredits(investment)}</span><span>환급 ${formatCredits(refund)}</span><span>손실 ${formatCredits(loss)}</span></div>
    <p class="upgrade-requirement ${upgradeValidation.ok ? 'ready' : ''}" id="upgradeRequirement">${escapeHtml(upgradeRequirement)}</p>`;
  const bodyMarkup = inspectorTab === 'research'
    ? researchPanelMarkup(index)
    : inspectorTab === 'management' ? managementMarkup : operationMarkup;
  const tabs = availableTabs.map((tab) => {
    const label = { operation: '운영', research: '연구', management: '관리' }[tab];
    return `<button type="button" role="tab" data-facility-tab="${tab}" class="${inspectorTab === tab ? 'active' : ''}" aria-selected="${inspectorTab === tab}">${label}</button>`;
  }).join('');

  setModal(`
    <div class="facility-console" data-facility-console="${cell.type}" data-active-tab="${inspectorTab}">
      <header class="facility-console-header">
        <div class="facility-console-identity"><span class="facility-console-icon">${facility.icon}</span><div><span class="eyebrow">FACILITY CONTROL</span><h2>${facility.name}</h2><p>도시 시설 #${index} · LEVEL ${cell.level}</p></div></div>
        <div class="facility-console-live"><span>${stats.supply ? `+${round1(stats.supply)}E/h` : `-${round1(stats.demand)}E/h`}</span><b>${round1(stats.carbon)} CO₂/h</b></div>
        <button class="icon-btn close-modal" aria-label="시설 창 닫기"><i data-lucide="x"></i></button>
      </header>
      <nav class="facility-console-tabs" role="tablist" aria-label="시설 정보">${tabs}</nav>
      <div class="facility-console-scroll" role="tabpanel">${bodyMarkup}</div>
      <footer class="facility-console-footer">
        <button class="btn secondary" type="button" data-console-close>닫기</button>
        <div>
          ${cell.type === 'data' && inspectorTab === 'operation' ? '<button class="btn secondary" type="button" data-console-open="research">연구 보기</button>' : ''}
          ${inspectorTab !== 'management' ? '<button class="btn secondary" type="button" data-console-open="management">시설 관리</button>' : `
            <button class="btn secondary" id="demolishBtn" ${gameState.isEditable ? '' : 'disabled'}><i data-lucide="trash-2"></i> 철거 +${formatCredits(refund)}</button>
            <button class="btn primary ${upgradeValidation.ok ? '' : 'condition-check'}" id="upgradeBtn" title="${escapeHtml(upgradeRequirement)}"><i data-lucide="chevrons-up"></i> ${canLevel ? `Lv.${cell.level + 1} · ${formatCredits(nextCost)}` : cell.level < facility.maxLevel ? '강화 조건 확인' : '최대 레벨'}</button>`}
        </div>
      </footer>
    </div>
  `, { id: 'facility', pausesSimulation: false });
  $$modal('.close-modal,[data-console-close]').forEach((button) => button.addEventListener('click', closeModal));
  $$modal('[data-facility-tab],[data-console-open]').forEach((button) => button.addEventListener('click', () => {
    openFacilityInspectorModal(index, button.dataset.facilityTab || button.dataset.consoleOpen);
  }));
  if (cell.type === 'data' && inspectorTab === 'research') bindResearchPanel($modal('.research-panel, .research-locked'), index, () => {
    refreshAll();
    openFacilityInspectorModal(index, 'research');
  });
  $$modal('#facilityPriorityControls button').forEach((button) => button.addEventListener('click', () => {
    cell.priority = button.dataset.priority;
    eventBus.emit(Events.FACILITY_PRIORITY_CHANGED, { index, priority: cell.priority });
    refreshAll();
    openFacilityInspectorModal(index, inspectorTab);
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
  setModal(`
    <div class="modal-head"><div><span class="eyebrow danger-label">CLIMATE FAILURE</span><h2>탄소 임계치를 넘었습니다</h2></div></div>
    <div class="demolition-warning">
      <strong>탄소 위기가 168시간 지속되어 도시 운영이 중단됐습니다.</strong>
      <p>안전 기준은 시간당 8 이하입니다. 마지막 배출량은 ${round1(hourlyCarbon)}이며, 기준 이하로 운영하면 위험 시간이 시간당 2시간씩 회복됩니다.</p>
    </div>
    <div class="callout"><strong>다음 도시의 생존 전략</strong><p>화력·공장 증설만 반복하지 말고 태양광·풍력·저장 허브와 녹지를 먼저 연결하세요.</p></div>
    <div class="modal-actions"><button class="btn danger" id="restartAfterGameOver">새 도시 시작</button></div>
  `, { id: 'game-over', pausesSimulation: true, dismissible: false });
  $modal('#restartAfterGameOver').addEventListener('click', () => onReset?.());
}
