import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  answerQuestQuiz,
  advanceQuestQuiz,
  currentQuestQuizQuestion,
  retryQuestQuiz,
  startQuestQuiz,
} from '../../../src/systems/QuizSystem.js';

test('campaign quizzes use 2/3, 2/3, and 3/4 pass rules', () => {
  const cases = [
    { questIndex: 5, kind: 'growth-cost', total: 3, pass: 2 },
    { questIndex: 8, kind: 'clean-power', total: 3, pass: 2 },
    { questIndex: 15, kind: 'climate-council', total: 4, pass: 3 },
  ];

  for (const item of cases) {
    const state = new GameState();
    state.questIndex = item.questIndex;
    const session = startQuestQuiz(state, item.kind, () => 0);
    expect(session.total).toBe(item.total);
    expect(session.passThreshold).toBe(item.pass);
    expect(currentQuestQuizQuestion(state)).not.toBeNull();
  }
});

test('failed quiz keeps the city and retry only replaces the quiz session', () => {
  const state = new GameState();
  state.questIndex = 5;
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  state.credits = 7;
  startQuestQuiz(state, 'growth-cost', () => 0);

  for (let i = 0; i < 3; i++) {
    const question = currentQuestQuizQuestion(state);
    const wrongIndex = question.options.findIndex((option) => !option.correct);
    answerQuestQuiz(state, wrongIndex);
    const result = advanceQuestQuiz(state);
    if (i < 2) expect(result.done).toBe(false);
    else expect(result).toMatchObject({ done: true, passed: false, correct: 0, total: 3 });
  }

  retryQuestQuiz(state, () => 0);
  expect(state.grid[0].type).toBe('residential');
  expect(state.credits).toBe(7);
  expect(state.quizAttempts['growth-cost']).toBe(2);
  expect(state.quizIndex).toBe(0);
});

