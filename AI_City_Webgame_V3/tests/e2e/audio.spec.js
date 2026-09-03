import { test, expect } from '@playwright/test';
import { statSync } from 'node:fs';
import path from 'node:path';

test('runtime background track is web-compressed while the source master stays outside public', () => {
  const runtime = statSync(path.resolve(process.cwd(), 'public/assets/eco-city.mp3')).size;
  const source = statSync(path.resolve(process.cwd(), 'assets-source/audio/eco-city-original.mp3')).size;
  expect(runtime).toBeLessThan(2_000_000);
  expect(runtime / source).toBeLessThan(0.5);
});

// 실제 오디오 장치 없이 배경음·효과음 경로를 관찰하기 위한 프로브.
async function installAudioProbe(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    window.__audioProbe = {
      contexts: 0, resumes: 0, audioElements: 0, musicPlays: 0, musicPauses: 0, musicSrc: '',
    };
    class FakeAudio {
      constructor(src) {
        window.__audioProbe.audioElements += 1;
        window.__audioProbe.musicSrc = src;
        this.src = src;
        this.currentTime = 0;
        this.loop = false;
        this.preload = '';
        this.volume = 1;
      }
      play() {
        window.__audioProbe.musicPlays += 1;
        return Promise.resolve();
      }
      pause() { window.__audioProbe.musicPauses += 1; }
      addEventListener() {}
      removeEventListener() {}
    }
    window.Audio = FakeAudio;
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
          start() {},
          stop() {},
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
}

async function bootWithAudioProbe(page) {
  await installAudioProbe(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME_STATE__ && document.getElementById('loadingScreen')?.classList.contains('done'));
}

test('background music starts after the first gesture and stops cleanly from settings', async ({ page }) => {
  await bootWithAudioProbe(page);
  await page.waitForTimeout(500);
  await expect(page.locator('#musicBtn')).toHaveClass(/active/);
  await page.locator('#storyNext').click();
  await expect.poll(() => page.evaluate(() => window.__audioProbe)).toMatchObject({
    contexts: 1,
    resumes: 1,
    audioElements: 1,
    musicPlays: 1,
  });
  expect(await page.evaluate(() => window.__audioProbe.musicSrc)).toContain('/assets/eco-city.mp3');

  for (let pageIndex = 0; pageIndex < 2; pageIndex++) await page.locator('#storyNext').click();
  await page.locator('[data-hud-target="settings"]').first().click();
  await page.locator('#musicBtn').click();
  await expect(page.locator('#musicBtn')).not.toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => window.__audioProbe.musicPauses)).toBe(1);
});

test('muting sound effects leaves the background music playing', async ({ page }) => {
  await bootWithAudioProbe(page);
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) await page.locator('#storyNext').click();
  await expect.poll(() => page.evaluate(() => window.__audioProbe.musicPlays)).toBe(1);

  await page.locator('[data-hud-target="settings"]').first().click();
  await page.locator('#soundBtn').click();

  expect(await page.evaluate(() => ({
    sound: window.__GAME_STATE__.sound,
    musicEnabled: window.__GAME_STATE__.musicEnabled,
    musicPauses: window.__audioProbe.musicPauses,
  }))).toEqual({ sound: false, musicEnabled: true, musicPauses: 0 });
  await expect(page.locator('#musicBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#musicBtn')).toHaveClass(/active/);
});

test('a keyboard-only player still starts the audio context on the first key', async ({ page }) => {
  await bootWithAudioProbe(page);
  expect(await page.evaluate(() => window.__getAudioState())).not.toBe('running');

  await page.keyboard.press('Shift');

  await expect.poll(() => page.evaluate(() => window.__getAudioState())).toBe('running');
  await expect.poll(() => page.evaluate(() => window.__audioProbe.musicPlays)).toBe(1);
});
