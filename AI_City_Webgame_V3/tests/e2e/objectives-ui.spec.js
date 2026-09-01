import { test, expect } from '../fixtures/game-test.js';

async function setClimateQuest(page, questIndex, status = 'briefing') {
  await page.evaluate(({ questIndex, status }) => {
    const state = window.__GAME_STATE__;
    state.questIndex = questIndex;
    state.questStatus = 'active';
    state.progression.chapter = 3;
    state.progression.objectiveSetId = 'specialization';
    state.progression.objectiveProgress = {
      'legacy-objective': { completed: true, value: 99, target: 1 },
    };
    state.climateCampaign = {
      status,
      eventType: null,
      attempt: 0,
      scheduledEventId: null,
      progress: {},
      lastResult: null,
      completedEventTypes: [],
    };
    window.__refreshGameForTest();
  }, { questIndex, status });
}

test('legacy objective progress cannot replace the canonical climate quest panel', async ({ gamePage: page }) => {
  await setClimateQuest(page, 7);
  await page.locator('[data-hud-target="quest"]').first().click();

  await expect(page.locator('#questPanelLevel')).toContainText('기후 대응 1 / 8');
  await expect(page.locator('#questPanelTitle')).toHaveText('폭염 경보');
  await expect(page.locator('.objective-card')).toHaveCount(0);
  await expect(page.locator('#questPanelClaimBtn')).toHaveText('24일 대비 시작');
});

test('climate quest panel remains touch-readable at 390 by 844', async ({ gamePage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setClimateQuest(page, 12);
  await page.locator('.mobile-bar [data-hud-target="quest"]').click();

  const panel = page.locator('#questPanel');
  await panel.waitFor({ state: 'visible' });
  await page.waitForTimeout(250);
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(panel).toContainText('무풍과 미세먼지');
  await expect(panel).toContainText('CO₂');
});

test('top HUD follows all eight climate quests and the final test', async ({ gamePage: page }) => {
  await setClimateQuest(page, 7);
  await expect(page.locator('#phaseText')).toHaveText('기후 대응 1 / 8');
  await expect(page.locator('#missionTitle')).toHaveText('폭염 경보');

  await setClimateQuest(page, 14);
  await expect(page.locator('#phaseText')).toHaveText('기후 대응 8 / 8');
  await expect(page.locator('#missionTitle')).toHaveText('폭풍해일');

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 15;
    state.progression.chapter = 4;
    state.stressTest.status = 'failed';
    state.stressTest.result = { passed: false, diagnosis: { label: '필수시설 평균 전력 공급이 부족했습니다.' } };
    window.__refreshGameForTest();
  });
  await expect(page.locator('#phaseText')).toHaveText('최종 기후시험 · 재도전');
  await expect(page.locator('#missionTitle')).toHaveText('대한민국 복합기후 시험');
});

test('text state exposes climate campaign status instead of removed objective routing', async ({ gamePage: page }) => {
  await setClimateQuest(page, 9, 'preparation');
  const textState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));

  expect(textState.climateCampaign).toMatchObject({ status: 'preparation', questIndex: 9 });
  expect(textState.progression).not.toHaveProperty('objectiveSetId');
  expect(textState.progression).not.toHaveProperty('objectives');
});
