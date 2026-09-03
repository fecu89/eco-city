import { test, expect } from '../fixtures/game-test.js';
import { FACILITY_DIRECTIONS } from '../../src/core/Constants.js';

// 칸별 풍향과 해안 조차는 판마다 무작위다. 방향 UI를 눈금까지 재려면 씨앗을 고정한다 —
// 어떤 값이든 고정이면 되고, 여기서는 20400101을 쓴다(같은 씨앗이면 늘 같은 섬이다).
const ENVIRONMENT_SEED = 20400101;

async function openBuild(page) {
  const mobile = await page.evaluate(() => matchMedia('(max-width: 760px)').matches);
  await page.locator(mobile ? '.mobile-bar [data-hud-target="build"]' : '.hud-rail [data-hud-target="build"]').click();
  await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
}

// 방향을 고를 수 있는 발전 시설이 모두 열린 도시. expanded를 주면 37칸(3링=해안)까지 연다.
async function prepareCity(page, { expanded = false } = {}) {
  await page.evaluate(({ seed, expandBoard }) => {
    const state = window.__GAME_STATE__;
    window.__setTimeScale(0);
    state.questIndex = 12;
    state.credits = 400;
    ['solar', 'wind', 'tidal'].forEach((type) => state.unlockedFacilities.add(type));
    state.research.techLevels.tidal = 1;
    // 발전 시설은 인력을 쓴다. 1번 칸의 주거지가 인구를 대 준다(0번은 배치용으로 비워 둔다).
    state.grid[1] = { type: 'residential', level: 3, rotation: 0, priority: 'normal' };
    if (expandBoard) {
      state.boardRadius = 3;
      state.grid = [...state.grid, ...Array(37 - state.grid.length).fill(null)];
      state.expansion = {
        phase: 2,
        firstChoice: 'east',
        activeCellIndices: Array.from({ length: 37 }, (_, index) => index),
      };
    }
    // __setEnvironmentSeed가 refreshAll까지 부른다.
    window.__setEnvironmentSeed(seed);
  }, { seed: ENVIRONMENT_SEED, expandBoard: expanded });
}

const planOf = (page) => page.evaluate(() => window.__GAME_STATE__.constructionPlan);
const ghostRotation = (page) => page.evaluate(() => window.__getCityRendererStats().ghostRotation);
const planGhostYaw = (page) => page.evaluate(() => window.__getCityRendererStats().planGhostRotationsY[0]);

// three의 오일러 각은 (-π, π]로 접히므로 두 yaw의 차이도 같은 구간으로 되돌려서 잰다.
function yawDelta(after, before) {
  return ((after - before) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
}

test('태양광 계획은 회전·방향 버튼을 함께 띄우고, 회전은 계획과 고스트를 같이 돌린다', async ({ gamePage: page }) => {
  await prepareCity(page);
  await openBuild(page);
  await page.locator('#facilityDock [data-facility="solar"]').click();
  await page.evaluate(() => window.__clickCell(0));

  await expect(page.locator('#rotateBuildBtn')).toBeVisible();
  await expect(page.locator('#directionInfoBtn')).toBeVisible();
  // 태양광 기본 방향은 남향(FACILITY_DIRECTIONS 인덱스 4)이다.
  expect(await planOf(page)).toEqual([{ index: 0, type: 'solar', rotation: 4 }]);
  expect(await ghostRotation(page)).toBe(4);
  const beforeYaw = await planGhostYaw(page);

  await page.locator('#rotateBuildBtn').click();
  await page.locator('#rotateBuildBtn').click();

  expect(await planOf(page)).toEqual([{ index: 0, type: 'solar', rotation: 6 }]);
  expect(await ghostRotation(page)).toBe(6);
  // 45° 두 칸을 시계 방향으로 돌렸으므로 yaw는 90° 줄어든다(three의 +Y는 반시계).
  expect(yawDelta(await planGhostYaw(page), beforeYaw)).toBeCloseTo(-Math.PI / 2, 2);

  // 건설 확정 바도 고른 방향과 그 방향의 출력을 함께 알려 준다.
  await expect(page.locator('#buildConfirmText')).toContainText('방향 서 · 출력 72%');
});

test('방향이 없는 시설에는 방향 버튼이 뜨지 않는다', async ({ gamePage: page }) => {
  await prepareCity(page);
  await openBuild(page);
  await page.evaluate(() => window.__clickCell(0));

  await expect(page.locator('#rotateBuildBtn')).toBeVisible();
  await expect(page.locator('#directionInfoBtn')).toBeHidden();
  await expect(page.locator('#buildConfirmText')).not.toContainText('출력');
});

test('보드에 포커스가 있으면 R 키가 위젯의 회전 버튼과 같은 일을 한다', async ({ gamePage: page }) => {
  await prepareCity(page);
  await openBuild(page);
  await page.locator('#facilityDock [data-facility="solar"]').click();
  await page.evaluate(() => window.__clickCell(0));

  await page.focus('#cityGrid');
  await page.keyboard.press('r');
  expect(await planOf(page)).toEqual([{ index: 0, type: 'solar', rotation: 5 }]);
  expect(await ghostRotation(page)).toBe(5);
});

test('태양광 방향 모달은 8방위 출력을 보여주고, 고른 방향을 계획에 적고 닫힌다', async ({ gamePage: page }) => {
  await prepareCity(page);
  await openBuild(page);
  await page.locator('#facilityDock [data-facility="solar"]').click();
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#directionInfoBtn').click();

  await expect(page.locator('#modalCard')).toBeVisible();
  await expect(page.locator('#modalCard')).toContainText('태양광 방향별 발전량');
  await expect(page.locator('#modalCard')).toContainText('태양은 남쪽에 있습니다');
  await expect(page.locator('#modalCard [data-direction]')).toHaveCount(8);
  // 태양광은 어느 칸에서나 남향이 최적이고, 정반대인 북향이 가장 나쁘다.
  await expect(page.locator('#modalCard [data-direction="S"]')).toHaveAttribute('data-best', 'true');
  await expect(page.locator('#modalCard [data-direction="S"]')).toContainText('출력 100%');
  await expect(page.locator('#modalCard [data-direction="N"]')).toHaveAttribute('data-best', 'false');
  await expect(page.locator('#modalCard [data-direction="N"]')).toContainText('출력 38%');
  // 지금 계획의 방향(남)이 눌린 상태로 표시된다.
  await expect(page.locator('#modalCard [data-direction="S"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#modalCard [data-direction="E"]').click();
  await expect(page.locator('#modalCard')).toBeHidden();
  expect(await planOf(page)).toEqual([{ index: 0, type: 'solar', rotation: 2 }]);
  expect(await ghostRotation(page)).toBe(2);
  await expect(page.locator('#buildConfirmText')).toContainText('방향 동 · 출력 72%');
});

test('풍력 방향 모달의 최적 방향은 그 칸의 풍향과 같다', async ({ gamePage: page }) => {
  await prepareCity(page);
  await openBuild(page);
  await page.locator('#facilityDock [data-facility="wind"]').click();
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#directionInfoBtn').click();

  const { windDirection } = await page.evaluate(() => window.__getEnvironmentAt(0));
  const wind = FACILITY_DIRECTIONS[windDirection];
  await expect(page.locator('#modalCard')).toContainText(`이 칸의 바람: ${wind.label}`);
  await expect(page.locator('#modalCard [data-best="true"]')).toHaveCount(1);
  await expect(page.locator('#modalCard [data-best="true"]')).toHaveAttribute('data-direction', wind.id);
  await expect(page.locator(`#modalCard [data-direction="${wind.id}"]`)).toContainText('출력 100%');
});

test('조력은 내륙 칸을 거부하고 해안 칸에서 그 칸의 조차를 알려 준다', async ({ gamePage: page }) => {
  await prepareCity(page, { expanded: true });
  await openBuild(page);
  await page.locator('#facilityDock [data-facility="tidal"]').click();

  // 내륙 칸(0번)은 미리보기부터 빨간 불가 상태이고, 눌러도 계획에 들어가지 않는다.
  expect(await page.evaluate(() => window.__getCellVisual(0).placementAllowed)).toBe(false);
  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('.toast', { hasText: '해안' })).toBeVisible();
  expect(await planOf(page)).toEqual([]);

  // 3링(19~36번)은 바다와 맞닿은 해안 칸이다.
  const { tidalRange } = await page.evaluate(() => window.__getEnvironmentAt(19));
  expect(tidalRange).toBeGreaterThan(0);
  await page.evaluate(() => window.__clickCell(19));
  expect(await planOf(page)).toEqual([{ index: 19, type: 'tidal', rotation: 0 }]);
  await expect(page.locator('#buildConfirmText')).toContainText(`조차 ${tidalRange}m`);
  // 조력은 방향을 고르는 시설이 아니다.
  await expect(page.locator('#directionInfoBtn')).toBeHidden();
});

test('확정한 방향은 도시와 시설 창에 그대로 남는다', async ({ gamePage: page }) => {
  await prepareCity(page);
  await openBuild(page);
  await page.locator('#facilityDock [data-facility="solar"]').click();
  await page.evaluate(() => window.__clickCell(0));
  await page.locator('#rotateBuildBtn').click();
  await page.locator('#confirmBuildBtn').click();
  await expect.poll(() => page.evaluate(() => window.__GAME_STATE__.grid.filter(Boolean).length)).toBe(2);

  const entity = await page.evaluate(() => (
    JSON.parse(window.render_game_to_text()).entities.find(({ index }) => index === 0)
  ));
  expect(entity).toMatchObject({ index: 0, type: 'solar', rotation: 5 });

  // 공사가 끝난 뒤에는 방향을 바꿀 수 없고, 시설 창이 현재 방향과 최적 방향을 함께 보여준다.
  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0].project = null;
    window.__refreshGameForTest();
  });
  await page.evaluate(() => window.__clickCell(0));
  await expect(page.locator('#modalCard')).toContainText('방향 남서 · 출력 92% (최적 남)');
  await expect(page.locator('#modalCard #rotateBuildBtn')).toHaveCount(0);
});
