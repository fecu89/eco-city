import { test, expect } from '../fixtures/game-test.js';

test.describe('fullscreen world HUD', () => {
  test('opens one HUD panel at a time and restores focus on Escape', async ({ gamePage: page }) => {
    const build = page.locator('[data-hud-target="build"]').first();
    await build.click();
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(build).toHaveAttribute('aria-expanded', 'true');

    const advisor = page.locator('[data-hud-target="advisor"]').first();
    await advisor.click();
    await expect(page.locator('#buildPanel')).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#advisorPanel')).toHaveClass(/hud-panel-active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
    await expect(advisor).toBeFocused();
  });

  test('a stage modal closes and disables the world HUD', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="menu"]').first().click();
    await page.locator('#helpBtn').click();

    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
    await expect(page.locator('#hudControls')).toHaveAttribute('aria-hidden', 'true');
  });

  test('city canvas fills the viewport while dashboard content stays hidden', async ({ gamePage: page }) => {
    const viewport = page.viewportSize();
    const canvas = await page.locator('.city-scene-3d-canvas').boundingBox();

    expect(canvas.width).toBeGreaterThanOrEqual(viewport.width * 0.95);
    expect(canvas.height).toBeGreaterThanOrEqual(viewport.height * 0.95);
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
  });

  test('menu owns all former top and main actions', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="menu"]').first().click();
    const menu = page.locator('#menuPanel');

    for (const id of ['helpBtn', 'musicBtn', 'soundBtn', 'resetBtn', 'aiAdviceBtn', 'advanceBtn']) {
      await expect(menu.locator(`#${id}`)).toHaveCount(1);
    }
  });

  test('build palette stays open after selecting a facility', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('#facilityDock .facility-btn', { hasText: '공장' }).click();

    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#selectedFacilitySummary')).toContainText('공장');
  });

  test('city status opens as a nonblocking floating instrument', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="status"]').first().click();

    await expect(page.locator('#statusPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#cityChart')).toBeVisible();
    await expect(page.locator('#statusPanel')).toHaveCSS('pointer-events', 'auto');
  });

  test('achievement drawer switches between badges and evidence', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="achievements"]').first().click();
    await page.locator('[data-achievement-tab="evidence"]').click();

    await expect(page.locator('#evidenceBox')).toBeVisible();
    await expect(page.locator('#evidenceBox')).toContainText('5단계');
    await expect(page.locator('#badgePanel')).toBeHidden();
  });
});
