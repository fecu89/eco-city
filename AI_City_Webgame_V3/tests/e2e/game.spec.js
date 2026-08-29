import { test, expect } from '../fixtures/game-test.js';
import {
  clickCell,
  buildStarterCity,
  advanceToCrisis,
  passEnergyScaleAndQuiz,
  saveReflectionAndEnterDiagnosis,
  finishDiagnosisAndEnterRedesign,
  playThroughToRedesign,
  gameStateSnapshot,
  clickHudAction,
  openHudPanel,
} from '../helpers/playthrough.js';

test.describe('boot', () => {
  test('boots into stage 1 with render_game_to_text and advanceTime available', async ({ gamePage: page }) => {
    const snap = await gameStateSnapshot(page);
    expect(snap.stage).toBe(1);
    expect(snap.mode).toBe('playing');
    expect(snap.credits).toBe(36);

    const advanced = await page.evaluate(async () => {
      const start = performance.now();
      await window.advanceTime(200);
      return performance.now() - start >= 180;
    });
    expect(advanced).toBe(true);
  });

  test('no console errors on boot', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__GAME_STATE__, { timeout: 10000 });
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });

  // 회귀 테스트: lucide의 icons 맵 키를 kebab-case로 잘못 넣으면 콘솔 warn만 뜨고(에러는 아님)
  // 아이콘이 조용히 안 보이는 상태가 된다 — "no console errors" 테스트로는 못 잡는다.
  test('header icons render as actual SVGs, not empty placeholders', async ({ page }) => {
    const warnings = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().toLowerCase().includes('icon')) warnings.push(msg.text());
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__GAME_STATE__, { timeout: 10000 });
    await page.waitForTimeout(500);
    expect(warnings).toEqual([]);
    const svgCount = await page.locator('.top-actions svg').count();
    expect(svgCount).toBe(5);
  });

  // 3D 보드 회귀 테스트: 레이캐스팅이 화면 좌표를 실제로 올바른 칸 인덱스로 환산하는지 확인한다.
  // (게임 로직 테스트는 좌표에 취약하지 않도록 window.__clickCell()을 쓰지만, 이 테스트만은
  // 진짜 마우스 클릭 + 레이캐스팅 경로 자체를 검증한다.)
  test('clicking the center of the 3D board resolves to the center grid index via raycasting', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    const box = await page.locator('.board-stage canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const snap = await gameStateSnapshot(page);
    expect(snap.entities).toEqual([{ index: 12, type: 'residential', level: 1 }]);
  });
});

test.describe('stage 1: execution', () => {
  test('placing a facility spends credits and updates the grid', async ({ gamePage: page }) => {
    const before = await gameStateSnapshot(page);
    await openHudPanel(page, 'build');
    await clickCell(page, 0);
    await page.waitForTimeout(150);
    const after = await gameStateSnapshot(page);
    expect(after.entities.length).toBe(before.entities.length + 1);
    expect(after.credits).toBeLessThan(before.credits);
  });

  test('"AI 말대로 짓기" places a facility and logs a transcript entry', async ({ gamePage: page }) => {
    await clickHudAction(page, 'advisor', '#aiBlindBuildBtn');
    await page.waitForTimeout(200);
    const transcript = await page.evaluate(() => window.__GAME_STATE__.transcripts.execution);
    expect(transcript.length).toBeGreaterThan(0);
  });

  test('advance button stays disabled below the minimum facility count', async ({ gamePage: page }) => {
    await openHudPanel(page, 'menu');
    await expect(page.locator('#advanceBtn')).toBeDisabled();
  });

  test('clicking an occupied cell opens the facility inspector instead of placing', async ({ gamePage: page }) => {
    await openHudPanel(page, 'build');
    await clickCell(page, 0);
    await page.waitForTimeout(150);
    await clickCell(page, 0);
    await expect(page.locator('.facility-inspector-grid')).toBeVisible();
  });
});

test.describe('adjacency preview and conflicts', () => {
  test('selecting a facility in the dock previews good/bad empty cells on the board', async ({ gamePage: page }) => {
    // 5x5 보드에서 index 0의 이웃은 {1, 5}. index 5에 화력발전을 놓으면, "공장"을 선택했을 때
    // 빈 칸인 index 0이 preview-good(발전소 인접)으로 표시되어야 한다.
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[5] = { type: 'thermal', level: 1 };
    });
    await openHudPanel(page, 'build');
    const factoryBtn = page.locator('#facilityDock .facility-btn', { hasText: '공장' });
    await factoryBtn.click();
    await page.waitForTimeout(150);
    const cell0Visual = await page.evaluate(() => window.__getCellVisual(0));
    expect(cell0Visual.previewGood).toBe(true);
  });

  test('nuclear next to residential is flagged as a conflict and penalizes dev score', async ({ gamePage: page }) => {
    await page.evaluate(() => {
      const gs = window.__GAME_STATE__;
      gs.grid[0] = { type: 'residential', level: 1 };
      gs.grid[1] = { type: 'nuclear', level: 1 };
    });
    // 재계산을 트리거하기 위해 빈 칸에 배치를 하나 실행한다.
    await openHudPanel(page, 'build');
    await clickCell(page, 2);
    await page.waitForTimeout(150);
    const snap = await gameStateSnapshot(page);
    expect(snap.metrics.conflictPairs).toBeGreaterThan(0);

    // 원전 타일을 클릭해 "원전 인접 불안" 경고가 표시되는지 확인.
    await clickCell(page, 1);
    await page.waitForTimeout(150);
    await expect(page.locator('.spatial-tag.warn')).toContainText('원전 인접 불안');
  });
});

test.describe('full stage progression', () => {
  test('1 -> 6 stage flow reaches the redesign check and does not crash on rapid toasts', async ({ gamePage: page }) => {
    await buildStarterCity(page);
    await advanceToCrisis(page);
    await expect(page.locator('.energy-scale')).toBeVisible();
    await passEnergyScaleAndQuiz(page);
    await expect(page.locator('#reflectionInput')).toBeVisible();
    await saveReflectionAndEnterDiagnosis(page);

    let snap = await gameStateSnapshot(page);
    expect(snap.stage).toBe(4);

    // 힌트 버튼을 빠르게 여러 번 눌러도(토스트가 쌓여도) 응답이 살아있어야 한다 — 회귀 테스트.
    for (let i = 0; i < 5; i++) {
      const enabled = await page.locator('#diagnosisHintBtn').isEnabled().catch(() => false);
      if (!enabled) break;
      await page.locator('#diagnosisHintBtn').click();
      await page.waitForTimeout(30);
    }
    await expect(page.locator('#diagnosisHintBtn')).toBeDisabled();

    await finishDiagnosisAndEnterRedesign(page);
    snap = await gameStateSnapshot(page);
    expect(snap.stage).toBe(5);
    expect(snap.gridSize).toBe(6);

    await clickHudAction(page, 'menu', '#advanceBtn');
    await page.waitForTimeout(400);
    await expect(page.locator('.rubric')).toBeVisible();
  });
});

test.describe('diagnosis scanner', () => {
  test('scanning a tile reveals its problem/ok state and counts toward progress', async ({ gamePage: page }) => {
    await buildStarterCity(page); // 기본 선택은 residential이라 5칸 전부 주거지 — 그 자체로는 갈등이 0개.
    // 화력발전-주거지 갈등을 하나 만들어서 진단할 "문제 타일"을 확보한다.
    await page.evaluate(() => {
      window.__GAME_STATE__.grid[0] = { type: 'thermal', level: 1 };
    });
    await advanceToCrisis(page);
    await passEnergyScaleAndQuiz(page);
    await saveReflectionAndEnterDiagnosis(page);

    const progressBefore = await page.locator('#diagnosisProgress').textContent();
    await clickCell(page, 0); // 화력발전 타일 — 이웃(index 1)이 주거지라 problem이어야 한다.
    await page.waitForTimeout(150);
    const visual = await page.evaluate(() => window.__getCellVisual(0));
    expect(visual.diagnosisState).toBe('problem');
    const progressAfter = await page.locator('#diagnosisProgress').textContent();
    expect(progressAfter).not.toBe(progressBefore);
  });
});

test.describe('badges and evidence', () => {
  test('builder badge unlocks after placing 5 facilities', async ({ gamePage: page }) => {
    await buildStarterCity(page);
    const badges = await page.evaluate(() => [...window.__GAME_STATE__.badges]);
    expect(badges).toContain('builder');
  });

  test('evidence entry (opened from the facility inspector) rejects a too-short reason', async ({ gamePage: page }) => {
    await playThroughToRedesign(page);
    await page.evaluate(() => {
      const first = window.__GAME_STATE__.grid.findIndex((c) => c);
      window.__clickCell(first);
    });
    await page.waitForTimeout(150);
    await expect(page.locator('#recordEvidenceBtn')).toBeVisible();
    await page.locator('#recordEvidenceBtn').click();
    await page.waitForTimeout(150);
    await expect(page.locator('#evidenceConceptModal')).toBeVisible();

    await page.selectOption('#evidenceConceptModal', { index: 1 });
    await page.locator('#evidenceReasonModal').fill('too short');
    await page.locator('#evidenceSaveModalBtn').click();
    await page.waitForTimeout(150);
    const evidenceCountBefore = await page.evaluate(() => window.__GAME_STATE__.evidence.length);
    expect(evidenceCountBefore).toBe(0);

    await page.locator('#evidenceReasonModal').fill('데이터센터는 발열이 커서 냉각과 연결된다는 근거');
    await page.locator('#evidenceSaveModalBtn').click();
    await page.waitForTimeout(150);
    const evidenceCountAfter = await page.evaluate(() => window.__GAME_STATE__.evidence.length);
    expect(evidenceCountAfter).toBe(1);
  });
});

test.describe('restart', () => {
  test('reset returns to stage 1 with starting credits, three times in a row', async ({ gamePage: page }) => {
    for (let i = 0; i < 3; i++) {
      await openHudPanel(page, 'build');
      await clickCell(page, 0);
      await page.waitForTimeout(100);
      await clickHudAction(page, 'menu', '#resetBtn');
      await page.waitForTimeout(150);
      await page.locator('#confirmReset').click();
      await page.waitForTimeout(200);
      const snap = await gameStateSnapshot(page);
      expect(snap.stage).toBe(1);
      expect(snap.credits).toBe(36);
      expect(snap.entities.length).toBe(0);
    }
  });
});

test.describe('autosave', () => {
  test('progress survives a page reload', async ({ gamePage: page }) => {
    await buildStarterCity(page);
    // 자동저장은 GAME.AUTOSAVE_DEBOUNCE_MS(600ms) 뒤에 기록되므로 그보다 길게 기다린다.
    await page.waitForTimeout(900);
    const before = await gameStateSnapshot(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__GAME_STATE__, { timeout: 10000 });
    await page.waitForTimeout(500);
    const after = await gameStateSnapshot(page);
    expect(after.stage).toBe(before.stage);
    expect(after.credits).toBe(before.credits);
    expect(after.entities.length).toBe(before.entities.length);
  });
});

test.describe('report and bonus round', () => {
  // 6개 검증 조건을 모두 통과하는 시나리오는 최적 배치를 요구해 UI 클릭만으로 재현하기 어렵다.
  // window.__GAME_STATE__는 테스트/에이전트용으로 노출된 훅이므로, 통과 상태를 직접 구성해
  // 성적표·보너스 라운드 화면 자체가 올바르게 렌더링되는지 검증한다.
  test('a passing redesign opens the report, and the bonus round can be started and re-validated', async ({ gamePage: page }) => {
    await playThroughToRedesign(page);

    await page.evaluate(() => {
      const gs = window.__GAME_STATE__;
      gs.baseline = { dev: 10, balance: -30, carbon: 20, water: 20, synergyLinks: 0 };
      gs.evidence = [
        { cell: 1, facility: '태양광', level: 1, concept: 'renewable', conceptLabel: '신재생에너지와 지속가능성', reason: '태양광은 재생에너지라 지속가능성과 직결된다.', good: true },
        { cell: 2, facility: '풍력', level: 1, concept: 'renewable', conceptLabel: '신재생에너지와 지속가능성', reason: '풍력도 재생에너지라 지속가능성과 관련이 크다.', good: true },
        { cell: 13, facility: '데이터센터', level: 1, concept: 'cooling', conceptLabel: '데이터센터 발열과 냉각수', reason: '데이터센터는 발열이 커서 냉각수 개념과 연결된다.', good: true },
      ];
      gs.grid = Array(36).fill(null);
      gs.grid[0] = { type: 'solar', level: 1 };
      gs.grid[1] = { type: 'battery', level: 1 };
      gs.grid[6] = { type: 'wind', level: 1 };
      gs.grid[7] = { type: 'battery', level: 1 };
      gs.grid[2] = { type: 'nuclear', level: 1 };
      gs.grid[3] = { type: 'nuclear', level: 1 };
      gs.grid[12] = { type: 'residential', level: 2 };
      gs.grid[13] = { type: 'data', level: 1 };
    });

    await clickHudAction(page, 'menu', '#advanceBtn');
    await page.waitForTimeout(400);
    await expect(page.locator('.modal-card h2')).toHaveText('재설계 성공');

    await page.locator('#validationBtn').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.final-rank')).toBeVisible();
    const reportSnap = await gameStateSnapshot(page);
    expect(reportSnap.stage).toBe(6);

    const creditsBeforeBonus = await page.evaluate(() => window.__GAME_STATE__.credits);
    await page.locator('#bonusBtn').click();
    await page.waitForTimeout(300);
    const bonus = await page.evaluate(() => window.__GAME_STATE__.bonusRound);
    expect(bonus.active).toBe(true);
    const creditsAfterBonus = await page.evaluate(() => window.__GAME_STATE__.credits);
    expect(creditsAfterBonus).toBeLessThan(creditsBeforeBonus);

    // 도시를 더 개선하지 않고 바로 재검증하면 목표 점수(이전 총점+5)에 못 미쳐야 한다.
    await clickHudAction(page, 'menu', '#advanceBtn');
    await page.waitForTimeout(400);
    await expect(page.locator('.modal-card h2')).toContainText('목표 미달');
  });
});
