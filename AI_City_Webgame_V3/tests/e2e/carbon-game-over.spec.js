import { test, expect } from '../fixtures/game-test.js';

test('seven unsafe carbon days pause the city and show a blocking reset modal', async ({ gamePage: page }) => {
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
  await expect(page.locator('#modalCard')).toContainText('탄소 임계치');
  expect(await page.evaluate(() => window.__GAME_STATE__.gameOver)).toBe(true);
  expect(await page.evaluate(() => window.__getSimulationState().pauseReasons)).toContain('game-over');
  expect(JSON.parse(await page.evaluate(() => window.render_game_to_text()))).toMatchObject({
    mode: 'game_over',
    carbonCrisisDays: 168,
    carbonCrisisLimit: 168,
  });
});
