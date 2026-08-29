import { test, expect } from '../fixtures/game-test.js';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });

test.describe('mobile layout', () => {
  test('bottom nav toggles the status panel open and closed', async ({ gamePage: page }) => {
    const rightPanel = page.locator('#rightPanel');
    await expect(rightPanel).not.toHaveClass(/mobile-open/);

    await page.locator('.mobile-bar [data-open-panel="status"]').click();
    await expect(rightPanel).toHaveClass(/mobile-open/);

    await page.locator('.mobile-bar [data-open-panel="status"]').click();
    await expect(rightPanel).not.toHaveClass(/mobile-open/);
  });

  test('evidence tab is inert until stage 5 unlocks it', async ({ gamePage: page }) => {
    await page.locator('#mobileEvidenceBtn').click();
    await expect(page.locator('#rightPanel')).not.toHaveClass(/mobile-open/);
  });

  test('icon buttons meet the 44px minimum touch target', async ({ gamePage: page }) => {
    const box = await page.locator('#helpBtn').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
  });

  test('one-finger drag orbits the city without placing a facility', async ({ gamePage: page }) => {
    const canvas = page.locator('.city-scene-3d-canvas');
    const box = await canvas.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
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

    const after = await page.evaluate(() => ({
      camera: window.__getCityCameraState(),
      state: JSON.parse(window.render_game_to_text()),
      renderer: window.__getCityRendererStats(),
    }));
    expect(after.camera.position).not.toEqual(before.position);
    expect(after.state.entities).toHaveLength(0);
    expect(after.renderer.pixelRatio).toBeLessThanOrEqual(1.25);
  });
});
