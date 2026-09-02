import { test as base } from '@playwright/test';

export const test = base.extend({
  gamePage: async ({ page }, use) => {
    // 부팅 도중의 콘솔 경고(누락 아이콘 등)까지 담으려면 goto 전에 붙여야 한다.
    // 수집한 메시지는 page.consoleMessages로 읽는다.
    const consoleMessages = [];
    page.on('console', (message) => consoleMessages.push(message.text()));
    page.consoleMessages = consoleMessages;
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
    // 대부분의 회귀 테스트는 게임 화면 자체를 검증한다. 최초 접속 스토리는 전용
    // onboarding.spec.js에서 검증하고, 공용 fixture에서는 세 장을 정상 조작으로 넘긴다.
    const storyNext = page.locator('#storyNext');
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      if (!await storyNext.isVisible().catch(() => false)) break;
      await storyNext.click();
    }
    await use(page);
  },
});

export const expect = base.expect;
