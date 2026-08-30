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

  await expect(page.locator('.research-panel')).toContainText('데이터센터 #0 연구');
  await expect(page.locator('[data-research-start="solar2"]').locator('xpath=..')).toContainText('120시간 · 1× 2분');
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
    state.grid[1] = { type: 'nuclear', level: 1, priority: 'normal' };
    window.__settleSimulationHour();
  });
  await expect(active).not.toHaveClass(/underpowered/);
  expect(await page.evaluate(() => window.__getCellVisual(0).researchWarning)).toBe(false);
});
