import Phaser from 'phaser';
import { GAME, SPAWN, PROJECTILE, SAFE_ZONE, ANDROGENIC } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { Projectile, ProjectileType } from '../entities/Projectile.js';

/**
 * SpawnSystem -- manages spawning of attacks and power-ups.
 * Attacks come from Androgenic's position (aimed downward).
 * Power-ups fall from random positions at the top.
 * Difficulty ramps over time (faster spawn rates, faster projectiles).
 */
export class SpawnSystem {
  constructor(scene, androgenic) {
    this.scene = scene;
    this.androgenic = androgenic;
    this.projectiles = [];

    // Timers
    this.attackTimer = 0;
    this.powerupTimer = 0;
    this.elapsedTime = 0;

    // Current intervals (decrease over time for difficulty ramp)
    this.attackInterval = SPAWN.ATTACK_INTERVAL_INITIAL;
    this.powerupInterval = SPAWN.POWERUP_INTERVAL_INITIAL;

    // Difficulty
    this.difficultyTimer = 0;
  }

  update(delta) {
    this.elapsedTime += delta;
    this.attackTimer += delta;
    this.powerupTimer += delta;
    this.difficultyTimer += delta;

    // Difficulty ramp
    if (this.difficultyTimer >= SPAWN.DIFFICULTY_INCREASE_EVERY) {
      this.difficultyTimer = 0;
      this.attackInterval = Math.max(
        SPAWN.ATTACK_INTERVAL_MIN,
        this.attackInterval * SPAWN.ATTACK_INTERVAL_RAMP
      );
      this.powerupInterval = Math.max(
        SPAWN.POWERUP_INTERVAL_MIN,
        this.powerupInterval * SPAWN.POWERUP_INTERVAL_RAMP
      );
    }

    // Spawn attacks
    if (this.attackTimer >= this.attackInterval) {
      this.attackTimer = 0;
      this.spawnAttack();
    }

    // Spawn power-ups
    if (this.powerupTimer >= this.powerupInterval) {
      this.powerupTimer = 0;
      this.spawnPowerup();
    }

    // Clean up off-screen projectiles
    this.projectiles = this.projectiles.filter(p => {
      if (p.collected || p.isOffScreen()) {
        p.destroy();
        return false;
      }
      return true;
    });
  }

  spawnAttack() {
    // Spawn from Androgenic's position
    const x = this.androgenic.sprite.x + Phaser.Math.Between(-30, 30);
    const y = this.androgenic.sprite.y + ANDROGENIC.HEIGHT * 0.3;

    const type = Math.random() < 0.5 ? ProjectileType.WIG : ProjectileType.HAT;
    const speed = Phaser.Math.Between(
      PROJECTILE.ATTACK_SPEED_MIN,
      PROJECTILE.ATTACK_SPEED_MAX
    );

    const projectile = new Projectile(this.scene, x, y, type, speed);

    // Add slight horizontal drift for variety
    const drift = Phaser.Math.Between(-60, 60) * (GAME.WIDTH / 960);
    projectile.sprite.body.setVelocityX(drift);

    // Spin the projectile
    this.scene.tweens.add({
      targets: projectile.sprite,
      angle: 360,
      duration: 1200,
      repeat: -1,
    });

    this.projectiles.push(projectile);
    eventBus.emit(Events.ANDROGENIC_THROW, { type });
  }

  spawnPowerup() {
    // Spawn from random position at top, outside the safe zone
    const margin = PROJECTILE.POWERUP_WIDTH;
    const x = Phaser.Math.Between(margin, GAME.WIDTH - margin);
    const y = SAFE_ZONE.TOP;

    const type = Math.random() < 0.5 ? ProjectileType.SHAKE : ProjectileType.DUMBBELL;
    const speed = Phaser.Math.Between(
      PROJECTILE.POWERUP_SPEED_MIN,
      PROJECTILE.POWERUP_SPEED_MAX
    );

    const projectile = new Projectile(this.scene, x, y, type, speed);

    // Gentle floating effect
    this.scene.tweens.add({
      targets: projectile.sprite,
      angle: { from: -15, to: 15 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.projectiles.push(projectile);
  }

  /**
   * Get all active projectiles for collision checking.
   */
  getProjectiles() {
    return this.projectiles;
  }

  /**
   * Get all attacks (for frame mog clearing).
   */
  getAttacks() {
    return this.projectiles.filter(p => p.category === 'attack');
  }

  /**
   * Clear all attacks on screen (frame mog effect).
   * Returns the number cleared.
   */
  clearAllAttacks() {
    let cleared = 0;
    this.projectiles = this.projectiles.filter(p => {
      if (p.category === 'attack') {
        // Explode effect
        this.scene.tweens.add({
          targets: p.sprite,
          scaleX: 2,
          scaleY: 2,
          alpha: 0,
          duration: 300,
          onComplete: () => p.destroy(),
        });
        cleared++;
        return false;
      }
      return true;
    });
    return cleared;
  }

  destroy() {
    this.projectiles.forEach(p => p.destroy());
    this.projectiles = [];
  }
}
