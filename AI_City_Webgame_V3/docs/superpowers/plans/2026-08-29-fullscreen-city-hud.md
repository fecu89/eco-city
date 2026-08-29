# Fullscreen City HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3D city fill the viewport and move every nonessential dashboard control into mutually exclusive desktop drawers or mobile bottom sheets.

**Architecture:** Preserve the existing game/state/rendering modules and DOM ids, but reorganize their containers around one fullscreen world layer. A new `WorldHud.js` singleton owns only HUD visibility, focus, stage synchronization, and desktop/mobile trigger state; existing `DockView`, `PanelViews`, `HudView`, `ChartView`, and stage modal modules continue rendering content.

**Tech Stack:** Vanilla JavaScript, Three.js, CSS, Lucide, Chart.js, Anime.js, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-fullscreen-city-hud-design.md`

## Global Constraints

- Keep `EventBus`, `GameState`, `Constants`, `render_game_to_text()`, and `advanceTime(ms)` contracts intact.
- Keep the 3D renderer, City Kit assets, camera input, facility motion, and game rules unchanged.
- Preserve existing element ids used by game logic and tests wherever the element still exists.
- Use one active HUD panel at a time: `build`, `advisor`, `status`, `achievements`, or `menu`.
- Stage modal content always appears above HUD panels and closes any open HUD panel.
- Desktop breakpoint is `> 760px`; mobile is `≤ 760px` with five 44px minimum bottom-bar targets.
- No external font, UI framework, or new runtime dependency.
- Maintain WebGL context count 1, representative 6×6 draw calls ≤24, and warm redraw buffer create/delete 0/0.
- Respect `prefers-reduced-motion`, `aria-expanded`, `aria-controls`, Escape close, and focus restoration.

## File Map

- Create `src/ui/WorldHud.js`: HUD panel state machine, trigger synchronization, focus, Escape/outside-close, modal coordination, stage-aware controls.
- Create `tests/e2e/hud.spec.js`: desktop HUD behavior, fullscreen geometry, menu actions, panel/modal priority.
- Modify `index.html`: fullscreen world DOM, status strip, desktop rail, panel host, achievement tabs, mobile bar.
- Modify `src/main.js`: initialize WorldHud instead of MobileNav and expose a HUD diagnostic test hook.
- Modify `src/ui/Modal.js`: emit `MODAL_OPEN` when a stage modal is shown.
- Modify `src/ui/HudView.js`: update HUD labels and call WorldHud stage sync without owning layout.
- Modify `src/ui/DockView.js`: update selected-facility summary and notify HUD without closing the build palette.
- Modify `src/ui/PanelViews.js`: achievement/evidence tab state copy and advisor notification event remain content-only.
- Modify `src/ui/ChartView.js`: export a safe chart resize request for a newly opened floating panel.
- Modify `src/style.css`: replace dashboard grid with fullscreen world HUD, rail, drawers, bottom sheets, responsive/reduced-motion rules.
- Modify `tests/e2e/mobile.spec.js`: replace old right-panel mobile drawer assertions with new bottom-sheet behavior.
- Modify `tests/e2e/visual.spec.js` and snapshots: fullscreen default, build palette, status float, menu drawer, mobile default/sheet.
- Modify `tests/e2e/perf.spec.js`: verify 30 HUD toggles do not allocate/delete WebGL buffers.
- Modify `docs/tech.md`, `progress.md`; create `docs/architectural-decisions/0004-fullscreen-world-hud.md`.
- Stop importing `src/ui/MobileNav.js`; leave the unused file untouched to avoid unrelated deletion in the user's untracked workspace.

---

### Task 1: HUD State Machine and Modal Priority

**Files:**
- Create: `AI_City_Webgame_V3/src/ui/WorldHud.js`
- Create: `AI_City_Webgame_V3/tests/e2e/hud.spec.js`
- Modify: `AI_City_Webgame_V3/index.html`
- Modify: `AI_City_Webgame_V3/src/core/EventBus.js`
- Modify: `AI_City_Webgame_V3/src/ui/Modal.js`
- Modify: `AI_City_Webgame_V3/src/main.js`

**Interfaces:**
- Consumes: `eventBus`, `Events.STAGE_CHANGED`, `Events.MODAL_OPEN`, `Events.MODAL_CLOSE`, `gameState.stage`.
- Produces: `initWorldHud(elements)`, `toggleHudPanel(name, opener)`, `openHudPanel(name, opener)`, `closeHudPanel(options)`, `syncWorldHud()`, `getWorldHudState()`.
- `getWorldHudState()` returns `{ activePanel: string|null, modalOpen: boolean, mobile: boolean }`.

- [ ] **Step 1: Write failing HUD behavior tests**

Add `tests/e2e/hud.spec.js` with exact behaviors:

```js
import { test, expect } from '../fixtures/game-test.js';

test.describe('fullscreen world HUD', () => {
  test('opens one HUD panel at a time and restores focus on Escape', async ({ gamePage: page }) => {
    const build = page.locator('[data-hud-target="build"]').first();
    await build.click();
    await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
    await expect(build).toHaveAttribute('aria-expanded', 'true');

    await page.locator('[data-hud-target="advisor"]').first().click();
    await expect(page.locator('#buildPanel')).not.toHaveClass(/hud-panel-active/);
    await expect(page.locator('#advisorPanel')).toHaveClass(/hud-panel-active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
    await expect(page.locator('[data-hud-target="advisor"]').first()).toBeFocused();
  });

  test('a stage modal closes and disables the world HUD', async ({ gamePage: page }) => {
    await page.locator('[data-hud-target="menu"]').first().click();
    await page.locator('#helpBtn').click();
    await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
    await expect(page.locator('#hudControls')).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] **Step 2: Run tests and verify the red state**

Run:

```bash
cd AI_City_Webgame_V3
npx playwright test tests/e2e/hud.spec.js --reporter=line --workers=1 --retries=0
```

Expected: FAIL because `data-hud-target`, `#buildPanel`, and WorldHud behavior do not exist.

- [ ] **Step 3: Add modal-open event and WorldHud controller**

Add `HUD_PANEL_CHANGED: 'hud:panelChanged'` to `Events`. In `Modal.setModal`, emit `Events.MODAL_OPEN` before animation.

Implement `WorldHud.js` around this state contract:

```js
const VALID_PANELS = new Set(['build', 'advisor', 'status', 'achievements', 'menu']);
let activePanel = null;
let modalOpen = false;
let openerEl = null;
let els = null;

export function openHudPanel(name, opener) {
  if (modalOpen || !VALID_PANELS.has(name)) return false;
  activePanel = name;
  openerEl = opener || null;
  renderHudState();
  eventBus.emit(Events.HUD_PANEL_CHANGED, { activePanel });
  return true;
}

export function closeHudPanel({ restoreFocus = true } = {}) {
  const focusTarget = openerEl;
  activePanel = null;
  openerEl = null;
  renderHudState();
  if (restoreFocus) focusTarget?.focus();
}

export function toggleHudPanel(name, opener) {
  if (activePanel === name) closeHudPanel();
  else openHudPanel(name, opener);
}
```

`renderHudState()` must set `.hud-open`, `.hud-panel-active`, trigger `.active`, `aria-expanded`, and the panel host `data-active-panel`. Register Escape, trigger click, outside pointer, `MODAL_OPEN`, `MODAL_CLOSE`, and `STAGE_CHANGED` listeners in `initWorldHud()`.

- [ ] **Step 4: Add the minimum semantic HUD scaffold and wire the controller**

In `index.html`, add `#hudControls` around all HUD controls, add `data-hud-target` triggers for the five panel names, and map existing content containers to `data-hud-panel`. Add `#buildPanel` around `#facilityDock`, add `#achievementsPanel` around badges/evidence, and add `#menuPanel` around the current top/main action content. Do not change layout CSS in this task; Task 2 makes it fullscreen.

Replace the `initMobileNav` call with:

```js
initWorldHud({
  controls: $('#hudControls'),
  desktopRail: $('#hudRail'),
  mobileBar: $('.mobile-bar'),
  panelHost: $('#rightPanel'),
  panels: [...document.querySelectorAll('[data-hud-panel]')],
  buildTriggerSummary: $('#selectedFacilitySummary'),
  evidenceBox: $('#evidenceBox'),
});
```

Expose `window.__getWorldHudState = () => getWorldHudState()` for deterministic tests.

- [ ] **Step 5: Run focused tests**

Run the Task 1 command again. Expected: both HUD state/focus and modal-priority tests pass against the semantic scaffold.

- [ ] **Step 6: Commit**

```bash
git add AI_City_Webgame_V3/index.html AI_City_Webgame_V3/src/core/EventBus.js AI_City_Webgame_V3/src/ui/Modal.js AI_City_Webgame_V3/src/ui/WorldHud.js AI_City_Webgame_V3/src/main.js AI_City_Webgame_V3/tests/e2e/hud.spec.js
git commit -m "feat: add world HUD state controller"
```

---

### Task 2: Fullscreen World DOM and Desktop Instrument Layout

**Files:**
- Modify: `AI_City_Webgame_V3/index.html`
- Modify: `AI_City_Webgame_V3/src/style.css`
- Modify: `AI_City_Webgame_V3/tests/e2e/hud.spec.js`

**Interfaces:**
- Consumes: WorldHud selectors and existing content ids.
- Produces: `#hudControls`, `#hudRail`, `#buildPanel`, `#advisorPanel`, `#statusPanel`, `#achievementsPanel`, `#menuPanel`, `data-hud-target`, `data-hud-panel`.

- [ ] **Step 1: Add failing fullscreen geometry and menu ownership tests**

```js
test('city canvas fills the viewport while dashboard content is hidden', async ({ gamePage: page }) => {
  const viewport = page.viewportSize();
  const canvas = await page.locator('.city-scene-3d-canvas').boundingBox();
  expect(canvas.width).toBeGreaterThanOrEqual(viewport.width * 0.95);
  expect(canvas.height).toBeGreaterThanOrEqual(viewport.height * 0.95);
  await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
});

test('menu owns all former top and main actions', async ({ gamePage: page }) => {
  await page.locator('[data-hud-target="menu"]').first().click();
  const menu = page.locator('#menuPanel');
  for (const id of ['helpBtn', 'musicBtn', 'soundBtn', 'resetBtn', 'aiAdviceBtn', 'advanceBtn']) {
    await expect(menu.locator(`#${id}`)).toHaveCount(1);
  }
});
```

- [ ] **Step 2: Run tests and verify failures**

Run `npx playwright test tests/e2e/hud.spec.js --reporter=line --workers=1 --retries=0`.

Expected: viewport geometry and menu ownership assertions fail against the dashboard layout.

- [ ] **Step 3: Reorganize index.html while preserving ids**

Use this hierarchy:

```html
<main class="game-shell world-shell">
  <section class="left-panel world-layer">
    <div class="board-stage">
      <div class="board-wrap">
        <div id="boardSizeChip"></div>
        <div id="diagnosisProgress"></div>
        <button id="diagnosisHintBtn" type="button"></button>
        <div id="cityGrid"></div>
        <div id="boardOverlay"></div>
      </div>
    </div>
    <header class="topbar world-status">
      <div class="brand"></div>
      <div id="phasePill"></div>
      <div class="resource-row"></div>
    </header>
    <div id="hudControls" class="hud-controls">
      <nav id="hudRail" class="hud-rail" aria-label="도시 제어">
        <button data-hud-target="build" type="button">건설</button>
        <button data-hud-target="advisor" type="button">AI</button>
        <button data-hud-target="status" type="button">도시</button>
        <button data-hud-target="achievements" type="button">성취</button>
        <button data-hud-target="menu" type="button">메뉴</button>
      </nav>
      <aside id="rightPanel" class="right-panel hud-panel-host">
        <section id="buildPanel" data-hud-panel="build"><div id="facilityDock"></div></section>
        <section id="advisorPanel" data-hud-panel="advisor"><div id="advisorLog"></div><div id="promptChips"></div></section>
        <section id="statusPanel" data-hud-panel="status"><canvas id="cityChart"></canvas></section>
        <section id="achievementsPanel" data-hud-panel="achievements"><div id="badges"></div><div id="evidenceBox"></div></section>
        <section id="menuPanel" data-hud-panel="menu"><div class="mission-header"></div><div id="teacherNote"></div><div class="top-actions"></div><div class="main-buttons"></div></section>
      </aside>
    </div>
  </section>
</main>
```

Place the existing `.facility-dock` only inside `#buildPanel`; advisor content inside `#advisorPanel`; chart inside `#statusPanel`; badge/evidence content inside `#achievementsPanel`; mission/teacher note/top-actions/main-buttons inside `#menuPanel`.

- [ ] **Step 4: Replace dashboard layout CSS with fullscreen primitives**

Implement the key geometry exactly:

```css
.game-shell{position:fixed;inset:0;width:100%;height:100%;margin:0;display:block;overflow:hidden}
.left-panel{position:absolute;inset:0;padding:0;border:0;border-radius:0;background:transparent;overflow:hidden}
.board-stage,.board-wrap,.board-grid{position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none;aspect-ratio:auto;padding:0;border:0;border-radius:0}
.world-status{position:fixed;z-index:12;top:12px;left:12px;width:min(760px,calc(100vw - 112px));height:auto;margin:0}
.hud-rail{position:fixed;z-index:22;right:12px;top:50%;transform:translateY(-50%);display:grid;gap:6px}
.hud-panel-host{position:fixed;z-index:20;inset:0;pointer-events:none}
.hud-panel{position:fixed;right:78px;top:12px;bottom:12px;width:min(390px,calc(100vw - 110px));pointer-events:none;opacity:0;transform:translateX(20px)}
.hud-panel-active{pointer-events:auto;opacity:1;transform:none}
.hud-panel[data-hud-panel="build"]{top:auto;right:90px;bottom:18px;left:50%;width:min(900px,calc(100vw - 220px));transform:translate(-50%,18px)}
.hud-panel-active[data-hud-panel="build"]{transform:translate(-50%,0)}
```

Keep panels visually quiet: thin border, solid translucent navy, no page-sized blur.

- [ ] **Step 5: Run HUD, camera, and center-raycast tests**

```bash
npx playwright test tests/e2e/hud.spec.js tests/e2e/camera.spec.js tests/e2e/game.spec.js -g "fullscreen|HUD panel|menu owns|mouse orbit|center of the 3D board" --reporter=line --workers=1 --retries=0
```

Expected: all focused tests pass; canvas click still resolves center index 12.

- [ ] **Step 6: Commit**

```bash
git add AI_City_Webgame_V3/index.html AI_City_Webgame_V3/src/style.css AI_City_Webgame_V3/tests/e2e/hud.spec.js
git commit -m "feat: make the city a fullscreen world"
```

---

### Task 3: Panel Content, Stage Context, and Existing Actions

**Files:**
- Modify: `AI_City_Webgame_V3/src/ui/WorldHud.js`
- Modify: `AI_City_Webgame_V3/src/ui/HudView.js`
- Modify: `AI_City_Webgame_V3/src/ui/DockView.js`
- Modify: `AI_City_Webgame_V3/src/ui/PanelViews.js`
- Modify: `AI_City_Webgame_V3/src/ui/ChartView.js`
- Modify: `AI_City_Webgame_V3/src/main.js`
- Modify: `AI_City_Webgame_V3/tests/e2e/hud.spec.js`

**Interfaces:**
- Produces: `requestChartResize(): void`, selected-facility summary content in `#selectedFacilitySummary`, achievement tab buttons with `data-achievement-tab`.
- WorldHud `syncWorldHud()` reads stage only to toggle contextual availability; it does not mutate GameState.

- [ ] **Step 1: Add failing panel-content tests**

```js
test('build palette stays open after selecting a facility', async ({ gamePage: page }) => {
  await page.locator('[data-hud-target="build"]').first().click();
  await page.locator('#facilityDock .facility-btn').nth(1).click();
  await expect(page.locator('#buildPanel')).toHaveClass(/hud-panel-active/);
  await expect(page.locator('#selectedFacilitySummary')).toContainText('공장');
});

test('city status opens as a nonblocking floating instrument', async ({ gamePage: page }) => {
  await page.locator('[data-hud-target="status"]').first().click();
  await expect(page.locator('#statusPanel')).toHaveClass(/hud-panel-active/);
  await expect(page.locator('#cityChart')).toBeVisible();
  await expect(page.locator('#statusPanel')).toHaveCSS('pointer-events', 'auto');
});

test('achievement drawer switches between badges and evidence', async ({ gamePage: page }) => {
  await page.locator('[data-hud-target="achievements"]').first().click();
  await page.locator('[data-achievement-tab="evidence"]').click();
  await expect(page.locator('#evidenceBox')).toBeVisible();
  await expect(page.locator('#evidenceBox')).toContainText('5단계');
});
```

- [ ] **Step 2: Run tests and verify failures**

Run the full `hud.spec.js`. Expected: missing summary/tab copy or close-on-select behavior fails.

- [ ] **Step 3: Keep content modules content-only**

- In `DockView`, accept a summary element during init and update it after every render/selection; do not call WorldHud close.
- In `PanelViews.renderEvidence`, show `5단계 재설계에서 근거 기록이 열립니다.` when locked and show saved items when unlocked.
- In `HudView.renderHud`, stop hiding `#evidenceBox`; WorldHud achievement tabs own its visibility. Add a `locked` class and copy before redesign instead.
- In `ChartView`, export:

```js
export function requestChartResize() {
  if (!chart) return;
  requestAnimationFrame(() => chart.resize());
}
```

- In WorldHud, call `requestChartResize()` after opening `status` without importing other UI modules directly. Pass it as `onStatusOpened` in `initWorldHud(elements)`.

- [ ] **Step 4: Preserve all menu actions in their new location**

Keep existing ids and main.js listeners. Add `.menu-progress` and `.menu-settings` wrappers only. `HudView.renderHud()` continues setting `#advanceBtn`, note, resources, and stage copy; it calls `syncWorldHud()` via an injected callback passed to `initHudView(elements, onStageUiChanged)` rather than importing WorldHud.

- [ ] **Step 5: Run HUD plus existing gameplay tests**

```bash
npx playwright test tests/e2e/hud.spec.js tests/e2e/game.spec.js -g "build palette|city status|achievement drawer|placing a facility|full stage progression|restart" --reporter=line --workers=1 --retries=0
```

Expected: all selected panel and gameplay tests pass.

- [ ] **Step 6: Commit**

```bash
git add AI_City_Webgame_V3/src/ui/WorldHud.js AI_City_Webgame_V3/src/ui/HudView.js AI_City_Webgame_V3/src/ui/DockView.js AI_City_Webgame_V3/src/ui/PanelViews.js AI_City_Webgame_V3/src/ui/ChartView.js AI_City_Webgame_V3/src/main.js AI_City_Webgame_V3/tests/e2e/hud.spec.js
git commit -m "feat: move game tools into world HUD panels"
```

---

### Task 4: Mobile Bottom Bar, Bottom Sheets, and Accessibility

**Files:**
- Modify: `AI_City_Webgame_V3/src/ui/WorldHud.js`
- Modify: `AI_City_Webgame_V3/src/style.css`
- Modify: `AI_City_Webgame_V3/index.html`
- Modify: `AI_City_Webgame_V3/tests/e2e/mobile.spec.js`
- Modify: `AI_City_Webgame_V3/tests/e2e/hud.spec.js`

**Interfaces:**
- Mobile and desktop triggers share `data-hud-target` values and `aria-controls` ids.
- `getWorldHudState().mobile` is based on `matchMedia('(max-width: 760px)')` and updates on media query changes.

- [ ] **Step 1: Replace old mobile tests with failing bottom-sheet tests**

```js
test('bottom bar opens one bounded sheet and exposes five touch targets', async ({ gamePage: page }) => {
  const buttons = page.locator('.mobile-bar [data-hud-target]');
  await expect(buttons).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    const box = await buttons.nth(index).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await buttons.filter({ hasText: '건설' }).click();
  const sheet = page.locator('#buildPanel');
  await expect(sheet).toHaveClass(/hud-panel-active/);
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox.height).toBeLessThanOrEqual(844 * 0.56 + 1);
});

test('closing a mobile sheet returns touch orbit to the city', async ({ gamePage: page }) => {
  await page.locator('.mobile-bar [data-hud-target="menu"]').click();
  await page.locator('#menuPanel .hud-close').click();
  await expect(page.locator('#rightPanel')).not.toHaveClass(/hud-open/);
  // Reuse the existing CDP touch-drag camera assertion after this line.
});
```

- [ ] **Step 2: Run mobile tests and verify failures**

Run `npx playwright test tests/e2e/mobile.spec.js --reporter=line --workers=1 --retries=0`.

Expected: old data-open-panel controls/count/layout fail.

- [ ] **Step 3: Implement bottom bar and sheet styling**

Use this responsive contract:

```css
@media (max-width:760px){
  .hud-rail{display:none}
  .mobile-bar{position:fixed;z-index:30;left:0;right:0;bottom:0;height:calc(58px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(5,1fr)}
  .hud-panel{top:auto;left:4px;right:4px;bottom:calc(62px + env(safe-area-inset-bottom));width:auto;max-height:56dvh;transform:translateY(18px);border-radius:14px 14px 10px 10px}
  .hud-panel-active{transform:none}
  .world-status{top:6px;left:6px;width:calc(100vw - 12px)}
  .resource-card:nth-child(n+4){display:none}
}
```

Add the five mobile buttons in order: build, advisor, status, achievements, menu. Add `.hud-sheet-handle` and `.hud-close` to every panel header.

- [ ] **Step 4: Implement accessibility and responsive state synchronization**

WorldHud must:

- update both desktop and mobile triggers for the same target;
- set `aria-hidden` on inactive panels;
- focus `.hud-panel-active .hud-close` after open;
- restore the exact opener after close;
- close on Escape;
- disable all triggers during `MODAL_OPEN`;
- update `mobile` on media query change and close the current panel to avoid stale geometry.

- [ ] **Step 5: Run mobile, camera, and accessibility tests**

```bash
npx playwright test tests/e2e/mobile.spec.js tests/e2e/camera.spec.js tests/e2e/hud.spec.js --reporter=line --workers=1 --retries=0
```

Expected: all mobile bottom-sheet, touch orbit, camera, focus, and modal-priority tests pass.

- [ ] **Step 6: Commit**

```bash
git add AI_City_Webgame_V3/index.html AI_City_Webgame_V3/src/style.css AI_City_Webgame_V3/src/ui/WorldHud.js AI_City_Webgame_V3/tests/e2e/mobile.spec.js AI_City_Webgame_V3/tests/e2e/hud.spec.js
git commit -m "feat: add mobile city control bar"
```

---

### Task 5: Visual Polish and Screenshot Review

**Files:**
- Modify: `AI_City_Webgame_V3/src/style.css`
- Modify: `AI_City_Webgame_V3/tests/e2e/visual.spec.js`
- Modify: `AI_City_Webgame_V3/tests/e2e/visual.spec.js-snapshots/*.png`

**Interfaces:**
- No new runtime interfaces; snapshot names become the visual contract.

- [ ] **Step 1: Add new visual scenarios before updating baselines**

Add scenarios named:

```js
test('fullscreen city default HUD', async ({ gamePage: page }) => {
  await expect(page).toHaveScreenshot('world-hud-default.png', { maxDiffPixels: 18000 });
});

test('floating build palette', async ({ gamePage: page }) => {
  await page.locator('[data-hud-target="build"]').first().click();
  await expect(page).toHaveScreenshot('world-hud-build.png', { maxDiffPixels: 18000 });
});

test('status instrument and command menu', async ({ gamePage: page }) => {
  await page.locator('[data-hud-target="status"]').first().click();
  await expect(page).toHaveScreenshot('world-hud-status.png', { maxDiffPixels: 18000 });
  await page.locator('[data-hud-target="menu"]').first().click();
  await expect(page).toHaveScreenshot('world-hud-menu.png', { maxDiffPixels: 18000 });
});
```

Add mobile default and mobile build-sheet captures under the existing mobile describe.

- [ ] **Step 2: Run visual tests without updating snapshots**

Run `npx playwright test tests/e2e/visual.spec.js --reporter=line --workers=1 --retries=0`.

Expected: missing/new snapshot failures prove the scenarios capture the new layout.

- [ ] **Step 3: Apply the frontend-design visual pass**

Use the approved palette and signature control rail. Check all CSS against these rules:

- canvas dominates; no large permanent side panel;
- only one memorable element, the `CITY CONTROL` rail;
- 10–14px radius, thin cyan lines, restrained shadow;
- no excessive blur or nested rounded cards;
- status chart reads like a translucent instrument;
- build palette makes icon, name, cost, selected state scannable;
- menu hierarchy is mission → progress action → secondary actions → settings;
- reduced-motion removes transforms/pulse.

- [ ] **Step 4: Generate and inspect snapshots**

```bash
npx playwright test tests/e2e/visual.spec.js --update-snapshots=all --reporter=line --workers=1 --retries=0
```

Open every new PNG with the image viewer. Reject and revise if the city is cropped, panel content overlaps controls, typography is below 12px for meaningful copy, mobile sheets exceed 56dvh, or more than one large panel is visible.

- [ ] **Step 5: Run visual tests against saved baselines**

Run the visual test command without `--update-snapshots`. Expected: all visual tests pass.

- [ ] **Step 6: Commit**

```bash
git add AI_City_Webgame_V3/src/style.css AI_City_Webgame_V3/tests/e2e/visual.spec.js AI_City_Webgame_V3/tests/e2e/visual.spec.js-snapshots
git commit -m "test: capture fullscreen city HUD states"
```

---

### Task 6: Performance, Full Regression, and Documentation

**Files:**
- Modify: `AI_City_Webgame_V3/tests/e2e/perf.spec.js`
- Create: `AI_City_Webgame_V3/docs/architectural-decisions/0004-fullscreen-world-hud.md`
- Modify: `AI_City_Webgame_V3/docs/tech.md`
- Modify: `AI_City_Webgame_V3/progress.md`

**Interfaces:**
- `window.__getWorldHudState()` is the HUD diagnostic hook used by performance/agent tests.

- [ ] **Step 1: Add failing HUD churn test**

Instrument WebGL buffers as the existing perf test does, then toggle panels:

```js
await page.evaluate(() => {
  window.__GPU_BUFFER_COUNTS__.created = 0;
  window.__GPU_BUFFER_COUNTS__.deleted = 0;
});
for (let index = 0; index < 30; index++) {
  await page.locator(`[data-hud-target="${index % 2 ? 'status' : 'build'}"]`).first().click();
}
expect(await page.evaluate(() => window.__GPU_BUFFER_COUNTS__)).toEqual({ created: 0, deleted: 0 });
```

- [ ] **Step 2: Run performance tests and verify the new test state**

Run `npx playwright test tests/e2e/perf.spec.js --reporter=line --workers=1 --retries=0`.

Expected before final CSS/controller stabilization: either selector failure or churn assertion failure; existing draw/context tests must remain readable.

- [ ] **Step 3: Fix only measured regressions**

If toggling HUD creates WebGL buffers, verify that canvas dimensions are not changing when panels open. Keep panels `position: fixed` and out of document flow; do not resize the world shell. If context/draw counts regress, remove any new canvas or Three.js use from HUD modules.

- [ ] **Step 4: Run fresh production build and full suite without retries**

```bash
npm run build
npm test -- --reporter=line --retries=0
```

Required: build exit 0 and every Playwright test passes on the first attempt.

- [ ] **Step 5: Record final evidence and decisions**

Create ADR-0004 with the fullscreen world + mutually exclusive HUD decision, modal priority, mobile bottom sheets, and why a hybrid build palette was chosen. Update `docs/tech.md` file map/test count and append the UI redesign, measurements, and known Vite size warning to `progress.md`.

- [ ] **Step 6: Verify documentation and worktree scope**

```bash
git diff --check -- AI_City_Webgame_V3
git status --short -- AI_City_Webgame_V3
```

Confirm only intended HUD files are staged; preserve all unrelated user-owned untracked files.

- [ ] **Step 7: Commit**

```bash
git add AI_City_Webgame_V3/tests/e2e/perf.spec.js AI_City_Webgame_V3/docs/architectural-decisions/0004-fullscreen-world-hud.md AI_City_Webgame_V3/docs/tech.md AI_City_Webgame_V3/progress.md
git commit -m "docs: finalize fullscreen city HUD"
```

- [ ] **Step 8: Finish branch safely**

Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. The current workspace is a normal checkout on `main`, so do not push or create a PR without explicit authorization; report local commits and leave user-owned untracked files untouched.
