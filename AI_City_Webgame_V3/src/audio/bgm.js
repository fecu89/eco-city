import { AUDIO } from '../core/Constants.js';

let nodes = null;

function applyChord(oscs, chord, ctx) {
  oscs.forEach((oscillator, index) => {
    const frequency = chord[index];
    oscillator.frequency.cancelScheduledValues?.(ctx.currentTime);
    oscillator.frequency.setTargetAtTime?.(frequency, ctx.currentTime, 0.7);
    if (!oscillator.frequency.setTargetAtTime) oscillator.frequency.value = frequency;
  });
}

export function startAmbient(ctx, destination) {
  if (nodes) return false;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  const firstChord = AUDIO.AMBIENT_CHORDS[0];
  const types = ['sine', 'triangle', 'sine'];
  const oscs = firstChord.map((frequency, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = types[index];
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start();
    return oscillator;
  });
  gain.gain.linearRampToValueAtTime(AUDIO.AMBIENT_GAIN, ctx.currentTime + AUDIO.AMBIENT_FADE_IN_SECONDS);
  let chordIndex = 0;
  const timer = window.setInterval(() => {
    chordIndex = (chordIndex + 1) % AUDIO.AMBIENT_CHORDS.length;
    applyChord(oscs, AUDIO.AMBIENT_CHORDS[chordIndex], ctx);
  }, AUDIO.AMBIENT_CHORD_STEP_MS);
  nodes = { gain, oscs, timer };
  return true;
}

export function stopAmbient() {
  if (!nodes) return false;
  const current = nodes;
  nodes = null;
  window.clearInterval(current.timer);
  const ctx = current.gain.context;
  current.gain.gain.cancelScheduledValues?.(ctx.currentTime);
  current.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + AUDIO.AMBIENT_FADE_OUT_SECONDS);
  window.setTimeout(() => {
    current.oscs.forEach((oscillator) => {
      try {
        oscillator.stop();
        oscillator.disconnect?.();
      } catch {
        // The node may already have been stopped by the browser during teardown.
      }
    });
    current.gain.disconnect?.();
  }, AUDIO.AMBIENT_STOP_DELAY_MS);
  return true;
}

export function getAmbientPlaybackState() {
  return { playing: Boolean(nodes), oscillatorCount: nodes?.oscs.length || 0 };
}
