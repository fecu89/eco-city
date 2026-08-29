import Phaser from 'phaser';
import { GAME, UI, COLORS, PX } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    // Score display
    this.scoreText = this.add.text(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.04, '0', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.HEADING_RATIO)}px`,
      color: COLORS.TITLE_GOLD,
      stroke: COLORS.UI_SHADOW,
      strokeThickness: 3 * PX,
    }).setOrigin(0.5, 0);

    // Combo display
    this.comboText = this.add.text(GAME.WIDTH * 0.9, GAME.HEIGHT * 0.04, '', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.BODY_RATIO)}px`,
      color: COLORS.COMBO_TEXT,
      stroke: COLORS.UI_SHADOW,
      strokeThickness: 2 * PX,
    }).setOrigin(0.5, 0).setAlpha(0);

    // Listen for events
    eventBus.on(Events.SCORE_CHANGED, () => this.updateScore());
    eventBus.on(Events.MOG_PERFECT, () => this.showCombo());
    eventBus.on(Events.MOG_GOOD, () => this.showCombo());
    eventBus.on(Events.MOG_MISS, () => this.hideCombo());
    eventBus.on(Events.GAME_RESTART, () => this.resetUI());
  }

  updateScore() {
    this.scoreText.setText(gameState.score.toString());

    // Juice: scale pop
    this.tweens.add({
      targets: this.scoreText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 100,
      yoyo: true,
    });
  }

  showCombo() {
    if (gameState.combo > 1) {
      this.comboText.setText(`${gameState.combo}x`);
      this.comboText.setAlpha(1);
      this.tweens.add({
        targets: this.comboText,
        scaleX: 1.4,
        scaleY: 1.4,
        duration: 100,
        yoyo: true,
      });
    }
  }

  hideCombo() {
    this.tweens.add({
      targets: this.comboText,
      alpha: 0,
      duration: 200,
    });
  }

  resetUI() {
    this.scoreText.setText('0');
    this.comboText.setText('').setAlpha(0);
  }
}
