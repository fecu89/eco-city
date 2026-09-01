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
    await expect(page.locator('#questPanelReward')).toContainText('공장·화력발전 해금');
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
    expect(await page.evaluate(() => typeof window.__settleSimulationDay)).toBe('function');
    const before = await page.evaluate(() => window.__GAME_STATE__.elapsedGameDays);
    await page.evaluate(() => window.__settleSimulationDay());
    expect(await page.evaluate(() => window.__GAME_STATE__.elapsedGameDays)).toBe(before + 1);
  });

  test('claiming the first quest unlocks factory and thermal without a reward modal', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
      window.__GAME_STATE__.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
      window.__refreshGameForTest();
    });
    await openQuestPanel(page);
    await expect(page.locator('#questPanelClaimBtn')).toBeEnabled();
    const before = await page.evaluate(() => window.__GAME_STATE__.credits);
    await page.locator('#questPanelClaimBtn').click();
    await expect(page.locator('#questRewardClose')).toHaveCount(0);
    await expect(page.locator('.toast.quest-reward-alert')).toContainText('공장·화력발전 해금');
    await expect(page.locator('#questPanel')).toContainText('LEVEL 2 / 15');
    await expect(page.locator('#questPanelGoal')).toContainText('흑자로 2시간');
    await expect(page.locator('#questPanelReward')).toContainText('녹지 해금');
    expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(before + 4);
    expect(await page.evaluate(() => window.__GAME_STATE__.unlockedFacilities.has('factory'))).toBe(true);
    expect(await page.evaluate(() => window.__GAME_STATE__.unlockedFacilities.has('thermal'))).toBe(true);
  });

  test('level 3 asks for one green space and keeps data center as its reward', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 3;
      state.questStatus = 'active';
      state.unlockedFacilities.add('green');
      window.__refreshGameForTest();
    });
    const panel = await openQuestPanel(page);
    await expect(panel.locator('#questPanelTitle')).toHaveText('첫 녹지 조성');
    await expect(panel.locator('#questPanelGoal')).toContainText('녹지 1칸');
    await expect(panel.locator('#questPanelReward')).toContainText('데이터센터 해금');
  });

  test('the compact quest card expands to show every condition and reward in place', async ({ gamePage: page }) => {
    const panel = await openQuestPanel(page);
    await expect(page.locator('#questPanelDetails')).toBeHidden();
    await page.locator('#questPanelExpandBtn').click();
    await expect(page.locator('#questPanelExpandBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#questPanelExpandBtn')).toContainText('간단히 보기');
    await expect(page.locator('#questPanelDetails')).toBeVisible();
    await expect(page.locator('#questPanelDetails')).toContainText('주거지 2개');
    await expect(page.locator('#questPanelDetails')).toContainText('공장·화력발전 해금');
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
      // 핵발전은 화력 또는 가동 중인 저장 예비력이 있어야 전력을 공급한다.
      state.grid[5] = { type: 'thermal', level: 1, priority: 'normal' };
      window.__refreshGameForTest();
    });

    await openQuestPanel(page);
    await expect(page.locator('#questPanel')).toContainText('CO₂ 12 이하');
    await expect(page.locator('#questPanelClaimBtn')).toHaveText('진행 중');
    await expect(page.locator('#questPanelClaimBtn')).toBeDisabled();
    await expect(page.locator('#questPanel')).not.toContainText('퀴즈 시작');

    await page.evaluate(() => {
      window.__settleSimulationDay();
      window.__settleSimulationDay();
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
    await page.locator('#facilityPriorityControls [data-priority="essential"]').click();
    expect(await page.evaluate(() => window.__GAME_STATE__.grid[0].priority)).toBe('essential');

    await expect(page.locator('[data-facility-tab], .facility-console-tabs')).toHaveCount(0);
    await expect(page.locator('#demolitionBreakdown')).toContainText('총 투자 6.00 💰');
    await expect(page.locator('#demolitionBreakdown')).toContainText('환급 3.00 💰');
    await expect(page.locator('#demolitionBreakdown')).toContainText('손실 3.00 💰');
    await expect(page.locator('#recordEvidenceBtn')).toHaveCount(0);

  });

  test('quest 6 presents the compact environmental water-cycle objective without a scanner', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 6;
      state.stage = 3;
      window.__refreshGameForTest();
    });
    const panel = await openQuestPanel(page);
    await expect(panel.locator('#questPanelTitle')).toHaveText('도시 물순환');
    await expect(panel.locator('#questPanelGoal')).toContainText('데이터센터와 순환냉각');
    await expect(panel.locator('#questPanelContextAction')).toBeHidden();
    await expect(page.locator('#diagnosisProgress, #diagnosisToggleBtn, #diagnosisHintBtn')).toBeHidden();
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

  test('quest 4 claims through a reward alert and starts the next quest without a reward modal', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 4;
      state.questStatus = 'ready_to_claim';
      state.metrics = { reliableSupply: 10, demand: 8, balance: 2, carbon: 7, water: 5 };
      state.lastTickSummary = { deliveredPower: 10, demand: 8, dailyCarbon: 7, dailyWater: 5, routes: [] };
      window.__refreshGameForTest();
    });

    await openQuestPanel(page);
    await page.locator('#questPanelClaimBtn').click();
    await expect(page.locator('#questRewardClose')).toHaveCount(0);
    await expect(page.locator('#modal')).toBeHidden();
    await expect(page.locator('.toast.quest-reward-alert')).toContainText('연구도시의 씨앗 완료');
    const alert = page.locator('.toast.quest-alert');
    await expect(alert).toContainText('LEVEL 5 / 15');
    await expect(alert).toContainText('탄소 전환선');
    await expect(alert).toContainText('저탄소 전력 40% 이상, CO₂ 12 이하와 흑자를 2시간 유지하세요.');
    await expect(alert).toContainText('보상 8.00 💰 · 핵발전 해금');
    await expect(alert.locator('[data-toast-action="quest"]')).toHaveText('새 퀘스트 열기');
    await expect(page.locator('[data-hud-target="quest"]').first()).toHaveAttribute('data-notification', 'new');
    await alert.locator('[data-toast-action="quest"]').click();
    await expect(page.locator('#questPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('body')).not.toContainText('숨은 운영비');
  });

  test('a passed stress test opens the five-axis report before the optional quiz', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.progression.chapter = 4;
      state.progression.objectiveSetId = null;
      state.stressTest = {
        status: 'passed', phaseIndex: 5, phaseDay: 0,
        result: { passed: true, blackoutDays: 0, minimumEssentialSupply: 92, averageEssentialSupply: 98, averageNetIncome: 3, carbonRiskDays: 0, waterViolationDays: 0, batteryEnergyUsed: 10, recoveryDays: 1, maxConsecutiveBankruptcyDays: 0, finalCredits: 20 },
      };
      state.campaignComplete = true;
      state.baseline = { dev: 5, balance: -2, carbon: 8, water: 9 };
      state.simulationTotals = {
        hours: 2,
        netCredits: 4,
        transmissionEfficiency: 1.8,
        lowCarbonPercent: 150,
        employmentRate: 1.5,
        industryFill: 1.4,
        essentialOutageDays: 0,
        overcrowding: 1,
        health: 0.4,
        deliveredEnergy: 20,
        renewableDeliveredEnergy: 15,
        nuclearDeliveredEnergy: 0,
        batteryEnergyUsed: 10,
        grossIncome: 8,
        factoryIncome: 2,
        peakDemand: 10,
        peakAvailableSupply: 12,
      };
      window.__refreshGameForTest();
    });

    await openQuestPanel(page);
    await page.locator('#questPanelClaimBtn').click();
    await expect(page.locator('#modalCard')).toContainText('기후 생존 도시 성적표');
    await expect(page.locator('#modalCard')).toContainText('도시 운영');
    await expect(page.locator('#modalCard')).toContainText('전력 안정성');
    await expect(page.locator('#modalCard')).toContainText('운영 대응');
    await expect(page.locator('#finalBonusQuizBtn')).toContainText('최대 +10');
    await expect(page.locator('#validationBtn')).toHaveCount(0);
  });

  test('optional concept quiz returns to the report and only adds a separate bonus', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.progression.chapter = 4;
      state.progression.objectiveSetId = null;
      state.stressTest = {
        status: 'passed', phaseIndex: 5, phaseDay: 0,
        result: { passed: true, blackoutDays: 0, minimumEssentialSupply: 90, averageEssentialSupply: 95, averageNetIncome: 2, carbonRiskDays: 0, waterViolationDays: 0, batteryEnergyUsed: 5, recoveryDays: 2, maxConsecutiveBankruptcyDays: 0, finalCredits: 10 },
      };
      state.campaignComplete = true;
      state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
      window.__refreshGameForTest();
    });
    await openQuestPanel(page);
    await page.locator('#questPanelClaimBtn').click();
    const operatingBefore = await page.locator('.final-score-breakdown .summary-card').first().locator('strong').textContent();
    await page.locator('#finalBonusQuizBtn').click();

    for (let index = 0; index < 4; index++) {
      const correctIndex = await page.evaluate(() => window.__GAME_STATE__.quizPool[window.__GAME_STATE__.quizIndex].options.findIndex((option) => option.correct));
      await page.locator(`#questQuizOptions [data-index="${correctIndex}"]`).click();
      await page.locator('#questQuizNext').click();
    }
    await expect(page.locator('#modalCard')).toContainText('개념 퀴즈 보너스');
    await expect(page.locator('#modalCard')).toContainText('+10점');
    await page.locator('#questQuizFinish').click();
    await expect(page.locator('.final-score-breakdown')).toContainText('+10 / 10');
    expect(await page.locator('.final-score-breakdown .summary-card').first().locator('strong').textContent()).toBe(operatingBefore);
    await expect(page.locator('#finalBonusQuizBtn')).toHaveCount(0);
  });
});
