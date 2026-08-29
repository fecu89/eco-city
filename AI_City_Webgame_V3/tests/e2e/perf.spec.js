import { test, expect } from '../fixtures/game-test.js';
import { clickCell } from '../helpers/playthrough.js';

async function renderRepresentativeCity(page) {
  await page.waitForFunction(() => window.__getCityAssetStatus?.().state === 'ready');
  await page.evaluate(() => {
    const types = [
      'residential', 'factory', 'data', 'thermal', 'nuclear',
      'solar', 'wind', 'battery', 'cooling', 'green',
    ];
    const state = window.__GAME_STATE__;
    state.gridSize = 6;
    state.grid = Array.from({ length: 36 }, (_, index) => ({
      type: types[index % types.length],
      level: (index % 3) + 1,
    }));
    window.__renderCityForTest();
  });
  await page.waitForTimeout(100);
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
    await page.locator('[data-hud-target="build"]').first().click();
    for (let i = 0; i < 10; i++) {
      await clickCell(page, i);
    }
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('an empty settled city does not continuously submit WebGL frames', async ({ gamePage: page }) => {
    await page.waitForTimeout(350);
    const before = await page.evaluate(() => window.__getCityRendererStats().renderCount);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__getCityRendererStats().renderCount);
    // 5초 전력선 점멸 구간과 겹치면 밝힘/복원 각 1프레임까지 허용한다.
    expect(after - before).toBeLessThanOrEqual(2);
  });

  test('representative 6×6 city stays within the 24 draw-call budget', async ({ gamePage: page }) => {
    await renderRepresentativeCity(page);
    const stats = await page.evaluate(() => window.__getCityRendererStats());

    expect(stats.occupiedCells).toBe(36);
    expect(stats.facilityInstances).toBe(36);
    expect(stats.drawCalls).toBeLessThanOrEqual(24);
  });

  test('a settled representative city does not continuously submit ambient frames', async ({ gamePage: page }) => {
    await renderRepresentativeCity(page);
    const before = await page.evaluate(() => window.__getCityRendererStats().renderCount);
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => window.__getCityRendererStats().renderCount);
    expect(after - before).toBeLessThanOrEqual(1);
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
    await renderRepresentativeCity(page);
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
