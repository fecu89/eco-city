/**
 * SFX Engine -- Web Audio API one-shot sounds.
 * NEVER use Strudel for SFX (it loops). All sounds here fire once and stop.
 */

import { gameState } from '../core/GameState.js';

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/** Play a single tone that stops after duration */
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

/** Play a sequence of tones (each fires once and stops) */
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

/** Play noise burst (for whooshes, swooshes) */
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

  let chain = source.connect(lpf).connect(gainNode);

  if (hpfFreq > 0) {
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(hpfFreq, now);
    source.disconnect();
    chain = source.connect(hpf).connect(lpf).connect(gainNode);
  }

  chain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration);
}

// Note frequencies for reference:
// C4=261.63 D4=293.66 E4=329.63 F4=349.23 G4=392.00
// A4=440.00 B4=493.88 C5=523.25 E5=659.25 B5=987.77

/**
 * Throw SFX -- quick whoosh (short noise burst with pitch sweep).
 * Feels like an envelope sailing through the air.
 */
export function throwSfx() {
  if (gameState.isMuted) return;
  playNoise(0.15, 0.18, 5000, 1000);
}

/**
 * Hit SFX -- satisfying impact (low thump + high sparkle).
 * Envelope smacking into a house.
 */
export function hitSfx() {
  if (gameState.isMuted) return;
  // Low thump
  playTone(65.41, 'sine', 0.15, 0.28, 800);
  // High sparkle
  playTone(987.77, 'square', 0.1, 0.12, 6000);
}

/**
 * Combo SFX -- ascending arpeggio.
 * Scales with combo count (higher combos = more notes).
 */
export function comboSfx(comboCount) {
  if (gameState.isMuted) return;
  const baseNotes = [329.63, 440.00, 523.25, 659.25, 987.77];
  // Use more notes for higher combos (3-5 notes)
  const count = Math.min(Math.max(3, comboCount), baseNotes.length);
  const notes = baseNotes.slice(0, count);
  playNotes(notes, 'square', 0.08, 0.05, 0.22, 5000);
}

/**
 * Damage SFX -- harsh buzz/dissonance.
 * Getting hit by a real estate agent.
 */
export function damageSfx() {
  if (gameState.isMuted) return;
  // Descending harsh tones
  playNotes([392, 329.63, 261.63, 220, 174.61], 'sawtooth', 0.12, 0.07, 0.25, 1500);
}

/**
 * Collect SFX -- bright pickup chime (ascending two-note).
 * Collecting panic points.
 */
export function collectSfx() {
  if (gameState.isMuted) return;
  playNotes([659.25, 987.77], 'square', 0.12, 0.07, 0.25, 5000);
}

/**
 * Near miss SFX -- quick swoosh.
 * Dodging an agent at the last moment.
 */
export function nearMissSfx() {
  if (gameState.isMuted) return;
  playNoise(0.12, 0.12, 3000, 600);
}
