import { test, expect } from '../fixtures/game-test.js';
import { clickCell, clickHudAction, gameStateSnapshot, openHudPanel } from '../helpers/playthrough.js';

test.describe('boot and agent contract', () => {
  test('boots at level 1 and 08:00 with controllable time', async ({ gamePage: page }) => {
    const snapshot = await gameStateSnapshot(page);
    expect(snapshot).toMatchObject({ mode: 'playing', stage: 1, quest: 1, credits: 36 });
    expect(snapshot.gameTime).toEqual({ day: 1, hour: 8 });
    expect(await page.evaluate(() => typeof window.advanceTime)).toBe('function');
    expect(await page.evaluate(() => typeof window.__settleSimulationHour)).toBe('function');
  });

  test('render_game_to_text exposes current operations without legacy progression data', async ({ gamePage: page }) => {
    await page.evaluate(() => window.__settleSimulationHour());
    const snapshot = await gameStateSnapshot(page);
    expect(snapshot.simulation).toMatchObject({ netCredits: expect.any(Number), deliveredPower: expect.any(Number), demand: expect.any(Number) });
    expect(snapshot.climateAlert).toBe('normal');
    expect(snapshot).not.toHaveProperty('evidenceCount');
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

  test('menu icons render as SVG and the removed advance control stays absent', async ({ gamePage: page }) => {
    await openHudPanel(page, 'menu');
    await expect(page.locator('#menuPanel .top-actions svg')).toHaveCount(5);
    await expect(page.locator('#advanceBtn')).toHaveCount(0);
  });

  test('the real center canvas click resolves to grid index 12', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    const box = await page.locator('.board-stage canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
    expect((await gameStateSnapshot(page)).entities).toEqual([{ index: 12, type: 'residential', level: 1 }]);
  });
});

test.describe('construction and inspection', () => {
  test('new games show only residential and placement spends its exact cost', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    await expect(page.locator('#facilityDock .facility-btn')).toHaveCount(1);
    const before = (await gameStateSnapshot(page)).credits;
    await clickCell(page, 0);
    const after = await gameStateSnapshot(page);
    expect(after.credits).toBe(before - 2);
    expect(after.entities[0]).toMatchObject({ index: 0, type: 'residential' });
  });

  test('AI auto-build respects unlocks and records its recommendation', async ({ gamePage: page }) => {
    await clickHudAction(page, 'advisor', '#aiBlindBuildBtn');
    const result = await page.evaluate(() => ({
      cell: window.__GAME_STATE__.grid[0],
      transcript: window.__GAME_STATE__.transcripts.execution,
    }));
    expect(result.cell.type).toBe('residential');
    expect(result.transcript).toHaveLength(1);
  });

  test('an occupied cell opens live economics and the 50 percent demolition breakdown', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    await clickCell(page, 0);
    await page.evaluate(() => window.__settleSimulationHour());
    await clickCell(page, 0);
    await expect(page.locator('.facility-inspector-grid')).toContainText('시간당 수입');
    await expect(page.locator('#demolitionBreakdown')).toContainText('총 투자 2C');
    await expect(page.locator('#demolitionBreakdown')).toContainText('환급 1C');
  });

  test('unlocked factory placement preview marks a power-plant neighbor', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid[5] = { type: 'thermal', level: 1, priority: 'normal' };
      state.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await openHudPanel(page, 'build');
    await page.locator('#facilityDock .facility-btn', { hasText: '공장' }).click();
    await page.waitForFunction(() => window.__getCellVisual(0)?.previewGood === true);
  });
});

test.describe('quest diagnosis, achievements, reset, and save', () => {
  test('quest 6 scanner exposes exactly three stable risks and makes the reward ready', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 6;
      state.stage = 4;
      state.firstCitySnapshot = Array(25).fill(null);
      state.firstCitySnapshot[0] = { type: 'thermal', level: 1 };
      state.firstCitySnapshot[1] = { type: 'factory', level: 1 };
      state.firstCitySnapshot[2] = { type: 'data', level: 1 };
      state.firstCitySnapshot[3] = { type: 'residential', level: 1 };
      window.__refreshGameForTest();
    });
    for (const index of [0, 1, 2]) await clickCell(page, index);
    await expect(page.locator('#diagnosisProgress')).toContainText('3 / 3');
    await expect(page.locator('#questClaimBtn')).toBeEnabled();
  });

  test('placing five buildings still unlocks the builder achievement effect', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    for (let index = 0; index < 5; index++) await clickCell(page, index);
    expect(await page.evaluate(() => [...window.__GAME_STATE__.badges])).toContain('builder');
    await expect(page.locator('#achievementCelebration')).toHaveClass(/show/);
  });

  test('reset returns to quest 1, 08:00, and an empty city', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    await clickCell(page, 0);
    await clickHudAction(page, 'menu', '#resetBtn');
    await page.locator('#confirmReset').click();
    const snapshot = await gameStateSnapshot(page);
    expect(snapshot).toMatchObject({ quest: 1, credits: 36, gameTime: { day: 1, hour: 8 } });
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
