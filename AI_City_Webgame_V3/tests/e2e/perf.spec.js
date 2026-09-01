import { test, expect } from '../fixtures/game-test.js';

async function renderRepresentativeCity(page) {
  await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
  await page.waitForFunction(() => window.__getCityRendererStats?.().environment?.state === 'ready');
  const renderCount = await page.evaluate(() => window.__getCityRendererStats().renderCount);
  await page.evaluate(() => {
    const types = [
      'residential', 'factory', 'data', 'thermal', 'nuclear',
      'solar', 'wind', 'battery', 'cooling', 'green', 'tidal',
    ];
    const state = window.__GAME_STATE__;
    state.boardRadius = 3;
    state.expansion = {
      phase: 2,
      firstChoice: 'east',
      activeCellIndices: Array.from({ length: 37 }, (_, index) => index),
    };
    state.grid = Array.from({ length: 37 }, (_, index) => ({
      type: types[index % types.length],
      level: (index % 3) + 1,
    }));
    window.__renderCityForTest();
  });
  await page.waitForFunction((before) => window.__getCityRendererStats().renderCount > before, renderCount);
}

test.describe('performance', () => {
  test('boots with a single WebGL context and a static decorative background', async ({ page }) => {
    await page.addInitScript(() => {
      window.__WEBGL_CONTEXT_COUNT__ = 0;
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function wrappedGetContext(type, ...args) {
        const context = original.call(this, type, ...args);
        if ((type === 'webgl' || type === 'webgl2') && context && !this.__countedWebgl) {
          this.__countedWebgl = true;
          window.__WEBGL_CONTEXT_COUNT__++;
        }
        return context;
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__GAME_STATE__ && window.__getCityRendererStats?.().drawCalls >= 0);

    expect(await page.evaluate(() => window.__WEBGL_CONTEXT_COUNT__)).toBe(1);
    await expect(page.locator('#threeBg')).toHaveJSProperty('tagName', 'DIV');
  });

  test('loads and boots within a reasonable time', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForFunction(() => window.__GAME_STATE__ && typeof window.render_game_to_text === 'function', {
      timeout: 10000,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(8000);
  });

  test('canvas elements render with expected dimensions', async ({ gamePage: page }) => {
    const box = await page.locator('#threeBg').boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  test('rapid sequential facility placement does not throw', async ({ gamePage: page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.questIndex = 15;
      state.credits = 100;
      window.__refreshGameForTest();
    });
    await page.locator('[data-hud-target="build"]').first().click();
    for (let i = 0; i < 10; i++) {
      await page.evaluate((index) => window.__clickCell(index), i);
    }
    expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan.length)).toBe(10);
    await page.locator('#confirmBuildBtn').click();
    if (await page.locator('#confirmRiskyBuild').isVisible().catch(() => false)) {
      await page.locator('#confirmRiskyBuild').click();
    }
    await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(10);
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('an empty settled city does not continuously submit WebGL frames', async ({ gamePage: page }) => {
    await page.waitForTimeout(350);
    const before = await page.evaluate(() => window.__getCityRendererStats().renderCount);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__getCityRendererStats().renderCount);
    // 1초 정산 경계와 겹치는 단발성 HUD 갱신까지 허용한다.
    expect(after - before).toBeLessThanOrEqual(2);
  });

  test('representative 37-cell hex city stays within the 24 draw-call budget', async ({ gamePage: page }) => {
    await renderRepresentativeCity(page);
    const stats = await page.evaluate(() => window.__getCityRendererStats());

    expect(stats.occupiedCells).toBe(37);
    expect(stats.facilityInstances).toBe(37);
    expect(stats.drawCalls).toBeLessThanOrEqual(24);
  });

  test('active zones, operating modes, and a climate event stay inside the same render budget', async ({ gamePage: page }) => {
    await renderRepresentativeCity(page);
    const before = await page.evaluate(() => window.__getCityRendererStats());
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.progression.chapter = 3;
      state.progression.objectiveSetId = 'resilience';
      state.elapsedGameHours = 40;
      state.grid[1].operationMode = 'saving';
      state.grid[2].operationMode = 'boost';
      state.grid[7].batteryPolicy = 'reserve30';
      state.events.schedule = [{
        id: 'perf-heatwave', type: 'heatwave', announceAt: 34, startAt: 40, endAt: 48,
      }];
      state.events.activeId = 'perf-heatwave';
      window.__refreshGameForTest();
    });
    await page.waitForFunction((renderCount) => window.__getCityRendererStats().renderCount > renderCount, before.renderCount);
    const stats = await page.evaluate(() => window.__getCityRendererStats());

    expect(stats.occupiedCells).toBe(37);
    expect(Object.values(stats.zoneTileCounts).reduce((sum, count) => sum + count, 0)).toBe(18);
    expect(stats.drawCalls).toBeLessThanOrEqual(24);
    expect(stats.resourceRevision).toBe(before.resourceRevision);
    await expect(page.locator('#forecastStrip')).toContainText('현재 이벤트');
    await expect(page.locator('#forecastStrip')).toContainText('폭염');
  });

  test('a settled representative city does not continuously submit ambient frames', async ({ gamePage: page }) => {
    await renderRepresentativeCity(page);
    const before = await page.evaluate(() => window.__getCityRendererStats().renderCount);
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => window.__getCityRendererStats().renderCount);
    // 1초 정산 경계의 단발성 HUD 갱신까지 허용한다.
    expect(after - before).toBeLessThanOrEqual(2);
  });

  test('state redraws reuse persistent GPU resources', async ({ gamePage: page }) => {
    await renderRepresentativeCity(page);
    const before = await page.evaluate(() => window.__getCityRendererStats());

    await page.evaluate(() => {
      for (let index = 0; index < 30; index++) {
        const state = window.__GAME_STATE__;
        state.selectedCell = index % state.grid.length;
        state.selectedFacility = index % 2 ? 'factory' : 'residential';
        window.__renderCityForTest();
      }
    });
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__getCityRendererStats());

    expect(after.resourceRevision).toBe(before.resourceRevision);
    expect(after.geometryCount).toBe(before.geometryCount);
  });

  test('30 preview redraws create and delete zero WebGL buffers after warm-up', async ({ page }) => {
    await page.addInitScript(() => {
      window.__GPU_BUFFER_COUNTS__ = { created: 0, deleted: 0 };
      const instrumented = new WeakSet();
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function wrappedGetContext(type, ...args) {
        const context = originalGetContext.call(this, type, ...args);
        if (!context || (type !== 'webgl' && type !== 'webgl2')) return context;
        const prototype = Object.getPrototypeOf(context);
        if (instrumented.has(prototype)) return context;
        instrumented.add(prototype);
        const createBuffer = prototype.createBuffer;
        const deleteBuffer = prototype.deleteBuffer;
        prototype.createBuffer = function measuredCreateBuffer(...bufferArgs) {
          window.__GPU_BUFFER_COUNTS__.created++;
          return createBuffer.apply(this, bufferArgs);
        };
        prototype.deleteBuffer = function measuredDeleteBuffer(...bufferArgs) {
          window.__GPU_BUFFER_COUNTS__.deleted++;
          return deleteBuffer.apply(this, bufferArgs);
        };
        return context;
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__GAME_STATE__ && window.__getCityAssetStatus?.().state === 'ready');
    await page.waitForTimeout(1400);
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      const next = page.locator('#storyNext');
      if (!await next.isVisible().catch(() => false)) break;
      await next.click();
    }
    await renderRepresentativeCity(page);
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      window.__GPU_BUFFER_COUNTS__.created = 0;
      window.__GPU_BUFFER_COUNTS__.deleted = 0;
      for (let index = 0; index < 30; index++) {
        const state = window.__GAME_STATE__;
        state.selectedCell = index % state.grid.length;
        state.selectedFacility = index % 2 ? 'factory' : 'residential';
        window.__renderCityForTest();
      }
    });
    await page.waitForTimeout(150);

    expect(await page.evaluate(() => window.__GPU_BUFFER_COUNTS__)).toEqual({ created: 0, deleted: 0 });
  });

  test('30 HUD panel toggles create and delete zero WebGL buffers', async ({ page }) => {
    await page.addInitScript(() => {
      window.__GPU_BUFFER_COUNTS__ = { created: 0, deleted: 0 };
      const instrumented = new WeakSet();
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function wrappedGetContext(type, ...args) {
        const context = originalGetContext.call(this, type, ...args);
        if (!context || (type !== 'webgl' && type !== 'webgl2')) return context;
        const prototype = Object.getPrototypeOf(context);
        if (instrumented.has(prototype)) return context;
        instrumented.add(prototype);
        const createBuffer = prototype.createBuffer;
        const deleteBuffer = prototype.deleteBuffer;
        prototype.createBuffer = function measuredCreateBuffer(...bufferArgs) {
          window.__GPU_BUFFER_COUNTS__.created++;
          return createBuffer.apply(this, bufferArgs);
        };
        prototype.deleteBuffer = function measuredDeleteBuffer(...bufferArgs) {
          window.__GPU_BUFFER_COUNTS__.deleted++;
          return deleteBuffer.apply(this, bufferArgs);
        };
        return context;
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__GAME_STATE__ && window.__getCityAssetStatus?.().state === 'ready');
    await page.waitForTimeout(1400);
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      const next = page.locator('#storyNext');
      if (!await next.isVisible().catch(() => false)) break;
      await next.click();
    }
    await renderRepresentativeCity(page);
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.progression.chapter = 3;
      state.elapsedGameHours = 40;
      state.grid[1].operationMode = 'saving';
      state.grid[2].operationMode = 'boost';
      state.grid[7].batteryPolicy = 'reserve30';
      state.events.schedule = [{
        id: 'perf-low-wind', type: 'lowWind', announceAt: 40, startAt: 46, endAt: 52,
      }];
      state.events.activeId = null;
      window.__refreshGameForTest();
    });
    await expect(page.locator('#forecastStrip')).toContainText('무풍');
    await page.evaluate(() => {
      window.__GPU_BUFFER_COUNTS__.created = 0;
      window.__GPU_BUFFER_COUNTS__.deleted = 0;
    });

    await page.evaluate(() => {
      for (let index = 0; index < 30; index++) {
        const target = index % 2 ? 'status' : 'build';
        document.querySelector(`[data-hud-target="${target}"]`).click();
      }
    });
    await page.waitForFunction(() => window.__getWorldHudState().activePanel === 'status');

    expect(await page.evaluate(() => window.__GPU_BUFFER_COUNTS__)).toEqual({ created: 0, deleted: 0 });
  });
});
