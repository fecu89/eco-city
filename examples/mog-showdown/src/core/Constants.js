// --- Display ---

// Device pixel ratio (capped at 2 for mobile GPU performance)
export const DPR = Math.min(window.devicePixelRatio || 1, 2);

// Force portrait layout — vertical dodger games must always be portrait.
// On desktop, Scale.FIT + CENTER_BOTH will pillarbox with black bars automatically.
const FORCE_PORTRAIT = true;
const _isPortrait = FORCE_PORTRAIT || window.innerHeight > window.innerWidth;

// Design dimensions (logical game units at 1x scale)
const _designW = 540;
const _designH = 960;
const _designAspect = _designW / _designH;

// Canvas dimensions = device pixel area, maintaining design aspect ratio.
// This ensures the canvas has enough resolution for the user's actual display
// so FIT mode never CSS-upscales (which causes blurriness on retina).
const _deviceW = window.innerWidth * DPR;
const _deviceH = window.innerHeight * DPR;

let _canvasW, _canvasH;
if (_deviceW / _deviceH > _designAspect) {
  _canvasW = _deviceW;
  _canvasH = Math.round(_deviceW / _designAspect);
} else {
  _canvasW = Math.round(_deviceH * _designAspect);
  _canvasH = _deviceH;
}

// PX = canvas pixels per design pixel. Scales all absolute values (sizes, speeds, etc.)
// from design space to canvas space. Gameplay proportions stay identical across all displays.
export const PX = _canvasW / _designW;

export const GAME = {
  WIDTH: _canvasW,
  HEIGHT: _canvasH,
  IS_PORTRAIT: _isPortrait,
  GRAVITY: 0, // No global gravity — projectiles fall via custom velocity
};

// --- Safe Zone (Play.fun widget overlay) ---
export const SAFE_ZONE = {
  TOP: _canvasH * 0.08,
  BOTTOM: 0,
  LEFT: 0,
  RIGHT: 0,
};

// --- Expression System ---
export const EXPRESSION = {
  NORMAL: 0,
  HAPPY: 1,
  ANGRY: 2,
  SURPRISED: 3,
};

export const EXPRESSION_HOLD_MS = 600;

// --- Character Bobblehead Sizing ---
const _U = _canvasW * 0.012;

export const CHARACTER = {
  U: _U,
  TORSO_H: _U * 5,
  SHOULDER_W: _U * 7,
  WAIST_W: _U * 5,
  NECK_W: _U * 2.5,
  NECK_H: _U * 1,
  HEAD_H: _canvasW * 0.22,  // Large bobblehead for this game
  FRAME_W: 200,
  FRAME_H: 300,
  UPPER_ARM_W: _U * 1.8,
  UPPER_ARM_H: _U * 3,
  HAND_W: _U * 1.8,
  HAND_H: _U * 1.5,
  LEG_W: _U * 2.4,
  LEG_H: _U * 3,
  LEG_GAP: _U * 1.2,
  SHOE_W: _U * 3,
  SHOE_H: _U * 1.2,
  OUTLINE: Math.max(1, Math.round(_U * 0.3)),
};

// --- Clavicular (Player) ---

export const CLAVICULAR = {
  WIDTH: _canvasW * 0.14,
  HEIGHT: _canvasW * 0.14 * 1.8, // Lean figure, taller than wide
  START_X: _canvasW * 0.5,
  START_Y: _canvasH * 0.82,
  SPEED: 350 * PX,
  COLOR_BODY: 0xD4A017,       // Gold/amber body
  COLOR_SKIN: 0xF5D0A9,       // Skin tone
  COLOR_HAIR: 0x3B2F2F,       // Dark styled hair
  COLOR_JAW: 0xC4963A,        // Jawline accent
  COLOR_CLAVICLE: 0xE8C860,   // Prominent collarbone highlight
};

// --- Androgenic (Opponent NPC) ---

export const ANDROGENIC = {
  WIDTH: _canvasW * 0.16,
  HEIGHT: _canvasW * 0.16 * 2.0, // Tall (6'5")
  X: _canvasW * 0.5,
  Y: _canvasH * 0.18,            // Top of screen, below safe zone
  COLOR_BODY: 0x1A3A5C,          // Dark blue body
  COLOR_SKIN: 0xE8C8A0,          // Skin tone
  COLOR_CAP: 0x333333,           // Cap/hat
  COLOR_WIG: 0x5C3317,           // Wig color (when exposed)
  COLOR_BALD: 0xE8C8A0,          // Bald head
  THROW_INTERVAL_MIN: 800,       // ms between throws (starts easier)
  THROW_INTERVAL_MAX: 2000,
  SWAY_SPEED: 0.8,               // Slight side-to-side movement
  SWAY_RANGE: _canvasW * 0.25,
};

// --- Projectiles ---

export const PROJECTILE = {
  // Attacks (thrown by Androgenic) — sized for mobile readability
  ATTACK_WIDTH: _canvasW * 0.09,
  ATTACK_HEIGHT: _canvasW * 0.072,
  ATTACK_SPEED_MIN: 150 * PX,
  ATTACK_SPEED_MAX: 280 * PX,
  ATTACK_COLOR_WIG: 0x5C3317,     // Brown wig
  ATTACK_COLOR_HAT: 0x333333,     // Dark cap/hat

  // Power-ups (falling collectibles) — sized for mobile readability
  POWERUP_WIDTH: _canvasW * 0.072,
  POWERUP_HEIGHT: _canvasW * 0.108,
  POWERUP_SPEED_MIN: 100 * PX,
  POWERUP_SPEED_MAX: 200 * PX,
  POWERUP_COLOR_SHAKE: 0x22CC55,  // Bright green protein shake
  POWERUP_COLOR_DUMBBELL: 0xFF69B4, // Pink dumbbell

  // Near-miss threshold (% of player hitbox)
  NEAR_MISS_THRESHOLD: 0.20,
};

// --- Mog Meter ---

export const MOG = {
  POWERUPS_TO_FILL: 5,    // Collect 5 power-ups to fill mog meter
  FRAME_MOG_BONUS: 5,     // Bonus points when frame mog triggers
  FRAME_MOG_DURATION: 800, // ms the frame mog burst lasts visually
};

// --- Spawn System ---

export const SPAWN = {
  // Attack spawning (ms)
  ATTACK_INTERVAL_INITIAL: 1800,
  ATTACK_INTERVAL_MIN: 600,
  ATTACK_INTERVAL_RAMP: 0.97,     // Multiply interval each spawn

  // Power-up spawning (ms)
  POWERUP_INTERVAL_INITIAL: 2200,
  POWERUP_INTERVAL_MIN: 1000,
  POWERUP_INTERVAL_RAMP: 0.98,

  // Difficulty ramp
  DIFFICULTY_INCREASE_EVERY: 10000, // ms between difficulty increases
};

// --- Lives ---

export const LIVES = {
  MAX: 3,
  HEART_SIZE: _canvasW * 0.025,
  HEART_COLOR: 0xFF3366,
  HEART_EMPTY: 0x444444,
};

// --- Colors ---

export const COLORS = {
  // Arena background gradient
  ARENA_TOP: 0x0D0221,        // Deep dark purple
  ARENA_MID: 0x1A0533,        // Mid purple
  ARENA_BOTTOM: 0x150B3A,     // Dark arena floor

  // Arena floor
  FLOOR: 0x2A1B54,
  FLOOR_LINE: 0x6C63FF,

  // Neon accents
  NEON_GOLD: 0xFFD700,
  NEON_BLUE: 0x00BFFF,
  NEON_PURPLE: 0x8A2BE2,
  NEON_PINK: 0xFF1493,

  // UI text
  UI_TEXT: '#ffffff',
  UI_SHADOW: '#000000',
  MUTED_TEXT: '#8888aa',
  SCORE_GOLD: '#ffd700',

  // Menu / GameOver gradient backgrounds
  BG_TOP: 0x0D0221,
  BG_BOTTOM: 0x1A0533,

  // Buttons
  BTN_PRIMARY: 0x6c63ff,
  BTN_PRIMARY_HOVER: 0x857dff,
  BTN_PRIMARY_PRESS: 0x5a52d5,
  BTN_TEXT: '#ffffff',

  // HUD
  MOG_BAR_BG: 0x222222,
  MOG_BAR_FILL: 0xFFD700,
  MOG_BAR_GLOW: 0xFFAA00,
};

// --- UI sizing (proportional to game dimensions) ---

export const UI = {
  FONT: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  TITLE_RATIO: 0.08,
  HEADING_RATIO: 0.05,
  BODY_RATIO: 0.035,
  SMALL_RATIO: 0.025,
  BTN_W_RATIO: 0.45,
  BTN_H_RATIO: 0.075,
  BTN_RADIUS: 12 * PX,
  MIN_TOUCH: 44 * PX,
};

// --- Transitions ---

export const TRANSITION = {
  FADE_DURATION: 350,
};

// --- Effects / Spectacle ---

export const EFFECTS = {
  // --- Opening Moment ---
  ENTRANCE_FLASH_DURATION: 300,
  ENTRANCE_PLAYER_SLAM_DURATION: 800,
  ENTRANCE_PLAYER_SHAKE: 0.012,
  ENTRANCE_PARTICLE_COUNT: 20,
  ENTRANCE_ANDROGENIC_DURATION: 600,

  // --- Ambient particles ---
  AMBIENT_PARTICLE_COUNT: 15,         // Number of ambient motes active at any time
  AMBIENT_PARTICLE_SPEED_MIN: 10 * PX,
  AMBIENT_PARTICLE_SPEED_MAX: 30 * PX,
  AMBIENT_PARTICLE_SIZE_MIN: 1.5 * PX,
  AMBIENT_PARTICLE_SIZE_MAX: 4 * PX,
  AMBIENT_PARTICLE_ALPHA: 0.35,
  AMBIENT_PARTICLE_COLORS: [0xFFD700, 0x00BFFF, 0x8A2BE2, 0xFF1493],

  // --- Action / Hit particles ---
  ACTION_PARTICLE_COUNT: 12,
  HIT_PARTICLE_COUNT: 16,
  PARTICLE_SPEED_MIN: 80 * PX,
  PARTICLE_SPEED_MAX: 220 * PX,
  PARTICLE_LIFESPAN: 500,
  PARTICLE_SIZE_MIN: 2 * PX,
  PARTICLE_SIZE_MAX: 5 * PX,

  // --- Floating score text ---
  FLOAT_TEXT_SIZE: Math.round(_canvasH * 0.04),
  FLOAT_TEXT_START_SCALE: 1.8,
  FLOAT_TEXT_DURATION: 700,
  FLOAT_TEXT_RISE: 50 * PX,

  // --- Background pulse ---
  BG_PULSE_ALPHA: 0.15,
  BG_PULSE_DURATION: 300,
  BG_PULSE_COLOR: 0xFFD700,

  // --- Player trail ---
  TRAIL_ALPHA: 0.4,
  TRAIL_LIFESPAN: 350,
  TRAIL_FREQUENCY: 40,         // ms between trail emissions
  TRAIL_PARTICLE_SIZE: 3.5 * PX,

  // --- Screen shake ---
  SHAKE_LIGHT: 0.008,
  SHAKE_MEDIUM: 0.012,
  SHAKE_HEAVY: 0.020,
  SHAKE_DURATION_SHORT: 120,
  SHAKE_DURATION_MEDIUM: 200,
  SHAKE_DURATION_LONG: 350,

  // --- Combo system ---
  COMBO_TEXT_BASE_SIZE: Math.round(_canvasH * 0.042),
  COMBO_TEXT_SIZE_PER_COMBO: Math.round(_canvasH * 0.005),
  COMBO_SHAKE_BASE: 0.008,
  COMBO_SHAKE_PER_COMBO: 0.002,
  COMBO_SHAKE_CAP: 0.025,

  // --- Streak milestones ---
  STREAK_MILESTONES: [5, 10, 25],
  STREAK_PARTICLE_COUNT: 40,
  STREAK_TEXT_SIZE: Math.round(_canvasH * 0.065),
  STREAK_TEXT_DURATION: 1200,

  // --- Hit freeze frame ---
  HIT_FREEZE_DURATION: 60,

  // --- Flash overlays ---
  FLASH_ALPHA_LIGHT: 0.3,
  FLASH_ALPHA_HEAVY: 0.5,

  // --- Near miss ---
  NEAR_MISS_PARTICLE_COUNT: 10,
  NEAR_MISS_TEXT_SIZE: Math.round(_canvasH * 0.03),

  // --- Frame Mog burst ---
  FRAME_MOG_PARTICLE_COUNT: 30,

  // --- Game Over ---
  GAMEOVER_AMBIENT_COUNT: 12,
  GAMEOVER_FLASH_DURATION: 250,
  GAMEOVER_PANEL_SCALE_DURATION: 500,
  GAMEOVER_TITLE_GLOW_ALPHA: 0.6,
};

// --- Touch Controls ---

export const TOUCH = {
  BUTTON_SIZE: _canvasW * 0.12,       // 12% of canvas width
  ALPHA_IDLE: 0.35,
  ALPHA_ACTIVE: 0.6,
  MARGIN_X: _canvasW * 0.08,          // Inset from screen edge
  MARGIN_BOTTOM: _canvasH * 0.06,     // Up from bottom
  ARROW_COLOR: 0xffffff,
};
