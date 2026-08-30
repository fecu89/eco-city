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
  eventBus.on(Events.QUEST_CLAIMED, () => renderPromptChips());
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

export function initBadgesPanel(listEl, countEl) {
  badgesEl = listEl;
  badgeCountEl = countEl;
}

export function renderBadges() {
  badgesEl.innerHTML = BADGES.map(
    (b) => `<div class="badge ${gameState.badges.has(b.id) ? 'unlocked' : ''}"><span>${b.icon}</span><strong>${b.name}</strong></div>`
  ).join('');
  badgeCountEl.textContent = `${gameState.badges.size} / ${BADGES.length}`;
}
