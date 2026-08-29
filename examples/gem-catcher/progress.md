# Progress

## Game Concept
- **Name**: gem-catcher
- **Engine**: Phaser 3
- **Description**: Gems rain from the sky and the player slides a basket left/right to catch them. Skulls also fall — catch one and lose a life. 3 lives, increasing difficulty.

## Step 1: Scaffold
- **Entities**: Player (basket), Gem (diamond shape), Skull (red with eyes)
- **Events**: GAME_START, GAME_OVER, GAME_RESTART, PLAYER_MOVE, PLAYER_DIED, SCORE_CHANGED, GEM_CAUGHT, SKULL_CAUGHT, LIFE_LOST, DIFFICULTY_UP, PARTICLES_EMIT, AUDIO_INIT, MUSIC_MENU, MUSIC_GAMEPLAY, MUSIC_GAMEOVER, MUSIC_STOP
- **Constants keys**: GAME, SAFE_ZONE, PLAYER, GEM, SKULL, DIFFICULTY, LIVES, COLORS, UI, TRANSITION
- **Scoring system**: +1 per gem caught, ScoreSystem wired to GEM_CAUGHT event
- **Fail condition**: 0 lives (lose 1 life per skull caught)
- **Input scheme**: Arrow keys left/right + A/D keys + touch zones (left/right halves of screen)
- **Difficulty ramp**: Every 10 points: fall speed x1.15, spawn interval -100ms (min 400ms)

## Step 1.5: Assets
- **Palette**: DARK (gothic/dark fantasy) -- matches night sky theme
- **Renderer**: `src/core/PixelRenderer.js` with `renderPixelArt()` and `renderSpriteSheet()`
- **Sprites created**:
  - `src/sprites/palette.js` -- DARK palette with 19 colors (added brown weave, bone, skull, space colors)
  - `src/sprites/player.js` -- 20x14 woven basket, 3 poses (idle, left-tilt, right-tilt), 4-frame spritesheet
  - `src/sprites/gems.js` -- 4 gem types (diamond/gold, emerald/green, ruby/red, sapphire/cyan), each 12x14 with 2-frame sparkle animation
  - `src/sprites/skull.js` -- 14x14 menacing skull with bone-white body, dark eye sockets, red accents, 2-frame glow animation
  - `src/sprites/tiles.js` -- 3 sky tile variants (16x16), star cluster (8x8), bright star (6x6), nebula puff (8x8)
- **Dimension changes**:
  - PLAYER.WIDTH: 12% -> 14% of GAME.WIDTH; PLAYER.HEIGHT: now 10% of GAME.WIDTH (proportional to basket shape)
  - GEM.SIZE: 4% -> 6% of GAME.WIDTH
  - SKULL.SIZE: 4% -> 6% of GAME.WIDTH
  - Added PIXEL_SCALE constants to PLAYER (3), GEM (3), SKULL (3)
  - Removed PLAYER.COLOR, GEM.COLORS, SKULL.COLOR from Constants (colors now in palette)
- **Entity changes**:
  - Player.js: now uses renderSpriteSheet with basket frames, tilts left/right when moving
  - Gem.js: extends Phaser.GameObjects.Sprite (was Graphics), random gem type selection, sparkle animation, gentle rotation tween
  - Skull.js: extends Phaser.GameObjects.Sprite (was Graphics), red-eyed glow animation, sinister wobble tween
- **Background**: Gradient base + pixel art tile overlay (3 variants at low alpha) + scattered bright stars (twinkle tweens) + nebula puff decorations
- **No remaining fillCircle/generateTexture calls** in entity files

## Step 2: Design
- **New Constants sections**: PARTICLES, EFFECTS, BACKGROUND added to Constants.js
- **New Events**: SCREEN_SHAKE, SCREEN_FLASH added to EventBus.js
- **New file**: `src/systems/EffectsSystem.js` -- particle bursts, floating text, shooting stars
- **GameState change**: Added `isNewBest` flag to track new high scores

### Particles
- **Gem catch**: 10-particle sparkle burst in the caught gem's color (diamond=gold, emerald=green, ruby=red, sapphire=cyan)
- **Skull hit**: 12-particle red/dark burst at skull location (4 red/dark color variants)
- **Difficulty up**: 30-particle golden shower raining from top of screen + "LEVEL UP!" floating text
- **Gem trail**: Each falling gem emits small colored glow particles every 120ms as a trail effect

### Screen Effects
- **Screen shake**: 150ms at 0.008 intensity on skull hit via cameras.main.shake()
- **Camera flash red**: 200ms red flash on skull hit (RGB 255/50/50)
- **Slow-mo on final death**: 0.3x time scale for 500ms before transitioning to GameOverScene (both scene.time and physics.world affected)

### Juice
- **Floating "+1" text**: Gold text rises 50px and fades out over 700ms when a gem is caught
- **Heart pulse/shake**: Lost hearts pulse to 1.5x scale then dim to 0.2 alpha, with a quick horizontal shake
- **Basket idle bob**: Gentle 2px up/down breathing animation over 1500ms cycle using Sine easing
- **"LEVEL UP!" text**: Centered floating text on difficulty increase

### Background Enhancements
- **Parallax scrolling**: Stars split into near (8px/sec) and far (3px/sec) layers that drift left
- **Shooting stars**: Random diagonal streaks with fading trail, every 3-8 seconds (configurable)
- **Existing starfield preserved**: Gradient + tile overlay + twinkle animations unchanged

### Game Over Scene Polish
- **createButton() pattern preserved** -- no changes to button implementation
- **Score count-up**: Score animates from 0 to final value (1000ms max, 50ms per point) with pop effect on completion
- **"NEW BEST!" indicator**: Orange pulsing text below best score when isNewBest is true
- **Title slide-in**: "GAME OVER" text slides down from above with Back.easeOut
- **Ambient stars**: Twinkling circle stars scattered on game over background
- **Panel enlarged**: panelH increased from 0.2 to 0.25 to fit NEW BEST text; button moved to 0.65

### Colors Added
- GEM_DIAMOND: 0xf5d742, GEM_EMERALD: 0x3fa04b, GEM_RUBY: 0xe94560, GEM_SAPPHIRE: 0x44ddff
- NEW_BEST: '#ff6600'
- SKULL_HIT_COLORS: [0xff3333, 0x660000, 0x330011, 0xff0000]

### Files Modified
- `src/core/Constants.js` -- added PARTICLES, EFFECTS, BACKGROUND sections + gem colors
- `src/core/EventBus.js` -- added SCREEN_SHAKE, SCREEN_FLASH events
- `src/core/GameState.js` -- added isNewBest tracking
- `src/entities/Gem.js` -- added gemColor/gemType properties, gem trail effect, proper cleanup
- `src/scenes/GameScene.js` -- wired all effects (particles, shake, flash, slow-mo, parallax, shooting stars, basket bob, floating text)
- `src/scenes/GameOverScene.js` -- score count-up, NEW BEST indicator, title animation, ambient stars
- `src/systems/EffectsSystem.js` -- new file with particle/text/shooting star utilities

## Step 3: Audio
- **Engine**: Strudel (`@strudel/web`) for BGM, Web Audio API for SFX
- **Already in package.json**: `@strudel/web: ^1.3.0` -- no install needed

### BGM Patterns (Strudel)
- **Gameplay**: Upbeat magical night-sky theme at ~130 cpm. Square lead with twinkling arpeggios, sine counter-melody in upper register, triangle bass, light drums (bd/sd/hh), and a very quiet shimmer arp texture. Key: E minor / G major.
- **Game Over**: Somber descending melody at ~60 cpm. Triangle lead, sine minor chord pad (Am), sub bass. Slow(3) modifier for breathing room.

### SFX (Web Audio API -- one-shot)
- **Gem catch** (`gemCatchSfx`): Bright ascending two-tone chime (E5 -> B5, square wave)
- **Skull hit** (`skullHitSfx`): Dark low thud (C2 area, square wave, 800Hz LPF)
- **Life lost** (`lifeLostSfx`): Descending alarm (G4 -> E4 -> C4 -> A3 -> F3, square wave)
- **Difficulty up** (`difficultyUpSfx`): Ascending level-up fanfare (C4 -> E4 -> G4 -> C5 -> E5, square wave)
- **Button click** (`clickSfx`): Short sine pop (C5)

### Event-to-Audio Mappings
| Event | Audio Action |
|-------|-------------|
| `AUDIO_INIT` | `initStrudel()` |
| `MUSIC_GAMEPLAY` | Gameplay BGM loop |
| `MUSIC_GAMEOVER` | Game Over BGM loop |
| `MUSIC_STOP` | `hush()` -- stops all Strudel patterns |
| `GEM_CAUGHT` | `gemCatchSfx()` |
| `SKULL_CAUGHT` | `skullHitSfx()` |
| `LIFE_LOST` | `lifeLostSfx()` |
| `DIFFICULTY_UP` | `difficultyUpSfx()` |
| `AUDIO_TOGGLE_MUTE` | Toggle `gameState.isMuted`, stop BGM if muting |

### Mute System
- `gameState.isMuted` checked before every BGM play and SFX call
- **M key**: Toggles mute on both GameScene and GameOverScene
- **Speaker icon button**: Bottom-right corner on both scenes (speaker/muted emoji)
- **localStorage persistence**: Mute preference saved as `gem-catcher-muted`
- `AUDIO_TOGGLE_MUTE` event added to EventBus

### Scene Wiring
- **GameScene**: First input (pointer or keyboard) emits `AUDIO_INIT` + `MUSIC_GAMEPLAY`. Game over emits `MUSIC_STOP`.
- **GameOverScene**: `create()` emits `MUSIC_GAMEOVER`. Restart emits `MUSIC_STOP` + click SFX.
- **main.js**: Imports and calls `initAudioBridge()` before game creation.

### Files Created
- `src/audio/AudioManager.js` -- Strudel init/playMusic/stopMusic with mute check and 100ms hush-to-play delay
- `src/audio/music.js` -- `gameplayBGM()` and `gameOverTheme()` using explicit `stack/note/s` imports
- `src/audio/sfx.js` -- 5 SFX functions using Web Audio API (oscillator + gain + filter)
- `src/audio/AudioBridge.js` -- Wires EventBus events to audio, handles mute toggle + localStorage

### Files Modified
- `src/core/EventBus.js` -- Added `AUDIO_TOGGLE_MUTE` event
- `src/main.js` -- Import/init AudioBridge, added `muted` to render_game_to_text
- `src/scenes/GameScene.js` -- Audio init on first input, MUSIC_GAMEPLAY start, MUSIC_STOP on game over, M key mute, mute button
- `src/scenes/GameOverScene.js` -- MUSIC_GAMEOVER on create, MUSIC_STOP on restart, click SFX on button, M key mute, mute button

## Decisions / Known Issues
- No global gravity in physics config; falling objects use setVelocityY() directly
- Player basket has allowGravity=false
- Pixel art textures cached via textures.exists() check in PixelRenderer
- Touch input works on all devices (no isMobile gate on pointer events)
- render_game_to_text() needed null guard for body (fixed post-scaffold)
- Gem and Skull entities changed from Graphics to Sprite base class for animation support
