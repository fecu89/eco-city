import Phaser from 'phaser';
import { CLAVICULAR, GAME, PX, CHARACTER, EXPRESSION, EXPRESSION_HOLD_MS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

/**
 * Clavicular -- the player character.
 * Photo-composite bobblehead: cartoon South Park-style body + photo head sprite.
 * Gold/amber tank top (showing off collarbones), dark navy pants, white sneakers.
 * "The clavicle guy."
 */
export class Clavicular {
  constructor(scene) {
    this.scene = scene;
    this.facingRight = true;
    this.currentExpression = EXPRESSION.NORMAL;
    this._expressionTimer = null;

    const C = CHARACTER;

    // --- Layer order: left arm (behind), right arm (behind), body, head (front) ---

    // Left arm graphics (behind body)
    this.leftArmGfx = scene.add.graphics();
    this.drawLeftArm(this.leftArmGfx, C);

    // Right arm graphics (behind body)
    this.rightArmGfx = scene.add.graphics();
    this.drawRightArm(this.rightArmGfx, C);

    // Body graphics (torso, legs, shoes)
    this.bodyGfx = scene.add.graphics();
    this.drawBody(this.bodyGfx, C);

    // Head sprite (photo spritesheet on top)
    this.headSprite = scene.add.sprite(0, 0, 'clavicular-head', EXPRESSION.NORMAL);
    const headScale = C.HEAD_H / C.FRAME_H;
    this.headSprite.setScale(headScale);
    // Position head above the torso
    const headY = -(C.TORSO_H * 0.5 + C.NECK_H + C.HEAD_H * 0.42);
    this.headSprite.setY(headY);

    // Create physics container with all parts
    this.sprite = scene.add.container(CLAVICULAR.START_X, CLAVICULAR.START_Y, [
      this.leftArmGfx,
      this.rightArmGfx,
      this.bodyGfx,
      this.headSprite,
    ]);
    scene.physics.add.existing(this.sprite);

    this.sprite.body.setSize(CLAVICULAR.WIDTH * 0.8, CLAVICULAR.HEIGHT * 0.85);
    this.sprite.body.setOffset(-CLAVICULAR.WIDTH * 0.4, -CLAVICULAR.HEIGHT * 0.5);
    this.sprite.body.setCollideWorldBounds(true);
    this.sprite.body.setAllowGravity(false);

    // Store reference for collision detection
    this.sprite.entity = this;

    // Idle breathing tween (gentle bobbing)
    this.breathTween = scene.tweens.add({
      targets: this.bodyGfx,
      y: { from: 0, to: -C.U * 0.4 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Head also bobs slightly (offset from body bob for natural feel)
    this.headBobTween = scene.tweens.add({
      targets: this.headSprite,
      y: { from: headY, to: headY - C.U * 0.6 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 100, // Slight delay for bobblehead lag
    });
  }

  drawBody(gfx, C) {
    const skinColor = 0xF5D0A9;
    const tankTopColor = 0xD4A017; // Gold/amber tank top
    const pantsColor = 0x2C2C54;  // Dark navy pants
    const shoeColor = 0xFFFFFF;   // White sneakers

    // --- Neck ---
    gfx.fillStyle(skinColor, 1);
    gfx.fillRect(-C.NECK_W / 2, -C.TORSO_H * 0.5 - C.NECK_H, C.NECK_W, C.NECK_H);

    // --- Torso (tapered tank top) ---
    gfx.fillStyle(tankTopColor, 1);
    gfx.beginPath();
    gfx.moveTo(-C.SHOULDER_W / 2, -C.TORSO_H * 0.5);
    gfx.lineTo(C.SHOULDER_W / 2, -C.TORSO_H * 0.5);
    gfx.lineTo(C.WAIST_W / 2, C.TORSO_H * 0.5);
    gfx.lineTo(-C.WAIST_W / 2, C.TORSO_H * 0.5);
    gfx.closePath();
    gfx.fillPath();

    // Tank top neckline V-cut detail
    gfx.lineStyle(2 * PX, 0xB8860B, 0.9);
    gfx.beginPath();
    gfx.moveTo(-C.SHOULDER_W * 0.25, -C.TORSO_H * 0.48);
    gfx.lineTo(0, -C.TORSO_H * 0.2);
    gfx.lineTo(C.SHOULDER_W * 0.25, -C.TORSO_H * 0.48);
    gfx.strokePath();

    // Clavicle bone lines (the signature feature)
    gfx.lineStyle(2.5 * PX, 0xE8C860, 0.85);
    // Left clavicle
    gfx.beginPath();
    gfx.moveTo(-C.NECK_W * 0.3, -C.TORSO_H * 0.45);
    gfx.lineTo(-C.SHOULDER_W * 0.45, -C.TORSO_H * 0.38);
    gfx.strokePath();
    // Right clavicle
    gfx.beginPath();
    gfx.moveTo(C.NECK_W * 0.3, -C.TORSO_H * 0.45);
    gfx.lineTo(C.SHOULDER_W * 0.45, -C.TORSO_H * 0.38);
    gfx.strokePath();

    // --- Legs ---
    const legTop = C.TORSO_H * 0.5;
    gfx.fillStyle(pantsColor, 1);
    // Left leg
    gfx.fillRoundedRect(-C.LEG_GAP / 2 - C.LEG_W, legTop, C.LEG_W, C.LEG_H, 3 * PX);
    // Right leg
    gfx.fillRoundedRect(C.LEG_GAP / 2, legTop, C.LEG_W, C.LEG_H, 3 * PX);

    // --- Shoes ---
    const shoeTop = legTop + C.LEG_H;
    gfx.fillStyle(shoeColor, 1);
    // Left shoe
    gfx.fillRoundedRect(-C.LEG_GAP / 2 - C.SHOE_W, shoeTop, C.SHOE_W, C.SHOE_H, 2 * PX);
    // Right shoe
    gfx.fillRoundedRect(C.LEG_GAP / 2, shoeTop, C.SHOE_W, C.SHOE_H, 2 * PX);
  }

  drawLeftArm(gfx, C) {
    const skinColor = 0xF5D0A9;
    // Upper arm (skin -- tank top shows bare arms)
    gfx.fillStyle(skinColor, 1);
    const armX = -C.SHOULDER_W / 2 - C.UPPER_ARM_W * 0.3;
    const armY = -C.TORSO_H * 0.45;
    gfx.fillRoundedRect(armX, armY, C.UPPER_ARM_W, C.UPPER_ARM_H, 3 * PX);

    // Hand
    gfx.fillRoundedRect(
      armX + C.UPPER_ARM_W * 0.1,
      armY + C.UPPER_ARM_H,
      C.HAND_W,
      C.HAND_H,
      2 * PX
    );
  }

  drawRightArm(gfx, C) {
    const skinColor = 0xF5D0A9;
    gfx.fillStyle(skinColor, 1);
    const armX = C.SHOULDER_W / 2 - C.UPPER_ARM_W * 0.7;
    const armY = -C.TORSO_H * 0.45;
    gfx.fillRoundedRect(armX, armY, C.UPPER_ARM_W, C.UPPER_ARM_H, 3 * PX);

    // Hand
    gfx.fillRoundedRect(
      armX + C.UPPER_ARM_W * 0.1,
      armY + C.UPPER_ARM_H,
      C.HAND_W,
      C.HAND_H,
      2 * PX
    );
  }

  /**
   * Set facial expression on the head sprite.
   * Reverts to NORMAL after holdMs (default EXPRESSION_HOLD_MS).
   */
  setExpression(expression, holdMs = EXPRESSION_HOLD_MS) {
    if (this._expressionTimer) {
      clearTimeout(this._expressionTimer);
      this._expressionTimer = null;
    }
    this.currentExpression = expression;
    this.headSprite.setFrame(expression);

    if (expression !== EXPRESSION.NORMAL) {
      this._expressionTimer = setTimeout(() => {
        this.currentExpression = EXPRESSION.NORMAL;
        this.headSprite.setFrame(EXPRESSION.NORMAL);
        this._expressionTimer = null;
      }, holdMs);
    }
  }

  update(left, right) {
    const body = this.sprite.body;

    if (left) {
      body.setVelocityX(-CLAVICULAR.SPEED);
      if (this.facingRight) {
        this.sprite.setScale(-1, 1);
        this.facingRight = false;
      }
      eventBus.emit(Events.SPECTACLE_ACTION, { direction: 'left' });
    } else if (right) {
      body.setVelocityX(CLAVICULAR.SPEED);
      if (!this.facingRight) {
        this.sprite.setScale(1, 1);
        this.facingRight = true;
      }
      eventBus.emit(Events.SPECTACLE_ACTION, { direction: 'right' });
    } else {
      body.setVelocityX(0);
    }

    // Keep vertical position fixed
    body.setVelocityY(0);
  }

  /**
   * Flash red when hit
   */
  flashDamage() {
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.sprite.setAlpha(1);
      }
    });
  }

  reset() {
    this.sprite.setPosition(CLAVICULAR.START_X, CLAVICULAR.START_Y);
    this.sprite.body.setVelocity(0, 0);
    this.sprite.setAlpha(1);
    this.sprite.setScale(1, 1);
    this.facingRight = true;
    this.setExpression(EXPRESSION.NORMAL);
  }

  destroy() {
    if (this._expressionTimer) {
      clearTimeout(this._expressionTimer);
      this._expressionTimer = null;
    }
    if (this.breathTween) this.breathTween.destroy();
    if (this.headBobTween) this.headBobTween.destroy();
    this.sprite.destroy();
  }
}
