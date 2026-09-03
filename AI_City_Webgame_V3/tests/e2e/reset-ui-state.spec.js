import { test, expect } from '../fixtures/game-test.js';
import { clickHudAction, openHudPanel } from '../helpers/playthrough.js';

async function forceCarbonGameOver(page) {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.questIndex = 6;
    state.carbonCrisisDays = 167;
    // 발전소 탄소가 실제 급전량에 비례하게 바뀐 뒤(ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO),
    // 놀고 있는 화력 두 기는 대기 배출 4밖에 내지 않아 위기일이 오히려 회복된다.
    // 공장·데이터센터 수요로 화력을 실제로 돌려야 하루 CO₂가 안전선 10을 넘는다.
    state.grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
    state.grid[1] = { type: 'thermal', level: 1, priority: 'normal' };
    state.grid[2] = { type: 'residential', level: 1, priority: 'essential' };
    state.grid[3] = { type: 'residential', level: 1, priority: 'essential' };
    state.grid[4] = { type: 'residential', level: 1, priority: 'essential' };
    state.grid[5] = { type: 'factory', level: 1, priority: 'normal' };
    state.grid[6] = { type: 'data', level: 1, priority: 'normal' };
    window.__settleSimulationDay();
  });
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('#restartAfterGameOver').click();
  await page.waitForFunction(() => window.__GAME_STATE__.grid.every((cell) => cell == null));
}

test('초기화하면 이전 도시에서 고른 시설의 배치 무장이 풀린다', async ({ gamePage: page }) => {
  await openHudPanel(page, 'build');
  await page.locator('#facilityDock [data-facility="residential"]').click();
  await forceCarbonGameOver(page);

  const box = await page.locator('.city-scene-3d-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__getCityRendererStats().ghostVisible)).toBe(false);

  // 무장만 풀릴 뿐 건설 패널은 그대로 쓸 수 있어야 한다 — 다시 고르면 계획이 잡힌다.
  await page.locator('#facilityDock [data-facility="residential"]').click();
  await page.evaluate(() => window.__clickCell(0));
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan.length)).toBe(1);
});

test('초기화하면 퀘스트 상세 펼침 상태가 접힌다', async ({ gamePage: page }) => {
  await openHudPanel(page, 'quest');
  await page.locator('#questPanelExpandBtn').click();
  await expect(page.locator('#questPanelExpandBtn')).toHaveAttribute('aria-expanded', 'true');

  await clickHudAction(page, 'settings', '#resetBtn');
  await page.locator('#confirmReset').click();

  await openHudPanel(page, 'quest');
  await expect(page.locator('#questPanelExpandBtn')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#questPanelDetails')).toHaveClass(/hidden/);
});

test('초기화하면 시설 상세가 기본 시설로 돌아간다', async ({ gamePage: page }) => {
  await openHudPanel(page, 'build');
  await page.locator('#facilityDock [data-facility="nuclear"]').hover();
  await expect(page.locator('#facilityDetail')).toContainText('핵발전');

  await clickHudAction(page, 'settings', '#resetBtn');
  await page.locator('#confirmReset').click();

  await openHudPanel(page, 'build');
  await expect(page.locator('#facilityDetail')).toContainText('주거지');
});

test('초기화하면 스토리 페이지가 처음으로 돌아간다', async ({ gamePage: page }) => {
  await clickHudAction(page, 'settings', '#storyReplayBtn');
  await page.locator('#storyNext').click();
  await page.locator('#storyNext').click();
  expect(await page.evaluate(() => window.__getOnboardingState().storyPage)).toBe(2);
  await page.locator('#storyNext').click();

  await clickHudAction(page, 'settings', '#resetBtn');
  await page.locator('#confirmReset').click();

  expect(await page.evaluate(() => window.__getOnboardingState().storyPage)).toBe(0);
});
