import * as THREE from 'three';
import { AGENT } from '../core/Constants.js';
import { loadModel } from '../level/AssetLoader.js';

// Shared model cache — load once, clone for each spawn
let _modelTemplate = null;
let _modelLoadFailed = false;

// Preload on import
loadModel(AGENT.MODEL_PATH)
  .then((m) => { _modelTemplate = m; })
  .catch(() => { _modelLoadFailed = true; });

export class Agent {
  constructor(x, z) {
    this.alive = true;
    this.hasCollided = false;

    // Container
    this.mesh = new THREE.Group();
    this.mesh.position.set(x, 0, z);

    // Walking animation state
    this._walkTime = Math.random() * Math.PI * 2;

    // Try GLB model, fall back to primitives
    if (_modelTemplate && !_modelLoadFailed) {
      const clone = _modelTemplate.clone(true);
      clone.scale.setScalar(AGENT.MODEL_SCALE);
      clone.position.y = AGENT.MODEL_OFFSET_Y;
      clone.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.castShadow = true;
        }
      });
      this.mesh.add(clone);
      this._modelNode = clone;
      this.bodyMesh = null;
      this.sign = null;
    } else {
      this._buildPrimitive();
    }
  }

  _buildPrimitive() {
    // Body (dark suit)
    const bodyGeo = new THREE.BoxGeometry(AGENT.BODY_WIDTH, AGENT.BODY_HEIGHT, AGENT.BODY_DEPTH);
    const bodyMat = new THREE.MeshLambertMaterial({ color: AGENT.COLOR_BODY });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = AGENT.BODY_HEIGHT / 2 + 0.1;
    this.bodyMesh.castShadow = true;
    this.mesh.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(AGENT.HEAD_RADIUS, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: AGENT.COLOR_HEAD });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = AGENT.BODY_HEIGHT + AGENT.HEAD_RADIUS + 0.15;
    this.mesh.add(headMesh);

    // FOR SALE sign
    const signGeo = new THREE.BoxGeometry(AGENT.SIGN_WIDTH, AGENT.SIGN_HEIGHT, AGENT.SIGN_DEPTH);
    const signMat = new THREE.MeshLambertMaterial({ color: AGENT.COLOR_SIGN });
    this.sign = new THREE.Mesh(signGeo, signMat);
    this.sign.position.set(
      AGENT.BODY_WIDTH / 2 + AGENT.SIGN_WIDTH / 2 + 0.1,
      AGENT.BODY_HEIGHT * 0.6,
      0
    );
    this.mesh.add(this.sign);

    // Sign post
    const postGeo = new THREE.BoxGeometry(0.04, 0.8, 0.04);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(
      AGENT.BODY_WIDTH / 2 + AGENT.SIGN_WIDTH / 2 + 0.1,
      AGENT.BODY_HEIGHT * 0.6 - AGENT.SIGN_HEIGHT / 2 - 0.4,
      0
    );
    this.mesh.add(post);
  }

  update(delta, playerZ) {
    if (!this.alive) return;

    // Walk toward the player (positive Z direction, since player runs -Z)
    this.mesh.position.z += AGENT.SPEED * delta;

    // Walking animation
    this._walkTime += delta * 8;

    if (this._modelNode) {
      // GLB model: walking wobble
      this.mesh.position.y = Math.abs(Math.sin(this._walkTime)) * 0.08;
      this._modelNode.rotation.z = Math.sin(this._walkTime) * 0.05;
    } else {
      // Primitive: bob up/down and sway
      this.mesh.position.y = Math.abs(Math.sin(this._walkTime)) * 0.08;
      if (this.bodyMesh) this.bodyMesh.rotation.z = Math.sin(this._walkTime) * 0.05;
      if (this.sign) this.sign.rotation.z = Math.sin(this._walkTime * 0.7) * 0.1;
    }

    // Clean up if passed well behind the player
    if (this.mesh.position.z > playerZ + 10) {
      this.alive = false;
    }
  }

  checkPlayer(playerPos) {
    if (!this.alive || this.hasCollided) return false;
    const dx = this.mesh.position.x - playerPos.x;
    const dz = this.mesh.position.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist < AGENT.COLLISION_RADIUS;
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
