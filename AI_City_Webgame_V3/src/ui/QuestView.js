import { QUESTS, QUEST_COUNT } from '../core/QuestDefinitions.js';
import { gameState } from '../core/GameState.js';
import { FACILITIES } from '../core/Constants.js';
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
import { escapeHtml } from './format.js';

const GOALS = [
  '주거지 2개를 건설하세요.',
  '화력발전으로 모든 주거지에 2시간 전력을 공급하세요.',
  '발전소 옆 공장을 2시간 가동하세요.',
  '데이터센터를 2시간 가동하고 시설 5개를 완성하세요.',
  '전력·탄소·냉각 퀴즈를 통과하세요.',
  '탄소·냉각·송전 위험 지점 3곳을 진단하세요.',
  '데이터센터 또는 핵발전 옆 순환냉각을 2시간 가동하세요.',
  '재생에너지·저장장치 퀴즈를 통과하세요.',
  '저장 허브로 재생에너지 8E를 전달하세요.',
  '녹지 생활권을 만들고 2시간 흑자를 유지하세요.',
  '극한 폭염 3시간 동안 주거 전력 90%를 지키세요.',
  '야간에 저장량 5E와 전력수지 0 이상을 3시간 유지하세요.',
  '저탄소 전력 70%와 탄소 감소를 3시간 유지하세요.',
  '물 부담 감소와 흑자를 3시간 유지하세요.',
  '기후시민위원회 최종 퀴즈를 통과하세요.',
];

let els;
let onChanged = () => {};
const QUIZ_KINDS = { 5: 'growth-cost', 8: 'clean-power', 15: 'climate-council' };

export function initQuestView(elements, changed) {
  els = elements;
  onChanged = changed || (() => {});
  els.claim.addEventListener('click', () => {
    const quizKind = QUIZ_KINDS[gameState.questIndex];
    if (quizKind && gameState.questStatus !== 'ready_to_claim') {
      startQuestQuiz(gameState, quizKind);
      renderQuestQuizModal();
      return;
    }
    const completed = QUESTS[gameState.questIndex - 1];
    const result = claimCurrentQuest(gameState);
    if (!result.ok) return;
    if (result.expandGrid) expandGrid(6);
    onChanged({ phase: 'claimed', quest: completed, result });
    openRewardModal(completed, result, () => onChanged({ phase: 'reward_closed', quest: completed, result }));
  });
  els.map.addEventListener('click', openQuestMap);
}

function rewardText(quest) {
  const parts = [];
  if (quest.reward.credits) parts.push(`${quest.reward.credits}C`);
  if (quest.reward.unlockFacility) {
    const facilityName = FACILITIES[quest.reward.unlockFacility]?.name || quest.reward.unlockFacility;
    parts.push(`${facilityName} 해금`);
  }
  if (quest.index === 10) parts.push('Lv.2·전력 우선순위');
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
  els.level.textContent = `LEVEL ${gameState.questIndex} / ${QUEST_COUNT}`;
  els.title.textContent = quest.title;
  els.goal.textContent = GOALS[quest.index - 1];
  els.reward.textContent = rewardText(quest);
  els.bar.style.width = `${progressForCurrent()}%`;
  els.claim.disabled = !evaluation.ready;
  const isQuizQuest = !!QUIZ_KINDS[gameState.questIndex];
  els.claim.disabled = !evaluation.ready && !isQuizQuest;
  els.claim.textContent = evaluation.ready ? '보상 받기' : isQuizQuest ? '퀴즈 시작' : '진행 중';
  els.root.classList.toggle('quest-ready', evaluation.ready);
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
  `);
  $$modal('#questQuizOptions .quiz-option').forEach((button) => {
    button.addEventListener('click', () => {
      const result = answerQuestQuiz(gameState, Number(button.dataset.index));
      if (!result) return;
      button.classList.add(result.correct ? 'correct' : 'wrong');
      $$modal('#questQuizOptions .quiz-option')[result.correctIndex]?.classList.add('correct');
      $modal('#questQuizExplain').innerHTML = `<div class="quiz-explain"><strong>${result.correct ? '정답' : '오답'}</strong><br>${escapeHtml(result.explain)}</div>`;
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
  `);
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
    afterClose?.();
  });
}

export function openQuestMap() {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">QUEST MAP</span><h2>기후 생존 퀘스트</h2></div><button class="icon-btn" id="questMapClose">×</button></div>
    <div class="quest-map-list">${QUESTS.map((quest) => `<div class="quest-map-item ${gameState.claimedQuestIds.has(quest.id) ? 'done' : quest.index === gameState.questIndex ? 'active' : 'locked'}"><b>${quest.index}. ${quest.title}</b><span>${gameState.claimedQuestIds.has(quest.id) ? '완료' : quest.index === gameState.questIndex ? '진행 중' : '잠김'}</span></div>`).join('')}</div>
    ${gameState.credits <= 1 ? '<button class="btn secondary full" id="emergencyCreditBtn">긴급지원 4C</button>' : ''}
  `);
  $modal('#questMapClose').addEventListener('click', closeModal);
  $modal('#emergencyCreditBtn')?.addEventListener('click', () => {
    requestEmergencySupport(gameState);
    closeModal();
    onChanged();
  });
}
