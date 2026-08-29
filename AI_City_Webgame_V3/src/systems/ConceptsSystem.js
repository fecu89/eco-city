import { QUIZ_BANK, QUIZ_SAMPLE_SIZE, QUIZ_PASS_THRESHOLD, REFLECTION_MIN_LENGTH } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';

function sample(arr, n) {
  const pool = [...arr];
  const picked = [];
  while (picked.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

export function startQuiz() {
  gameState.quizPool = sample(QUIZ_BANK, Math.min(QUIZ_SAMPLE_SIZE, QUIZ_BANK.length));
  gameState.quizIndex = 0;
  gameState.quizCorrect = 0;
  gameState.quizAnswered = false;
}

export function currentQuizQuestion() {
  const q = gameState.quizPool[gameState.quizIndex];
  if (!q) return null;
  const ctx = { baseline: gameState.baseline };
  return { id: q.id, title: q.title, explain: q.explain, prompt: q.prompt(ctx), options: q.options(ctx) };
}

export function answerQuiz(optionIndex) {
  if (gameState.quizAnswered) return null;
  const q = currentQuizQuestion();
  if (!q) return null;
  gameState.quizAnswered = true;
  const correct = !!q.options[optionIndex]?.correct;
  if (correct) gameState.quizCorrect++;
  const correctIndex = q.options.findIndex((o) => o.correct);
  eventBus.emit(Events.QUIZ_ANSWERED, { correct, explain: q.explain, correctIndex, chosenIndex: optionIndex });
  return { correct, explain: q.explain, correctIndex };
}

export function nextQuizQuestion() {
  if (!gameState.quizAnswered) return { done: false };
  if (gameState.quizIndex < gameState.quizPool.length - 1) {
    gameState.quizIndex++;
    gameState.quizAnswered = false;
    return { done: false };
  }
  const passed = gameState.quizCorrect >= QUIZ_PASS_THRESHOLD;
  eventBus.emit(Events.QUIZ_FINISHED, { passed, correct: gameState.quizCorrect, total: gameState.quizPool.length });
  // 스테이지 전환은 성찰 저널 저장까지 마친 뒤 StageModals.openReflectionModal()에서 수행한다.
  return { done: true, passed, correct: gameState.quizCorrect, total: gameState.quizPool.length };
}

export function retryQuiz() {
  startQuiz();
}

export function markEnergyScaleSeen() {
  gameState.energyScaleSeen = true;
}

export function saveReflection(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < REFLECTION_MIN_LENGTH) return { ok: false, reason: 'too_short' };
  gameState.reflection = trimmed;
  eventBus.emit(Events.REFLECTION_SAVED, { text: trimmed });
  return { ok: true };
}
