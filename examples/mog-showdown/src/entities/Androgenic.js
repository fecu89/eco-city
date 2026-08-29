import Phaser from 'phaser';
import { ANDROGENIC, GAME, PX, CHARACTER, EXPRESSION, EXPRESSION_HOLD_MS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

/**
 * Androgenic -- the opponent NPC.
 * Photo-composite bobblehead: cartoon South Park-style body + photo head sprite.
 * A tall (6'5") figure with dark blue t-shirt, dark pants, dark shoes.
 * Stands at top of screen, sways side-to-side, throws attacks downward.
 * When frame mog triggers, his hat flies off revealing surprise expression.
 */
export class Androgenic {
  constructor(scene) {
    this.scene = scene;
    this.wigExposed = false;
    this.wigTimer = null;
    this.swayTime = 0;
    this.currentExpression = EXPRESSION.NORMAL;
    this._expressionTimer = null;

    const C = CHARACTER;

    // Scale factor: Androgenic is taller/broader than Clavicular
    this.bodyScale = 1.25;
    const BS = this.bodyScale;

    // --- Layer order: left arm (behind), right arm (behind), body, hat, head (front) ---

    // Left arm graphics
    this.leftArmGfx = scene.add.graphics();
    this.drawLeftArm(this.leftArmGfx, C, BS);

    // Right arm graphics
    this.rightArmGfx = scene.add.graphics();
    this.drawRightArm(this.rightArmGfx, C, BS);

    // Body graphics (torso, legs, shoes)
    this.bodyGfx = scene.add.graphics();
    this.drawBody(this.bodyGfx, C, BS);

    // Hat graphics (drawn as separate object for flying-off animation)
    this.hatGfx = scene.add.graphics();
    this.drawHat(this.hatGfx, C, BS);

    // Head sprite (photo spritesheet on top)
    this.headSprite = scene.add.sprite(0, 0, 'androgenic-head', EXPRESSION.NORMAL);
    const headH = C.HEAD_H * BS;
    const headScale = headH / C.FRAME_H;
    this.headSprite.setScale(headScale);
    // Position head above the torso
    const torsoH = C.TORSO_H * BS;
    const neckH = C.NECK_H * BS;
    this.headY = -(torsoH * 0.5 + neckH + headH * 0.42);
    this.headSprite.setY(this.headY);

    // Position hat above head
    this.hatY = this.headY - headH * 0.42;
    this.hatGfx.setY(this.hatY);

    // Create container
    this.sprite = scene.add.container(ANDROGENIC.X, ANDROGENIC.Y, [
      this.leftArmGfx,
      this.rightArmGfx,
      this.bodyGfx,
      this.headSprite,
      this.hatGfx,
    ]);

    // Store reference
    this.sprite.entity = this;

    // Idle breathing tween
    this.breathTween = scene.tweens.add({
      targets: this.bodyGfx,
      y: { from: 0, to: -C.U * 0.3 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Head bobble
    this.headBobTween = scene.tweens.add({
      targets: this.headSprite,
      y: { from: this.headY, to: this.headY - C.U * 0.5 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 80,
    });

    // Hat follows head bob
    this.hatBobTween = scene.tweens.add({
      targets: this.hatGfx,
      y: { from: this.hatY, to: this.hatY - C.U * 0.5 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 80,
    });
  }

  drawBody(gfx, C, BS) {
    const skinColor = 0xE8C8A0;
    const shirtColor = 0x1A3A5C;  // Dark blue t-shirt
    const pantsColor = 0x1A1A3E;  // Dark pants
    const shoeColor = 0x111111;   // Dark shoes

    const torsoH = C.TORSO_H * BS;
    const shoulderW = C.SHOULDER_W * BS;
    const waistW = C.WAIST_W * BS;
    const neckW = C.NECK_W * BS;
    const neckH = C.NECK_H * BS;
    const legW = C.LEG_W * BS;
    const legH = C.LEG_H * BS;
    const legGap = C.LEG_GAP * BS;
    const shoeW = C.SHOE_W * BS;
    const shoeH = C.SHOE_H * BS;

    // --- Neck (thick) ---
    gfx.fillStyle(skinColor, 1);
    gfx.fillRect(-neckW / 2, -torsoH * 0.5 - neckH, neckW, neckH);

    // --- Torso (dark blue t-shirt, broad) ---
    gfx.fillStyle(shirtColor, 1);
    gfx.beginPath();
    gfx.moveTo(-shoulderW / 2, -torsoH * 0.5);
    gfx.lineTo(shoulderW / 2, -torsoH * 0.5);
    gfx.lineTo(waistW / 2, torsoH * 0.5);
    gfx.lineTo(-waistW / 2, torsoH * 0.5);
    gfx.closePath();
    gfx.fillPath();

    // T-shirt collar
    gfx.lineStyle(2 * PX, 0x0F2A45, 0.8);
    gfx.beginPath();
    gfx.moveTo(-neckW * 0.8, -torsoH * 0.48);
    gfx.lineTo(0, -torsoH * 0.38);
    gfx.lineTo(neckW * 0.8, -torsoH * 0.48);
    gfx.strokePath();

    // --- Legs ---
    const legTop = torsoH * 0.5;
    gfx.fillStyle(pantsColor, 1);
    gfx.fillRoundedRect(-legGap / 2 - legW, legTop, legW, legH, 3 * PX);
    gfx.fillRoundedRect(legGap / 2, legTop, legW, legH, 3 * PX);

    // --- Shoes ---
    const shoeTop = legTop + legH;
    gfx.fillStyle(shoeColor, 1);
    gfx.fillRoundedRect(-legGap / 2 - shoeW, shoeTop, shoeW, shoeH, 2 * PX);
    gfx.fillRoundedRect(legGap / 2, shoeTop, shoeW, shoeH, 2 * PX);
  }

  drawLeftArm(gfx, C, BS) {
    const skinColor = 0xE8C8A0;
    const shirtColor = 0x1A3A5C;
    const shoulderW = C.SHOULDER_W * BS;
    const armW = C.UPPER_ARM_W * BS;
    const armH = C.UPPER_ARM_H * BS;
    const handW = C.HAND_W * BS;
    const handH = C.HAND_H * BS;
    const torsoH = C.TORSO_H * BS;

    // T-shirt sleeve
    const armX = -shoulderW / 2 - armW * 0.3;
    const armY = -torsoH * 0.45;
    gfx.fillStyle(shirtColor, 1);
    gfx.fillRoundedRect(armX, armY, armW, armH * 0.5, 3 * PX);

    // Bare forearm (skin)
    gfx.fillStyle(skinColor, 1);
    gfx.fillRoundedRect(armX, armY + armH * 0.45, armW, armH * 0.55, 3 * PX);

    // Hand
    gfx.fillRoundedRect(
      armX + armW * 0.1,
      armY + armH,
      handW,
      handH,
      2 * PX
    );
  }

  drawRightArm(gfx, C, BS) {
    const skinColor = 0xE8C8A0;
    const shirtColor = 0x1A3A5C;
    const shoulderW = C.SHOULDER_W * BS;
    const armW = C.UPPER_ARM_W * BS;
    const armH = C.UPPER_ARM_H * BS;
    const handW = C.HAND_W * BS;
    const handH = C.HAND_H * BS;
    const torsoH = C.TORSO_H * BS;

    const armX = shoulderW / 2 - armW * 0.7;
    const armY = -torsoH * 0.45;
    gfx.fillStyle(shirtColor, 1);
    gfx.fillRoundedRect(armX, armY, armW, armH * 0.5, 3 * PX);

    gfx.fillStyle(skinColor, 1);
    gfx.fillRoundedRect(armX, armY + armH * 0.45, armW, armH * 0.55, 3 * PX);

    // Hand
    gfx.fillRoundedRect(
      armX + armW * 0.1,
      armY + armH,
      handW,
      handH,
      2 * PX
    );
  }

  drawHat(gfx, C, BS) {
    const headH = C.HEAD_H * BS;
    const headW = headH * (C.FRAME_W / C.FRAME_H);
    const capColor = 0x333333;

    // Baseball cap on top of head
    gfx.fillStyle(capColor, 1);
    // Cap dome
    gfx.fillRoundedRect(-headW * 0.30, -headH * 0.12, headW * 0.60, headH * 0.14, 5 * PX);
    // Brim (wider, extending forward)
    gfx.fillRect(-headW * 0.38, headH * 0.01, headW * 0.76, headH * 0.05);
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

  update(delta) {
    // Gentle side-to-side sway
    this.swayTime += delta * 0.001;
    const swayX = ANDROGENIC.X + Math.sin(this.swayTime * ANDROGENIC.SWAY_SPEED) * ANDROGENIC.SWAY_RANGE;
    this.sprite.x = Phaser.Math.Clamp(swayX, ANDROGENIC.WIDTH, GAME.WIDTH - ANDROGENIC.WIDTH);
  }

  /**
   * Expose the wig (hat flies off) during frame mog.
   * Sets surprised expression, animates hat flying off, then restores.
   */
  exposeWig(duration) {
    if (this.wigExposed) return;
    this.wigExposed = true;

    // Set surprised expression
    this.setExpression(EXPRESSION.SURPRISED, duration);

    // Stop hat bob tween temporarily
    if (this.hatBobTween) this.hatBobTween.pause();

    // Animate hat flying off (upward and rotating)
    this.scene.tweens.add({
      targets: this.hatGfx,
      y: this.hatY - 200 * PX,
      angle: 360,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
    });

    eventBus.emit(Events.ANDROGENIC_WIG_EXPOSED);

    // Shake Androgenic in surprise
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + 10 * PX,
      duration: 50,
      yoyo: true,
      repeat: 5,
    });

    // Restore after duration
    if (this.wigTimer) clearTimeout(this.wigTimer);
    this.wigTimer = setTimeout(() => {
      this.wigExposed = false;

      // Bring hat back
      this.hatGfx.setAlpha(1);
      this.hatGfx.setAngle(0);
      this.hatGfx.setY(this.hatY);

      // Resume hat bob
      if (this.hatBobTween) this.hatBobTween.resume();
    }, duration);
  }

  destroy() {
    if (this.wigTimer) clearTimeout(this.wigTimer);
    if (this._expressionTimer) {
      clearTimeout(this._expressionTimer);
      this._expressionTimer = null;
    }
    if (this.breathTween) this.breathTween.destroy();
    if (this.headBobTween) this.headBobTween.destroy();
    if (this.hatBobTween) this.hatBobTween.destroy();
    this.sprite.destroy();
  }
}
