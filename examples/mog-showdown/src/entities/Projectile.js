import Phaser from 'phaser';
import { PROJECTILE, PX } from '../core/Constants.js';

/**
 * Projectile -- falling items in the arena.
 * Two categories:
 *   - 'attack': wigs, hats thrown by Androgenic (hurt the player)
 *   - 'powerup': protein shakes, dumbbells (score points)
 *
 * Each projectile is a physics-enabled container with Graphics rendering.
 */

export const ProjectileType = {
  WIG: 'wig',
  HAT: 'hat',
  SHAKE: 'shake',
  DUMBBELL: 'dumbbell',
};

export class Projectile {
  constructor(scene, x, y, type, speed) {
    this.scene = scene;
    this.type = type;
    this.category = (type === ProjectileType.WIG || type === ProjectileType.HAT) ? 'attack' : 'powerup';
    this.collected = false;

    const gfx = scene.add.graphics();
    this.drawProjectile(gfx, type);

    // Create physics container
    const pw = this.category === 'attack' ? PROJECTILE.ATTACK_WIDTH : PROJECTILE.POWERUP_WIDTH;
    const ph = this.category === 'attack' ? PROJECTILE.ATTACK_HEIGHT : PROJECTILE.POWERUP_HEIGHT;

    this.sprite = scene.add.container(x, y, [gfx]);
    scene.physics.add.existing(this.sprite);

    this.sprite.body.setSize(pw * 0.9, ph * 0.9);
    this.sprite.body.setOffset(-pw * 0.45, -ph * 0.45);
    this.sprite.body.setAllowGravity(false);
    this.sprite.body.setVelocityY(speed);

    // Store reference for collision handling
    this.sprite.entity = this;
  }

  drawProjectile(gfx, type) {
    switch (type) {
      case ProjectileType.WIG:
        this.drawWig(gfx);
        break;
      case ProjectileType.HAT:
        this.drawHat(gfx);
        break;
      case ProjectileType.SHAKE:
        this.drawShake(gfx);
        break;
      case ProjectileType.DUMBBELL:
        this.drawDumbbell(gfx);
        break;
    }
  }

  drawWig(gfx) {
    const w = PROJECTILE.ATTACK_WIDTH;
    const h = PROJECTILE.ATTACK_HEIGHT;

    // Glow outline
    gfx.lineStyle(3 * PX, PROJECTILE.ATTACK_COLOR_WIG, 0.3);
    gfx.strokeRoundedRect(-w * 0.44, -h * 0.34, w * 0.88, h * 0.58, 5 * PX);

    // Wavy wig shape (brown)
    gfx.fillStyle(PROJECTILE.ATTACK_COLOR_WIG, 1);
    // Main wig body
    gfx.fillRoundedRect(-w * 0.4, -h * 0.3, w * 0.8, h * 0.5, 4 * PX);
    // Wavy top bumps
    gfx.fillCircle(-w * 0.25, -h * 0.35, w * 0.15);
    gfx.fillCircle(0, -h * 0.40, w * 0.15);
    gfx.fillCircle(w * 0.25, -h * 0.35, w * 0.15);
    // Wavy bottom strands
    gfx.fillCircle(-w * 0.2, h * 0.25, w * 0.10);
    gfx.fillCircle(w * 0.2, h * 0.25, w * 0.10);
  }

  drawHat(gfx) {
    const w = PROJECTILE.ATTACK_WIDTH;
    const h = PROJECTILE.ATTACK_HEIGHT;

    // Glow outline
    gfx.lineStyle(3 * PX, PROJECTILE.ATTACK_COLOR_HAT, 0.3);
    gfx.strokeRoundedRect(-w * 0.34, -h * 0.44, w * 0.68, h * 0.58, 7 * PX);

    // Baseball cap shape (dark)
    gfx.fillStyle(PROJECTILE.ATTACK_COLOR_HAT, 1);
    // Cap dome
    gfx.fillRoundedRect(-w * 0.3, -h * 0.4, w * 0.6, h * 0.5, 6 * PX);
    // Brim (wider, flat)
    gfx.fillRect(-w * 0.45, h * 0.0, w * 0.9, h * 0.15);
    // Brim underside shadow
    gfx.fillStyle(0x1A1A1A, 0.5);
    gfx.fillRect(-w * 0.45, h * 0.10, w * 0.9, h * 0.08);
  }

  drawShake(gfx) {
    const w = PROJECTILE.POWERUP_WIDTH;
    const h = PROJECTILE.POWERUP_HEIGHT;

    // Glow outline
    gfx.lineStyle(3 * PX, PROJECTILE.POWERUP_COLOR_SHAKE, 0.3);
    gfx.strokeRoundedRect(-w * 0.34, -h * 0.46, w * 0.68, h * 0.92, 5 * PX);

    // Protein shake bottle (bright green)
    gfx.fillStyle(PROJECTILE.POWERUP_COLOR_SHAKE, 1);
    // Bottle body
    gfx.fillRoundedRect(-w * 0.3, -h * 0.15, w * 0.6, h * 0.55, 4 * PX);
    // Bottle neck
    gfx.fillRect(-w * 0.15, -h * 0.35, w * 0.3, h * 0.22);
    // Cap
    gfx.fillStyle(0x118833, 1);
    gfx.fillRoundedRect(-w * 0.2, -h * 0.42, w * 0.4, h * 0.10, 3 * PX);
    // Label
    gfx.fillStyle(0xFFFFFF, 0.8);
    gfx.fillRect(-w * 0.22, h * 0.0, w * 0.44, h * 0.18);
    // "P" for protein
    gfx.fillStyle(PROJECTILE.POWERUP_COLOR_SHAKE, 1);
    gfx.fillRect(-w * 0.08, h * 0.03, w * 0.16, h * 0.12);
  }

  drawDumbbell(gfx) {
    const w = PROJECTILE.POWERUP_WIDTH;
    const h = PROJECTILE.POWERUP_HEIGHT;

    // Glow outline
    gfx.lineStyle(3 * PX, PROJECTILE.POWERUP_COLOR_DUMBBELL, 0.3);
    gfx.strokeRoundedRect(-w * 0.50, -h * 0.20, w * 1.0, h * 0.40, 4 * PX);

    // Pink dumbbell
    gfx.fillStyle(PROJECTILE.POWERUP_COLOR_DUMBBELL, 1);
    // Left weight
    gfx.fillRoundedRect(-w * 0.45, -h * 0.15, w * 0.25, h * 0.30, 3 * PX);
    // Right weight
    gfx.fillRoundedRect(w * 0.20, -h * 0.15, w * 0.25, h * 0.30, 3 * PX);
    // Bar (connecting)
    gfx.fillStyle(0xAAAAAA, 1);
    gfx.fillRect(-w * 0.22, -h * 0.04, w * 0.44, h * 0.08);
    // Grip accent
    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(-w * 0.10, -h * 0.05, w * 0.20, h * 0.10);
  }

  isOffScreen() {
    return this.sprite.y > this.scene.game.config.height + 50;
  }

  markCollected() {
    this.collected = true;
  }

  destroy() {
    this.sprite.destroy();
  }
}
