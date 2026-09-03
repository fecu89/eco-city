import { test, expect } from '../fixtures/game-test.js';
import { openHudPanel } from '../helpers/playthrough.js';

async function chartPixels(page) {
  return page.locator('#cityChart').evaluate((canvas) => canvas.toDataURL());
}

test('open city chart interpolates across most of the one-times tick interval', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    window.__GAME_STATE__.timeScale = 1;
  });
  await openHudPanel(page, 'status');
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.lastTickSummary = null;
    state.metrics = { ...state.metrics, dev: 5, reliability: 10, carbon: 20, water: 20, synergyLinks: 0 };
    window.__refreshGameForTest();
  });
  await page.waitForTimeout(1000);
  const before = await chartPixels(page);

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.metrics = { ...state.metrics, dev: 95, reliability: 90, carbon: 1, water: 1, synergyLinks: 5 };
    window.__refreshGameForTest();
  });
  await page.waitForTimeout(600);
  const middle = await chartPixels(page);
  await page.waitForTimeout(400);
  const after = await chartPixels(page);

  expect(middle).not.toBe(before);
  expect(after).not.toBe(middle);
});

test('closed city chart applies new values without spending frames on animation', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__setTimeScale(0);
    window.__GAME_STATE__.timeScale = 1;
    const state = window.__GAME_STATE__;
    state.lastTickSummary = null;
    state.metrics = { ...state.metrics, dev: 5, reliability: 10, carbon: 20, water: 20, synergyLinks: 0 };
    window.__refreshGameForTest();
  });
  // 차트는 도시 상태 패널을 처음 열 때 만들어진다(chart.js 지연 로딩). 닫힌 차트를 검증하려면
  // 먼저 한 번 열어 차트를 살린 뒤 닫아야 한다.
  await openHudPanel(page, 'status');
  await page.waitForTimeout(1000);
  await page.locator('[data-hud-panel="status"] [data-hud-close]').click();
  await expect(page.locator('[data-hud-panel="status"]')).toBeHidden();

  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.metrics = { ...state.metrics, dev: 95, reliability: 90, carbon: 1, water: 1, synergyLinks: 5 };
    window.__refreshGameForTest();
  });
  const immediate = await chartPixels(page);
  // 빈 캔버스를 비교하는 공허한 검증이 되지 않도록, 실제로 그려진 차트임을 먼저 확인한다.
  expect(immediate.length).toBeGreaterThan(5000);
  await page.waitForTimeout(150);
  expect(await chartPixels(page)).toBe(immediate);
});

test('chart.js is fetched only when the city status panel is first opened', async ({ gamePage: page }) => {
  // 지연 로딩된 chart.js 청크: dev 서버는 .vite/deps/chart__js_auto.js, 빌드는 assets/chart-<hash>.js.
  // src/ui/ChartView.js는 'chart' 뒤에 구분자가 없어 걸리지 않는다.
  const chartChunks = () => page.evaluate(() => performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => /chart[-_]/i.test(name)));

  await page.evaluate(() => {
    window.__setTimeScale(0);
    const state = window.__GAME_STATE__;
    state.metrics = { ...state.metrics, dev: 40, reliability: 60, carbon: 4, water: 4, synergyLinks: 1 };
    window.__refreshGameForTest();
  });
  expect(await chartChunks()).toEqual([]);

  await openHudPanel(page, 'status');
  await expect.poll(chartChunks).not.toEqual([]);
  // 청크가 도착한 뒤 실제로 차트가 그려지는지까지 확인한다(빈 캔버스가 아님).
  await expect.poll(async () => (await chartPixels(page)).length).toBeGreaterThan(5000);
});
