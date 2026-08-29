// =============================================================================
// InputSystem.js — Unified input for arena battle (keyboard + touch).
//
// Desktop: A/D or ArrowLeft/ArrowRight = move left/right, Space = throw
// Mobile: Touch left half = move left, touch right half = move right,
//         quick tap = throw (detected as short press < 200ms)
//
// Exposes: moveX (-1..1), throwAction (boolean, consumed per frame)
// =============================================================================

import { IS_MOBILE } from '../core/Constants.js';

export class InputSystem {
  constructor() {
    this.keys = {};
    this.moveX = 0;
    this.throwAction = false;
    this._gameActive = false;

    // Touch state
    this._touches = new Map();     // pointerId -> { startX, startTime, side }
    this._touchMoveX = 0;
    this._touchThrow = false;

    // Keyboard listeners
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // Pointer events for touch (works on all devices)
    window.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));

    // Prevent context menu on long press
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setGameActive(active) {
    this._gameActive = active;
  }

  _onPointerDown(e) {
    if (!this._gameActive) return;
    if (e.pointerType === 'mouse') return; // Mouse uses keyboard controls

    const halfW = window.innerWidth / 2;
    const side = e.clientX < halfW ? 'left' : 'right';

    this._touches.set(e.pointerId, {
      startX: e.clientX,
      startTime: performance.now(),
      side,
    });

    this._updateTouchMove();
  }

  _onPointerMove(e) {
    if (!this._gameActive) return;
    const touch = this._touches.get(e.pointerId);
    if (!touch) return;

    // Update side if finger dragged across midpoint
    const halfW = window.innerWidth / 2;
    touch.side = e.clientX < halfW ? 'left' : 'right';

    this._updateTouchMove();
  }

  _onPointerUp(e) {
    const touch = this._touches.get(e.pointerId);
    if (touch) {
      const elapsed = performance.now() - touch.startTime;
      // Quick tap = throw (under 200ms)
      if (elapsed < 200) {
        this._touchThrow = true;
      }
      this._touches.delete(e.pointerId);
    }
    this._updateTouchMove();
  }

  _updateTouchMove() {
    // Determine net movement from all active touches
    let leftActive = false;
    let rightActive = false;

    for (const [, touch] of this._touches) {
      if (touch.side === 'left') leftActive = true;
      if (touch.side === 'right') rightActive = true;
    }

    if (leftActive && rightActive) {
      this._touchMoveX = 0; // Both sides cancel out
    } else if (leftActive) {
      this._touchMoveX = -1;
    } else if (rightActive) {
      this._touchMoveX = 1;
    } else {
      this._touchMoveX = 0;
    }
  }

  update() {
    // Merge keyboard input
    let kbX = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) kbX -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) kbX += 1;

    const kbThrow = !!this.keys['Space'];

    // Keyboard overrides touch if active, otherwise use touch
    if (kbX !== 0) {
      this.moveX = kbX;
    } else {
      this.moveX = this._touchMoveX;
    }

    // Throw: keyboard Space (edge-detected) or touch tap
    this.throwAction = kbThrow || this._touchThrow;

    // Consume touch throw after one frame
    this._touchThrow = false;
  }

  // Legacy accessors for compatibility
  isDown(code) { return !!this.keys[code]; }
  get left() { return this.isDown('KeyA') || this.isDown('ArrowLeft'); }
  get right() { return this.isDown('KeyD') || this.isDown('ArrowRight'); }
}
