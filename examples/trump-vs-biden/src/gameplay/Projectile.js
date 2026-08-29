// =============================================================================
// Projectile.js — Glowing sphere projectile with trail effect.
//
// Moves in a straight line from thrower toward target direction.
// Collision detection done in ProjectileManager (sphere vs sphere).
// =============================================================================

import * as THREE from 'three';
import { PROJECTILE } from '../core/Constants.js';

// Shared geometries and materials (reused across all projectiles)
let _sphereGeo = null;
let _playerMat = null;
let _opponentMat = null;
let _playerGlowMat = null;
let _opponentGlowMat = null;

function getSharedAssets() {
  if (!_sphereGeo) {
    _sphereGeo = new THREE.SphereGeometry(PROJECTILE.SIZE, 12, 8);
    _playerMat = new THREE.MeshStandardMaterial({
      color: PROJECTILE.PLAYER_COLOR,
      emissive: PROJECTILE.PLAYER_COLOR,
      emissiveIntensity: 0.8,
    });
    _opponentMat = new THREE.MeshStandardMaterial({
      color: PROJECTILE.OPPONENT_COLOR,
      emissive: PROJECTILE.OPPONENT_COLOR,
      emissiveIntensity: 0.8,
    });
    _playerGlowMat = new THREE.MeshBasicMaterial({
      color: PROJECTILE.PLAYER_COLOR,
      transparent: true,
      opacity: 0.3,
    });
    _opponentGlowMat = new THREE.MeshBasicMaterial({
      color: PROJECTILE.OPPONENT_COLOR,
      transparent: true,
      opacity: 0.3,
    });
  }
  return { _sphereGeo, _playerMat, _opponentMat, _playerGlowMat, _opponentGlowMat };
}

export class Projectile {
  /**
   * @param {boolean} isPlayer — true = player projectile (red), false = opponent (blue)
   * @param {THREE.Vector3} origin — starting world position
   * @param {THREE.Vector3} direction — normalized direction of travel
   */
  constructor(isPlayer, origin, direction) {
    this.isPlayer = isPlayer;
    this.alive = true;
    this.distanceTraveled = 0;

    const { _sphereGeo, _playerMat, _opponentMat, _playerGlowMat, _opponentGlowMat } = getSharedAssets();

    // Core sphere
    this.mesh = new THREE.Mesh(
      _sphereGeo,
      isPlayer ? _playerMat : _opponentMat,
    );
    this.mesh.position.copy(origin);

    // Outer glow sphere
    const glowGeo = new THREE.SphereGeometry(PROJECTILE.SIZE * 1.8, 8, 6);
    const glowMesh = new THREE.Mesh(
      glowGeo,
      isPlayer ? _playerGlowMat : _opponentGlowMat,
    );
    this.mesh.add(glowMesh);

    // Point light for local illumination
    const lightColor = isPlayer ? PROJECTILE.PLAYER_COLOR : PROJECTILE.OPPONENT_COLOR;
    this.light = new THREE.PointLight(lightColor, 0.5, 3);
    this.mesh.add(this.light);

    // Direction (normalized)
    this.direction = direction.clone().normalize();

    // Velocity
    this.velocity = this.direction.clone().multiplyScalar(PROJECTILE.SPEED);
  }

  update(delta) {
    if (!this.alive) return;

    const dist = PROJECTILE.SPEED * delta;
    this.mesh.position.addScaledVector(this.direction, dist);
    this.distanceTraveled += dist;

    // Kill if too far
    if (this.distanceTraveled > PROJECTILE.MAX_DISTANCE) {
      this.alive = false;
    }
  }

  dispose() {
    this.alive = false;
    // Dispose glow geometry (unique per projectile)
    this.mesh.children.forEach(child => {
      if (child.isMesh) {
        child.geometry.dispose();
        // Do NOT dispose shared materials
      }
    });
    // Remove light
    if (this.light) {
      this.mesh.remove(this.light);
      this.light.dispose();
    }
  }
}

/**
 * Call once on game shutdown to free shared assets.
 */
export function disposeSharedProjectileAssets() {
  if (_sphereGeo) { _sphereGeo.dispose(); _sphereGeo = null; }
  if (_playerMat) { _playerMat.dispose(); _playerMat = null; }
  if (_opponentMat) { _opponentMat.dispose(); _opponentMat = null; }
  if (_playerGlowMat) { _playerGlowMat.dispose(); _playerGlowMat = null; }
  if (_opponentGlowMat) { _opponentGlowMat.dispose(); _opponentGlowMat = null; }
}
