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

// 예산의 기준이 되는 최악의 경우: 37칸이 모든 (시설, 레벨) 조합을 동시에 갖고(레벨마다
// 실제 GLB가 다른 시설은 조합마다 InstancedMesh를 하나씩 더 쓴다) 야간 창문 조명, 공사
// 기초·비계 두 현장, 연기와 상태등 ambient, 호버 고스트, 계획 고스트, 선택 마커까지
// 한 프레임에 모두 켜진 상태다. 이 조합의 실측치는 47 draw calls이고 예산은 실측 + 2다
// (ADR-0003에 같은 수치와 시나리오를 기록해 두었다).
const WORST_CASE_DRAW_CALL_BUDGET = 49;

async function renderWorstCaseCity(page) {
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
    // 0~32번 칸이 11종 x 3레벨 조합을 모두 채운다(11과 3이 서로소라 33칸이면 전부 나온다).
    state.grid = Array.from({ length: 37 }, (_, index) => (index < 33
      ? { type: types[index % types.length], level: (index % 3) + 1 }
      : null));
    state.grid[33] = {
      type: 'thermal',
      level: 1,
      project: { kind: 'build', type: 'thermal', elapsedDays: 1, durationDays: 5 },
    };
    state.grid[34] = {
      type: 'data',
      level: 2,
      project: { kind: 'upgrade', fromLevel: 2, toLevel: 3, elapsedDays: 4, durationDays: 8 },
    };
    state.selectedCell = 0;
    window.__setWorldHourForTest(2);
    window.__refreshGameForTest();
    // 마지막 renderGrid 뒤에 세워야 고스트가 살아 있다(renderGrid는 candidateIndex를 지운다).
    window.__setBuildPreviewForTest({
      enabled: true,
      type: 'residential',
      candidateIndex: 35,
      plannedItems: [{ index: 36, type: 'residential' }],
    });
    window.__triggerFacilityAmbientForTest('thermal', 3, 4000);
    window.__triggerFacilityAmbientForTest('data', 2, 1600);
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
    // 15단계 주거지 누적 허가는 9기다(FACILITY_LIMITS_BY_QUEST). 허가를 넘겨 카드가 잠기면
    // 검증하려는 "연속 배치가 예외를 던지지 않는가"가 아니라 허가 판정을 재는 테스트가 된다.
    for (let i = 0; i < 9; i++) {
      await page.locator('[data-facility="residential"]').click();
      await page.evaluate((index) => window.__clickCell(index), i);
      await page.locator('#confirmBuildBtn').click();
      if (await page.locator('#confirmRiskyBuild').isVisible().catch(() => false)) {
        await page.locator('#confirmRiskyBuild').click();
      }
    }
    await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(9);
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

  test('representative 37-cell hex city stays within the 40 draw-call budget', async ({ gamePage: page }) => {
    await renderRepresentativeCity(page);
    const stats = await page.evaluate(() => window.__getCityRendererStats());

    expect(stats.occupiedCells).toBe(37);
    expect(stats.facilityInstances).toBe(37);
    // 화력·원자력·태양광·순환냉각·데이터센터·주거지·조력·풍력이 레벨마다 실제 GLB를
    // 바꾸면서(공장·에너지저장·녹지는 스케일만 차등) 예산을 24 -> 36 -> 40으로 올렸다
    // (레벨당 InstancedMesh 최대 1개 추가, 실제로 쓰이는 조합만 지연 생성). 37칸 전부가
    // 이 시설들의 서로 다른 레벨을 동시에 갖는 최악의 경우를 기준으로 측정했다(실측 38).
    expect(stats.drawCalls).toBeLessThanOrEqual(40);
  });

  test('the worst-case night city with construction, ambient, and both ghosts stays inside the draw-call budget', async ({ gamePage: page }) => {
    await renderWorstCaseCity(page);
    const stats = await page.evaluate(() => window.__getCityRendererStats());

    // 예산이 조용히 헐거워지지 않도록, 최악의 경우를 이루는 레이어가 실제로 다 켜졌는지 먼저 확인한다.
    expect(stats.occupiedCells).toBe(35);
    expect(stats.worldPhase).toBe('night');
    expect(stats.buildingLightCount).toBeGreaterThan(0);
    expect(stats.constructionSiteCount).toBe(2);
    expect(stats.smokeEffectCount).toBeGreaterThan(0);
    expect(stats.statusLightCount).toBeGreaterThan(0);
    expect(stats.windRotorCount).toBeGreaterThan(0);
    expect(stats.greenDetailInstances).toBeGreaterThan(0);
    expect(stats.residentAgentCount).toBeGreaterThan(0);
    expect(stats.ghostVisible).toBe(true);
    expect(stats.planGhostCount).toBe(1);
    expect(stats.environment.state).toBe('ready');

    expect(stats.drawCalls).toBeLessThanOrEqual(WORST_CASE_DRAW_CALL_BUDGET);
  });

  test('active zones, operating modes, and a climate event stay inside the same render budget', async ({ gamePage: page }) => {
    await renderRepresentativeCity(page);
    const before = await page.evaluate(() => window.__getCityRendererStats());
    await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      state.progression.chapter = 3;
      state.progression.objectiveSetId = 'resilience';
      state.elapsedGameDays = 40;
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
    expect(stats.drawCalls).toBeLessThanOrEqual(40);
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
      state.elapsedGameDays = 40;
      state.grid[1].operationMode = 'saving';
      state.grid[2].operationMode = 'boost';
      state.grid[7].batteryPolicy = 'reserve30';
      state.events.schedule = [{
        id: 'perf-stagnant-air', type: 'stagnantAir', announceAt: 34, startAt: 40, endAt: 52,
      }];
      state.events.activeId = 'perf-stagnant-air';
      window.__refreshGameForTest();
    });
    // HUD가 새 상태를 다 그린 뒤에 버퍼 카운터를 0으로 되돌리기 위한 동기화 지점이다.
    await expect(page.locator('#forecastStrip')).toContainText('무풍·미세먼지');
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

  test('simulation ticks do not re-create the page icons', async ({ gamePage: page }) => {
    // lucide의 createIcons는 [data-lucide]를 전부 다시 그린다 — 이미 만들어진 SVG에도 그 속성이
    // 남아 있어, 문서 전체로 부르면 매 틱 페이지의 모든 아이콘이 새 노드로 교체된다.
    await page.evaluate(() => {
      window.__setTimeScale(0);
      window.__iconProbe = document.querySelector('#simulationHud [data-metric="power"] svg[data-lucide]');
    });
    const before = await page.evaluate(() => document.querySelectorAll('svg[data-lucide]').length);
    expect(before).toBeGreaterThan(5);

    await page.evaluate(() => { for (let day = 0; day < 20; day++) window.__settleSimulationDay(); });

    expect(await page.evaluate(() => ({
      count: document.querySelectorAll('svg[data-lucide]').length,
      sameNode: window.__iconProbe === document.querySelector('#simulationHud [data-metric="power"] svg[data-lucide]'),
    }))).toEqual({ count: before, sameNode: true });
  });
});
