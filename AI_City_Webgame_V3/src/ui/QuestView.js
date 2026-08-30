import { QUESTS, QUEST_COUNT } from '../core/QuestDefinitions.js';
import { gameState } from '../core/GameState.js';
import { FACILITIES, RESEARCH_RULES } from '../core/Constants.js';
import { claimCurrentQuest, evaluateCurrentQuest, requestEmergencySupport } from '../systems/QuestSystem.js';
import { markQuestQuizResult } from '../systems/QuestSystem.js';
import {
  advanceQuestQuiz,
  answerQuestQuiz,
  currentQuestQuizQuestion,
  retryQuestQuiz,
  startQuestQuiz,
} from '../systems/QuizSystem.js';
import { expandGrid } from '../systems/BoardSystem.js';
import { setModal, closeModal, $modal, $$modal } from './Modal.js';
import { escapeHtml, formatCredits } from './format.js';
import { setDiagnosisScannerActive } from '../systems/DiagnosisSystem.js';
import { eventBus, Events } from '../core/EventBus.js';

let els;
let onChanged = () => {};
const QUIZ_KINDS = { 8: 'clean-power', 15: 'climate-council' };
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
    onChanged({ phase: 'claimed', quest: completed, result });
    openRewardModal(completed, result, () => onChanged({ phase: 'reward_closed', quest: completed, result }));
  }));
  eachNode(els.contextAction, (contextAction) => contextAction.addEventListener('click', () => {
    if (gameState.questIndex !== 6) return;
    setDiagnosisScannerActive(!gameState.diagnosisScannerActive);
    onChanged();
  }));
  const mapButtons = Array.isArray(els.map) ? els.map : [els.map];
  mapButtons.filter(Boolean).forEach((button) => button.addEventListener('click', openQuestMap));
}

function rewardText(quest) {
  const parts = [];
  if (quest.reward.credits) parts.push(formatCredits(quest.reward.credits));
  if (quest.reward.unlockFacility) {
    const facilityName = FACILITIES[quest.reward.unlockFacility]?.name || quest.reward.unlockFacility;
    parts.push(`${facilityName} 해금`);
  }
  if (quest.index === 7) parts.push('Lv.2 강화 허가');
  if (quest.index === 10) parts.push('전력 우선순위 운영');
  if (quest.index === 13) parts.push('Lv.3');
  return `보상 ${parts.join(' · ') || '최종 성적표'}`;
}

function progressForCurrent() {
  if (gameState.questStatus === 'ready_to_claim' || gameState.questStatus === 'claimed') return 100;
  if (gameState.questIndex === 1) return Math.min(100, gameState.grid.filter((cell) => cell?.type === 'residential').length * 50);
  if (gameState.questIndex === 6) return Math.min(100, gameState.diagnosisFound.size / 3 * 100);
  const hours = gameState.questProgress.consecutiveHours || 0;
  return Math.min(100, hours / 3 * 100);
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
    node.classList.toggle('hidden', gameState.questIndex !== 6);
    node.textContent = `위험 스캐너 ${gameState.diagnosisScannerActive ? '켜짐 · 표시된 칸 누르기' : '꺼짐 · 눌러서 켜기'}`;
    node.setAttribute('aria-pressed', String(gameState.diagnosisScannerActive));
  });
}

function renderQuestQuizModal() {
  const question = currentQuestQuizQuestion(gameState);
  if (!question) return;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">CLIMATE QUIZ</span><h2>${escapeHtml(question.title)}</h2></div></div>
    <div class="quiz-count">${gameState.quizIndex + 1} / ${gameState.quizPool.length} · 통과 ${gameState.quizPassThreshold}문항</div>
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
          ? `활성 연구 ${result.acceleration.appliedJobs.length}개에서 각각 ${RESEARCH_RULES.QUIZ_ACCELERATION_HOURS}시간 단축`
          : `연구 가속 ${RESEARCH_RULES.QUIZ_ACCELERATION_HOURS}시간 적립`
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

function openRewardModal(quest, result, afterClose) {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">LEVEL UP</span><h2>${quest.title} 완료</h2></div></div>
    <div class="final-rank"><div class="rank-icon">🎉</div><h2>${result.nextQuest ? `LEVEL ${result.nextQuest}` : '도시 생존 성공'}</h2><p>${rewardText(quest)}</p></div>
    <div class="modal-actions"><button class="btn primary" id="questRewardClose">계속하기</button></div>
  `);
  $modal('#questRewardClose').addEventListener('click', () => {
    closeModal();
    if (result.nextQuest) eventBus.emit(Events.QUEST_STARTED, { quest: QUESTS[result.nextQuest - 1] });
    afterClose?.();
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
