// =============================================================================
// Projectile.js — Single projectile: parabolic arc trajectory, impact detection
// Glowing sphere that arcs from castle to target, with splash damage on impact.
// =============================================================================

import * as THREE from 'three';
import { PROJECTILE } from '../core/Constants.js';

export class Projectile {
  constructor(scene, startPos, targetPos) {
    this.scene = scene;
    this.alive = true;
    this.impacted = false;
    this.elapsed = 0;

    // Store start and target
    this.startPos = startPos.clone();
    this.targetPos = targetPos.clone();

    // Build glowing projectile
    this.group = new THREE.Group();

    const geo = new THREE.SphereGeometry(PROJECTILE.RADIUS, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: PROJECTILE.COLOR });
    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);

    // Glow effect (slightly larger transparent sphere)
    const glowGeo = new THREE.SphereGeometry(PROJECTILE.RADIUS * 1.8, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: PROJECTILE.GLOW_COLOR,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    this.group.add(glow);

    // Trail — small point light
    this.light = new THREE.PointLight(PROJECTILE.COLOR, 1, 8);
    this.group.add(this.light);

    this.group.position.copy(this.startPos);
    this.scene.add(this.group);
  }

  update(delta) {
    if (!this.alive) return;

    this.elapsed += delta;
    const t = Math.min(this.elapsed / PROJECTILE.TRAVEL_TIME, 1);

    // Linear interpolation for x and z
    const x = this.startPos.x + (this.targetPos.x - this.startPos.x) * t;
    const z = this.startPos.z + (this.targetPos.z - this.startPos.z) * t;

    // Parabolic arc for y: starts at startY, peaks at ARC_HEIGHT, ends at 0
    const startY = this.startPos.y;
    const endY = 0.5; // Just above ground
    const linearY = startY + (endY - startY) * t;
    const arcOffset = PROJECTILE.ARC_HEIGHT * 4 * t * (1 - t); // Parabola peaks at t=0.5
    const y = linearY + arcOffset;

    this.group.position.set(x, y, z);

    // Pulse the glow
    this.light.intensity = 0.5 + Math.sin(this.elapsed * 15) * 0.3;

    // Check impact (reached target)
    if (t >= 1) {
      this.impacted = true;
      this.alive = false;
    }
  }

  getPosition() {
    return this.group.position;
  }

  getTargetPosition() {
    return this.targetPos;
  }

  destroy() {
    this.scene.remove(this.group);
    this.group.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
  }
}
