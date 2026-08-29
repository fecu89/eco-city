import Phaser from 'phaser';
import { GAME, CHARACTER, MOG, COLORS, PX, UI } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { Character } from '../entities/Character.js';
import { initExpressionSystem } from '../systems/ExpressionSystem.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    gameState.reset();
    this.cursorDirection = 1;
    this.cursorPos = 0; // -1 to 1 range (center = 0)
    this.cursorSpeed = MOG.CURSOR_SPEED_START;
    this.canMog = true;
    this.mogActive = false;
    this.roundMogs = 0;
    this.screenShaking = false;

    this.createBackground();
    this.createCharacters();
    this.createTimingBar();
    this.createMogMeter();
    this.createInstructions();
    this.setupInput();

    // Wire expression system (maps mog events → face changes)
    initExpressionSystem();

    // Start playing
    gameState.started = true;
    eventBus.emit(Events.GAME_START);
  }

  createBackground() {
    // Gradient sky
    const gfx = this.add.graphics();
    gfx.fillGradientStyle(COLORS.SKY_TOP, COLORS.SKY_TOP, COLORS.SKY_BOTTOM, COLORS.SKY_BOTTOM, 1);
    gfx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT * 0.75);

    // Optional wallpaper overlay for thematic depth
    if (this.textures.exists('bg-wallpaper')) {
      const wp = this.add.image(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.5, 'bg-wallpaper');
      wp.setDisplaySize(GAME.WIDTH, GAME.HEIGHT);
      wp.setAlpha(0.12);
    }

    // Ground
    gfx.fillStyle(COLORS.GROUND);
    gfx.fillRect(0, GAME.HEIGHT * 0.75, GAME.WIDTH, GAME.HEIGHT * 0.25);
    gfx.fillStyle(COLORS.GROUND_DARK);
    gfx.fillRect(0, GAME.HEIGHT * 0.75, GAME.WIDTH, GAME.HEIGHT * 0.01);

    // Stage / platform
    gfx.fillStyle(0x444444);
    gfx.fillRect(GAME.WIDTH * 0.1, GAME.HEIGHT * 0.78, GAME.WIDTH * 0.8, GAME.HEIGHT * 0.04);
    gfx.fillStyle(0x555555);
    gfx.fillRect(GAME.WIDTH * 0.1, GAME.HEIGHT * 0.78, GAME.WIDTH * 0.8, GAME.HEIGHT * 0.01);

    // "VS" text in background
    this.add.text(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.45, 'VS', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * 0.15)}px`,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4 * PX,
    }).setOrigin(0.5).setAlpha(0.08);

    // Spotlights
    const spotlight = this.add.graphics();
    spotlight.fillStyle(0xffffff, 0.03);
    spotlight.fillTriangle(
      GAME.WIDTH * 0.3, 0,
      GAME.WIDTH * 0.15, GAME.HEIGHT * 0.78,
      GAME.WIDTH * 0.45, GAME.HEIGHT * 0.78
    );
    spotlight.fillTriangle(
      GAME.WIDTH * 0.7, 0,
      GAME.WIDTH * 0.55, GAME.HEIGHT * 0.78,
      GAME.WIDTH * 0.85, GAME.HEIGHT * 0.78
    );
  }

  createCharacters() {
    this.trump = new Character(this, CHARACTER.TRUMP_X, CHARACTER.TRUMP_Y, 'trump');
    this.biden = new Character(this, CHARACTER.BIDEN_X, CHARACTER.BIDEN_Y, 'biden');

    // Name labels
    this.add.text(CHARACTER.TRUMP_X, CHARACTER.TRUMP_Y + CHARACTER.BODY_HEIGHT * 0.7, 'TRUMP', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.SMALL_RATIO)}px`,
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 2 * PX,
    }).setOrigin(0.5);

    this.add.text(CHARACTER.BIDEN_X, CHARACTER.BIDEN_Y + CHARACTER.BODY_HEIGHT * 0.7, 'BIDEN', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.SMALL_RATIO)}px`,
      color: '#4488ff',
      stroke: '#000000',
      strokeThickness: 2 * PX,
    }).setOrigin(0.5);
  }

  createTimingBar() {
    const barX = MOG.BAR_X - MOG.BAR_WIDTH / 2;
    const barY = MOG.BAR_Y - MOG.BAR_HEIGHT / 2;

    // Bar background
    this.timingBarBg = this.add.rectangle(MOG.BAR_X, MOG.BAR_Y, MOG.BAR_WIDTH, MOG.BAR_HEIGHT, MOG.BAR_BG)
      .setStrokeStyle(2 * PX, 0x666666);

    // Sweet spot zone (center)
    const sweetW = MOG.BAR_WIDTH * MOG.SWEET_SPOT_RATIO;
    this.sweetSpot = this.add.rectangle(MOG.BAR_X, MOG.BAR_Y, sweetW, MOG.BAR_HEIGHT, MOG.BAR_PERFECT, 0.3);

    // Good zone (wider)
    const goodW = MOG.BAR_WIDTH * 0.35;
    this.goodZone = this.add.rectangle(MOG.BAR_X, MOG.BAR_Y, goodW, MOG.BAR_HEIGHT, MOG.BAR_FILL, 0.15);
    this.goodZone.setDepth(-1);

    // Cursor
    this.timingCursor = this.add.rectangle(
      MOG.BAR_X, MOG.BAR_Y,
      MOG.CURSOR_WIDTH, MOG.BAR_HEIGHT * 1.4,
      MOG.CURSOR_COLOR
    );

    // Label
    this.add.text(MOG.BAR_X, MOG.BAR_Y - MOG.BAR_HEIGHT * 1.5, 'TIMING', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.SMALL_RATIO)}px`,
      color: COLORS.UI_TEXT,
      stroke: COLORS.UI_SHADOW,
      strokeThickness: 2 * PX,
    }).setOrigin(0.5);
  }

  createMogMeter() {
    // Meter background
    this.mogMeterBg = this.add.rectangle(MOG.METER_X, MOG.METER_Y, MOG.METER_WIDTH, MOG.METER_HEIGHT, MOG.METER_BG)
      .setStrokeStyle(2 * PX, MOG.METER_BORDER);

    // Meter fill
    this.mogMeterFill = this.add.rectangle(
      MOG.METER_X - MOG.METER_WIDTH / 2, MOG.METER_Y,
      0, MOG.METER_HEIGHT, MOG.METER_FILL
    ).setOrigin(0, 0.5);

    // Label
    this.mogMeterLabel = this.add.text(MOG.METER_X, MOG.METER_Y - MOG.METER_HEIGHT * 1.8, 'MOG POWER', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.SMALL_RATIO)}px`,
      color: COLORS.COMBO_TEXT,
      stroke: COLORS.UI_SHADOW,
      strokeThickness: 2 * PX,
    }).setOrigin(0.5);

    // Percentage text
    this.mogPercentText = this.add.text(MOG.METER_X + MOG.METER_WIDTH / 2 + 10 * PX, MOG.METER_Y, '0%', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.SMALL_RATIO)}px`,
      color: COLORS.UI_TEXT,
    }).setOrigin(0, 0.5);
  }

  createInstructions() {
    this.instructionText = this.add.text(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.92, 'PRESS SPACE TO MOG', {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.BODY_RATIO)}px`,
      color: COLORS.TITLE_GOLD,
      stroke: COLORS.UI_SHADOW,
      strokeThickness: 3 * PX,
    }).setOrigin(0.5);

    // Pulse the instruction
    this.tweens.add({
      targets: this.instructionText,
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  setupInput() {
    this.input.keyboard.on('keydown-SPACE', () => this.attemptMog());
    this.input.on('pointerdown', () => this.attemptMog());
  }

  attemptMog() {
    if (!this.canMog || gameState.gameOver) return;

    this.canMog = false;
    eventBus.emit(Events.MOG_ATTEMPT);
    gameState.mogCount++;

    // Determine accuracy based on cursor position
    const absPos = Math.abs(this.cursorPos);
    let result;
    let points;
    let mogPower;

    if (absPos <= MOG.SWEET_SPOT_RATIO / 2) {
      // Perfect!
      result = 'PERFECT MOG!';
      points = MOG.PERFECT_MOG_POINTS;
      mogPower = 150;
      gameState.perfectCount++;
      gameState.combo++;
      eventBus.emit(Events.MOG_PERFECT);
      this.flashScreen(0xffd700, 0.3);
      this.showResultText(result, COLORS.TITLE_GOLD);
    } else if (absPos <= 0.35 / 2) {
      // Good
      result = 'MOGGED!';
      points = MOG.GOOD_MOG_POINTS;
      mogPower = 80;
      gameState.goodCount++;
      gameState.combo++;
      eventBus.emit(Events.MOG_GOOD);
      this.showResultText(result, COLORS.SCORE_TEXT);
    } else {
      // Miss
      result = 'WEAK...';
      points = MOG.MISS_POINTS;
      mogPower = 10;
      gameState.missCount++;
      gameState.combo = 0;
      eventBus.emit(Events.MOG_MISS);
      this.showResultText(result, '#888888');
    }

    // Combo bonus
    if (gameState.combo > gameState.maxCombo) {
      gameState.maxCombo = gameState.combo;
    }
    const comboMultiplier = Math.min(1 + gameState.combo * 0.2, 3.0);
    points = Math.round(points * comboMultiplier);
    mogPower = Math.round(mogPower * comboMultiplier);

    // Apply score and meter
    gameState.addScore(points);
    gameState.addMogPower(mogPower);
    eventBus.emit(Events.SCORE_CHANGED, { score: gameState.score });

    // Animate characters
    this.trump.mogPose(600);
    this.biden.cowerPose(600);

    // Scale characters
    gameState.trumpScale = Math.min(gameState.trumpScale + MOG.TRUMP_GROW * (mogPower / 80), MOG.MAX_TRUMP_SCALE);
    gameState.bidenScale = Math.max(gameState.bidenScale - MOG.BIDEN_SHRINK * (mogPower / 80), MOG.MIN_BIDEN_SCALE);

    this.tweens.add({
      targets: this.trump.container,
      scaleX: gameState.trumpScale,
      scaleY: gameState.trumpScale,
      duration: 300,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: this.biden.container,
      scaleX: gameState.bidenScale,
      scaleY: gameState.bidenScale,
      duration: 300,
      ease: 'Back.easeOut',
    });

    // Update mog meter visual
    this.updateMogMeter();

    // Screen shake on perfect
    if (absPos <= MOG.SWEET_SPOT_RATIO / 2) {
      this.shakeScreen(4 * PX, 200);
    }

    // Speed up cursor each mog
    this.cursorSpeed += MOG.CURSOR_SPEED_INCREMENT;

    // Check win condition
    if (gameState.isMogMeterFull()) {
      this.time.delayedCall(500, () => this.triggerWin());
      return;
    }

    // Cooldown
    this.time.delayedCall(400, () => {
      this.canMog = true;
    });
  }

  showResultText(text, color) {
    const resultText = this.add.text(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.55, text, {
      fontFamily: UI.FONT,
      fontSize: `${Math.round(GAME.HEIGHT * UI.HEADING_RATIO)}px`,
      color: color,
      stroke: COLORS.UI_SHADOW,
      strokeThickness: 4 * PX,
    }).setOrigin(0.5);

    // Combo text
    if (gameState.combo > 1) {
      const comboText = this.add.text(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.6, `${gameState.combo}x COMBO`, {
        fontFamily: UI.FONT,
        fontSize: `${Math.round(GAME.HEIGHT * UI.SMALL_RATIO * 1.2)}px`,
        color: COLORS.COMBO_TEXT,
        stroke: COLORS.UI_SHADOW,
        strokeThickness: 2 * PX,
      }).setOrigin(0.5);

      this.tweens.add({
        targets: comboText,
        y: GAME.HEIGHT * 0.55,
        alpha: 0,
        scaleX: 1.5,
        scaleY: 1.5,
        duration: 800,
        onComplete: () => comboText.destroy(),
      });
    }

    this.tweens.add({
      targets: resultText,
      y: GAME.HEIGHT * 0.48,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 600,
      onComplete: () => resultText.destroy(),
    });
  }

  updateMogMeter() {
    const ratio = gameState.mogMeter / MOG.METER_MAX;
    this.tweens.add({
      targets: this.mogMeterFill,
      width: MOG.METER_WIDTH * ratio,
      duration: 200,
      ease: 'Cubic.easeOut',
    });
    this.mogPercentText.setText(`${Math.round(ratio * 100)}%`);

    // Change color as it fills
    if (ratio > 0.8) {
      this.mogMeterFill.setFillStyle(0xff0000);
    } else if (ratio > 0.5) {
      this.mogMeterFill.setFillStyle(0xff6600);
    }
  }

  flashScreen(color, alpha) {
    const flash = this.add.rectangle(GAME.WIDTH / 2, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, color, alpha);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });
  }

  shakeScreen(intensity, duration) {
    if (this.screenShaking) return;
    this.screenShaking = true;
    this.cameras.main.shake(duration, intensity / GAME.WIDTH);
    this.time.delayedCall(duration, () => { this.screenShaking = false; });
  }

  triggerWin() {
    gameState.gameOver = true;
    this.canMog = false;
    eventBus.emit(Events.MOG_METER_FULL);

    // Epic flash
    this.flashScreen(0xffd700, 0.6);
    this.shakeScreen(8 * PX, 500);

    // Trump victory scale
    this.tweens.add({
      targets: this.trump.container,
      scaleX: MOG.MAX_TRUMP_SCALE,
      scaleY: MOG.MAX_TRUMP_SCALE,
      duration: 800,
      ease: 'Back.easeOut',
    });

    // Biden shrink away
    this.tweens.add({
      targets: this.biden.container,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0.3,
      duration: 800,
      ease: 'Cubic.easeIn',
    });

    // Victory text
    this.time.delayedCall(600, () => {
      const winText = this.add.text(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.4, 'TOTAL MOG', {
        fontFamily: UI.FONT,
        fontSize: `${Math.round(GAME.HEIGHT * UI.TITLE_RATIO)}px`,
        color: COLORS.TITLE_GOLD,
        stroke: COLORS.UI_SHADOW,
        strokeThickness: 5 * PX,
      }).setOrigin(0.5).setScale(0);

      this.tweens.add({
        targets: winText,
        scaleX: 1,
        scaleY: 1,
        duration: 500,
        ease: 'Back.easeOut',
      });

      // Show final stats
      this.time.delayedCall(1000, () => {
        this.showFinalStats();
      });
    });

    // Hide timing bar
    this.tweens.add({
      targets: [this.timingBarBg, this.sweetSpot, this.goodZone, this.timingCursor],
      alpha: 0,
      duration: 400,
    });

    eventBus.emit(Events.GAME_OVER);
  }

  showFinalStats() {
    const stats = [
      `SCORE: ${gameState.score}`,
      `PERFECTS: ${gameState.perfectCount}`,
      `MAX COMBO: ${gameState.maxCombo}x`,
    ];

    stats.forEach((text, i) => {
      const t = this.add.text(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.52 + i * GAME.HEIGHT * 0.06, text, {
        fontFamily: UI.FONT,
        fontSize: `${Math.round(GAME.HEIGHT * UI.BODY_RATIO)}px`,
        color: COLORS.UI_TEXT,
        stroke: COLORS.UI_SHADOW,
        strokeThickness: 2 * PX,
      }).setOrigin(0.5).setAlpha(0);

      this.tweens.add({
        targets: t,
        alpha: 1,
        y: t.y - 10 * PX,
        duration: 400,
        delay: i * 200,
      });
    });

    // Restart prompt
    this.time.delayedCall(1200, () => {
      const restartText = this.add.text(GAME.WIDTH * 0.5, GAME.HEIGHT * 0.82, 'PRESS SPACE TO MOG AGAIN', {
        fontFamily: UI.FONT,
        fontSize: `${Math.round(GAME.HEIGHT * UI.SMALL_RATIO)}px`,
        color: COLORS.TITLE_GOLD,
        stroke: COLORS.UI_SHADOW,
        strokeThickness: 2 * PX,
      }).setOrigin(0.5);

      this.tweens.add({
        targets: restartText,
        alpha: 0.3,
        duration: 600,
        yoyo: true,
        repeat: -1,
      });

      // Allow restart
      this.input.keyboard.once('keydown-SPACE', () => this.restart());
      this.input.once('pointerdown', () => this.restart());
    });
  }

  restart() {
    eventBus.emit(Events.GAME_RESTART);
    this.trump.destroy();
    this.biden.destroy();
    this.scene.restart();
  }

  update(time, delta) {
    if (gameState.gameOver) return;

    // Move timing cursor
    const dt = delta / 1000;
    this.cursorPos += this.cursorDirection * (this.cursorSpeed / MOG.BAR_WIDTH) * dt * 2;

    if (this.cursorPos >= 1) {
      this.cursorPos = 1;
      this.cursorDirection = -1;
    } else if (this.cursorPos <= -1) {
      this.cursorPos = -1;
      this.cursorDirection = 1;
    }

    // Update cursor visual
    this.timingCursor.x = MOG.BAR_X + this.cursorPos * (MOG.BAR_WIDTH / 2);

  }
}
