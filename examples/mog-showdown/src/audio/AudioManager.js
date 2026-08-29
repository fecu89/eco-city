import { initStrudel, hush } from '@strudel/web';
import { gameState } from '../core/GameState.js';

/**
 * AudioManager -- wraps Strudel for BGM playback.
 * Handles init, play, stop, and mute state.
 * SFX use Web Audio API directly (see sfx.js).
 */
class AudioManager {
  constructor() {
    this.initialized = false;
    this.currentMusic = null;
    this._lastPatternFn = null;
  }

  init() {
    if (this.initialized) return;
    try {
      initStrudel();
      this.initialized = true;
    } catch (e) {
      console.warn('[Audio] Strudel init failed:', e);
    }
  }

  playMusic(patternFn) {
    // Always track the intended pattern (even if muted)
    this._lastPatternFn = patternFn;

    if (!this.initialized || gameState.isMuted) return;
    this._hush();
    // hush() needs a scheduler tick to process before new pattern starts
    setTimeout(() => {
      if (gameState.isMuted) return;
      try {
        this.currentMusic = patternFn();
      } catch (e) {
        console.warn('[Audio] BGM error:', e);
      }
    }, 100);
  }

  stopMusic() {
    this._lastPatternFn = null;
    this._hush();
  }

  /** Silence output but remember the pattern for unmuting */
  muteStop() {
    this._hush();
  }

  /** Resume the last pattern after unmute */
  resumeMusic() {
    if (!this.initialized || !this._lastPatternFn) return;
    if (gameState.isMuted) return;
    const fn = this._lastPatternFn;
    setTimeout(() => {
      if (gameState.isMuted) return;
      try {
        this.currentMusic = fn();
      } catch (e) {
        console.warn('[Audio] BGM resume error:', e);
      }
    }, 100);
  }

  /** Internal: silence all Strudel patterns */
  _hush() {
    if (!this.initialized) return;
    try { hush(); } catch (e) { /* noop */ }
    this.currentMusic = null;
  }
}

export const audioManager = new AudioManager();
