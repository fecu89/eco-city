// 여러 테스트 파일에서 재사용하는 단계 진행 헬퍼. 퀴즈 정답은 QUIZ_BANK 설계상 항상 옵션 0번이다.
// 보드가 3D(Three.js + 레이캐스팅)라 좌표 클릭은 카메라 각도에 취약하다. 게임 로직 테스트는
// window.__clickCell(index)로 클릭을 시뮬레이션하고, 레이캐스팅 자체는 별도의 마우스 좌표 테스트로 검증한다.
export async function clickCell(page, index) {
  await page.evaluate((i) => window.__clickCell(i), index);
  const confirm = page.locator('#confirmBuildBtn');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
}

export async function clickCanvasCell(page, index) {
  const point = await page.evaluate((cellIndex) => window.__getCellScreenPosition?.(cellIndex) ?? null, index);
  if (!point) throw new Error(`No projected canvas position for cell ${index}`);
  await page.mouse.click(point.x, point.y);
}

export async function completeProjectsViaGameClock(page, indices) {
  await page.evaluate((targetIndices) => {
    const state = window.__GAME_STATE__;
    const targets = targetIndices.map((index) => state.grid[index]).filter(Boolean);
    const remainingHours = Math.max(0, ...targets.map((cell) => (
      cell.project
        ? Math.max(0, cell.project.durationHours - cell.project.elapsedHours)
        : 0
    )));
    for (let hour = 0; hour < remainingHours; hour += 1) window.__settleSimulationHour();
  }, indices);
  await page.waitForFunction((targetIndices) => (
    targetIndices.every((index) => window.__GAME_STATE__.grid[index]?.project == null)
  ), indices);
}

export async function buildPlanViaUi(page, placements) {
  await openHudPanel(page, 'build');
  for (const [index, type] of placements) {
    await page.locator(`#facilityDock [data-facility="${type}"]`).click();
    await clickCanvasCell(page, index);
  }
  await page.locator('#confirmBuildBtn').click();
  const riskyBuild = page.locator('#confirmRiskyBuild');
  if (await riskyBuild.isVisible().catch(() => false)) await riskyBuild.click();
  await page.waitForFunction((expected) => (
    expected.every(([index, type]) => window.__GAME_STATE__.grid[index]?.type === type)
  ), placements);
  await completeProjectsViaGameClock(page, placements.map(([index]) => index));
}

export async function claimProgressViaUi(page) {
  await openHudPanel(page, 'quest');
  const claim = page.locator('#questPanelClaimBtn');
  await claim.waitFor({ state: 'visible' });
  await claim.click();
}

export async function chooseExpansionViaUi(page, side) {
  const choice = page.locator(`[data-expansion-side="${side}"]`);
  await choice.waitFor({ state: 'visible' });
  await choice.click();
  await page.waitForFunction((expected) => window.__GAME_STATE__.expansion.firstChoice === expected, side);
}

export async function waitForObjectiveReady(page, setId, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await page.evaluate((expected) => {
      const state = window.__GAME_STATE__;
      if (state.progression.objectiveSetId !== expected) return false;
      const progress = Object.values(state.progression.objectiveProgress || {});
      const required = expected === 'resilience' ? 3 : 2;
      return progress.filter((item) => item.completed).length >= required;
    }, setId);
    if (ready) return;

    const preparation = page.locator('#eventPreparationCloseBtn');
    if (await preparation.isVisible().catch(() => false)) {
      await preparation.click();
      await runAtFourTimes(page);
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Objective set did not become ready: ${setId}`);
}

export async function waitForCompletedEvents(page, count = 2, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate((required) => window.__GAME_STATE__.events.completed.length >= required, count)) return;
    const preparation = page.locator('#eventPreparationCloseBtn');
    if (await preparation.isVisible().catch(() => false)) {
      await preparation.click();
      await runAtFourTimes(page);
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Completed climate events did not reach ${count}`);
}

export async function upgradeFacilityViaUi(page, index) {
  await clickCanvasCell(page, index);
  const upgrade = page.locator('#upgradeBtn');
  await upgrade.waitFor({ state: 'visible' });
  await upgrade.click();
  const confirm = page.locator('#confirmUpgradeProjectBtn');
  await confirm.waitFor({ state: 'visible' });
  await confirm.click();
  await page.waitForFunction((cellIndex) => window.__GAME_STATE__.grid[cellIndex]?.project?.kind === 'upgrade', index);
  await completeProjectsViaGameClock(page, [index]);
  await page.waitForFunction((cellIndex) => window.__GAME_STATE__.grid[cellIndex]?.level >= 2, index);
}

export async function finishResearchViaUi(page, dataCenterIndex, researchId) {
  await clickCanvasCell(page, dataCenterIndex);
  const start = page.locator(`[data-research-start="${researchId}"]`);
  await start.waitFor({ state: 'visible' });
  await start.click();
  await page.locator(`[data-research-accelerate="${researchId}"]`).click();
  for (let question = 0; question < 4; question += 1) {
    const correctIndex = await page.evaluate(() => {
      const state = window.__GAME_STATE__;
      return state.quizPool[state.quizIndex].options.findIndex((option) => option.correct);
    });
    await page.locator(`#questQuizOptions [data-index="${correctIndex}"]`).click();
    await page.locator('#questQuizNext').click();
  }
  await page.locator('#questQuizFinish').click();
  await page.waitForFunction((id) => window.__GAME_STATE__.research.completedIds.has(id), researchId);
  await page.locator('.modal-card .close-modal').click();
}

export async function setBatteryPolicyViaUi(page, index, policy) {
  await clickCanvasCell(page, index);
  const choice = page.locator(`[data-battery-policy="${policy}"]`);
  await choice.waitFor({ state: 'visible' });
  await choice.click();
  await page.waitForFunction(({ cellIndex, expected }) => (
    window.__GAME_STATE__.grid[cellIndex]?.batteryPolicy === expected
  ), { cellIndex: index, expected: policy });
  await page.locator('.modal-card .close-modal').click();
}

export async function startStressTestViaUi(page) {
  await openHudPanel(page, 'quest');
  await page.locator('#questPanelClaimBtn').click();
  await page.locator('#startStressTestBtn').waitFor({ state: 'visible' });
  await page.locator('#startStressTestBtn').click();
  await page.waitForFunction(() => window.__GAME_STATE__.stressTest.status === 'running');
}

export async function runAtFourTimes(page) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const preparation = page.locator('#eventPreparationCloseBtn');
    if (await preparation.isVisible().catch(() => false)) {
      await preparation.click();
      continue;
    }
    const scale = await page.evaluate(() => window.__GAME_STATE__.timeScale);
    if (scale === 4) return;
    const control = page.locator(scale === 0 ? '#toggleTimeBtn' : '#fastForwardBtn');
    try {
      await control.click({ timeout: 2000 });
    } catch (error) {
      if (!await preparation.isVisible().catch(() => false)) throw error;
    }
    await page.waitForTimeout(50);
  }
  throw new Error('Could not resume four-times play after climate preparation');
}

export async function pauseSimulationViaUi(page) {
  if (await page.evaluate(() => window.__GAME_STATE__.timeScale) !== 0) {
    await page.locator('#toggleTimeBtn').click();
  }
  await page.waitForFunction(() => window.__GAME_STATE__.timeScale === 0);
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
