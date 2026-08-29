import Phaser from 'phaser';
import {
  GAME, CLAVICULAR, ANDROGENIC, COLORS, PX, TRANSITION,
  SAFE_ZONE, LIVES, MOG, PROJECTILE, EXPRESSION, EXPRESSION_HOLD_MS,
  EFFECTS, TOUCH,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { Clavicular } from '../entities/Clavicular.js';
import { Androgenic } from '../entities/Androgenic.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';
import { ParticleManager } from '../effects/ParticleManager.js';
import { ScreenEffects } from '../effects/ScreenEffects.js';
import { TextEffects } from '../effects/TextEffects.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    gameState.reset();

    // Touch capability detection (not OS-based — covers tablets, 2-in-1s, touch laptops)
    this.hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // --- Arena background ---
    this.drawArenaBackground();

    // --- Arena floor ---
    this.drawArenaFloor();

    // --- Androgenic (opponent at top) ---
    this.androgenic = new Androgenic(this);

    // --- Clavicular (player at bottom) ---
    this.player = new Clavicular(this);

    // --- Systems ---
    this.spawnSystem = new SpawnSystem(this, this.androgenic);
    this.scoreSystem = new ScoreSystem();

    // --- Effects systems (spectacle-first visual design) ---
    this.particleManager = new ParticleManager(this);
    this.screenEffects = new ScreenEffects(this);
    this.textEffects = new TextEffects(this);

    // --- HUD ---
    this.createHUD();

    // --- Keyboard input ---
    this.cursors = this.input.keyboard.createCursorKeys();

    // Touch input state — enabled on ALL devices (pointer events work for mouse too)
    this.touchLeft = false;
    this.touchRight = false;

    this.input.on('pointerdown', (pointer) => {
      if (pointer.x < GAME.WIDTH / 2) {
        this.touchLeft = true;
        this.touchRight = false;
      } else {
        this.touchRight = true;
        this.touchLeft = false;
      }
    });
    this.input.on('pointermove', (pointer) => {
      if (!pointer.isDown) return;
      if (pointer.x < GAME.WIDTH / 2) {
        this.touchLeft = true;
        this.touchRight = false;
      } else {
        this.touchRight = true;
        this.touchLeft = false;
      }
    });
    this.input.on('pointerup', () => {
      this.touchLeft = false;
      this.touchRight = false;
    });

    // Visible touch arrow buttons (shown on touch-capable devices)
    if (this.hasTouch) {
      this.createTouchControls();
    }

    // --- Event listeners ---
    this._onPlayerDied = () => this.triggerGameOver();
    this._onLifeLost = (data) => this.onLifeLost(data);
    this._onFrameMog = (data) => this.onFrameMog(data);

    eventBus.on(Events.PLAYER_DIED, this._onPlayerDied);
    eventBus.on(Events.LIFE_LOST, this._onLifeLost);
    eventBus.on(Events.MOG_FRAMEMOG, this._onFrameMog);

    // --- Expression event listeners ---
    // Clavicular expressions
    this._onPowerupExprClavicular = () => {
      this.player.setExpression(EXPRESSION.HAPPY);
    };
    this._onAttackExprClavicular = () => {
      this.player.setExpression(EXPRESSION.ANGRY);
    };
    this._onFrameMogExprClavicular = () => {
      this.player.setExpression(EXPRESSION.SURPRISED, 1000);
    };

    // Androgenic expressions
    this._onPowerupExprAndrogenic = () => {
      this.androgenic.setExpression(EXPRESSION.ANGRY);
    };
    this._onAttackExprAndrogenic = () => {
      this.androgenic.setExpression(EXPRESSION.HAPPY);
    };
    this._onFrameMogExprAndrogenic = () => {
      this.androgenic.setExpression(EXPRESSION.SURPRISED, 1000);
    };

    eventBus.on(Events.POWERUP_COLLECTED, this._onPowerupExprClavicular);
    eventBus.on(Events.ATTACK_HIT, this._onAttackExprClavicular);
    eventBus.on(Events.MOG_FRAMEMOG, this._onFrameMogExprClavicular);
    eventBus.on(Events.POWERUP_COLLECTED, this._onPowerupExprAndrogenic);
    eventBus.on(Events.ATTACK_HIT, this._onAttackExprAndrogenic);
    eventBus.on(Events.MOG_FRAMEMOG, this._onFrameMogExprAndrogenic);

    // --- Invulnerability after hit ---
    this.invulnerable = false;
    this.invulnerableTimer = 0;
    this.INVULNERABLE_DURATION = 1200; // ms

    // --- Frame mog active ---
    this.frameMogActive = false;

    // --- Entrance sequence ---
    this.playEntranceSequence();

    gameState.started = true;

    // --- Audio: start gameplay BGM (first play handled by main.js, restarts handled here) ---
    eventBus.emit(Events.GAME_START);
  }

  drawArenaBackground() {
    const bg = this.add.graphics();
    const top = Phaser.Display.Color.IntegerToColor(COLORS.ARENA_TOP);
    const bot = Phaser.Display.Color.IntegerToColor(COLORS.ARENA_BOTTOM);
    const steps = 64;
    const bandH = Math.ceil(GAME.HEIGHT / steps);

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(top.red + (bot.red - top.red) * t);
      const g = Math.round(top.green + (bot.green - top.green) * t);
      const b = Math.round(top.blue + (bot.blue - top.blue) * t);
      bg.fillStyle(Phaser.Display.Color.GetColor(r, g, b));
      bg.fillRect(0, i * bandH, GAME.WIDTH, bandH + 1);
    }

    // Neon grid lines on floor area
    const floorY = GAME.HEIGHT * 0.70;
    bg.lineStyle(1 * PX, COLORS.NEON_PURPLE, 0.15);
    for (let y = floorY; y < GAME.HEIGHT; y += 20 * PX) {
      bg.beginPath();
      bg.moveTo(0, y);
      bg.lineTo(GAME.WIDTH, y);
      bg.strokePath();
    }
    for (let x = 0; x < GAME.WIDTH; x += 40 * PX) {
      bg.beginPath();
      bg.moveTo(x, floorY);
      bg.lineTo(x, GAME.HEIGHT);
      bg.strokePath();
    }
  }

  drawArenaFloor() {
    const floorY = GAME.HEIGHT * 0.92;
    const floor = this.add.graphics();
    floor.fillStyle(COLORS.FLOOR, 1);
    floor.fillRect(0, floorY, GAME.WIDTH, GAME.HEIGHT - floorY);
    // Neon line at floor edge
    floor.lineStyle(2 * PX, COLORS.FLOOR_LINE, 0.6);
    floor.beginPath();
    floor.moveTo(0, floorY);
    floor.lineTo(GAME.WIDTH, floorY);
    floor.strokePath();

    // Animated neon glow line on floor (additive blend, subtle pulse)
    this.floorGlow = this.add.graphics();
    this.floorGlow.lineStyle(4 * PX, COLORS.FLOOR_LINE, 0.3);
    this.floorGlow.beginPath();
    this.floorGlow.moveTo(0, floorY);
    this.floorGlow.lineTo(GAME.WIDTH, floorY);
    this.floorGlow.strokePath();
    this.floorGlow.setBlendMode(Phaser.BlendModes.ADD);

    // Pulse the floor glow
    this.tweens.add({
      targets: this.floorGlow,
      alpha: { from: 0.2, to: 0.6 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  createTouchControls() {
    const size = TOUCH.BUTTON_SIZE;
    const r = size / 2;
    const y = GAME.HEIGHT - TOUCH.MARGIN_BOTTOM - r;

    // Left arrow button
    this.touchBtnLeft = this.add.graphics();
    const lx = TOUCH.MARGIN_X + r;
    this.touchBtnLeft.fillStyle(TOUCH.ARROW_COLOR, TOUCH.ALPHA_IDLE);
    this.touchBtnLeft.fillCircle(lx, y, r);
    // Left-pointing triangle
    this.touchBtnLeft.fillStyle(0x000000, 0.5);
    this.touchBtnLeft.fillTriangle(
      lx - r * 0.35, y,
      lx + r * 0.25, y - r * 0.4,
      lx + r * 0.25, y + r * 0.4
    );
    this.touchBtnLeft.setDepth(30);

    // Right arrow button
    this.touchBtnRight = this.add.graphics();
    const rx = GAME.WIDTH - TOUCH.MARGIN_X - r;
    this.touchBtnRight.fillStyle(TOUCH.ARROW_COLOR, TOUCH.ALPHA_IDLE);
    this.touchBtnRight.fillCircle(rx, y, r);
    // Right-pointing triangle
    this.touchBtnRight.fillStyle(0x000000, 0.5);
    this.touchBtnRight.fillTriangle(
      rx + r * 0.35, y,
      rx - r * 0.25, y - r * 0.4,
      rx - r * 0.25, y + r * 0.4
    );
    this.touchBtnRight.setDepth(30);
  }

  createHUD() {
    // --- Lives display (hearts) ---
    this.heartsGfx = this.add.graphics();
    this.drawHearts();

    // --- Mog Level bar (right side) ---
    this.mogBarBg = this.add.graphics();
    this.mogBarFill = this.add.graphics();
    this.drawMogBar();

    // --- Mog level label ---
    const mogLabelSize = Math.round(GAME.HEIGHT * 0.022);
    this.mogLabel = this.add.text(
      GAME.WIDTH - 20 * PX,
      SAFE_ZONE.TOP + 10 * PX,
      'MOG LV: 0',
      {
        fontSize: mogLabelSize + 'px',
        fontFamily: 'system-ui, sans-serif',
        color: COLORS.SCORE_GOLD,
        fontStyle: 'bold',
        shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.8)', blur: 4, fill: true },
      }
    ).setOrigin(1, 0);

    // --- Score display ---
    const scoreSize = Math.round(GAME.HEIGHT * 0.035);
    this.scoreText = this.add.text(
      GAME.WIDTH / 2,
      SAFE_ZONE.TOP + 8 * PX,
      '0',
      {
        fontSize: scoreSize + 'px',
        fontFamily: 'system-ui, sans-serif',
        color: COLORS.UI_TEXT,
        fontStyle: 'bold',
        shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.8)', blur: 4, fill: true },
      }
    ).setOrigin(0.5, 0);

    // Combo display is now handled by TextEffects (spectacle combo counter)
  }

  drawHearts() {
    this.heartsGfx.clear();
    const startX = 15 * PX;
    const y = SAFE_ZONE.TOP + 15 * PX;
    const size = LIVES.HEART_SIZE;
    const spacing = size * 2.2;

    for (let i = 0; i < LIVES.MAX; i++) {
      const x = startX + i * spacing;
      const color = i < gameState.lives ? LIVES.HEART_COLOR : LIVES.HEART_EMPTY;
      this.heartsGfx.fillStyle(color, 1);
      // Simple heart shape using two circles and a triangle
      this.heartsGfx.fillCircle(x - size * 0.3, y - size * 0.2, size * 0.45);
      this.heartsGfx.fillCircle(x + size * 0.3, y - size * 0.2, size * 0.45);
      this.heartsGfx.fillTriangle(
        x - size * 0.7, y - size * 0.05,
        x + size * 0.7, y - size * 0.05,
        x, y + size * 0.65
      );
    }
  }

  drawMogBar() {
    this.mogBarBg.clear();
    this.mogBarFill.clear();

    const barW = 12 * PX;
    const barH = GAME.HEIGHT * 0.25;
    const barX = GAME.WIDTH - 25 * PX;
    const barY = SAFE_ZONE.TOP + 40 * PX;

    // Background
    this.mogBarBg.fillStyle(COLORS.MOG_BAR_BG, 0.6);
    this.mogBarBg.fillRoundedRect(barX - barW / 2, barY, barW, barH, 4 * PX);
    this.mogBarBg.lineStyle(1 * PX, COLORS.NEON_GOLD, 0.4);
    this.mogBarBg.strokeRoundedRect(barX - barW / 2, barY, barW, barH, 4 * PX);

    // Fill (bottom-up)
    const progress = gameState.mogProgress / MOG.POWERUPS_TO_FILL;
    if (progress > 0) {
      const fillH = barH * progress;
      this.mogBarFill.fillStyle(COLORS.MOG_BAR_FILL, 0.9);
      this.mogBarFill.fillRoundedRect(
        barX - barW / 2 + 1 * PX,
        barY + barH - fillH,
        barW - 2 * PX,
        fillH,
        3 * PX
      );
    }
  }

  playEntranceSequence() {
    // Camera flash
    this.cameras.main.flash(300, 255, 255, 255);

    // Androgenic slides in from top
    const targetY = ANDROGENIC.Y;
    this.androgenic.sprite.y = -ANDROGENIC.HEIGHT;
    this.tweens.add({
      targets: this.androgenic.sprite,
      y: targetY,
      duration: 600,
      ease: 'Power2',
    });

    // Clavicular slams in from below with bounce
    const targetPlayerY = CLAVICULAR.START_Y;
    this.player.sprite.y = GAME.HEIGHT + CLAVICULAR.HEIGHT;
    this.tweens.add({
      targets: this.player.sprite,
      y: targetPlayerY,
      duration: EFFECTS.ENTRANCE_PLAYER_SLAM_DURATION,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        // Landing camera shake
        this.cameras.main.shake(
          EFFECTS.SHAKE_DURATION_MEDIUM,
          EFFECTS.ENTRANCE_PLAYER_SHAKE
        );
        eventBus.emit(Events.SPECTACLE_ENTRANCE, { entity: 'clavicular' });
      },
    });

    // Fade in
    this.cameras.main.fadeIn(TRANSITION.FADE_DURATION, 0, 0, 0);
  }

  update(time, delta) {
    if (gameState.gameOver) return;

    // Update invulnerability timer
    if (this.invulnerable) {
      this.invulnerableTimer -= delta;
      if (this.invulnerableTimer <= 0) {
        this.invulnerable = false;
        this.player.sprite.setAlpha(1);
      }
    }

    // --- Input ---
    const left = this.cursors.left.isDown || this.touchLeft;
    const right = this.cursors.right.isDown || this.touchRight;

    // --- Update entities ---
    this.player.update(left, right);
    this.androgenic.update(delta);
    this.spawnSystem.update(delta);

    // --- Collision detection ---
    this.checkCollisions();

    // --- Update effects ---
    this.particleManager.update(delta, this.player);

    // --- Update touch button feedback ---
    if (this.touchBtnLeft) {
      this.touchBtnLeft.setAlpha(this.touchLeft ? TOUCH.ALPHA_ACTIVE : TOUCH.ALPHA_IDLE);
    }
    if (this.touchBtnRight) {
      this.touchBtnRight.setAlpha(this.touchRight ? TOUCH.ALPHA_ACTIVE : TOUCH.ALPHA_IDLE);
    }

    // --- Update HUD ---
    this.updateHUD();
  }

  checkCollisions() {
    const projectiles = this.spawnSystem.getProjectiles();
    const playerBounds = this.getEntityBounds(this.player.sprite, CLAVICULAR.WIDTH * 0.7, CLAVICULAR.HEIGHT * 0.8);

    for (const proj of projectiles) {
      if (proj.collected) continue;

      const projW = proj.category === 'attack' ? PROJECTILE.ATTACK_WIDTH : PROJECTILE.POWERUP_WIDTH;
      const projH = proj.category === 'attack' ? PROJECTILE.ATTACK_HEIGHT : PROJECTILE.POWERUP_HEIGHT;
      const projBounds = this.getEntityBounds(proj.sprite, projW * 0.8, projH * 0.8);

      // AABB collision check
      if (this.aabb(playerBounds, projBounds)) {
        if (proj.category === 'powerup') {
          this.collectPowerup(proj);
        } else if (proj.category === 'attack' && !this.invulnerable) {
          this.hitByAttack(proj);
        }
      } else if (proj.category === 'attack' && !proj.collected) {
        // Near-miss detection
        const expanded = this.expandBounds(playerBounds, PROJECTILE.NEAR_MISS_THRESHOLD);
        if (this.aabb(expanded, projBounds) && proj.sprite.y > playerBounds.top) {
          // Only count near-misses for projectiles that have passed the player
          if (!proj._nearMissEmitted) {
            proj._nearMissEmitted = true;
            eventBus.emit(Events.SPECTACLE_NEAR_MISS, { type: proj.type });
          }
        }
      }
    }
  }

  getEntityBounds(sprite, w, h) {
    return {
      left: sprite.x - w / 2,
      right: sprite.x + w / 2,
      top: sprite.y - h / 2,
      bottom: sprite.y + h / 2,
    };
  }

  expandBounds(bounds, factor) {
    const expandW = (bounds.right - bounds.left) * factor;
    const expandH = (bounds.bottom - bounds.top) * factor;
    return {
      left: bounds.left - expandW,
      right: bounds.right + expandW,
      top: bounds.top - expandH,
      bottom: bounds.bottom + expandH,
    };
  }

  aabb(a, b) {
    return a.left < b.right && a.right > b.left &&
           a.top < b.bottom && a.bottom > b.top;
  }

  collectPowerup(proj) {
    proj.markCollected();
    eventBus.emit(Events.POWERUP_COLLECTED, { type: proj.type });

    // Collection visual: scale up and fade
    this.tweens.add({
      targets: proj.sprite,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 200,
      onComplete: () => proj.destroy(),
    });

    // Floating score text is now handled by TextEffects via SCORE_CHANGED event
  }

  hitByAttack(proj) {
    proj.markCollected();
    eventBus.emit(Events.ATTACK_HIT, { type: proj.type });

    // Destroy the projectile visually
    this.tweens.add({
      targets: proj.sprite,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 150,
      onComplete: () => proj.destroy(),
    });

    // Start invulnerability
    this.invulnerable = true;
    this.invulnerableTimer = this.INVULNERABLE_DURATION;

    // Flash damage on player
    this.player.flashDamage();

    // Screen shake and effects handled by ScreenEffects via ATTACK_HIT event
  }

  onLifeLost(data) {
    this.drawHearts();

    // Show "OUCH" text with dramatic scale punch
    if (data.lives > 0) {
      const ouchText = this.add.text(
        this.player.sprite.x,
        this.player.sprite.y - CLAVICULAR.HEIGHT * 0.8,
        'OUCH!',
        {
          fontSize: Math.round(GAME.HEIGHT * 0.045) + 'px',
          fontFamily: 'system-ui, sans-serif',
          color: '#FF3366',
          fontStyle: 'bold',
          shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.8)', blur: 6, fill: true },
        }
      ).setOrigin(0.5).setScale(EFFECTS.FLOAT_TEXT_START_SCALE).setDepth(20);

      // Elastic scale-in
      this.tweens.add({
        targets: ouchText,
        scaleX: 1,
        scaleY: 1,
        duration: 250,
        ease: 'Elastic.easeOut',
      });

      this.tweens.add({
        targets: ouchText,
        y: ouchText.y - 40 * PX,
        alpha: 0,
        duration: 700,
        delay: 150,
        ease: 'Sine.easeOut',
        onComplete: () => ouchText.destroy(),
      });
    }
  }

  onFrameMog(data) {
    this.frameMogActive = true;

    // Clear all attacks from screen
    this.spawnSystem.clearAllAttacks();

    // Expose Androgenic's wig
    this.androgenic.exposeWig(MOG.FRAME_MOG_DURATION);

    // Screen flash gold (ScreenEffects also adds shake + pulse via EventBus)
    this.cameras.main.flash(400, 255, 215, 0);

    // Glow layer (additive)
    const mogGlow = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT * 0.42, 'FRAME MOG!', {
      fontSize: Math.round(GAME.HEIGHT * 0.075) + 'px',
      fontFamily: 'system-ui, sans-serif',
      color: '#FFD700',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: 'rgba(255,215,0,0.8)', blur: 30, fill: true },
    }).setOrigin(0.5).setScale(0).setDepth(25).setBlendMode(Phaser.BlendModes.ADD);

    // Main "FRAME MOG!" text
    const mogText = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT * 0.42, 'FRAME MOG!', {
      fontSize: Math.round(GAME.HEIGHT * 0.075) + 'px',
      fontFamily: 'system-ui, sans-serif',
      color: '#FFD700',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 3, color: 'rgba(0,0,0,0.8)', blur: 10, fill: true },
    }).setOrigin(0.5).setScale(0).setDepth(26);

    // Slam-in with overshoot
    this.tweens.add({
      targets: [mogText, mogGlow],
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 250,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Settle
        this.tweens.add({
          targets: [mogText, mogGlow],
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 150,
          ease: 'Sine.easeOut',
          onComplete: () => {
            // Float up and fade
            this.tweens.add({
              targets: [mogText, mogGlow],
              scaleX: 0.9,
              scaleY: 0.9,
              alpha: 0,
              y: mogText.y - 40 * PX,
              duration: 500,
              delay: 350,
              ease: 'Sine.easeIn',
              onComplete: () => {
                mogText.destroy();
                mogGlow.destroy();
                this.frameMogActive = false;
              },
            });
          },
        });
      },
    });

    // Update mog level label
    this.mogLabel.setText(`MOG LV: ${gameState.mogLevel}`);
  }

  updateHUD() {
    // Score with punch animation on change
    const newScore = `${gameState.score}`;
    if (this.scoreText.text !== newScore) {
      this.scoreText.setText(newScore);
      // Punch scale animation on score change
      if (!this._scoreTween || !this._scoreTween.isPlaying()) {
        this._scoreTween = this.tweens.add({
          targets: this.scoreText,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 80,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }
    }

    // Combo display handled by TextEffects via EventBus

    // Mog bar
    this.drawMogBar();
  }

  triggerGameOver() {
    if (gameState.gameOver) return;
    gameState.gameOver = true;

    // Heavy camera shake
    this.cameras.main.shake(400, EFFECTS.SHAKE_HEAVY);

    // Red flash on death
    this.cameras.main.flash(300, 255, 50, 50);

    // Slow-mo death effect
    this.time.timeScale = 0.3;
    this.time.delayedCall(600, () => {
      this.time.timeScale = 1;
      eventBus.emit(Events.GAME_OVER, { score: gameState.score });
      this.cleanupListeners();
      this.scene.start('GameOverScene');
    });
  }

  cleanupListeners() {
    eventBus.off(Events.PLAYER_DIED, this._onPlayerDied);
    eventBus.off(Events.LIFE_LOST, this._onLifeLost);
    eventBus.off(Events.MOG_FRAMEMOG, this._onFrameMog);

    // Expression listeners
    eventBus.off(Events.POWERUP_COLLECTED, this._onPowerupExprClavicular);
    eventBus.off(Events.ATTACK_HIT, this._onAttackExprClavicular);
    eventBus.off(Events.MOG_FRAMEMOG, this._onFrameMogExprClavicular);
    eventBus.off(Events.POWERUP_COLLECTED, this._onPowerupExprAndrogenic);
    eventBus.off(Events.ATTACK_HIT, this._onAttackExprAndrogenic);
    eventBus.off(Events.MOG_FRAMEMOG, this._onFrameMogExprAndrogenic);

    if (this.scoreSystem) this.scoreSystem.destroy();
    if (this.spawnSystem) this.spawnSystem.destroy();

    // Clean up effect systems
    if (this.particleManager) this.particleManager.destroy();
    if (this.screenEffects) this.screenEffects.destroy();
    if (this.textEffects) this.textEffects.destroy();
  }

  shutdown() {
    this.cleanupListeners();
  }
}
