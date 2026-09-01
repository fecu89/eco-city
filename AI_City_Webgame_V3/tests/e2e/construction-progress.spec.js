import { test, expect } from '../fixtures/game-test.js';

async function openBuild(page) {
  const target = await page.evaluate(() => matchMedia('(max-width: 760px)').matches)
    ? '.mobile-bar [data-hud-target="build"]'
    : '.hud-rail [data-hud-target="build"]';
  await page.locator(target).click();
}

test('confirmed construction remains a zero-effect build site until its completion tick', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    window.__constructionCompletions = 0;
    window.__EVENT_BUS__.on(window.__EVENTS__.BOARD_PLACED, () => { window.__constructionCompletions += 1; });
  });
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();

  const started = await page.evaluate(() => ({
    cell: window.__GAME_STATE__.grid[0],
    completions: window.__constructionCompletions,
  }));
  expect(started.cell.project).toMatchObject({ kind: 'build', elapsedDays: 0, durationDays: 5 });
  expect(started.completions).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().constructionSiteCount)).toBe(1);
  expect(await page.evaluate(() => window.__getCityRendererStats().facilityInstances)).toBe(0);
  expect(await page.evaluate(() => window.__getCityRendererStats().constructionStages)).toEqual({ foundation: 1 });
  await expect(page.locator('[data-world-construction-progress]')).toBeVisible();
  await expect(page.locator('[data-world-construction-progress]')).toContainText('0%');

  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('[data-construction-console]')).toBeVisible();
  await expect(page.locator('[data-project-progress]')).toContainText('0%');
  await expect(page.locator('[data-project-remaining]')).toContainText('5일');

  await page.evaluate(() => {
    for (let day = 0; day < 4; day += 1) window.__settleSimulationDay();
  });
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0].project.elapsedDays)).toBe(4);
  expect(await page.evaluate(() => window.__constructionCompletions)).toBe(0);
  expect(await page.evaluate(() => window.__getCityRendererStats().constructionStages)).toEqual({ shell: 1 });

  await page.evaluate(() => window.__settleSimulationDay());
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0].project)).toBeNull();
  expect(await page.evaluate(() => window.__constructionCompletions)).toBe(1);
  expect(await page.evaluate(() => window.__getCityRendererStats().facilityInstances)).toBe(1);
});

test('world and inspector progress bars advance continuously between settlement ticks and freeze on pause', async ({ gamePage: page }) => {
  await page.evaluate(() => window.__setTimeScale(0));
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('[data-construction-console]')).toBeVisible();

  await page.evaluate(() => window.__setTimeScale(1));
  const samples = [];
  for (let sample = 0; sample < 5; sample += 1) {
    await page.waitForTimeout(100);
    samples.push(await page.evaluate(() => ({
      world: document.querySelector('[data-world-construction-progress] [role="progressbar"] i').style.width,
      inspector: document.querySelector('[data-project-progress-bar]').style.width,
    })));
  }

  expect(new Set(samples.map(({ world }) => world)).size).toBeGreaterThanOrEqual(4);
  expect(new Set(samples.map(({ inspector }) => inspector)).size).toBeGreaterThanOrEqual(4);

  await page.evaluate(() => window.__setTimeScale(0));
  await page.waitForTimeout(50);
  const paused = await page.evaluate(() => ({
    world: document.querySelector('[data-world-construction-progress] [role="progressbar"] i').style.width,
    inspector: document.querySelector('[data-project-progress-bar]').style.width,
  }));
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => ({
    world: document.querySelector('[data-world-construction-progress] [role="progressbar"] i').style.width,
    inspector: document.querySelector('[data-project-progress-bar]').style.width,
  }))).toEqual(paused);
});

test('every simultaneous build project owns a visible world progress bar', async ({ gamePage: page }) => {
  await page.evaluate(() => window.__setTimeScale(0));
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  await page.locator('[data-facility="residential"]').click();
  await page.evaluate(() => window.__clickCell(1));
  await page.locator('#confirmBuildBtn').click();

  const visibleBars = page.locator('[data-world-construction-progress]:visible');
  await expect(visibleBars).toHaveCount(2);
  expect((await visibleBars.evaluateAll((bars) => bars.map((bar) => Number(bar.dataset.projectIndex)).sort((a, b) => a - b))))
    .toEqual([0, 1]);

  await page.evaluate(() => window.__setTimeScale(1));
  await page.waitForTimeout(180);
  const widths = await visibleBars.evaluateAll((bars) => bars.map((bar) => (
    parseFloat(bar.querySelector('[role="progressbar"] i').style.width)
  )));
  expect(widths.every((width) => width > 0)).toBe(true);
});

test('cancelling an early build removes the site and refunds 80 percent of paid cost', async ({ gamePage: page }) => {
  await page.evaluate(() => window.__setTimeScale(0));
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(8);

  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#cancelProjectBtn').click();
  await expect(page.locator('[data-project-cancel-confirm]')).toBeVisible();
  await page.locator('#confirmCancelProjectBtn').click();

  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toBeNull();
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(9.6);
});

test('a factory construction site exposes site demolition instead of looking non-demolishable', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 2;
    state.unlockedFacilities.add('factory');
    state.credits = 20;
    state.grid[1] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
    window.__refreshGameForTest();
    window.__setTimeScale(0);
  });
  await page.locator('[data-hud-target="build"]').first().click();
  await page.locator('#facilityDock [data-facility="factory"]').click();
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#confirmBuildBtn').click();
  const riskyBuild = page.locator('#confirmRiskyBuild');
  if (await riskyBuild.isVisible().catch(() => false)) await riskyBuild.click();
  await page.evaluate(() => window.__clickCell(0));

  await expect(page.locator('#cancelProjectBtn')).toContainText('현장 철거');
  await page.locator('#cancelProjectBtn').click();
  await page.locator('#confirmCancelProjectBtn').click();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toBeNull();
});

test('a completed factory still uses the normal irreversible demolition flow', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0] = { type: 'factory', level: 1, priority: 'normal', operationMode: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });
  await page.locator('#demolishBtn').click();
  await expect(page.locator('#confirmDemolishBtn')).toBeVisible();
  await page.locator('#confirmDemolishBtn').click();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toBeNull();
});

test('upgrade starts an eight-day limited-operation project and changes level only on completion', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.credits = 20;
    state.upgradePermitLevel = 2;
    state.grid[0] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });
  await page.locator('#upgradeBtn').click();

  await expect(page.locator('[data-upgrade-forecast]')).toBeVisible();
  await expect(page.locator('[data-upgrade-forecast]')).toContainText('공사 중');
  await expect(page.locator('[data-upgrade-forecast]')).toContainText('완공 후');
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0].project)).toBeUndefined();
  await page.locator('#confirmUpgradeProjectBtn').click();

  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toMatchObject({
    level: 1,
    project: { kind: 'upgrade', fromLevel: 1, toLevel: 2, elapsedDays: 0, durationDays: 8 },
  });
  expect(await page.evaluate(() => window.__GAME_STATE__.credits)).toBe(18);
  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('[data-construction-console="upgrade"]')).toContainText('제한 가동 중');

  await page.evaluate(() => {
    for (let day = 0; day < 7; day += 1) window.__settleSimulationDay();
  });
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0].level)).toBe(1);
  await page.evaluate(() => window.__settleSimulationDay());
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toMatchObject({ level: 2, project: null });
});

test('tidal upgrade forecast shows distinct current construction and completed generation', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.credits = 100;
    state.upgradePermitLevel = 3;
    state.grid[0] = { type: 'tidal', level: 1, priority: 'normal', operationMode: 'normal' };
    state.grid[1] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  await page.locator('#upgradeBtn').click();

  await expect(page.locator('[data-upgrade-capacity="current"]')).toHaveText('발전 가능량 10E');
  await expect(page.locator('[data-upgrade-capacity="during"]')).toHaveText('발전 가능량 7E');
  await expect(page.locator('[data-upgrade-capacity="completed"]')).toHaveText('발전 가능량 14.8E');
});

test('green level-two and level-three upgrades use the shared world progress bars', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.credits = 100;
    state.upgradePermitLevel = 3;
    state.research.completedIds.add('green2');
    state.research.completedIds.add('green3');
    state.research.techLevels.green = 3;
    state.grid[0] = { type: 'green', level: 1, priority: 'normal', operationMode: 'normal' };
    state.grid[1] = { type: 'green', level: 2, priority: 'normal', operationMode: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  await page.locator('#upgradeBtn').click();
  await page.locator('#confirmUpgradeProjectBtn').click();
  await page.evaluate(() => window.__clickCell(1));
  await page.locator('#upgradeBtn').click();
  await page.locator('#confirmUpgradeProjectBtn').click();

  const bars = page.locator('[data-world-construction-progress]:visible');
  await expect(bars).toHaveCount(2);
  await expect(bars.nth(0)).toContainText('강화 중');
  await expect(bars.nth(1)).toContainText('강화 중');
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.slice(0, 2).map((cell) => cell.project))).toMatchObject([
    { kind: 'upgrade', fromLevel: 1, toLevel: 2, durationDays: 8 },
    { kind: 'upgrade', fromLevel: 2, toLevel: 3, durationDays: 15 },
  ]);
});
