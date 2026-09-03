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

  // 핀치·드래그로 시점이 흐트러진 뒤 돌아올 길이 없었다. 상시 버튼 대신 기본 시점을
  // 벗어났을 때만 작은 칩이 나타나고, 빈 바닥을 더블클릭/더블탭해도 돌아온다.
  test('a recenter chip appears only after the camera leaves its default pose and restores it', async ({ gamePage: page }) => {
    const chip = page.locator('#cityRecenterBtn');
    const initial = await page.evaluate(() => window.__getCityCameraState());
    expect(initial.atDefault).toBe(true);
    await expect(chip).toBeHidden();

    await page.evaluate(() => window.__setCityCameraOrbitForTest(0.9, 1.1));
    await expect(chip).toBeVisible();
    expect(await page.evaluate(() => window.__getCityCameraState().atDefault)).toBe(false);

    await chip.click();
    await page.waitForTimeout(120);
    const reset = await page.evaluate(() => window.__getCityCameraState());
    expect(reset.position).toEqual(initial.position);
    expect(reset.target).toEqual(initial.target);
    expect(reset.atDefault).toBe(true);
    await expect(chip).toBeHidden();
  });

  test('double-clicking empty ground recenters the camera without touching the city', async ({ gamePage: page }) => {
    const initial = await page.evaluate(() => window.__getCityCameraState());
    const box = await page.locator('.city-scene-3d-canvas').boundingBox();
    await page.evaluate(() => window.__setCityCameraOrbitForTest(0.9, 1.1));
    expect(await page.evaluate(() => window.__getCityCameraState().atDefault)).toBe(false);

    // 왼쪽 가장자리는 보드 칸이 아닌 바다/해안이다.
    await page.mouse.dblclick(box.x + 24, box.y + box.height * 0.5);
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => window.__getCityCameraState());
    expect(after.atDefault).toBe(true);
    expect(after.target).toEqual(initial.target);
    expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
    expect(await page.evaluate(() => window.__GAME_STATE__.selectedCell)).toBeNull();
  });
});
