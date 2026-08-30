// 여러 테스트 파일에서 재사용하는 단계 진행 헬퍼. 퀴즈 정답은 QUIZ_BANK 설계상 항상 옵션 0번이다.
// 보드가 3D(Three.js + 레이캐스팅)라 좌표 클릭은 카메라 각도에 취약하다. 게임 로직 테스트는
// window.__clickCell(index)로 클릭을 시뮬레이션하고, 레이캐스팅 자체는 별도의 마우스 좌표 테스트로 검증한다.
export async function clickCell(page, index) {
  await page.evaluate((i) => window.__clickCell(i), index);
  const confirm = page.locator('#confirmBuildBtn');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
}

export async function openHudPanel(page, target) {
  const state = await page.evaluate(() => window.__getWorldHudState());
  if (state.activePanel !== target) {
    await page.locator(`[data-hud-target="${target}"]`).first().click();
  }
  await page.locator(`[data-hud-panel="${target}"]`).waitFor({ state: 'visible' });
}

export async function clickHudAction(page, target, selector) {
  await openHudPanel(page, target);
  await page.locator(selector).click();
}

export async function buildStarterCity(page, count = 5) {
  await page.evaluate(() => {
    const state = window.__GAME_STATE__;
    state.questIndex = 15;
    state.credits = 10;
    window.__refreshGameForTest();
  });
  await openHudPanel(page, 'build');
  for (let i = 0; i < count; i++) {
    await page.evaluate((index) => window.__clickCell(index), i);
  }
  await page.locator('#confirmBuildBtn').click();
  // 일괄 건설로 운영 적자가 예상되면 이 헬퍼는 의도적으로 경고를 확인하고 계속 진행한다.
  const riskyBuild = page.locator('#confirmRiskyBuild');
  if (await riskyBuild.isVisible().catch(() => false)) await riskyBuild.click();
  await expectPlanCommitted(page, count);
}

async function expectPlanCommitted(page, count) {
  await page.waitForFunction((expected) => window.__GAME_STATE__.grid.filter(Boolean).length === expected, count);
}

export async function gameStateSnapshot(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}
