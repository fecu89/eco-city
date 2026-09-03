import { test, expect } from '../fixtures/game-test.js';

test('demolition requires an irreversible-action confirmation before changing the city', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });
  await expect(page.locator('[data-facility-tab], .facility-console-tabs')).toHaveCount(0);
  await page.locator('#demolishBtn').click();
  await expect(page.locator('#modalCard')).toContainText('되돌릴 수 없습니다');
  await expect(page.locator('#modalCard')).toContainText('환급 1.00 💰');
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0]?.type)).toBe('residential');
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).not.toContain('demolition-confirm');

  await page.locator('#confirmDemolishBtn').click();
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toBeNull();
});

test('the last thermal reserve cannot enter demolition confirmation while nuclear remains', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
    window.__GAME_STATE__.grid[1] = { type: 'nuclear', level: 1, priority: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });
  await expect(page.locator('[data-facility-tab], .facility-console-tabs')).toHaveCount(0);
  await page.locator('#demolishBtn').click();
  await expect(page.locator('#modalCard [data-demolition-blocked]')).toBeVisible();
  await expect(page.locator('#modalCard')).toContainText('철거 제한');
  await expect(page.locator('#modalCard')).toContainText('핵발전');
  await expect(page.locator('#modalCard')).not.toContainText('되돌릴 수 없습니다');
  await expect(page.locator('.toast', { hasText: '핵발전' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__GAME_STATE__.grid[0]?.type)).toBe('thermal');

  await page.locator('#confirmDemolitionBlocked').click();
  await expect(page.locator('#modalCard')).toContainText('화력발전');
  await expect(page.locator('#modalCard')).toContainText('LEVEL 1');
});

test('factory management actions remain visible in a short desktop viewport', async ({ gamePage: page }) => {
  await page.setViewportSize({ width: 1024, height: 480 });
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 11;
    state.upgradePermitLevel = 3;
    state.credits = 100;
    state.grid[0] = { type: 'factory', level: 2, priority: 'normal' };
    window.__refreshGameForTest();
    window.__clickCell(0);
  });

  const demolish = page.locator('#demolishBtn');
  const upgrade = page.locator('#upgradeBtn');
  await expect(demolish).toBeVisible();
  await expect(upgrade).toBeVisible();
  const [demolishBox, upgradeBox] = await Promise.all([demolish.boundingBox(), upgrade.boundingBox()]);
  expect(demolishBox.y + demolishBox.height).toBeLessThanOrEqual(476);
  expect(upgradeBox.y + upgradeBox.height).toBeLessThanOrEqual(476);
});
