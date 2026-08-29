import { test, expect } from '../fixtures/game-test.js';
import { buildStarterCity, clickHudAction } from '../helpers/playthrough.js';

const FACILITY_TYPES = [
  'residential', 'factory', 'data', 'thermal', 'nuclear',
  'solar', 'wind', 'battery', 'cooling', 'green',
];

async function renderMixedLevels(page, size = 5) {
  await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
  await page.evaluate(({ types, gridSize }) => {
    const state = window.__GAME_STATE__;
    state.gridSize = gridSize;
    state.selectedFacility = null;
    state.grid = Array.from({ length: gridSize * gridSize }, (_, index) => (
      index < 15 ? { type: types[index % types.length], level: (index % 3) + 1 } : null
    ));
    window.__renderCityForTest();
  }, { types: FACILITY_TYPES, gridSize: size });
  await page.waitForTimeout(180);
}

// WebGL 장면은 GPU/소프트웨어 렌더러별 안티앨리어싱 차이를 고려해 허용 오차를 둔다.
test.describe('visual', () => {
  test('fullscreen city default HUD', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await expect(page).toHaveScreenshot('world-hud-default.png', { maxDiffPixels: 18000 });
  });

  test('light theme keeps the living city and HUD readable', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.locator('[data-hud-target="menu"]').first().click();
    await page.locator('#themeBtn').click();
    await page.locator('#menuPanel [data-hud-close]').click();
    await page.waitForFunction(() => window.__getCityRendererStats?.().theme === 'light');
    await expect(page).toHaveScreenshot('world-light-living-city.png', { maxDiffPixels: 18000 });
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

    await page.locator('[data-hud-target="menu"]').first().click();
    await expect(page).toHaveScreenshot('world-hud-menu.png', { maxDiffPixels: 18000 });
  });

  test('achievement unlock owns a clear celebration layer', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    for (let index = 0; index < 5; index++) {
      await page.evaluate((cell) => window.__clickCell(cell), index);
    }
    await expect(page.locator('#achievementCelebration')).toHaveClass(/show/);
    await expect(page).toHaveScreenshot('achievement-unlock.png', { maxDiffPixels: 18000 });
  });

  test('initial board', async ({ gamePage: page }) => {
    await page.waitForTimeout(500);
    // 보드는 WebGL(Three.js)로 그려서 환경별 렌더링 차이(안티앨리어싱, GPU/소프트웨어 렌더러)가
    // DOM/CSS보다 크다 — 허용 오차를 넉넉히 둔다.
    await expect(page).toHaveScreenshot('board-initial.png', { maxDiffPixels: 20000 });
  });

  test('crisis modal', async ({ gamePage: page }) => {
    await buildStarterCity(page);
    await clickHudAction(page, 'menu', '#advanceBtn');
    await page.waitForTimeout(500);
    await expect(page.locator('.modal-card')).toHaveScreenshot('crisis-modal.png', { maxDiffPixels: 4000 });
  });

  test('mixed City Kit facilities show all three level treatments', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await expect(page.locator('#cityGrid')).toHaveScreenshot('city-kit-levels.png', { maxDiffPixels: 12000 });
  });

  test('mixed city remains readable after camera orbit', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    const canvas = page.locator('.city-scene-3d-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.58, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(220);
    await expect(page.locator('#cityGrid')).toHaveScreenshot('city-kit-rotated.png', { maxDiffPixels: 12000 });
  });

  test('diagnosis colors remain separate from facility level colors', async ({ gamePage: page }) => {
    await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
    await page.evaluate((types) => {
      const configs = Array.from({ length: 25 }, (_, index) => (
        index < 12
          ? {
              empty: false,
              type: types[index % types.length],
              level: (index % 3) + 1,
              diagnosisState: index % 3 === 0 ? 'problem' : index % 3 === 1 ? 'ok' : 'unknown',
            }
          : { empty: true, disabled: true }
      ));
      window.__renderCityConfigsForTest(configs, 5);
    }, FACILITY_TYPES);
    await page.waitForTimeout(180);
    await expect(page.locator('#cityGrid')).toHaveScreenshot('city-diagnosis.png', { maxDiffPixels: 12000 });
  });
});

test.describe('visual mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });

  test('mobile fullscreen city default HUD', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await expect(page).toHaveScreenshot('world-hud-mobile-default.png', { maxDiffPixels: 18000 });
  });

  test('mobile build sheet', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await page.locator('.mobile-bar [data-hud-target="build"]').click();
    await expect(page).toHaveScreenshot('world-hud-mobile-build.png', { maxDiffPixels: 18000 });
  });

  test('City Kit board fits the mobile gameplay viewport', async ({ gamePage: page }) => {
    await renderMixedLevels(page);
    await expect(page.locator('.left-panel')).toHaveScreenshot('city-kit-mobile.png', { maxDiffPixels: 18000 });
  });
});
