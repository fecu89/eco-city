import { test, expect } from '../fixtures/game-test.js';

async function openBuild(page) {
  const mobile = await page.evaluate(() => matchMedia('(max-width: 760px)').matches);
  await page.locator(mobile ? '.mobile-bar [data-hud-target="build"]' : '.hud-rail [data-hud-target="build"]').click();
  await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
}

test('desktop hover uses one reusable translucent facility ghost and clears it with the build panel', async ({ gamePage: page }) => {
  await openBuild(page);
  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().ghostVisible)).toBe(true);
  expect(await page.evaluate(() => window.__getCityRendererStats().ghostCount)).toBe(1);

  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().ghostVisible)).toBe(false);
});

test('mobile first tap selects a candidate and the explicit build button confirms it', async ({ gamePage: page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openBuild(page);
  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('#buildConfirm')).toBeVisible();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(0);
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  await expect(page.locator('#buildConfirm')).toBeHidden();
});
