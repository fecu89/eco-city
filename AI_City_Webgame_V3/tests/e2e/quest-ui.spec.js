import { test, expect } from '../fixtures/game-test.js';

async function openQuestPanel(page) {
  await page.locator('[data-hud-target="quest"]').first().click();
  return page.locator('#questPanel');
}

test.describe('quest economy HUD', () => {
  test('shows the level-one quest inside its menu and keeps the world free of evidence UI', async ({ gamePage: page }) => {
    await expect(page.locator('#questTracker')).toHaveCount(0);
    const panel = await openQuestPanel(page);
    await expect(panel).toContainText('LEVEL 1 / 15');
    await expect(page.locator('#questPanelTitle')).toHaveText('2040, 첫 시민');
    await expect(page.locator('#questPanelReward')).toContainText('화력발전 해금');
    await expect(page.locator('#questPanelReward')).not.toContainText('thermal');
    await expect(page.locator('#teacherNote')).toContainText('도시 정착');
    await expect(page.locator('#teacherNote')).not.toContainText('1차시');
    await expect(page.locator('#simulationHud')).toContainText('2040-01-01');
    await expect(page.locator('[data-hud-target="achievements"]')).toHaveCount(0);
    await expect(page.locator('#evidenceBox')).toHaveCount(0);
  });

  test('starts with only residential available and exposes deterministic settlement', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await expect(page.locator('#facilityDock .facility-btn')).toHaveCount(11);
    await expect(page.locator('#facilityDock .facility-btn[aria-disabled="false"]')).toHaveCount(1);
    expect(await page.evaluate(() => typeof window.__settleSimulationHour)).toBe('function');
    const before = await page.evaluate(() => window.__GAME_STATE__.elapsedGameHours);
    await page.evaluate(() => window.__settleSimulationHour());
    expect(await page.evaluate(() => window.__GAME_STATE__.elapsedGameHours)).toBe(before + 1);
  });

  test('claiming the first quest unlocks thermal exactly once', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
      window.__GAME_STATE__.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
      window.__refreshGameForTest();
    });
    await openQuestPanel(page);
    await expect(page.locator('#questPanelClaimBtn')).toBeEnabled();
    const before = await page.evaluate(() => window.__GAME_STATE__.credits);
    await page.locator('#questPanelClaimBtn').click();
    await page.locator('#questRewardClose').click();
    await openQuestPanel(page);
    await expect(page.locator('#questPanel')).toContainText('LEVEL 2 / 15');
    expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(before + 4);
    expect(await page.evaluate(() => window.__GAME_STATE__.unlockedFacilities.has('thermal'))).toBe(true);
  });

  test('quest 5 is an operational carbon transition instead of a quiz-only gate', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      window.__setTimeScale(0);
      state.questIndex = 5;
      state.questStatus = 'active';
      state.stage = 1;
      state.grid = Array(19).fill(null);
      state.grid[0] = { type: 'nuclear', level: 1, priority: 'normal' };
      state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
      state.grid[2] = { type: 'residential', level: 1, priority: 'essential' };
      state.grid[3] = { type: 'factory', level: 1, priority: 'normal' };
      state.grid[4] = { type: 'data', level: 1, priority: 'normal' };
      window.__refreshGameForTest();
    });

    await openQuestPanel(page);
    await expect(page.locator('#questPanel')).toContainText('CO₂ 8 이하');
    await expect(page.locator('#questPanelClaimBtn')).toHaveText('진행 중');
    await expect(page.locator('#questPanelClaimBtn')).toBeDisabled();
    await expect(page.locator('#questPanel')).not.toContainText('퀴즈 시작');

    await page.evaluate(() => {
      window.__settleSimulationHour();
      window.__settleSimulationHour();
    });
    await expect(page.locator('#questPanelClaimBtn')).toHaveText('보상 받기');
    await expect(page.locator('#questPanelClaimBtn')).toBeEnabled();
  });

  test('facility inspector shows priority controls and the exact 50 percent demolition loss', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 11;
      state.questStatus = 'active';
      state.upgradePermitLevel = 2;
      state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
      window.__refreshGameForTest();
      window.__clickCell(0);
    });

    await expect(page.locator('#facilityPriorityControls button')).toHaveCount(3);
    await expect(page.locator('#facilityPriorityControls')).toContainText('필수');
    await expect(page.locator('#facilityPriorityControls')).toContainText('일반');
    await expect(page.locator('#facilityPriorityControls')).toContainText('절약');
    await expect(page.locator('#demolitionBreakdown')).toContainText('총 투자 6.00 💰');
    await expect(page.locator('#demolitionBreakdown')).toContainText('환급 3.00 💰');
    await expect(page.locator('#demolitionBreakdown')).toContainText('손실 3.00 💰');
    await expect(page.locator('#recordEvidenceBtn')).toHaveCount(0);

    await page.locator('#facilityPriorityControls [data-priority="essential"]').click();
    expect(await page.evaluate(() => window.__GAME_STATE__.grid[0].priority)).toBe('essential');
  });

  test('quest 6 shows an actionable scanner toggle and highlights the next risk', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 6;
      state.stage = 4;
      state.firstCitySnapshot = Array(19).fill(null);
      state.firstCitySnapshot[0] = { type: 'thermal', level: 1 };
      state.firstCitySnapshot[1] = { type: 'factory', level: 1 };
      state.firstCitySnapshot[2] = { type: 'data', level: 1 };
      window.__refreshGameForTest();
    });
    await openQuestPanel(page);
    await expect(page.locator('#questPanelContextAction')).toBeVisible();
    await expect(page.locator('#questPanelContextAction')).toContainText('켜짐');
    expect(await page.evaluate(() => window.__getCellVisual(0).diagnosisTarget)).toBe(true);
    await page.locator('#questPanelContextAction').click();
    await expect(page.locator('#questPanelContextAction')).toContainText('꺼짐');
    await page.evaluate(() => window.__clickCell(0));
    expect(await page.evaluate(() => window.__GAME_STATE__.diagnosisFound.size)).toBe(0);
    await expect(page.locator('.toast', { hasText: '스캐너가 꺼져' })).toBeVisible();
  });

  test('green spaces keep birds hidden until one pooled flock visits', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const configs = Array(25).fill(null).map(() => ({ empty: true }));
      configs[12] = { empty: false, type: 'green', level: 1 };
      window.__renderCityConfigsForTest(configs, 5);
    });

    expect(await page.evaluate(() => window.__getCityRendererStats().birdCount)).toBe(0);
    expect(await page.evaluate(() => window.__getCityRendererStats().birdPoolSize)).toBe(3);
    expect(await page.evaluate(() => typeof window.__triggerBirdVisitForTest)).toBe('function');

    await page.evaluate(() => window.__triggerBirdVisitForTest(12, 2));
    expect(await page.evaluate(() => window.__getCityRendererStats().birdCount)).toBe(2);
    await page.evaluate(() => window.__finishBirdVisitForTest());
    expect(await page.evaluate(() => window.__getCityRendererStats().birdCount)).toBe(0);
  });

  test('quest 4 closes directly into a new-quest alert because operating costs are public from the start', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 4;
      state.questStatus = 'ready_to_claim';
      state.metrics = { reliableSupply: 10, demand: 8, balance: 2, carbon: 7, water: 5 };
      state.lastTickSummary = { deliveredPower: 10, demand: 8, hourlyCarbon: 7, hourlyWater: 5, routes: [] };
      window.__refreshGameForTest();
    });

    await openQuestPanel(page);
    await page.locator('#questPanelClaimBtn').click();
    await expect(page.locator('#modalCard')).toContainText('연구도시의 씨앗 완료');
    await page.locator('#questRewardClose').click();
    await expect(page.locator('#modal')).toBeHidden();
    await expect(page.locator('.toast', { hasText: '새 퀘스트 시작' })).toContainText('탄소 경계선');
    await expect(page.locator('[data-hud-target="quest"]').first()).toHaveAttribute('data-notification', 'new');
    await expect(page.locator('body')).not.toContainText('숨은 운영비');
  });

  test('quest 15 reward opens the operational final report without another validation gate', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 15;
      state.questStatus = 'ready_to_claim';
      state.baseline = { dev: 5, balance: -2, carbon: 8, water: 9 };
      state.simulationTotals = {
        hours: 2,
        netCredits: 4,
        transmissionEfficiency: 1.8,
        lowCarbonPercent: 150,
        employmentRate: 1.5,
        industryFill: 1.4,
        essentialOutageHours: 0,
        overcrowding: 1,
        health: 0.4,
      };
      window.__refreshGameForTest();
    });

    await openQuestPanel(page);
    await page.locator('#questPanelClaimBtn').click();
    await expect(page.locator('#modalCard')).toContainText('도시 생존 성공');
    await page.locator('#questRewardClose').click();
    await expect(page.locator('#modalCard')).toContainText('기후 생존 도시 성적표');
    await expect(page.locator('#modalCard')).toContainText('평균 송전 효율');
    await expect(page.locator('#validationBtn')).toHaveCount(0);
  });
});
