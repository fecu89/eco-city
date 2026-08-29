// =============================================================================
// AudioManager.js — Strudel wrapper for BGM (background music only)
// Uses initStrudel() to boot the engine, hush() to stop all patterns.
// 100ms delay between hush() and play() lets the Strudel scheduler process.
// =============================================================================

import { initStrudel, hush } from '@strudel/web';
import { gameState } from '../core/GameState.js';

class AudioManager {
  constructor() {
    this.initialized = false;
    this.currentMusic = null;
    this._pendingPatternFn = null;
  }

  init() {
    if (this.initialized) return;
    try {
      initStrudel();
      this.initialized = true;
      console.log('[Audio] Strudel initialized');
    } catch (e) {
      console.warn('[Audio] Strudel init failed:', e);
    }
  }

  playMusic(patternFn) {
    if (!this.initialized || gameState.isMuted) return;
    this.stopMusic();
    this._pendingPatternFn = patternFn;
    // hush() needs a scheduler tick to process before new pattern starts
    setTimeout(() => {
      // Guard: if stopMusic() was called during the 100ms gap, abort
      if (this._pendingPatternFn !== patternFn) return;
      try {
        this.currentMusic = patternFn();
      } catch (e) {
        console.warn('[Audio] BGM error:', e);
      }
      this._pendingPatternFn = null;
    }, 100);
  }

  stopMusic() {
    this._pendingPatternFn = null;
    if (!this.initialized) return;
    try { hush(); } catch (e) { /* noop */ }
    this.currentMusic = null;
  }
}

export const audioManager = new AudioManager();
