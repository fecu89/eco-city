import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { RESEARCH_QUIZZES } from '../../../src/core/ResearchQuizDefinitions.js';
import {
  answerQuestQuiz,
  currentQuestQuizQuestion,
  startQuestQuiz,
  startResearchQuiz,
} from '../../../src/systems/QuizSystem.js';
import { accelerateResearchFromQuiz, startResearch } from '../../../src/systems/ResearchSystem.js';

test('the final council is the only quest quiz while every research owns four questions', () => {
  const state = new GameState();
  const session = startQuestQuiz(state, 'climate-council', () => 0.5);
  expect(session).toMatchObject({ total: 4, passThreshold: 3 });
  expect(state.quizResearchId).toBeNull();

  expect(Object.keys(RESEARCH_QUIZZES).sort()).toEqual([
    'battery2', 'renewable3', 'solar2', 'tidal1', 'wind2',
  ]);
  const ids = [];
  Object.entries(RESEARCH_QUIZZES).forEach(([researchId, questions]) => {
    expect(questions, researchId).toHaveLength(4);
    questions.forEach((question) => ids.push(question.id));
  });
  expect(new Set(ids).size).toBe(20);
});

test('answer options are shuffled per session without changing the correct answer or source bank', () => {
  const original = RESEARCH_QUIZZES.solar2[0].options.map(({ text, correct }) => ({ text, correct }));
  const first = new GameState();
  first.research.jobs.solar2 = { id: 'solar2', dataCenterIndex: 1, elapsedEffectiveHours: 0 };
  startResearchQuiz(first, 'solar2', () => 0.999999);
  const firstQuestion = currentQuestQuizQuestion(first);

  const second = new GameState();
  second.research.jobs.solar2 = { id: 'solar2', dataCenterIndex: 1, elapsedEffectiveHours: 0 };
  startResearchQuiz(second, 'solar2', () => 0);
  const secondQuestion = currentQuestQuizQuestion(second);

  expect(firstQuestion.options.findIndex((option) => option.correct)).not.toBe(
    secondQuestion.options.findIndex((option) => option.correct),
  );
  expect(firstQuestion.options.filter((option) => option.correct)).toHaveLength(1);
  expect(secondQuestion.options.filter((option) => option.correct)).toHaveLength(1);
  expect(RESEARCH_QUIZZES.solar2[0].options).toEqual(original);
});

test('a correct research answer accelerates only its assigned research by one quarter', () => {
  const state = new GameState();
  state.researchMenuUnlocked = true;
  state.credits = 100;
  state.grid[1] = { type: 'data', level: 1 };
  state.grid[2] = { type: 'data', level: 1 };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  startResearch(state, 'solar2', 1);
  startResearch(state, 'wind2', 2);
  startResearchQuiz(state, 'solar2', () => 0.999999);

  const question = currentQuestQuizQuestion(state);
  const correctIndex = question.options.findIndex((option) => option.correct);
  const result = answerQuestQuiz(state, correctIndex);

  expect(result.acceleration).toMatchObject({ appliedJobs: ['solar2'], hours: 30 });
  expect(state.research.jobs.solar2.elapsedEffectiveHours).toBe(30);
  expect(state.research.jobs.wind2.elapsedEffectiveHours).toBe(0);
});

test('four correct answers can finish the longest research without accelerating another center', () => {
  const state = new GameState();
  state.researchMenuUnlocked = true;
  state.credits = 100;
  state.grid[1] = { type: 'data', level: 1 };
  state.grid[2] = { type: 'data', level: 1 };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  state.research.completedIds = new Set(['solar2', 'wind2', 'battery2', 'tidal1']);
  expect(startResearch(state, 'renewable3', 1).ok).toBe(true);
  state.research.completedIds.delete('wind2');
  expect(startResearch(state, 'wind2', 2).ok).toBe(true);

  for (let answer = 0; answer < 4; answer++) {
    const result = accelerateResearchFromQuiz(state, 'renewable3');
    expect(result.appliedJobs).toEqual(['renewable3']);
  }

  expect(state.research.completedIds.has('renewable3')).toBe(true);
  expect(state.research.jobs.renewable3).toBeUndefined();
  expect(state.research.jobs.wind2.elapsedEffectiveHours).toBe(0);
});

test('research acceleration does not bank when its selected job is missing', () => {
  const state = new GameState();
  expect(accelerateResearchFromQuiz(state, 'solar2')).toEqual({
    appliedJobs: [],
    hours: 0,
    completed: [],
    reason: 'research_not_active',
  });
  expect(state.research.quizAccelerationBankHours).toBe(0);
});
