// =============================================================================
// PowerupManager.js — Protein shake powerups
// Loads GLB model for the protein shake, with green glow sphere around it.
// Falls back to primitive cylinder if model loading fails.
// =============================================================================

import * as THREE from 'three';
import { POWERUP, ARENA, PLAYER, MODELS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { loadModel } from '../level/AssetLoader.js';

export class PowerupManager {
  constructor(scene) {
    this.scene = scene;
    this.activePowerups = [];
    this._cooldownTimer = POWERUP.SPAWN_INTERVAL;
    this._spawnTimer = 0;
    this._glbTemplate = null;
    this._modelReady = false;

    this._loadGLBModel();
  }

  async _loadGLBModel() {
    try {
      const cfg = MODELS.POWERUP;
      const model = await loadModel(cfg.path);

      // Compute bounding box for debugging
      const bbox = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      console.log('Protein shake GLB bounding box:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));

      // Auto-scale
      model.scale.setScalar(cfg.scale);

      // Center model vertically
      const scaledBbox = new THREE.Box3().setFromObject(model);
      const scaledSize = new THREE.Vector3();
      scaledBbox.getSize(scaledSize);
      model.position.y = -scaledBbox.min.y - scaledSize.y * 0.5;

      this._glbTemplate = model;
      this._modelReady = true;
      console.log('Protein shake GLB loaded successfully');
    } catch (err) {
      console.warn('Protein shake GLB failed to load, using primitive fallback:', err.message);
      this._modelReady = false;
    }
  }

  update(delta, playerPos) {
    if (!gameState.entranceDone || gameState.gameOver) return;

    // Update multiplier timer
    if (gameState.multiplierTimer > 0) {
      gameState.multiplierTimer -= delta;
      if (gameState.multiplierTimer <= 0) {
        gameState.multiplierTimer = 0;
        gameState.multiplier = 1;
      }
    }

    // Spawn timer
    this._cooldownTimer -= delta;
    if (this._cooldownTimer <= 0) {
      this._cooldownTimer = POWERUP.SPAWN_INTERVAL;
      if (Math.random() < POWERUP.SPAWN_CHANCE) {
        this._spawnPowerup();
      }
    }

    // Update active powerups
    for (let i = this.activePowerups.length - 1; i >= 0; i--) {
      const p = this.activePowerups[i];

      // Fall
      p.group.position.y -= POWERUP.FALL_SPEED * delta;

      // Bob and glow pulse
      p.time += delta;
      p.group.rotation.y += delta * 2;
      // Pulse the glow
      if (p.glow) {
        const pulse = 0.5 + Math.sin(p.time * 4) * 0.3;
        p.glow.material.opacity = pulse;
      }

      // Check collection
      const dx = Math.abs(p.group.position.x - playerPos.x);
      const dy = Math.abs(p.group.position.y - (playerPos.y + PLAYER.HEIGHT * 0.5));
      if (dx < PLAYER.CATCH_RADIUS && dy < PLAYER.HEIGHT) {
        this._collectPowerup(p, i);
        continue;
      }

      // Hit floor — just remove, no penalty
      if (p.group.position.y <= 0) {
        this._removePowerup(i);
        continue;
      }
    }
  }

  _spawnPowerup() {
    const group = new THREE.Group();

    if (this._modelReady && this._glbTemplate) {
      // Clone the GLB model
      const modelClone = this._glbTemplate.clone(true);
      // Clone materials for per-instance changes
      modelClone.traverse((c) => {
        if (c.isMesh) {
          c.material = c.material.clone();
        }
      });
      group.add(modelClone);
    } else {
      // Primitive fallback: cylinder body (protein shake)
      const bodyGeo = new THREE.CylinderGeometry(
        POWERUP.RADIUS * 0.4,
        POWERUP.RADIUS * 0.35,
        POWERUP.RADIUS * 1.5,
        8
      );
      const bodyMat = new THREE.MeshLambertMaterial({ color: POWERUP.COLOR });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      group.add(body);

      // Cap
      const capGeo = new THREE.CylinderGeometry(
        POWERUP.RADIUS * 0.3,
        POWERUP.RADIUS * 0.42,
        POWERUP.RADIUS * 0.3,
        8
      );
      const capMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = POWERUP.RADIUS * 0.9;
      group.add(cap);
    }

    // Glow sphere (added around both GLB and primitive versions)
    const glowGeo = new THREE.SphereGeometry(POWERUP.RADIUS * 1.2, 12, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: POWERUP.GLOW_COLOR,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    group.add(glow);

    const x = (Math.random() - 0.5) * (ARENA.WIDTH - 2);
    group.position.set(x, 12, 0);

    this.scene.add(group);

    const powerup = {
      group,
      glow,
      time: 0,
    };

    this.activePowerups.push(powerup);
    eventBus.emit(Events.POWERUP_SPAWN, { x });
  }

  _collectPowerup(p, index) {
    gameState.activateMultiplier();
    eventBus.emit(Events.POWERUP_COLLECTED, { multiplier: POWERUP.MULTIPLIER, duration: POWERUP.DURATION });
    this._removePowerup(index);
  }

  _removePowerup(index) {
    const p = this.activePowerups[index];
    p.group.traverse((c) => {
      if (c.isMesh) {
        c.geometry.dispose();
        if (c.material.dispose) c.material.dispose();
      }
    });
    this.scene.remove(p.group);
    this.activePowerups.splice(index, 1);
  }

  clearAll() {
    for (let i = this.activePowerups.length - 1; i >= 0; i--) {
      this._removePowerup(i);
    }
  }

  destroy() {
    this.clearAll();
    // Dispose GLB template
    if (this._glbTemplate) {
      this._glbTemplate.traverse((c) => {
        if (c.isMesh) {
          c.geometry.dispose();
          if (c.material.dispose) c.material.dispose();
        }
      });
    }
  }
}
