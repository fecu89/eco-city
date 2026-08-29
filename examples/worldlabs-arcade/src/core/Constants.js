export const GAME = {
  FOV: 65,
  NEAR: 0.01,
  FAR: 1000,
  MAX_DELTA: 0.05,
  MAX_DPR: 2,
};

export const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1);

// Collider bounds: ~11.4 x 1.7 x 6.2 units, centered near (-1.4, 0, 2.0)
// Tighter play area to stay in the good-looking splat region
export const PLAYER = {
  SIZE: 1,
  SPEED: 1.0,
  START_X: -1.4,
  START_Y: -0.86,
  START_Z: 2.0,
  COLOR: 0x44aaff,
  TURN_SPEED: 8,           // radians/s for model rotation
};

export const CAMERA = {
  EYE_HEIGHT: 0.9,
  MOUSE_SENSITIVITY: 0.002,
  FOLLOW_DISTANCE: 1.5,    // distance behind player
  FOLLOW_HEIGHT: 0.8,      // height above player feet
  LOOK_HEIGHT: 0.45,       // look-at height on player (chest level)
  LERP_SPEED: 10,          // camera smoothing
};

export const BOUNDS = {
  MIN_X: -5.5,
  MAX_X: 3.0,
  MIN_Z: 0.0,
  MAX_Z: 4.2,
};

export const COLORS = {
  SKY: 0x1a0a2e,
};

export const WORLD = {
  splatPath: 'assets/worlds/arcade.spz',          // full-res (30MB) for sharp close-up
  colliderPath: 'assets/worlds/arcade-collider.glb',
  panoPath: 'assets/worlds/arcade-pano.png',
  scale: 1,
  position: { x: 0, y: 0, z: 0 },
};

export const CHARACTER = {
  path: 'assets/models/Soldier.glb',
  scale: 0.5,             // GLB has internal 0.01 scale (cm export) → 0.5 × 0.01 = ~0.9m tall
  offsetY: 0,
  facingOffset: Math.PI,
  clipMap: { idle: 'Idle', walk: 'Walk', run: 'Run' },
};
