# Progress

## Game Concept
- **Name**: rock-em-sock-em
- **Engine**: Three.js
- **Description**: Rock 'Em Sock 'Em Robots — 3D boxing game. Blue Bomber vs Red Rocker in a ring. Punch to knock opponent's head up.

## Step 1: Scaffold
- **Entities**: Robot.js (builds both Blue Bomber + Red Rocker from primitives), HealthBar.js
- **Systems**: InputSystem.js, CombatSystem.js, AISystem.js, AnimationSystem.js
- **Events**: game:start/over/restart, round:won/reset, player:punchLeft/Right/blockStart/End, opponent:punchLeft/Right/blockStart/End, hit:player/opponent, headPop:player/opponent, score:changed, spectacle:entrance/action/hit/combo
- **Constants keys**: RING, ROBOT, COMBAT, AI, CAMERA, COLORS, HEALTH_BAR
- **Scoring**: rounds won by player (knocking opponent's head up)
- **Fail condition**: AI knocks player's head up (head health reaches 0)
- **Input**: A/Left = left punch, D/Right = right punch, W/Up = block, touch zones

## Step 1.5: 3D Assets
- **Source**: Meshy AI (text-to-3d) — 3 static GLB models in `public/assets/models/`
- **Models**:
  - `blue-bomber.glb` (17 MB) — Blue Bomber player robot, static mesh, PBR textures
  - `red-rocker.glb` (24 MB) — Red Rocker opponent robot, static mesh, PBR textures
  - `boxing-ring.glb` (11 MB) — Boxing ring platform with ropes
- **Integration approach**: GLB models loaded via AssetLoader.js `loadModel()` (regular `.clone(true)`, not SkeletonUtils — these are static, not rigged)
- **Animation**: Models are NOT skeletal/rigged. Existing AnimationSystem.js programmatic animations (punch lunge, block tilt, head pop, idle bob) adapted to animate the whole GLB model as a single unit via a wrapper group pattern
- **Wrapper group pattern**: Each GLB model is wrapped in a `THREE.Group` that starts at position (0,0,0). AnimationSystem targets the wrapper for position/rotation offsets. The actual model retains its centering transform inside the wrapper.
- **Fallback**: Every GLB load is wrapped in try/catch. On failure, the original primitive geometry (BoxGeometry, CylinderGeometry, SphereGeometry) is built as fallback
- **Preloading**: All 3 models preloaded via `preloadAll()` in Game.js before game starts. Render loop runs immediately but game logic waits for `this.ready` flag
- **Constants**: Added `MODELS` config to Constants.js with path, scale, rotationY for each model
- **Files changed**:
  - `src/core/Constants.js` — Added MODELS config
  - `src/entities/Robot.js` — Now async, loads GLB with wrapper group, keeps primitive fallback
  - `src/level/LevelBuilder.js` — Now async via `build()` method, loads boxing ring GLB, keeps primitive fallback
  - `src/systems/AnimationSystem.js` — Dual-path animations: GLB (whole-model lunge/tilt/pop) vs primitives (per-part glove/arm/head)
  - `src/core/Game.js` — Preloads all models on startup, async init/createRobots, ready flag for render loop
  - `src/level/AssetLoader.js` — Unchanged (already had loadModel + preloadAll)

## Decisions / Known Issues
- Robots now use Meshy AI GLB models with primitive fallback
- Camera is fixed behind player, no OrbitControls
- AI uses timing-based patterns with configurable aggression
- GLB models are static (no skeleton) — all animation is programmatic via wrapper group transforms
- Model scale values (1.0 for robots, 1.5 for ring) may need tuning after visual review
- Large model files (17-24 MB) — acceptable for prototype, could be optimized later with mesh decimation
