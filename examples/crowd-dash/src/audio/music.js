// =============================================================================
// music.js — BGM patterns for Crowd Dash (neon city synthwave theme)
// Uses Strudel stack() with explicit imports from @strudel/web.
// Each function returns the result of .play() for AudioManager to track.
// =============================================================================

import { stack, note, s } from '@strudel/web';

// ---------------------------------------------------------------------------
// Gameplay BGM — Upbeat synthwave / cyberpunk (130 CPM)
// Pulsing bass, arpeggiated synth, electronic beats, neon energy
// ---------------------------------------------------------------------------
export function gameplayBGM() {
  return stack(
    // Lead synth — punchy square arpeggios, neon-bright
    note('c4 eb4 g4 bb4 c5 bb4 g4 eb4')
      .s('square')
      .gain(0.14)
      .lpf(2400)
      .decay(0.1)
      .sustain(0.2)
      .release(0.15)
      .delay(0.15)
      .delaytime(0.23)
      .delayfeedback(0.25),

    // Counter melody — sparse fills in the gaps
    note('~ g5 ~ ~ ~ eb5 ~ ~')
      .s('square')
      .gain(0.06)
      .lpf(3000)
      .decay(0.15)
      .sustain(0),

    // Pad — warm minor chord wash
    note('<c3,eb3,g3> <c3,eb3,g3> <ab2,c3,eb3> <bb2,d3,f3>')
      .s('sawtooth')
      .attack(0.4)
      .release(1.2)
      .gain(0.08)
      .lpf(1200)
      .room(0.3)
      .roomsize(3)
      .slow(2),

    // Bass — driving sawtooth pulse (synthwave signature)
    note('c2 [eb2 g2] c2 bb1 ab1 [bb1 c2] ab1 g1')
      .s('sawtooth')
      .gain(0.2)
      .lpf(600)
      .decay(0.15)
      .sustain(0.3),

    // Drums — four-on-the-floor with hi-hats
    s('bd bd sd bd, hh*8')
      .gain(0.25),

    // Texture arp — very quiet background shimmer
    note('c4 eb4 g4 bb4')
      .s('triangle')
      .fast(4)
      .gain(0.04)
      .lpf(1400)
      .decay(0.06)
      .sustain(0)
      .room(0.4)
      .delay(0.2)
      .delaytime(0.375)
      .delayfeedback(0.3)
  ).cpm(130).play();
}

// ---------------------------------------------------------------------------
// Game Over BGM — Melancholic wind-down (60 CPM)
// Somber, reflective, neon city at rest
// ---------------------------------------------------------------------------
export function gameOverTheme() {
  return stack(
    // Descending melody — tired neon glow
    note('bb4 ~ g4 ~ eb4 ~ c4 ~ bb3 ~ g3 ~ ~ ~ ~ ~')
      .s('triangle')
      .gain(0.16)
      .decay(0.6)
      .sustain(0.1)
      .release(1.2)
      .room(0.6)
      .roomsize(5)
      .lpf(1600),

    // Dark minor pad — ambient wash
    note('<c3,eb3,g3> <ab2,c3,eb3>')
      .s('sine')
      .attack(0.8)
      .release(2.5)
      .gain(0.1)
      .room(0.7)
      .roomsize(6)
      .lpf(1000)
      .slow(2),

    // Sub bass — low grounding pulse
    note('c2 ~ ~ ~ eb2 ~ ~ ~')
      .s('sine')
      .gain(0.14)
      .lpf(300)
      .slow(2),

    // Ghost notes — distant echoes of the city
    note('~ ~ g5 ~ ~ ~ ~ ~')
      .s('triangle')
      .slow(4)
      .gain(0.04)
      .delay(0.5)
      .delaytime(0.6)
      .delayfeedback(0.5)
      .room(0.5)
      .lpf(2000)
  ).slow(2).cpm(60).play();
}
