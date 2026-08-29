// =============================================================================
// Player.js — Trump character. Left/right movement + projectile throw.
//
// Uses placeholder box (real model loaded in Step 1.5).
// Gesture animations: idle, point (throw), clap (hit), dance (combo), twist (dodge).
// Since this is a gesture model (no walk/run), the character SLIDES when moving
// while playing idle animation — standard for arena battle games.
// =============================================================================

import * as THREE from 'three';
import { PLAYER, ARENA, TRUMP_CLIPS, ASSET_PATHS, MODEL_CONFIG } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { loadAnimatedModel } from '../level/AssetLoader.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;
    this.model = null;
    this.ready = false;

    // Throw cooldown
    this.throwCooldown = 0;
    this._spaceWasDown = false; // For edge detection on keyboard

    // Gesture animation timer (return to idle after gesture)
    this._gestureTimer = 0;
    this._currentGesture = null;

    // Group is the position anchor
    this.mesh = new THREE.Group();
    this.mesh.position.set(PLAYER.START_X, PLAYER.START_Y, PLAYER.START_Z);
    this.scene.add(this.mesh);

    this._loadModel();
  }

  async _loadModel() {
    try {
      const { model, clips } = await loadAnimatedModel(ASSET_PATHS.TRUMP_MODEL);
      const cfg = MODEL_CONFIG.trump;
      model.scale.setScalar(cfg.scale);
      model.position.y = cfg.offsetY;

      // Face toward opponent (-Z direction)
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
      console.log('Trump animations:', Object.keys(this.actions).join(', '));
    } catch (err) {
      console.warn('Trump model failed, using fallback box:', err.message);
      this._createFallbackBox();
    }
  }

  _createFallbackBox() {
    const geo = new THREE.BoxGeometry(PLAYER.SIZE_W, PLAYER.SIZE_H, PLAYER.SIZE_D);
    const mat = new THREE.MeshLambertMaterial({ color: PLAYER.COLOR });
    const box = new THREE.Mesh(geo, mat);
    box.castShadow = true;
    box.position.y = PLAYER.SIZE_H / 2;
    this.mesh.add(box);
    this.ready = true;
  }

  fadeToAction(key, duration = 0.3) {
    const clipName = TRUMP_CLIPS[key];
    const next = this.actions[clipName];
    if (!next || next === this.activeAction) return;

    if (this.activeAction) this.activeAction.fadeOut(duration);
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
    this.activeAction = next;
  }

  /**
   * Play a one-shot gesture, then return to idle after duration.
   */
  playGesture(key, duration = 0.8) {
    this._currentGesture = key;
    this._gestureTimer = duration;
    this.fadeToAction(key, 0.2);
  }

  /**
   * @param {number} delta
   * @param {InputSystem} input
   */
  update(delta, input) {
    if (this.mixer) this.mixer.update(delta);
    if (!this.ready) return;

    // Update throw cooldown
    if (this.throwCooldown > 0) {
      this.throwCooldown -= delta;
    }

    // Update gesture timer
    if (this._gestureTimer > 0) {
      this._gestureTimer -= delta;
      if (this._gestureTimer <= 0) {
        this._currentGesture = null;
        this.fadeToAction('idle', 0.3);
      }
    }

    // Movement — left/right only
    const moveDir = input.moveX;
    if (moveDir !== 0) {
      const newX = this.mesh.position.x + moveDir * PLAYER.SPEED * delta;
      // Clamp to arena bounds
      const halfArena = ARENA.WIDTH / 2 - 0.5;
      this.mesh.position.x = Math.max(-halfArena, Math.min(halfArena, newX));
    }

    // Throw projectile — edge detection (fire on press, not hold)
    const throwDown = input.throwAction;
    const shouldThrow = throwDown && !this._spaceWasDown;

    if (shouldThrow && this.throwCooldown <= 0 && !gameState.gameOver) {
      this.throwCooldown = PLAYER.THROW_COOLDOWN;
      this.playGesture('point', 0.5);
      eventBus.emit(Events.PLAYER_THROW, {
        x: this.mesh.position.x,
        y: this.mesh.position.y + PLAYER.SIZE_H * 0.6,
        z: this.mesh.position.z,
      });
    }

    this._spaceWasDown = throwDown;

    // Idle animation when not in a gesture
    if (!this._currentGesture && moveDir === 0) {
      this.fadeToAction('idle', 0.3);
    }
  }

  /**
   * Called when player successfully hits opponent.
   */
  onHitOpponent() {
    if (gameState.combo >= 3) {
      this.playGesture('dance', 1.2);
    } else {
      this.playGesture('clap', 0.8);
    }
  }

  /**
   * Called when player takes damage.
   */
  onTakeDamage() {
    this.playGesture('twist', 0.6);
  }

  reset() {
    this.mesh.position.set(PLAYER.START_X, PLAYER.START_Y, PLAYER.START_Z);
    this.throwCooldown = 0;
    this._spaceWasDown = false;
    this._gestureTimer = 0;
    this._currentGesture = null;
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
