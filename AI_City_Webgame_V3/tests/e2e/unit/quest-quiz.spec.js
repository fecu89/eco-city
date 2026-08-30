import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  answerQuestQuiz,
  advanceQuestQuiz,
  currentQuestQuizQuestion,
  retryQuestQuiz,
  startQuestQuiz,
} from '../../../src/systems/QuizSystem.js';
import { accelerateResearchFromQuiz, startResearch } from '../../../src/systems/ResearchSystem.js';
import { RESEARCH } from '../../../src/core/ResearchDefinitions.js';

test('only the integrated renewable quiz and final council quiz remain', () => {
  const cases = [
    { questIndex: 8, kind: 'clean-power', total: 4, pass: 3 },
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
  state.questIndex = 8;
  state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
  state.credits = 7;
  startQuestQuiz(state, 'clean-power', () => 0);

  for (let i = 0; i < 4; i++) {
    const question = currentQuestQuizQuestion(state);
    const wrongIndex = question.options.findIndex((option) => !option.correct);
    answerQuestQuiz(state, wrongIndex);
    const result = advanceQuestQuiz(state);
    if (i < 3) expect(result.done).toBe(false);
    else expect(result).toMatchObject({ done: true, passed: false, correct: 0, total: 4 });
  }

  retryQuestQuiz(state, () => 0);
  expect(state.grid[0].type).toBe('residential');
  expect(state.credits).toBe(7);
  expect(state.quizAttempts['clean-power']).toBe(2);
  expect(state.quizIndex).toBe(0);
});

test('a correct quiz answer advances every active research by 45 hours', () => {
  const state = new GameState();
  state.researchMenuUnlocked = true;
  state.credits = 100;
  state.grid[1] = { type: 'data', level: 1 };
  state.grid[2] = { type: 'data', level: 1 };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  startResearch(state, 'solar2', 1);
  startResearch(state, 'wind2', 2);

  const result = accelerateResearchFromQuiz(state);
  expect(result.appliedJobs).toEqual(['solar2', 'wind2']);
  expect(state.research.jobs.solar2.elapsedEffectiveHours).toBe(45);
  expect(state.research.jobs.wind2.elapsedEffectiveHours).toBe(45);
});

test('four correct answers can finish the longest 180-hour research', () => {
  const state = new GameState();
  state.researchMenuUnlocked = true;
  state.credits = 100;
  state.grid[1] = { type: 'data', level: 1 };
  state.unlockedFacilities.add('solar');
  state.unlockedFacilities.add('wind');
  state.unlockedFacilities.add('battery');
  state.research.completedIds = new Set(['solar2', 'wind2', 'battery2', 'tidal1']);
  expect(startResearch(state, 'renewable3', 1).ok).toBe(true);

  for (let answer = 0; answer < 4; answer++) accelerateResearchFromQuiz(state);

  expect(state.research.completedIds.has('renewable3')).toBe(true);
  expect(state.research.jobs.renewable3).toBeUndefined();
});

test('quiz acceleration banks without a job, applies once, and completes a near-finished job once', () => {
  const state = new GameState();
  expect(accelerateResearchFromQuiz(state)).toMatchObject({ appliedJobs: [], bankedHours: 45 });
  state.researchMenuUnlocked = true;
  state.credits = 100;
  state.grid[1] = { type: 'data', level: 1 };
  state.unlockedFacilities.add('solar');
  expect(startResearch(state, 'solar2', 1)).toMatchObject({ ok: true, bankedHoursApplied: 45 });
  expect(state.research.quizAccelerationBankHours).toBe(0);
  state.research.jobs.solar2.elapsedEffectiveHours = RESEARCH.solar2.durationHours - 1;
  const result = accelerateResearchFromQuiz(state);
  expect(result.completed).toEqual([expect.objectContaining({ researchId: 'solar2' })]);
  expect(state.research.completedIds.has('solar2')).toBe(true);
  expect(state.research.jobs.solar2).toBeUndefined();
  expect(accelerateResearchFromQuiz(state).completed).toEqual([]);
});
