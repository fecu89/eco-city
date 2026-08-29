// =============================================================================
// Opponent.js — Biden AI. Moves left/right with sinusoidal + random offset
// pattern. Throws projectiles at regular intervals aimed at player position.
//
// Placeholder box (real model loaded in Step 1.5).
// Only has idle animation — plays idle at all times.
// =============================================================================

import * as THREE from 'three';
import { OPPONENT, ARENA, BIDEN_CLIPS, ASSET_PATHS, MODEL_CONFIG } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { loadAnimatedModel } from '../level/AssetLoader.js';

export class Opponent {
  constructor(scene) {
    this.scene = scene;
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;
    this.model = null;
    this.ready = false;

    // AI state
    this._time = 0;
    this._throwTimer = OPPONENT.THROW_INTERVAL;
    this._randomOffset = 0;
    this._randomTarget = 0;
    this._randomLerpSpeed = 1.5;

    // Group is the position anchor
    this.mesh = new THREE.Group();
    this.mesh.position.set(OPPONENT.START_X, OPPONENT.START_Y, OPPONENT.START_Z);
    this.scene.add(this.mesh);

    this._loadModel();
  }

  async _loadModel() {
    try {
      const { model, clips } = await loadAnimatedModel(ASSET_PATHS.BIDEN_MODEL);
      const cfg = MODEL_CONFIG.biden;
      model.scale.setScalar(cfg.scale);
      model.position.y = cfg.offsetY;

      // Face toward player (+Z direction)
      model.rotation.y = cfg.facingOffset;

      this.model = model;
      this.mesh.add(model);

      // Set up mixer + actions
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of clips) {
        this.actions[clip.name] = this.mixer.clipAction(clip);
      }

      // Start idle
      const idleClip = cfg.clipMap.idle;
      if (this.actions[idleClip]) {
        this.actions[idleClip].play();
        this.activeAction = this.actions[idleClip];
      }

      this.ready = true;
      console.log('Biden animations:', Object.keys(this.actions).join(', '));
    } catch (err) {
      console.warn('Biden model failed, using fallback box:', err.message);
      this._createFallbackBox();
    }
  }

  _createFallbackBox() {
    const geo = new THREE.BoxGeometry(OPPONENT.SIZE_W, OPPONENT.SIZE_H, OPPONENT.SIZE_D);
    const mat = new THREE.MeshLambertMaterial({ color: OPPONENT.COLOR });
    const box = new THREE.Mesh(geo, mat);
    box.castShadow = true;
    box.position.y = OPPONENT.SIZE_H / 2;
    this.mesh.add(box);
    this.ready = true;
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} playerPos — current player position for aiming
   */
  update(delta, playerPos) {
    if (this.mixer) this.mixer.update(delta);
    if (!this.ready) return;

    this._time += delta;

    // Sinusoidal left/right movement + random offset
    this._randomTarget = (Math.random() - 0.5) * OPPONENT.RANDOM_OFFSET * 2;
    this._randomOffset += (this._randomTarget - this._randomOffset) * this._randomLerpSpeed * delta;

    const baseX = Math.sin(this._time * OPPONENT.MOVE_FREQUENCY * Math.PI * 2) * OPPONENT.MOVE_AMPLITUDE;
    const targetX = baseX + this._randomOffset;

    // Smoothly move toward target
    const diff = targetX - this.mesh.position.x;
    const step = OPPONENT.SPEED * delta;
    if (Math.abs(diff) > step) {
      this.mesh.position.x += Math.sign(diff) * step;
    } else {
      this.mesh.position.x = targetX;
    }

    // Clamp to arena bounds
    const halfArena = ARENA.WIDTH / 2 - 0.5;
    this.mesh.position.x = Math.max(-halfArena, Math.min(halfArena, this.mesh.position.x));

    // Throw timer
    this._throwTimer -= delta;
    if (this._throwTimer <= 0) {
      this._throwTimer = OPPONENT.THROW_INTERVAL;

      // Aim at player with slight prediction
      const aimX = playerPos ? playerPos.x + (Math.random() - 0.5) * 2 : 0;

      eventBus.emit(Events.OPPONENT_THROW, {
        x: this.mesh.position.x,
        y: this.mesh.position.y + OPPONENT.SIZE_H * 0.6,
        z: this.mesh.position.z,
        targetX: aimX,
        targetZ: playerPos ? playerPos.z : OPPONENT.START_Z + 10,
      });
    }
  }

  reset() {
    this.mesh.position.set(OPPONENT.START_X, OPPONENT.START_Y, OPPONENT.START_Z);
    this._time = 0;
    this._throwTimer = OPPONENT.THROW_INTERVAL;
    this._randomOffset = 0;
    this._randomTarget = 0;
  }

  destroy() {
    if (this.mixer) this.mixer.stopAllAction();
    this.mesh.traverse((c) => {
      if (c.isMesh) {
        c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      }
    });
    this.scene.remove(this.mesh);
  }
}
