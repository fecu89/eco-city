// --- Display ---
export const DPR = Math.min(window.devicePixelRatio || 1, 2);

const _isPortrait = window.innerHeight > window.innerWidth;
const _designW = _isPortrait ? 540 : 960;
const _designH = _isPortrait ? 960 : 540;
const _designAspect = _designW / _designH;

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

export const PX = _canvasW / _designW;

export const GAME = {
  WIDTH: _canvasW,
  HEIGHT: _canvasH,
  IS_PORTRAIT: _isPortrait,
};

// --- Characters ---
// Unit: "u" = CHARACTER.U (base unit derived from game width)
// All body measurements scale from this single value.
const _U = GAME.WIDTH * 0.012;

export const CHARACTER = {
  U: _U,

  // Overall proportions — BOBBLEHEAD: giant head, stubby body
  TORSO_W: _U * 6,
  TORSO_H: _U * 5,
  SHOULDER_W: _U * 7,      // wider than torso for jacket shape
  WAIST_W: _U * 5,
  NECK_W: _U * 2.5,
  NECK_H: _U * 1,

  // Head (spritesheet) sizing — dominates the character
  HEAD_H: _canvasH * 0.35,  // ~35% of screen height

  // Expression spritesheet
  FRAME_W: 200,
  FRAME_H: 300,

  // Arms (stubby)
  UPPER_ARM_W: _U * 1.8,
  UPPER_ARM_H: _U * 3,
  LOWER_ARM_W: _U * 1.6,
  LOWER_ARM_H: _U * 2.5,
  HAND_W: _U * 1.8,
  HAND_H: _U * 1.5,

  // Legs (stubby)
  LEG_W: _U * 2.4,
  LEG_H: _U * 3,
  LEG_GAP: _U * 1.2,      // gap between legs
  SHOE_W: _U * 3,
  SHOE_H: _U * 1.2,

  // Suit details (proportional to smaller body)
  LAPEL_W: _U * 1.4,
  TIE_W: _U * 1,
  TIE_H: _U * 3,
  BUTTON_R: _U * 0.3,
  POCKET_W: _U * 1.5,
  POCKET_H: _U * 0.25,

  // Body height (torso + legs + shoes + neck — excludes head)
  BODY_HEIGHT: _U * 5 + _U * 3 + _U * 1.2 + _U * 1,

  // Outline
  OUTLINE: Math.max(1, Math.round(_U * 0.3)),

  // Expression system
  EXPRESSION: { NORMAL: 0, HAPPY: 1, ANGRY: 2, SURPRISED: 3, FRAME_COUNT: 4 },
  EXPRESSION_HOLD: 1500,  // ms before reverting to normal

  // Positions
  TRUMP_X: GAME.WIDTH * 0.3,
  TRUMP_Y: GAME.HEIGHT * 0.65,
  BIDEN_X: GAME.WIDTH * 0.7,
  BIDEN_Y: GAME.HEIGHT * 0.65,

  // Trump colors
  TRUMP_SUIT: 0x1a1a2e,
  TRUMP_SUIT_LIGHT: 0x282845,
  TRUMP_TIE: 0xcc0000,
  TRUMP_SHIRT: 0xf0f0f0,
  TRUMP_PANTS: 0x141428,
  TRUMP_SHOES: 0x1a1a1a,
  TRUMP_SKIN: 0xf5c68a,

  // Biden/opponent colors
  BIDEN_SUIT: 0x1a2744,
  BIDEN_SUIT_LIGHT: 0x253560,
  BIDEN_TIE: 0x2244aa,
  BIDEN_SHIRT: 0xf0f0f0,
  BIDEN_PANTS: 0x142038,
  BIDEN_SHOES: 0x1a1a1a,
  BIDEN_SKIN: 0xf5d0a9,
};

// --- Mog Mechanics ---
export const MOG = {
  // Timing bar
  BAR_WIDTH: GAME.WIDTH * 0.5,
  BAR_HEIGHT: GAME.HEIGHT * 0.04,
  BAR_X: GAME.WIDTH * 0.5,
  BAR_Y: GAME.HEIGHT * 0.12,
  BAR_BG: 0x333333,
  BAR_FILL: 0x44ff44,
  BAR_PERFECT: 0xffd700,

  // Cursor speed (oscillates left-right)
  CURSOR_SPEED_START: 300 * PX,
  CURSOR_SPEED_INCREMENT: 30 * PX,
  CURSOR_WIDTH: 4 * PX,
  CURSOR_COLOR: 0xffffff,

  // Sweet spot (center zone for perfect mog)
  SWEET_SPOT_RATIO: 0.15, // 15% of bar width

  // Scoring
  PERFECT_MOG_POINTS: 100,
  GOOD_MOG_POINTS: 50,
  MISS_POINTS: 0,

  // Mog meter
  METER_MAX: 1000,
  METER_WIDTH: GAME.WIDTH * 0.6,
  METER_HEIGHT: GAME.HEIGHT * 0.03,
  METER_X: GAME.WIDTH * 0.5,
  METER_Y: GAME.HEIGHT * 0.2,
  METER_BG: 0x222222,
  METER_FILL: 0xff4444,
  METER_BORDER: 0xffffff,

  // Scale changes on mog
  TRUMP_GROW: 0.03,
  BIDEN_SHRINK: 0.03,
  MAX_TRUMP_SCALE: 1.8,
  MIN_BIDEN_SCALE: 0.4,

  // Rounds
  MOGS_PER_ROUND: 10,
};

// --- Colors ---
export const COLORS = {
  SKY_TOP: 0x1a0a2e,
  SKY_BOTTOM: 0x16213e,
  GROUND: 0x2d4a22,
  GROUND_DARK: 0x1e3316,

  UI_TEXT: '#ffffff',
  UI_SHADOW: '#000000',
  TITLE_GOLD: '#ffd700',
  SCORE_TEXT: '#00ff88',
  COMBO_TEXT: '#ff4444',

  BTN_PRIMARY: 0xff4444,
  BTN_PRIMARY_HOVER: 0xff6666,
  BTN_TEXT: '#ffffff',
};

// --- UI ---
export const UI = {
  FONT: '"Impact", "Arial Black", sans-serif',
  TITLE_RATIO: 0.09,
  HEADING_RATIO: 0.055,
  BODY_RATIO: 0.04,
  SMALL_RATIO: 0.028,
  BTN_W_RATIO: 0.4,
  BTN_H_RATIO: 0.08,
  BTN_RADIUS: 12 * PX,
  MIN_TOUCH: 44 * PX,
};

// --- Transitions ---
export const TRANSITION = {
  FADE_DURATION: 350,
};
