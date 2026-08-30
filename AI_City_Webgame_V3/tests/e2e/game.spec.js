import { test, expect } from '../fixtures/game-test.js';
import { clickCell, clickHudAction, gameStateSnapshot, openHudPanel } from '../helpers/playthrough.js';

test.describe('boot and agent contract', () => {
  test('boots at level 1 and 08:00 with controllable time', async ({ gamePage: page }) => {
    const snapshot = await gameStateSnapshot(page);
    expect(snapshot).toMatchObject({ mode: 'playing', stage: 1, quest: 1, credits: 10 });
    expect(snapshot.gameTime).toMatchObject({ year: 2040, month: 1, day: 1, hour: 8, timeScale: 1 });
    expect(await page.evaluate(() => typeof window.advanceTime)).toBe('function');
    expect(await page.evaluate(() => typeof window.__settleSimulationHour)).toBe('function');
  });

  test('render_game_to_text exposes current operations without legacy progression data', async ({ gamePage: page }) => {
    await page.evaluate(() => window.__settleSimulationHour());
    const snapshot = await gameStateSnapshot(page);
    expect(snapshot.simulation).toMatchObject({ netCredits: expect.any(Number), deliveredPower: expect.any(Number), demand: expect.any(Number) });
    expect(snapshot.climateAlert).toBe('normal');
    expect(snapshot).not.toHaveProperty('evidenceCount');
    expect(snapshot.research).toHaveProperty('jobs');
    expect(snapshot.research).not.toHaveProperty('active');
    expect(snapshot.visualGameTime).toMatchObject({ year: 2040, month: 1, day: 1 });
    expect(snapshot).toHaveProperty('carbonCrisisHours');
    expect(snapshot.island).toMatchObject({ landInstances: 37, shoreInstances: 24, waterInstances: 156 });
  });

  test('boot produces no page or console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await page.waitForFunction(() => window.__GAME_STATE__, { timeout: 10000 });
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });

  test('settings icons render as SVG and removed AI controls stay absent', async ({ gamePage: page }) => {
    await openHudPanel(page, 'settings');
    await expect(page.locator('#settingsPanel .top-actions svg')).toHaveCount(6);
    await expect(page.locator('#advanceBtn')).toHaveCount(0);
    await expect(page.locator('#aiAdviceBtn')).toHaveCount(0);
  });

  test('the real center canvas click resolves to axial center index 0', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    const box = await page.locator('.board-stage canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
    await page.locator('#confirmBuildBtn').click();
    expect((await gameStateSnapshot(page)).entities[0]).toMatchObject({ index: 0, q: 0, r: 0, type: 'residential', level: 1 });
  });
});

test.describe('construction and inspection', () => {
  test('new games show every card but only residential is unlocked and placement spends its exact cost', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    await expect(page.locator('#facilityDock .facility-btn')).toHaveCount(11);
    await expect(page.locator('#facilityDock .facility-btn[aria-disabled="false"]')).toHaveCount(1);
    const before = (await gameStateSnapshot(page)).credits;
    await clickCell(page, 0);
    const after = await gameStateSnapshot(page);
    expect(after.credits).toBe(before - 2);
    expect(after.entities[0]).toMatchObject({ index: 0, type: 'residential' });
  });

  test('shared build detail exposes cost, hourly economy, power, carbon, water and labor', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    const residential = page.locator('#facilityDock .facility-btn', { hasText: '주거지' });
    await expect(residential).toContainText('-2.00 💰');
    const detail = page.locator('#facilityDetail');
    await expect(detail).toContainText('+0.50/h');
    await expect(detail).toContainText('-2E/h');
    await expect(detail).toContainText('CO₂');
    await expect(detail.locator('[data-metric="water"]')).toHaveAttribute('aria-label', '물');
    await expect(detail).toContainText('인구 +4');
  });

  test('build cards follow quest unlock order and place unlocked facilities first', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.unlockedFacilities.add('wind');
      window.__refreshGameForTest();
    });
    await openHudPanel(page, 'build');
    const order = await page.locator('#facilityDock .facility-btn').evaluateAll((cards) => cards.map((card) => card.dataset.facility));
    expect(order).toEqual(['residential', 'wind', 'thermal', 'factory', 'data', 'nuclear', 'cooling', 'solar', 'battery', 'green', 'tidal']);
  });

  test('an occupied cell opens live economics and the 50 percent demolition breakdown', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    await clickCell(page, 0);
    await page.evaluate(() => window.__settleSimulationHour());
    await clickCell(page, 0);
    await expect(page.locator('.facility-inspector-grid')).toContainText('시간당 수입');
    await expect(page.locator('#demolitionBreakdown')).toContainText('총 투자 2.00 💰');
    await expect(page.locator('#demolitionBreakdown')).toContainText('환급 1.00 💰');
  });

  test('unlocked factory placement preview marks a power-plant neighbor', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 5;
      state.grid[5] = { type: 'thermal', level: 1, priority: 'normal' };
      state.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await openHudPanel(page, 'build');
    await page.locator('#facilityDock .facility-btn', { hasText: '공장' }).click();
    await page.waitForFunction(() => window.__getCellVisual(0)?.previewGood === true);
  });
});

test.describe('quest operations, celebration, reset, and save', () => {
  test('quest 6 completes a powered adjacent data cooling loop at the water baseline', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 6;
      state.stage = 3;
      state.baseline = { hourlyWater: 5 };
      state.grid = Array(19).fill(null);
      state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
      state.grid[1] = { type: 'cooling', level: 1, priority: 'essential' };
      state.grid[2] = { type: 'nuclear', level: 1, priority: 'normal' };
      window.__refreshGameForTest();
    });
    await page.evaluate(() => {
      window.__settleSimulationHour();
      window.__settleSimulationHour();
    });
    await page.locator('[data-hud-target="quest"]').first().click();
    await expect(page.locator('#questPanelClaimBtn')).toBeEnabled();
  });

  test('claiming a quest raises the quest completion effect', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    for (let index = 0; index < 2; index++) await clickCell(page, index);
    await page.locator('[data-hud-target="quest"]').first().click();
    await page.locator('#questPanelClaimBtn').click();
    await expect(page.locator('#questCelebration')).toHaveClass(/show/);
    await expect(page.locator('#questCelebration')).toContainText('2040, 첫 시민');
  });

  test('reset returns to quest 1, 08:00, and an empty city', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    await clickCell(page, 0);
    await clickHudAction(page, 'settings', '#resetBtn');
    // 초기화 이벤트와 상태 읽기를 같은 브라우저 작업에서 수행해 1초 시뮬레이션 틱과 경합하지 않는다.
    const snapshot = await page.evaluate(() => {
      document.getElementById('confirmReset').click();
      return JSON.parse(window.render_game_to_text());
    });
    expect(snapshot).toMatchObject({ quest: 1, credits: 10, gameTime: { year: 2040, month: 1, day: 1, hour: 8 } });
    expect(snapshot.entities).toEqual([]);
  });

  test('quest and battery state survive autosave reload', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 9;
      state.grid[0] = { type: 'battery', level: 2, priority: 'normal', batteryStoredLowCarbon: 9, batteryStoredFossil: 3 };
      window.__EVENT_BUS__.emit(window.__EVENTS__.SAVE_REQUESTED, {});
    });
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GAME_STATE__?.questIndex === 9, { timeout: 10000 });
    const restored = await page.evaluate(() => window.__GAME_STATE__.grid[0]);
    expect(restored).toMatchObject({ type: 'battery', level: 2, batteryStoredLowCarbon: 9, batteryStoredFossil: 3 });
  });
});
