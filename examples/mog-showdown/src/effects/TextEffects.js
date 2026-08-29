import Phaser from 'phaser';
import { GAME, PX, EFFECTS, COLORS, UI, SAFE_ZONE } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

/**
 * TextEffects -- handles floating score text, combo counter display,
 * streak milestone announcements, near-miss indicators, and
 * entrance flavor text.
 */
export class TextEffects {
  constructor(scene) {
    this.scene = scene;
    this.activeTexts = [];

    // --- Combo counter (persistent, updates on combo events) ---
    this.comboContainer = null;
    this.comboText = null;
    this.comboGlow = null;
    this._comboVisible = false;

    this.createComboDisplay();

    // --- Bind event listeners ---
    this._onScoreChanged = (data) => this.onScoreChanged(data);
    this._onSpectacleCombo = (data) => this.onSpectacleCombo(data);
    this._onSpectacleStreak = (data) => this.onSpectacleStreak(data);
    this._onComboBreak = () => this.onComboBreak();
    this._onSpectacleNearMiss = (data) => this.onSpectacleNearMiss(data);
    this._onSpectacleEntrance = (data) => this.onSpectacleEntrance(data);

    eventBus.on(Events.SCORE_CHANGED, this._onScoreChanged);
    eventBus.on(Events.SPECTACLE_COMBO, this._onSpectacleCombo);
    eventBus.on(Events.SPECTACLE_STREAK, this._onSpectacleStreak);
    eventBus.on(Events.COMBO_BREAK, this._onComboBreak);
    eventBus.on(Events.SPECTACLE_NEAR_MISS, this._onSpectacleNearMiss);
    eventBus.on(Events.SPECTACLE_ENTRANCE, this._onSpectacleEntrance);
  }

  createComboDisplay() {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT * 0.55;

    // Glow layer behind combo text
    this.comboGlow = this.scene.add.text(cx, cy, '', {
      fontSize: EFFECTS.COMBO_TEXT_BASE_SIZE + 'px',
      fontFamily: UI.FONT,
      color: '#FFD700',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: 'rgba(255,215,0,0.6)', blur: 20, fill: true },
    }).setOrigin(0.5).setAlpha(0).setDepth(15);

    this.comboText = this.scene.add.text(cx, cy, '', {
      fontSize: EFFECTS.COMBO_TEXT_BASE_SIZE + 'px',
      fontFamily: UI.FONT,
      color: '#FFFFFF',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.8)', blur: 6, fill: true },
    }).setOrigin(0.5).setAlpha(0).setDepth(16);
  }

  // --- Floating score text ---
  showFloatingText(x, y, text, color, fontSize, startScale) {
    const size = fontSize || EFFECTS.FLOAT_TEXT_SIZE;
    const scale = startScale || EFFECTS.FLOAT_TEXT_START_SCALE;

    const txt = this.scene.add.text(x, y, text, {
      fontSize: size + 'px',
      fontFamily: UI.FONT,
      color: color || COLORS.SCORE_GOLD,
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.8)', blur: 6, fill: true },
    }).setOrigin(0.5).setScale(scale).setDepth(20);

    // Elastic scale-in then float up and fade
    this.scene.tweens.add({
      targets: txt,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      ease: 'Elastic.easeOut',
    });

    this.scene.tweens.add({
      targets: txt,
      y: y - EFFECTS.FLOAT_TEXT_RISE,
      alpha: 0,
      duration: EFFECTS.FLOAT_TEXT_DURATION,
      delay: 200,
      ease: 'Sine.easeOut',
      onComplete: () => txt.destroy(),
    });

    this.activeTexts.push(txt);
  }

  // --- Streak milestone announcement ---
  showStreakAnnouncement(streak) {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT * 0.38;

    const messages = {
      5: 'FRAME CHECK!',
      10: 'MOG OR BE MOGGED!',
      25: 'ABSOLUTE MOGGER!',
    };

    const message = messages[streak] || `${streak}x STREAK!`;

    // Glow background text
    const glowTxt = this.scene.add.text(cx, cy, message, {
      fontSize: EFFECTS.STREAK_TEXT_SIZE + 'px',
      fontFamily: UI.FONT,
      color: '#FFD700',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: 'rgba(255,215,0,0.8)', blur: 30, fill: true },
    }).setOrigin(0.5).setScale(0).setDepth(25).setBlendMode(Phaser.BlendModes.ADD);

    // Main text
    const mainTxt = this.scene.add.text(cx, cy, message, {
      fontSize: EFFECTS.STREAK_TEXT_SIZE + 'px',
      fontFamily: UI.FONT,
      color: '#FFFFFF',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 3, color: 'rgba(0,0,0,0.8)', blur: 10, fill: true },
    }).setOrigin(0.5).setScale(0).setDepth(26);

    // Slam-in animation
    this.scene.tweens.add({
      targets: [mainTxt, glowTxt],
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 250,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Hold then fade out
        this.scene.tweens.add({
          targets: [mainTxt, glowTxt],
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 200,
          yoyo: false,
          onComplete: () => {
            this.scene.tweens.add({
              targets: [mainTxt, glowTxt],
              alpha: 0,
              y: cy - 30 * PX,
              scaleX: 0.8,
              scaleY: 0.8,
              duration: 500,
              delay: 300,
              onComplete: () => {
                mainTxt.destroy();
                glowTxt.destroy();
              },
            });
          },
        });
      },
    });
  }

  // --- Near miss text ---
  showNearMissText(x, y) {
    const txt = this.scene.add.text(x, y - 30 * PX, 'CLOSE!', {
      fontSize: EFFECTS.NEAR_MISS_TEXT_SIZE + 'px',
      fontFamily: UI.FONT,
      color: '#00BFFF',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 1, color: 'rgba(0,0,0,0.8)', blur: 4, fill: true },
    }).setOrigin(0.5).setScale(1.5).setDepth(20);

    this.scene.tweens.add({
      targets: txt,
      scaleX: 1,
      scaleY: 1,
      y: y - 60 * PX,
      alpha: 0,
      duration: 600,
      ease: 'Sine.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  // --- Event handlers ---
  onScoreChanged(data) {
    // Floating score text at player position
    if (!this.scene || !this.scene.player) return;
    const x = this.scene.player.sprite.x;
    const y = this.scene.player.sprite.y - 50 * PX;

    const combo = gameState.combo;
    const text = combo > 1 ? `+1 x${combo}` : '+1';
    const color = combo > 3 ? '#FF69B4' : combo > 1 ? '#FFD700' : '#FFFFFF';

    this.showFloatingText(x, y, text, color);
  }

  onSpectacleCombo(data) {
    const combo = data.combo || 2;

    // Update combo counter display
    const fontSize = EFFECTS.COMBO_TEXT_BASE_SIZE + combo * EFFECTS.COMBO_TEXT_SIZE_PER_COMBO;
    const comboStr = `${combo}x COMBO`;

    this.comboText.setText(comboStr);
    this.comboText.setFontSize(fontSize);
    this.comboGlow.setText(comboStr);
    this.comboGlow.setFontSize(fontSize);

    // Animate in if not visible
    if (!this._comboVisible) {
      this._comboVisible = true;
      this.comboText.setAlpha(1);
      this.comboGlow.setAlpha(0.5);
    }

    // Punch scale animation
    this.scene.tweens.add({
      targets: [this.comboText, this.comboGlow],
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 100,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  onComboBreak() {
    if (!this._comboVisible) return;
    this._comboVisible = false;

    // Fade out combo counter
    this.scene.tweens.add({
      targets: [this.comboText, this.comboGlow],
      alpha: 0,
      scaleX: 0.5,
      scaleY: 0.5,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.comboText.setScale(1);
        this.comboGlow.setScale(1);
      },
    });
  }

  onSpectacleStreak(data) {
    this.showStreakAnnouncement(data.streak);
  }

  onSpectacleNearMiss(data) {
    if (!this.scene || !this.scene.player) return;
    const x = this.scene.player.sprite.x;
    const y = this.scene.player.sprite.y;

    this.showNearMissText(x, y);
  }

  onSpectacleEntrance(data) {
    // Show entrance flavor text after player lands
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT * 0.5;

    const txt = this.scene.add.text(cx, cy, 'MOG OR BE MOGGED!', {
      fontSize: Math.round(GAME.HEIGHT * 0.055) + 'px',
      fontFamily: UI.FONT,
      color: '#FFD700',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 3, color: 'rgba(0,0,0,0.8)', blur: 12, fill: true },
    }).setOrigin(0.5).setScale(0).setDepth(30).setAlpha(0.9);

    // Slam in
    this.scene.tweens.add({
      targets: txt,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: txt,
          scaleX: 1,
          scaleY: 1,
          alpha: 0,
          y: cy - 40 * PX,
          duration: 600,
          delay: 400,
          ease: 'Sine.easeOut',
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  destroy() {
    eventBus.off(Events.SCORE_CHANGED, this._onScoreChanged);
    eventBus.off(Events.SPECTACLE_COMBO, this._onSpectacleCombo);
    eventBus.off(Events.SPECTACLE_STREAK, this._onSpectacleStreak);
    eventBus.off(Events.COMBO_BREAK, this._onComboBreak);
    eventBus.off(Events.SPECTACLE_NEAR_MISS, this._onSpectacleNearMiss);
    eventBus.off(Events.SPECTACLE_ENTRANCE, this._onSpectacleEntrance);

    if (this.comboText) this.comboText.destroy();
    if (this.comboGlow) this.comboGlow.destroy();

    this.activeTexts.forEach(t => {
      if (t && t.scene) t.destroy();
    });
    this.activeTexts = [];
  }
}
