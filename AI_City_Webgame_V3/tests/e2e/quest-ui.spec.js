import { test, expect } from '../fixtures/game-test.js';

test.describe('quest economy HUD', () => {
  test('shows a persistent level-one quest and simulation strip without evidence UI', async ({ gamePage: page }) => {
    await expect(page.locator('#questTracker')).toBeVisible();
    await expect(page.locator('#questTracker')).toContainText('LEVEL 1 / 15');
    await expect(page.locator('#questTitle')).toHaveText('첫 시민');
    await expect(page.locator('#questReward')).toContainText('화력발전 해금');
    await expect(page.locator('#questReward')).not.toContainText('thermal');
    await expect(page.locator('#teacherNote')).toContainText('도시 정착');
    await expect(page.locator('#teacherNote')).not.toContainText('1차시');
    await expect(page.locator('#simulationHud')).toContainText('08:00');
    await expect(page.locator('[data-achievement-tab="evidence"]')).toHaveCount(0);
    await expect(page.locator('#evidenceBox')).toHaveCount(0);
  });

  test('starts with only residential available and exposes deterministic settlement', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await expect(page.locator('#facilityDock .facility-btn')).toHaveCount(1);
    await expect(page.locator('#facilityDock .facility-btn')).toContainText('주거지');
    expect(await page.evaluate(() => typeof window.__settleSimulationHour)).toBe('function');
    const before = await page.evaluate(() => window.__GAME_STATE__.simulationHour);
    await page.evaluate(() => window.__settleSimulationHour());
    expect(await page.evaluate(() => window.__GAME_STATE__.simulationHour)).toBe((before + 1) % 24);
  });

  test('claiming the first quest unlocks thermal exactly once', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
      window.__GAME_STATE__.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
      window.__refreshGameForTest();
    });
    await expect(page.locator('#questClaimBtn')).toBeEnabled();
    const before = await page.evaluate(() => window.__GAME_STATE__.credits);
    await page.locator('#questClaimBtn').click();
    await expect(page.locator('#questTracker')).toContainText('LEVEL 2 / 15');
    expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(before + 4);
    expect(await page.evaluate(() => window.__GAME_STATE__.unlockedFacilities.has('thermal'))).toBe(true);
  });

  test('quest quiz opens from the persistent tracker and passing it enables the reward', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 5;
      state.questStatus = 'active';
      state.baseline = { reliableSupply: 10, demand: 8, dev: 20 };
      window.__refreshGameForTest();
    });

    await expect(page.locator('#questClaimBtn')).toBeEnabled();
    await expect(page.locator('#questClaimBtn')).toHaveText('퀴즈 시작');
    await page.locator('#questClaimBtn').click();
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('#modalCard')).toContainText('1 / 3');

    for (let index = 0; index < 3; index++) {
      await page.locator('#questQuizOptions .quiz-option').first().click();
      await page.locator('#questQuizNext').click();
    }

    await expect(page.locator('#modalCard')).toContainText('퀴즈 통과');
    await page.locator('#questQuizFinish').click();
    await expect(page.locator('#questClaimBtn')).toHaveText('보상 받기');
    await expect(page.locator('#questClaimBtn')).toBeEnabled();
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
    await expect(page.locator('#demolitionBreakdown')).toContainText('총 투자 6C');
    await expect(page.locator('#demolitionBreakdown')).toContainText('환급 3C');
    await expect(page.locator('#demolitionBreakdown')).toContainText('손실 3C');
    await expect(page.locator('#recordEvidenceBtn')).toHaveCount(0);

    await page.locator('#facilityPriorityControls [data-priority="essential"]').click();
    expect(await page.evaluate(() => window.__GAME_STATE__.grid[0].priority)).toBe('essential');
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

  test('quest 4 reward reveals hidden operating costs after the level-up modal', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 4;
      state.questStatus = 'ready_to_claim';
      state.metrics = { reliableSupply: 10, demand: 8, balance: 2, carbon: 7, water: 5 };
      state.lastTickSummary = { deliveredPower: 10, demand: 8, hourlyCarbon: 7, hourlyWater: 5, routes: [] };
      window.__refreshGameForTest();
    });

    await page.locator('#questClaimBtn').click();
    await expect(page.locator('#modalCard')).toContainText('AI 산업지구 완료');
    expect(await page.evaluate(() => window.__GAME_STATE__.badges.has('crisis'))).toBe(true);
    await page.locator('#questRewardClose').click();
    await expect(page.locator('#modalCard')).toContainText('성장 뒤의 비용이 공개되었습니다');
    await expect(page.locator('#modalCard')).toContainText('탄소/시간');
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

    await page.locator('#questClaimBtn').click();
    await expect(page.locator('#modalCard')).toContainText('도시 생존 성공');
    await page.locator('#questRewardClose').click();
    await expect(page.locator('#modalCard')).toContainText('기후 생존 도시 성적표');
    await expect(page.locator('#modalCard')).toContainText('평균 송전 효율');
    await expect(page.locator('#validationBtn')).toHaveCount(0);
  });
});
