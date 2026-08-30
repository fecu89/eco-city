import { QUIZ_BANK } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

const QUIZ_CONFIG = Object.freeze({
  'growth-cost': Object.freeze({
    ids: ['power-balance', 'cooling', 'spatial-design'],
    total: 3,
    passThreshold: 2,
  }),
  'clean-power': Object.freeze({
    ids: ['renewable-storage', 're100', 'power-balance'],
    total: 3,
    passThreshold: 2,
  }),
  'climate-council': Object.freeze({
    ids: ['power-balance', 'cooling', 'renewable-storage', 'spatial-design'],
    total: 4,
    passThreshold: 3,
  }),
});

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.min(index, Math.floor(Math.max(0, Math.min(0.999999, random())) * (index + 1)));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function definitionFor(kind) {
  return QUIZ_CONFIG[kind] || QUIZ_CONFIG['growth-cost'];
}

function replayRandom(state, kind) {
  let seed = ((state.tickIndex + 1) * 2654435761 + state.questIndex * 1013904223 + (state.quizAttempts[kind] || 0) * 97) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function startQuestQuiz(state, kind, random = null) {
  const config = definitionFor(kind);
  const allowed = config.ids.map((id) => QUIZ_BANK.find((question) => question.id === id)).filter(Boolean);
  const sessionRandom = random || replayRandom(state, kind);
  state.quizKind = kind;
  state.quizPool = shuffled(allowed, sessionRandom).slice(0, config.total);
  state.quizIndex = 0;
  state.quizCorrect = 0;
  state.quizAnswered = false;
  state.quizPassThreshold = config.passThreshold;
  state.quizAttempts[kind] = (state.quizAttempts[kind] || 0) + 1;
  return { kind, total: state.quizPool.length, passThreshold: config.passThreshold };
}

export function currentQuestQuizQuestion(state) {
  const question = state.quizPool[state.quizIndex];
  if (!question) return null;
  const baseline = state.baseline || state.metrics || { reliableSupply: 0, demand: 0, dev: 0 };
  const context = { baseline };
  return {
    id: question.id,
    title: question.title,
    prompt: question.prompt(context),
    options: question.options(context),
    explain: question.explain,
  };
}

export function answerQuestQuiz(state, optionIndex) {
  if (state.quizAnswered) return null;
  const question = currentQuestQuizQuestion(state);
  if (!question) return null;
  state.quizAnswered = true;
  const correct = !!question.options[optionIndex]?.correct;
  if (correct) state.quizCorrect += 1;
  const result = {
    correct,
    correctIndex: question.options.findIndex((option) => option.correct),
    explain: question.explain,
  };
  eventBus.emit(Events.QUIZ_ANSWERED, result);
  return result;
}

export function advanceQuestQuiz(state) {
  if (!state.quizAnswered) return { done: false };
  if (state.quizIndex < state.quizPool.length - 1) {
    state.quizIndex += 1;
    state.quizAnswered = false;
    return { done: false };
  }
  const result = {
    done: true,
    passed: state.quizCorrect >= state.quizPassThreshold,
    correct: state.quizCorrect,
    total: state.quizPool.length,
    passThreshold: state.quizPassThreshold,
  };
  state.quizResults[state.quizKind] = result;
  eventBus.emit(Events.QUIZ_FINISHED, result);
  return result;
}

export function retryQuestQuiz(state, random = null) {
  return startQuestQuiz(state, state.quizKind, random);
}
