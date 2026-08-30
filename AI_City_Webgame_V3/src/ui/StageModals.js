import anime from 'animejs';
import { FACILITIES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { setModal, closeModal, $modal, $$modal } from './Modal.js';
import { escapeHtml, round1 } from './format.js';
import {
  cellStats,
  demolitionRefund,
  demolishCell,
  getCellSpatial,
  investedCost,
  stageLevelCap,
  upgradeCell,
  upgradeCost,
} from '../systems/BoardSystem.js';
import * as Report from '../systems/ReportSystem.js';

let refreshAll = () => {};
export function initStageModals(refreshCallback) {
  refreshAll = refreshCallback;
}

export function openHelpModal() {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">HOW TO PLAY</span><h2>기후 생존 도시 · 15레벨</h2></div><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div>
    <div class="help-grid">
      <article><span>01</span><h3>건설</h3><p>건설 버튼을 연 상태에서만 빈 대지에 시설을 배치합니다.</p></article>
      <article><span>02</span><h3>운영</h3><p>5초마다 1시간이 흐르며 수입·전력·탄소·물이 정산됩니다.</p></article>
      <article><span>03</span><h3>전력망</h3><p>거리가 멀수록 송전 손실이 커지고 저장장치는 8방향 허브가 됩니다.</p></article>
      <article><span>04</span><h3>퀘스트</h3><p>현재 퀘스트 조건을 유지한 뒤 직접 보상을 받아 다음 레벨로 갑니다.</p></article>
      <article><span>05</span><h3>기후 대응</h3><p>폭염·야간·저탄소·물 관리 위기를 차례로 해결합니다.</p></article>
      <article><span>06</span><h3>철거</h3><p>철거 환급은 누적 건설·강화 비용의 50%입니다.</p></article>
    </div>
    <div class="callout"><strong>게임 모델 안내</strong><p>수치는 실제 실측값이 아닌 기후·에너지 시스템 학습용 상대값입니다.</p></div>
  `);
  $modal('.close-modal').addEventListener('click', closeModal);
}

export function openFacilityInspectorModal(index) {
  const cell = gameState.grid[index];
  if (!cell) return;
  const facility = FACILITIES[cell.type];
  const stats = cellStats(cell);
  const spatial = getCellSpatial(gameState.grid, index, gameState.gridSize);
  const cap = Math.min(facility.maxLevel, stageLevelCap());
  const nextCost = upgradeCost(cell);
  const canLevel = cell.level < cap;
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

  setModal(`
    <div class="modal-head"><div><span class="eyebrow">FACILITY</span><h2>${facility.icon} ${facility.name} · Lv.${cell.level}</h2></div><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div>
    <div class="facility-inspector-grid">
      <div><span>시간당 수입</span><strong>${economy ? `${round1(economy.income)}C` : '대기'}</strong></div>
      <div><span>전력 공급</span><strong>${power ? `${Math.round(power.ratio * 100)}%` : stats.supply ? `+${round1(stats.supply)}E` : `-${round1(stats.demand)}E`}</strong></div>
      <div><span>탄소</span><strong>${round1(stats.carbon)}</strong></div>
      <div><span>물</span><strong>${round1(stats.water)}</strong></div>
    </div>
    <div class="spatial-tags">${positive}${warnings}</div>
    <div class="callout"><strong>공간 규칙</strong><p>${facility.desc}</p></div>
    ${priorityUnlocked ? `<div class="facility-priority"><strong>전력 공급 우선순위</strong><div class="segmented-control" id="facilityPriorityControls">
      ${[['essential', '필수'], ['normal', '일반'], ['saving', '절약']].map(([value, label]) => `<button type="button" data-priority="${value}" class="${(cell.priority || 'normal') === value ? 'active' : ''}">${label}</button>`).join('')}
    </div></div>` : ''}
    <div class="demolition-breakdown" id="demolitionBreakdown"><span>총 투자 ${investment}C</span><span>환급 ${refund}C</span><span>손실 ${loss}C</span></div>
    <div class="modal-actions facility-actions">
      <button class="btn secondary" id="demolishBtn" ${gameState.isEditable ? '' : 'disabled'}><i data-lucide="trash-2"></i> 철거 +${refund}C</button>
      <button class="btn primary" id="upgradeBtn" ${gameState.isEditable && canLevel && gameState.credits >= nextCost ? '' : 'disabled'}><i data-lucide="chevrons-up"></i> ${canLevel ? `Lv.${cell.level + 1} · ${nextCost}C` : cell.level < facility.maxLevel ? '허가 필요' : '최대 레벨'}</button>
    </div>
  `);
  $modal('.close-modal').addEventListener('click', closeModal);
  $$modal('#facilityPriorityControls button').forEach((button) => button.addEventListener('click', () => {
    cell.priority = button.dataset.priority;
    eventBus.emit(Events.FACILITY_PRIORITY_CHANGED, { index, priority: cell.priority });
    refreshAll();
    openFacilityInspectorModal(index);
  }));
  $modal('#demolishBtn')?.addEventListener('click', () => {
    const result = demolishCell(index);
    if (!result.ok) return;
    closeModal();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, { title: '철거 완료', text: `${facility.name} 제거 · ${result.refund}C 환급` });
    eventBus.emit(Events.AUDIO_SFX, { name: 'demolish' });
  });
  $modal('#upgradeBtn')?.addEventListener('click', () => {
    const result = upgradeCell(index);
    if (!result.ok) return;
    closeModal();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, { title: '시설 업그레이드', text: `${facility.name} → Lv.${cell.level}` });
    eventBus.emit(Events.AUDIO_SFX, { name: 'upgrade' });
  });
}

export function openCrisisModal(baseline = {}) {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">CITY CRISIS</span><h2>성장 뒤의 비용이 공개되었습니다</h2></div></div>
    <div class="crisis-grid">
      <div class="crisis-card"><div class="value">${baseline.deliveredPower ?? baseline.reliableSupply ?? 0}/${baseline.demand ?? 0}</div><h3>⚡ 전력</h3><p>거리별 송전 손실</p></div>
      <div class="crisis-card"><div class="value">${baseline.hourlyCarbon ?? baseline.carbon ?? 0}</div><h3>☁ 탄소/시간</h3><p>화력·산업 부담</p></div>
      <div class="crisis-card"><div class="value">${baseline.hourlyWater ?? baseline.water ?? 0}</div><h3>💧 물/시간</h3><p>발전·냉각 부담</p></div>
    </div>
    <div class="callout"><strong>숨은 운영비가 적용됩니다.</strong><p>같은 시설을 과도하게 늘리거나 공장·화력을 주거지에 붙이면 수익이 줄어듭니다.</p></div>
    <div class="modal-actions"><button class="btn primary" id="crisisCloseBtn">다음 퀘스트 확인</button></div>
  `);
  $modal('#crisisCloseBtn').addEventListener('click', closeModal);
}

export function openReportModal() {
  const report = Report.computeReport();
  const operation = report.operations;
  const delta = (value) => value > 0 ? `+${value}` : `${value}`;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">FINAL REPORT</span><h2>기후 생존 도시 성적표</h2></div></div>
    <div class="final-rank"><div class="rank-icon">${report.tier.icon}</div><h2>${escapeHtml(report.tier.title)} · ${report.total}점</h2><p>15개 퀘스트에서 만든 도시의 실제 운영 기록입니다.</p></div>
    <div class="summary-grid">
      <div class="summary-card"><span>시간당 순수익</span><strong>${operation.averageNetCredits}C</strong></div>
      <div class="summary-card"><span>평균 송전 효율</span><strong>${operation.averageTransmissionEfficiency}%</strong></div>
      <div class="summary-card"><span>저탄소 전력</span><strong>${operation.averageLowCarbonPercent}%</strong></div>
      <div class="summary-card"><span>필수시설 정전</span><strong>${operation.essentialOutageHours}시간</strong></div>
      <div class="summary-card"><span>고용률</span><strong>${operation.averageEmploymentRate}%</strong></div>
      <div class="summary-card"><span>산업 인력 충족</span><strong>${operation.averageIndustryFill}%</strong></div>
      <div class="summary-card"><span>탄소 변화</span><strong>${delta(report.carbonDelta)}</strong></div>
      <div class="summary-card"><span>물 변화</span><strong>${delta(report.waterDelta)}</strong></div>
    </div>
    <div class="callout"><strong>운영 패널티</strong><p>누적 과밀 ${operation.overcrowdingCost}C · 건강/민원 ${operation.healthCost}C</p></div>
    <div class="modal-actions"><button class="btn secondary" id="exportBtn"><i data-lucide="download"></i> 결과 저장</button><button class="btn primary" id="closeFinalBtn">도시 계속 보기</button></div>
  `);
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
    <p class="muted">도시·퀘스트·운영 기록·성취가 모두 초기화됩니다.</p>
    <div class="modal-actions"><button class="btn secondary" id="cancelReset">취소</button><button class="btn primary" id="confirmReset">초기화</button></div>
  `);
  $modal('#cancelReset').addEventListener('click', closeModal);
  $modal('#confirmReset').addEventListener('click', () => { closeModal(); onConfirm(); });
}
