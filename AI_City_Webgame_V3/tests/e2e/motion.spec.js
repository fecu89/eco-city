import { test, expect } from '../fixtures/game-test.js';

test.describe('3D city motion language', () => {
  test('placing a facility starts and completes a bounded entrance motion', async ({ gamePage: page }) => {
    const during = await page.evaluate(() => {
      window.__clickCell(0);
      return window.__getCityRendererStats();
    });
    expect(during.activeMotions).toBe(1);
    expect(during.motionKinds).toContain('place');

    await page.waitForFunction(() => window.__getCityRendererStats().activeMotions === 0, null, { timeout: 1200 });
  });

  test('upgrading interpolates to the next distinct level treatment', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid[0] = { type: 'residential', level: 1 };
      window.__renderCityForTest();
      state.grid[0].level = 2;
      window.__EVENT_BUS__.emit(window.__EVENTS__.BOARD_UPGRADED, { index: 0, level: 2 });
      window.__renderCityForTest();
    });

    await page.waitForFunction(() => window.__getCityRendererStats?.().motionKinds.includes('upgrade'));
    await page.waitForFunction(() => window.__getCityRendererStats().activeMotions === 0, null, { timeout: 1200 });
  });

  test('demolishing keeps the facility visible until its exit motion completes', async ({ gamePage: page }) => {
    const during = await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid[0] = { type: 'factory', level: 2 };
      window.__renderCityForTest();
      state.grid[0] = null;
      window.__EVENT_BUS__.emit(window.__EVENTS__.BOARD_DEMOLISHED, { index: 0 });
      window.__renderCityForTest();
      return window.__getCityRendererStats();
    });

    expect(during.motionKinds).toContain('demolish');
    expect(during.facilityInstances).toBe(1);
    await page.waitForFunction(() => window.__getCityRendererStats().activeMotions === 0, null, { timeout: 1200 });
    const after = await page.evaluate(() => window.__getCityRendererStats());
    expect(after.facilityInstances).toBe(0);
  });

  test('wind and infrastructure facilities use a shared semantic ambient layer', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid[0] = { type: 'wind', level: 1 };
      state.grid[1] = { type: 'data', level: 2 };
      state.grid[2] = { type: 'cooling', level: 3 };
      window.__renderCityForTest();
    });

    await page.waitForFunction(() => window.__getCityRendererStats?.().ambientInstances >= 5);
    const before = await page.evaluate(() => window.__getCityRendererStats());
    expect(before.ambientInstances).toBeGreaterThanOrEqual(5);
    await page.waitForTimeout(140);
    const after = await page.evaluate(() => window.__getCityRendererStats());
    expect(after.ambientFrame).toBeGreaterThan(before.ambientFrame);
  });
});
