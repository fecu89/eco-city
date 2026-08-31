import { test, expect } from '../fixtures/game-test.js';

test('two data centers run independent research without pausing the city', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.questIndex = 8;
    state.stage = 5;
    state.researchMenuUnlocked = true;
    state.unlockedFacilities.add('solar');
    state.unlockedFacilities.add('wind');
    state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
    state.grid[1] = { type: 'data', level: 2, priority: 'normal' };
    state.credits = 40;
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  await expect(page.locator('.facility-console')).toBeVisible();
  await expect(page.locator('.facility-console-header')).toContainText('데이터센터');
  await expect(page.locator('.facility-console-tabs, [data-facility-tab]')).toHaveCount(0);
  await expect(page.locator('.facility-console-footer')).toBeVisible();
  await expect(page.locator('#demolishBtn')).toBeVisible();
  await expect(page.locator('#upgradeBtn')).toBeVisible();
  await expect(page.locator('.research-panel')).toContainText('데이터센터 #0 연구');
  await expect(page.locator('.facility-console-scroll')).toHaveCSS('overflow-y', 'auto');
  await expect(page.locator('.research-grid > .research-card')).toHaveCount(9);
  expect(await page.locator('.research-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
  const solarCard = page.locator('[data-research-start="solar2"]');
  await expect(solarCard.locator('svg')).toHaveCount(1);
  await expect(solarCard).toContainText('고효율 태양전지');
  await expect(solarCard).toContainText('10.00 💰 · 2분');
  await expect(solarCard).not.toContainText('120시간');
  await page.locator('[data-research-start="solar2"]').click();
  await expect(page.locator('[data-research-job="solar2"]')).toContainText('데이터센터 #0');
  await page.locator('.modal-card .close-modal').click();
  await page.evaluate(() => window.__clickCell(1));
  await expect(page.locator('.research-elsewhere')).toContainText('고효율 태양전지 (#0)');
  await page.locator('[data-research-start="wind2"]').click();

  expect(await page.evaluate(() => ({
    credits: window.__GAME_STATE__.credits,
    jobs: Object.fromEntries(Object.entries(window.__GAME_STATE__.research.jobs).map(([id, job]) => [id, job.dataCenterIndex])),
  }))).toEqual({ credits: 20, jobs: { solar2: 0, wind2: 1 } });
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).toContain('player');

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.research.jobs.wind2.elapsedEffectiveHours = 10;
    state.research.jobs.wind2.status = 'underpowered';
    state.lastTickSummary = {
      facilityPower: { 1: { ratio: 0.5 } },
      facilityEconomy: { 1: { income: 0.7 } },
    };
    window.__EVENT_BUS__.emit(window.__EVENTS__.SIMULATION_TICKED, { summary: state.lastTickSummary, power: { routes: [] } });
  });
  await expect(page.locator('[data-research-live-status]')).toContainText('전력 부족');
  await expect(page.locator('[data-research-live-hours]')).toContainText('10 / 120시간');
  await page.locator('[data-research-cancel="wind2"]').click();
  expect(await page.evaluate(() => ({ credits: window.__GAME_STATE__.credits, jobs: Object.keys(window.__GAME_STATE__.research.jobs) })))
    .toEqual({ credits: 25, jobs: ['solar2'] });
});

test('an underpowered research center is emphasized on both the city and research card until recovery', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.questIndex = 8;
    state.stage = 5;
    state.researchMenuUnlocked = true;
    state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
    state.research.jobs.solar2 = {
      id: 'solar2',
      dataCenterIndex: 0,
      elapsedEffectiveHours: 10,
      status: 'running',
      paidCost: 10,
    };
    window.__refreshGameForTest();
    window.__settleSimulationHour();
  });

  await expect(page.locator('.toast.research-power-alert')).toContainText('데이터센터 #0');
  await expect(page.locator('.toast.research-power-alert')).toContainText('연구가 일시정지');
  expect(await page.evaluate(() => window.__getCellVisual(0).researchWarning)).toBe(true);

  await page.evaluate(() => window.__clickCell(0));
  const active = page.locator('[data-research-job="solar2"]');
  await expect(active).toHaveClass(/underpowered/);
  await expect(active.locator('[data-research-live-status]')).toContainText('전력 부족 · 연구 일시정지');

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.grid[1] = { type: 'thermal', level: 1, priority: 'normal' };
    window.__settleSimulationHour();
  });
  await expect(active).not.toHaveClass(/underpowered/);
  expect(await page.evaluate(() => window.__getCellVisual(0).researchWarning)).toBe(false);
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
]) test(`${viewport.name} level-two data center previews and confirms an operation mode`, async ({ gamePage: page }) => {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.grid[0] = { type: 'data', level: 2, priority: 'normal', operationMode: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  const focused = page.locator('[data-operation-mode="research"]');
  await expect(focused).toBeVisible();
  await focused.click();
  await expect(page.locator('#modeChangeForecast')).toContainText('9.9 → 14.9 E/h');
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0].operationMode)).toBe('normal');
  await page.locator('#confirmOperationMode').click();
  expect(await page.evaluate(() => ({
    mode: window.__GAME_STATE__.grid[0].operationMode,
    decisions: window.__GAME_STATE__.decisionCounts.modeChanges,
  }))).toEqual({ mode: 'research', decisions: 1 });
});

test('research acceleration opens its assigned four-question quiz and affects only that job', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.questIndex = 8;
    state.stage = 5;
    state.researchMenuUnlocked = true;
    state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
    state.grid[1] = { type: 'data', level: 1, priority: 'normal' };
    state.research.jobs.solar2 = { id: 'solar2', dataCenterIndex: 0, elapsedEffectiveHours: 0, status: 'running', paidCost: 10 };
    state.research.jobs.wind2 = { id: 'wind2', dataCenterIndex: 1, elapsedEffectiveHours: 0, status: 'running', paidCost: 10 };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  await expect(page.locator('[data-research-accelerate="solar2"]')).toHaveText('퀴즈로 가속');
  await page.locator('[data-research-accelerate="solar2"]').click();
  await expect(page.locator('#modalCard')).toContainText('고효율 태양전지');
  await expect(page.locator('.quiz-count')).toContainText('1 / 4');
  expect(await page.evaluate(() => window.__GAME_STATE__.quizResearchId)).toBe('solar2');

  const correctIndex = await page.evaluate(() => window.__GAME_STATE__.quizPool[0].options.findIndex((option) => option.correct));
  await page.locator(`#questQuizOptions [data-index="${correctIndex}"]`).click();
  expect(await page.evaluate(() => ({
    solar: window.__GAME_STATE__.research.jobs.solar2.elapsedEffectiveHours,
    wind: window.__GAME_STATE__.research.jobs.wind2.elapsedEffectiveHours,
  }))).toEqual({ solar: 30, wind: 0 });
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
]) test(`${viewport.name} research catalog stays three columns`, async ({ gamePage: page }) => {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    window.__setTimeScale(0);
    state.questIndex = 8;
    state.stage = 5;
    state.researchMenuUnlocked = true;
    state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
    state.credits = 100;
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  await expect(page.locator('.research-grid > .research-card')).toHaveCount(9);
  expect(await page.locator('.research-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
  const gridBox = await page.locator('.research-grid').boundingBox();
  const modalBox = await page.locator('#modalCard').boundingBox();
  expect(gridBox.x).toBeGreaterThanOrEqual(modalBox.x);
  expect(gridBox.x + gridBox.width).toBeLessThanOrEqual(modalBox.x + modalBox.width);
});

test('locked research explains its exact prerequisite on hover and touch', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    window.__setTimeScale(0);
    state.questIndex = 5;
    state.stage = 5;
    state.researchMenuUnlocked = true;
    state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
    state.credits = 100;
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  const solar = page.locator('[data-research-id="solar2"]');
  await expect(solar).toHaveAttribute('aria-disabled', 'true');
  await solar.hover();
  await expect(solar.locator('.research-lock-tip')).toBeVisible();
  await expect(solar.locator('.research-lock-tip')).toContainText('태양광 해금 필요');
  // aria-disabled는 카드가 연구 실행 대상이 아님을 전달하지만, 터치 안내는 그대로 받아야 한다.
  await solar.click({ force: true });
  await expect(page.locator('.toast', { hasText: '태양광 해금 필요' })).toBeVisible();
});

test('battery reserve policy is visible, locked by research, and persisted from the facility console', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    window.__setTimeScale(0);
    state.grid[0] = { type: 'battery', level: 2, batteryPolicy: 'auto' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  await expect(page.locator('#batteryPolicyControls')).toBeVisible();
  await expect(page.locator('[data-battery-policy="reserve30"]')).toBeDisabled();
  await expect(page.locator('[data-battery-policy="reserve30"]')).toHaveAttribute('title', /차세대 저장 화학/);
  await page.evaluate(() => {
    window.__GAME_STATE__.research.completedIds.add('battery2');
    window.__clickCell(0);
  });
  await page.locator('[data-battery-policy="reserve30"]').click();
  expect(await page.evaluate(() => ({
    policy: window.__GAME_STATE__.grid[0].batteryPolicy,
    decisions: window.__GAME_STATE__.decisionCounts.batteryPolicyChanges,
  }))).toEqual({ policy: 'reserve30', decisions: 1 });
});
