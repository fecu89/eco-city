// =============================================================================
// InputSystem.js — Keyboard + touch input for boxing controls
//
// Keyboard:
//   A / Left Arrow  = left punch
//   D / Right Arrow = right punch
//   W / Up Arrow    = block
//
// Touch (tap zones):
//   Left half of screen   = left punch
//   Right half of screen  = right punch
//   Top 30% of screen     = block
//
// Fires events through EventBus. No direct module imports.
// =============================================================================

import { IS_MOBILE } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class InputSystem {
  constructor() {
    this.gameActive = false;

    // Track key state for continuous block
    this.keys = {};
    this.wasBlocking = false;

    // Keyboard
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Touch
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    window.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

    // Track active block touches
    this.blockTouchId = null;
  }

  setGameActive(active) {
    this.gameActive = active;
  }

  onKeyDown(e) {
    if (!this.gameActive || gameState.gameOver || gameState.roundOver) return;

    const code = e.code;
    if (code.startsWith('Arrow') || code === 'KeyA' || code === 'KeyD' || code === 'KeyW') {
      e.preventDefault();
    }

    // Prevent repeat fires
    if (this.keys[code]) return;
    this.keys[code] = true;

    if (code === 'KeyA' || code === 'ArrowLeft') {
      eventBus.emit(Events.PLAYER_PUNCH_LEFT);
    } else if (code === 'KeyD' || code === 'ArrowRight') {
      eventBus.emit(Events.PLAYER_PUNCH_RIGHT);
    } else if (code === 'KeyW' || code === 'ArrowUp') {
      eventBus.emit(Events.PLAYER_BLOCK_START);
    }
  }

  onKeyUp(e) {
    const code = e.code;
    this.keys[code] = false;

    if (code === 'KeyW' || code === 'ArrowUp') {
      eventBus.emit(Events.PLAYER_BLOCK_END);
    }
  }

  onTouchStart(e) {
    if (!this.gameActive || gameState.gameOver || gameState.roundOver) return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX;
      const y = touch.clientY;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Top 30% = block
      if (y < h * 0.3) {
        this.blockTouchId = touch.identifier;
        eventBus.emit(Events.PLAYER_BLOCK_START);
        return;
      }

      // Bottom area: left half = left punch, right half = right punch
      if (x < w / 2) {
        eventBus.emit(Events.PLAYER_PUNCH_LEFT);
      } else {
        eventBus.emit(Events.PLAYER_PUNCH_RIGHT);
      }
    }
  }

  onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.blockTouchId) {
        this.blockTouchId = null;
        eventBus.emit(Events.PLAYER_BLOCK_END);
      }
    }
  }

  update() {
    // Check if blocking via keyboard (held key)
    const blocking = this.keys['KeyW'] || this.keys['ArrowUp'];
    if (blocking && !this.wasBlocking) {
      // Already handled in keydown
    } else if (!blocking && this.wasBlocking) {
      // Already handled in keyup
    }
    this.wasBlocking = blocking;
  }
}
