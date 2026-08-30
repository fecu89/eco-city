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
import { formatCredits } from './format.js';

function progressFor(job) {
  if (!job) return 0;
  return Math.min(100, Math.round((job.elapsedEffectiveHours / RESEARCH[job.id].durationHours) * 100));
}

function realDurationLabel(hours) {
  const totalSeconds = Math.round(hours / RESEARCH_RULES.GAME_HOURS_PER_REAL_MINUTE * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}분 ${seconds}초` : `${minutes}분`;
}

function jobStatus(job) {
  if (job.status === 'underpowered') return '⚠ 전력 부족 · 연구 일시정지 · 90% 필요';
  if (job.dataCenterIndex == null) return '담당 시설 없음 · 재배정 필요';
  return `데이터센터 #${job.dataCenterIndex}`;
}

function activeJobMarkup(job, dataCenterIndex) {
  const definition = RESEARCH[job.id];
  const assignedHere = job.dataCenterIndex === dataCenterIndex;
  return `
    <article class="research-active ${job.status === 'underpowered' ? 'underpowered' : ''}" data-research-job="${job.id}">
      <div><strong>${definition.name}</strong><span data-research-live-status>${jobStatus(job)}</span></div>
      <div class="research-progress"><span data-research-live-progress style="width:${progressFor(job)}%"></span></div>
      <small data-research-live-hours>${Math.round(job.elapsedEffectiveHours)} / ${definition.durationHours}시간</small>
      <div class="research-actions">
        ${job.dataCenterIndex == null ? `<button class="btn secondary" data-research-assign="${job.id}">이 시설에 배정</button>` : ''}
        ${assignedHere ? `<button class="btn secondary" data-research-cancel="${job.id}">연구 취소 · 50% 환급</button>` : ''}
      </div>
    </article>`;
}

export function researchPanelMarkup(dataCenterIndex) {
  if (!gameState.researchMenuUnlocked) {
    return '<div class="research-locked"><strong>연구 메뉴 잠김</strong><p>퀘스트 4 ‘연구도시의 씨앗’ 보상으로 열립니다.</p></div>';
  }
  const jobs = activeResearchJobs(gameState);
  const centerJob = jobs.find((job) => job.dataCenterIndex === dataCenterIndex);
  const unassignedJobs = jobs.filter((job) => job.dataCenterIndex == null);
  const elsewhereJobs = jobs.filter((job) => job.dataCenterIndex != null && job.dataCenterIndex !== dataCenterIndex);
  const availability = listResearchAvailability(gameState);
  return `
    <section class="research-panel" aria-label="재생에너지 연구" data-center-index="${dataCenterIndex}">
      <div class="research-head"><div><span>RESEARCH GRID</span><h3>데이터센터 #${dataCenterIndex} 연구</h3></div><b>진행 중 추가 수요 +2E</b></div>
      ${centerJob ? activeJobMarkup(centerJob, dataCenterIndex) : '<div class="research-center-idle"><strong>이 데이터센터는 비어 있습니다.</strong><p>새 연구를 시작하거나 미배정 연구를 연결할 수 있습니다.</p></div>'}
      ${unassignedJobs.length ? `<div class="research-unassigned"><strong>재배정 대기</strong>${unassignedJobs.map((job) => activeJobMarkup(job, dataCenterIndex)).join('')}</div>` : ''}
      ${elsewhereJobs.length ? `<p class="research-elsewhere">다른 센터 진행: ${elsewhereJobs.map((job) => `${RESEARCH[job.id].name} (#${job.dataCenterIndex})`).join(' · ')}</p>` : ''}
      <div class="research-list">
        ${availability.map((item) => {
          const active = gameState.research.jobs[item.id];
          const canStart = item.available && !centerJob && gameState.credits >= item.cost;
          const label = item.completed
            ? '완료'
            : active
              ? `#${active.dataCenterIndex ?? '미배정'}에서 진행 중`
              : gameState.credits < item.cost
                ? '크레딧 부족'
                : centerJob
                  ? '이 센터 사용 중'
                  : item.available ? '연구 시작' : '잠김';
          return `
            <article class="research-item ${item.completed ? 'complete' : ''}">
              <div><strong>${item.name}</strong><span>${item.durationHours}시간 · 1× ${realDurationLabel(item.durationHours)} · ${formatCredits(item.cost)}</span></div>
              <p>${item.completed ? '연구 완료' : item.reasonLabels.join(' · ') || '담당 데이터센터 전력 90% 이상에서 진행'}</p>
              <button class="btn ${canStart ? 'primary' : 'secondary'}" data-research-start="${item.id}" ${canStart ? '' : 'disabled'}>${label}</button>
            </article>`;
        }).join('')}
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
    article.classList.toggle('underpowered', job.status === 'underpowered');
    article.querySelector('[data-research-live-status]').textContent = jobStatus(job);
    article.querySelector('[data-research-live-progress]').style.width = `${progressFor(job)}%`;
    article.querySelector('[data-research-live-hours]').textContent = `${Math.round(job.elapsedEffectiveHours)} / ${definition.durationHours}시간`;
  });
  return structureChanged;
}

export function bindResearchPanel(root, dataCenterIndex, onChanged) {
  if (!root) return;
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
}
