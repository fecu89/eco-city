# Progress

## Game Concept
- **Name**: crowd-dash
- **Engine**: Three.js (3D)
- **Description**: Neon-lit endless runner through crowded NYC streets. Auto-run forward, swerve left/right to dodge waves of people, collect floating hearts to score. Crowds grow denser over time. Collision = game over.

## Step 1: Scaffold
- **Entities**: Player.js (neon cyan humanoid), CrowdPerson.js (randomized clothing colors, object pool of 60), Heart.js (glowing neon pink, pool of 15)
- **Events**: GAME_START, GAME_OVER, GAME_RESTART, PLAYER_MOVE, PLAYER_JUMP, PLAYER_DIED, SCORE_CHANGED, HEART_COLLECTED, CROWD_SPAWNED, AUDIO_INIT, MUSIC_MENU, MUSIC_GAMEPLAY, MUSIC_GAMEOVER, MUSIC_STOP
- **Constants keys**: GAME, IS_MOBILE, SAFE_ZONE, PLAYER, CROWD, HEART, WORLD, CAMERA, DIFFICULTY, COLORS
- **Scoring system**: Distance-based (1 point per unit traveled) + heart bonus (50 points each)
- **Fail condition**: Collision with crowd person (AABB with hitbox shrink for fairness)
- **Input scheme**: Auto-run forward (-Z), left/right swerve via InputSystem moveX (keyboard arrows/WASD + virtual joystick on mobile)

## Step 3: Audio
- **Engine**: Strudel.cc (`@strudel/web`) for BGM, Web Audio API for SFX
- **Files created**:
  - `src/audio/AudioManager.js` — Strudel init/playMusic/stopMusic wrapper with 100ms hush-to-play delay
  - `src/audio/music.js` — Two BGM patterns (gameplay synthwave at 130 CPM, game over melancholic at 60 CPM)
  - `src/audio/sfx.js` — Five SFX via Web Audio API (heartPickup, dodgeWoosh, death, click, speedMilestone)
  - `src/audio/AudioBridge.js` — Wires EventBus events to audio playback + mute toggle + M key shortcut
- **BGM Patterns**:
  - Gameplay: Upbeat synthwave/cyberpunk (130 CPM) — C minor, pulsing sawtooth bass, square arpeggio lead, four-on-the-floor drums, delayed texture shimmer
  - Game Over: Melancholic wind-down (60 CPM) — descending triangle melody, dark sine pad, sub bass pulse, ghostly delayed echoes
- **SFX Mappings**:
  - `HEART_COLLECTED` -> heartPickupSfx (bright ascending two-tone chime, E5+B5)
  - `PLAYER_DIED` -> deathSfx (low thump + descending crushed tones)
  - `SCORE_CHANGED` -> speedMilestoneSfx (ascending triangle arp, triggers every +5 speed units)
  - dodgeWooshSfx (noise burst, exported but not yet wired — needs near-miss detection)
  - clickSfx (sine pop, exported for UI use)
- **Mute Wiring**:
  - `AUDIO_TOGGLE_MUTE` event added to EventBus
  - M key shortcut toggles mute via AudioBridge keydown listener
  - `isMuted` preserved across GameState.reset() (user preference, not gameplay state)
  - Mute preference persisted to localStorage (`crowd-dash-muted`)
  - AudioManager.playMusic() checks isMuted before starting; all SFX functions check isMuted
- **Audio Lifecycle**:
  - First user interaction (click/touch/keydown) -> Game.js emits `AUDIO_INIT` -> Strudel initialized + gameplay BGM starts
  - Game over: `PLAYER_DIED` fires death SFX, `MUSIC_STOP` stops BGM, 800ms later `MUSIC_GAMEOVER` starts somber theme
  - Restart: `GAME_START` -> `MUSIC_GAMEPLAY` resumes upbeat BGM
- **Dependencies**: `@strudel/web ^1.3.0` (already in package.json, AGPL-3.0)

## Step 2: Design
- **Files created**:
  - `src/systems/ParticleSystem.js` — Four particle subsystems (heart burst, player trail, death explosion, ambient motes) using THREE.Points with additive blending and per-particle physics
  - `src/systems/CameraEffects.js` — Camera juice: screen shake (exponential decay), lateral sway, speed-based FOV widening, collection flash, fog color shift, death slow-motion
- **Files modified**:
  - `src/core/Constants.js` — Added PARTICLES, CAMERA_FX, VFX config sections (~90 new tunables)
  - `src/core/EventBus.js` — Added SCREEN_SHAKE, FLASH, DEATH_SLOWMO events
  - `src/core/Game.js` — Integrated ParticleSystem + CameraEffects; death slow-mo delays GAME_OVER overlay by 0.5s; camera shake offset applied; heart collection passes position data; level.update receives delta for neon pulse
  - `src/gameplay/Player.js` — Added neon cyan PointLight glow + SpotLight headlight (shines ahead of player)
  - `src/gameplay/Heart.js` — Added pink PointLight glow to each heart
  - `src/level/LevelBuilder.js` — Pulsing neon windows (sinusoidal opacity modulation, per-window phase offset, only updates windows within 60 units of player); exposed ambientLight reference for flash effect
- **Particle Effects**:
  - Heart collection: 18-particle pink burst with upward bias and gravity falloff (0.6s lifetime)
  - Player trail: 40 particles/sec neon cyan trail at feet, density scales with speed
  - Death explosion: 35-particle white/multicolor spherical burst (1.0s lifetime)
  - Ambient motes: 40 floating dust/light particles drifting around the player (4s lifetime)
- **Camera Juice**:
  - Screen shake: 0.25 intensity, 0.35s duration, exponential decay (1.5x stronger on death)
  - Lateral sway: camera tilts 0.12 radians opposite to dodge direction, smoothly interpolated
  - FOV widening: 70 (base speed) to 85 (max speed), smoothly interpolated for rush feeling
- **Lighting Improvements**:
  - Player glow: cyan PointLight (intensity 0.8, range 8 units) attached to player body
  - Heart glow: pink PointLight (intensity 0.4, range 5 units) per heart
  - Headlight: cyan SpotLight (intensity 0.6, range 25 units, 0.4 rad cone) ahead of player
  - Neon window pulse: sinusoidal opacity between 0.3x and 1.0x at 1.5 Hz, per-window random phase
- **Visual Feedback**:
  - Collection flash: 0.15s ambient light intensity bump (+0.3) on heart pickup
  - Speed fog shift: fog/background color lerps from dark blue (0x050510) to warm purple (0x100818) as speed increases
  - Death slow-motion: 0.5s at 0.15x time scale with camera shake before game over overlay appears
- **Constraints respected**: No audio files touched, no gameplay mechanics altered, no scripts or tests modified

## Decisions / Known Issues
- Phase 2 (verify-runtime.mjs) fails in headless Chromium due to WebGL context limitation — not a code defect
- No in-game score HUD (intentional — Play.fun widget handles it)
- Object pooling for crowd (60) and hearts (15) to minimize GC pressure
- Difficulty scales: speed +0.3/sec (max 30), crowd density increases over time
