// =============================================================================
// HealthBar.js — 3D floating health bar above a robot's head
//
// Uses two planes: background (dark) and foreground (colored).
// Foreground width scales with health percentage.
// =============================================================================

import * as THREE from 'three';
import { HEALTH_BAR, COLORS, ROBOT } from '../core/Constants.js';

export class HealthBar {
  /**
   * @param {number} color — fill color (e.g. green for player, orange for opponent)
   */
  constructor(color) {
    this.group = new THREE.Group();
    this.maxWidth = HEALTH_BAR.WIDTH;
    this.fillColor = color;

    // Background bar
    const bgGeo = new THREE.PlaneGeometry(HEALTH_BAR.WIDTH, HEALTH_BAR.HEIGHT);
    const bgMat = new THREE.MeshBasicMaterial({
      color: COLORS.HEALTH_BAR_BG,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.bg = new THREE.Mesh(bgGeo, bgMat);
    this.bg.renderOrder = 999;
    this.group.add(this.bg);

    // Foreground fill bar
    const fillGeo = new THREE.PlaneGeometry(HEALTH_BAR.WIDTH, HEALTH_BAR.HEIGHT);
    this.fillMat = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.fill = new THREE.Mesh(fillGeo, this.fillMat);
    this.fill.renderOrder = 1000;
    this.fill.position.z = 0.001; // Slightly in front of bg
    this.group.add(this.fill);

    // Position above robot head
    this.group.position.y = ROBOT.HEAD_Y + ROBOT.HEAD_SIZE / 2 + HEALTH_BAR.Y_OFFSET;
  }

  /**
   * Update the bar to reflect current health.
   * @param {number} percent — 0 to 1
   * @param {THREE.Camera} camera — used to billboard the bar
   */
  update(percent, camera) {
    const clamped = Math.max(0, Math.min(1, percent));

    // Scale fill bar width
    this.fill.scale.x = clamped;
    // Offset to keep left-aligned
    this.fill.position.x = -(1 - clamped) * this.maxWidth / 2;

    // Color: switch to red when low
    if (clamped < HEALTH_BAR.LOW_THRESHOLD) {
      this.fillMat.color.setHex(COLORS.HEALTH_BAR_LOW);
    } else {
      this.fillMat.color.setHex(this.fillColor);
    }

    // Billboard: always face camera
    if (camera) {
      this.group.lookAt(camera.position);
    }
  }

  dispose() {
    this.bg.geometry.dispose();
    this.bg.material.dispose();
    this.fill.geometry.dispose();
    this.fill.material.dispose();
  }
}
