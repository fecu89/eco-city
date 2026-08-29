import { test as base } from '@playwright/test';

export const test = base.extend({
  gamePage: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__GAME_STATE__ && typeof window.render_game_to_text === 'function', {
      timeout: 10000,
    });
    // 로딩 화면(#loadingScreen)은 약 1.2초간 전체 화면을 덮어 클릭을 막는다(의도된 연출).
    // JS 상태가 준비된 것과 화면이 실제로 클릭 가능해진 것은 다르므로, 로딩 화면이 완전히
    // 사라질 때까지 기다린다 — 안 그러면 실제 마우스 좌표 클릭이 로딩 화면에 막혀 씹힌다.
    // 주의: `.done` 클래스는 opacity/visibility를 CSS `transition:.4s`로 바꾸는데, visibility는
    // hidden으로 바뀔 때 트랜지션이 "끝나야" 실제로 적용된다 — 클래스가 붙은 시점 기준으로
    // 400ms 넘게 더 기다려야 로딩 화면이 클릭을 더 이상 가로채지 않는다.
    await page.waitForFunction(() => document.getElementById('loadingScreen')?.classList.contains('done'), {
      timeout: 5000,
    });
    await page.waitForTimeout(500);
    await use(page);
  },
});

export const expect = base.expect;
