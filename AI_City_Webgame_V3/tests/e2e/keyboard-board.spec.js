import { test, expect } from '../fixtures/game-test.js';

// 도시 보드는 Three.js 캔버스 하나라 DOM 칸이 없다. 포인터가 없는 학생(키보드 전용,
// 보조기기)이 도시를 지을 수 있으려면 #cityGrid 자체가 포커스를 받고 화살표·Enter로
// 칸을 옮기고 고를 수 있어야 한다. 아래 테스트가 그 경로 전체를 지킨다.

async function openBuild(page) {
  const mobile = await page.evaluate(() => matchMedia('(max-width: 760px)').matches);
  await page.locator(mobile ? '.mobile-bar [data-hud-target="build"]' : '.hud-rail [data-hud-target="build"]').click();
  await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
}

const cursorIndex = (page) => page.evaluate(() => window.__getCityRendererStats().keyboardCursorIndex);

test('보드는 포커스를 받고 키 안내를 라벨로 알린다', async ({ gamePage: page }) => {
  const board = page.locator('#cityGrid');
  await expect(board).toHaveAttribute('tabindex', '0');
  await expect(board).toHaveAttribute('role', 'application');
  const label = await board.getAttribute('aria-label');
  expect(label).toContain('화살표');
  expect(label).toContain('Enter');
  expect(label).toContain('Escape');

  // 도움말 버튼에서 Tab을 눌러도 보드에 닿을 수 있어야 한다(순수 키보드 이동 경로).
  await page.focus('#helpBtn');
  await expect.poll(async () => {
    for (let step = 0; step < 40; step += 1) {
      if (await page.evaluate(() => document.activeElement?.id === 'cityGrid')) return true;
      await page.keyboard.press('Tab');
    }
    return false;
  }).toBe(true);
});

test('화살표로 커서를 옮기고 Enter로 건설 계획을 세운 뒤 O 버튼으로 확정한다', async ({ gamePage: page }) => {
  await openBuild(page);
  await page.focus('#cityGrid');

  // 첫 화살표는 보드 안으로 들어오는 동작이다 — 중앙 칸에 커서를 놓는다.
  await page.keyboard.press('ArrowRight');
  expect(await cursorIndex(page)).toBe(0);
  await expect(page.locator('#srAnnouncer')).toHaveText('칸 0: 빈 대지');
  // 시설이 무장된 상태이므로 커서 칸에 건설 고스트가 뜬다(호버와 같은 표시 수단).
  expect(await page.evaluate(() => window.__getCityRendererStats().ghostVisible)).toBe(true);

  await page.keyboard.press('ArrowRight');
  const first = await cursorIndex(page);
  expect(first).toBeGreaterThan(0);
  await expect(page.locator('#srAnnouncer')).toHaveText(`칸 ${first}: 빈 대지`);

  await page.keyboard.press('ArrowRight');
  const target = await cursorIndex(page);
  expect(target).not.toBe(first);
  await expect(page.locator('#srAnnouncer')).toHaveText(`칸 ${target}: 빈 대지`);

  await page.keyboard.press('Enter');
  await expect(page.locator('#buildConfirm')).toBeVisible();
  expect(await page.evaluate(() => window.__GAME_STATE__.constructionPlan))
    .toEqual([{ index: target, type: 'residential', rotation: 0 }]);
  expect(await page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(0);

  // O 위젯은 진짜 버튼이라 키보드로도 눌린다.
  await page.locator('#confirmBuildBtn').press('Enter');
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(1);
  expect(await page.evaluate((index) => Boolean(window.__GAME_STATE__.grid[index]), target)).toBe(true);
});

test('Home은 중앙으로, Escape는 커서를 거둔다', async ({ gamePage: page }) => {
  await openBuild(page);
  await page.focus('#cityGrid');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await cursorIndex(page)).not.toBe(0);

  await page.keyboard.press('Home');
  expect(await cursorIndex(page)).toBe(0);

  await page.keyboard.press('Escape');
  expect(await cursorIndex(page)).toBe(-1);
  expect(await page.evaluate(() => document.activeElement?.id === 'cityGrid')).toBe(false);
});

test('시설을 고르지 않은 상태에서 Enter는 지어진 시설의 관리 창을 연다', async ({ gamePage: page }) => {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    window.__setTimeScale(0);
    state.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
    window.__refreshGameForTest();
  });

  await page.focus('#cityGrid');
  await page.keyboard.press('ArrowRight');
  expect(await cursorIndex(page)).toBe(0);
  await expect(page.locator('#srAnnouncer')).toHaveText('칸 0: 주거지 Lv.1');

  await page.keyboard.press('Enter');
  await expect(page.locator('#modalCard')).toBeVisible();
  await expect(page.locator('#modalCard')).toContainText('주거지');
});

test('화살표는 아직 열리지 않은 대지로 커서를 보내지 않는다', async ({ gamePage: page }) => {
  // 반경 3으로 판을 넓히되 초기 19칸만 사용 가능한 상태 — 바깥 18칸은 잠겨 있다.
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    window.__setTimeScale(0);
    state.boardRadius = 3;
    state.grid = [...state.grid, ...Array(37 - state.grid.length).fill(null)];
    state.expansion = {
      phase: 0,
      firstChoice: null,
      activeCellIndices: Array.from({ length: 19 }, (_, index) => index),
    };
    window.__refreshGameForTest();
  });
  expect(await page.evaluate(() => window.__getCityRendererStats().inactiveTileCount)).toBe(18);

  await page.focus('#cityGrid');
  const visited = new Set();
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowRight',
    'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowUp']) {
    await page.keyboard.press(key);
    visited.add(await cursorIndex(page));
  }

  // 커서는 실제로 여러 칸을 돌아다녔지만 잠긴 19~36번에는 한 번도 들어가지 않았다.
  expect(visited.size).toBeGreaterThan(2);
  expect([...visited].filter((index) => index < 0 || index >= 19)).toEqual([]);
});
