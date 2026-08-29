// =============================================================================
// CrowdPerson.js — Crowd entities that the player must dodge
// Simple humanoid shapes (cylinder body + sphere head, various colors).
// Uses object pooling: meshes are reused when they pass behind the camera.
// =============================================================================

import * as THREE from 'three';
import { CROWD } from '../core/Constants.js';

// Shared geometries for all crowd people (performance: reuse across instances)
const _bodyGeo = new THREE.CylinderGeometry(
  CROWD.BODY_WIDTH * 0.5,
  CROWD.BODY_WIDTH * 0.5,
  CROWD.BODY_HEIGHT,
  6
);
const _headGeo = new THREE.SphereGeometry(CROWD.HEAD_RADIUS, 6, 4);
const _headMat = new THREE.MeshLambertMaterial({ color: CROWD.HEAD_COLOR });

// Preallocated temp box for collision
const _box = new THREE.Box3();

export class CrowdPerson {
  constructor(scene) {
    this.scene = scene;
    this.active = false;

    this.group = new THREE.Group();

    // Body — material is unique per person (different clothing colors)
    this.bodyMat = new THREE.MeshLambertMaterial({ color: CROWD.INITIAL_BODY_COLOR });
    this.body = new THREE.Mesh(_bodyGeo, this.bodyMat);
    this.body.position.y = CROWD.BODY_HEIGHT * 0.5;
    this.group.add(this.body);

    // Head — shared material
    this.head = new THREE.Mesh(_headGeo, _headMat);
    this.head.position.y = CROWD.BODY_HEIGHT + CROWD.HEAD_RADIUS * 0.7;
    this.group.add(this.head);

    // Start hidden
    this.group.visible = false;
    this.scene.add(this.group);
  }

  /**
   * Activate this person at a given position with a random color.
   */
  activate(x, z) {
    this.active = true;
    this.group.position.set(x, 0, z);
    this.group.visible = true;

    // Random clothing color
    const colorIndex = Math.floor(Math.random() * CROWD.COLORS.length);
    this.bodyMat.color.setHex(CROWD.COLORS[colorIndex]);

    // Random slight rotation for variety
    this.group.rotation.y = (Math.random() - 0.5) * 0.5;
  }

  deactivate() {
    this.active = false;
    this.group.visible = false;
  }

  /**
   * Returns bounding box for collision detection.
   * Shrunk slightly for fairness.
   */
  getBoundingBox() {
    const p = this.group.position;
    const shrink = CROWD.HITBOX_SHRINK;
    const hw = (CROWD.BODY_WIDTH * 0.5) - shrink;
    const hh = CROWD.BODY_HEIGHT + CROWD.HEAD_RADIUS * 2;
    const hd = (CROWD.BODY_DEPTH * 0.5) - shrink;

    _box.min.set(p.x - hw, p.y, p.z - hd);
    _box.max.set(p.x + hw, p.y + hh, p.z + hd);
    return _box;
  }

  destroy() {
    // Only dispose unique material; shared geo/mat are not disposed per-instance
    this.bodyMat.dispose();
    this.scene.remove(this.group);
  }
}

// =============================================================================
// CrowdPool — Object pool manager for crowd people
// =============================================================================

export class CrowdPool {
  constructor(scene, poolSize) {
    this.scene = scene;
    this.pool = [];

    for (let i = 0; i < poolSize; i++) {
      this.pool.push(new CrowdPerson(scene));
    }
  }

  /**
   * Get an inactive person from the pool, or null if pool is exhausted.
   */
  acquire() {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        return this.pool[i];
      }
    }
    return null;
  }

  /**
   * Deactivate all people that are behind the player.
   */
  recycleBehind(playerZ, despawnDistance) {
    for (let i = 0; i < this.pool.length; i++) {
      const person = this.pool[i];
      if (person.active && person.group.position.z > playerZ + despawnDistance) {
        person.deactivate();
      }
    }
  }

  /**
   * Get count of active people.
   */
  activeCount() {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].active) count++;
    }
    return count;
  }

  /**
   * Get all active people for collision checks.
   */
  getActive() {
    return this.pool.filter(p => p.active);
  }

  /**
   * Deactivate all people (for restart).
   */
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
