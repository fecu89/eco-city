import { test, expect } from '../fixtures/game-test.js';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });

async function orbitWithOneFinger(page) {
  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  const start = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  const client = await page.context().newCDPSession(page);
  const before = await page.evaluate(() => window.__getCityCameraState());

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: start.x, y: start.y, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: start.x + 72, y: start.y + 18, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(180);

  return { before, box };
}

test.describe('mobile city controls', () => {
  test('mobile top bar keeps all five icon metrics in a compact matching order', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__setTimeScale(0);
      window.__GAME_STATE__.lastSettlementDelta = -0.15;
      window.__GAME_STATE__.lastTickSummary = { hourlyCarbon: 4.2, hourlyWater: 1.8, deliveredPower: 7, demand: 6, lowCarbonPercent: 70, workforce: 5, jobs: 4 };
      window.__refreshGameForTest();
    });

    await expect(page.locator('#simNet')).toHaveText('-0.15/h');
    await expect(page.locator('#simCarbonRate')).toHaveText('4.2/h');
    await expect(page.locator('#simCarbonRate')).toBeVisible();
    await expect(page.locator('#simWater')).toHaveText('1.8/h');
    await expect(page.locator('#simLabor')).toHaveText('5/4');
    const box = await page.locator('#simulationHud').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  test('bottom bar exposes four touch targets and opens one bounded sheet', async ({ gamePage: page }) => {
    const buttons = page.locator('.mobile-bar [data-hud-target]');
    await expect(buttons).toHaveCount(4);

    for (let index = 0; index < 4; index++) {
      const box = await buttons.nth(index).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await buttons.filter({ hasText: '건설' }).click();
    const buildSheet = page.locator('#buildPanel');
    await expect(buildSheet).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#questTracker')).toHaveCount(0);
    const sheetBox = await buildSheet.boundingBox();
    expect(sheetBox.x).toBeLessThanOrEqual(5);
    expect(sheetBox.width).toBeGreaterThanOrEqual(380);
    expect(sheetBox.height).toBeLessThanOrEqual(844 * 0.56 + 1);
    expect((await buildSheet.locator('.facility-btn').first().boundingBox()).height).toBeLessThanOrEqual(100);

    await buttons.filter({ hasText: '퀘스트' }).click();
    await expect(buildSheet).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#questPanel')).toHaveClass(/hud-panel-active/);
  });

  test('mobile build cards repeat only identity and cost while one shared area explains the selection', async ({ gamePage: page }) => {
    await page.locator('.mobile-bar [data-hud-target="build"]').click();
    const firstCard = page.locator('#facilityDock .facility-btn').first();

    await expect(firstCard.locator('.facility-card-details')).toHaveCount(0);
    await expect(firstCard.locator('.facility-card-main')).toContainText('주거지');
    await expect(firstCard.locator('.cost')).toBeVisible();
    await expect(page.locator('#facilityDetail')).toBeVisible();
    await expect(page.locator('#facilityDetail')).toContainText('주거지');
    await expect(page.locator('#facilityDetail')).toContainText('인구');
  });

  test('mobile keeps quest content out of the city and shows the current quest inside its menu', async ({ gamePage: page }) => {
    await expect(page.locator('#questTracker')).toHaveCount(0);
    await page.locator('.mobile-bar [data-hud-target="quest"]').click();

    const panel = page.locator('#questPanel');
    await expect(panel).toHaveClass(/hud-panel-active/);
    await expect(panel.locator('#questPanelLevel')).toHaveText('LEVEL 1 / 15');
    await expect(panel.locator('#questPanelTitle')).toHaveText('2040, 첫 시민');
    await expect(panel.locator('#questPanelGoal')).toContainText('주거지 2개');
    await expect(panel.locator('#questPanelClaimBtn')).toBeVisible();
    await expect(panel.locator('#questPanelDragHandle')).toHaveCount(0);
    await expect(panel.locator('#questPanelPinBtn')).toHaveCount(1);
    await expect(panel.locator('#questPanelPinBtn')).toBeHidden();
  });

  test('mobile claims a ready quest from the quest menu instead of the hidden tracker', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
      window.__GAME_STATE__.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
      window.__refreshGameForTest();
    });
    await page.locator('.mobile-bar [data-hud-target="quest"]').click();
    await expect(page.locator('#questPanelClaimBtn')).toBeEnabled();
    await page.locator('#questPanelClaimBtn').click();

    await expect(page.locator('#modalCard')).toContainText('2040, 첫 시민 완료');
    await expect(page.locator('#questCelebration')).toHaveClass(/show/);
  });

  test('closing a mobile sheet restores touch orbit to the city', async ({ gamePage: page }) => {
    await page.locator('.mobile-bar [data-hud-target="settings"]').click();
    await page.locator('#settingsPanel [data-hud-close]').click();
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);

    const { before, box } = await orbitWithOneFinger(page);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);

    const after = await page.evaluate(() => ({
      camera: window.__getCityCameraState(),
      state: JSON.parse(window.render_game_to_text()),
      renderer: window.__getCityRendererStats(),
      hud: window.__getWorldHudState(),
    }));
    expect(after.camera.position).not.toEqual(before.position);
    expect(after.state.entities).toHaveLength(0);
    expect(after.renderer.pixelRatio).toBeLessThanOrEqual(1.25);
    expect(after.hud.mobile).toBe(true);
  });
});
