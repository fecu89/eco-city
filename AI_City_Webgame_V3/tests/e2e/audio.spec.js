import { test, expect } from '@playwright/test';

test('background music starts after the first gesture and stops cleanly from settings', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    window.__audioProbe = { contexts: 0, resumes: 0, oscillatorsStarted: 0, oscillatorsStopped: 0 };
    class FakeParam {
      constructor(value = 0) { this.value = value; }
      linearRampToValueAtTime(value) { this.value = value; }
      setValueAtTime(value) { this.value = value; }
      setTargetAtTime(value) { this.value = value; }
      cancelScheduledValues() {}
    }
    class FakeAudioContext {
      constructor() {
        window.__audioProbe.contexts += 1;
        this.state = 'suspended';
        this.currentTime = 0;
        this.destination = {};
      }
      createGain() {
        return { gain: new FakeParam(1), connect() {}, disconnect() {}, context: this };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: new FakeParam(0),
          connect() {},
          disconnect() {},
          start() { window.__audioProbe.oscillatorsStarted += 1; },
          stop() { window.__audioProbe.oscillatorsStopped += 1; },
        };
      }
      async resume() {
        window.__audioProbe.resumes += 1;
        this.state = 'running';
      }
    }
    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = FakeAudioContext;
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__GAME_STATE__ && document.getElementById('loadingScreen')?.classList.contains('done'));
  await page.waitForTimeout(500);
  await expect(page.locator('#musicBtn')).toHaveClass(/active/);
  await page.locator('#storyNext').click();
  await expect.poll(() => page.evaluate(() => window.__audioProbe)).toMatchObject({
    contexts: 1,
    resumes: 1,
    oscillatorsStarted: 3,
  });

  for (let pageIndex = 0; pageIndex < 2; pageIndex++) await page.locator('#storyNext').click();
  await page.locator('[data-hud-target="settings"]').first().click();
  await page.locator('#musicBtn').click();
  await expect(page.locator('#musicBtn')).not.toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => window.__audioProbe.oscillatorsStopped)).toBe(3);
});
