import { test, expect } from '../fixtures/game-test.js';

async function openQuestPanel(page) {
  await page.locator('[data-hud-target="quest"]').first().click();
  return page.locator('#questPanel');
}

test('quest seven replaces the objective loop with an actionable 24-day heatwave briefing', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 7;
    state.questStatus = 'active';
    state.progression.chapter = 3;
    state.progression.objectiveSetId = 'specialization';
    state.climateCampaign = {
      status: 'briefing', eventType: null, attempt: 0, scheduledEventId: null,
      progress: {}, lastResult: null, completedEventTypes: [],
    };
    window.__refreshGameForTest();
  });

  const panel = await openQuestPanel(page);
  await expect(page.locator('#phaseText')).toHaveText('기후 대응 1 / 8');
  await expect(panel).toContainText('기후 대응 1 / 8');
  await expect(panel.locator('#questPanelTitle')).toHaveText('폭염 경보');
  await expect(panel).not.toContainText('운영 챕터');
  await expect(panel.locator('#questPanelClaimBtn')).toHaveText('24일 대비 시작');
  await expect(panel.locator('#questPanelClaimBtn')).toBeEnabled();

  await panel.locator('#questPanelClaimBtn').click();
  expect(await page.evaluate(() => ({
    status: window.__GAME_STATE__.climateCampaign.status,
    schedule: window.__GAME_STATE__.events.schedule,
  }))).toMatchObject({
    status: 'preparation',
    schedule: [{ source: 'campaign', type: 'heatwave', startAt: 24 }],
  });
  await expect(page.locator('#forecastStrip')).toContainText('24일 후 폭염');
  await expect(page.locator('#modalCard')).toContainText('폭염 대비 기간');
  expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(0);
});

test('a failed climate result offers a full 24-day retry from the same city', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 8;
    state.questStatus = 'active';
    state.progression.chapter = 3;
    state.grid[0] = { type: 'residential', level: 1 };
    state.climateCampaign = {
      status: 'result', eventType: 'monsoon', attempt: 1, scheduledEventId: 'climate-q8-a1',
      progress: { consecutiveDays: 1, batteryEnergy: 2 },
      lastResult: { passed: false, eventType: 'monsoon' }, completedEventTypes: ['heatwave'],
    };
    state.events.schedule = [{
      id: 'climate-q8-a1', source: 'campaign', type: 'monsoon', announceAt: 0, startAt: 24, endAt: 30,
    }];
    window.__refreshGameForTest();
  });

  const panel = await openQuestPanel(page);
  await expect(panel.locator('#questPanelClaimBtn')).toHaveText('24일 준비부터 재도전');
  await expect(panel.locator('#questPanelClaimBtn')).toBeEnabled();
  await panel.locator('#questPanelClaimBtn').click();
  expect(await page.evaluate(() => ({
    attempt: window.__GAME_STATE__.climateCampaign.attempt,
    status: window.__GAME_STATE__.climateCampaign.status,
    grid: window.__GAME_STATE__.grid.filter(Boolean).map(({ type, level }) => ({ type, level })),
  }))).toEqual({ attempt: 2, status: 'preparation', grid: [{ type: 'residential', level: 1 }] });
});

test('a failed climate attempt raises a priority alert with the retry action', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__EVENT_BUS__.emit(window.__EVENTS__.CLIMATE_QUEST_RESULT, {
      questIndex: 8,
      eventType: 'monsoon',
      attempt: 1,
      passed: false,
      progress: { consecutiveDays: 2, batteryEnergy: 3 },
    });
  });
  const alert = page.locator('.toast.climate-quest-result-alert');
  await expect(alert).toContainText('장마와 집중호우 대응 실패');
  await expect(alert).toContainText('24일 준비부터 재도전');
  await expect(alert.locator('[data-toast-action="quest"]')).toHaveText('퀘스트 열기');
});

test('locked tidal research explains both the quest and renewable prerequisite path', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 11;
    state.stage = 5;
    state.researchMenuUnlocked = true;
    state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  const tidal = page.locator('.research-card[data-research-id="tidal1"]');
  await expect(tidal).toHaveAttribute('aria-disabled', 'true');
  await expect(tidal.locator('.research-lock-tip')).toContainText('고효율 태양전지 완료 필요 또는 풍력 예측 제어 완료 필요');
  await expect(tidal.locator('.research-lock-tip')).toContainText('퀘스트 ‘무풍과 미세먼지’ 완료 필요');
});

test('the final panel shows all eight phases, forty-one days, and every hard entry criterion', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 15;
    state.progression.chapter = 4;
    state.stressTest.status = 'ready';
    state.research.completedIds.add('tidal1');
    state.grid[0] = { type: 'tidal', level: 1 };
    window.__refreshGameForTest();
  });

  const panel = await openQuestPanel(page);
  await expect(panel).toContainText('최종 기후시험 · 준비');
  await panel.locator('#questPanelClaimBtn').click();
  await expect(page.locator('#modalCard .stress-phase-list article')).toHaveCount(8);
  await expect(page.locator('#modalCard')).toContainText('41일');
  await expect(page.locator('#modalCard')).toContainText('평균 공급 82%');
  await expect(page.locator('#modalCard')).toContainText('최저 공급 50%');
  await expect(page.locator('#modalCard')).toContainText('CO₂ 평균 8/일');
  await expect(page.locator('#modalCard')).toContainText('조력 8E');
});
