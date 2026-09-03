import { test, expect } from '../fixtures/game-test.js';
import { UI_FEEDBACK } from '../../src/core/Constants.js';

async function placeResidentialAtZero(page) {
  await page.evaluate(() => {
    window.__GAME_STATE__.grid[0] = { type: 'residential', level: 1, priority: 'essential' };
    window.__refreshGameForTest();
  });
}

test.describe('board tap feedback', () => {
  // 건설 모드가 아닐 때 빈 칸을 누르면 잔소리 대신 선택이 풀린다. 안내는 세션당 한 번이면 충분하다.
  test('tapping empty ground outside build mode deselects and nags only once', async ({ gamePage: page }) => {
    await placeResidentialAtZero(page);
    await page.evaluate(() => window.__clickCell(0));
    await expect(page.locator('#modalCard[data-modal-id="facility"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal')).toHaveClass(/hidden/);
    expect(await page.evaluate(() => window.__GAME_STATE__.selectedCell)).toBe(0);

    await page.evaluate(() => window.__clickCell(3));
    expect(await page.evaluate(() => window.__GAME_STATE__.selectedCell)).toBeNull();
    await expect(page.locator('.toast', { hasText: '건설 메뉴' })).toHaveCount(1);
    await page.evaluate(() => window.__clickCell(4));
    await page.evaluate(() => window.__clickCell(5));
    await expect(page.locator('.toast', { hasText: '건설 메뉴' })).toHaveCount(1);
  });

  // 모바일은 호버가 없다 — 탭 직후 셀이 잠깐 빛나고 클릭음이 나야 "눌렸다"는 걸 안다.
  test('a real click on a cell flashes it and plays the click sound', async ({ gamePage: page }) => {
    await placeResidentialAtZero(page);
    await page.evaluate(() => {
      window.__sfxLog = [];
      window.__EVENT_BUS__.on(window.__EVENTS__.AUDIO_SFX, ({ name }) => window.__sfxLog.push(name));
    });
    const point = await page.evaluate(() => window.__getCellScreenPosition(0));
    await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => window.__getCityRendererStats().tapFlashIndex)).toBe(0);
    expect(await page.evaluate(() => window.__sfxLog)).toContain('click');
    // 헤드리스 크로미움은 프레임이 드물어(약 8fps) 반짝임 해제도 다음 프레임에서야 그려진다.
    await expect.poll(() => page.evaluate(() => window.__getCityRendererStats().tapFlashIndex), { timeout: UI_FEEDBACK.TAP_FLASH_MS + 2000 }).toBeNull();
  });
});
