// =============================================================================
// sfx.js — One-shot sound effects using Web Audio API
// All SFX use OscillatorNode + GainNode + BiquadFilterNode, zero audio files.
// Each function creates nodes, plays immediately, and auto-cleans up.
// =============================================================================

import { audioManager } from './AudioManager.js';

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Play a single tone with gain envelope and lowpass filter.
 */
function playTone(freq, type, duration, gain = 0.3, filterFreq = 4000) {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq, now);

    osc.connect(f).connect(g).connect(audioManager.getMaster());
    osc.start(now);
    osc.stop(now + duration);
  } catch (_) {}
}

/**
 * Play a sequence of notes with fixed timing.
 */
function playNotes(notes, type, noteDuration, gap, gain = 0.3, filterFreq = 4000) {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    notes.forEach((freq, i) => {
      const start = now + i * gap;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);

      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);

      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filterFreq, start);

      osc.connect(f).connect(g).connect(audioManager.getMaster());
      osc.start(start);
      osc.stop(start + noteDuration);
    });
  } catch (_) {}
}

/**
 * Play white noise burst with lowpass and optional highpass filter.
 */
function playNoise(duration, gain = 0.2, lpfFreq = 4000, hpfFreq = 0) {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(lpfFreq, now);

    if (hpfFreq > 0) {
      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.setValueAtTime(hpfFreq, now);
      source.connect(hpf).connect(lpf).connect(g).connect(audioManager.getMaster());
    } else {
      source.connect(lpf).connect(g).connect(audioManager.getMaster());
    }

    source.start(now);
    source.stop(now + duration);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Game SFX
// ---------------------------------------------------------------------------

/**
 * Metallic clank — weight being caught.
 * Short, punchy metallic impact with high harmonics.
 */
export function catchSfx() {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Primary metallic hit — high sine with fast decay
    const osc1 = ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(1200, now);
    osc1.frequency.exponentialRampToValueAtTime(400, now + 0.06);

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.25, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(2000, now);
    f1.Q.setValueAtTime(3, now);

    osc1.connect(f1).connect(g1).connect(audioManager.getMaster());
    osc1.start(now);
    osc1.stop(now + 0.1);

    // Secondary ring — metallic overtone
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(3200, now);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.08, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc2.connect(g2).connect(audioManager.getMaster());
    osc2.start(now);
    osc2.stop(now + 0.15);

    // Noise transient (impact click)
    playNoise(0.03, 0.15, 6000, 2000);
  } catch (_) {}
}

/**
 * Heavy thud — weight hitting the floor.
 * Deep, impactful low-frequency thump.
 */
export function missSfx() {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep thud — sine with pitch drop
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200, now);

    osc.connect(f).connect(g).connect(audioManager.getMaster());
    osc.start(now);
    osc.stop(now + 0.35);

    // Noise rumble (floor vibration)
    playNoise(0.2, 0.12, 300, 20);

    // Sub impact
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(50, now);

    const gs = ctx.createGain();
    gs.gain.setValueAtTime(0.20, now);
    gs.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    sub.connect(gs).connect(audioManager.getMaster());
    sub.start(now);
    sub.stop(now + 0.2);
  } catch (_) {}
}

/**
 * Power grunt/growl — short burst for flex.
 * Low sawtooth with distortion-like filter sweep.
 */
export function flexSfx() {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Growl — low sawtooth with filter sweep up
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.1);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.25);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.linearRampToValueAtTime(0.28, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, now);
    f.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    f.frequency.exponentialRampToValueAtTime(200, now + 0.3);

    osc.connect(f).connect(g).connect(audioManager.getMaster());
    osc.start(now);
    osc.stop(now + 0.35);

    // Noise burst (breath/exertion)
    playNoise(0.12, 0.10, 1200, 200);
  } catch (_) {}
}

/**
 * Energetic chime/sparkle — ascending notes for powerup.
 * Bright, ascending arpeggio with shimmer.
 */
export function powerupSfx() {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Ascending bright notes
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const start = now + i * 0.05;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

      osc.connect(g).connect(audioManager.getMaster());
      osc.start(start);
      osc.stop(start + 0.25);
    });

    // Shimmer overtone
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(2637, now + 0.15);

    const gs = ctx.createGain();
    gs.gain.setValueAtTime(0.06, now + 0.15);
    gs.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    shimmer.connect(gs).connect(audioManager.getMaster());
    shimmer.start(now + 0.15);
    shimmer.stop(now + 0.55);
  } catch (_) {}
}

/**
 * Quick ascending arpeggio for combos.
 * Pitch scales higher with combo count.
 * @param {number} comboCount - current combo (affects pitch)
 */
export function comboSfx(comboCount = 1) {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Base pitch scales up with combo (capped at +2 octaves)
    const pitchMultiplier = 1 + Math.min(comboCount, 20) * 0.05;
    const baseNotes = [329.63, 392.00, 493.88]; // E4, G4, B4

    baseNotes.forEach((freq, i) => {
      const scaledFreq = freq * pitchMultiplier;
      const start = now + i * 0.04;

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(scaledFreq, start);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3000 + comboCount * 200, start);

      osc.connect(f).connect(g).connect(audioManager.getMaster());
      osc.start(start);
      osc.stop(start + 0.12);
    });
  } catch (_) {}
}

/**
 * Epic horn/fanfare blast for streaks.
 * Bold sawtooth chord with rising power.
 */
export function streakSfx() {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Fanfare chord — stacked sawtooth fifths
    const chordFreqs = [196.00, 261.63, 329.63, 392.00]; // G3, C4, E4, G4
    chordFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.05);
      g.gain.setValueAtTime(0.12, now + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(800, now);
      f.frequency.exponentialRampToValueAtTime(3000, now + 0.15);
      f.frequency.exponentialRampToValueAtTime(1000, now + 0.6);

      osc.connect(f).connect(g).connect(audioManager.getMaster());
      osc.start(now);
      osc.stop(now + 0.65);
    });

    // Rising pitch accent
    const accent = ctx.createOscillator();
    accent.type = 'square';
    accent.frequency.setValueAtTime(392, now + 0.2);
    accent.frequency.exponentialRampToValueAtTime(784, now + 0.45);

    const ga = ctx.createGain();
    ga.gain.setValueAtTime(0.08, now + 0.2);
    ga.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    accent.connect(ga).connect(audioManager.getMaster());
    accent.start(now + 0.2);
    accent.stop(now + 0.55);
  } catch (_) {}
}

/**
 * Dramatic slam/impact for GigaChad's entrance landing.
 * Deep boom with reverb-like tail and metallic ring.
 */
export function entranceSfx() {
  try {
    const ctx = audioManager.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep boom — sine with dramatic pitch drop
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(200, now);
    boom.frequency.exponentialRampToValueAtTime(25, now + 0.5);

    const gb = ctx.createGain();
    gb.gain.setValueAtTime(0.35, now);
    gb.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    const fb = ctx.createBiquadFilter();
    fb.type = 'lowpass';
    fb.frequency.setValueAtTime(400, now);

    boom.connect(fb).connect(gb).connect(audioManager.getMaster());
    boom.start(now);
    boom.stop(now + 0.65);

    // Sub rumble
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(40, now);

    const gs = ctx.createGain();
    gs.gain.setValueAtTime(0.25, now);
    gs.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    sub.connect(gs).connect(audioManager.getMaster());
    sub.start(now);
    sub.stop(now + 0.45);

    // Noise impact transient
    playNoise(0.15, 0.20, 2000, 100);

    // Metallic ring (dramatic)
    const ring = ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(1600, now + 0.02);

    const gr = ctx.createGain();
    gr.gain.setValueAtTime(0.06, now + 0.02);
    gr.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    ring.connect(gr).connect(audioManager.getMaster());
    ring.start(now + 0.02);
    ring.stop(now + 0.45);
  } catch (_) {}
}
