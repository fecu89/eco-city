import { test, expect } from '../fixtures/game-test.js';

test('24-day preparation keeps 4x play running and shows the strip only while the disaster is active', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(4);
    // 하루 수요 변동은 판의 씨앗에서 나온다. 폭염 배수를 정확히 재려면 씨앗을 고정해야 한다.
    window.__setEnvironmentSeed(20400134);
    const state = window.__GAME_STATE__;
    state.progression.chapter = 3;
    state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
    state.grid[1] = { type: 'solar', level: 1, priority: 'normal' };
    state.events.schedule = [{ id: 'heat-ui', type: 'heatwave', announceAt: 0, startAt: 24, endAt: 32 }];
    state.elapsedGameDays = 0;
    window.__settleSimulationDay();
  });

  await expect(page.locator('#forecastStrip')).toBeHidden();
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(4);

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.elapsedGameDays = 24;
    window.__settleSimulationDay();
  });
  await expect(page.locator('#forecastStrip')).toContainText('폭염');
  const active = await page.evaluate(() => window.__GAME_STATE__.lastTickSummary);
  const variation = await page.evaluate(() => JSON.parse(window.render_game_to_text()).demandVariation);
  // 폭염은 주거 수요를 1.25배로 올린다. 그 위에 그날의 도시 수요 변동이 곱해진다.
  expect(active.demand).toBeCloseTo(2.5 * variation, 1);
  expect(active.demand).toBeGreaterThan(2);
  expect(active.cityEvent.active).toMatchObject({ id: 'heat-ui', type: 'heatwave' });

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.elapsedGameDays = 32;
    window.__settleSimulationDay();
  });
  await expect(page.locator('.toast.event-result-alert')).toContainText('폭염 운영 결과');
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate(() => window.__GAME_STATE__.events.completed.at(-1).id)).toBe('heat-ui');
});

test('forecast transitions do not create a continuous render loop at 4x', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.progression.chapter = 3;
    // 은퇴한 lowWind 대신 현재 덱의 이벤트를 예보한다 — 정의가 없으면 예보 토스트 리스너가 던진다.
    state.events.schedule = [{ id: 'wind-ui', type: 'stagnantAir', announceAt: 0, startAt: 24, endAt: 30 }];
    window.__setTimeScale(4);
  });
  const before = await page.evaluate(() => window.__getCityRendererStats().renderCount);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__getCityRendererStats().renderCount);
  expect(after - before).toBeLessThan(20);
});
