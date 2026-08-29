// =============================================================================
// sfx.js — One-shot sound effects using Web Audio API
// Never use Strudel for SFX (it loops). Each function creates oscillator +
// gain nodes, plays briefly, then cleans up automatically via .stop().
// =============================================================================

import { gameState } from '../core/GameState.js';

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// --- Utility: single tone with lowpass filter ---
function playTone(freq, type, duration, gain = 0.3, filterFreq = 4000) {
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(gain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, now);

  osc.connect(filter).connect(gainNode).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// --- Utility: sequence of tones ---
function playNotes(notes, type, noteDuration, gap, gain = 0.3, filterFreq = 4000) {
  const ctx = getCtx();
  const now = ctx.currentTime;

  notes.forEach((freq, i) => {
    const start = now + i * gap;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, start);
    gainNode.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, start);

    osc.connect(filter).connect(gainNode).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + noteDuration);
  });
}

// --- Utility: noise burst (clicks, whooshes) ---
function playNoise(duration, gain = 0.2, lpfFreq = 4000, hpfFreq = 0) {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(gain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(lpfFreq, now);

  if (hpfFreq > 0) {
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(hpfFreq, now);
    source.connect(hpf).connect(lpf).connect(gainNode).connect(ctx.destination);
  } else {
    source.connect(lpf).connect(gainNode).connect(ctx.destination);
  }

  source.start(now);
  source.stop(now + duration);
}

// =============================================================================
// Exported SFX functions — each checks isMuted before playing
// =============================================================================

// Heart pickup — bright ascending two-tone chime (neon sparkle)
export function heartPickupSfx() {
  if (gameState.isMuted) return;
  playNotes([659.25, 987.77], 'square', 0.12, 0.07, 0.3, 5000);
}

// Dodge near-miss — quick woosh
export function dodgeWooshSfx() {
  if (gameState.isMuted) return;
  playNoise(0.25, 0.15, 6000, 800);
}

// Collision / death — descending crushed tones (impact + crunch)
export function deathSfx() {
  if (gameState.isMuted) return;
  // Low impact thump
  playTone(65.41, 'square', 0.18, 0.3, 800);
  // Descending crunch after the thump
  playNotes([392, 329.63, 261.63, 220, 174.61], 'square', 0.2, 0.1, 0.22, 2000);
}

// Button click — short pop for UI feedback
export function clickSfx() {
  if (gameState.isMuted) return;
  playTone(523.25, 'sine', 0.08, 0.2, 5000);
}

// Speed milestone — brief ascending tone when speed ramps up
export function speedMilestoneSfx() {
  if (gameState.isMuted) return;
  playNotes([392, 523.25, 659.25], 'triangle', 0.1, 0.06, 0.2, 4000);
}
