import { test, expect } from '@playwright/test';

async function waitForLoaded(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME_STATE__ && document.querySelector('#loadingScreen.done'));
  await page.waitForTimeout(450);
}

test('first visit tells the three-page 2040 story, pauses time, then starts the action tutorial', async ({ page }) => {
  await waitForLoaded(page);
  await expect(page.locator('#storyTitle')).toHaveText('2040년, 멈춰가는 도시');
  await expect(page.locator('#modalCard')).toContainText('해수면 상승');
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).toContain('story');
  await page.locator('#storyNext').click();
  await expect(page.locator('.story-copy')).toContainText('안내 뒤에는 하단 퀘스트 메뉴');
  await expect(page.locator('#storyTitle')).toHaveText('당신은 새 도시 운영자');
  await expect(page.locator('#modalCard')).toContainText('섬');
  await page.locator('#storyNext').click();
  await expect(page.locator('#storyTitle')).toHaveText('생존에서 전환으로');
  await expect(page.locator('#modalCard')).toContainText('37칸');
  await page.locator('#storyNext').click();
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate(() => window.__GAME_STATE__.onboardingVersionSeen)).toBe(3);
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).not.toContain('story');
  await expect(page.locator('[data-hud-target="build"]').first()).toHaveClass(/tutorial-focus/);
});

test('story replay preserves the city and quest', async ({ page }) => {
  await waitForLoaded(page);
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) await page.locator('#storyNext').click();
  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'normal' };
    window.__GAME_STATE__.questIndex = 3;
    window.__openStoryForTest();
  });
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) await page.locator('#storyNext').click();
  expect(await page.evaluate(() => ({ cell: window.__GAME_STATE__.grid[0], quest: window.__GAME_STATE__.questIndex }))).toEqual({
    cell: { type: 'residential', level: 1, priority: 'normal' },
    quest: 3,
  });
});
