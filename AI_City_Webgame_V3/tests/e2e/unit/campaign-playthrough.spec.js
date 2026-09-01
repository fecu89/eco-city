import { test, expect } from '@playwright/test';
import { gameState } from '../../../src/core/GameState.js';
import { commitConstructionPlan } from '../../../src/systems/ConstructionPlanSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';
import {
  applySimulationQuestProgress,
  claimCurrentQuest,
  evaluateCurrentQuest,
} from '../../../src/systems/QuestSystem.js';
import { demolishCell, expandBoard, upgradeCell } from '../../../src/systems/BoardSystem.js';
import {
  accelerateResearchFromQuiz,
  advanceResearchOneDay,
  researchDemandByIndex,
  startResearch,
} from '../../../src/systems/ResearchSystem.js';
import {
  claimObjectiveSet,
  currentObjectiveEvaluation,
  startObjectiveCampaign,
} from '../../../src/systems/ObjectiveSystem.js';
import { startStressTest } from '../../../src/systems/StressTestSystem.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';
import { cellZoneTrait } from '../../../src/systems/ZoneSystem.js';
import { CAMPAIGN_PACING } from '../../../src/core/Constants.js';
import { computeReport } from '../../../src/systems/ReportSystem.js';
import { setFacilityPriority } from '../../../src/systems/CityModifierSystem.js';

const settle = createDaySettler({
  calculatePowerNetwork,
  settleEconomy,
  getResearchDemand: researchDemandByIndex,
  advanceResearch: advanceResearchOneDay,
  evaluateQuest: applySimulationQuestProgress,
});

function build(...items) {
  gameState.constructionPlan = items.map(([index, type]) => ({ index, type }));
  const result = commitConstructionPlan(gameState);
  expect(result.ok, result.errors?.map(({ message }) => message).join(' | ')).toBe(true);
  expect(gameState.credits, 'construction must use earned credits').toBeGreaterThanOrEqual(0);
  const constructionHours = Math.max(...result.projects.map(({ durationDays }) => durationDays));
  settleDays(constructionHours);
  result.projects.forEach(({ index }) => expect(gameState.grid[index]?.project, `build ${index} must complete`).toBeNull());
  return result;
}

function settleDays(hours) {
  for (let hour = 0; hour < hours; hour += 1) {
    settle(gameState);
    expect(gameState.gameOver, `game over at hour ${gameState.elapsedGameDays}: ${gameState.gameOverReason}`).toBe(false);
  }
}

function settleUntilCredits(target, maxHours = 96) {
  for (let hour = 0; hour < maxHours && gameState.credits < target; hour += 1) settleDays(1);
  expect(gameState.credits, `credits after ${maxHours}h`).toBeGreaterThanOrEqual(target);
}

function upgrade(...indices) {
  const results = indices.map((index) => {
    const result = upgradeCell(index);
    expect(result).toMatchObject({ ok: true, level: 1, targetLevel: 2 });
    return result;
  });
  settleDays(Math.max(...results.map(({ durationDays }) => durationDays)));
  indices.forEach((index) => expect(gameState.grid[index]).toMatchObject({ level: 2, project: null }));
  return results;
}

function settleUntilTutorialReady(maxHours = 48) {
  for (let hour = 0; hour < maxHours && gameState.questStatus !== 'ready_to_claim'; hour += 1) settleDays(1);
  expect(
    gameState.questStatus,
    `quest ${gameState.questIndex} progress=${JSON.stringify(gameState.questProgress)} routes=${JSON.stringify(gameState.lastTickSummary?.routes)}`,
  ).toBe('ready_to_claim');
}

function claimTutorial() {
  const completedIndex = gameState.questIndex;
  const result = claimCurrentQuest(gameState);
  expect(result.ok, `claim quest ${completedIndex}`).toBe(true);
  expect(gameState.credits).toBeGreaterThanOrEqual(0);
  return result;
}

function finishResearchWithQuiz(researchId, dataCenterIndex) {
  expect(startResearch(gameState, researchId, dataCenterIndex).ok, researchId).toBe(true);
  for (let answer = 0; answer < 4; answer += 1) accelerateResearchFromQuiz(gameState, researchId);
  expect(gameState.research.completedIds.has(researchId)).toBe(true);
}

function coordIndex(q, r) {
  return createHexCoordinates(gameState.boardRadius).findIndex((coord) => coord.q === q && coord.r === r);
}

function emptyZoneIndex(trait) {
  return gameState.expansion.activeCellIndices.find((index) => (
    !gameState.grid[index] && cellZoneTrait(gameState, index) === trait
  ));
}

function completeTutorial(side) {
  expect(gameState.credits).toBe(10);

  build([1, 'residential'], [2, 'residential']);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claimTutorial();

  build([13, 'thermal'], [4, 'factory']);
  settleUntilTutorialReady();
  claimTutorial();

  build([8, 'green']);
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
  claimTutorial();

  // 연구시설을 안정적으로 켜기 위한 임시 화력 1기를 증설하고, 다음 단계에서 50%만 회수한다.
  settleDays(1);
  build([6, 'data'], [0, 'thermal']);
  settleUntilTutorialReady();
  claimTutorial();

  expect(demolishCell(0)).toMatchObject({ ok: true, refund: 2 });
  build([0, 'nuclear']);
  settleUntilTutorialReady();
  claimTutorial();

  build([5, 'cooling']);
  settleUntilTutorialReady();
  const finalTutorialClaim = claimTutorial();
  expect(finalTutorialClaim.expandGrid).toBe(true);
  expect(expandBoard(gameState, side).ok).toBe(true);
  expect(startObjectiveCampaign(gameState)).toMatchObject({ ok: true, setId: 'transition-choice' });
  expect(gameState.expansion).toMatchObject({ phase: 1, firstChoice: side });
}

function settleUntilObjectiveReady(maxHours = 72) {
  for (let hour = 0; hour < maxHours && !currentObjectiveEvaluation(gameState)?.ready; hour += 1) settleDays(1);
  const evaluation = currentObjectiveEvaluation(gameState);
  expect(
    evaluation?.ready,
    `${evaluation?.setId} ${JSON.stringify(evaluation?.cards)} last=${JSON.stringify({
      net: gameState.lastTickSummary?.netCredits,
      carbon: gameState.lastTickSummary?.dailyCarbon,
      lowCarbon: gameState.lastTickSummary?.lowCarbonPercent,
      water: gameState.lastTickSummary?.dailyWater,
      battery: gameState.lastTickSummary?.batteryStored,
      essential: gameState.lastTickSummary?.essentialSupplyPercent,
    })}`,
  ).toBe(true);
}

function claimObjectives(expectedSetId) {
  expect(currentObjectiveEvaluation(gameState)?.setId).toBe(expectedSetId);
  const result = claimObjectiveSet(gameState);
  expect(result).toMatchObject({ ok: true, setId: expectedSetId });
  expect(gameState.credits).toBeGreaterThanOrEqual(0);
  return result;
}

function waitForTwoEventsAndResilience(maxHours = 72) {
  for (let hour = 0; hour < maxHours; hour += 1) {
    if (gameState.events.completed.length >= 2 && currentObjectiveEvaluation(gameState)?.ready) return;
    settleDays(1);
  }
  expect(gameState.events.completed.length, 'two climate events must be experienced before the final test').toBeGreaterThanOrEqual(2);
  expect(currentObjectiveEvaluation(gameState)?.ready).toBe(true);
}

function finishStressTest() {
  expect(startStressTest(gameState)).toMatchObject({ ok: true, attempts: 1 });
  for (let hour = 0; hour < 30 && gameState.stressTest.status === 'running'; hour += 1) settleDays(1);
  expect(gameState.stressTest.status, JSON.stringify(gameState.stressTest.result)).toBe('passed');
  expect(gameState.stressTest.result).toMatchObject({ passed: true });
  expect(gameState.campaignComplete).toBe(true);
  expect(gameState.credits).toBeGreaterThanOrEqual(0);
  return computeReport();
}

test.beforeEach(() => gameState.reset());

test('stable reference campaign earns its way through east expansion, two events, and the stress test', () => {
  completeTutorial('east');

  settleUntilObjectiveReady();
  expect(currentObjectiveEvaluation(gameState).cards.filter(({ completed }) => completed).map(({ id }) => id))
    .toEqual(expect.arrayContaining(['transition-low-carbon', 'transition-carbon']));
  claimObjectives('transition-choice');

  const batteryIndex = coordIndex(1, 0);
  const solarIndex = emptyZoneIndex('solar');
  const dataCenterIndex = coordIndex(-1, 0);
  build([batteryIndex, 'battery'], [solarIndex, 'solar']);
  finishResearchWithQuiz('battery2', coordIndex(-1, 0));
  expect(gameState.research.completedIds.has('smartGrid')).toBe(false);
  upgrade(coordIndex(-1, 1), dataCenterIndex, batteryIndex);

  settleUntilObjectiveReady();
  expect(currentObjectiveEvaluation(gameState).cards.find(({ id }) => id === 'specialization-technology').completed).toBe(true);
  claimObjectives('specialization');

  waitForTwoEventsAndResilience();
  expect(gameState.events.completed.length).toBeGreaterThanOrEqual(2);
  expect(gameState.lastTickSummary.dailyWater).toBeLessThanOrEqual(10);
  expect(currentObjectiveEvaluation(gameState).cards.filter(({ completed }) => completed).map(({ id }) => id))
    .toEqual(expect.arrayContaining([
      'resilience-profit',
      'resilience-environment',
      'resilience-event-reserve',
  ]));
  claimObjectives('resilience');
  const report = finishStressTest();
  expect(report.profile.developing, JSON.stringify(report.profileMetrics)).toBe(false);
  expect(report.profile.id).toBe('stable-energy');
});

test('distributed reference campaign earns its way through west expansion with wind, solar, storage, smart grid, and demand response', () => {
  completeTutorial('west');

  settleUntilObjectiveReady();
  claimObjectives('transition-choice');

  expect(demolishCell(coordIndex(0, 0))).toMatchObject({ ok: true });
  const batteryIndex = coordIndex(1, 0);
  const solarIndex = emptyZoneIndex('solar');
  const windIndex = emptyZoneIndex('wind');
  build([batteryIndex, 'battery'], [solarIndex, 'solar'], [windIndex, 'wind']);
  finishResearchWithQuiz('wind2', coordIndex(-1, 0));
  upgrade(windIndex);

  settleUntilObjectiveReady();
  expect(currentObjectiveEvaluation(gameState).cards.find(({ id }) => id === 'specialization-grid').completed).toBe(true);
  claimObjectives('specialization');

  settleUntilCredits(15);
  finishResearchWithQuiz('smartGrid', coordIndex(-1, 0));
  settleUntilCredits(15);
  finishResearchWithQuiz('demandResponse', coordIndex(-1, 0));
  expect(gameState.research.completedIds.has('battery2')).toBe(false);
  expect(setFacilityPriority(gameState, coordIndex(-1, 0), 'essential')).toMatchObject({ ok: true });
  expect(setFacilityPriority(gameState, coordIndex(1, -1), 'saving')).toMatchObject({ ok: true });
  expect(setFacilityPriority(gameState, coordIndex(1, -1), 'normal')).toMatchObject({ ok: true });
  waitForTwoEventsAndResilience();
  expect(currentObjectiveEvaluation(gameState).cards.find(({ id }) => id === 'resilience-technology').completed).toBe(true);
  claimObjectives('resilience');
  const report = finishStressTest();
  expect(report.profile.developing).toBe(false);
  expect(report.profile.id, JSON.stringify(report.profileMetrics)).toBe('smart-grid');
});

test('human pacing contract spans 15–30 minutes with 2–4 meaningful decisions per representative Chapter 2+ window', () => {
  expect(CAMPAIGN_PACING.humanMinutes).toEqual({ min: 15, target: 25, max: 30 });
  expect(CAMPAIGN_PACING.phases[0]).toMatchObject({ startMinute: 0 });
  expect(CAMPAIGN_PACING.phases.at(-1)).toMatchObject({ endMinute: 30 });
  expect(CAMPAIGN_PACING.representativeWindows.length).toBeGreaterThanOrEqual(3);
  CAMPAIGN_PACING.representativeWindows.forEach((window) => {
    expect(window.startMinute).toBeGreaterThanOrEqual(7);
    expect(window.endMinute - window.startMinute).toBe(2);
    expect(window.decisions.length).toBeGreaterThanOrEqual(2);
    expect(window.decisions.length).toBeLessThanOrEqual(4);
    expect(new Set(window.decisions).size).toBe(window.decisions.length);
  });
});
