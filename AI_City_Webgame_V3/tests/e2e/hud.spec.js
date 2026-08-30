import { test, expect } from '../fixtures/game-test.js';
import { clickCell } from '../helpers/playthrough.js';

test.describe('fullscreen world HUD', () => {
  test('top HUD uses the same compact credit, power, carbon, water, labor order as facility detail', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.credits = 12.5;
      state.lastSettlementDelta = 0.25;
      state.lastTickSummary = {
        hourlyCarbon: 3.4,
        deliveredPower: 6,
        demand: 5,
        lowCarbonPercent: 80,
        hourlyWater: 2.5,
        workforce: 8,
        jobs: 6,
      };
      window.__refreshGameForTest();
    });

    await expect(page.locator('#credits')).toHaveText('12.50');
    await expect(page.locator('#simNet')).toHaveText('+0.25/h');
    await expect(page.locator('#simCarbonRate')).toHaveText('3.4/h');
    await expect(page.locator('#simWater')).toHaveText('2.5/h');
    await expect(page.locator('#simLabor')).toHaveText('8/6');
    await expect(page.locator('#simCarbonRate')).toBeVisible();
    await expect(page.locator('#simulationHud .sim-metric-icon')).toHaveCount(5);
    await expect(page.locator('#simulationHud [data-metric]').evaluateAll((nodes) => nodes.map((node) => node.dataset.metric)))
      .resolves.toEqual(['credit', 'power', 'carbon', 'water', 'labor']);
  });

  test('time navigation has one play-pause toggle and one 1x-4x speed toggle', async ({ gamePage: page }) => {
    const controls = page.locator('#timeControls');
    await expect(controls.locator('button')).toHaveCount(2);
    const playPause = controls.locator('#toggleTimeBtn');
    const speed = controls.locator('#fastForwardBtn');
    await expect(playPause).toHaveAttribute('aria-label', '일시정지');
    await expect(playPause.locator('svg')).toHaveCount(1);
    await expect(speed).toHaveText('4×');

    await playPause.click();
    expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(0);
    await expect(playPause).toHaveAttribute('aria-label', '재생');
    await expect(playPause.locator('svg')).toHaveCount(1);
    await playPause.click();
    expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(1);

    await speed.click();
    expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(4);
    await expect(speed).toHaveClass(/active/);
    await speed.click();
    expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(1);
  });

  test('opens one HUD panel at a time and restores focus on Escape', async ({ gamePage: page }) => {
    const build = page.locator('[data-hud-target="build"]').first();
    await build.click();
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(build).toHaveAttribute('aria-expanded', 'true');

    const quest = page.locator('[data-hud-target="quest"]').first();
    await quest.click();
    await expect(page.locator('#buildPanel')).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#questPanel')).toHaveClass(/hud-panel-active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
    await expect(quest).toBeFocused();
  });

  test('a stage modal closes and disables the world HUD', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
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

  test('settings owns all former top actions and no AI panel remains', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
    const menu = page.locator('#settingsPanel');

    for (const id of ['helpBtn', 'musicBtn', 'soundBtn', 'resetBtn']) {
      await expect(menu.locator(`#${id}`)).toHaveCount(1);
    }
    await expect(menu.locator('#advanceBtn')).toHaveCount(0);
    await expect(menu.locator('#aiAdviceBtn')).toHaveCount(0);
    await expect(page.locator('#advisorPanel')).toHaveCount(0);
  });

  test('build palette stays open after selecting a facility', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('#facilityDock .facility-btn', { hasText: '공장' }).click();

    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#facilityDock .facility-btn', { hasText: '공장' })).toHaveClass(/active/);
  });

  test('desktop build palette uses compact cards and one readable shared detail area', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    const panel = page.locator('#buildPanel');
    await expect(panel.locator('.panel-title, #selectedFacilitySummary')).toHaveCount(0);
    await expect(panel).not.toContainText('시설 건설');

    const panelBox = await panel.boundingBox();
    const card = panel.locator('.facility-btn').first();
    const cardBox = await card.boundingBox();
    expect(panelBox.height).toBeLessThanOrEqual(190);
    expect(cardBox.height).toBeLessThanOrEqual(100);
    await expect(card.locator('.facility-card-main')).toHaveCSS('flex-direction', 'column');
    await expect(card.locator('.facility-card-details')).toHaveCount(0);
    const detail = panel.locator('#facilityDetail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('주거지');
    await expect(detail.locator('.facility-detail-stats [data-metric]')).toHaveCount(5);
    await expect(detail.locator('.facility-detail-stats [data-metric]').evaluateAll((nodes) => nodes.map((node) => node.dataset.metric)))
      .resolves.toEqual(['credit', 'power', 'carbon', 'water', 'labor']);
    await expect(detail.locator('[data-metric="credit"]')).toHaveAttribute('aria-label', '크레딧');
    await expect(detail.locator('[data-metric="power"]')).toHaveAttribute('aria-label', '전력');
    expect(Number.parseFloat(await card.locator('.facility-card-identity strong').evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(await detail.locator('.facility-detail-stats b').first().evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
  });

  test('facility buttons disable when the remaining credits cannot cover their cost', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => {
      window.__GAME_STATE__.credits = 3;
      window.__GAME_STATE__.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await page.locator('#facilityDock .facility-btn', { hasText: '주거지' }).click();

    await expect(page.locator('#facilityDock .facility-btn', { hasText: '주거지' })).toHaveAttribute('aria-disabled', 'false');
    const factory = page.locator('#facilityDock .facility-btn', { hasText: '공장' });
    await expect(factory).toHaveAttribute('aria-disabled', 'true');
    await expect(factory).toHaveAttribute('title', /1\.00 💰 부족/);
    await page.evaluate(() => document.querySelector('[data-facility="factory"]').click());
    await expect(page.locator('.toast', { hasText: '1.00 💰' })).toBeVisible();
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

  test('quest panel replaces the removed achievement and evidence drawers', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="quest"]').first().click();
    const panel = page.locator('#questPanel');
    await expect(panel).toBeVisible();
    await expect(panel.locator(':scope > .panel-title')).toHaveCount(0);
    const titleBox = await panel.locator('#questPanelTitle').boundingBox();
    const goalBox = await panel.locator('#questPanelGoal').boundingBox();
    expect(Math.abs(titleBox.y - goalBox.y)).toBeLessThanOrEqual(4);
    await expect(page.locator('[data-hud-target="achievements"]')).toHaveCount(0);
    await expect(page.locator('#badgePanel, #evidenceBox')).toHaveCount(0);
  });

  test('empty land builds only while the build panel is open', async ({ gamePage: page }) => {
    await page.evaluate(() => window.__clickCell(0));
    expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entities)).toHaveLength(0);
    await expect(page.locator('.toast', { hasText: '건설 메뉴' })).toContainText('건설 메뉴');

    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => window.__clickCell(0));
    expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entities)).toHaveLength(0);
    await expect(page.locator('#buildConfirm')).toBeVisible();
    await page.locator('#confirmBuildBtn').click();
    expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entities)).toHaveLength(1);
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
  });

  test('facility inspection restores an active build panel after the modal closes', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => window.__clickCell(0));
    await page.locator('#confirmBuildBtn').click();
    await page.evaluate(() => window.__clickCell(0));
    await expect(page.locator('.facility-inspector-grid')).toBeVisible();
    await page.locator('.modal-card .close-modal').click();

    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('[data-hud-target="build"]').first()).toHaveAttribute('aria-expanded', 'true');
  });

  test('upgrade condition check removes the blurred inspector and raises a visible priority cue', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'normal' };
      window.__refreshGameForTest();
      window.__clickCell(0);
    });
    await expect(page.locator('#modal')).toBeVisible();

    await page.locator('#upgradeBtn').click();

    await expect(page.locator('#modal')).toBeHidden();
    const cue = page.locator('.toast.priority', { hasText: '강화 조건 미충족' });
    await expect(cue).toBeVisible();
    await expect(cue).toContainText('퀘스트');
    const cueBox = await cue.boundingBox();
    const viewport = page.viewportSize();
    expect(Math.abs(cueBox.x + cueBox.width / 2 - viewport.width / 2)).toBeLessThan(4);
    expect(Math.abs(cueBox.y + cueBox.height / 2 - viewport.height / 2)).toBeLessThan(4);
  });

  test('a build that would make hourly credits negative asks for centered confirmation', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.credits = 30;
      state.unlockedFacilities.add('thermal');
      window.__refreshGameForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('[data-facility="thermal"]').click();
    await page.evaluate(() => window.__clickCell(0));
    await page.locator('#confirmBuildBtn').click();

    const modal = page.locator('#modalCard');
    await expect(modal).toContainText('운영 적자 경고');
    await expect(modal).toContainText('예상 순수익');
    expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toBeNull();
    const modalBox = await modal.boundingBox();
    const viewport = page.viewportSize();
    expect(Math.abs(modalBox.x + modalBox.width / 2 - viewport.width / 2)).toBeLessThan(4);
    expect(Math.abs(modalBox.y + modalBox.height / 2 - viewport.height / 2)).toBeLessThan(4);

    await page.locator('#confirmRiskyBuild').click();
    expect(await page.evaluate(() => window.__GAME_STATE__.grid[0]?.type)).toBe('thermal');
  });

  test('meeting the quest condition raises one menu notification without a persistent quest card', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    for (let index = 0; index < 2; index++) {
      await clickCell(page, index);
    }

    await expect(page.locator('.toast', { hasText: '퀘스트 완료 조건 달성' })).toHaveCount(1);
    await expect(page.locator('#questTracker')).toHaveCount(0);
    await expect(page.locator('[data-hud-target="quest"]').first()).toHaveAttribute('data-notification', 'ready');

    await page.evaluate(() => window.__refreshGameForTest());
    await page.waitForTimeout(150);
    await expect(page.locator('.toast', { hasText: '퀘스트 완료 조건 달성' })).toHaveCount(1);
  });

  test('claiming each completed quest raises the quest celebration and clears its cue', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    for (let index = 0; index < 2; index++) {
      await clickCell(page, index);
    }
    await page.locator('[data-hud-target="quest"]').first().click();
    await page.locator('#questPanelClaimBtn').click();
    const celebration = page.locator('#questCelebration');
    await expect(celebration).toHaveClass(/show/);
    await expect(celebration).toContainText('2040, 첫 시민');
    await expect(page.locator('[data-hud-target="quest"]').first()).not.toHaveAttribute('data-notification', 'ready');
  });

  test('theme control switches CSS and 3D palettes and persists the choice', async ({ gamePage: page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('[data-hud-target="settings"]').first().click();
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

  test('graphics lighting is fixed to day, dusk, or night instead of following simulation time', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
    const controls = page.locator('#worldLightingControls');
    await expect(controls.locator('button')).toHaveCount(3);
    await controls.locator('[data-world-lighting="dusk"]').click();
    expect(await page.evaluate(() => window.__getWorldLightingMode())).toBe('dusk');
    expect(await page.evaluate(() => window.__getCityRendererStats().skyHour)).toBe(17);

    await page.evaluate(() => {
      for (let hour = 0; hour < 8; hour++) window.__settleSimulationHour();
    });
    expect(await page.evaluate(() => window.__getCityRendererStats().skyHour)).toBe(17);
    expect(await page.evaluate(() => localStorage.getItem('ai-city-world-lighting'))).toBe('dusk');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__getWorldLightingMode?.() === 'dusk');
    expect(await page.evaluate(() => window.__getCityRendererStats().skyHour)).toBe(17);
  });
});
