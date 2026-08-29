import * as THREE from 'three';
import { ENVELOPE } from '../core/Constants.js';

const _envelopeGeo = new THREE.BoxGeometry(ENVELOPE.WIDTH, ENVELOPE.HEIGHT, ENVELOPE.DEPTH);
const _envelopeMat = new THREE.MeshLambertMaterial({ color: ENVELOPE.COLOR });

export class Envelope {
  /**
   * @param {THREE.Vector3} startPos - Player position at throw time
   * @param {THREE.Vector3} direction - Normalized flight direction (XZ plane)
   * @param {THREE.Vector3|null} targetPos - Optional house position to aim at
   */
  constructor(startPos, direction, targetPos) {
    this.mesh = new THREE.Mesh(_envelopeGeo, _envelopeMat.clone());
    this.mesh.position.copy(startPos);
    this.mesh.position.y += 1; // launch from player chest height

    this.direction = direction.clone().normalize();
    this.startPos = startPos.clone();
    this.startPos.y += 1;
    this.alive = true;
    this.distanceTraveled = 0;

    // Arc parameters for targeted throws
    this.targetPos = targetPos ? targetPos.clone() : null;
    if (this.targetPos) {
      // Compute total flight distance for arc timing
      const dx = this.targetPos.x - this.startPos.x;
      const dz = this.targetPos.z - this.startPos.z;
      this.totalFlightDist = Math.sqrt(dx * dx + dz * dz);
      // Target the mailbox area (y=1 at house base)
      this.targetPos.y = 1;
    } else {
      this.totalFlightDist = 0;
    }
  }

  update(delta) {
    if (!this.alive) return;

    const moveAmount = ENVELOPE.SPEED * delta;
    this.mesh.position.addScaledVector(this.direction, moveAmount);
    this.distanceTraveled += moveAmount;

    // Parabolic arc on Y axis for targeted throws
    if (this.targetPos && this.totalFlightDist > 0) {
      const t = Math.min(this.distanceTraveled / this.totalFlightDist, 1);
      // Parabola: 4h*t*(1-t) peaks at t=0.5
      const arcY = 4 * ENVELOPE.ARC_HEIGHT * t * (1 - t);
      this.mesh.position.y = this.startPos.y + arcY;
    }

    // Spin for visual flair
    this.mesh.rotation.y += ENVELOPE.SPIN_SPEED * delta;
    this.mesh.rotation.x += ENVELOPE.SPIN_SPEED * 0.5 * delta;

    // Auto-destroy after max distance
    if (this.distanceTraveled >= ENVELOPE.MAX_DISTANCE) {
      this.alive = false;
    }
  }

  checkHouse(house) {
    if (!this.alive || house.isHit) return false;

    const dx = this.mesh.position.x - house.mesh.position.x;
    const dz = this.mesh.position.z - house.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    return dist < ENVELOPE.COLLISION_THRESHOLD;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.material.dispose();
  }
}
