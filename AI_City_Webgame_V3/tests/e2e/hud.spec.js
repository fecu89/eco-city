import { test, expect } from '../fixtures/game-test.js';

test.describe('fullscreen world HUD', () => {
  test('opens one HUD panel at a time and restores focus on Escape', async ({ gamePage: page }) => {
    const build = page.locator('[data-hud-target="build"]').first();
    await build.click();
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(build).toHaveAttribute('aria-expanded', 'true');

    const advisor = page.locator('[data-hud-target="advisor"]').first();
    await advisor.click();
    await expect(page.locator('#buildPanel')).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#advisorPanel')).toHaveClass(/hud-panel-active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
    await expect(advisor).toBeFocused();
  });

  test('a stage modal closes and disables the world HUD', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="menu"]').first().click();
    await page.locator('#helpBtn').click();

    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
    await expect(page.locator('#hudControls')).toHaveAttribute('aria-hidden', 'true');
  });

  test('city canvas fills the viewport while dashboard content stays hidden', async ({ gamePage: page }) => {
    const viewport = page.viewportSize();
    const canvas = await page.locator('.city-scene-3d-canvas').boundingBox();

    expect(canvas.width).toBeGreaterThanOrEqual(viewport.width * 0.95);
    expect(canvas.height).toBeGreaterThanOrEqual(viewport.height * 0.95);
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
  });

  test('menu owns all former top and main actions', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="menu"]').first().click();
    const menu = page.locator('#menuPanel');

    for (const id of ['helpBtn', 'musicBtn', 'soundBtn', 'resetBtn']) {
      await expect(menu.locator(`#${id}`)).toHaveCount(1);
    }
    await expect(menu.locator('#advanceBtn')).toHaveCount(0);
    await expect(menu.locator('#aiAdviceBtn')).toHaveCount(0);
    await expect(page.locator('#advisorPanel #promptChips')).toHaveCount(1);
  });

  test('build palette stays open after selecting a facility', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('#facilityDock .facility-btn', { hasText: '공장' }).click();

    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#selectedFacilitySummary')).toContainText('공장');
  });

  test('facility buttons disable when the remaining credits cannot cover their cost', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => {
      window.__GAME_STATE__.credits = 3;
      window.__GAME_STATE__.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await page.locator('#facilityDock .facility-btn', { hasText: '주거지' }).click();

    await expect(page.locator('#facilityDock .facility-btn', { hasText: '주거지' })).toBeEnabled();
    const factory = page.locator('#facilityDock .facility-btn', { hasText: '공장' });
    await expect(factory).toBeDisabled();
    await expect(factory).toHaveAttribute('title', /1C 부족/);
  });

  test('closing the build palette clears placement benefit and conflict markers', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[5] = { type: 'thermal', level: 1 };
      window.__GAME_STATE__.unlockedFacilities.add('factory');
      window.__renderCityForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('#facilityDock .facility-btn', { hasText: '공장' }).click();
    await page.waitForFunction(() => window.__getCellVisual(0)?.previewGood === true);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const cell = window.__getCellVisual(0);
      return cell?.previewGood === false && cell?.previewBad === false;
    });
  });

  test('city status opens as a nonblocking floating instrument', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="status"]').first().click();

    await expect(page.locator('#statusPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#cityChart')).toBeVisible();
    await expect(page.locator('#statusPanel')).toHaveCSS('pointer-events', 'auto');
  });

  test('achievement drawer contains achievements only', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="achievements"]').first().click();
    await expect(page.locator('#badgePanel')).toBeVisible();
    await expect(page.locator('[data-achievement-tab]')).toHaveCount(0);
    await expect(page.locator('#evidenceBox')).toHaveCount(0);
  });

  test('empty land builds only while the build panel is open', async ({ gamePage: page }) => {
    await page.evaluate(() => window.__clickCell(0));
    expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entities)).toHaveLength(0);
    await expect(page.locator('.toast', { hasText: '건설 메뉴' })).toContainText('건설 메뉴');

    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => window.__clickCell(0));
    expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entities)).toHaveLength(1);
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
  });

  test('facility inspection restores an active build panel after the modal closes', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => window.__clickCell(0));
    await page.evaluate(() => window.__clickCell(0));
    await expect(page.locator('.facility-inspector-grid')).toBeVisible();
    await page.locator('.modal-card .close-modal').click();

    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('[data-hud-target="build"]').first()).toHaveAttribute('aria-expanded', 'true');
  });

  test('meeting the quest condition raises one persistent quest cue', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    for (let index = 0; index < 2; index++) {
      await page.evaluate((cell) => window.__clickCell(cell), index);
    }

    await expect(page.locator('.toast', { hasText: '퀘스트 완료 조건 달성' })).toHaveCount(1);
    await expect(page.locator('#questTracker')).toHaveClass(/quest-ready/);
    await expect(page.locator('[data-hud-target="menu"]').first()).toHaveAttribute('data-notification', 'ready');

    await page.evaluate(() => window.__refreshGameForTest());
    await page.waitForTimeout(150);
    await expect(page.locator('.toast', { hasText: '퀘스트 완료 조건 달성' })).toHaveCount(1);
  });

  test('each unlocked achievement raises a celebration and a persistent achievement cue', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    for (let index = 0; index < 5; index++) {
      await page.evaluate((cell) => window.__clickCell(cell), index);
    }

    const celebration = page.locator('#achievementCelebration');
    await expect(celebration).toHaveClass(/show/);
    await expect(celebration).toContainText('첫 도시');
    await expect(page.locator('.toast.priority', { hasText: '성취 해금' })).toContainText('첫 도시');

    const achievementTrigger = page.locator('[data-hud-target="achievements"]').first();
    await expect(achievementTrigger).toHaveAttribute('data-notification', 'achievement');
    await achievementTrigger.click();
    await expect(achievementTrigger).not.toHaveAttribute('data-notification', 'achievement');
  });

  test('theme control switches CSS and 3D palettes and persists the choice', async ({ gamePage: page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('[data-hud-target="menu"]').first().click();
    await page.locator('#themeBtn').click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('ai-city-theme'))).toBe('light');
    const rendererStats = await page.evaluate(() => window.__getCityRendererStats());
    expect(rendererStats.theme).toBe('light');
    expect(rendererStats.firstTileColor).toBe(0x91b5c2);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GAME_STATE__ && window.__getCityRendererStats?.().theme === 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
