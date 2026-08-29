// =============================================================================
// music.js — BGM patterns using Web Audio API step sequencer
// Gameplay: Energetic gym/workout beat — 140 BPM, deep bass, driving rhythm
// Game Over: Slower, somber — 70 BPM
// Uses anti-repetition: varied layer lengths, multiple phrases, random omission
// =============================================================================

const NOTES = {
  // Octave 2 (sub bass)
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
  // Octave 3
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  // Octave 4
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  // Octave 5
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00,
  R: 0, // rest
};

/**
 * Step sequencer — schedules notes in a loop using Web Audio API.
 * Returns { stop() } to cancel the loop.
 *
 * @param {AudioContext} ctx
 * @param {GainNode} dest - destination node (master gain)
 * @param {Array<Array<{freq, type, gain, duration, lpf, freqEnd}>>} layers
 * @param {number} bpm - beats per minute
 * @param {number} stepsPerBeat - subdivisions per beat (default 2 = eighth notes)
 */
function sequencer(ctx, dest, layers, bpm, stepsPerBeat = 2) {
  const stepDuration = 60 / bpm / stepsPerBeat;
  let nextStepTime = ctx.currentTime + 0.05;
  let stepIndex = 0;
  let stopped = false;
  let timerId = null;

  function scheduleStep() {
    if (stopped) return;

    while (nextStepTime < ctx.currentTime + 0.1) {
      for (const layer of layers) {
        const note = layer[stepIndex % layer.length];
        if (note && note.freq > 0) {
          // Random note omission for organic variation (skip ~12% of non-bass notes)
          if (note.gain < 0.18 && Math.random() > 0.88) continue;

          const osc = ctx.createOscillator();
          osc.type = note.type || 'square';
          osc.frequency.setValueAtTime(note.freq, nextStepTime);

          if (note.freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(
              note.freqEnd,
              nextStepTime + (note.duration || stepDuration)
            );
          }

          const g = ctx.createGain();
          const noteGain = note.gain ?? 0.15;
          g.gain.setValueAtTime(noteGain, nextStepTime);
          g.gain.exponentialRampToValueAtTime(
            0.001,
            nextStepTime + (note.duration || stepDuration * 0.9)
          );

          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(note.lpf || 3000, nextStepTime);

          osc.connect(f).connect(g).connect(dest);
          osc.start(nextStepTime);
          osc.stop(nextStepTime + (note.duration || stepDuration));
        }
      }

      stepIndex++;
      nextStepTime += stepDuration;
    }

    timerId = setTimeout(scheduleStep, 25);
  }

  scheduleStep();
  return { stop() { stopped = true; clearTimeout(timerId); } };
}

/**
 * Helper: convert a string pattern into note objects.
 */
function parsePattern(str, type = 'square', gain = 0.15, lpf = 3000, duration = null) {
  return str.split(' ').map(n => {
    if (n === 'R' || n === '~') return { freq: 0 };
    return { freq: NOTES[n] || 0, type, gain, lpf, duration };
  });
}

/**
 * Helper: create a kick drum note (sine with pitch drop).
 */
function kick(gain = 0.25) {
  return { freq: 150, freqEnd: 40, type: 'sine', gain, lpf: 300, duration: 0.12 };
}

/**
 * Helper: create a hi-hat-like noise note (high-freq triangle).
 */
function hihat(gain = 0.06) {
  return { freq: 8000, type: 'square', gain, lpf: 12000, duration: 0.03 };
}

/**
 * Helper: rest note.
 */
function rest() {
  return { freq: 0 };
}

// =============================================================================
// GAMEPLAY BGM — Energetic gym/workout beat, 140 BPM
// Deep bass, driving rhythm, pump-up workout energy
// Multiple phrase variations for anti-repetition
// =============================================================================

export function gameplayBGM(ctx, dest) {
  // --- Kick pattern (4 on the floor with extra hits) ---
  // 16 steps = 2 bars at 140 BPM (eighth notes)
  const kickLayer = [
    kick(0.28), rest(), rest(), rest(),
    kick(0.28), rest(), rest(), kick(0.18),
    kick(0.28), rest(), rest(), rest(),
    kick(0.28), rest(), kick(0.15), rest(),
  ];

  // --- Hi-hat pattern (offbeat emphasis) --- 12 steps for polyrhythm
  const hihatLayer = [
    rest(), hihat(0.05), hihat(0.07), hihat(0.05),
    rest(), hihat(0.05), hihat(0.07), hihat(0.05),
    rest(), hihat(0.05), hihat(0.07), hihat(0.05),
  ];

  // --- Deep bass line (driving sub) --- 16 steps
  const bassA = parsePattern(
    'E2 R E2 R E2 R G2 R A2 R A2 R G2 R E2 R',
    'sawtooth', 0.20, 250
  );

  // --- Bass variation B --- 14 steps (different length = polyrhythm)
  const bassB = parsePattern(
    'E2 R E2 R G2 R A2 R C3 R A2 R G2 R',
    'sawtooth', 0.20, 250
  );

  // Pick bass variation based on phrase cycle
  // Using different lengths (16 vs 14) means they realign after LCM = 112 steps
  // That's ~24 seconds at 140 BPM/8th notes before exact repetition

  // --- Melody phrase A (power riff) --- 16 steps
  const melodyA = parsePattern(
    'E4 R G4 A4 R A4 G4 R E4 R D4 E4 R R R R',
    'square', 0.12, 2000
  );

  // --- Melody phrase B (ascending push) --- 16 steps
  const melodyB = parsePattern(
    'E4 G4 A4 R B4 R A4 G4 R E4 R R G4 A4 B4 R',
    'square', 0.12, 2000
  );

  // --- Melody phrase C (call-and-response) --- 16 steps
  const melodyC = parsePattern(
    'R R E5 D5 R R R R R R A4 G4 E4 R R R',
    'square', 0.10, 2200
  );

  // Cycle through melody phrases: A A B B C A B C (32 bars before full repeat)
  const melodyPhases = [melodyA, melodyA, melodyB, melodyB, melodyC, melodyA, melodyB, melodyC];
  const stepsPerPhrase = 16;
  const melodyLayer = [];
  for (const phrase of melodyPhases) {
    melodyLayer.push(...phrase);
  }

  // --- Synth stab (power chord accent) --- 8 steps (very different length)
  const stabLayer = [
    { freq: NOTES.E3, type: 'sawtooth', gain: 0.08, lpf: 1500, duration: 0.08 },
    rest(), rest(), rest(),
    { freq: NOTES.E3, type: 'sawtooth', gain: 0.06, lpf: 1200, duration: 0.06 },
    rest(), rest(), rest(),
  ];

  // --- High arp texture --- 10 steps (yet another length for maximum variation)
  const arpLayer = parsePattern(
    'E5 R G5 R A5 R G5 R E5 R',
    'square', 0.03, 1200
  );

  return sequencer(ctx, dest, [
    kickLayer,
    hihatLayer,
    bassA,       // 16-step bass
    melodyLayer, // 128-step melody cycle (8 phrases x 16)
    stabLayer,   // 8-step stab
    arpLayer,    // 10-step arp
  ], 140, 2);
}

// =============================================================================
// GAME OVER BGM — Somber, slow, 70 BPM
// Minor key, descending patterns, reflective mood
// =============================================================================

export function gameOverBGM(ctx, dest) {
  // --- Slow descending melody ---
  const melody = parsePattern(
    'B4 R R A4 R R G4 R R E4 R R D4 R R R R R C4 R R R R R R R R R R R R R',
    'triangle', 0.16, 1800
  );

  // --- Sustained pad (minor chord wash) ---
  const padRoot = parsePattern(
    'A3 A3 A3 A3 A3 A3 A3 A3 A3 A3 A3 A3 A3 A3 A3 A3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3',
    'sine', 0.09, 1000
  );

  const padFifth = parsePattern(
    'E4 E4 E4 E4 E4 E4 E4 E4 E4 E4 E4 E4 E4 E4 E4 E4 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3',
    'sine', 0.06, 800
  );

  // --- Very deep bass drone ---
  const bass = parsePattern(
    'A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2',
    'sine', 0.12, 200
  );

  return sequencer(ctx, dest, [
    melody,
    padRoot,
    padFifth,
    bass,
  ], 70, 2);
}
