import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { playSfx } from './sfx.js';
import { startAmbient, stopAmbient } from './bgm.js';

let ctx = null;
let masterGain = null;

function ensureContext() {
  if (ctx) return ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  ctx = new AudioContextClass();
  masterGain = ctx.createGain();
  masterGain.gain.value = gameState.sound ? 1 : 0;
  masterGain.connect(ctx.destination);
  return ctx;
}

function startAmbientIfReady() {
  if (ctx && gameState.sound && gameState.musicEnabled) startAmbient(ctx, masterGain);
}

export function initAudioManager() {
  eventBus.on(Events.AUDIO_SFX, ({ name }) => {
    if (!gameState.sound) return;
    ensureContext();
    playSfx(ctx, masterGain, name);
  });

  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    gameState.sound = !gameState.sound;
    if (masterGain) masterGain.gain.value = gameState.sound ? 1 : 0;
    if (!gameState.sound) stopAmbient();
    else startAmbientIfReady();
  });

  // 브라우저 자동재생 정책 — 첫 사용자 입력에서 AudioContext를 시작/재개한다.
  const resume = () => {
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
    window.removeEventListener('pointerdown', resume);
  };
  window.addEventListener('pointerdown', resume, { once: true });
}

export function toggleMusic() {
  gameState.musicEnabled = !gameState.musicEnabled;
  if (gameState.musicEnabled) startAmbientIfReady();
  else stopAmbient();
  return gameState.musicEnabled;
}
