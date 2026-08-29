// 여러 테스트 파일에서 재사용하는 단계 진행 헬퍼. 퀴즈 정답은 QUIZ_BANK 설계상 항상 옵션 0번이다.
// 보드가 3D(Three.js + 레이캐스팅)라 좌표 클릭은 카메라 각도에 취약하다. 게임 로직 테스트는
// window.__clickCell(index)로 클릭을 시뮬레이션하고, 레이캐스팅 자체는 별도의 마우스 좌표 테스트로 검증한다.
export async function clickCell(page, index) {
  await page.evaluate((i) => window.__clickCell(i), index);
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
  await openHudPanel(page, 'build');
  for (let i = 0; i < count; i++) {
    await clickCell(page, i);
    await page.waitForTimeout(80);
  }
}

export async function advanceToCrisis(page) {
  await clickHudAction(page, 'menu', '#advanceBtn');
  await page.waitForTimeout(400);
  await page.locator('#toLearningBtn').click();
  await page.waitForTimeout(300);
}

export async function passEnergyScaleAndQuiz(page) {
  await page.locator('#revealScaleBtn').click();
  await page.waitForTimeout(1100);
  await page.locator('#energyContinueBtn').click();
  await page.waitForTimeout(300);

  for (let i = 0; i < 6; i++) {
    const visible = await page.locator('.quiz-options').first().isVisible().catch(() => false);
    if (!visible) break;
    await page.locator('.quiz-option[data-i="0"]').click();
    await page.waitForTimeout(150);
    await page.locator('#quizNextBtn').click();
    await page.waitForTimeout(200);
  }
  await page.locator('#quizResultBtn').click();
  await page.waitForTimeout(300);
}

export async function saveReflectionAndEnterDiagnosis(page, text = '전력과 냉각수 비용을 미리 확인하지 않아서 결과를 몰랐다.') {
  await page.locator('#reflectionInput').fill(text);
  await page.locator('#reflectionSaveBtn').click();
  await page.waitForTimeout(300);
}

export async function finishDiagnosisAndEnterRedesign(page) {
  await clickHudAction(page, 'menu', '#advanceBtn');
  await page.waitForTimeout(600);
}

// 1단계부터 5단계(재설계) 진입까지 한 번에 진행.
export async function playThroughToRedesign(page) {
  await buildStarterCity(page);
  await advanceToCrisis(page);
  await passEnergyScaleAndQuiz(page);
  await saveReflectionAndEnterDiagnosis(page);
  await finishDiagnosisAndEnterRedesign(page);
}

export async function gameStateSnapshot(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}
