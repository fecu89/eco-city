import { test, expect } from '../fixtures/game-test.js';
import { openHudPanel } from '../helpers/playthrough.js';

test.describe('3D city motion language', () => {
  test('placing a facility starts and completes a bounded entrance motion', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    await page.evaluate(() => window.__clickCell(0));
    const during = await page.evaluate(() => {
      document.getElementById('confirmBuildBtn').click();
      return window.__getCityRendererStats();
    });
    expect(during.activeMotions).toBe(1);
    expect(during.motionKinds).toContain('place');

    // 병렬 WebGL 테스트의 CPU 경합을 허용하되 실제 모션 길이(480ms)는 별도 상수 테스트로 고정한다.
    await page.waitForFunction(() => window.__getCityRendererStats().activeMotions === 0, null, { timeout: 3000 });
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

  test('external wind base uses one pooled rotor and settles without continuous rendering', async ({ gamePage: page }) => {
    await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid[0] = { type: 'wind', level: 1 };
      state.grid[1] = { type: 'data', level: 2 };
      state.grid[2] = { type: 'cooling', level: 3 };
      window.__renderCityForTest();
    });

    await page.waitForFunction(() => window.__getCityRendererStats?.().windRotorCount === 1);
    const before = await page.evaluate(() => window.__getCityRendererStats());
    expect(before.windRotorCount).toBe(1);
    await page.waitForTimeout(350);
    const after = await page.evaluate(() => window.__getCityRendererStats());
    expect(after.renderCount - before.renderCount).toBeLessThanOrEqual(1);
  });

  test('energy producers use one shared line layer that flashes once every five seconds', async ({ gamePage: page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid[12] = { type: 'thermal', level: 1 };
      state.grid[13] = { type: 'factory', level: 1 };
      state.grid[17] = { type: 'residential', level: 1 };
      window.__renderCityForTest();
      window.__EVENT_BUS__.emit(window.__EVENTS__.SIMULATION_TICKED, {
        power: { routes: [{ kind: 'direct', from: 12, via: null, to: 17, delivered: 2, efficiency: 0.94 }] },
        summary: { hour: 12 },
      });
    });

    await page.waitForFunction(() => {
      const stats = window.__getCityRendererStats?.();
      return stats?.energyLinkCount === 1;
    });
    const before = await page.evaluate(() => window.__getCityRendererStats());
    expect(before.energyPacketCount).toBe(0);
    await page.waitForFunction(
      (blinkCount) => window.__getCityRendererStats?.().energyBlinkCount > blinkCount,
      before.energyBlinkCount,
      { timeout: 6500 },
    );
    const after = await page.evaluate(() => window.__getCityRendererStats());
    expect(pageErrors).toEqual([]);
    expect(after.energyBlinkCount).toBe(before.energyBlinkCount + 1);
  });

  test('residential agents stay static while the shared green bird pool stays hidden', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid[12] = { type: 'residential', level: 1 };
      state.grid[13] = { type: 'green', level: 1 };
      window.__renderCityForTest();
    });

    await page.waitForFunction(() => {
      const stats = window.__getCityRendererStats?.();
      return stats?.residentAgentCount === 2 && stats.ambientInstances >= 5;
    });
    const stats = await page.evaluate(() => window.__getCityRendererStats());
    expect(stats.birdCount).toBe(0);
    expect(stats.birdPoolSize).toBe(3);
    expect(stats.ambientInstances).toBeGreaterThanOrEqual(5);
  });

  test('fixed graphics phase changes update lighting without allocating scene resources', async ({ gamePage: page }) => {
    const before = await page.evaluate(() => window.__getCityRendererStats());
    await page.evaluate(() => window.__setWorldHourForTest(17));
    await page.waitForFunction(() => window.__getCityRendererStats().worldPhase === 'dusk');
    const dusk = await page.evaluate(() => window.__getCityRendererStats());
    expect(dusk.resourceRevision).toBe(before.resourceRevision);
    expect(dusk.sunIntensity).toBeLessThan(before.sunIntensity);

    await page.evaluate(() => window.__setWorldHourForTest(23));
    await page.waitForFunction(() => window.__getCityRendererStats().worldPhase === 'night');
    const night = await page.evaluate(() => window.__getCityRendererStats());
    expect(night.resourceRevision).toBe(before.resourceRevision);
    expect(night.sunIntensity).toBeLessThan(dusk.sunIntensity);
  });
});
