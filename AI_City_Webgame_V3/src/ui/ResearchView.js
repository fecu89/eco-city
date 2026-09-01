import { gameState } from '../core/GameState.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { RESEARCH_RULES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import {
  activeResearchJobs,
  assignResearchDataCenter,
  cancelResearch,
  listResearchAvailability,
  startResearch,
} from '../systems/ResearchSystem.js';
import { escapeHtml, formatCredits } from './format.js';

function progressFor(job) {
  if (!job) return 0;
  return Math.min(100, Math.round((job.elapsedEffectiveDays / RESEARCH[job.id].durationDays) * 100));
}

function realDurationLabel(days) {
  const totalSeconds = Math.round(days / RESEARCH_RULES.GAME_DAYS_PER_REAL_MINUTE * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}분 ${seconds}초` : `${minutes}분`;
}

function jobStatus(job) {
  if (job.status === 'underpowered') return '⚠ 전력 부족 · 연구 일시정지 · 90% 필요';
  if (job.status === 'mode_paused') return '절전 모드 · 연구 일시정지';
  if (job.dataCenterIndex == null) return '담당 시설 없음 · 재배정 필요';
  return `데이터센터 #${job.dataCenterIndex}`;
}

function activeJobMarkup(job, dataCenterIndex) {
  const definition = RESEARCH[job.id];
  const assignedHere = job.dataCenterIndex === dataCenterIndex;
  return `
    <article class="research-active ${['underpowered', 'mode_paused'].includes(job.status) ? 'underpowered' : ''}" data-research-job="${job.id}">
      <div><strong>${definition.name}</strong><span data-research-live-status>${jobStatus(job)}</span></div>
      <div class="research-progress"><span data-research-live-progress style="width:${progressFor(job)}%"></span></div>
      <small data-research-live-days>${Math.round(job.elapsedEffectiveDays)} / ${definition.durationDays}일</small>
      <div class="research-actions">
        ${assignedHere ? `<button class="btn primary" data-research-accelerate="${job.id}">퀴즈로 가속</button>` : ''}
        ${job.dataCenterIndex == null ? `<button class="btn secondary" data-research-assign="${job.id}">이 시설에 배정</button>` : ''}
        ${assignedHere ? `<button class="btn secondary" data-research-cancel="${job.id}">연구 취소 · 50% 환급</button>` : ''}
      </div>
    </article>`;
}

function researchLockReason(item, centerJob) {
  const active = gameState.research.jobs[item.id];
  if (!gameState.researchMenuUnlocked) return '퀘스트 4 ‘연구도시의 씨앗’ 완료 필요';
  if (item.completed) return '이미 완료한 연구입니다.';
  if (active) {
    return active.dataCenterIndex == null
      ? '담당 데이터센터가 없어 재배정을 기다리는 연구입니다.'
      : `데이터센터 #${active.dataCenterIndex}에서 진행 중입니다.`;
  }
  if (item.reasonLabels.length) return item.reasonLabels.join(' · ');
  if (centerJob) return `이 데이터센터에서 ${RESEARCH[centerJob.id].name} 연구가 진행 중입니다.`;
  if (gameState.credits < item.cost) return `${formatCredits(item.cost - gameState.credits)}가 더 필요합니다.`;
  return '';
}

function researchCardMarkup(item, centerJob) {
  const canStart = gameState.researchMenuUnlocked
    && item.available
    && !centerJob
    && gameState.credits >= item.cost;
  const lockReason = canStart ? '' : researchLockReason(item, centerJob);
  const status = item.completed ? '완료' : item.active ? '진행 중' : canStart ? '연구 시작 가능' : '잠김';
  const tooltipId = `research-tip-${item.id}`;
  return `
    <button type="button"
      class="research-card ${item.completed ? 'complete' : ''} ${item.active ? 'active' : ''} ${canStart ? 'available' : 'locked'}"
      data-research-id="${item.id}"
      ${canStart ? `data-research-start="${item.id}"` : ''}
      ${lockReason ? `data-lock-reason="${escapeHtml(lockReason)}" aria-describedby="${tooltipId}"` : ''}
      aria-disabled="${canStart ? 'false' : 'true'}"
      aria-label="${escapeHtml(`${item.name}, ${status}`)}">
      <span class="research-card-icon" aria-hidden="true"><i data-lucide="${item.icon}"></i></span>
      <strong class="research-card-title">${escapeHtml(item.name)}</strong>
      <span class="research-card-meta">${formatCredits(item.cost)} · ${realDurationLabel(item.durationDays)}</span>
      ${canStart ? '' : '<span class="research-card-lock" aria-hidden="true"><i data-lucide="lock-keyhole"></i> 잠김</span>'}
      <span class="sr-only">${status}</span>
      ${lockReason ? `<span class="research-lock-tip" id="${tooltipId}" role="tooltip">${escapeHtml(lockReason)}</span>` : ''}
    </button>`;
}

export function researchPanelMarkup(dataCenterIndex) {
  const jobs = activeResearchJobs(gameState);
  const centerJob = jobs.find((job) => job.dataCenterIndex === dataCenterIndex);
  const unassignedJobs = jobs.filter((job) => job.dataCenterIndex == null);
  const elsewhereJobs = jobs.filter((job) => job.dataCenterIndex != null && job.dataCenterIndex !== dataCenterIndex);
  const availability = listResearchAvailability(gameState);
  const catalog = availability
    .filter((item) => !item.completed && !item.active)
    .sort((a, b) => Number(b.available) - Number(a.available));
  const allResearchCompleted = availability.every((item) => item.completed);
  return `
    <section class="research-panel" aria-label="재생에너지 연구" data-center-index="${dataCenterIndex}">
      <div class="research-head"><div><span>RESEARCH GRID</span><h3>데이터센터 #${dataCenterIndex} 연구</h3></div><b>진행 중 추가 수요 +2E</b></div>
      ${gameState.researchMenuUnlocked ? '' : '<div class="research-menu-lock"><strong>연구 메뉴 잠김</strong><span>퀘스트 4 완료 후 사용할 수 있습니다.</span></div>'}
      ${centerJob ? activeJobMarkup(centerJob, dataCenterIndex) : '<div class="research-center-idle"><strong>이 데이터센터는 비어 있습니다.</strong><p>새 연구를 시작하거나 미배정 연구를 연결할 수 있습니다.</p></div>'}
      ${unassignedJobs.length ? `<div class="research-unassigned"><strong>재배정 대기</strong>${unassignedJobs.map((job) => activeJobMarkup(job, dataCenterIndex)).join('')}</div>` : ''}
      ${elsewhereJobs.length ? `<p class="research-elsewhere">다른 센터 진행: ${elsewhereJobs.map((job) => `${RESEARCH[job.id].name} (#${job.dataCenterIndex})`).join(' · ')}</p>` : ''}
      <div class="research-grid">
        ${catalog.length
          ? catalog.map((item) => researchCardMarkup(item, centerJob)).join('')
          : `<div class="research-catalog-empty"><strong>${allResearchCompleted ? '모든 연구를 완료했습니다.' : '시작할 연구가 없습니다.'}</strong><span>${allResearchCompleted ? '도시의 모든 연구 효과가 적용 중입니다.' : '진행 중인 연구를 완료하거나 다음 연구를 해금하세요.'}</span></div>`}
      </div>
    </section>`;
}

export function refreshResearchPanelLive(root) {
  if (!root?.matches('.research-panel')) return false;
  let structureChanged = false;
  root.querySelectorAll('[data-research-job]').forEach((article) => {
    const job = gameState.research.jobs[article.dataset.researchJob];
    if (!job) {
      structureChanged = true;
      return;
    }
    const definition = RESEARCH[job.id];
    article.classList.toggle('underpowered', ['underpowered', 'mode_paused'].includes(job.status));
    article.querySelector('[data-research-live-status]').textContent = jobStatus(job);
    article.querySelector('[data-research-live-progress]').style.width = `${progressFor(job)}%`;
    article.querySelector('[data-research-live-days]').textContent = `${Math.round(job.elapsedEffectiveDays)} / ${definition.durationDays}일`;
  });
  return structureChanged;
}

export function bindResearchPanel(root, dataCenterIndex, onChanged) {
  if (!root) return;
  root.querySelectorAll('.research-card[aria-disabled="true"][data-lock-reason]').forEach((card) => card.addEventListener('click', () => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '연구 해금 조건',
      text: card.dataset.lockReason,
      priority: true,
    });
  }));
  root.querySelectorAll('[data-research-start]').forEach((button) => button.addEventListener('click', () => {
    const result = startResearch(gameState, button.dataset.researchStart, dataCenterIndex);
    eventBus.emit(result.ok ? Events.RESEARCH_STARTED : Events.TOAST_SHOW, result.ok
      ? result
      : { title: '연구를 시작할 수 없습니다.', text: result.reason });
    onChanged?.(result);
  }));
  root.querySelectorAll('[data-research-cancel]').forEach((button) => button.addEventListener('click', () => {
    const result = cancelResearch(gameState, button.dataset.researchCancel);
    if (result.ok) eventBus.emit(Events.RESEARCH_CANCELLED, result);
    onChanged?.(result);
  }));
  root.querySelectorAll('[data-research-assign]').forEach((button) => button.addEventListener('click', () => {
    const result = assignResearchDataCenter(gameState, button.dataset.researchAssign, dataCenterIndex);
    if (result.ok) eventBus.emit(Events.RESEARCH_ASSIGNED, result);
    onChanged?.(result);
  }));
  root.querySelectorAll('[data-research-accelerate]').forEach((button) => button.addEventListener('click', () => {
    eventBus.emit(Events.RESEARCH_QUIZ_REQUESTED, {
      researchId: button.dataset.researchAccelerate,
      dataCenterIndex,
    });
  }));
}
