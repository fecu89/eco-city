import { test, expect } from '../fixtures/game-test.js';
import { clickCell, completeProjectsViaGameClock } from '../helpers/playthrough.js';

test.describe('fullscreen world HUD', () => {
  test('top HUD prioritizes credit flow, power margin, battery, carbon, and water while workforce stays in city status', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__setTimeScale(0);
      const state = window.__GAME_STATE__;
      state.credits = 12.5;
      state.lastSettlementDelta = 0.25;
      state.lastTickSummary = {
        dailyCarbon: 3.4,
        deliveredPower: 6,
        demand: 5,
        batteryStored: 8.5,
        lowCarbonPercent: 80,
        dailyWater: 2.5,
        capacity: 8,
        used: 6,
      };
      window.__refreshGameForTest();
    });

    await expect(page.locator('#credits')).toHaveText('12.50');
    await expect(page.locator('#simNet')).toHaveText('+0.25/일');
    await expect(page.locator('#simPower')).toHaveText('+1 E');
    await expect(page.locator('#simBattery')).toHaveText('8.5 E');
    await expect(page.locator('#simCarbonRate')).toHaveText('3.4/일');
    await expect(page.locator('#simWater')).toHaveText('2.5/일');
    await expect(page.locator('#statusWorkforce')).toHaveText('사용 인력 6 / 전체 인구 8');
    await expect(page.locator('#simulationHud [data-metric="labor"]')).toHaveCount(0);
    await expect(page.locator('#simCarbonRate')).toBeVisible();
    await expect(page.locator('#simulationHud .sim-metric-icon')).toHaveCount(5);
    await expect(page.locator('#simulationHud [data-metric]').evaluateAll((nodes) => nodes.map((node) => node.dataset.metric)))
      .resolves.toEqual(['credit', 'power', 'battery', 'carbon', 'water']);
    // 등록되지 않은 lucide 이름은 예외 없이 콘솔 경고만 남기고 아이콘 자리를 비운다.
    expect(page.consoleMessages.filter((text) => text.includes('icon name was not found'))).toEqual([]);
  });

  test('a modal is a labelled dialog that keeps Tab inside and closes on Escape', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
    await expect(page.locator('#helpBtn')).toBeVisible();
    await page.locator('#helpBtn').focus();
    await expect(page.locator('#helpBtn')).toBeFocused();
    await page.keyboard.press('Enter');

    const card = page.locator('#modalCard');
    await expect(page.locator('#modal')).toBeVisible();
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toHaveAttribute('aria-modal', 'true');
    await expect(card).toHaveAttribute('aria-labelledby', 'modalTitle');
    await expect(page.locator('#modalTitle')).toContainText('기후 생존 도시');

    const focusInsideCard = () => page.evaluate(() => Boolean(document.activeElement?.closest('#modalCard')));
    expect(await focusInsideCard()).toBe(true);
    for (let press = 0; press < 5; press++) {
      await page.keyboard.press('Tab');
      expect(await focusInsideCard()).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await focusInsideCard()).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('#modal')).toBeHidden();
  });

  test('closing a modal returns focus to the control that opened it', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__setTimeScale(0);
      const state = window.__GAME_STATE__;
      state.grid[0] = { type: 'residential', level: 1, operationMode: 'normal' };
      state.lastTickSummary = { dailyCarbon: 2, dailyWater: 2, deliveredPower: 4, demand: 7, batteryStored: 0, lowCarbonPercent: 60, capacity: 10, used: 7 };
      window.__refreshGameForTest();
    });
    // 상단 HUD는 모달이 열려도 계속 보이므로 포커스를 실제로 되돌려 받을 수 있다.
    const powerMetric = page.locator('#simulationHud [data-metric="power"]');
    await powerMetric.click();
    await expect(page.locator('#modal')).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#modalCard')))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('#modal')).toBeHidden();
    await expect(powerMetric).toBeFocused();
  });

  test('closing a modal opened inside a HUD panel returns focus to that panel trigger', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
    await expect(page.locator('#helpBtn')).toBeVisible();
    await page.locator('#helpBtn').focus();
    await expect(page.locator('#helpBtn')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#modal')).toBeVisible();
    // 패널 숨김(visibility .18s)과 모달 등장(.22s) 전환이 모두 끝난 뒤에 닫아야 실제 사용 흐름이다.
    // 전환 중에 Escape를 누르면 #helpBtn이 아직 포커스를 받을 수 있어 테스트가 무의미해진다.
    await page.waitForTimeout(400);

    await page.keyboard.press('Escape');
    await expect(page.locator('#modal')).toBeHidden();
    // 오프너가 아직 포커스를 받을 수 있으면 오프너로, 감춰졌으면 그 패널을 다시 여는 HUD 버튼으로
    // 돌아가야 한다. 어느 쪽이든 body로 떨어지면 안 된다 — 그러면 문서 맨 위부터 Tab 해야 한다.
    const focused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return 'none';
      if (active.id) return `#${active.id}`;
      if (active.dataset?.hudTarget) return `[data-hud-target="${active.dataset.hudTarget}"]`;
      return active.tagName.toLowerCase();
    });
    expect(['#helpBtn', '[data-hud-target="settings"]']).toContain(focused);
  });

  test('an opener hidden with the panel falls back to the HUD button that reopens it', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
    await expect(page.locator('#helpBtn')).toBeVisible();
    await page.locator('#helpBtn').click();
    await expect(page.locator('#modal')).toBeVisible();
    // 앱이 실제로 쓰는 숨김 방식 그대로다: WorldHud가 hud-panel-active를 떼면
    // .hud-panel이 visibility:hidden으로 페이드아웃한다(레이아웃 박스는 그대로 남는다).
    await page.waitForFunction(() => getComputedStyle(document.getElementById('settingsPanel')).visibility === 'hidden');

    // 이 상태의 오프너는 focus()를 조용히 거부한다 — 폴백이 필요한 이유를 먼저 못박는다.
    expect(await page.evaluate(() => {
      const opener = document.getElementById('helpBtn');
      opener.focus();
      return document.activeElement === opener;
    })).toBe(false);

    await page.keyboard.press('Escape');
    await expect(page.locator('#modal')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.dataset?.hudTarget ?? document.activeElement?.tagName))
      .toBe('settings');
  });

  test('the live region announces a climate alert change once instead of every settlement', async ({ gamePage: page }) => {
    // 매 틱 다시 쓰이는 영역에는 aria-live가 없어야 한다.
    expect(await page.evaluate(() => [
      document.getElementById('simulationHud').hasAttribute('aria-live'),
      document.getElementById('facilityDetail').hasAttribute('aria-live'),
    ])).toEqual([false, false]);

    await page.evaluate(() => {
      window.__setTimeScale(0);
      window.__GAME_STATE__.climateAlert = 'heat_watch';
      window.__refreshGameForTest();
    });
    await expect(page.locator('#srAnnouncer')).toHaveText('기후 경보: 폭염 주의');

    await page.evaluate(() => {
      document.getElementById('srAnnouncer').textContent = '';
      window.__refreshGameForTest();
      window.__refreshGameForTest();
    });
    await expect(page.locator('#srAnnouncer')).toHaveText('');
  });

  test('a blocking modal ignores Escape', async ({ gamePage: page }) => {
    await page.evaluate(() => window.__EVENT_BUS__.emit(window.__EVENTS__.GAME_OVER, { summary: { dailyCarbon: 30 } }));
    await expect(page.locator('#modalCard')).toHaveAttribute('data-modal-id', 'game-over');
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal')).toBeVisible();
  });

  test('large HUD values use compact units while accessible labels keep exact values', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__setTimeScale(0);
      const state = window.__GAME_STATE__;
      state.credits = 1_250_000;
      state.lastSettlementDelta = 12_500;
      state.lastTickSummary = {
        dailyCarbon: 1_250,
        deliveredPower: 12_500,
        demand: 10_000,
        batteryStored: 12_500,
        lowCarbonPercent: 80,
        dailyWater: 1_200_000,
        capacity: 12_500,
        used: 11_000,
      };
      window.__refreshGameForTest();
    });

    await expect(page.locator('#credits')).toHaveText('1.25M');
    await expect(page.locator('#simulationHud [data-metric="credit"]')).toHaveAttribute('title', /1,250,000\.00/);
    await expect(page.locator('#simNet')).toHaveText('+12.5K/일');
    await expect(page.locator('#simPower')).toHaveText('+2.5K E');
    await expect(page.locator('#simBattery')).toHaveText('12.5K E');
    await expect(page.locator('#simCarbonRate')).toHaveText('1.25K/일');
    await expect(page.locator('#simWater')).toHaveText('1.2M/일');
    await expect(page.locator('#statusWorkforce')).toHaveText('사용 인력 11K / 전체 인구 12.5K');
    await expect(page.locator('#simPower').locator('xpath=..')).toHaveAttribute('aria-label', /여유 2,500/);
  });

  test('clicking a red power metric opens a centered list of current causes', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__setTimeScale(0);
      const state = window.__GAME_STATE__;
      state.grid[0] = { type: 'residential', level: 1, operationMode: 'normal' };
      state.grid[1] = { type: 'data', level: 2, operationMode: 'research' };
      state.grid[2] = { type: 'wind', level: 1 };
      state.research.jobs = {
        solar2: { id: 'solar2', dataCenterIndex: 1, status: 'running', elapsedEffectiveDays: 0 },
      };
      // lowWind는 은퇴한 이벤트다. 현재 덱에서 풍력을 깎는 재난은 stagnantAir(무풍·미세먼지)다.
      state.events.schedule = [{ id: 'wind-now', type: 'stagnantAir', announceAt: 0, startAt: 0, endAt: 6 }];
      state.events.activeId = 'wind-now';
      state.lastTickSummary = {
        dailyCarbon: 2,
        dailyWater: 2,
        deliveredPower: 4,
        demand: 7,
        batteryStored: 0,
        lowCarbonPercent: 60,
        capacity: 10,
        used: 7,
      };
      window.__refreshGameForTest();
    });

    const powerMetric = page.locator('#simulationHud [data-metric="power"]');
    await expect(powerMetric).toHaveClass(/metric-danger/);
    await powerMetric.click();

    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('#modalCard')).toContainText('전력 부족 원인');
    await expect(page.locator('#modalCard')).toContainText('전력 부족 3E');
    await expect(page.locator('#modalCard')).toContainText('집중 연구 +2E');
    await expect(page.locator('#modalCard')).toContainText('무풍·미세먼지');
    await expect(page.locator('#modalCard')).toContainText('풍력 출력이 급감');
  });

  test('time navigation has one play-pause toggle and one 1x-4x speed toggle', async ({ gamePage: page }) => {
    const controls = page.locator('#timeControls');
    await expect(controls.locator('button')).toHaveCount(2);
    const playPause = controls.locator('#toggleTimeBtn');
    const speed = controls.locator('#fastForwardBtn');
    await expect(playPause).toHaveAttribute('aria-label', '일시정지');
    await expect(playPause.locator('svg')).toHaveCount(1);
    await expect(speed).toHaveText('4×');

    await playPause.click();
    expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(0);
    await expect(playPause).toHaveAttribute('aria-label', '재생');
    await expect(playPause.locator('svg')).toHaveCount(1);
    await playPause.click();
    expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(1);

    await speed.click();
    expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(4);
    await expect(speed).toHaveClass(/active/);
    await speed.click();
    expect(await page.evaluate(() => window.__GAME_STATE__.timeScale)).toBe(1);
  });

  test('opens one HUD panel at a time and restores focus on Escape', async ({ gamePage: page }) => {
    const build = page.locator('[data-hud-target="build"]').first();
    await build.click();
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(build).toHaveAttribute('aria-expanded', 'true');

    const quest = page.locator('[data-hud-target="quest"]').first();
    await quest.click();
    await expect(page.locator('#buildPanel')).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#questPanel')).toHaveClass(/hud-panel-active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
    await expect(quest).toBeFocused();
  });

  test('a stage modal closes and disables the world HUD', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
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

  test('settings owns all former top actions and no AI panel remains', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
    const menu = page.locator('#settingsPanel');

    for (const id of ['helpBtn', 'musicBtn', 'soundBtn', 'resetBtn']) {
      await expect(menu.locator(`#${id}`)).toHaveCount(1);
    }
    await expect(menu.locator('#advanceBtn')).toHaveCount(0);
    await expect(menu.locator('#aiAdviceBtn')).toHaveCount(0);
    await expect(page.locator('#advisorPanel')).toHaveCount(0);
  });

  // 시설을 고르면 팔레트는 열린 채(hud-panel-active) 접혀서 보드를 드러내고, 건설 버튼을
  // 다시 누르면 닫히는 대신 펼쳐지며 고른 시설이 그대로 선택돼 있다.
  test('build palette collapses after selecting a facility and reopens from the build button with the selection kept', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.questIndex = 5;
      window.__GAME_STATE__.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('#facilityDock .facility-btn', { hasText: '공장' }).click();

    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#buildPanel')).toHaveClass(/build-panel--collapsed/);
    expect(await page.evaluate(() => window.__GAME_STATE__.selectedFacility)).toBe('factory');

    await page.locator('[data-hud-target="build"]').first().click();
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#buildPanel')).not.toHaveClass(/build-panel--collapsed/);
    await expect(page.locator('#facilityDock .facility-btn', { hasText: '공장' })).toHaveClass(/active/);
  });

  test('desktop build palette uses compact cards and one readable shared detail area', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    const panel = page.locator('#buildPanel');
    await expect(panel.locator('.panel-title, #selectedFacilitySummary')).toHaveCount(0);
    await expect(panel).not.toContainText('시설 건설');

    const panelBox = await panel.boundingBox();
    const card = panel.locator('.facility-btn').first();
    const cardBox = await card.boundingBox();
    expect(panelBox.height).toBeLessThanOrEqual(190);
    expect(cardBox.height).toBeLessThanOrEqual(100);
    await expect(card.locator('.facility-card-main')).toHaveCSS('flex-direction', 'column');
    await expect(card.locator('.facility-card-details')).toHaveCount(0);
    const detail = panel.locator('#facilityDetail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('주거지');
    await expect(detail.locator('.facility-detail-stats [data-metric]')).toHaveCount(5);
    await expect(detail.locator('.facility-detail-stats [data-metric]').evaluateAll((nodes) => nodes.map((node) => node.dataset.metric)))
      .resolves.toEqual(['credit', 'power', 'carbon', 'water', 'labor']);
    await expect(detail.locator('[data-metric="credit"]')).toHaveAttribute('aria-label', '크레딧');
    await expect(detail.locator('[data-metric="power"]')).toHaveAttribute('aria-label', '전력');
    // 주거지 Lv.1 인구는 WORKFORCE_LEVELS.residential[1] = 6이다.
    await expect(detail.locator('[data-metric="labor"]')).toContainText('인구 +6');
    await panel.locator('[data-facility="factory"]').hover();
    await expect(detail.locator('[data-metric="labor"]')).toContainText('필요 인력 4명');
    expect(Number.parseFloat(await card.locator('.facility-card-identity strong').evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(await detail.locator('.facility-detail-stats b').first().evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
  });

  test('facility buttons disable when the remaining credits cannot cover their cost', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => {
      window.__GAME_STATE__.credits = 3;
      window.__GAME_STATE__.questIndex = 5;
      window.__GAME_STATE__.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await page.locator('#facilityDock .facility-btn', { hasText: '주거지' }).click();

    await expect(page.locator('#facilityDock .facility-btn', { hasText: '주거지' })).toHaveAttribute('aria-disabled', 'false');
    const factory = page.locator('#facilityDock .facility-btn', { hasText: '공장' });
    await expect(factory).toHaveAttribute('aria-disabled', 'true');
    await expect(factory).toHaveAttribute('title', /1\.00 💰 부족/);
    await page.evaluate(() => document.querySelector('[data-facility="factory"]').click());
    await expect(page.locator('.toast', { hasText: '1.00 💰' })).toBeVisible();
  });

  test('facility cards show quest permit counts and explain the next capacity increase', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.grid[0] = { type: 'residential', level: 1 };
      state.grid[1] = { type: 'residential', level: 1 };
      window.__refreshGameForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    const residential = page.locator('[data-facility="residential"]');
    await expect(residential.locator('.facility-limit')).toHaveText('2 / 2');
    await expect(residential).toHaveAttribute('aria-disabled', 'true');
    await expect(residential).toHaveAttribute('title', /퀘스트 2/);
    await page.evaluate(() => document.querySelector('[data-facility="residential"]').click());
    await expect(page.locator('.toast', { hasText: '퀘스트 2' })).toBeVisible();
  });

  test('closing the build palette clears placement benefit and conflict markers', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.questIndex = 5;
      window.__GAME_STATE__.grid[5] = { type: 'thermal', level: 1 };
      window.__GAME_STATE__.unlockedFacilities.add('factory');
      window.__refreshGameForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('#facilityDock .facility-btn', { hasText: '공장' }).click();
    await page.waitForFunction(() => window.__getCellVisual(0)?.previewGood === true);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const cell = window.__getCellVisual(0);
      return cell?.previewGood === false && cell?.previewBad === false;
    });
  });

  test('city status opens as a nonblocking floating instrument', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="status"]').first().click();

    await expect(page.locator('#statusPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#cityChart')).toBeVisible();
    await expect(page.locator('#statusPanel')).toHaveCSS('pointer-events', 'auto');
  });

  test('quest panel replaces the removed achievement and evidence drawers', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="quest"]').first().click();
    const panel = page.locator('#questPanel');
    await expect(panel).toBeVisible();
    await expect(panel.locator(':scope > .panel-title')).toHaveCount(0);
    const titleBox = await panel.locator('#questPanelTitle').boundingBox();
    const goalBox = await panel.locator('#questPanelGoal').boundingBox();
    expect(Math.abs(titleBox.y - goalBox.y)).toBeLessThanOrEqual(4);
    await expect(page.locator('[data-hud-target="achievements"]')).toHaveCount(0);
    await expect(page.locator('#badgePanel, #evidenceBox')).toHaveCount(0);
  });

  test('desktop quest panel can be moved, pinned translucent, and kept beside the build palette', async ({ gamePage: page }) => {
    await page.evaluate(() => window.__setTimeScale(0));
    await page.evaluate(() => {
      localStorage.removeItem('ai-city-quest-panel-layout-v2');
      localStorage.setItem('ai-city-quest-panel-layout', JSON.stringify({ pinned: true, x: -900, y: -900 }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GAME_STATE__);
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      const storyNext = page.locator('#storyNext');
      if (!await storyNext.isVisible().catch(() => false)) break;
      await storyNext.click();
    }
    await page.locator('[data-hud-target="quest"]').first().click();
    const panel = page.locator('#questPanel');
    const pin = page.locator('#questPanelPinBtn');
    await expect(page.locator('#questPanelDragHandle')).toHaveCount(0);
    await expect(pin).toBeVisible();
    await page.waitForTimeout(240);

    const before = await panel.boundingBox();
    const topHud = await page.locator('.world-status').boundingBox();
    expect(before.x).toBeGreaterThan(page.viewportSize().width / 2);
    expect(before.y).toBeGreaterThanOrEqual(topHud.y + topHud.height + 4);
    await page.mouse.move(before.x + 24, before.y + 24);
    await page.mouse.down();
    await page.mouse.move(before.x - 110, before.y + 109, { steps: 5 });
    await page.mouse.up();
    const moved = await panel.boundingBox();
    expect(Math.hypot(moved.x - before.x, moved.y - before.y)).toBeGreaterThan(60);
    expect(moved.x).toBeGreaterThanOrEqual(7);
    expect(moved.y).toBeGreaterThanOrEqual(7);
    expect(moved.x + moved.width).toBeLessThanOrEqual(page.viewportSize().width - 7);
    expect(moved.y + moved.height).toBeLessThanOrEqual(page.viewportSize().height - 7);

    for (const control of [pin, panel.locator('[data-hud-close]')]) {
      const controlBox = await control.boundingBox();
      expect(controlBox.x).toBeGreaterThanOrEqual(moved.x);
      expect(controlBox.y).toBeGreaterThanOrEqual(moved.y);
      expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(moved.x + moved.width);
      expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(moved.y + moved.height);
    }

    const positionBeforePin = await panel.boundingBox();
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toHaveClass(/quest-panel-pinned/);
    const positionAfterPin = await panel.boundingBox();
    expect(Math.hypot(positionAfterPin.x - positionBeforePin.x, positionAfterPin.y - positionBeforePin.y)).toBeLessThan(2);
    await page.locator('[data-hud-target="build"]').first().click();
    await expect(panel).toHaveClass(/hud-panel-active/);
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GAME_STATE__ && document.getElementById('questPanel')?.classList.contains('quest-panel-pinned'));
    const restored = await page.locator('#questPanel').boundingBox();
    expect(Math.abs(restored.x - moved.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(restored.y - moved.y)).toBeLessThanOrEqual(2);

    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('#questPanel [data-hud-close]').click();
    await expect(page.locator('#questPanel')).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
  });

  test('desktop city and settings panels move independently and restore their saved positions', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('ai-city-status-panel-layout-v1');
      localStorage.removeItem('ai-city-settings-panel-layout-v1');
    });
    const movePanel = async (name, selector, delta) => {
      await page.locator(`[data-hud-target="${name}"]`).first().click();
      const panel = page.locator(selector);
      await page.waitForTimeout(240);
      const before = await panel.boundingBox();
      await page.mouse.move(before.x + 28, before.y + 24);
      await page.mouse.down();
      await page.mouse.move(before.x + delta.x, before.y + delta.y, { steps: 5 });
      await page.mouse.up();
      const after = await panel.boundingBox();
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(40);
      return after;
    };

    const status = await movePanel('status', '#statusPanel', { x: -150, y: 120 });
    await page.locator('#statusPanel [data-hud-close]').click();
    const settings = await movePanel('settings', '#settingsPanel', { x: -250, y: 150 });
    expect(Math.hypot(settings.x - status.x, settings.y - status.y)).toBeGreaterThan(20);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GAME_STATE__);
    await page.locator('[data-hud-target="status"]').first().click();
    await page.waitForTimeout(240);
    const restoredStatus = await page.locator('#statusPanel').boundingBox();
    expect(Math.abs(restoredStatus.x - status.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredStatus.y - status.y)).toBeLessThanOrEqual(2);
    await page.locator('#statusPanel [data-hud-close]').click();
    await page.locator('[data-hud-target="settings"]').first().click();
    await page.waitForTimeout(240);
    const restoredSettings = await page.locator('#settingsPanel').boundingBox();
    expect(Math.abs(restoredSettings.x - settings.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredSettings.y - settings.y)).toBeLessThanOrEqual(2);
  });

  test('empty land builds only while the build panel is open', async ({ gamePage: page }) => {
    await page.evaluate(() => window.__clickCell(0));
    expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entities)).toHaveLength(0);
    await expect(page.locator('.toast', { hasText: '건설 메뉴' })).toContainText('건설 메뉴');

    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => window.__clickCell(0));
    expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entities)).toHaveLength(0);
    await expect(page.locator('#buildConfirm')).toBeVisible();
    await page.locator('#confirmBuildBtn').click();
    expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entities)).toHaveLength(1);
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
  });

  test('facility inspection restores an active build panel after the modal closes', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    await page.evaluate(() => window.__clickCell(0));
    await page.locator('#confirmBuildBtn').click();
    await page.evaluate(() => window.__clickCell(0));
    await expect(page.locator('[data-construction-console="build"]')).toBeVisible();
    await expect(page.locator('[data-construction-console="build"]')).toContainText('공사 중에는');
    await page.locator('.modal-card .close-modal').click();

    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(page.locator('[data-hud-target="build"]').first()).toHaveAttribute('aria-expanded', 'true');
  });

  test('upgrade condition check removes the blurred inspector and raises a visible priority cue', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'normal' };
      window.__refreshGameForTest();
      window.__clickCell(0);
    });
    await expect(page.locator('#modal')).toBeVisible();

    await expect(page.locator('[data-facility-tab], .facility-console-tabs')).toHaveCount(0);
    await expect(page.locator('#upgradeBtn')).toBeVisible();
    await expect(page.locator('#demolishBtn')).toBeVisible();
    await page.locator('#upgradeBtn').click();

    await expect(page.locator('#modal')).toBeHidden();
    const cue = page.locator('.toast.priority', { hasText: '강화 조건 미충족' });
    await expect(cue).toBeVisible();
    await expect(cue).toContainText('퀘스트');
    const cueBox = await cue.boundingBox();
    const viewport = page.viewportSize();
    expect(Math.abs(cueBox.x + cueBox.width / 2 - viewport.width / 2)).toBeLessThan(4);
    expect(Math.abs(cueBox.y + cueBox.height / 2 - viewport.height / 2)).toBeLessThan(4);
  });

  test('a build that would make hourly credits negative asks for centered confirmation', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 5;
      state.credits = 30;
      state.unlockedFacilities.add('thermal');
      state.grid[1] = { type: 'residential', level: 1 };
      window.__refreshGameForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    await page.locator('[data-facility="thermal"]').click();
    await page.evaluate(() => window.__clickCell(0));
    await page.locator('#confirmBuildBtn').click();

    const modal = page.locator('#modalCard');
    await expect(modal).toContainText('운영 적자 경고');
    await expect(modal).toContainText('예상 순수익');
    expect(await page.evaluate(() => window.__GAME_STATE__.grid[0])).toBeNull();
    const modalBox = await modal.boundingBox();
    const viewport = page.viewportSize();
    expect(Math.abs(modalBox.x + modalBox.width / 2 - viewport.width / 2)).toBeLessThan(4);
    expect(Math.abs(modalBox.y + modalBox.height / 2 - viewport.height / 2)).toBeLessThan(4);

    await page.locator('#confirmRiskyBuild').click();
    expect(await page.evaluate(() => window.__GAME_STATE__.grid[0]?.type)).toBe('thermal');
  });

  test('meeting the quest condition raises one menu notification without a persistent quest card', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    for (let index = 0; index < 2; index++) {
      await clickCell(page, index);
    }
    await completeProjectsViaGameClock(page, [0, 1]);

    await expect(page.locator('.toast', { hasText: '퀘스트 완료 조건 달성' })).toHaveCount(1);
    await expect(page.locator('#questTracker')).toHaveCount(0);
    await expect(page.locator('[data-hud-target="quest"]').first()).toHaveAttribute('data-notification', 'ready');

    await page.evaluate(() => window.__refreshGameForTest());
    await page.waitForTimeout(150);
    await expect(page.locator('.toast', { hasText: '퀘스트 완료 조건 달성' })).toHaveCount(1);
  });

  test('claiming each completed quest raises the quest celebration and clears its cue', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="build"]').first().click();
    for (let index = 0; index < 2; index++) {
      await clickCell(page, index);
    }
    await page.locator('[data-hud-target="quest"]').first().click();
    await page.locator('#questPanelClaimBtn').click();
    const celebration = page.locator('#questCelebration');
    await expect(celebration).toHaveClass(/show/);
    await expect(celebration).toContainText('2040, 첫 시민');
    await expect(page.locator('[data-hud-target="quest"]').first()).not.toHaveAttribute('data-notification', 'ready');
  });

  test('theme control switches CSS and 3D palettes and persists the choice', async ({ gamePage: page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('[data-hud-target="settings"]').first().click();
    await page.locator('#themeBtn').click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('ai-city-theme'))).toBe('light');
    const rendererStats = await page.evaluate(() => window.__getCityRendererStats());
    expect(rendererStats.theme).toBe('light');
    expect(rendererStats.firstTileColor).toBe(0x91b5c2);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GAME_STATE__ && window.__getCityRendererStats?.().theme === 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  // 동작 줄이기를 켠 사용자에게는 미끄러져 들어오는 연출 없이 토스트가 바로 완성된 상태로 보여야 한다.
  test('reduced motion shows a toast at full opacity without waiting for an animation', async ({ gamePage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const shown = await page.evaluate(async () => {
      window.__EVENT_BUS__.emit(window.__EVENTS__.TOAST_SHOW, { title: '동작 줄이기 알림', duration: 30000 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const toast = document.querySelector('#toastStack .toast');
      // 애니메이션이 도는지는 인라인 값으로 본다 — anime가 프레임마다 여기에 쓴다.
      // (계산값은 동작 줄이기에서 전역 transition-duration이 0이 아니게 되는 바람에 한 프레임 뒤처진다.)
      return { text: toast?.textContent, opacity: toast?.style.opacity, transform: toast?.style.transform };
    });
    expect(shown).toEqual({ text: '동작 줄이기 알림', opacity: '1', transform: 'none' });
  });

  // 저장 파일에서 온 문자열은 innerHTML로 들어가도 마크업이 되면 안 된다.
  test('a tampered save string stays text inside the HUD guidance note', async ({ gamePage: page }) => {
    const injected = '<img src=x onerror="window.__HUD_ESCAPE_FAILED__ = true">진단';
    await page.evaluate((label) => {
      const state = window.__GAME_STATE__;
      state.stressTest = { status: 'failed', phaseIndex: 0, phaseDay: 0, result: { passed: false, diagnosis: { label } } };
      window.__refreshGameForTest();
    }, injected);

    await expect(page.locator('#teacherNote p')).toHaveText(injected);
    await expect(page.locator('#teacherNote img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__HUD_ESCAPE_FAILED__)).toBeUndefined();
  });

  test('graphics lighting is fixed to day, dusk, or night instead of following simulation time', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="settings"]').first().click();
    const controls = page.locator('#worldLightingControls');
    await expect(controls.locator('button')).toHaveCount(3);
    await controls.locator('[data-world-lighting="dusk"]').click();
    expect(await page.evaluate(() => window.__getWorldLightingMode())).toBe('dusk');
    expect(await page.evaluate(() => window.__getCityRendererStats().skyHour)).toBe(17);

    await page.evaluate(() => {
      for (let day = 0; day < 8; day++) window.__settleSimulationDay();
    });
    expect(await page.evaluate(() => window.__getCityRendererStats().skyHour)).toBe(17);
    expect(await page.evaluate(() => localStorage.getItem('ai-city-world-lighting'))).toBe('dusk');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__getWorldLightingMode?.() === 'dusk');
    expect(await page.evaluate(() => window.__getCityRendererStats().skyHour)).toBe(17);
  });
});
