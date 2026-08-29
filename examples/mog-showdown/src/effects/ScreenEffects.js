import Phaser from 'phaser';
import { GAME, PX, EFFECTS, COLORS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

/**
 * ScreenEffects -- handles screen shake, background pulse, flash overlays,
 * and hit freeze frames. All triggered via EventBus.
 */
export class ScreenEffects {
  constructor(scene) {
    this.scene = scene;

    // Background pulse overlay (additive blend)
    this.pulseOverlay = scene.add.graphics();
    this.pulseOverlay.setDepth(2);
    this.pulseOverlay.setBlendMode(Phaser.BlendModes.ADD);
    this.pulseOverlay.setAlpha(0);

    // Hit freeze state
    this._frozen = false;
    this._freezeTimer = null;

    // --- Bind event listeners ---
    this._onScoreChanged = (data) => this.onScoreChanged(data);
    this._onSpectacleHit = (data) => this.onSpectacleHit(data);
    this._onSpectacleCombo = (data) => this.onSpectacleCombo(data);
    this._onSpectacleStreak = (data) => this.onSpectacleStreak(data);
    this._onAttackHit = (data) => this.onAttackHit(data);
    this._onSpectacleNearMiss = (data) => this.onSpectacleNearMiss(data);
    this._onFrameMog = (data) => this.onFrameMog(data);

    eventBus.on(Events.SCORE_CHANGED, this._onScoreChanged);
    eventBus.on(Events.SPECTACLE_HIT, this._onSpectacleHit);
    eventBus.on(Events.SPECTACLE_COMBO, this._onSpectacleCombo);
    eventBus.on(Events.SPECTACLE_STREAK, this._onSpectacleStreak);
    eventBus.on(Events.ATTACK_HIT, this._onAttackHit);
    eventBus.on(Events.SPECTACLE_NEAR_MISS, this._onSpectacleNearMiss);
    eventBus.on(Events.MOG_FRAMEMOG, this._onFrameMog);
  }

  // --- Background pulse on score ---
  pulseBackground(color, alpha, duration) {
    this.pulseOverlay.clear();
    this.pulseOverlay.fillStyle(color || EFFECTS.BG_PULSE_COLOR, 1);
    this.pulseOverlay.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    this.pulseOverlay.setAlpha(alpha || EFFECTS.BG_PULSE_ALPHA);

    this.scene.tweens.add({
      targets: this.pulseOverlay,
      alpha: 0,
      duration: duration || EFFECTS.BG_PULSE_DURATION,
      ease: 'Sine.easeOut',
    });
  }

  // --- Screen shake with intensity ---
  shake(intensity, duration) {
    if (this.scene.cameras && this.scene.cameras.main) {
      this.scene.cameras.main.shake(
        duration || EFFECTS.SHAKE_DURATION_MEDIUM,
        intensity || EFFECTS.SHAKE_LIGHT
      );
    }
  }

  // --- Hit freeze frame ---
  freezeFrame(durationMs) {
    if (this._frozen) return;
    this._frozen = true;

    // Pause physics
    if (this.scene.physics && this.scene.physics.world) {
      this.scene.physics.world.pause();
    }

    // Brief pause then resume
    if (this._freezeTimer) clearTimeout(this._freezeTimer);
    this._freezeTimer = setTimeout(() => {
      if (this.scene.physics && this.scene.physics.world) {
        this.scene.physics.world.resume();
      }
      this._frozen = false;
    }, durationMs || EFFECTS.HIT_FREEZE_DURATION);
  }

  // --- Event handlers ---
  onScoreChanged(data) {
    // Background pulse on every score change
    this.pulseBackground(EFFECTS.BG_PULSE_COLOR, EFFECTS.BG_PULSE_ALPHA, EFFECTS.BG_PULSE_DURATION);
  }

  onSpectacleHit(data) {
    // Light shake on powerup collection
    this.shake(EFFECTS.SHAKE_LIGHT, EFFECTS.SHAKE_DURATION_SHORT);
  }

  onSpectacleCombo(data) {
    const combo = data.combo || 2;
    // Shake scales with combo
    const intensity = Math.min(
      EFFECTS.COMBO_SHAKE_BASE + combo * EFFECTS.COMBO_SHAKE_PER_COMBO,
      EFFECTS.COMBO_SHAKE_CAP
    );
    this.shake(intensity, EFFECTS.SHAKE_DURATION_MEDIUM);

    // Pulse gets more intense with combo
    const pulseAlpha = Math.min(EFFECTS.BG_PULSE_ALPHA + combo * 0.02, EFFECTS.FLASH_ALPHA_HEAVY);
    this.pulseBackground(COLORS.NEON_PINK, pulseAlpha, EFFECTS.BG_PULSE_DURATION * 1.2);
  }

  onSpectacleStreak(data) {
    // Heavy shake on streak milestone
    this.shake(EFFECTS.SHAKE_HEAVY, EFFECTS.SHAKE_DURATION_LONG);

    // Big flash overlay
    const cam = this.scene.cameras.main;
    if (cam) {
      cam.flash(300, 255, 215, 0, false, null, null, EFFECTS.FLASH_ALPHA_HEAVY);
    }

    // Freeze frame for dramatic effect
    this.freezeFrame(EFFECTS.HIT_FREEZE_DURATION * 1.5);
  }

  onAttackHit(data) {
    // Medium shake on damage
    this.shake(EFFECTS.SHAKE_MEDIUM, EFFECTS.SHAKE_DURATION_MEDIUM);

    // Red pulse
    this.pulseBackground(0xFF3366, EFFECTS.FLASH_ALPHA_LIGHT, EFFECTS.BG_PULSE_DURATION);

    // Freeze frame on hit
    this.freezeFrame(EFFECTS.HIT_FREEZE_DURATION);
  }

  onSpectacleNearMiss(data) {
    // Subtle blue flash for near-miss
    this.pulseBackground(COLORS.NEON_BLUE, 0.08, 200);
  }

  onFrameMog(data) {
    // Heavy shake + gold flash for frame mog
    this.shake(EFFECTS.SHAKE_HEAVY, EFFECTS.SHAKE_DURATION_LONG);
    this.pulseBackground(COLORS.NEON_GOLD, EFFECTS.FLASH_ALPHA_HEAVY, 500);
    this.freezeFrame(EFFECTS.HIT_FREEZE_DURATION * 2);
  }

  destroy() {
    eventBus.off(Events.SCORE_CHANGED, this._onScoreChanged);
    eventBus.off(Events.SPECTACLE_HIT, this._onSpectacleHit);
    eventBus.off(Events.SPECTACLE_COMBO, this._onSpectacleCombo);
    eventBus.off(Events.SPECTACLE_STREAK, this._onSpectacleStreak);
    eventBus.off(Events.ATTACK_HIT, this._onAttackHit);
    eventBus.off(Events.SPECTACLE_NEAR_MISS, this._onSpectacleNearMiss);
    eventBus.off(Events.MOG_FRAMEMOG, this._onFrameMog);

    if (this._freezeTimer) clearTimeout(this._freezeTimer);
    if (this.pulseOverlay) this.pulseOverlay.destroy();
  }
}
