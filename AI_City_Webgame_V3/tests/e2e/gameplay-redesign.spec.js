import { test, expect } from '../fixtures/game-test.js';
import {
  buildPlanViaUi,
  chooseExpansionViaUi,
  claimProgressViaUi,
  openHudPanel,
  pauseSimulationViaUi,
  settleUntilQuestReady,
} from '../helpers/playthrough.js';

async function questSnapshot(page) {
  return page.evaluate(() => ({
    questIndex: window.__GAME_STATE__.questIndex,
    questStatus: window.__GAME_STATE__.questStatus,
    chapter: window.__GAME_STATE__.progression.chapter,
  }));
}

// 1~6단계를 상태 주입 없이 실제 HUD로 통과한다. 건설은 시설 카드 -> 3D 보드 좌표 클릭 -> O 확정,
// 연속 운영일은 게임 시계로만 넘긴다. 마지막에 첫 확장 방향을 고르면 7단계는 기후 이벤트가 아니라
// 연구 준비 퀘스트여야 한다 — 기후전은 11단계에서 시작한다.
test('the real HUD carries quests one through six into the first expansion and the research preparation quest', async ({ gamePage: page }) => {
  // 여섯 퀘스트를 실제 UI로 통과하는 유일한 회귀 테스트라 기본 30초로는 빠듯하다.
  test.setTimeout(90_000);
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(10);
  await pauseSimulationViaUi(page);

  // 1단계 — 주거지 2채.
  await buildPlanViaUi(page, [[1, 'residential'], [2, 'residential']]);
  expect(await questSnapshot(page)).toMatchObject({ questIndex: 1, questStatus: 'ready_to_claim' });
  await claimProgressViaUi(page);

  // 2단계 — 화력발전과 인접 공장을 흑자로 2일 가동.
  await buildPlanViaUi(page, [[13, 'thermal']]);
  await buildPlanViaUi(page, [[4, 'factory']]);
  await settleUntilQuestReady(page);
  await claimProgressViaUi(page);

  // 3단계 — 첫 녹지.
  await buildPlanViaUi(page, [[8, 'green']]);
  expect(await questSnapshot(page)).toMatchObject({ questIndex: 3, questStatus: 'ready_to_claim' });
  await claimProgressViaUi(page);

  // 4단계 — 데이터센터 전력 공급률 90% 2일. 보상 시점에 기준 도시가 저장되고 연구 메뉴가 열린다.
  await buildPlanViaUi(page, [[0, 'data']]);
  await settleUntilQuestReady(page);
  await claimProgressViaUi(page);
  expect(await page.evaluate(() => ({
    researchMenuUnlocked: window.__GAME_STATE__.researchMenuUnlocked,
    baselineWater: window.__GAME_STATE__.baseline?.dailyWater,
  }))).toMatchObject({ researchMenuUnlocked: true });

  // 5단계 — 핵발전(화력 예비력 유지). 인력을 먼저 채워야 건설 계획이 통과한다.
  await buildPlanViaUi(page, [[3, 'residential'], [7, 'residential']]);
  await buildPlanViaUi(page, [[5, 'nuclear']]);
  await settleUntilQuestReady(page);
  await claimProgressViaUi(page);

  // 6단계 — 데이터센터에 순환냉각을 붙이고 물 사용을 기준 이하로 2일 유지.
  await buildPlanViaUi(page, [[6, 'cooling']]);
  await settleUntilQuestReady(page);
  await claimProgressViaUi(page);

  // 6단계 보상은 첫 확장 방향 선택이다. 기후 이벤트는 아직 예보되지 않는다.
  await expect(page.locator('#modalCard')).toContainText('첫 확장 방향을 선택하세요');
  await chooseExpansionViaUi(page, 'east');

  await openHudPanel(page, 'quest');
  const questPanel = page.locator('[data-hud-panel="quest"]');
  await expect(questPanel).toContainText('LEVEL 7 / 19');
  await expect(questPanel).toContainText('태양광 연구 기초');
  await expect(questPanel).not.toContainText('폭염');
  // 목표 세트 카드 계층은 제거됐다.
  await expect(page.locator('.objective-card')).toHaveCount(0);

  expect(await page.evaluate(() => ({
    questIndex: window.__GAME_STATE__.questIndex,
    chapter: window.__GAME_STATE__.progression.chapter,
    objectiveSetId: window.__GAME_STATE__.progression.objectiveSetId,
    climateStatus: window.__GAME_STATE__.climateCampaign.status,
    activeCells: window.__GAME_STATE__.expansion.activeCellIndices.length,
    scheduledEvents: window.__GAME_STATE__.events.schedule.length,
    solarUnlocked: window.__GAME_STATE__.unlockedFacilities.has('solar'),
  }))).toEqual({
    questIndex: 7,
    chapter: 2,
    objectiveSetId: null,
    climateStatus: 'locked',
    activeCells: 28,
    scheduledEvents: 0,
    solarUnlocked: true,
  });

  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()))).toMatchObject({
    mode: 'playing',
    quest: 7,
    expansion: { phase: 1, firstChoice: 'east', activeCellCount: 28 },
    climateCampaign: { questIndex: 7, status: 'locked', eventType: null },
  });
});
