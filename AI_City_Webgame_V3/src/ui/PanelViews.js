import anime from 'animejs';
import { BADGES, STAGES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { escapeHtml } from './format.js';

// ---------- Advisor panel ----------
let advisorLogEl = null;
let promptChipsEl = null;
let onPromptClick = () => {};

export function initAdvisorPanel(logEl, chipsEl, promptHandler) {
  advisorLogEl = logEl;
  promptChipsEl = chipsEl;
  onPromptClick = promptHandler;
  eventBus.on(Events.ADVISOR_ASKED, ({ question, answer }) => appendAdvisorMessage(question, answer));
  eventBus.on(Events.ADVISOR_BLIND_BUILD, ({ facility }) => {
    appendAdvisorMessage('시설을 어떻게 배치하면 점수가 오르나요?', `${facility.name}을(를) 지어보세요. (+${facility.dev} 발전점수)`);
  });
  eventBus.on(Events.STAGE_CHANGED, () => renderPromptChips());
}

function appendAdvisorMessage(question, answer) {
  advisorLogEl.insertAdjacentHTML(
    'beforeend',
    `<div class="message user"><b>시장</b><p>${escapeHtml(question)}</p></div><div class="message ai"><b>AI</b><p>${escapeHtml(answer)}</p></div>`
  );
  advisorLogEl.scrollTop = advisorLogEl.scrollHeight;
  anime({ targets: advisorLogEl.lastElementChild, opacity: [0, 1], translateY: [8, 0], duration: 220 });
}

export function renderPromptChips() {
  const chips = gameState.stage >= STAGES.REDESIGN
    ? [{ prompt: 'rethink', label: '🧠 재설계' }, { prompt: 'placement', label: '🔗 인접' }, { prompt: 'power', label: '⚡ 전력' }]
    : [{ prompt: 'score', label: '★ 점수' }, { prompt: 'placement', label: '▦ 배치' }, { prompt: 'power', label: '⚡ 전력' }];
  promptChipsEl.innerHTML = chips.map((c) => `<button data-prompt="${c.prompt}">${c.label}</button>`).join('');
  [...promptChipsEl.querySelectorAll('button')].forEach((btn) => {
    btn.addEventListener('click', () => onPromptClick(btn.dataset.prompt));
  });
}

// ---------- Badges panel ----------
let badgesEl = null;
let badgeCountEl = null;
let achievementTabsEl = null;
let badgePanelEl = null;
let evidencePanelEl = null;
let achievementTab = 'badges';

export function initBadgesPanel(listEl, countEl) {
  badgesEl = listEl;
  badgeCountEl = countEl;
}

export function initAchievementTabs(tabsEl, badgePanel, evidencePanel) {
  achievementTabsEl = tabsEl;
  badgePanelEl = badgePanel;
  evidencePanelEl = evidencePanel;
  achievementTabsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-achievement-tab]');
    if (!button) return;
    achievementTab = button.dataset.achievementTab;
    renderAchievementTabs();
  });
  renderAchievementTabs();
}

function renderAchievementTabs() {
  if (!achievementTabsEl) return;
  badgePanelEl.classList.toggle('hidden', achievementTab !== 'badges');
  evidencePanelEl.classList.toggle('hidden', achievementTab !== 'evidence');
  [...achievementTabsEl.querySelectorAll('[data-achievement-tab]')].forEach((button) => {
    const active = button.dataset.achievementTab === achievementTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

export function renderBadges() {
  badgesEl.innerHTML = BADGES.map(
    (b) => `<div class="badge ${gameState.badges.has(b.id) ? 'unlocked' : ''}"><span>${b.icon}</span><strong>${b.name}</strong></div>`
  ).join('');
  badgeCountEl.textContent = `${gameState.badges.size} / ${BADGES.length}`;
}

// ---------- Evidence panel ----------
// 근거 입력 폼은 사이드바가 아니라 시설 검사 모달(StageModals.openEvidenceEntryModal)에서 처리한다 —
// 사이드바 폭이 좁아 select/textarea가 너무 작아지는 문제 때문에 더 넓은 모달로 옮겼다.
let evidenceEls = null;

export function initEvidencePanel(elements) {
  evidenceEls = elements; // {count, list}
}

export function renderEvidence() {
  const unlocked = gameState.stage >= STAGES.REDESIGN;
  evidencePanelEl?.classList.toggle('locked', !unlocked);
  if (evidenceEls.hint) {
    evidenceEls.hint.textContent = unlocked
      ? '보드에서 시설을 클릭 → "근거 기록" 버튼으로 기록하세요.'
      : '5단계 재설계에서 시설별 과학 근거 기록이 열립니다.';
  }
  const good = gameState.evidence.filter((e) => e.good).length;
  evidenceEls.count.textContent = `${Math.min(good, 3)} / 3`;
  evidenceEls.list.innerHTML = gameState.evidence
    .slice(-4)
    .reverse()
    .map((e) => `<div class="evidence-item"><b>${e.good ? '근거 인정' : '보완 필요'}</b> · ${escapeHtml(e.conceptLabel)}<br>${escapeHtml(e.reason)}</div>`)
    .join('');
}
