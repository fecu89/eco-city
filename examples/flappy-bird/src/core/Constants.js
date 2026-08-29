// =============================================================================
// Flappy Bird — All Configuration Values (DPR/PX-scaled)
// =============================================================================

// --- Display ---

// Device pixel ratio (capped at 2 for mobile GPU performance)
export const DPR = Math.min(window.devicePixelRatio || 1, 2);

// Design dimensions — Flappy Bird is always portrait (400x600)
const _designW = 400;
const _designH = 600;
const _designAspect = _designW / _designH;

// Canvas dimensions = device pixel area, maintaining design aspect ratio.
// This ensures the canvas has enough resolution for the user's actual display
// so FIT mode never CSS-upscales (which causes blurriness on retina).
const _deviceW = window.innerWidth * DPR;
const _deviceH = window.innerHeight * DPR;

let _canvasW, _canvasH;
if (_deviceW / _deviceH > _designAspect) {
  // Viewport wider than design -> height-limited
  _canvasH = _deviceH;
  _canvasW = Math.round(_deviceH * _designAspect);
} else {
  // Viewport taller than design -> width-limited
  _canvasW = _deviceW;
  _canvasH = Math.round(_deviceW / _designAspect);
}

// PX = canvas pixels per design pixel. Scales all absolute values (sizes, speeds, etc.)
// from design space to canvas space. Gameplay proportions stay identical across all displays.
export const PX = _canvasW / _designW;

export const GAME = {
  WIDTH: _canvasW,
  HEIGHT: _canvasH,
  GRAVITY: 1200 * PX,
};

// --- Safe Zone (Play.fun widget overlay) ---
export const SAFE_ZONE = {
  TOP: GAME.HEIGHT * 0.08,
  BOTTOM: 0,
  LEFT: 0,
  RIGHT: 0,
};

// --- Bird ---

export const BIRD = {
  START_X: GAME.WIDTH * 0.25,
  START_Y: GAME.HEIGHT * 0.5,
  WIDTH: 34 * PX,
  HEIGHT: 24 * PX,
  FLAP_VELOCITY: -380 * PX,
  ROTATION_UP_DEG: -25,
  ROTATION_DOWN_DEG: 90,
  ROTATION_SPEED: 4,
  BODY_COLOR: 0xf5d742,
  BODY_LIGHT: 0xfce878,
  BODY_DARK: 0xc4a820,
  EYE_COLOR: 0xffffff,
  PUPIL_COLOR: 0x000000,
  BEAK_COLOR: 0xe87040,
  WING_COLOR: 0xdeb858,
};

// --- Pipes ---

export const PIPE = {
  WIDTH: 52 * PX,
  GAP: 150 * PX,
  SPEED: 160 * PX,
  SPAWN_INTERVAL: 1600,
  MIN_TOP_HEIGHT: 60 * PX,
  BODY_COLOR: 0x73bf2e,
  BODY_DARK: 0x5a9a23,
  CAP_COLOR: 0x5a9a23,
  CAP_HEIGHT: 26 * PX,
  CAP_OVERHANG: 4 * PX,
  HIGHLIGHT_COLOR: 0x8ad432,
};

// --- Ground ---

const _groundHeight = 80 * PX;

export const GROUND = {
  HEIGHT: _groundHeight,
  Y: GAME.HEIGHT - _groundHeight,
  COLOR: 0xded895,
  DARK_COLOR: 0xb8a850,
  GRASS_COLOR: 0x8ec63f,
  STRIPE_COLOR: 0xc8c080,
  SPEED: 160 * PX,
};

// --- Sky ---

export const SKY = {
  TOP_COLOR: 0x4ec0ca,
  BOTTOM_COLOR: 0xa2d9e7,
  CLOUD_COUNT: 5,
  CLOUD_MIN_Y: GAME.HEIGHT * 0.05,
  CLOUD_MAX_Y: GAME.HEIGHT * 0.417,
  CLOUD_SPEED: 20 * PX,
  CLOUD_ALPHA: 0.6,
  CLOUD_COLORS: [0xffffff, 0xf0f0f0, 0xe8e8e8],
};

// --- Colors ---

export const COLORS = {
  UI_TEXT: '#ffffff',
  UI_SHADOW: '#000000',
  SKY: 0x4ec0ca,
  MENU_BG: 0x4ec0ca,
  GAMEOVER_BG: 0x1a1a2e,
  BUTTON: 0xf5d742,
  BUTTON_HOVER: 0xfce878,
  BUTTON_TEXT: '#5a3e00',
  SCORE_STROKE: '#000000',
  PANEL_BG: 0xdeb858,
  PANEL_BORDER: 0x846830,
  MEDAL_GOLD: 0xffd700,
  MEDAL_SILVER: 0xc0c0c0,
  MEDAL_BRONZE: 0xcd7f32,
};

// --- UI sizing (proportional to game dimensions) ---

export const UI = {
  FONT: 'Arial Black, Arial, sans-serif',
  TITLE_RATIO: 0.067,          // title font size as % of GAME.HEIGHT (~40px at 600)
  HEADING_RATIO: 0.06,         // heading font size (~36px at 600)
  BODY_RATIO: 0.037,           // body font size (~22px at 600)
  SMALL_RATIO: 0.03,           // small/label font size (~18px at 600)
  CAPTION_RATIO: 0.027,        // caption font size (~16px at 600)
  BTN_W_RATIO: 0.45,           // button width as % of GAME.WIDTH
  BTN_H_RATIO: 0.08,           // button height as % of GAME.HEIGHT
  BTN_RADIUS: 10 * PX,         // button corner radius
  MIN_TOUCH: 44 * PX,          // minimum touch target
  PANEL_W_RATIO: 0.6,          // score panel width as % of GAME.WIDTH
  PANEL_H_RATIO: 0.233,        // score panel height as % of GAME.HEIGHT
  STROKE: 5 * PX,              // text stroke thickness
  THIN_STROKE: 3 * PX,         // thinner text stroke
  PANEL_BORDER: 3 * PX,        // panel border width
  MEDAL_RADIUS: 18 * PX,       // medal circle radius
  SCORE_FONT_RATIO: 0.087,     // HUD score font size (~52px at 600)
  SCORE_Y_RATIO: 0.083,        // HUD score Y position (~50px at 600)
};

// --- Transitions ---

export const TRANSITION = {
  FADE_DURATION: 300,
  SCORE_POP_SCALE: 1.4,
  SCORE_POP_DURATION: 80,
  DEATH_FLASH_DURATION: 150,
  DEATH_SHAKE_DURATION: 250,
  DEATH_SHAKE_INTENSITY: 0.012,
};

// --- Particles ---

export const PARTICLES = {
  SCORE_BURST_COUNT: 8,
  SCORE_BURST_COLOR: 0xffd700,
  SCORE_BURST_RADIUS_MIN: 2 * PX,
  SCORE_BURST_RADIUS_MAX: 4 * PX,
  SCORE_BURST_SPEED_MIN: 40 * PX,
  SCORE_BURST_SPEED_MAX: 100 * PX,
  DEATH_BURST_COUNT: 12,
  DEATH_BURST_COLORS: [0xf5d742, 0xfce878, 0xe87040, 0xffffff],
  DEATH_BURST_RADIUS_MIN: 2 * PX,
  DEATH_BURST_RADIUS_MAX: 6 * PX,
  DEATH_BURST_SPEED_MIN: 60 * PX,
  DEATH_BURST_SPEED_MAX: 140 * PX,
  FEATHER_COLORS: [0xf5d742, 0xfce878, 0xdeb858],
};
