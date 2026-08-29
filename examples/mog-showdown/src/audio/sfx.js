/**
 * SFX -- Web Audio API one-shot sound effects.
 * Never use Strudel for SFX (it loops). All sounds fire once and stop.
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
  if (gameState.isMuted) return;
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
  if (gameState.isMuted) return;
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

/** Play noise burst (for impacts, whooshes) */
function playNoise(duration, gain = 0.2, lpfFreq = 4000, hpfFreq = 0) {
  if (gameState.isMuted) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  const bufferSize = Math.round(ctx.sampleRate * duration);
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

// --- Game-Specific SFX ---

// Note frequencies reference:
// C4=261.63, D4=293.66, E4=329.63, F4=349.23, G4=392.00, A4=440.00
// B4=493.88, C5=523.25, D5=587.33, E5=659.25, F5=698.46, G5=783.99
// A5=880.00, B5=987.77, C6=1046.50

/**
 * Powerup collect -- bright ascending chime (protein shake / dumbbell caught)
 * Quick 5-note ascending arpeggio with sparkle
 */
export function powerupCollectSfx() {
  playNotes([523.25, 659.25, 783.99, 987.77, 1046.50], 'square', 0.09, 0.05, 0.25, 5000);
}

/**
 * Attack hit -- heavy impact thud (wig/hat hits player)
 * Low frequency punch + noise burst for impact feel
 */
export function attackHitSfx() {
  playTone(55, 'sine', 0.2, 0.3, 400);
  playNoise(0.1, 0.2, 1200, 100);
}

/**
 * Frame Mog -- epic power-up burst sound (mog meter full)
 * Dramatic ascending sweep + noise whoosh + high chime
 */
export function frameMogSfx() {
  if (gameState.isMuted) return;
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Rising sweep
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(130.81, now);
  osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(800, now);
  f.frequency.exponentialRampToValueAtTime(6000, now + 0.3);
  osc.connect(f).connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.4);

  // Triumphant chord at peak
  playNotes([659.25, 783.99, 987.77, 1318.51], 'square', 0.2, 0.04, 0.2, 6000);

  // Noise whoosh
  playNoise(0.3, 0.15, 8000, 600);
}

/**
 * Combo -- quick staccato hit (combo counter increment)
 * Short punchy blip that gets higher with repeated calls
 */
export function comboSfx() {
  playTone(783.99, 'square', 0.06, 0.2, 4000);
}

/**
 * Life lost -- descending sad tone
 * 3-note descending minor phrase
 */
export function lifeLostSfx() {
  playNotes([440, 349.23, 261.63], 'triangle', 0.2, 0.12, 0.25, 2000);
}

/**
 * Game over -- final crash/cymbal
 * Heavy descending tones + noise burst
 */
export function gameOverSfx() {
  playNotes([392, 329.63, 261.63, 196, 146.83], 'square', 0.22, 0.1, 0.28, 1800);
  playNoise(0.5, 0.18, 5000, 400);
}
