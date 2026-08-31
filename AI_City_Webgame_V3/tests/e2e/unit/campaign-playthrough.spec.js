import { test, expect } from '@playwright/test';
import { gameState } from '../../../src/core/GameState.js';
import { commitConstructionPlan } from '../../../src/systems/ConstructionPlanSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createHourSettler } from '../../../src/systems/SimulationSystem.js';
import {
  applySimulationQuestProgress,
  claimCurrentQuest,
  evaluateCurrentQuest,
  markQuestQuizResult,
} from '../../../src/systems/QuestSystem.js';
import { demolishCell, expandBoard, upgradeCell } from '../../../src/systems/BoardSystem.js';
import { accelerateResearchFromQuiz, startResearch } from '../../../src/systems/ResearchSystem.js';
import {
  advanceQuestQuiz,
  answerQuestQuiz,
  currentQuestQuizQuestion,
  startQuestQuiz,
} from '../../../src/systems/QuizSystem.js';

const settle = createHourSettler({
  calculatePowerNetwork,
  settleEconomy,
  evaluateQuest: applySimulationQuestProgress,
});

function build(...items) {
  gameState.constructionPlan = items.map(([index, type]) => ({ index, type }));
  const result = commitConstructionPlan(gameState);
  expect(result.ok, result.errors?.map(({ message }) => message).join(' | ')).toBe(true);
  expect(gameState.credits).toBeGreaterThanOrEqual(0);
  return result;
}

function settleUntilReady(maxHours = 48) {
  for (let hour = 0; hour < maxHours && gameState.questStatus !== 'ready_to_claim'; hour += 1) {
    settle(gameState);
  }
  expect(
    gameState.questStatus,
    `quest ${gameState.questIndex} progress=${JSON.stringify(gameState.questProgress)} routes=${JSON.stringify(gameState.lastTickSummary?.routes)}`,
  ).toBe('ready_to_claim');
}

function claim() {
  const completedIndex = gameState.questIndex;
  const result = claimCurrentQuest(gameState);
  expect(result.ok, `claim quest ${completedIndex}`).toBe(true);
  if (result.expandGrid) expect(expandBoard(gameState).ok).toBe(true);
  expect(gameState.credits).toBeGreaterThanOrEqual(0);
}

function finishResearchWithQuiz(researchId, dataCenterIndex) {
  expect(startResearch(gameState, researchId, dataCenterIndex).ok, researchId).toBe(true);
  for (let answer = 0; answer < 4; answer += 1) accelerateResearchFromQuiz(gameState, researchId);
  expect(gameState.research.completedIds.has(researchId)).toBe(true);
}

test.beforeEach(() => gameState.reset());

test('a real campaign can progress from the initial ten credits through all fifteen quests', () => {
  expect(gameState.credits).toBe(10);

  build([1, 'residential'], [2, 'residential']);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claim();

  build([13, 'thermal'], [4, 'factory']);
  settleUntilReady();
  claim();

  build([8, 'green']);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claim();

  settle(gameState);
  build([6, 'data'], [0, 'thermal']);
  settleUntilReady();
  claim();

  expect(demolishCell(0).ok).toBe(true);
  build([0, 'nuclear']);
  settleUntilReady();
  claim();

  build([5, 'cooling']);
  settleUntilReady();
  claim();

  build([3, 'solar'], [10, 'factory']);
  settleUntilReady();
  claim();

  finishResearchWithQuiz('solar2', 6);
  expect(upgradeCell(1).ok).toBe(true);
  expect(upgradeCell(3).ok).toBe(true);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claim();

  build([17, 'battery'], [16, 'residential'], [18, 'residential']);
  settleUntilReady();
  claim();

  build([11, 'wind']);
  finishResearchWithQuiz('wind2', 6);
  expect(upgradeCell(11).ok).toBe(true);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claim();

  settleUntilReady();
  claim();

  settleUntilReady();
  claim();

  build([15, 'battery']);
  settleUntilReady(72);
  claim();

  expect(demolishCell(10).ok).toBe(true);
  expect(upgradeCell(1).ok).toBe(true);
  settleUntilReady();
  claim();

  startQuestQuiz(gameState, 'climate-council', () => 0.5);
  let quizResult = null;
  while (!quizResult?.done) {
    const question = currentQuestQuizQuestion(gameState);
    answerQuestQuiz(gameState, question.options.findIndex((option) => option.correct));
    quizResult = advanceQuestQuiz(gameState);
  }
  expect(quizResult).toMatchObject({ passed: true, correct: 4, total: 4 });
  markQuestQuizResult(gameState, quizResult.passed);
  claim();

  expect(gameState.campaignComplete).toBe(true);
  expect(gameState.claimedQuestIds.size).toBe(15);
  expect(gameState.gameOver).toBe(false);
});
