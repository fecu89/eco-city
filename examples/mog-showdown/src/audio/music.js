/**
 * BGM patterns -- Strudel looping background music.
 * Each function returns a playing pattern (call .play() inside).
 * Theme: Looksmaxxing arena -- aggressive, gym/workout energy.
 *
 * Uses synth oscillators ONLY (no sample names like bd/sd/hh).
 * Anti-repetition: cycle alternation, layer phasing, probabilistic notes, filter cycling.
 */

import { note, stack } from '@strudel/web';

/**
 * Gameplay BGM -- Energetic, competitive beat (135 cpm).
 * Aggressive bass, punchy synth stabs, gym/workout vibes.
 * Effective loop: ~12 cycles before exact repetition (melody 4x, bass 3x, arp 1.5x, texture 3x).
 */
export function gameplayBGM() {
  return stack(
    // Lead -- 4 alternating aggressive riffs (sawtooth for edge)
    note('<[e3 e3 ~ g3 a3 ~ e3 ~ g3 a3 b3 a3 g3 ~ e3 ~] [a3 a3 ~ b3 c4 ~ a3 ~ b3 c4 a3 ~ g3 ~ a3 ~] [e3 g3 ~ a3 ~ b3 a3 ~ g3 e3 ~ g3 a3 ~ e3 ~] [b3 a3 ~ g3 e3 ~ g3 ~ a3 b3 ~ a3 g3 ~ e3 g3]>')
      .s('sawtooth')
      .gain(0.16)
      .lpf(1800)
      .decay(0.1)
      .sustain(0.35)
      .release(0.15),
    // Synth kick -- 2 alternating patterns (sine for punch)
    note('<[c1 ~ c1 ~ c1 c1 ~ ~ c1 ~ c1 ~ c1 ~ c1 ~] [c1 c1 ~ ~ c1 ~ c1 ~ ~ c1 ~ c1 c1 ~ ~ c1]>')
      .s('sine')
      .gain(0.3)
      .decay(0.12)
      .sustain(0)
      .lpf(200),
    // Synth snare -- square with short decay on offbeats
    note('<[~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~] [~ ~ ~ c3 ~ ~ c3 ~ ~ ~ ~ c3 ~ ~ c3 ~]>')
      .s('square')
      .gain(0.12)
      .decay(0.07)
      .sustain(0)
      .lpf(2500)
      .hpf(800),
    // Bass -- 3 alternating root progressions (triangle for weight)
    note('<[e1 e1 ~ ~ a1 a1 ~ ~ d1 d1 ~ ~ g1 g1 ~ ~] [a1 a1 ~ ~ d1 d1 ~ ~ g1 g1 ~ ~ c1 c1 ~ ~] [e1 ~ e1 ~ g1 ~ g1 ~ a1 ~ a1 ~ e1 ~ e1 ~]>')
      .s('triangle')
      .gain(0.2)
      .lpf(400)
      .slow(1),
    // Stab arp -- filter cycling for movement, phased at 1.5x
    note('e4 g4 b4 e5')
      .s('square')
      .fast(4)
      .gain(0.06)
      .lpf('<1200 800 1800 1000>')
      .decay(0.05)
      .sustain(0)
      .slow(1.5),
    // Hi-hat texture -- high freq square, probabilistic
    note('c6 c6? c6 c6? c6 c6? c6 c6?')
      .s('square')
      .gain(0.04)
      .decay(0.02)
      .sustain(0)
      .lpf(8000)
      .hpf(4000)
      .slow(3)
  ).cpm(135).play();
}

/**
 * Game Over (Win) BGM -- Triumphant, victorious (100 cpm).
 * Gold/champion vibes, major key, rising energy.
 */
export function gameOverWinBGM() {
  return stack(
    // Triumphant melody -- 3 alternating phrases
    note('<[g4 ~ a4 ~ b4 ~ d5 ~ b4 ~ a4 ~ g4 ~ ~ ~] [d5 ~ b4 ~ a4 ~ g4 ~ a4 ~ b4 ~ d5 ~ ~ ~] [b4 ~ d5 ~ e5 ~ d5 ~ b4 ~ a4 ~ g4 ~ a4 ~]>')
      .s('square')
      .gain(0.15)
      .lpf(2500)
      .decay(0.3)
      .sustain(0.2)
      .release(0.5)
      .room(0.4)
      .delay(0.15)
      .delaytime(0.4)
      .delayfeedback(0.25),
    // Victory pad -- major chords, slow
    note('<[g3,b3,d4] [c3,e3,g3] [d3,f3,a3] [g3,b3,d4]>')
      .s('sine')
      .attack(0.5)
      .release(1.5)
      .gain(0.12)
      .room(0.5)
      .roomsize(4)
      .lpf(1800)
      .slow(2),
    // Bass -- grounding, 2 alternating
    note('<[g2 ~ ~ ~ c2 ~ ~ ~ d2 ~ ~ ~ g2 ~ ~ ~] [c2 ~ ~ ~ d2 ~ ~ ~ g2 ~ ~ ~ c2 ~ ~ ~]>')
      .s('triangle')
      .gain(0.16)
      .lpf(500)
      .slow(2),
    // Shimmer accents -- probabilistic sparkle
    note('g5? ~ b5? ~ d6? ~ ~ ~ g5? ~ ~ ~ b5? ~ ~ ~')
      .s('sine')
      .gain(0.04)
      .decay(0.15)
      .sustain(0)
      .room(0.6)
      .delay(0.4)
      .delaytime(0.5)
      .delayfeedback(0.4)
      .lpf(3000)
      .slow(3)
  ).cpm(100).play();
}

/**
 * Game Over (Lose) BGM -- Deflating, somber (60 cpm).
 * Brief, not depressing -- minor key, descending.
 */
export function gameOverLoseBGM() {
  return stack(
    // Sad descending melody -- 3 variations
    note('<[e4 ~ d4 ~ c4 ~ b3 ~ a3 ~ ~ ~ ~ ~ ~ ~] [c4 ~ b3 ~ a3 ~ g3 ~ ~ ~ ~ ~ ~ ~ ~ ~] [a3 ~ g3 ~ e3 ~ d3 ~ c3 ~ ~ ~ ~ ~ ~ ~]>')
      .s('triangle')
      .gain(0.14)
      .decay(0.5)
      .sustain(0.1)
      .release(1.0)
      .room(0.6)
      .roomsize(5)
      .lpf(1600),
    // Dark minor pad -- slow chords
    note('<[a2,c3,e3] [d2,f2,a2] [e2,g2,b2]>')
      .s('sine')
      .attack(0.6)
      .release(2.0)
      .gain(0.1)
      .room(0.7)
      .roomsize(6)
      .lpf(1100)
      .slow(2),
    // Ghostly texture -- sparse, probabilistic
    note('~ ~ ~ ~ ~ e5? ~ ~ ~ ~ ~ ~ ~ b4? ~ ~')
      .s('sine')
      .gain(0.03)
      .delay(0.5)
      .delaytime(0.6)
      .delayfeedback(0.5)
      .room(0.7)
      .lpf(2000)
      .slow(3)
  ).slow(2).cpm(60).play();
}
