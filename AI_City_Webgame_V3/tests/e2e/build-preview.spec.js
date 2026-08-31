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
  await expect(page.locator('#buildConfirmMetrics [data-metric]')).toHaveCount(5);
  await expect(page.locator('#buildConfirmMetrics [data-metric]').evaluateAll((nodes) => nodes.map((node) => node.dataset.metric)))
    .resolves.toEqual(['credit', 'power', 'carbon', 'water', 'labor']);
  await expect(page.locator('#buildConfirmMetrics [data-metric="credit"]')).toContainText('/h');
  await expect(page.locator('#buildConfirmMetrics [data-metric="carbon"]')).toContainText('CO₂');
  await expect(page.locator('#buildConfirmMetrics [data-metric="labor"]')).toContainText('0/10');
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  await expect(page.locator('#buildConfirm')).toBeHidden();
});

test('mixed facilities stay uncommitted until one atomic batch confirmation', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    window.__setTimeScale(0);
    state.questIndex = 5;
    state.credits = 30;
    state.unlockedFacilities.add('factory');
    window.__refreshGameForTest();
  });
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('[data-facility="factory"]').click();
  await page.evaluate(() => window.__clickCell(1));

  await expect(page.locator('#buildConfirmText')).toContainText('계획 2개');
  await expect(page.locator('#buildPlanCost')).toHaveText('6.00 💰');
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([
    { index: 0, type: 'residential' },
    { index: 1, type: 'factory' },
  ]);
  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).constructionPlan)).toEqual([
    { index: 0, type: 'residential' },
    { index: 1, type: 'factory' },
  ]);
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(0);

  await page.locator('#confirmBuildBtn').click();
  await expect(page.locator('#modalCard')).toContainText('건설 계획 2개');
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(0);
  await page.locator('#confirmRiskyBuild').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(2);
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(24);
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
});

test('clicking a planned tile replaces its type and clicking that type again removes it', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__GAME_STATE__.questIndex = 5;
    window.__GAME_STATE__.unlockedFacilities.add('factory');
    window.__refreshGameForTest();
  });
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('[data-facility="factory"]').click();
  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([{ index: 0, type: 'factory' }]);

  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
  await expect(page.locator('#buildConfirm')).toBeHidden();
});

test('closing the build panel clears the uncommitted construction plan', async ({ gamePage: page }) => {
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toHaveLength(1);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(0);
});

test('aggregate cost disables atomic confirmation without partially building', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 5;
    state.credits = 5;
    state.unlockedFacilities.add('factory');
    window.__refreshGameForTest();
  });
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('[data-facility="factory"]').click();
  await page.evaluate(() => window.__clickCell(1));
  await expect(page.locator('#buildPlanError')).toContainText('1.00 💰');
  await expect(page.locator('#confirmBuildBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(0);
});

test('mixed plan ghosts reuse preallocated GPU layers and disappear on cancel', async ({ gamePage: page }) => {
  await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 5;
    state.credits = 30;
    state.unlockedFacilities.add('factory');
    state.unlockedFacilities.add('thermal');
    window.__refreshGameForTest();
  });
  await openBuild(page);
  const before = await page.evaluate(() => window.__getCityRendererStats());
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('[data-facility="factory"]').click();
  await page.evaluate(() => window.__clickCell(1));
  await page.locator('[data-facility="thermal"]').click();
  await page.evaluate(() => window.__clickCell(2));

  const planned = await page.evaluate(() => window.__getCityRendererStats());
  expect(planned.planGhostCount).toBe(3);
  expect(planned.planGhostTypes).toEqual(['factory', 'residential', 'thermal']);
  expect(planned.planGhostLayerCount).toBe(11);
  expect(planned.resourceRevision).toBe(before.resourceRevision);
  expect(planned.geometryCount).toBe(before.geometryCount);

  await page.locator('#cancelBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().planGhostCount)).toBe(0);
});
