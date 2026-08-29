// =============================================================================
// ProjectileManager.js — Spawns, updates, and manages collision for all
// projectiles. Emits PLAYER_HIT / OPPONENT_HIT events on collision.
// =============================================================================

import * as THREE from 'three';
import { PROJECTILE, PLAYER, OPPONENT, SCORING } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { Projectile, disposeSharedProjectileAssets } from './Projectile.js';

const _dir = new THREE.Vector3();

export class ProjectileManager {
  constructor(scene) {
    this.scene = scene;
    this.projectiles = [];

    // Subscribe to throw events
    eventBus.on(Events.PLAYER_THROW, (data) => this.spawnPlayerProjectile(data));
    eventBus.on(Events.OPPONENT_THROW, (data) => this.spawnOpponentProjectile(data));
  }

  /**
   * Spawn a player projectile aimed straight at opponent side (toward -Z).
   */
  spawnPlayerProjectile({ x, y, z }) {
    _dir.set(0, 0, -1); // Toward opponent
    const origin = new THREE.Vector3(x, y, z);
    const proj = new Projectile(true, origin, _dir);
    this.scene.add(proj.mesh);
    this.projectiles.push(proj);
  }

  /**
   * Spawn an opponent projectile aimed at player position with slight prediction.
   */
  spawnOpponentProjectile({ x, y, z, targetX, targetZ }) {
    const origin = new THREE.Vector3(x, y, z);
    _dir.set(targetX - x, 0, targetZ - z).normalize();
    const proj = new Projectile(false, origin, _dir);
    this.scene.add(proj.mesh);
    this.projectiles.push(proj);
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {THREE.Vector3} opponentPos
   */
  update(delta, playerPos, opponentPos) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.update(delta);

      if (!proj.alive) {
        this._removeProjectile(i);
        continue;
      }

      // Collision detection — sphere vs sphere
      if (proj.isPlayer && opponentPos) {
        // Player projectile hitting opponent
        const dx = proj.mesh.position.x - opponentPos.x;
        const dy = proj.mesh.position.y - (opponentPos.y + OPPONENT.SIZE_H * 0.5);
        const dz = proj.mesh.position.z - opponentPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < PROJECTILE.SIZE + OPPONENT.HIT_RADIUS) {
          // Hit opponent!
          proj.alive = false;
          this._removeProjectile(i);

          // Update score
          gameState.incrementCombo();
          const comboBonus = (gameState.combo >= SCORING.COMBO_THRESHOLD) ? SCORING.COMBO_BONUS : 0;
          const points = SCORING.HIT_POINTS + comboBonus;
          gameState.addScore(points);

          eventBus.emit(Events.OPPONENT_HIT, {
            x: opponentPos.x,
            y: opponentPos.y + OPPONENT.SIZE_H * 0.5,
            z: opponentPos.z,
            combo: gameState.combo,
            points,
          });
          eventBus.emit(Events.SCORE_CHANGED, { score: gameState.score });
          eventBus.emit(Events.COMBO_CHANGED, { combo: gameState.combo });

          // Spectacle events
          if (gameState.combo >= SCORING.COMBO_THRESHOLD) {
            eventBus.emit(Events.SPECTACLE_COMBO, { combo: gameState.combo });
          }
          eventBus.emit(Events.SPECTACLE_HIT, {
            x: opponentPos.x,
            y: opponentPos.y + OPPONENT.SIZE_H * 0.5,
            z: opponentPos.z,
          });
          continue;
        }
      }

      if (!proj.isPlayer && playerPos) {
        // Opponent projectile hitting player
        const dx = proj.mesh.position.x - playerPos.x;
        const dy = proj.mesh.position.y - (playerPos.y + PLAYER.SIZE_H * 0.5);
        const dz = proj.mesh.position.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < PROJECTILE.SIZE + PLAYER.HIT_RADIUS) {
          // Player got hit!
          proj.alive = false;
          this._removeProjectile(i);

          gameState.takeDamage(1);
          gameState.resetCombo();

          eventBus.emit(Events.PLAYER_HIT, {
            x: playerPos.x,
            y: playerPos.y + PLAYER.SIZE_H * 0.5,
            z: playerPos.z,
            health: gameState.health,
          });
          eventBus.emit(Events.HEALTH_CHANGED, { health: gameState.health });
          eventBus.emit(Events.COMBO_CHANGED, { combo: 0 });
          continue;
        }

        // Near miss detection (for spectacle events)
        if (dist < PROJECTILE.SIZE + PLAYER.HIT_RADIUS * 3 && dist > PROJECTILE.SIZE + PLAYER.HIT_RADIUS) {
          eventBus.emit(Events.SPECTACLE_NEAR_MISS, {
            x: playerPos.x,
            z: playerPos.z,
          });
        }
      }
    }

    // Update combo timer
    if (gameState.comboTimer > 0) {
      gameState.comboTimer -= delta;
      if (gameState.comboTimer <= 0 && gameState.combo > 0) {
        gameState.resetCombo();
        eventBus.emit(Events.COMBO_CHANGED, { combo: 0 });
      }
    }
  }

  _removeProjectile(index) {
    const proj = this.projectiles[index];
    this.scene.remove(proj.mesh);
    proj.dispose();
    this.projectiles.splice(index, 1);
  }

  /**
   * Remove all projectiles — used on restart.
   */
  clear() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this._removeProjectile(i);
    }
  }

  destroy() {
    this.clear();
    disposeSharedProjectileAssets();
  }
}
