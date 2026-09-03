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

// 취소(X)도 확정(O)과 같은 규칙이다 — 취소하면 배치 모드가 풀려 마우스가 보통 상태로 돌아오고,
// 다시 지으려면 독에서 시설을 다시 고른다.
test('cancelling a build preview disarms placement until a facility is picked again', async ({ gamePage: page }) => {
  await openBuild(page);
  await page.locator('#facilityDock [data-facility="residential"]').click();
  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('#cancelBuildBtn')).toBeVisible();
  await page.locator('#cancelBuildBtn').click();
  await expect(page.locator('#buildConfirm')).toBeHidden();
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);

  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__getCityRendererStats().ghostVisible)).toBe(false);

  await page.evaluate(() => window.__clickCell(1));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);

  await page.locator('#facilityDock [data-facility="residential"]').click();
  await page.evaluate(() => window.__clickCell(1));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([{ index: 1, type: 'residential', rotation: 0 }]);
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
    { index: 1, type: 'residential', rotation: 0 },
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
    { index: 0, type: 'residential', rotation: 0 },
  ]);
  await expect(page.locator('.toast')).toBeVisible();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean))).toHaveLength(0);

  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);

  await page.locator('[data-facility="residential"]').click();
  await page.evaluate(() => window.__clickCell(1));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([
    { index: 1, type: 'residential', rotation: 0 },
  ]);
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(2);
});

test('picking a facility collapses the build list, and clicking the pending tile again cancels it', async ({ gamePage: page }) => {
  await openBuild(page);
  await expect(page.locator('#facilityDock')).toBeVisible();

  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([{ index: 0, type: 'residential', rotation: 0 }]);
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
  const residential = page.locator('[data-facility="residential"]');
  await expect(residential).toHaveClass(/permit-capped/);
  await expect(residential).toHaveAttribute('aria-disabled', 'true');
  await expect(residential).toHaveAttribute('title', '주거지 — 주거지 허가 2/2. 퀘스트 2 완료 후 한도가 늘어납니다.');
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

// 시설 카드를 고르는 즉시 독 패널이 접혀 보드가 드러나야 한다(어디에 지을지 보여야 하므로).
// 확정(O)·취소(X) 뒤에는 패널이 돌아오고, 접힌 상태에서 건설 버튼을 다시 누르면
// 패널이 닫히는 대신 다시 펼쳐져 다른 시설을 고를 수 있다.
for (const viewport of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 780 },
]) test(`${viewport.name} collapses the dock as soon as a facility is picked and brings it back after confirm, cancel, or the build button`, async ({ gamePage: page }) => {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await openBuild(page);
  const panel = page.locator('#buildPanel');
  const card = page.locator('#facilityDock [data-facility="residential"]');
  const mobile = await page.evaluate(() => matchMedia('(max-width: 760px)').matches);
  const trigger = page.locator(mobile ? '.mobile-bar [data-hud-target="build"]' : '.hud-rail [data-hud-target="build"]');

  await card.click();
  await expect(panel).toHaveClass(/build-panel--collapsed/);
  await expect(card).toBeHidden();
  expect(await page.evaluate(() => window.__getWorldHudState().activePanel)).toBe('build');

  // 접혀 있어도 배치는 무장돼 있다 — 칸을 고르면 계획이 잡히고 취소하면 독이 돌아온다.
  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan.length)).toBe(1);
  await expect(panel).toHaveClass(/build-panel--collapsed/);
  await page.locator('#cancelBuildBtn').click();
  await expect(panel).not.toHaveClass(/build-panel--collapsed/);
  await expect(card).toBeVisible();

  // 접힌 상태에서 건설 버튼은 패널을 닫지 않고 다시 펼친다.
  await card.click();
  await expect(panel).toHaveClass(/build-panel--collapsed/);
  await trigger.click();
  await expect(panel).not.toHaveClass(/build-panel--collapsed/);
  await expect(panel).toHaveClass(/hud-panel-active/);
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => window.__getWorldHudState().activePanel)).toBe('build');

  // 확정하면 독이 돌아오고 다음 시설을 고를 수 있다.
  await card.click();
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  await expect(panel).not.toHaveClass(/build-panel--collapsed/);
  await expect(card).toBeVisible();
});

// 시설을 고르면 패널이 접히는 새 흐름에서 첫 사용자는 다음 행동을 모를 수 있다.
// 첫 건설을 확정하기 전까지만 "빈 칸을 눌러 배치" 힌트를 보여준다.
test('picking a facility shows a placement hint until the first build is confirmed', async ({ gamePage: page }) => {
  await openBuild(page);
  const hint = page.locator('.toast', { hasText: '빈 칸을 눌러' });
  await page.locator('#facilityDock [data-facility="residential"]').click();
  await expect(hint).toHaveCount(1);
  await expect(hint).toContainText('주거지');
  await expect(hint).toBeHidden({ timeout: 8000 });

  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  await page.locator('#facilityDock [data-facility="residential"]').click();
  await expect(hint).toHaveCount(0);
});

// 건설 탭을 다시 누르면 미리보기(무장 상태·대기 중인 계획)를 해제하고 독을 다시 보여준다.
test('clicking the build tab again cancels the armed preview and any pending plan', async ({ gamePage: page }) => {
  await openBuild(page);
  const panel = page.locator('#buildPanel');
  const card = page.locator('#facilityDock [data-facility="residential"]');
  const trigger = page.locator('.hud-rail [data-hud-target="build"]');
  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();

  await card.click();
  await expect(panel).toHaveClass(/build-panel--collapsed/);
  await trigger.click();
  await expect(panel).not.toHaveClass(/build-panel--collapsed/);
  await expect(panel).toHaveClass(/hud-panel-active/);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__getCityRendererStats().ghostVisible)).toBe(false);
  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);

  await card.click();
  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('#buildConfirm')).toBeVisible();
  await trigger.click();
  await expect(page.locator('#buildConfirm')).toBeHidden();
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
  await expect(panel).not.toHaveClass(/build-panel--collapsed/);
  await expect(panel).toHaveClass(/hud-panel-active/);
  await expect(card).toBeVisible();
});
