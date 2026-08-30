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

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 780 },
]) test(`${viewport.name} selects a candidate, previews city impact, and builds only after confirmation`, async ({ gamePage: page }) => {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));

  await expect(page.locator('#buildConfirm')).toBeVisible();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(0);
  await expect(page.locator('#buildConfirmMetrics [data-metric]')).toHaveCount(4);
  await expect(page.locator('#buildConfirmMetrics [data-metric]').evaluateAll((nodes) => nodes.map((node) => node.dataset.metric)))
    .resolves.toEqual(['credit', 'power', 'carbon', 'water']);
  await expect(page.locator('#buildConfirmMetrics [data-metric="credit"]')).toContainText('/h');
  await expect(page.locator('#buildConfirmMetrics [data-metric="carbon"]')).toContainText('CO₂');
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  await expect(page.locator('#buildConfirm')).toBeHidden();
});
