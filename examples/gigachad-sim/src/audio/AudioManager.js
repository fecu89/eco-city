// =============================================================================
// AudioManager.js — Web Audio API singleton
// Owns AudioContext, master GainNode, and BGM step sequencer.
// AudioContext is created/resumed on first user interaction (autoplay policy).
// All audio routes through masterGain for global mute control.
// =============================================================================

class AudioManager {
  constructor() {
    this.ctx = null;
    this.currentBgm = null; // { stop() }
    this.masterGain = null;
  }

  /**
   * Create or resume AudioContext. Safe to call multiple times.
   * Must be triggered from a user interaction (click/tap/keypress).
   */
  init() {
    try {
      if (this.ctx) {
        // Resume if suspended (e.g. after tab switch)
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }

      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[AudioManager] Failed to create AudioContext:', e);
    }
  }

  /**
   * Get AudioContext (creates if needed).
   * @returns {AudioContext|null}
   */
  getCtx() {
    if (!this.ctx) this.init();
    return this.ctx;
  }

  /**
   * Get master GainNode (creates if needed).
   * @returns {GainNode|null}
   */
  getMaster() {
    if (!this.masterGain) this.init();
    return this.masterGain;
  }

  /**
   * Play a BGM pattern function. Stops any currently playing BGM first.
   * @param {Function} patternFn - (ctx, dest) => { stop() }
   */
  playMusic(patternFn) {
    this.stopMusic();
    try {
      const ctx = this.getCtx();
      const master = this.getMaster();
      if (!ctx || !master) return;
      this.currentBgm = patternFn(ctx, master);
    } catch (e) {
      console.warn('[AudioManager] BGM error:', e);
    }
  }

  /**
   * Stop current BGM.
   */
  stopMusic() {
    if (this.currentBgm) {
      try { this.currentBgm.stop(); } catch (_) {}
      this.currentBgm = null;
    }
  }

  /**
   * Set muted state via master gain.
   * @param {boolean} muted
   */
  setMuted(muted) {
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 1;
    }
  }
}

export const audioManager = new AudioManager();
