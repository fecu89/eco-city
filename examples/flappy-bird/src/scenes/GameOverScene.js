import Phaser from 'phaser';
import { GAME, COLORS, TRANSITION, UI, PX } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create() {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    this.cameras.main.setBackgroundColor(COLORS.GAMEOVER_BG);
    this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);

    eventBus.emit(Events.MUSIC_GAMEOVER);

    // Game Over title
    const titleFontSize = Math.round(GAME.HEIGHT * UI.TITLE_RATIO);
    const title = this.add.text(cx, cy - GAME.HEIGHT * 0.233, 'GAME OVER', {
      fontSize: `${titleFontSize}px`,
      fontFamily: UI.FONT,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: UI.STROKE,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Slide in from top
    title.setAlpha(0);
    title.y -= 30 * PX;
    this.tweens.add({
      targets: title,
      alpha: 1,
      y: title.y + 30 * PX,
      duration: 400,
      ease: 'Back.easeOut',
    });

    // Score panel
    const panelW = GAME.WIDTH * UI.PANEL_W_RATIO;
    const panelH = GAME.HEIGHT * UI.PANEL_H_RATIO;
    const panelY = cy - GAME.HEIGHT * 0.033;

    // Panel background
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.PANEL_BG, 1);
    panel.fillRoundedRect(cx - panelW / 2, panelY - panelH / 2, panelW, panelH, UI.BTN_RADIUS);
    panel.lineStyle(UI.PANEL_BORDER, COLORS.PANEL_BORDER, 1);
    panel.strokeRoundedRect(cx - panelW / 2, panelY - panelH / 2, panelW, panelH, UI.BTN_RADIUS);

    // Score label
    const labelFontSize = Math.round(GAME.HEIGHT * UI.SMALL_RATIO);
    const valueFontSize = Math.round(GAME.HEIGHT * UI.BODY_RATIO);
    const labelX = cx - panelW * 0.375;

    this.add.text(labelX, panelY - panelH * 0.25, 'Score', {
      fontSize: `${labelFontSize}px`,
      fontFamily: 'Arial, sans-serif',
      color: '#5a3e00',
    });

    this.add.text(cx + panelW * 0.375, panelY - panelH * 0.25, `${gameState.score}`, {
      fontSize: `${valueFontSize}px`,
      fontFamily: UI.FONT,
      color: '#5a3e00',
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    // Best label
    this.add.text(labelX, panelY + panelH * 0.07, 'Best', {
      fontSize: `${labelFontSize}px`,
      fontFamily: 'Arial, sans-serif',
      color: '#5a3e00',
    });

    this.add.text(cx + panelW * 0.375, panelY + panelH * 0.07, `${gameState.bestScore}`, {
      fontSize: `${valueFontSize}px`,
      fontFamily: UI.FONT,
      color: '#5a3e00',
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    // Medal
    if (gameState.score >= 5) {
      const medalColor = gameState.score >= 20 ? COLORS.MEDAL_GOLD :
                          gameState.score >= 10 ? COLORS.MEDAL_SILVER :
                          COLORS.MEDAL_BRONZE;
      this.add.circle(cx - panelW * 0.25, panelY + panelH * 0.04, UI.MEDAL_RADIUS, medalColor, 1);
      this.add.text(cx - panelW * 0.25, panelY + panelH * 0.04, gameState.score >= 20 ? 'G' : gameState.score >= 10 ? 'S' : 'B', {
        fontSize: `${Math.round(GAME.HEIGHT * UI.CAPTION_RATIO)}px`,
        fontFamily: UI.FONT,
        color: '#5a3e00',
        fontStyle: 'bold',
      }).setOrigin(0.5);
    }

    // Restart button
    const btnW = GAME.WIDTH * UI.BTN_W_RATIO;
    const btnH = GAME.HEIGHT * UI.BTN_H_RATIO;
    const btnY = cy + GAME.HEIGHT * 0.133;
    const btn = this.add.rectangle(cx, btnY, btnW, btnH, COLORS.BUTTON, 1)
      .setInteractive({ useHandCursor: true });

    const btnText = this.add.text(cx, btnY, 'RESTART', {
      fontSize: `${Math.round(GAME.HEIGHT * UI.BODY_RATIO)}px`,
      fontFamily: UI.FONT,
      color: COLORS.BUTTON_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Button hover
    btn.on('pointerover', () => {
      btn.setFillStyle(COLORS.BUTTON_HOVER);
      this.tweens.add({ targets: [btn, btnText], scaleX: 1.05, scaleY: 1.05, duration: 80 });
    });
    btn.on('pointerout', () => {
      btn.setFillStyle(COLORS.BUTTON);
      this.tweens.add({ targets: [btn, btnText], scaleX: 1, scaleY: 1, duration: 80 });
    });
    btn.on('pointerdown', () => this.restartGame());

    // Space to restart
    this.input.keyboard.once('keydown-SPACE', () => this.restartGame());
  }

  restartGame() {
    eventBus.emit(Events.MUSIC_STOP);
    eventBus.emit(Events.GAME_RESTART);
    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }
}
