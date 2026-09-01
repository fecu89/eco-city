import { test, expect } from '../fixtures/game-test.js';
import {
  buildPlanViaUi,
  chooseExpansionViaUi,
  claimProgressViaUi,
  finishResearchViaUi,
  pauseSimulationViaUi,
  runAtFourTimes,
  setBatteryPolicyViaUi,
  startStressTestViaUi,
  upgradeFacilityViaUi,
  waitForCompletedEvents,
  waitForObjectiveReady,
} from '../helpers/playthrough.js';

test.setTimeout(120_000);

async function waitForTutorialReady(page, questIndex, timeout = 5000) {
  await page.waitForFunction((index) => {
    const state = window.__GAME_STATE__;
    return state.questIndex === index && state.questStatus === 'ready_to_claim';
  }, questIndex, { timeout });
}

test('real HUD and canvas input reaches the redesigned objective campaign from the ten-credit start', async ({ gamePage: page }) => {
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(10);
  expect(await page.evaluate(() => typeof window.__getCellScreenPosition)).toBe('function');
  await runAtFourTimes(page);
  await pauseSimulationViaUi(page);

  await buildPlanViaUi(page, [[1, 'residential'], [2, 'residential']]);
  await waitForTutorialReady(page, 1);
  await claimProgressViaUi(page);

  await buildPlanViaUi(page, [[13, 'thermal'], [4, 'factory']]);
  await runAtFourTimes(page);
  await waitForTutorialReady(page, 2);
  await pauseSimulationViaUi(page);
  await claimProgressViaUi(page);

  await buildPlanViaUi(page, [[8, 'green']]);
  await waitForTutorialReady(page, 3);
  await claimProgressViaUi(page);

  // 같은 우선순위는 낮은 셀 인덱스부터 배전되므로, 초기 화력 1기만으로도
  // 데이터센터가 90% 이상 가동되도록 공장보다 앞선 중앙권에 둔다.
  await buildPlanViaUi(page, [[0, 'data']]);
  await runAtFourTimes(page);
  await waitForTutorialReady(page, 4);
  await pauseSimulationViaUi(page);
  await claimProgressViaUi(page);

  await buildPlanViaUi(page, [[5, 'nuclear']]);
  await runAtFourTimes(page);
  await waitForTutorialReady(page, 5);
  await pauseSimulationViaUi(page);
  await claimProgressViaUi(page);

  // 6번 칸은 중앙 데이터센터(0)와 핵발전(5)에 동시에 인접해 두 시설의 물 부담을 줄인다.
  await buildPlanViaUi(page, [[6, 'cooling']]);
  await runAtFourTimes(page);
  await waitForTutorialReady(page, 6);
  await pauseSimulationViaUi(page);
  await claimProgressViaUi(page);

  await expect(page.locator('#modalCard')).toContainText('첫 확장 방향을 선택하세요');
  await chooseExpansionViaUi(page, 'east');

  expect(await page.evaluate(() => ({
    credits: window.__GAME_STATE__.credits,
    chapter: window.__GAME_STATE__.progression.chapter,
    setId: window.__GAME_STATE__.progression.objectiveSetId,
    side: window.__GAME_STATE__.expansion.firstChoice,
    activeCells: window.__GAME_STATE__.expansion.activeCellIndices.length,
  }))).toMatchObject({ chapter: 2, setId: 'transition-choice', side: 'east', activeCells: 28 });
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBeGreaterThanOrEqual(0);

  await runAtFourTimes(page);
  await waitForObjectiveReady(page, 'transition-choice');
  await pauseSimulationViaUi(page);
  await claimProgressViaUi(page);
  expect(await page.evaluate(() => window.__GAME_STATE__.expansion.activeCellIndices.length)).toBe(37);

  await buildPlanViaUi(page, [[3, 'battery'], [25, 'solar']]);
  await finishResearchViaUi(page, 0, 'battery2');
  await upgradeFacilityViaUi(page, 1);
  await upgradeFacilityViaUi(page, 0);
  await upgradeFacilityViaUi(page, 3);
  await setBatteryPolicyViaUi(page, 3, 'reserve30');

  await runAtFourTimes(page);
  await waitForObjectiveReady(page, 'specialization');
  await pauseSimulationViaUi(page);
  await claimProgressViaUi(page);
  await runAtFourTimes(page);
  await waitForObjectiveReady(page, 'resilience', 30_000);
  await waitForCompletedEvents(page, 2, 30_000);
  await pauseSimulationViaUi(page);
  expect(await page.evaluate(() => window.__GAME_STATE__.events.completed.length)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => window.__GAME_STATE__.events.forecastAcknowledgedIds.length)).toBeGreaterThanOrEqual(2);
  await claimProgressViaUi(page);

  await startStressTestViaUi(page);
  await runAtFourTimes(page);
  await page.waitForFunction(() => window.__GAME_STATE__.stressTest.status !== 'running', null, { timeout: 15_000 });
  await expect(page.locator('#modalCard')).toContainText('도시 생존 성공');
  await page.locator('#stressResultReport').click();
  await expect(page.locator('#modalCard')).toContainText('기후 생존 도시 성적표');
  expect(await page.evaluate(() => ({
    complete: window.__GAME_STATE__.campaignComplete,
    stress: window.__GAME_STATE__.stressTest.status,
    credits: window.__GAME_STATE__.credits,
  }))).toMatchObject({ complete: true, stress: 'passed' });
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBeGreaterThanOrEqual(0);
});
