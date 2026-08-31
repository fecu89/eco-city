import { QUESTS, QUEST_COUNT } from '../core/QuestDefinitions.js';
import { gameState } from '../core/GameState.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { FACILITIES, QUEST_REQUIREMENTS, RESEARCH_RULES } from '../core/Constants.js';
import { claimCurrentQuest, evaluateCurrentQuest, requestEmergencySupport } from '../systems/QuestSystem.js';
import { markQuestQuizResult } from '../systems/QuestSystem.js';
import {
  advanceQuestQuiz,
  answerQuestQuiz,
  currentQuestQuizQuestion,
  retryQuestQuiz,
  startQuestQuiz,
  startResearchQuiz,
} from '../systems/QuizSystem.js';
import { expandGrid } from '../systems/BoardSystem.js';
import { setModal, closeModal, $modal, $$modal } from './Modal.js';
import { escapeHtml, formatCredits } from './format.js';
import { eventBus, Events } from '../core/EventBus.js';

let els;
let onChanged = () => {};
let detailsExpanded = false;
let researchQuizReturnIndex = null;
const QUIZ_KINDS = { 15: 'climate-council' };
const nodes = (value) => (Array.isArray(value) ? value : [value]).filter(Boolean);
const eachNode = (value, callback) => nodes(value).forEach(callback);

export function initQuestView(elements, changed) {
  els = elements;
  onChanged = changed || (() => {});
  eachNode(els.claim, (claim) => claim.addEventListener('click', () => {
    const quizKind = QUIZ_KINDS[gameState.questIndex];
    if (quizKind && gameState.questStatus !== 'ready_to_claim') {
      startQuestQuiz(gameState, quizKind);
      renderQuestQuizModal();
      return;
    }
    const completed = QUESTS[gameState.questIndex - 1];
    const result = claimCurrentQuest(gameState);
    if (!result.ok) return;
    if (result.expandGrid) expandGrid();
    detailsExpanded = false;
    onChanged({ phase: 'claimed', quest: completed, result });
    if (result.nextQuest) {
      eventBus.emit(Events.QUEST_STARTED, { quest: QUESTS[result.nextQuest - 1], silentAlert: true });
    }
  }));
  const mapButtons = Array.isArray(els.map) ? els.map : [els.map];
  mapButtons.filter(Boolean).forEach((button) => button.addEventListener('click', openQuestMap));
  eventBus.on(Events.RESEARCH_QUIZ_REQUESTED, ({ researchId, dataCenterIndex }) => {
    const result = startResearchQuiz(gameState, researchId);
    if (!result.ok) {
      eventBus.emit(Events.TOAST_SHOW, { title: '연구 퀴즈를 열 수 없습니다.', text: result.reason });
      return;
    }
    researchQuizReturnIndex = dataCenterIndex;
    renderQuestQuizModal();
  });
  els.expand?.addEventListener('click', () => {
    detailsExpanded = !detailsExpanded;
    renderQuest();
  });
}

function rewardText(quest) {
  const parts = [];
  if (quest.reward.credits) parts.push(formatCredits(quest.reward.credits));
  if (quest.reward.unlockFacilities.length) {
    const facilityNames = quest.reward.unlockFacilities
      .map((facility) => FACILITIES[facility]?.name || facility)
      .join('·');
    parts.push(`${facilityNames} 해금`);
  }
  if (quest.index === 7) parts.push('Lv.2 강화 허가');
  if (quest.index === 10) parts.push('전력 우선순위 운영');
  if (quest.index === 13) parts.push('Lv.3');
  return `보상 ${parts.join(' · ') || '최종 성적표'}`;
}

function progressForCurrent() {
  if (gameState.questStatus === 'ready_to_claim' || gameState.questStatus === 'claimed') return 100;
  if (gameState.questIndex === 1) return Math.min(100, gameState.grid.filter((cell) => cell?.type === 'residential').length * 50);
  const hours = gameState.questProgress.consecutiveHours || 0;
  const required = [2, 3, 4, 5, 6, 7].includes(gameState.questIndex)
    ? QUEST_REQUIREMENTS.OPERATING_HOURS
    : gameState.questIndex === 14 ? 4 : 3;
  return Math.min(100, hours / required * 100);
}

export function renderQuest() {
  if (!els) return;
  const evaluation = evaluateCurrentQuest(gameState);
  const quest = QUESTS[gameState.questIndex - 1];
  eachNode(els.level, (node) => { node.textContent = `LEVEL ${gameState.questIndex} / ${QUEST_COUNT}`; });
  eachNode(els.title, (node) => { node.textContent = quest.title; });
  eachNode(els.goal, (node) => { node.textContent = quest.goal; });
  eachNode(els.reward, (node) => { node.textContent = rewardText(quest); });
  eachNode(els.bar, (node) => { node.style.width = `${progressForCurrent()}%`; });
  const isQuizQuest = !!QUIZ_KINDS[gameState.questIndex];
  const quizPassed = Boolean(gameState.questProgress.quizPassed);
  const canStartQuiz = isQuizQuest && !quizPassed;
  eachNode(els.claim, (node) => {
    node.disabled = !evaluation.ready && !canStartQuiz;
    node.textContent = evaluation.ready ? '보상 받기' : canStartQuiz ? '퀴즈 시작' : quizPassed ? '도시 조건 진행 중' : '진행 중';
  });
  eachNode(els.root, (node) => node.classList.toggle('quest-ready', evaluation.ready));
  eachNode(els.contextAction, (node) => {
    node.classList.add('hidden');
  });
  if (els.details) {
    els.details.innerHTML = `
      <strong>완료 조건</strong>
      <ul>${quest.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>
      <div><span>퀘스트 보상</span><b>${escapeHtml(rewardText(quest))}</b></div>`;
    els.details.classList.toggle('hidden', !detailsExpanded);
  }
  if (els.expand) {
    els.expand.setAttribute('aria-expanded', String(detailsExpanded));
    els.expand.querySelector('span').textContent = detailsExpanded ? '간단히 보기' : '전체 내용 펼치기';
  }
  eachNode(els.root, (node) => node.closest('[data-hud-panel="quest"]')?.classList.toggle('quest-details-expanded', detailsExpanded));
}

function renderQuestQuizModal() {
  const question = currentQuestQuizQuestion(gameState);
  if (!question) return;
  const research = gameState.quizResearchId ? RESEARCH[gameState.quizResearchId] : null;
  const accelerationHours = research ? research.durationHours / RESEARCH_RULES.QUIZ_QUESTION_COUNT : 0;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">${research ? 'RESEARCH ACCELERATION' : 'CLIMATE QUIZ'}</span><h2>${research ? `${escapeHtml(research.name)} · ` : ''}${escapeHtml(question.title)}</h2></div></div>
    <div class="quiz-count">${gameState.quizIndex + 1} / ${gameState.quizPool.length} · ${research ? `정답마다 ${accelerationHours}시간 단축` : `통과 ${gameState.quizPassThreshold}문항`}</div>
    <div class="quiz-question">
      <h3>${escapeHtml(question.prompt)}</h3>
      <div class="quiz-options" id="questQuizOptions">${question.options.map((option, index) => `<button class="quiz-option" data-index="${index}">${String.fromCharCode(65 + index)}. ${escapeHtml(option.text)}</button>`).join('')}</div>
      <div id="questQuizExplain"></div>
    </div>
    <div class="modal-actions"><button class="btn primary" id="questQuizNext" disabled>${gameState.quizIndex === gameState.quizPool.length - 1 ? '결과 보기' : '다음'}</button></div>
  `, { id: 'quiz', pausesSimulation: true });
  $$modal('#questQuizOptions .quiz-option').forEach((button) => {
    button.addEventListener('click', () => {
      const result = answerQuestQuiz(gameState, Number(button.dataset.index));
      if (!result) return;
      button.classList.add(result.correct ? 'correct' : 'wrong');
      $$modal('#questQuizOptions .quiz-option')[result.correctIndex]?.classList.add('correct');
      const accelerationText = result.acceleration
        ? result.acceleration.appliedJobs.length
          ? `${RESEARCH[result.researchId]?.name || result.researchId} ${result.acceleration.hours}시간 단축`
          : '이 연구는 이미 완료되었습니다.'
        : '';
      $modal('#questQuizExplain').innerHTML = `<div class="quiz-explain"><strong>${result.correct ? '정답' : '오답'}</strong><br>${escapeHtml(result.explain)}${accelerationText ? `<br><b>${escapeHtml(accelerationText)}</b>` : ''}</div>`;
      $modal('#questQuizNext').disabled = false;
    });
  });
  $modal('#questQuizNext').addEventListener('click', () => {
    const result = advanceQuestQuiz(gameState);
    if (!result.done) renderQuestQuizModal();
    else renderQuestQuizResultModal(result);
  });
}

function renderQuestQuizResultModal(result) {
  if (result.researchId) {
    const definition = RESEARCH[result.researchId];
    const reducedHours = (definition.durationHours / RESEARCH_RULES.QUIZ_QUESTION_COUNT) * result.correct;
    setModal(`
      <div class="modal-head"><div><span class="eyebrow">RESEARCH QUIZ COMPLETE</span><h2>${escapeHtml(definition.name)} 가속 결과</h2></div></div>
      <div class="summary-grid"><div class="summary-card"><span>정답</span><strong>${result.correct}/${result.total}</strong></div><div class="summary-card"><span>단축</span><strong>${reducedHours}시간</strong></div></div>
      <div class="callout"><strong>선택한 연구에만 반영되었습니다.</strong><p>다른 데이터센터의 연구 진행도는 바뀌지 않습니다.</p></div>
      <div class="modal-actions"><button class="btn primary" id="questQuizFinish">연구 화면으로</button></div>
    `, { id: 'research-quiz-result', pausesSimulation: true });
    $modal('#questQuizFinish').addEventListener('click', () => {
      const dataCenterIndex = researchQuizReturnIndex;
      researchQuizReturnIndex = null;
      closeModal();
      eventBus.emit(Events.RESEARCH_QUIZ_CLOSED, { dataCenterIndex });
      onChanged();
    });
    return;
  }
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">QUIZ RESULT</span><h2>${result.passed ? '퀴즈 통과' : '다시 준비하세요'}</h2></div></div>
    <div class="summary-grid"><div class="summary-card"><span>정답</span><strong>${result.correct}/${result.total}</strong></div><div class="summary-card"><span>통과 기준</span><strong>${result.passThreshold}/${result.total}</strong></div></div>
    <div class="callout"><strong>${result.passed ? '보상을 받을 수 있습니다.' : '도시 상태는 그대로 유지됩니다.'}</strong><p>${result.passed ? '퀘스트 카드에서 보상을 받아 다음 레벨로 이동하세요.' : '설명을 확인한 뒤 퀴즈만 다시 풀 수 있습니다.'}</p></div>
    <div class="modal-actions"><button class="btn primary" id="questQuizFinish">${result.passed ? '확인' : '다시 풀기'}</button></div>
  `, { id: 'quiz', pausesSimulation: true });
  $modal('#questQuizFinish').addEventListener('click', () => {
    if (!result.passed) {
      retryQuestQuiz(gameState);
      renderQuestQuizModal();
      return;
    }
    markQuestQuizResult(gameState, true);
    closeModal();
    onChanged();
  });
}

export function openQuestMap() {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">QUEST MAP</span><h2>기후 생존 퀘스트</h2></div><button class="icon-btn" id="questMapClose">×</button></div>
    <div class="quest-map-list">${QUESTS.map((quest) => `<div class="quest-map-item ${gameState.claimedQuestIds.has(quest.id) ? 'done' : quest.index === gameState.questIndex ? 'active' : 'locked'}"><b>${quest.index}. ${quest.title}</b><span>${gameState.claimedQuestIds.has(quest.id) ? '완료' : quest.index === gameState.questIndex ? '진행 중' : '잠김'}</span></div>`).join('')}</div>
    ${gameState.credits <= 1 ? `<button class="btn secondary full" id="emergencyCreditBtn">긴급지원 ${formatCredits(4)}</button>` : ''}
  `);
  $modal('#questMapClose').addEventListener('click', closeModal);
  $modal('#emergencyCreditBtn')?.addEventListener('click', () => {
    requestEmergencySupport(gameState);
    closeModal();
    onChanged();
  });
}
