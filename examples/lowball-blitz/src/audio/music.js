import { stack, note } from '@strudel/web';

/**
 * Gameplay BGM (~130 cpm) -- energetic, mischievous suburban runner vibe.
 * Layers: bass + lead melody + counter melody + synth kick + arp texture.
 * Uses cycle alternation, layer phasing, probabilistic notes, and filter cycling
 * for 30+ second effective loop before exact repetition.
 */
export function gameplayBGM() {
  return stack(
    // Lead melody -- 4 alternating mischievous phrases (square for chiptune energy)
    note('<[e4 g4 a4 ~ e4 g4 b4 ~ a4 g4 e4 ~ d4 e4 ~ ~] [g4 a4 b4 ~ g4 a4 c5 ~ b4 a4 g4 ~ e4 g4 ~ ~] [a4 ~ g4 e4 g4 ~ e4 d4 e4 ~ g4 a4 ~ ~ b4 ~] [b4 a4 g4 ~ e4 g4 a4 ~ g4 e4 d4 ~ e4 ~ ~ ~]>')
      .s('square')
      .gain(0.15)
      .lpf(2500)
      .decay(0.12)
      .sustain(0.2)
      .release(0.3),
    // Counter melody -- sparse, offset phasing (1.5x cycle)
    note('<[~ ~ b4 ~ ~ ~ e5? ~ ~ ~ ~ ~ g4? ~ ~ ~] [~ ~ ~ ~ ~ e5 ~ ~ ~ b4? ~ ~ ~ ~ g4 ~]>')
      .s('square')
      .gain(0.07)
      .lpf('<3000 2200 2800 2000>')
      .decay(0.15)
      .sustain(0)
      .slow(1.5),
    // Bass -- 3 alternating root progressions (triangle for warmth)
    note('<[e2 ~ e2 ~ a2 ~ a2 ~ d2 ~ d2 ~ g2 ~ g2 ~] [a2 ~ a2 ~ d2 ~ d2 ~ g2 ~ g2 ~ c2 ~ c2 ~] [e2 ~ g2 ~ a2 ~ e2 ~ d2 ~ g2 ~ c2 ~ e2 ~]>')
      .s('triangle')
      .gain(0.2)
      .lpf(500),
    // Synth kick drum -- 2 alternating patterns (sine for thump)
    note('<[c1 ~ c1 ~ c1 c1 ~ ~ c1 ~ c1 ~ c1 ~ c1 ~] [c1 c1 ~ ~ c1 ~ c1 ~ ~ c1 ~ c1 c1 ~ ~ c1]>')
      .s('sine')
      .gain(0.25)
      .decay(0.12)
      .sustain(0)
      .lpf(200),
    // Hi-hat texture -- probabilistic for organic feel
    note('c6 c6? c6 c6? c6 c6? c6 c6?')
      .s('square')
      .gain(0.04)
      .decay(0.03)
      .sustain(0)
      .lpf('<6000 5000 7000 5500>')
      .fast(2),
    // Arp texture -- filter cycling, phased against other layers
    note('e3 g3 b3 e4')
      .s('square')
      .fast(4)
      .gain(0.04)
      .lpf('<1000 700 1400 900>')
      .decay(0.06)
      .sustain(0)
      .slow(3)
  ).cpm(130).play();
}

/**
 * Game over theme (~60 cpm) -- somber, descending, short looping phrase.
 * 3 alternating descending melodies + dark pad + ghostly texture.
 */
export function gameOverTheme() {
  return stack(
    // Descending melody -- 3 variations (triangle for softness)
    note('<[b4 ~ a4 ~ g4 ~ e4 ~ d4 ~ c4 ~ ~ ~ ~ ~] [e4 ~ d4 ~ c4 ~ b3 ~ a3 ~ g3 ~ ~ ~ ~ ~] [g4 ~ e4 ~ d4 ~ c4 ~ e4 ~ d4 ~ b3 ~ ~ ~]>')
      .s('triangle')
      .gain(0.16)
      .decay(0.6)
      .sustain(0.1)
      .release(1.0)
      .room(0.6)
      .roomsize(5)
      .lpf(1800),
    // Dark pad -- alternating minor chords on slow cycle
    note('<[a2,c3,e3] [d2,f2,a2] [e2,g2,b2]>')
      .s('sine')
      .attack(0.5)
      .release(2.5)
      .gain(0.1)
      .room(0.7)
      .roomsize(6)
      .lpf(1200)
      .slow(2),
    // Ghostly high texture -- probabilistic, phased
    note('~ ~ ~ ~ ~ e5? ~ ~ ~ ~ ~ ~ ~ b4? ~ ~')
      .s('sine')
      .gain(0.03)
      .delay(0.5)
      .delaytime(0.6)
      .delayfeedback(0.5)
      .room(0.7)
      .lpf(2000)
      .slow(3)
  ).slow(3).cpm(60).play();
}
