// sfx.js -- Web Audio API one-shot sounds for Gem Catcher
// Never use Strudel for SFX. All sounds fire once and stop.

import { gameState } from '../core/GameState.js';

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// Play a single tone that stops after duration
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

// Play a sequence of tones (each fires once and stops)
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

// --- Game-specific SFX ---

// Gem catch -- bright, satisfying chime/ping (high pitched, short)
// Two ascending tones: E5 -> B5
export function gemCatchSfx() {
  if (gameState.isMuted) return;
  playNotes([659.25, 987.77], 'square', 0.12, 0.07, 0.3, 5000);
}

// Skull hit -- dark thud/buzz (low, ominous)
// Low frequency square wave with tight filter
export function skullHitSfx() {
  if (gameState.isMuted) return;
  playTone(65.41, 'square', 0.2, 0.3, 800);
}

// Life lost -- warning alarm / descending tone
// Fast descending sequence: G4 -> E4 -> C4 -> A3 -> F3
export function lifeLostSfx() {
  if (gameState.isMuted) return;
  playNotes([392, 329.63, 261.63, 220, 174.61], 'square', 0.18, 0.09, 0.25, 2000);
}

// Difficulty up -- level-up fanfare (ascending arpeggio, quick)
// C4 -> E4 -> G4 -> C5 -> E5
export function difficultyUpSfx() {
  if (gameState.isMuted) return;
  playNotes([261.63, 329.63, 392, 523.25, 659.25], 'square', 0.1, 0.06, 0.3, 5000);
}

// Button click -- UI click sound (short pop)
export function clickSfx() {
  if (gameState.isMuted) return;
  playTone(523.25, 'sine', 0.08, 0.2, 5000);
}
