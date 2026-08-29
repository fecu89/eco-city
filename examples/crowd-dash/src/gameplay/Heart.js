// =============================================================================
// Heart.js — Collectible hearts that float above the road
// Bright neon pink, glowing emissive material. Rotates and bobs up/down.
// Collected on proximity to player. Uses object pooling.
// =============================================================================

import * as THREE from 'three';
import { HEART, VFX } from '../core/Constants.js';

export class Heart {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this._baseY = HEART.FLOAT_HEIGHT;
    this._time = 0;

    // Create heart shape
    const material = new THREE.MeshLambertMaterial({
      color: HEART.COLOR,
      emissive: HEART.EMISSIVE,
      emissiveIntensity: HEART.EMISSIVE_INTENSITY,
    });
    this.material = material;

    this.group = new THREE.Group();

    const size = HEART.SIZE;

    // Left bump
    const leftGeo = new THREE.SphereGeometry(size * 0.5, 8, 6);
    const leftMesh = new THREE.Mesh(leftGeo, material);
    leftMesh.position.set(-size * 0.28, size * 0.25, 0);
    this.group.add(leftMesh);

    // Right bump
    const rightGeo = new THREE.SphereGeometry(size * 0.5, 8, 6);
    const rightMesh = new THREE.Mesh(rightGeo, material);
    rightMesh.position.set(size * 0.28, size * 0.25, 0);
    this.group.add(rightMesh);

    // Bottom cone
    const coneGeo = new THREE.ConeGeometry(size * 0.55, size * 0.7, 8);
    const coneMesh = new THREE.Mesh(coneGeo, material);
    coneMesh.position.set(0, -size * 0.15, 0);
    coneMesh.rotation.z = Math.PI;
    this.group.add(coneMesh);

    this._geometries = [leftGeo, rightGeo, coneGeo];

    // Pink glow light — casts a faint pink light from the heart
    this.glowLight = new THREE.PointLight(
      VFX.HEART_GLOW_COLOR,
      VFX.HEART_GLOW_INTENSITY,
      VFX.HEART_GLOW_DISTANCE,
    );
    this.glowLight.position.set(0, 0, 0);
    this.group.add(this.glowLight);

    // Start hidden
    this.group.visible = false;
    this.scene.add(this.group);
  }

  activate(x, z) {
    this.active = true;
    this._time = Math.random() * Math.PI * 2; // Random phase offset for variety
    this.group.position.set(x, this._baseY, z);
    this.group.rotation.set(0, 0, 0);
    this.group.visible = true;
  }

  deactivate() {
    this.active = false;
    this.group.visible = false;
  }

  update(delta) {
    if (!this.active) return;

    this._time += delta;

    // Bob up and down
    this.group.position.y = this._baseY + Math.sin(this._time * HEART.BOB_SPEED) * HEART.BOB_AMPLITUDE;

    // Rotate
    this.group.rotation.y += HEART.ROTATION_SPEED * delta;
  }

  /**
   * Check if player is close enough to collect this heart.
   * Simple distance check in XZ plane.
   */
  isCollectedBy(playerPos) {
    if (!this.active) return false;
    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist < HEART.COLLECT_DISTANCE;
  }

  destroy() {
    for (const geo of this._geometries) {
      geo.dispose();
    }
    this.material.dispose();
    this.scene.remove(this.group);
  }
}

// =============================================================================
// HeartPool — Object pool manager for hearts
// =============================================================================

export class HeartPool {
  constructor(scene, poolSize) {
    this.scene = scene;
    this.pool = [];

    for (let i = 0; i < poolSize; i++) {
      this.pool.push(new Heart(scene));
    }
  }

  acquire() {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        return this.pool[i];
      }
    }
    return null;
  }

  recycleBehind(playerZ, despawnDistance) {
    for (let i = 0; i < this.pool.length; i++) {
      const heart = this.pool[i];
      if (heart.active && heart.group.position.z > playerZ + despawnDistance) {
        heart.deactivate();
      }
    }
  }

  updateAll(delta) {
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].active) {
        this.pool[i].update(delta);
      }
    }
  }

  activeCount() {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].active) count++;
    }
    return count;
  }

  getActive() {
    return this.pool.filter(h => h.active);
  }

  deactivateAll() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].deactivate();
    }
  }

  destroy() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].destroy();
    }
    this.pool = [];
  }
}
