import { QUIZ_BANK, RESEARCH_RULES } from '../core/Constants.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { RESEARCH_QUIZZES } from '../core/ResearchQuizDefinitions.js';
import { eventBus, Events } from '../core/EventBus.js';
import { accelerateResearchFromQuiz } from './ResearchSystem.js';

const QUIZ_CONFIG = Object.freeze({
  'climate-council': Object.freeze({
    ids: ['power-balance', 'cooling', 'renewable-storage', 'spatial-design'],
    total: RESEARCH_RULES.QUIZ_QUESTION_COUNT,
    passThreshold: 3,
  }),
});

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const normalized = Math.max(0, Math.min(0.999999, random()));
    const swapIndex = Math.min(index, Math.floor(normalized * (index + 1)));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function replayRandom(state, kind) {
  let seed = ((state.tickIndex + 1) * 2654435761 + state.questIndex * 1013904223 + (state.quizAttempts[kind] || 0) * 97) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function contextFor(state) {
  return { baseline: state.baseline || state.metrics || { reliableSupply: 0, demand: 0, dev: 0 } };
}

function materializeQuestion(question, context, random) {
  const prompt = typeof question.prompt === 'function' ? question.prompt(context) : question.prompt;
  const options = typeof question.options === 'function' ? question.options(context) : question.options;
  return {
    id: question.id,
    title: question.title,
    prompt,
    options: shuffled(options.map((option) => ({ ...option })), random),
    explain: question.explain,
  };
}

function startSession(state, { kind, questions, total, passThreshold, researchId = null }, random = null) {
  const sessionRandom = random || replayRandom(state, kind);
  const selected = shuffled(questions, sessionRandom).slice(0, total);
  state.quizKind = kind;
  state.quizResearchId = researchId;
  state.quizPool = selected.map((question) => materializeQuestion(question, contextFor(state), sessionRandom));
  state.quizIndex = 0;
  state.quizCorrect = 0;
  state.quizAnswered = false;
  state.quizPassThreshold = passThreshold;
  state.quizAttempts[kind] = (state.quizAttempts[kind] || 0) + 1;
  return { kind, researchId, total: state.quizPool.length, passThreshold };
}

export function startQuestQuiz(state, kind, random = null) {
  const config = QUIZ_CONFIG[kind] || QUIZ_CONFIG['climate-council'];
  const questions = config.ids.map((id) => QUIZ_BANK.find((question) => question.id === id)).filter(Boolean);
  return startSession(state, { kind, questions, total: config.total, passThreshold: config.passThreshold }, random);
}

export function startResearchQuiz(state, researchId, random = null) {
  const questions = RESEARCH_QUIZZES[researchId];
  if (!RESEARCH[researchId] || !questions) return { ok: false, reason: 'unknown_research' };
  if (!state.research.jobs[researchId]) return { ok: false, reason: 'research_not_active' };
  return {
    ok: true,
    ...startSession(state, {
      kind: `research:${researchId}`,
      questions,
      total: RESEARCH_RULES.QUIZ_QUESTION_COUNT,
      passThreshold: 0,
      researchId,
    }, random),
  };
}

export function currentQuestQuizQuestion(state) {
  const question = state.quizPool[state.quizIndex];
  if (!question) return null;
  return {
    id: question.id,
    title: question.title,
    prompt: question.prompt,
    options: question.options,
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
  let acceleration = null;
  if (correct && state.quizResearchId) {
    state.research.quizCreditQuestionIds ||= {};
    const creditedIds = new Set(state.research.quizCreditQuestionIds[state.quizResearchId] || []);
    if (creditedIds.has(question.id)) {
      acceleration = {
        appliedJobs: [], hours: 0, completed: [], reason: 'question_already_credited',
      };
    } else {
      creditedIds.add(question.id);
      state.research.quizCreditQuestionIds[state.quizResearchId] = [...creditedIds];
      acceleration = accelerateResearchFromQuiz(state, state.quizResearchId);
    }
  }
  const result = {
    correct,
    correctIndex: question.options.findIndex((option) => option.correct),
    explain: question.explain,
    acceleration,
    researchId: state.quizResearchId,
  };
  if (acceleration?.appliedJobs.length) {
    eventBus.emit(Events.RESEARCH_ACCELERATED, acceleration);
    acceleration.completed.forEach((completion) => eventBus.emit(Events.RESEARCH_COMPLETED, completion));
  }
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
    researchId: state.quizResearchId,
  };
  state.quizResults[state.quizKind] = result;
  eventBus.emit(Events.QUIZ_FINISHED, result);
  return result;
}

export function retryQuestQuiz(state, random = null) {
  if (state.quizResearchId) return startResearchQuiz(state, state.quizResearchId, random);
  return startQuestQuiz(state, state.quizKind, random);
}
