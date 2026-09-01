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
  await expect(page.locator('#buildConfirmMetrics [data-metric="credit"]')).toContainText('/일');
  await expect(page.locator('#buildConfirmMetrics [data-metric="credit"] small')).toHaveText('도시 순수익');
  await expect(page.locator('#buildConfirmMetrics [data-metric="carbon"]')).toContainText('CO₂');
  await expect(page.locator('#buildConfirmMetrics [data-metric="labor"]')).toContainText('0/6');
  await expect(page.locator('#buildForecastTimeline')).toContainText('5일');
  await expect(page.locator('#buildForecastTimeline')).toContainText('주거지');
  await expect(page.locator('#confirmBuildBtn')).toBeVisible();
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  await expect(page.locator('#buildConfirm')).toBeHidden();
  await expect(page.locator('#confirmBuildBtn')).toBeHidden();
});

test('confirming a build disarms placement until a facility is picked again', async ({ gamePage: page }) => {
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);

  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => window.__getCityRendererStats().ghostVisible)).toBe(false);

  await page.evaluate(() => window.__clickCell(1));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(1);

  await page.locator('[data-facility="residential"]').click();
  await page.evaluate(() => window.__clickCell(1));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([
    { index: 1, type: 'residential' },
  ]);
});

test('only one facility can be pending at a time; a second location is ignored until the first is resolved', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    window.__setTimeScale(0);
    state.questIndex = 5;
    state.credits = 30;
    window.__refreshGameForTest();
  });
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.evaluate(() => window.__clickCell(1));

  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([
    { index: 0, type: 'residential' },
  ]);
  await expect(page.locator('.toast')).toBeVisible();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(0);

  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);

  await page.locator('[data-facility="residential"]').click();
  await page.evaluate(() => window.__clickCell(1));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([
    { index: 1, type: 'residential' },
  ]);
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(2);
});

test('picking a facility collapses the build list, and clicking the pending tile again cancels it', async ({ gamePage: page }) => {
  await openBuild(page);
  await expect(page.locator('#facilityDock')).toBeVisible();

  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([{ index: 0, type: 'residential' }]);
  await expect(page.locator('#facilityDock')).toBeHidden();
  await expect(page.locator('#buildPanel')).toBeHidden();

  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
  await expect(page.locator('#buildConfirm')).toBeHidden();
  await expect(page.locator('#facilityDock')).toBeVisible();
  await expect(page.locator('#buildPanel')).toBeVisible();
});

test('closing the build panel clears the uncommitted construction plan', async ({ gamePage: page }) => {
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toHaveLength(1);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(0);
});

test('insufficient credits disables confirmation without building', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 5;
    state.credits = 1;
    window.__refreshGameForTest();
  });
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('#buildPlanError')).toContainText('💰');
  await expect(page.locator('#confirmBuildBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(0);
});

test('facility permit blocks placement once the quest limit is reached', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__GAME_STATE__.credits = 30;
    window.__refreshGameForTest();
  });
  await openBuild(page);

  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);

  await page.locator('[data-facility="residential"]').click();
  await page.evaluate(() => window.__clickCell(1));
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(2);

  // 이제 주거지 허가 한도(2/2)에 도달했으므로, 독 카드 자체가 비활성화되어 재선택을 막는다.
  await page.evaluate(() => document.querySelector('[data-facility="residential"]').click());
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
  await expect(page.locator('.toast', { hasText: '허가' })).toBeVisible();
});

test('plan ghost reuses preallocated GPU layers across sequential placements and disappears on cancel', async ({ gamePage: page }) => {
  await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 5;
    state.credits = 30;
    state.unlockedFacilities.add('factory');
    window.__refreshGameForTest();
  });
  await openBuild(page);
  const before = await page.evaluate(() => window.__getCityRendererStats());

  await page.evaluate(() => window.__clickCell(0));
  let stats = await page.evaluate(() => window.__getCityRendererStats());
  expect(stats.planGhostCount).toBe(1);
  expect(stats.planGhostTypes).toEqual(['residential']);

  await page.locator('#cancelBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().planGhostCount)).toBe(0);

  await page.locator('[data-facility="factory"]').click();
  await page.evaluate(() => window.__clickCell(1));
  stats = await page.evaluate(() => window.__getCityRendererStats());
  expect(stats.planGhostCount).toBe(1);
  expect(stats.planGhostTypes).toEqual(['factory']);
  expect(stats.resourceRevision).toBe(before.resourceRevision);
  expect(stats.geometryCount).toBe(before.geometryCount);

  await page.locator('#cancelBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().planGhostCount)).toBe(0);
});
