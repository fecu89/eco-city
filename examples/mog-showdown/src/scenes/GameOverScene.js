import Phaser from 'phaser';
import { GAME, COLORS, UI, TRANSITION, SAFE_ZONE, PX, EFFECTS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create() {
    const w = GAME.WIDTH;
    const h = GAME.HEIGHT;
    const cx = w / 2;

    this._transitioning = false;
    this._ambientParticles = [];

    // Usable area below Play.fun widget bar
    const safeTop = SAFE_ZONE.TOP;
    const usableH = h - safeTop;

    // --- Screen flash on entry ---
    this.cameras.main.flash(EFFECTS.GAMEOVER_FLASH_DURATION, 255, 255, 255);

    // --- Gradient background ---
    this.drawGradient(w, h, COLORS.BG_TOP, COLORS.BG_BOTTOM);

    // --- Ambient floating particles in background ---
    this.initAmbientParticles();

    // --- Mog result text (with glow + scale animation) ---
    const mogged = gameState.score > 20;
    const resultText = mogged ? 'YOU MOGGED HIM!' : 'YOU GOT MOGGED!';
    const resultColor = mogged ? '#FFD700' : '#FF3366';
    const resultGlowColor = mogged ? 'rgba(255,215,0,0.6)' : 'rgba(255,51,102,0.6)';

    const resultSize = Math.round(h * UI.TITLE_RATIO * 0.85);
    const resultY = safeTop + usableH * 0.08;

    // Glow layer (additive blend, behind main text)
    const resultGlow = this.add.text(cx, resultY, resultText, {
      fontSize: resultSize + 'px',
      fontFamily: UI.FONT,
      color: resultColor,
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: resultGlowColor, blur: 25, fill: true },
    }).setOrigin(0.5).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

    // Main result text
    const resultMain = this.add.text(cx, resultY, resultText, {
      fontSize: resultSize + 'px',
      fontFamily: UI.FONT,
      color: resultColor,
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 3, color: 'rgba(0,0,0,0.6)', blur: 8, fill: true },
    }).setOrigin(0.5).setScale(0);

    // Dramatic scale-in for result text
    this.tweens.add({
      targets: resultMain,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 350,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: resultMain,
          scaleX: 1,
          scaleY: 1,
          duration: 200,
          ease: 'Sine.easeOut',
        });
      },
    });

    // Glow pulse animation
    this.tweens.add({
      targets: resultGlow,
      alpha: EFFECTS.GAMEOVER_TITLE_GLOW_ALPHA,
      duration: 400,
      delay: 100,
      ease: 'Sine.easeOut',
    });

    // Continuous glow pulse
    this.tweens.add({
      targets: resultGlow,
      alpha: { from: EFFECTS.GAMEOVER_TITLE_GLOW_ALPHA * 0.4, to: EFFECTS.GAMEOVER_TITLE_GLOW_ALPHA },
      duration: 800,
      yoyo: true,
      repeat: -1,
      delay: 600,
      ease: 'Sine.easeInOut',
    });

    // --- "GAME OVER" title ---
    const titleSize = Math.round(h * UI.TITLE_RATIO);
    const gameOverText = this.add.text(cx, safeTop + usableH * 0.18, 'GAME OVER', {
      fontSize: titleSize + 'px',
      fontFamily: UI.FONT,
      color: COLORS.UI_TEXT,
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 3, color: 'rgba(0,0,0,0.5)', blur: 8, fill: true },
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: gameOverText,
      alpha: 1,
      duration: 400,
      delay: 200,
    });

    // --- Score panel (with enhanced scale-in) ---
    const panelW = w * 0.65;
    const panelH = h * 0.30;
    const panelY = safeTop + usableH * 0.40;

    const panelContainer = this.add.container(cx, panelY);
    panelContainer.setScale(0);

    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.35);
    panel.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
    panel.lineStyle(2, 0x6c63ff, 0.6);
    panel.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
    panelContainer.add(panel);

    // Panel glow border
    const panelGlow = this.add.graphics();
    panelGlow.lineStyle(4, 0x6c63ff, 0.2);
    panelGlow.strokeRoundedRect(-panelW / 2 - 2, -panelH / 2 - 2, panelW + 4, panelH + 4, 18);
    panelContainer.add(panelGlow);

    // Score label
    const labelSize = Math.round(h * UI.SMALL_RATIO);
    const scoreLabel = this.add.text(0, -panelH * 0.32, 'SCORE', {
      fontSize: labelSize + 'px',
      fontFamily: UI.FONT,
      color: COLORS.MUTED_TEXT,
      letterSpacing: 4,
    }).setOrigin(0.5);
    panelContainer.add(scoreLabel);

    // Score value (large, gold)
    const scoreSize = Math.round(h * UI.HEADING_RATIO * 1.2);
    const scoreText = this.add.text(0, -panelH * 0.12, `${gameState.score}`, {
      fontSize: scoreSize + 'px',
      fontFamily: UI.FONT,
      color: COLORS.SCORE_GOLD,
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: 'rgba(255,215,0,0.4)', blur: 12, fill: true },
    }).setOrigin(0.5);
    panelContainer.add(scoreText);

    // Best score
    const bestSize = Math.round(h * UI.SMALL_RATIO);
    const bestText = this.add.text(0, panelH * 0.08, `Best: ${gameState.bestScore}`, {
      fontSize: bestSize + 'px',
      fontFamily: UI.FONT,
      color: COLORS.MUTED_TEXT,
    }).setOrigin(0.5);
    panelContainer.add(bestText);

    // Mog Level reached
    const mogText = this.add.text(0, panelH * 0.22, `Mog Level: ${gameState.mogLevel}`, {
      fontSize: bestSize + 'px',
      fontFamily: UI.FONT,
      color: '#FFD700',
    }).setOrigin(0.5);
    panelContainer.add(mogText);

    // Best combo
    if (gameState.bestCombo > 1) {
      const comboText = this.add.text(0, panelH * 0.36, `Best Combo: ${gameState.bestCombo}x`, {
        fontSize: bestSize + 'px',
        fontFamily: UI.FONT,
        color: '#FF69B4',
      }).setOrigin(0.5);
      panelContainer.add(comboText);
    }

    // Animate panel scale-in with bounce
    this.tweens.add({
      targets: panelContainer,
      scaleX: 1,
      scaleY: 1,
      duration: EFFECTS.GAMEOVER_PANEL_SCALE_DURATION,
      delay: 300,
      ease: 'Back.easeOut',
    });

    // --- Play Again button ---
    this.createButton(cx, safeTop + usableH * 0.68, 'PLAY AGAIN', () => this.restartGame());

    // --- Keyboard shortcut ---
    this.input.keyboard.once('keydown-SPACE', () => this.restartGame());

    // --- Fade in ---
    this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);
  }

  // --- Ambient floating particles for game over screen ---
  initAmbientParticles() {
    const colors = [COLORS.NEON_GOLD, COLORS.NEON_BLUE, COLORS.NEON_PURPLE, COLORS.NEON_PINK];

    for (let i = 0; i < EFFECTS.GAMEOVER_AMBIENT_COUNT; i++) {
      const x = Phaser.Math.Between(0, GAME.WIDTH);
      const y = Phaser.Math.Between(0, GAME.HEIGHT);
      const size = Phaser.Math.FloatBetween(1.5 * PX, 4 * PX);
      const color = colors[i % colors.length];
      const alpha = Phaser.Math.FloatBetween(0.15, 0.35);

      const gfx = this.add.graphics();
      gfx.fillStyle(color, alpha);
      gfx.fillCircle(0, 0, size);
      gfx.setPosition(x, y);
      gfx.setBlendMode(Phaser.BlendModes.ADD);

      // Float upward with gentle drift
      const duration = Phaser.Math.Between(4000, 8000);
      this.tweens.add({
        targets: gfx,
        y: -20,
        x: x + Phaser.Math.Between(-80 * PX, 80 * PX),
        alpha: 0,
        duration: duration,
        delay: Phaser.Math.Between(0, 2000),
        onComplete: () => {
          // Respawn at bottom
          gfx.setPosition(Phaser.Math.Between(0, GAME.WIDTH), GAME.HEIGHT + 20);
          gfx.setAlpha(alpha);
          this.tweens.add({
            targets: gfx,
            y: -20,
            x: gfx.x + Phaser.Math.Between(-80 * PX, 80 * PX),
            alpha: 0,
            duration: duration,
            repeat: -1,
          });
        },
      });

      this._ambientParticles.push(gfx);
    }
  }

  restartGame() {
    if (this._transitioning) return;
    this._transitioning = true;

    eventBus.emit(Events.GAME_RESTART);
    this.cameras.main.fadeOut(TRANSITION.FADE_DURATION, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });
  }

  // --- Helpers ---

  drawGradient(w, h, topColor, bottomColor) {
    const bg = this.add.graphics();
    const top = Phaser.Display.Color.IntegerToColor(topColor);
    const bot = Phaser.Display.Color.IntegerToColor(bottomColor);
    const steps = 64;
    const bandH = Math.ceil(h / steps);

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(top.red + (bot.red - top.red) * t);
      const g = Math.round(top.green + (bot.green - top.green) * t);
      const b = Math.round(top.blue + (bot.blue - top.blue) * t);
      bg.fillStyle(Phaser.Display.Color.GetColor(r, g, b));
      bg.fillRect(0, i * bandH, w, bandH + 1);
    }
  }

  createButton(x, y, label, callback) {
    const btnW = Math.max(GAME.WIDTH * UI.BTN_W_RATIO, 160);
    const btnH = Math.max(GAME.HEIGHT * UI.BTN_H_RATIO, UI.MIN_TOUCH);
    const radius = UI.BTN_RADIUS;

    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    this.fillBtn(bg, btnW, btnH, radius, COLORS.BTN_PRIMARY);
    container.add(bg);

    const fontSize = Math.round(GAME.HEIGHT * UI.BODY_RATIO);
    const text = this.add.text(0, 0, label, {
      fontSize: fontSize + 'px',
      fontFamily: UI.FONT,
      color: COLORS.BTN_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add(text);

    container.setSize(btnW, btnH);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      this.fillBtn(bg, btnW, btnH, radius, COLORS.BTN_PRIMARY_HOVER);
      this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 80 });
    });

    container.on('pointerout', () => {
      this.fillBtn(bg, btnW, btnH, radius, COLORS.BTN_PRIMARY);
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 80 });
    });

    container.on('pointerdown', () => {
      this.fillBtn(bg, btnW, btnH, radius, COLORS.BTN_PRIMARY_PRESS);
      container.setScale(0.95);
    });

    container.on('pointerup', () => {
      container.setScale(1);
      callback();
    });

    return container;
  }

  fillBtn(gfx, w, h, radius, color) {
    gfx.clear();
    gfx.fillStyle(color, 1);
    gfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  }
}
