import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { playSfx } from './sfx.js';
import { startAmbient, stopAmbient } from './bgm.js';

let ctx = null;
let masterGain = null;
let resumePromise = null;

function ensureContext() {
  if (ctx) return ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  ctx = new AudioContextClass();
  masterGain = ctx.createGain();
  masterGain.gain.value = gameState.sound ? 1 : 0;
  masterGain.connect(ctx.destination);
  return ctx;
}

// 배경음은 <audio> 엘리먼트라 masterGain을 타지 않는다. 효과음 음소거와 독립적으로 켠다.
function startAmbientIfReady() {
  if (ctx && gameState.musicEnabled) startAmbient(ctx, masterGain);
}

function resumeAndStart() {
  ensureContext();
  if (!resumePromise) {
    resumePromise = Promise.resolve(ctx.state === 'suspended' ? ctx.resume() : undefined)
      .catch((error) => console.warn('오디오 컨텍스트를 시작하지 못했습니다.', error))
      .finally(() => {
        resumePromise = null;
        startAmbientIfReady();
      });
  }
  return resumePromise;
}

export function initAudioManager() {
  eventBus.on(Events.GAME_RESET, () => {
    if (masterGain) masterGain.gain.value = gameState.sound ? 1 : 0;
    stopAmbient();
    startAmbientIfReady();
  });
  eventBus.on(Events.AUDIO_SFX, ({ name }) => {
    if (!gameState.sound) return;
    ensureContext();
    playSfx(ctx, masterGain, name);
  });

  // 효과음 음소거는 효과음만 끈다. 배경음은 #musicBtn이 따로 관리한다.
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    gameState.sound = !gameState.sound;
    if (masterGain) masterGain.gain.value = gameState.sound ? 1 : 0;
  });

  // 브라우저 자동재생 정책 — 첫 사용자 입력에서 AudioContext를 시작/재개한다.
  // 키보드만 쓰는 플레이어도 배경음을 들을 수 있도록 두 입력을 모두 받는다.
  const resume = () => { resumeAndStart(); };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}

export function audioContextState() {
  return ctx?.state ?? null;
}

export function toggleMusic() {
  gameState.musicEnabled = !gameState.musicEnabled;
  if (gameState.musicEnabled) resumeAndStart();
  else stopAmbient();
  return gameState.musicEnabled;
}
