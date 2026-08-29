// =============================================================================
// Player.js — The runner in Crowd Dash
// Auto-runs forward (negative Z). Swerves left/right via moveX from InputSystem.
// Constrained to road width. Has bounding box for collision detection.
// =============================================================================

import * as THREE from 'three';
import { PLAYER, VFX } from '../core/Constants.js';

// Preallocated temp objects to avoid per-frame allocations
const _box = new THREE.Box3();

export class Player {
  constructor(scene) {
    this.scene = scene;

    // Create a simple humanoid: body + head
    this.group = new THREE.Group();

    // Body (capsule-like: box with slight rounded look via cylinder)
    const bodyGeo = new THREE.CylinderGeometry(
      PLAYER.BODY_WIDTH * 0.5,
      PLAYER.BODY_WIDTH * 0.5,
      PLAYER.BODY_HEIGHT,
      8
    );
    const bodyMat = new THREE.MeshLambertMaterial({
      color: PLAYER.COLOR,
      emissive: PLAYER.COLOR,
      emissiveIntensity: 0.3,
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = PLAYER.BODY_HEIGHT * 0.5;
    this.group.add(this.body);

    // Head
    const headGeo = new THREE.SphereGeometry(PLAYER.HEAD_RADIUS, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: PLAYER.HEAD_COLOR });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = PLAYER.BODY_HEIGHT + PLAYER.HEAD_RADIUS * 0.8;
    this.group.add(this.head);

    // Player glow — neon point light attached to player
    this.glowLight = new THREE.PointLight(
      VFX.PLAYER_GLOW_COLOR,
      VFX.PLAYER_GLOW_INTENSITY,
      VFX.PLAYER_GLOW_DISTANCE,
    );
    this.glowLight.position.set(0, PLAYER.BODY_HEIGHT * 0.5, 0);
    this.group.add(this.glowLight);

    // Headlight — spotlight shining ahead of the player
    this.headlight = new THREE.SpotLight(
      VFX.HEADLIGHT_COLOR,
      VFX.HEADLIGHT_INTENSITY,
      VFX.HEADLIGHT_DISTANCE,
      VFX.HEADLIGHT_ANGLE,
      VFX.HEADLIGHT_PENUMBRA,
    );
    this.headlight.position.set(0, VFX.HEADLIGHT_OFFSET_Y, VFX.HEADLIGHT_OFFSET_Z);
    // Target is placed far ahead of the player
    this.headlightTarget = new THREE.Object3D();
    this.headlightTarget.position.set(0, 0.5, -20);
    this.group.add(this.headlightTarget);
    this.headlight.target = this.headlightTarget;
    this.group.add(this.headlight);

    // Position
    this.group.position.set(PLAYER.START_X, PLAYER.START_Y, PLAYER.START_Z);

    // For backward compat — expose mesh as group for camera tracking
    this.mesh = this.group;

    this.scene.add(this.group);
  }

  update(delta, input, speed) {
    // Auto-run forward (negative Z)
    this.group.position.z -= speed * delta;

    // Lateral movement from input
    this.group.position.x += input.moveX * PLAYER.LATERAL_SPEED * delta;

    // Constrain to road
    this.group.position.x = Math.max(
      -PLAYER.ROAD_HALF_WIDTH,
      Math.min(PLAYER.ROAD_HALF_WIDTH, this.group.position.x)
    );

    // Slight tilt when dodging
    this.group.rotation.z = -input.moveX * 0.15;
  }

  /**
   * Returns an axis-aligned bounding box for collision detection.
   * Slightly shrunk by HITBOX_SHRINK for fairness.
   */
  getBoundingBox() {
    const p = this.group.position;
    const hw = PLAYER.BODY_WIDTH * 0.5 * 0.85;
    const hh = (PLAYER.BODY_HEIGHT + PLAYER.HEAD_RADIUS * 2) * 0.5;
    const hd = PLAYER.BODY_DEPTH * 0.5 * 0.85;

    _box.min.set(p.x - hw, p.y, p.z - hd);
    _box.max.set(p.x + hw, p.y + hh * 2, p.z + hd);
    return _box;
  }

  reset() {
    this.group.position.set(PLAYER.START_X, PLAYER.START_Y, PLAYER.START_Z);
    this.group.rotation.set(0, 0, 0);
  }

  destroy() {
    this.body.geometry.dispose();
    this.body.material.dispose();
    this.head.geometry.dispose();
    this.head.material.dispose();
    // Lights are children of the group — removing group removes them
    this.scene.remove(this.group);
  }
}
