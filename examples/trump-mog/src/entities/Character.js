import { CHARACTER, PX } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

const C = CHARACTER;
const OL = C.OUTLINE;
const EXP = C.EXPRESSION;

// Smart fallback chains — NEVER default to NORMAL if alternatives exist
const FALLBACK = {
  [EXP.HAPPY]:     [EXP.SURPRISED, EXP.NORMAL, EXP.ANGRY],
  [EXP.ANGRY]:     [EXP.SURPRISED, EXP.HAPPY, EXP.NORMAL],
  [EXP.SURPRISED]: [EXP.ANGRY, EXP.HAPPY, EXP.NORMAL],
  [EXP.NORMAL]:    [EXP.HAPPY, EXP.ANGRY, EXP.SURPRISED],
};

const EXPRESSION_NAMES = ['normal', 'happy', 'angry', 'surprised'];

/**
 * Bobblehead character with expression spritesheet head.
 * Giant photo head (~35% of screen) on a tiny South Park body.
 */
export class Character {
  constructor(scene, x, y, type) {
    this.scene = scene;
    this.type = type;
    this.baseX = x;
    this.baseY = y;
    this.currentExpression = EXP.NORMAL;
    this.revertTimer = null;

    const pal = type === 'trump'
      ? { suit: C.TRUMP_SUIT, suitL: C.TRUMP_SUIT_LIGHT, tie: C.TRUMP_TIE, shirt: C.TRUMP_SHIRT, pants: C.TRUMP_PANTS, shoes: C.TRUMP_SHOES, skin: C.TRUMP_SKIN }
      : { suit: C.BIDEN_SUIT, suitL: C.BIDEN_SUIT_LIGHT, tie: C.BIDEN_TIE, shirt: C.BIDEN_SHIRT, pants: C.BIDEN_PANTS, shoes: C.BIDEN_SHOES, skin: C.BIDEN_SKIN };
    this.pal = pal;

    this.container = scene.add.container(x, y);

    // Draw the body (stubby bobblehead proportions)
    this.bodyGfx = scene.add.graphics();
    this.drawBody(this.bodyGfx, pal, type);

    // Arms as separate graphics (for animation)
    this.leftArmGfx = scene.add.graphics();
    this.rightArmGfx = scene.add.graphics();
    this.drawArm(this.leftArmGfx, pal, -1);
    this.drawArm(this.rightArmGfx, pal, 1);

    // Position arms pinned to shoulders (store home positions for animation reset)
    const armX = C.SHOULDER_W * 0.5 + C.UPPER_ARM_W * 0.1;
    const armY = -C.TORSO_H * 0.38;
    this.armHomeLeft = { x: -armX, y: armY };
    this.armHomeRight = { x: armX, y: armY };
    this.leftArmGfx.setPosition(this.armHomeLeft.x, this.armHomeLeft.y);
    this.rightArmGfx.setPosition(this.armHomeRight.x, this.armHomeRight.y);

    // Head — spritesheet with 4 expression frames
    const sheetKey = type === 'trump' ? 'trump-expressions' : 'biden-expressions';
    const headY = -C.TORSO_H * 0.5 - C.NECK_H - C.HEAD_H * 0.35;

    // Detect available frames by checking spritesheet texture
    this.availableFrames = this._detectAvailableFrames(sheetKey);

    this.headSprite = scene.add.sprite(0, headY, sheetKey, EXP.NORMAL);

    // Scale head to bobblehead size, preserving aspect ratio
    const headScale = C.HEAD_H / C.FRAME_H;
    this.headSprite.setScale(headScale);

    // Layer order: arms behind body, head on top
    this.container.add([
      this.leftArmGfx,
      this.rightArmGfx,
      this.bodyGfx,
      this.headSprite,
    ]);

    // Idle breathing
    this.bobTween = scene.tweens.add({
      targets: this.container,
      y: y - 2 * PX,
      duration: 1400 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Listen for expression changes
    this._onExpressionChange = (data) => {
      if (data.target === this.type) {
        this.setExpression(data.expression);
      }
    };
    this._onExpressionReset = (data) => {
      if (!data || data.target === this.type) {
        this.setExpression(EXP.NORMAL);
      }
    };
    eventBus.on(Events.EXPRESSION_CHANGE, this._onExpressionChange);
    eventBus.on(Events.EXPRESSION_RESET, this._onExpressionReset);
  }

  /**
   * Detect which frames have actual pixel content (not fully transparent).
   * Returns a Set of frame indices that are usable.
   */
  _detectAvailableFrames(sheetKey) {
    const available = new Set();
    try {
      const texture = this.scene.textures.get(sheetKey);
      if (!texture || texture.key === '__MISSING') return available;

      // Check each frame exists in the texture
      for (let i = 0; i < EXP.FRAME_COUNT; i++) {
        const frame = texture.get(i);
        // Frame exists if it's not the base frame (which means fallback)
        if (frame && frame.width > 0 && frame.cutX !== undefined) {
          available.add(i);
        }
      }
    } catch {
      // If texture detection fails, assume all frames available
      for (let i = 0; i < EXP.FRAME_COUNT; i++) available.add(i);
    }
    // Always assume NORMAL is available as ultimate fallback
    if (available.size === 0) available.add(EXP.NORMAL);
    return available;
  }

  /**
   * Set expression with smart fallback chain and juice.
   * Auto-reverts to NORMAL after EXPRESSION_HOLD ms.
   */
  setExpression(expression) {
    // Resolve frame — use fallback chain if requested frame is missing
    let resolvedFrame = expression;
    if (!this.availableFrames.has(expression)) {
      const chain = FALLBACK[expression] || [EXP.NORMAL];
      resolvedFrame = chain.find(f => this.availableFrames.has(f));
      if (resolvedFrame === undefined) resolvedFrame = EXP.NORMAL;
    }

    this.currentExpression = expression;
    this.headSprite.setFrame(resolvedFrame);

    // Track in game state
    const exprName = EXPRESSION_NAMES[expression] || 'normal';
    if (this.type === 'trump') gameState.trumpExpression = exprName;
    else gameState.bidenExpression = exprName;

    // Squash-stretch juice on expression change
    if (expression !== EXP.NORMAL) {
      this.scene.tweens.add({
        targets: this.headSprite,
        scaleX: this.headSprite.scaleX * 1.15,
        scaleY: this.headSprite.scaleY * 0.9,
        duration: 80,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    // Auto-revert to NORMAL after hold time (unless already NORMAL)
    if (this.revertTimer) {
      this.revertTimer.destroy();
      this.revertTimer = null;
    }
    if (expression !== EXP.NORMAL) {
      this.revertTimer = this.scene.time.delayedCall(C.EXPRESSION_HOLD, () => {
        this.setExpression(EXP.NORMAL);
        this.revertTimer = null;
      });
    }
  }

  drawBody(g, pal, type) {
    g.clear();

    // === SHOES (bottom) ===
    const shoeY = C.TORSO_H * 0.5 + C.LEG_H;
    g.fillStyle(pal.shoes);
    g.lineStyle(OL, 0x000000);
    g.fillRoundedRect(-C.LEG_GAP - C.SHOE_W, shoeY - C.SHOE_H * 0.3, C.SHOE_W, C.SHOE_H, C.SHOE_H * 0.3);
    g.strokeRoundedRect(-C.LEG_GAP - C.SHOE_W, shoeY - C.SHOE_H * 0.3, C.SHOE_W, C.SHOE_H, C.SHOE_H * 0.3);
    g.fillRoundedRect(C.LEG_GAP, shoeY - C.SHOE_H * 0.3, C.SHOE_W, C.SHOE_H, C.SHOE_H * 0.3);
    g.strokeRoundedRect(C.LEG_GAP, shoeY - C.SHOE_H * 0.3, C.SHOE_W, C.SHOE_H, C.SHOE_H * 0.3);

    // === LEGS (pants) ===
    const legTop = C.TORSO_H * 0.5 - C.U;
    g.fillStyle(pal.pants);
    g.lineStyle(OL, 0x000000);
    g.fillRoundedRect(-C.LEG_GAP - C.LEG_W, legTop, C.LEG_W, C.LEG_H + C.U, C.U * 0.5);
    g.strokeRoundedRect(-C.LEG_GAP - C.LEG_W, legTop, C.LEG_W, C.LEG_H + C.U, C.U * 0.5);
    g.fillRoundedRect(C.LEG_GAP, legTop, C.LEG_W, C.LEG_H + C.U, C.U * 0.5);
    g.strokeRoundedRect(C.LEG_GAP, legTop, C.LEG_W, C.LEG_H + C.U, C.U * 0.5);

    // === TORSO (suit jacket — smaller for bobblehead) ===
    g.fillStyle(pal.suit);
    g.lineStyle(OL, 0x000000);
    g.beginPath();
    const sW = C.SHOULDER_W * 0.5;
    const wW = C.WAIST_W * 0.5;
    const tH = C.TORSO_H * 0.5;
    g.moveTo(-sW, -tH);
    g.lineTo(sW, -tH);
    g.lineTo(sW, -tH + C.U * 1.2);
    g.lineTo(wW + C.U * 0.5, tH * 0.3);
    g.lineTo(wW, tH);
    g.lineTo(-wW, tH);
    g.lineTo(-wW - C.U * 0.5, tH * 0.3);
    g.lineTo(-sW, -tH + C.U * 1.2);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // === SUIT JACKET DETAIL — lighter panel ===
    g.fillStyle(pal.suitL);
    g.beginPath();
    const pW = C.TORSO_W * 0.15;
    g.moveTo(-sW + C.U * 0.5, -tH + C.U * 0.3);
    g.lineTo(-pW, -tH + C.U * 0.3);
    g.lineTo(-pW, tH - C.U * 0.5);
    g.lineTo(-wW + C.U * 0.5, tH - C.U * 0.5);
    g.lineTo(-wW - C.U * 0.3, tH * 0.3);
    g.lineTo(-sW + C.U * 0.5, -tH + C.U * 1.5);
    g.closePath();
    g.fillPath();

    // === SHIRT / COLLAR V ===
    g.fillStyle(pal.shirt);
    g.lineStyle(OL, 0x000000);
    g.beginPath();
    g.moveTo(-C.NECK_W * 0.8, -tH);
    g.lineTo(C.NECK_W * 0.8, -tH);
    g.lineTo(C.TIE_W * 0.8, tH * 0.2);
    g.lineTo(0, tH * 0.45);
    g.lineTo(-C.TIE_W * 0.8, tH * 0.2);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // === LAPELS ===
    g.fillStyle(pal.suit);
    g.lineStyle(OL, 0x000000);
    g.beginPath();
    g.moveTo(-C.NECK_W * 0.7, -tH);
    g.lineTo(-C.LAPEL_W, -tH + C.U * 0.3);
    g.lineTo(-C.TIE_W, tH * 0.35);
    g.lineTo(-C.TIE_W * 0.6, tH * 0.15);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.beginPath();
    g.moveTo(C.NECK_W * 0.7, -tH);
    g.lineTo(C.LAPEL_W, -tH + C.U * 0.3);
    g.lineTo(C.TIE_W, tH * 0.35);
    g.lineTo(C.TIE_W * 0.6, tH * 0.15);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // === TIE ===
    g.fillStyle(pal.tie);
    g.lineStyle(OL * 0.7, 0x000000);
    // Knot
    g.beginPath();
    g.moveTo(-C.TIE_W * 0.4, -tH + C.U * 0.2);
    g.lineTo(C.TIE_W * 0.4, -tH + C.U * 0.2);
    g.lineTo(C.TIE_W * 0.5, -tH + C.U * 0.8);
    g.lineTo(-C.TIE_W * 0.5, -tH + C.U * 0.8);
    g.closePath();
    g.fillPath();
    g.strokePath();
    // Blade (tapers down)
    g.beginPath();
    g.moveTo(-C.TIE_W * 0.45, -tH + C.U * 0.8);
    g.lineTo(C.TIE_W * 0.45, -tH + C.U * 0.8);
    g.lineTo(C.TIE_W * 0.3, tH * 0.1);
    g.lineTo(0, tH * 0.4);
    g.lineTo(-C.TIE_W * 0.3, tH * 0.1);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // === BUTTONS ===
    g.fillStyle(0x888888);
    g.lineStyle(OL * 0.5, 0x000000);
    g.fillCircle(wW * 0.3, tH * 0.05, C.BUTTON_R);
    g.strokeCircle(wW * 0.3, tH * 0.05, C.BUTTON_R);
    g.fillCircle(wW * 0.25, tH * 0.3, C.BUTTON_R);
    g.strokeCircle(wW * 0.25, tH * 0.3, C.BUTTON_R);

    // === NECK ===
    g.fillStyle(pal.skin);
    g.lineStyle(OL, 0x000000);
    g.fillRoundedRect(-C.NECK_W * 0.5, -tH - C.NECK_H, C.NECK_W, C.NECK_H + C.U * 0.5, C.U * 0.3);
    g.strokeRoundedRect(-C.NECK_W * 0.5, -tH - C.NECK_H, C.NECK_W, C.NECK_H + C.U * 0.5, C.U * 0.3);
  }

  drawArm(g, pal, side) {
    g.clear();

    // Upper arm (suit sleeve)
    g.fillStyle(pal.suit);
    g.lineStyle(OL, 0x000000);
    g.fillRoundedRect(-C.UPPER_ARM_W * 0.5, 0, C.UPPER_ARM_W, C.UPPER_ARM_H, C.U * 0.4);
    g.strokeRoundedRect(-C.UPPER_ARM_W * 0.5, 0, C.UPPER_ARM_W, C.UPPER_ARM_H, C.U * 0.4);

    // Shirt cuff
    g.fillStyle(pal.shirt);
    g.lineStyle(OL * 0.7, 0x000000);
    g.fillRoundedRect(-C.LOWER_ARM_W * 0.5, C.UPPER_ARM_H - C.U * 0.3, C.LOWER_ARM_W, C.U * 0.8, C.U * 0.2);
    g.strokeRoundedRect(-C.LOWER_ARM_W * 0.5, C.UPPER_ARM_H - C.U * 0.3, C.LOWER_ARM_W, C.U * 0.8, C.U * 0.2);

    // Hand (mitten shape — South Park style)
    g.fillStyle(pal.skin);
    g.lineStyle(OL, 0x000000);
    const handY = C.UPPER_ARM_H + C.U * 0.3;
    g.fillRoundedRect(-C.HAND_W * 0.5, handY, C.HAND_W, C.HAND_H, C.HAND_H * 0.4);
    g.strokeRoundedRect(-C.HAND_W * 0.5, handY, C.HAND_W, C.HAND_H, C.HAND_H * 0.4);
  }

  // === ANIMATIONS ===

  mogPose(duration = 600) {
    // Reset arms to shoulder home position before animating (prevents drift)
    this.leftArmGfx.setPosition(this.armHomeLeft.x, this.armHomeLeft.y);
    this.rightArmGfx.setPosition(this.armHomeRight.x, this.armHomeRight.y);
    this.leftArmGfx.angle = 0;
    this.rightArmGfx.angle = 0;

    this.scene.tweens.add({
      targets: this.leftArmGfx,
      angle: 50,
      duration: duration * 0.25,
      yoyo: true,
      hold: duration * 0.4,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.rightArmGfx,
      angle: -50,
      duration: duration * 0.25,
      yoyo: true,
      hold: duration * 0.4,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.bodyGfx,
      scaleX: 1.05,
      duration: duration * 0.2,
      yoyo: true,
      hold: duration * 0.5,
      ease: 'Quad.easeOut',
    });
  }

  cowerPose(duration = 600) {
    // Reset arms to shoulder home position before animating (prevents drift)
    this.leftArmGfx.setPosition(this.armHomeLeft.x, this.armHomeLeft.y);
    this.rightArmGfx.setPosition(this.armHomeRight.x, this.armHomeRight.y);
    this.leftArmGfx.angle = 0;
    this.rightArmGfx.angle = 0;

    this.scene.tweens.add({
      targets: this.container,
      y: this.baseY + C.U * 1.5,
      duration: duration * 0.25,
      yoyo: true,
      hold: duration * 0.4,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.leftArmGfx,
      angle: -15,
      duration: duration * 0.25,
      yoyo: true,
      hold: duration * 0.4,
    });
    this.scene.tweens.add({
      targets: this.rightArmGfx,
      angle: 15,
      duration: duration * 0.25,
      yoyo: true,
      hold: duration * 0.4,
    });
  }

  destroy() {
    if (this.bobTween) this.bobTween.destroy();
    if (this.revertTimer) this.revertTimer.destroy();
    eventBus.off(Events.EXPRESSION_CHANGE, this._onExpressionChange);
    eventBus.off(Events.EXPRESSION_RESET, this._onExpressionReset);
    this.container.destroy();
  }
}
