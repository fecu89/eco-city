import { OBJECTIVE_SET_ORDER, OBJECTIVE_SETS } from '../core/ObjectiveDefinitions.js';
import { currentObjectiveEvaluation } from '../systems/ObjectiveSystem.js';
import { escapeHtml, formatCredits } from './format.js';
import { setModal, closeModal, $modal } from './Modal.js';

const CATEGORY_LABELS = Object.freeze({
  economy: '경제', energy: '에너지', environment: '환경', technology: '기술', citizen: '시민',
});

const nodes = (value) => (Array.isArray(value) ? value : [value]).filter(Boolean);
const eachNode = (value, callback) => nodes(value).forEach(callback);

export function objectiveRewardText(set) {
  const parts = [formatCredits(set.reward.credits)];
  if (set.reward.unlockFacilities?.length) parts.push('에너지저장·풍력 해금');
  if (set.reward.upgradePermitLevel) parts.push(`Lv.${set.reward.upgradePermitLevel} 강화 허가`);
  if (set.reward.openSecondExpansion) parts.push('반대편 9칸 개방');
  if (set.reward.chapterThreeEvents) parts.push('기후 이벤트 개방');
  if (set.reward.stressTest) parts.push('최종 스트레스 테스트');
  return `보상 ${parts.join(' · ')}`;
}

function objectiveCardMarkup(card) {
  const percent = Math.min(100, Math.round((card.value || 0) / Math.max(1, card.target || 1) * 100));
  const progress = card.durationHours
    ? `${Math.min(card.consecutiveHours || 0, card.durationHours)}/${card.durationHours}시간`
    : card.completed ? '완료' : '미완료';
  return `<article class="objective-card ${card.completed ? 'complete' : ''}" data-objective-id="${card.id}">
    <div><span>${CATEGORY_LABELS[card.category] || card.category}</span><b>${progress}</b></div>
    <strong>${escapeHtml(card.title)}</strong>
    <p>${escapeHtml(card.description)}</p>
    <div class="objective-card-progress"><i style="width:${percent}%"></i></div>
  </article>`;
}

export function renderObjectivePanel(state, els) {
  const evaluation = currentObjectiveEvaluation(state);
  if (!evaluation) return false;
  const { set, completedCount, required, ready } = evaluation;
  eachNode(els.level, (node) => { node.textContent = `CHAPTER ${set.chapter} · ${required}/${set.cards.length} 선택`; });
  eachNode(els.title, (node) => { node.textContent = set.title; });
  eachNode(els.goal, (node) => { node.textContent = `${completedCount}/${required}개 목표 달성 · 원하는 경로를 고르세요.`; });
  eachNode(els.reward, (node) => { node.textContent = objectiveRewardText(set); });
  eachNode(els.bar, (node) => { node.style.width = `${Math.min(100, completedCount / required * 100)}%`; });
  eachNode(els.claim, (node) => {
    node.disabled = !ready;
    node.textContent = ready ? '목표 보상 받기' : `${completedCount}/${required} 진행 중`;
  });
  eachNode(els.root, (node) => {
    node.classList.toggle('quest-ready', ready);
    node.classList.add('objective-mode');
  });
  eachNode(els.contextAction, (node) => node.classList.add('hidden'));
  if (els.details) {
    els.details.innerHTML = `<div class="objective-card-list">${evaluation.cards.map(objectiveCardMarkup).join('')}</div>`;
    els.details.classList.remove('hidden');
  }
  if (els.expand) els.expand.classList.add('hidden');
  eachNode(els.root, (node) => node.closest('[data-hud-panel="quest"]')?.classList.add('objective-panel-active'));
  return true;
}

export function clearObjectivePanelMode(els) {
  eachNode(els.root, (node) => node.classList.remove('objective-mode'));
  if (els.expand) els.expand.classList.remove('hidden');
  eachNode(els.root, (node) => node.closest('[data-hud-panel="quest"]')?.classList.remove('objective-panel-active'));
}

export function openObjectiveMap(state) {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">CAMPAIGN MAP</span><h2>도시 생존 운영 경로</h2></div><button class="icon-btn" id="objectiveMapClose" aria-label="닫기">×</button></div>
    <div class="objective-map-tutorial"><b>튜토리얼 1–6</b><span>기본 도시·전력·연구·냉각 학습 완료</span></div>
    <div class="quest-map-list">${OBJECTIVE_SET_ORDER.map((id) => {
      const set = OBJECTIVE_SETS[id];
      const done = state.progression.completedObjectiveSetIds.includes(id);
      const active = state.progression.objectiveSetId === id;
      return `<div class="quest-map-item ${done ? 'done' : active ? 'active' : 'locked'}"><b>CH.${set.chapter} · ${escapeHtml(set.title)}</b><span>${done ? '완료' : active ? `${set.required}/${set.cards.length} 선택 진행 중` : '잠김'}</span></div>`;
    }).join('')}</div>
    <div class="quest-map-item ${state.stressTest.status === 'passed' ? 'done' : ['ready', 'failed', 'running'].includes(state.stressTest.status) ? 'active' : 'locked'}"><b>CH.4 · 도시 스트레스 테스트</b><span>${state.stressTest.status === 'passed' ? '통과' : state.stressTest.status === 'running' ? '진행 중' : state.stressTest.status === 'failed' ? '재도전 가능' : state.stressTest.status === 'ready' ? '준비 완료' : '잠김'}</span></div>
  `, { id: 'objective-map', pausesSimulation: false });
  $modal('#objectiveMapClose').addEventListener('click', closeModal);
}
