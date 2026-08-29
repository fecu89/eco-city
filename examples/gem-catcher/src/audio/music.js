import { stack, note, s } from '@strudel/web';

// Gameplay BGM -- Upbeat, magical night-sky theme
// Twinkling arpeggios, steady bass, energetic and fun
// Key: E minor / G major, ~130 cpm
export function gameplayBGM() {
  return stack(
    // Lead melody -- twinkling square, magical feel
    note('e4 g4 b4 g4 a4 ~ e4 ~ b4 a4 g4 e4 d4 e4 g4 ~')
      .s('square')
      .gain(0.15)
      .lpf(2400)
      .decay(0.15)
      .sustain(0.2)
      .release(0.3)
      .room(0.3)
      .delay(0.15)
      .delaytime(0.375)
      .delayfeedback(0.25),
    // Counter melody -- sparse sparkle in upper register
    note('~ ~ b5 ~ ~ ~ e5 ~ ~ ~ g5 ~ ~ ~ ~ ~')
      .s('sine')
      .gain(0.07)
      .lpf(3500)
      .decay(0.2)
      .sustain(0)
      .release(0.5)
      .room(0.5)
      .delay(0.3)
      .delaytime(0.5)
      .delayfeedback(0.4),
    // Bass -- steady triangle pulse, foundation
    note('e2 e2 g2 g2 a2 a2 b2 b2')
      .s('triangle')
      .gain(0.2)
      .lpf(500),
    // Drums -- light percussion to keep energy
    s('bd ~ sd ~, hh*8')
      .gain(0.22),
    // Twinkling arp texture -- very quiet, magical shimmer
    note('e4 g4 b4 e5 b4 g4')
      .s('square')
      .fast(3)
      .gain(0.04)
      .lpf(1200)
      .decay(0.08)
      .sustain(0)
      .room(0.4)
      .delay(0.2)
      .delaytime(0.25)
      .delayfeedback(0.3)
  ).cpm(130).play();
}

// Game Over BGM -- Somber, slow, reflective
// Minor key, gentle descending melody with reverb
// ~60 cpm
export function gameOverTheme() {
  return stack(
    // Descending melody -- melancholic triangle
    note('b4 ~ a4 ~ g4 ~ e4 ~ d4 ~ c4 ~ b3 ~ ~ ~')
      .s('triangle')
      .gain(0.16)
      .decay(0.6)
      .sustain(0.1)
      .release(1.0)
      .room(0.6)
      .roomsize(5)
      .lpf(1800),
    // Dark pad -- minor chord wash
    note('a2,c3,e3')
      .s('sine')
      .attack(0.5)
      .release(2.5)
      .gain(0.11)
      .room(0.7)
      .roomsize(6)
      .lpf(1200),
    // Sub bass -- barely there, grounding
    note('a1 ~ ~ ~ e1 ~ ~ ~')
      .s('sine')
      .gain(0.1)
      .lpf(250)
      .slow(2)
  ).slow(3).cpm(60).play();
}
