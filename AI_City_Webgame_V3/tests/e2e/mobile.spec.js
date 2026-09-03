import { test, expect } from '../fixtures/game-test.js';
import { BOARD, CITY_CAMERA, UI_FEEDBACK } from '../../src/core/Constants.js';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });

async function orbitWithOneFinger(page) {
  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  const start = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  const client = await page.context().newCDPSession(page);
  const before = await page.evaluate(() => window.__getCityCameraState());

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: start.x, y: start.y, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: start.x + 72, y: start.y + 18, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(180);

  return { before, box };
}

test.describe('mobile city controls', () => {
  test('mobile top bar keeps credit, power margin, battery, carbon, and water in a compact order', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__setTimeScale(0);
      window.__GAME_STATE__.lastSettlementDelta = -0.15;
      window.__GAME_STATE__.lastTickSummary = { dailyCarbon: 4.2, dailyWater: 1.8, deliveredPower: 7, demand: 6, batteryStored: 3.5, lowCarbonPercent: 70, capacity: 5, used: 4 };
      window.__refreshGameForTest();
    });

    await expect(page.locator('#simNet')).toHaveText('-0.15/일');
    await expect(page.locator('#simPower')).toHaveText('+1');
    await expect(page.locator('#simBattery')).toHaveText('3.5');
    await expect(page.locator('#simCarbonRate')).toHaveText('4.2/일');
    await expect(page.locator('#simCarbonRate')).toBeVisible();
    await expect(page.locator('#simWater')).toHaveText('1.8/일');
    await expect(page.locator('#statusWorkforce')).toHaveText('사용 인력 4 / 전체 인구 5');
    await expect(page.locator('#simulationHud [data-metric]').evaluateAll((nodes) => nodes.map((node) => node.dataset.metric)))
      .resolves.toEqual(['credit', 'power', 'battery', 'carbon', 'water']);
    const box = await page.locator('#simulationHud').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  test('bottom bar exposes four touch targets and opens one bounded sheet', async ({ gamePage: page }) => {
    const buttons = page.locator('.mobile-bar [data-hud-target]');
    await expect(buttons).toHaveCount(4);

    for (let index = 0; index < 4; index++) {
      const box = await buttons.nth(index).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await buttons.filter({ hasText: '건설' }).click();
    const buildSheet = page.locator('#buildPanel');
    await expect(buildSheet).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#questTracker')).toHaveCount(0);
    const sheetBox = await buildSheet.boundingBox();
    expect(sheetBox.x).toBeLessThanOrEqual(5);
    expect(sheetBox.width).toBeGreaterThanOrEqual(380);
    expect(sheetBox.height).toBeLessThanOrEqual(844 * 0.56 + 1);
    expect((await buildSheet.locator('.facility-btn').first().boundingBox()).height).toBeLessThanOrEqual(100);

    await buttons.filter({ hasText: '퀘스트' }).click();
    await expect(buildSheet).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#questPanel')).toHaveClass(/hud-panel-active/);
  });

  // 손가락으로 누르는 화면에서는 어떤 버튼도 44×44보다 작으면 안 된다(WCAG 2.5.5 기준).
  // 한 줄 상단 바에서 시간 조절은 보조 조작이라 36px, 전력/저장 지표는 한 칸을 상하로 나눠 쓴다(둘을 합쳐 44px).
  // 그 밖의 터치 조작은 44px 이상이어야 한다.
  test('touch controls keep their hit areas on a coarse pointer', async ({ gamePage: page }) => {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await page.locator('.mobile-bar [data-hud-target="quest"]').click();

    for (const [selector, minimum] of [
      ['.quest-panel-tools .icon-btn', 44],
      ['#timeControls button', 36],
      ['#simulationHud > button:not([data-metric="power"]):not([data-metric="battery"])', 44],
    ]) {
      const targets = await page.locator(selector).evaluateAll((nodes) => nodes
        .filter((node) => node.checkVisibility())
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { node: node.id || node.className, width: Math.round(rect.width), height: Math.round(rect.height) };
        }));
      expect(targets.length, selector).toBeGreaterThan(0);
      expect(targets.filter(({ width, height }) => width < minimum || height < minimum), selector).toEqual([]);
    }
    const stacked = await page.locator('#simulationHud [data-metric="power"], #simulationHud [data-metric="battery"]').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    expect(stacked).toHaveLength(2);
    expect(stacked[0] + stacked[1]).toBeGreaterThanOrEqual(42);
  });

  test('mobile build cards repeat only identity and cost while one shared area explains the selection', async ({ gamePage: page }) => {
    await page.locator('.mobile-bar [data-hud-target="build"]').click();
    const firstCard = page.locator('#facilityDock .facility-btn').first();

    await expect(firstCard.locator('.facility-card-details')).toHaveCount(0);
    await expect(firstCard.locator('.facility-card-main')).toContainText('주거지');
    await expect(firstCard.locator('.cost')).toBeVisible();
    await expect(page.locator('#facilityDetail')).toBeVisible();
    await expect(page.locator('#facilityDetail')).toContainText('주거지');
    await expect(page.locator('#facilityDetail')).toContainText('인구');
  });

  test('mobile keeps quest content out of the city and shows the current quest inside its menu', async ({ gamePage: page }) => {
    await expect(page.locator('#questTracker')).toHaveCount(0);
    await page.locator('.mobile-bar [data-hud-target="quest"]').click();

    const panel = page.locator('#questPanel');
    await expect(panel).toHaveClass(/hud-panel-active/);
    await expect(panel.locator('#questPanelLevel')).toHaveText('LEVEL 1 / 19');
    await expect(panel.locator('#questPanelTitle')).toHaveText('2040, 첫 시민');
    await expect(panel.locator('#questPanelGoal')).toContainText('주거지 2개');
    await expect(panel.locator('#questPanelClaimBtn')).toBeVisible();
    await expect(panel.locator('#questPanelDragHandle')).toHaveCount(0);
    await expect(panel.locator('#questPanelPinBtn')).toHaveCount(1);
    await expect(panel.locator('#questPanelPinBtn')).toBeHidden();
  });

  test('mobile claims a ready quest from the quest menu instead of the hidden tracker', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
      window.__GAME_STATE__.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
      window.__refreshGameForTest();
    });
    await page.locator('.mobile-bar [data-hud-target="quest"]').click();
    await expect(page.locator('#questPanelClaimBtn')).toBeEnabled();
    await page.locator('#questPanelClaimBtn').click();

    await expect(page.locator('#modal')).toBeHidden();
    await expect(page.locator('.toast.quest-reward-alert')).toContainText('2040, 첫 시민 완료');
    await expect(page.locator('.toast.quest-reward-alert')).toContainText('공장·화력발전 해금');
    await expect(page.locator('#questCelebration')).toHaveClass(/show/);
  });

  test('closing a mobile sheet restores touch orbit to the city', async ({ gamePage: page }) => {
    await page.locator('.mobile-bar [data-hud-target="settings"]').click();
    await page.locator('#settingsPanel [data-hud-close]').click();
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);

    const { before, box } = await orbitWithOneFinger(page);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);

    const after = await page.evaluate(() => ({
      camera: window.__getCityCameraState(),
      state: JSON.parse(window.render_game_to_text()),
      renderer: window.__getCityRendererStats(),
      hud: window.__getWorldHudState(),
    }));
    expect(after.camera.position).not.toEqual(before.position);
    expect(after.state.entities).toHaveLength(0);
    expect(after.renderer.pixelRatio).toBeLessThanOrEqual(1.25);
    expect(after.hud.mobile).toBe(true);
  });
});

// 손가락 탭은 보통 5~15px 흔들린다. 마우스용 7px 드래그 임계값을 그대로 쓰면 폰에서
// "눌렀는데 아무 반응 없음"이 생기므로, 터치 포인터는 더 큰 흔들림까지 탭으로 인정한다.
test('a finger tap that wobbles a little still counts as a cell tap', async ({ gamePage: page }) => {
  await page.locator('.mobile-bar [data-hud-target="build"]').click();
  await page.locator('#facilityDock [data-facility="residential"]').click();
  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  const client = await page.context().newCDPSession(page);
  const centre = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  const tapWithWobble = async (wobble) => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre.x, y: centre.y, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centre.x + wobble, y: centre.y, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
  };

  await tapWithWobble(CITY_CAMERA.TAP_THRESHOLD_TOUCH_PX - 2);
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([{ index: 0, type: 'residential', rotation: 0 }]);
  // 취소하면 독이 다시 펼쳐지고 배치 무장이 풀린다 — 다시 고른다.
  await page.locator('#cancelBuildBtn').click();
  await page.locator('#facilityDock [data-facility="residential"]').click();

  // 임계값을 훌쩍 넘는 움직임은 여전히 카메라 드래그다.
  await tapWithWobble(CITY_CAMERA.TAP_THRESHOLD_TOUCH_PX * 2);
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan)).toEqual([]);
});

// 세로 화면에서 핀치로 셀 하나가 화면을 덮을 만큼 확대되면 길을 잃는다. 세로 화면은 최소 거리를 더 멀리 둔다.
test('portrait pinch zoom stops before a single cell fills the screen', async ({ gamePage: page }) => {
  const canvas = page.locator('.city-scene-3d-canvas');
  const box = await canvas.boundingBox();
  const client = await page.context().newCDPSession(page);
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  for (let round = 0; round < 3; round += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
    for (let step = 1; step <= 8; step += 1) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - step * 14, y: cy, id: 1 }, { x: cx + 30 + step * 14, y: cy, id: 2 }] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
  }
  const state = await page.evaluate(() => window.__getCityCameraState());
  const span = Math.sqrt(3) * BOARD.HEX_SIZE * BOARD.INITIAL_RADIUS * 2 + BOARD.HEX_SIZE * 2;
  expect(state.minDistance).toBeCloseTo(span * CITY_CAMERA.MIN_DISTANCE_PER_GRID_PORTRAIT, 2);
  expect(state.distance).toBeGreaterThanOrEqual(state.minDistance - 0.01);
});

// 터치 탭은 짧은 진동으로도 "눌렸다"를 알린다.
test('a finger tap on a cell triggers a short vibration', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    window.__vibrations = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (pattern) => { window.__vibrations.push(pattern); return true; } });
    window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
    window.__refreshGameForTest();
  });
  const point = await page.evaluate(() => window.__getCellScreenPosition(0));
  await page.touchscreen.tap(point.x, point.y);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__vibrations)).toEqual([UI_FEEDBACK.TAP_VIBRATE_MS]);
});

// 모바일 상단 바에는 퀘스트 라벨이 숨겨져 목표를 보려면 패널을 열어야 했다.
// 얇은 퀘스트 스트립이 현재 퀘스트와 진행률을 항상 보여주고, 누르면 퀘스트 패널이 열린다.
test('a quest strip under the top bar shows the current quest and opens the quest panel', async ({ gamePage: page }) => {
  const strip = page.locator('#questStrip');
  await expect(strip).toBeVisible();
  await expect(strip.locator('#questStripLevel')).toHaveText('LEVEL 1 / 19');
  await expect(strip.locator('#questStripTitle')).toHaveText('2040, 첫 시민');
  const box = await strip.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(36);
  expect(box.y).toBeLessThan(150);

  await strip.tap();
  await expect(page.locator('#questPanel')).toHaveClass(/hud-panel-active/);
  await expect(strip).toBeHidden();
  await page.locator('#questPanel [data-hud-close]').tap();
  await expect(strip).toBeVisible();
});
