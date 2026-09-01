import { test, expect } from '../fixtures/game-test.js';
import { buildStarterCity, clickCell } from '../helpers/playthrough.js';

const FACILITY_TYPES = [
  'residential', 'factory', 'data', 'thermal', 'nuclear',
  'solar', 'wind', 'battery', 'cooling', 'green',
];

async function renderMixedLevels(page, radius = 2) {
  await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
  await page.evaluate(({ types, boardRadius }) => {
    const state = window.__GAME_STATE__;
    state.boardRadius = boardRadius;
    state.selectedFacility = null;
    const cellCount = boardRadius === 3 ? 37 : 19;
    state.grid = Array.from({ length: cellCount }, (_, index) => (
      index < 15 ? { type: types[index % types.length], level: (index % 3) + 1 } : null
    ));
    window.__renderCityForTest();
  }, { types: FACILITY_TYPES, boardRadius: radius });
  await page.waitForTimeout(180);
}

// WebGL 장면은 GPU/소프트웨어 렌더러별 안티앨리어싱 차이를 고려해 허용 오차를 둔다.
test.describe('visual', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.evaluate(() => window.__setTimeScale(0));
  });
  test('fullscreen city default HUD', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await expect(page).toHaveScreenshot('world-hud-default.png', { maxDiffPixels: 18000 });
  });

  test('light theme keeps the living city and HUD readable', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.locator('[data-hud-target="settings"]').first().click();
    await page.locator('#themeBtn').click();
    await page.locator('#settingsPanel [data-hud-close]').click();
    await page.waitForFunction(() => window.__getCityRendererStats?.().theme === 'light');
    await expect(page).toHaveScreenshot('world-light-living-city.png', { maxDiffPixels: 18000 });
  });

  test('daylight sky uses a clean blue gradient without a celestial object', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.evaluate(() => window.__setWorldHourForTest(12));
    await expect(page.locator('#cityGrid')).toHaveScreenshot('world-sky-day.png', { maxDiffPixels: 12000 });
  });

  test('dusk sky warms gradually without hiding the city', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.evaluate(() => window.__setWorldHourForTest(17));
    await expect(page.locator('#cityGrid')).toHaveScreenshot('world-sky-dusk.png', { maxDiffPixels: 12000 });
  });

  test('night keeps readable building lights without a celestial object', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.evaluate(() => window.__setWorldHourForTest(23));
    await expect(page.locator('#cityGrid')).toHaveScreenshot('world-sky-night.png', { maxDiffPixels: 12000 });
  });

  test('floating build palette', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.locator('[data-hud-target="build"]').first().click();
    await expect(page).toHaveScreenshot('world-hud-build.png', { maxDiffPixels: 18000 });
  });

  test('status instrument and command menu', async ({ gamePage: page }) => {
    await buildStarterCity(page);
    await renderMixedLevels(page);
    await page.locator('[data-hud-target="status"]').first().click();
    await expect(page).toHaveScreenshot('world-hud-status.png', { maxDiffPixels: 18000 });

    await page.locator('[data-hud-target="settings"]').first().click();
    await expect(page).toHaveScreenshot('world-hud-menu.png', { maxDiffPixels: 18000 });
  });

  test('data center keeps research and management actions in one scrollable console', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 15;
      state.credits = 100;
      state.researchMenuUnlocked = true;
      state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
      state.grid[1] = { type: 'thermal', level: 1, priority: 'normal' };
      window.__refreshGameForTest();
      window.__clickCell(0);
    });
    await expect(page.locator('.research-panel')).toBeVisible();
    await expect(page.locator('.facility-console-scroll')).toBeVisible();
    await expect(page).toHaveScreenshot('facility-console-research.png', { maxDiffPixels: 18000 });
  });

  test('quest completion owns a clear celebration layer', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    for (let index = 0; index < 2; index++) {
      await clickCell(page, index);
    }
    await page.evaluate(() => {
      for (let day = 0; day < 5; day += 1) window.__settleSimulationDay();
    });
    await page.locator('[data-hud-target="quest"]').first().click();
    await page.locator('#questPanelClaimBtn').click();
    await expect(page.locator('#questCelebration')).toHaveClass(/show/);
    await expect(page).toHaveScreenshot('quest-complete.png', { maxDiffPixels: 18000 });
  });

  test('initial board', async ({ gamePage: page }) => {
    await page.waitForTimeout(500);
    // 보드는 WebGL(Three.js)로 그려서 환경별 렌더링 차이(안티앨리어싱, GPU/소프트웨어 렌더러)가
    // DOM/CSS보다 크다 — 허용 오차를 넉넉히 둔다.
    await expect(page).toHaveScreenshot('board-initial.png', { maxDiffPixels: 20000 });
  });

  test('mixed City Kit facilities show all three level treatments', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await expect(page.locator('#cityGrid')).toHaveScreenshot('city-kit-levels.png', { maxDiffPixels: 12000 });
  });

  test('mixed city remains readable after camera orbit', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.evaluate(() => window.__setCityCameraOrbitForTest(0.82, 0.88));
    await page.waitForTimeout(120);
    await expect(page.locator('#cityGrid')).toHaveScreenshot('city-kit-rotated.png', { maxDiffPixels: 12000 });
  });

  test('diagnosis colors remain separate from facility level colors', async ({ gamePage: page }) => {
    await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
    await page.evaluate((types) => {
      const configs = Array.from({ length: 19 }, (_, index) => (
        index < 12
          ? {
              empty: false,
              type: types[index % types.length],
              level: (index % 3) + 1,
              diagnosisState: index % 3 === 0 ? 'problem' : index % 3 === 1 ? 'ok' : 'unknown',
            }
          : { empty: true, disabled: true }
      ));
      window.__renderCityConfigsForTest(configs, 2);
    }, FACILITY_TYPES);
    await page.waitForTimeout(180);
    await expect(page.locator('#cityGrid')).toHaveScreenshot('city-diagnosis.png', { maxDiffPixels: 12000 });
  });
});

test.describe('visual mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });
  test.beforeEach(async ({ gamePage: page }) => {
    await page.evaluate(() => window.__setTimeScale(0));
  });

  test('mobile fullscreen city default HUD', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await expect(page).toHaveScreenshot('world-hud-mobile-default.png', { maxDiffPixels: 18000 });
  });

  test('mobile build sheet', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.locator('.mobile-bar [data-hud-target="build"]').click();
    await expect(page).toHaveScreenshot('world-hud-mobile-build.png', { maxDiffPixels: 18000 });
  });

  test('mobile quest details live inside the quest sheet', async ({ gamePage: page }) => {
    await page.locator('.mobile-bar [data-hud-target="quest"]').click();
    await page.locator('#questPanelExpandBtn').click();
    await expect(page).toHaveScreenshot('world-hud-mobile-quest-expanded.png', { maxDiffPixels: 18000 });
  });

  test('mobile data center keeps the research catalog in three columns', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 15;
      state.credits = 100;
      state.researchMenuUnlocked = true;
      state.grid[0] = { type: 'data', level: 1, priority: 'normal' };
      state.grid[1] = { type: 'thermal', level: 1, priority: 'normal' };
      window.__refreshGameForTest();
      window.__clickCell(0);
    });
    await expect(page.locator('.research-grid > .research-card')).toHaveCount(9);
    await expect(page).toHaveScreenshot('facility-console-research-mobile.png', { maxDiffPixels: 18000 });
  });

  test('City Kit board fits the mobile gameplay viewport', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await expect(page.locator('.left-panel')).toHaveScreenshot('city-kit-mobile.png', { maxDiffPixels: 18000 });
  });
});
