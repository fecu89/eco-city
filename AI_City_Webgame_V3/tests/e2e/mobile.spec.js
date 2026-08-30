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
  test('bottom bar exposes five touch targets and opens one bounded sheet', async ({ gamePage: page }) => {
    const buttons = page.locator('.mobile-bar [data-hud-target]');
    await expect(buttons).toHaveCount(5);

    for (let index = 0; index < 5; index++) {
      const box = await buttons.nth(index).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await buttons.filter({ hasText: '건설' }).click();
    const buildSheet = page.locator('#buildPanel');
    await expect(buildSheet).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#questTracker')).toBeVisible();
    const questIsTopmost = await page.locator('#questTracker').evaluate((quest) => {
      const rect = quest.getBoundingClientRect();
      const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 12);
      return quest.contains(topmost);
    });
    expect(questIsTopmost).toBe(true);
    const sheetBox = await buildSheet.boundingBox();
    expect(sheetBox.x).toBeLessThanOrEqual(5);
    expect(sheetBox.width).toBeGreaterThanOrEqual(380);
    expect(sheetBox.height).toBeLessThanOrEqual(844 * 0.56 + 1);

    await buttons.filter({ hasText: 'AI' }).click();
    await expect(buildSheet).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#advisorPanel')).toHaveClass(/hud-panel-active/);
  });

  test('closing a mobile sheet restores touch orbit to the city', async ({ gamePage: page }) => {
    await page.locator('.mobile-bar [data-hud-target="menu"]').click();
    await page.locator('#menuPanel [data-hud-close]').click();
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
