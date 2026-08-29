// =============================================================================
// Constants.js — All configuration values for Crowd Dash
// Zero hardcoded values in game logic. Every magic number lives here.
// =============================================================================

export const GAME = {
  FOV: 70,
  NEAR: 0.1,
  FAR: 200,
  MAX_DELTA: 0.05,
  MAX_DPR: 2,
};

export const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1);

// Play.fun SDK widget renders a 75px fixed bar at top:0, z-index:9999.
// All HTML overlays must account for this with padding-top or safe offset.
export const SAFE_ZONE = {
  TOP_PX: 75,
  TOP_PERCENT: 8,
};

// --- Player ---
export const PLAYER = {
  // Dimensions
  BODY_WIDTH: 0.5,
  BODY_HEIGHT: 1.0,
  BODY_DEPTH: 0.4,
  HEAD_RADIUS: 0.22,

  // Movement
  FORWARD_SPEED: 12,         // Initial auto-run speed (units/sec)
  LATERAL_SPEED: 10,         // Left/right dodge speed (units/sec)
  ROAD_HALF_WIDTH: 4.0,      // Constrain player to road

  // Starting position
  START_X: 0,
  START_Y: 0.65,             // Half body height + ground offset
  START_Z: 0,

  // Appearance
  COLOR: 0x00ffff,           // Neon cyan
  HEAD_COLOR: 0xffdab9,      // Skin tone
};

// --- Crowd People ---
export const CROWD = {
  // Person dimensions
  BODY_WIDTH: 0.45,
  BODY_HEIGHT: 0.9,
  BODY_DEPTH: 0.35,
  HEAD_RADIUS: 0.2,

  // Spawning
  SPAWN_DISTANCE: 80,        // How far ahead to spawn
  DESPAWN_DISTANCE: 10,      // How far behind player to recycle
  INITIAL_SPAWN_RATE: 0.8,   // Seconds between spawn waves at start
  MIN_SPAWN_RATE: 0.25,      // Fastest spawn rate (difficulty cap)
  PEOPLE_PER_WAVE_MIN: 1,    // Min people per wave at start
  PEOPLE_PER_WAVE_MAX: 3,    // Max people per wave at start
  WAVE_MAX_INCREASE: 5,      // Max people per wave at hardest

  // Pool
  POOL_SIZE: 60,             // Max crowd meshes in pool

  // Lane positions (X coordinates)
  LANES: [-3, -1.5, 0, 1.5, 3],

  // Colors (various clothing)
  COLORS: [
    0xff4444, // red
    0x4488ff, // blue
    0x44cc44, // green
    0xffaa00, // orange
    0xaa44ff, // purple
    0xff44aa, // pink
    0xffff44, // yellow
    0x44ffff, // cyan
  ],

  // Appearance
  HEAD_COLOR: 0xffdab9,      // Skin tone
  INITIAL_BODY_COLOR: 0xff0000, // Placeholder (overridden on activate)

  // Collision
  HITBOX_SHRINK: 0.15,       // Shrink hitbox slightly for fairness
};

// --- Hearts (Collectibles) ---
export const HEART = {
  SIZE: 0.35,
  FLOAT_HEIGHT: 1.5,         // Y position (floating above ground)
  BOB_AMPLITUDE: 0.2,        // How much it bobs up/down
  BOB_SPEED: 3.0,            // Bob frequency
  ROTATION_SPEED: 2.0,       // Radians per second
  SPAWN_DISTANCE: 70,        // How far ahead to spawn
  DESPAWN_DISTANCE: 10,      // Behind player to recycle
  SPAWN_INTERVAL: 2.5,       // Seconds between heart spawns
  COLLECT_DISTANCE: 1.2,     // Proximity to collect
  POINTS: 50,                // Points per heart
  POOL_SIZE: 15,             // Max hearts in pool

  // Appearance
  COLOR: 0xff1493,           // Neon hot pink
  EMISSIVE: 0xff1493,
  EMISSIVE_INTENSITY: 0.8,
};

// --- World / Environment ---
export const WORLD = {
  ROAD_WIDTH: 10,            // Total road width
  ROAD_LENGTH: 300,          // Length of road segment
  ROAD_COLOR: 0x1a1a2e,     // Dark asphalt

  // Lane markings
  LANE_MARKING_COLOR: 0x444466,
  LANE_MARKING_WIDTH: 0.05,
  LANE_MARKING_LENGTH: 2.0,
  LANE_MARKING_GAP: 3.0,

  // Buildings
  BUILDING_MIN_HEIGHT: 8,
  BUILDING_MAX_HEIGHT: 25,
  BUILDING_DEPTH: 6,
  BUILDING_WIDTH_MIN: 3,
  BUILDING_WIDTH_MAX: 6,
  BUILDING_GAP: 0.5,
  BUILDING_OFFSET_X: 7,      // Distance from center of road
  BUILDING_COLOR: 0x0a0a1a,  // Very dark blue/black
  BUILDING_COUNT_PER_SIDE: 30,

  // Neon window colors
  NEON_COLORS: [
    0xff00ff, // magenta
    0x00ffff, // cyan
    0xff1493, // hot pink
    0x7b2ff7, // purple
    0x00ff88, // green
    0xffff00, // yellow
  ],
  WINDOW_EMISSIVE_INTENSITY: 1.0,
  WINDOW_ROWS: 4,
  WINDOW_COLS: 3,
  WINDOW_SIZE: 0.3,
  WINDOW_GAP: 0.8,

  // Sidewalk
  SIDEWALK_COLOR: 0x222244,

  // Fog (dark city atmosphere)
  FOG_COLOR: 0x050510,
  FOG_NEAR: 15,
  FOG_FAR: 100,

  // Sky
  SKY_COLOR: 0x050510,       // Very dark blue/black

  // Lighting
  AMBIENT_COLOR: 0x1a1a3e,
  AMBIENT_INTENSITY: 0.4,
  DIR_LIGHT_COLOR: 0x6666aa,
  DIR_LIGHT_INTENSITY: 0.3,
  POINT_LIGHT_COLOR: 0xff00ff,
  POINT_LIGHT_INTENSITY: 0.5,
  POINT_LIGHT_DISTANCE: 20,
};

// --- Camera ---
export const CAMERA = {
  OFFSET_X: 0,
  OFFSET_Y: 4.5,
  OFFSET_Z: 8,
  LOOK_AHEAD: 8,             // Look ahead of player (negative Z)
  LOOK_OFFSET_Y: 1.5,
};

// --- Difficulty ---
export const DIFFICULTY = {
  SPEED_INCREASE_RATE: 0.3,  // Speed units gained per second of play
  MAX_SPEED: 30,             // Cap forward speed
  CROWD_DENSITY_RATE: 0.02,  // Spawn rate decrease per second
  DISTANCE_SCORE_RATE: 1,    // Score points per unit distance
};

// --- Colors (for convenience) ---
export const COLORS = {
  SKY: 0x050510,
  AMBIENT_LIGHT: 0x1a1a3e,
  AMBIENT_INTENSITY: 0.4,
  DIR_LIGHT: 0x6666aa,
  DIR_INTENSITY: 0.3,
  PLAYER: 0x00ffff,
  NEON_PINK: 0xff1493,
  NEON_CYAN: 0x00ffff,
  NEON_PURPLE: 0x7b2ff7,
  NEON_MAGENTA: 0xff00ff,
};

// --- Particle Effects ---
export const PARTICLES = {
  // Heart collection burst
  HEART_BURST_COUNT: 18,
  HEART_BURST_SPEED: 4.0,
  HEART_BURST_LIFETIME: 0.6,
  HEART_BURST_SIZE: 0.12,
  HEART_BURST_COLOR: 0xff1493,
  HEART_BURST_GRAVITY: -6.0,

  // Player trail
  TRAIL_EMIT_RATE: 40,            // particles per second
  TRAIL_LIFETIME: 0.35,
  TRAIL_SIZE: 0.08,
  TRAIL_COLOR: 0x00ffff,
  TRAIL_OFFSET_Y: 0.3,            // spawn at player feet area
  TRAIL_SPREAD: 0.15,             // random spread

  // Death explosion
  DEATH_COUNT: 35,
  DEATH_SPEED: 6.0,
  DEATH_LIFETIME: 1.0,
  DEATH_SIZE: 0.15,
  DEATH_COLORS: [0x00ffff, 0xff1493, 0xff00ff, 0x7b2ff7, 0xffffff],
  DEATH_GRAVITY: -3.0,

  // Ambient floating motes
  AMBIENT_COUNT: 40,
  AMBIENT_SIZE: 0.04,
  AMBIENT_SPREAD_X: 10.0,
  AMBIENT_SPREAD_Y: 6.0,
  AMBIENT_SPREAD_Z: 30.0,
  AMBIENT_SPEED: 0.3,
  AMBIENT_LIFETIME: 4.0,
  AMBIENT_COLORS: [0xff1493, 0x00ffff, 0xff00ff, 0x7b2ff7, 0xffffff],
  AMBIENT_OPACITY: 0.5,
};

// --- Camera Effects ---
export const CAMERA_FX = {
  // Screen shake
  SHAKE_INTENSITY: 0.25,
  SHAKE_DURATION: 0.35,
  SHAKE_DECAY: 5.0,               // exponential decay rate

  // Lateral sway (follows player X movement)
  SWAY_FACTOR: 0.12,              // how much camera tilts with player lateral movement
  SWAY_SMOOTHING: 4.0,            // interpolation speed

  // Speed-based FOV widening
  FOV_BASE: 70,                   // same as GAME.FOV
  FOV_MAX: 85,                    // widest FOV at max speed
  FOV_SMOOTHING: 2.0,             // interpolation speed
};

// --- Visual Feedback ---
export const VFX = {
  // Heart collection flash
  FLASH_DURATION: 0.15,
  FLASH_INTENSITY: 0.3,           // max extra ambient intensity

  // Speed color shift (fog shifts warmer as speed increases)
  SPEED_FOG_COLOR_SLOW: 0x050510, // base dark
  SPEED_FOG_COLOR_FAST: 0x100818, // slightly warmer purple tint

  // Death slow-motion
  DEATH_SLOWMO_DURATION: 0.5,     // seconds of slow-mo before game over overlay
  DEATH_SLOWMO_FACTOR: 0.15,      // time scale during slow-mo

  // Player glow
  PLAYER_GLOW_COLOR: 0x00ffff,
  PLAYER_GLOW_INTENSITY: 0.8,
  PLAYER_GLOW_DISTANCE: 8,

  // Heart glow
  HEART_GLOW_COLOR: 0xff1493,
  HEART_GLOW_INTENSITY: 0.4,
  HEART_GLOW_DISTANCE: 5,

  // Headlight
  HEADLIGHT_COLOR: 0x00ffff,
  HEADLIGHT_INTENSITY: 0.6,
  HEADLIGHT_DISTANCE: 25,
  HEADLIGHT_ANGLE: 0.4,           // radians (cone angle)
  HEADLIGHT_PENUMBRA: 0.5,
  HEADLIGHT_OFFSET_Y: 2.0,
  HEADLIGHT_OFFSET_Z: -3.0,       // ahead of player

  // Neon building pulse
  NEON_PULSE_SPEED: 1.5,          // cycles per second
  NEON_PULSE_MIN: 0.3,            // min intensity multiplier
  NEON_PULSE_MAX: 1.0,            // max intensity multiplier
};
