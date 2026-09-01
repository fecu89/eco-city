import { test, expect } from '../fixtures/game-test.js';

test('24-hour forecast pauses 4x play for preparation, then becomes active and ends with a non-blocking result', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(4);
    const state = window.__GAME_STATE__;
    state.progression.chapter = 3;
    state.grid[0] = { type: 'residential', level: 1, priority: 'essential', operationMode: 'normal' };
    state.grid[1] = { type: 'solar', level: 1, priority: 'normal', operationMode: 'normal' };
    state.events.schedule = [{ id: 'heat-ui', type: 'heatwave', announceAt: 0, startAt: 24, endAt: 32 }];
    state.elapsedGameHours = 0;
    window.__settleSimulationHour();
  });

  await expect(page.locator('#forecastStrip')).toContainText('23시간 후 폭염');
  await expect(page.locator('#modalCard')).toContainText('폭염 대비 시간');
  await expect(page.locator('#modalCard')).toContainText('자동으로 일시정지');
  expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(0);
  await page.locator('#eventPreparationCloseBtn').click();
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(0);

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.elapsedGameHours = 24;
    window.__settleSimulationHour();
  });
  await expect(page.locator('#forecastStrip')).toContainText('폭염');
  const active = await page.evaluate(() => window.__GAME_STATE__.lastTickSummary);
  expect(active.demand).toBeCloseTo(2.5);
  expect(active.cityEvent.active).toMatchObject({ id: 'heat-ui', type: 'heatwave' });

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.elapsedGameHours = 32;
    window.__settleSimulationHour();
  });
  await expect(page.locator('.toast.event-result-alert')).toContainText('폭염 운영 결과');
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate(() => window.__GAME_STATE__.events.completed.at(-1).id)).toBe('heat-ui');
});

test('forecast transitions do not create a continuous render loop at 4x', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.progression.chapter = 3;
    state.events.schedule = [{ id: 'wind-ui', type: 'lowWind', announceAt: 0, startAt: 24, endAt: 30 }];
    window.__setTimeScale(4);
  });
  const before = await page.evaluate(() => window.__getCityRendererStats().renderCount);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__getCityRendererStats().renderCount);
  expect(after - before).toBeLessThan(20);
});
