import { test, expect } from '../fixtures/game-test.js';

test.describe('3D city camera', () => {
  test('mouse orbit changes the camera without placing a facility', async ({ gamePage: page }) => {
    const canvas = page.locator('.city-scene-3d-canvas');
    const box = await canvas.boundingBox();
    const before = await page.evaluate(() => window.__getCityCameraState());

    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.5, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(350);

    const after = await page.evaluate(() => window.__getCityCameraState());
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    expect(after.position).not.toEqual(before.position);
    expect(state.entities).toEqual([]);
  });

  test('camera reset restores the configured isometric pose', async ({ gamePage: page }) => {
    const initial = await page.evaluate(() => window.__getCityCameraState());
    const box = await page.locator('.city-scene-3d-canvas').boundingBox();

    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__resetCityCamera());
    await page.waitForTimeout(100);

    const reset = await page.evaluate(() => window.__getCityCameraState());
    expect(reset.position).toEqual(initial.position);
    expect(reset.target).toEqual(initial.target);
  });

  test('reset-view control meets the minimum pointer target', async ({ gamePage: page }) => {
    const box = await page.locator('.city-camera-reset').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
