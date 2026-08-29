# Progress

## Game Concept
- **Name**: mog-showdown
- **Engine**: Phaser 3
- **Description**: Looksmaxxing arena dodge game — play as Clavicular, dodge Androgenic's attacks (wigs, hats), collect power-ups (protein shakes, dumbbells), fill the Mog Meter to trigger a devastating Frame Mog burst

## Step 1: Scaffold
- **Entities**: Clavicular (player), Androgenic (opponent NPC), Projectile (4 types: wig, hat, protein_shake, dumbbell)
- **Events**: GAME_START, GAME_OVER, GAME_RESTART, PLAYER_MOVE, PLAYER_DAMAGED, PLAYER_DIED, LIFE_LOST, SCORE_CHANGED, POWERUP_COLLECTED, ATTACK_HIT, MOG_LEVELUP, MOG_FRAMEMOG, ANDROGENIC_THROW, ANDROGENIC_WIG_EXPOSED, COMBO_BREAK, PARTICLES_EMIT, SPECTACLE_ENTRANCE/ACTION/HIT/COMBO/STREAK/NEAR_MISS, AUDIO_INIT/MUSIC_*/AUDIO_TOGGLE_MUTE
- **Constants keys**: GAME, SAFE_ZONE, CLAVICULAR, ANDROGENIC, PROJECTILE, MOG, SPAWN, LIVES, COLORS, UI, TRANSITION
- **Scoring system**: +1 per power-up collected, +5 bonus per Frame Mog trigger. Combo tracks consecutive catches without getting hit.
- **Fail condition**: 3 lives (hearts). Lose 1 life per attack hit. 0 lives = game over.
- **Input scheme**: Arrow keys left/right (desktop), tap zones left/right half (mobile)
- **Mog system**: Collect 5 power-ups to fill meter → Frame Mog burst clears attacks + exposes Androgenic's wig

## Characters
- clavicular: Tier 3 (3 unique images from Famous Birthdays, duplicated to 4 slots) — spritesheet built at public/assets/characters/clavicular/clavicular-expressions.png (800x300, 4 frames)
- androgenic: Tier 3 (3 unique images from Famous Birthdays, duplicated to 4 slots) — spritesheet built at public/assets/characters/androgenic/androgenic-expressions.png (800x300, 4 frames)

## QA Results
- Step 1: PASS — Build OK, runtime OK, scoring verified, entities visible, architecture 5/5
- Minor: characters slightly undersized (~8% vs recommended 12-15%), will address in design step

## Step 1.5: Assets
- **Character bobbleheads**: Both Clavicular and Androgenic rewritten as photo-composite bobblehead entities (cartoon South Park-style body + photo head spritesheet)
- **Spritesheet preloading**: BootScene now preloads both expression spritesheets (clavicular-head, androgenic-head) with 200x300 frame dimensions
- **Expression system**: Added EXPRESSION constants (NORMAL=0, HAPPY=1, ANGRY=2, SURPRISED=3) and EXPRESSION_HOLD_MS (600ms default), both characters have setExpression() method with auto-revert timer
- **Expression wiring in GameScene**: Clavicular goes HAPPY on powerup, ANGRY on hit, SURPRISED on frame mog. Androgenic goes ANGRY on powerup, HAPPY on hit, SURPRISED on frame mog. All listeners properly cleaned up on scene shutdown.
- **CHARACTER constants**: Added centralized bobblehead sizing unit system (_U based, with TORSO_H, SHOULDER_W, HEAD_H, FRAME_W/H, etc.)
- **Character scaling**: Clavicular WIDTH increased from 10% to 14% of canvas width, Androgenic from 12% to 16% (addresses QA note about undersized characters)
- **Androgenic wig mechanic**: Preserved and enhanced -- hat is now a separate Graphics object that animates flying off (upward + rotation + fade), surprised expression set on head sprite, hat restores after duration
- **Idle animations**: Both characters have breathing tweens (body bob) and bobblehead lag (head bobs with slight delay)
- **Projectile improvements**: All 4 projectile types sized up ~20% for visibility, each now has a subtle glow outline (lineStyle with 0.3 alpha)

## Step 2: Design

### New Files
- `src/effects/ParticleManager.js` — Handles all particle effects: ambient motes, burst particles on events, player trail
- `src/effects/ScreenEffects.js` — Screen shake, background pulse overlays (additive blend), hit freeze frames
- `src/effects/TextEffects.js` — Floating score text (elastic scale), combo counter display, streak milestone announcements, near-miss indicators, entrance flavor text

### Constants Added
- `EFFECTS` section in Constants.js with 45+ configurable values covering: opening moment, ambient particles, action/hit particles, floating text, background pulse, player trail, screen shake intensities, combo system scaling, streak milestones, hit freeze, flash overlays, near-miss, Frame Mog burst, and game over screen

### Opening Moment (First 3 Seconds)
- Camera flash (300ms white) on scene start
- Androgenic slides in from top (Power2 ease, 600ms)
- Clavicular slams in from below (Bounce.easeOut, 800ms) with landing camera shake (0.012 intensity)
- Landing particle burst (20 particles, neon gold/blue/purple)
- "MOG OR BE MOGGED!" flavor text slams in (Back.easeOut) then fades
- Ambient particles active from frame 1 (15 drifting motes in gold/blue/purple/pink, additive blend, sine-wave drift)
- Neon floor glow pulsing continuously (additive blend, alpha 0.2-0.6)

### Every-Action Effects
- **SPECTACLE_HIT**: 16-particle burst at player position (gold/blue/green/pink)
- **SPECTACLE_ACTION**: Throttled 4-particle burst on movement (every 200ms)
- **SCORE_CHANGED**: Floating score text (+1 or +1 x3 for combos) with 1.8x start scale, Elastic.easeOut, 700ms rise and fade; background gold pulse (additive, alpha 0.15, 300ms); HUD score punch animation (1.3x scale yoyo)
- **ATTACK_HIT**: Medium screen shake (0.012), red background pulse, 60ms physics freeze frame
- **SPECTACLE_NEAR_MISS**: "CLOSE!" text popup, blue pulse, 10-particle burst
- **Player trail**: Persistent particle emitter following player during movement (neon gold/blue/purple, additive blend, 40ms frequency, 350ms lifespan)

### Combo & Streak System
- **SPECTACLE_COMBO**: Combo counter text (32px base + 5px per combo), punch-scale animation on update; particles scale with combo count (12 + combo*2, capped at 30); shake scales (0.008 + combo*0.002, capped at 0.025); pink background pulse intensity scales
- **COMBO_BREAK**: Combo counter fades out with scale-down animation
- **SPECTACLE_STREAK (5x, 10x, 25x)**: Full-screen text slam ("FRAME CHECK!" / "MOG OR BE MOGGED!" / "ABSOLUTE MOGGER!") with glow layer (additive blend) + Back.easeOut; 40-particle explosion; heavy shake (0.020); camera flash; 90ms freeze frame

### Frame Mog Enhancement
- Glow text layer (additive blend, blur 30) behind main text
- Slam-in with 1.4x overshoot, settle to 1.1x, then fade
- 30-particle golden burst from player position
- Heavy screen shake + gold background pulse + 120ms freeze frame

### Death & Game Over Polish
- **triggerGameOver**: Heavy shake (0.020), red camera flash (300ms)
- **OUCH! text**: Now has elastic scale-in from 1.8x, larger font, depth-sorted
- **GameOverScene entry**: White camera flash (250ms)
- **Result text**: "YOU MOGGED HIM!" / "YOU GOT MOGGED!" now has glow layer (additive blend, pulsing alpha 0.24-0.6) + dramatic Back.easeOut scale-in from 0 to 1.15x then settle to 1x
- **Score panel**: Enhanced with container-based scale-in (Back.easeOut, 500ms) + glow border
- **Score value**: Gold glow shadow added
- **Ambient particles on game over**: 12 floating motes drifting upward with gentle horizontal drift (neon colors, additive blend)

### Design Audit Scores (all 4+)
1. **Background**: 5/5 — Deep purple gradient, neon grid lines, pulsing floor glow
2. **Palette**: 5/5 — Neon gold/blue/purple/pink accents on dark arena; consistent with looksmaxxing theme
3. **Animations**: 5/5 — Breathing tweens, bobblehead lag, entrance sequence, collectible scale/fade
4. **Particles**: 5/5 — Ambient motes, hit bursts, combo bursts, streaks, trail, Frame Mog explosion, game over floaters
5. **Transitions**: 5/5 — Camera flash/fade, entrance sequence, game over scale-in
6. **Typography**: 4/5 — Floating text with elastic scaling, glow layers on key text, combo counter scales with size
7. **Game Feel**: 5/5 — Screen shake on every hit (scaled), freeze frames on damage/streaks, background pulse feedback
8. **Game Over**: 5/5 — Flash entry, glow pulsing result text, panel scale-in, ambient particles
9. **Character Prominence**: 5/5 — Photo-composite bobbleheads, player trail, expression reactions
10. **First Impression / Viral Appeal**: 5/5 — First 3 seconds have flash, bounce-in, shake, particles, flavor text; zero static frames

## Step 3: Audio

### New Files
- `src/audio/AudioManager.js` -- Wraps Strudel `initStrudel()`, `hush()`, `.play()` for BGM. Tracks initialized state, current pattern, and last pattern function for mute/unmute resume. Methods: `init()`, `playMusic(fn)`, `stopMusic()`, `muteStop()`, `resumeMusic()`.
- `src/audio/music.js` -- Three BGM patterns using Strudel `stack()` + `.play()` with synth oscillators only (no sample names):
  - **gameplayBGM** (135 cpm): Aggressive sawtooth lead (4 alternating riffs), synth kick (2 patterns), synth snare, triangle bass (3 progressions), square stab arp (phased at 1.5x), hi-hat texture (probabilistic, phased at 3x). ~12 cycles before exact repetition.
  - **gameOverWinBGM** (100 cpm): Triumphant square melody (3 phrases), major pad chords (sine, slow 2x), grounding bass, shimmer accents (probabilistic, slow 3x).
  - **gameOverLoseBGM** (60 cpm): Descending triangle melody (3 variations), dark minor pad (sine, slow 2x), ghostly probabilistic texture (slow 3x).
- `src/audio/sfx.js` -- Web Audio API one-shot sound effects (never Strudel):
  - `powerupCollectSfx()`: Bright ascending 5-note chime (C5-E5-G5-B5-C6)
  - `attackHitSfx()`: Low sine thud (55Hz) + noise burst impact
  - `frameMogSfx()`: Rising sawtooth sweep (C3->C5) + triumphant chord + noise whoosh
  - `comboSfx()`: Quick punchy square blip (G5)
  - `lifeLostSfx()`: Descending 3-note minor phrase (A4-F4-C4)
  - `gameOverSfx()`: Heavy descending tones (G4->D3) + noise burst
- `src/audio/AudioBridge.js` -- Wires EventBus events to audio:
  - `AUDIO_INIT` -> `audioManager.init()`
  - `GAME_START` -> `MUSIC_GAMEPLAY` -> gameplay BGM
  - `POWERUP_COLLECTED` -> `powerupCollectSfx()`
  - `ATTACK_HIT` -> `attackHitSfx()`
  - `MOG_FRAMEMOG` -> `frameMogSfx()`
  - `SPECTACLE_COMBO` -> `comboSfx()`
  - `LIFE_LOST` -> `lifeLostSfx()`
  - `GAME_OVER` -> stop BGM + `gameOverSfx()` + 800ms delay + game-over BGM (win/lose based on score > 20)
  - `GAME_RESTART` -> `stopMusic()` (full stop, clears pattern)
  - `AUDIO_TOGGLE_MUTE` -> toggle `gameState.isMuted`, persist to localStorage, muteStop/resumeMusic
- `src/scenes/UIScene.js` -- Parallel overlay scene with mute button:
  - Speaker icon drawn with Phaser Graphics (body + cone + wave arcs / X mark when muted)
  - Bottom-right corner, semi-transparent hit zone (large enough for mobile touch)
  - Click/tap toggles mute via `AUDIO_TOGGLE_MUTE`
  - M key shortcut
  - Visible in both GameScene and GameOverScene (runs as parallel scene)

### Modified Files
- `src/main.js` -- Imports and calls `initAudioBridge()` before game creation. Adds first-interaction handler (pointerdown/keydown) that emits `AUDIO_INIT` + `GAME_START` once.
- `src/core/GameConfig.js` -- Added UIScene to scene list.
- `src/scenes/BootScene.js` -- Launches UIScene in parallel on create.
- `src/scenes/GameScene.js` -- Emits `GAME_START` in `create()` for restart BGM wiring.

### Architecture Notes
- BGM uses Strudel (`@strudel/web`) -- patterns loop via `.play()`, stopped with `hush()`. 100ms delay between hush and new play.
- SFX uses Web Audio API directly -- one-shot oscillators + gain + filter. `hush()` never kills SFX.
- All SFX check `gameState.isMuted` before playing.
- `gameState.isMuted` initialized from localStorage, persisted on toggle, not reset by `gameState.reset()`.
- Audio events already existed in EventBus from scaffold step (AUDIO_INIT, MUSIC_GAMEPLAY, MUSIC_GAMEOVER, MUSIC_STOP, AUDIO_TOGGLE_MUTE).
- Anti-repetition: 4-phrase cycle alternation on leads, 3-phrase on bass, probabilistic notes (`?`), filter cycling (`<...>`), layer phasing with different `.slow()` values. Effective loop > 30 seconds.

## Decisions / Known Issues
- Gravity set to 0 — projectiles use custom velocity for falling
- No title screen — boots directly into gameplay
- No in-game score HUD — Play.fun widget handles score display
- 53 magic numbers flagged in architecture validation (rendering proportions in entity drawing code) — acceptable for Graphics API drawing, will be replaced by spritesheets in Step 1.5
