import * as THREE from 'three';
import { HOMEOWNER } from '../core/Constants.js';
import { loadModel } from '../level/AssetLoader.js';

// Shared model cache — load once, clone for each spawn
let _modelTemplate = null;
let _modelLoadFailed = false;

// Preload on import
loadModel(HOMEOWNER.MODEL_PATH)
  .then((m) => { _modelTemplate = m; })
  .catch(() => { _modelLoadFailed = true; });

export class Homeowner {
  constructor(housePos, side) {
    this.alive = true;
    this.timeAlive = 0;
    this.dropTimer = 0;
    this.pendingDrops = [];

    // Container
    this.mesh = new THREE.Group();

    // Position at house exit
    const exitX = side === 'left'
      ? housePos.x + 2
      : housePos.x - 2;
    this.mesh.position.set(exitX, 0, housePos.z);

    // Try to use the GLB model, fall back to primitives
    if (_modelTemplate && !_modelLoadFailed) {
      const clone = _modelTemplate.clone(true);
      clone.scale.setScalar(HOMEOWNER.MODEL_SCALE);
      clone.position.y = HOMEOWNER.MODEL_OFFSET_Y;
      clone.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.castShadow = true;
        }
      });
      this.mesh.add(clone);
      this._modelNode = clone;
      // No separate arm/head meshes for arm-waving — use whole-body oscillation
      this.bodyMesh = null;
      this.headMesh = null;
      this.leftArm = null;
      this.rightArm = null;
    } else {
      this._buildPrimitive();
    }

    // Random run direction (away from house, somewhat toward street)
    const awayX = side === 'left' ? 1 : -1;
    this.runDir = new THREE.Vector3(
      awayX * (0.5 + Math.random() * 0.5),
      0,
      (Math.random() - 0.5) * 2
    ).normalize();
  }

  _buildPrimitive() {
    const color = HOMEOWNER.COLORS[Math.floor(Math.random() * HOMEOWNER.COLORS.length)];

    // Body (torso)
    const bodyGeo = new THREE.BoxGeometry(HOMEOWNER.BODY_WIDTH, HOMEOWNER.BODY_HEIGHT, HOMEOWNER.BODY_DEPTH);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = HOMEOWNER.BODY_HEIGHT / 2 + 0.1;
    this.mesh.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(HOMEOWNER.HEAD_RADIUS, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.y = HOMEOWNER.BODY_HEIGHT + HOMEOWNER.HEAD_RADIUS + 0.1;
    this.mesh.add(this.headMesh);

    // Left arm
    const armGeo = new THREE.BoxGeometry(HOMEOWNER.ARM_WIDTH, HOMEOWNER.ARM_HEIGHT, HOMEOWNER.ARM_WIDTH);
    const armMat = new THREE.MeshLambertMaterial({ color });
    this.leftArm = new THREE.Mesh(armGeo, armMat);
    this.leftArm.position.set(
      -(HOMEOWNER.BODY_WIDTH / 2 + HOMEOWNER.ARM_WIDTH / 2 + 0.02),
      HOMEOWNER.BODY_HEIGHT * 0.7,
      0
    );
    this.mesh.add(this.leftArm);

    // Right arm
    this.rightArm = new THREE.Mesh(armGeo, armMat.clone());
    this.rightArm.position.set(
      HOMEOWNER.BODY_WIDTH / 2 + HOMEOWNER.ARM_WIDTH / 2 + 0.02,
      HOMEOWNER.BODY_HEIGHT * 0.7,
      0
    );
    this.mesh.add(this.rightArm);
  }

  update(delta) {
    if (!this.alive) return;

    this.timeAlive += delta;

    // Move in panic direction
    this.mesh.position.addScaledVector(this.runDir, HOMEOWNER.SPEED * delta);

    // Animate based on whether we have the GLB or primitive
    if (this.leftArm) {
      // Primitive: arm-waving animation
      const wave = Math.sin(this.timeAlive * 12) * 1.2;
      this.leftArm.rotation.z = wave;
      this.rightArm.rotation.z = -wave;
      this.headMesh.rotation.z = Math.sin(this.timeAlive * 8) * 0.3;
    } else if (this._modelNode) {
      // GLB model: wobble the whole model for panic effect
      this._modelNode.rotation.z = Math.sin(this.timeAlive * 10) * 0.15;
      this._modelNode.rotation.x = Math.sin(this.timeAlive * 7) * 0.1;
    }

    // Occasional direction change for erratic movement
    if (Math.random() < delta * 2) {
      this.runDir.x += (Math.random() - 0.5) * 0.5;
      this.runDir.z += (Math.random() - 0.5) * 0.5;
      this.runDir.normalize();
    }

    // Drop panic points at intervals
    this.dropTimer += delta;
    if (this.dropTimer >= HOMEOWNER.DROP_INTERVAL) {
      this.dropTimer -= HOMEOWNER.DROP_INTERVAL;
      this.pendingDrops.push({
        x: this.mesh.position.x,
        z: this.mesh.position.z,
      });
    }

    // Expire after duration
    if (this.timeAlive >= HOMEOWNER.PANIC_DURATION) {
      this.alive = false;
    }
  }

  /** Returns and clears pending panic point drop positions */
  consumeDrops() {
    const drops = this.pendingDrops;
    this.pendingDrops = [];
    return drops;
  }

  dispose(scene) {
    this.mesh.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    scene.remove(this.mesh);
  }
}
