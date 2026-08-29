// =============================================================================
// InputSystem.js — Swipe + keyboard input for endless runner
//
// Provides discrete actions: lane change left/right, jump, slide.
// On mobile: swipe gestures detect direction.
// Keyboard: A/Left = lane left, D/Right = lane right, Space/W = jump, S = slide.
// =============================================================================

import { IS_MOBILE } from '../core/Constants.js';

const SWIPE_THRESHOLD = 30; // Minimum pixels for a swipe
const SWIPE_MAX_TIME = 400; // Max ms for a swipe gesture

export class InputSystem {
  constructor() {
    this.keys = {};

    // Discrete action flags (consumed once per read)
    this._swipeLeft = false;
    this._swipeRight = false;
    this._jump = false;
    this._slide = false;

    // Track key-down edges (fire once per press)
    this._keyEdges = {};

    // Touch tracking
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchStartTime = 0;
    this._touchActive = false;

    // Game active flag
    this._gameActive = false;

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) {
        this._keyEdges[e.code] = true;
      }
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this._keyEdges[e.code] = false;
    });

    // Touch (swipe detection)
    window.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
    window.addEventListener('touchcancel', () => this._onTouchCancel());
  }

  isDown(code) {
    return !!this.keys[code];
  }

  /** Show/hide input zones when game starts/stops */
  setGameActive(active) {
    this._gameActive = active;
    if (!active) {
      this._swipeLeft = false;
      this._swipeRight = false;
      this._jump = false;
      this._slide = false;
      this._touchActive = false;
    }
  }

  /** Call once per frame — converts keyboard edges to action flags */
  update() {
    // Keyboard edge detection: fire once per key press
    if (this._keyEdges['ArrowLeft'] || this._keyEdges['KeyA']) {
      this._swipeLeft = true;
      this._keyEdges['ArrowLeft'] = false;
      this._keyEdges['KeyA'] = false;
    }
    if (this._keyEdges['ArrowRight'] || this._keyEdges['KeyD']) {
      this._swipeRight = true;
      this._keyEdges['ArrowRight'] = false;
      this._keyEdges['KeyD'] = false;
    }
    if (this._keyEdges['Space'] || this._keyEdges['KeyW'] || this._keyEdges['ArrowUp']) {
      this._jump = true;
      this._keyEdges['Space'] = false;
      this._keyEdges['KeyW'] = false;
      this._keyEdges['ArrowUp'] = false;
    }
    if (this._keyEdges['KeyS'] || this._keyEdges['ArrowDown']) {
      this._slide = true;
      this._keyEdges['KeyS'] = false;
      this._keyEdges['ArrowDown'] = false;
    }
  }

  /** Returns true once if a left lane-change was requested, then resets */
  consumeSwipeLeft() {
    if (this._swipeLeft) {
      this._swipeLeft = false;
      return true;
    }
    return false;
  }

  /** Returns true once if a right lane-change was requested, then resets */
  consumeSwipeRight() {
    if (this._swipeRight) {
      this._swipeRight = false;
      return true;
    }
    return false;
  }

  /** Returns true once if a jump was requested, then resets */
  consumeJump() {
    if (this._jump) {
      this._jump = false;
      return true;
    }
    return false;
  }

  /** Returns true once if a slide was requested, then resets */
  consumeSlide() {
    if (this._slide) {
      this._slide = false;
      return true;
    }
    return false;
  }

  // --- Touch / Swipe Detection ---

  _onTouchStart(e) {
    if (!this._gameActive) return;
    // Don't intercept touches on UI overlays
    if (e.target.closest('.overlay') || e.target.closest('button')) return;
    e.preventDefault();
    const touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this._touchStartTime = performance.now();
    this._touchActive = true;
  }

  _onTouchMove(e) {
    if (!this._touchActive) return;
    e.preventDefault();
  }

  _onTouchEnd(e) {
    if (!this._touchActive) return;
    e.preventDefault();
    this._touchActive = false;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;
    const elapsed = performance.now() - this._touchStartTime;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Check if it qualifies as a swipe
    if (elapsed > SWIPE_MAX_TIME) {
      // Too slow — treat as a tap (jump)
      this._jump = true;
      return;
    }

    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
      // Too short — treat as a tap (jump)
      this._jump = true;
      return;
    }

    // Determine swipe direction
    if (absDx > absDy) {
      // Horizontal swipe
      if (dx < 0) {
        this._swipeLeft = true;
      } else {
        this._swipeRight = true;
      }
    } else {
      // Vertical swipe
      if (dy < 0) {
        this._jump = true;
      } else {
        this._slide = true;
      }
    }
  }

  _onTouchCancel() {
    this._touchActive = false;
  }
}
