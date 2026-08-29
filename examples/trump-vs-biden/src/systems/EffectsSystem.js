// =============================================================================
// EffectsSystem.js -- All visual effects: particles, screen flash, camera shake,
// projectile trails, combo text, arena glow pulse, slow-mo, entrance animations.
//
// Wired entirely through EventBus. Does NOT alter gameplay mechanics.
// =============================================================================

import * as THREE from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { EFFECTS, PROJECTILE, PLAYER, ARENA, CAMERA } from '../core/Constants.js';

// Easing: easeOutBounce (for entrance animation)
function easeOutBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

export class EffectsSystem {
  constructor(scene, camera, levelBuilder) {
    this.scene = scene;
    this.camera = camera;
    this.levelBuilder = levelBuilder;

    // --- State ---
    this.particleBursts = [];    // Active particle burst groups
    this.trailParticles = [];    // Active trail particles
    this.muzzleFlashes = [];     // Active muzzle flash lights
    this.ambientPoints = null;   // Persistent ambient particle system
    this.elapsedTime = 0;        // Total time for sinusoidal effects

    // Camera shake state
    this.cameraShake = { active: false, intensity: 0, duration: 0, elapsed: 0 };
    this.originalCameraPos = new THREE.Vector3(CAMERA.POSITION_X, CAMERA.POSITION_Y, CAMERA.POSITION_Z);

    // Slow-mo state
    this.slowMo = { active: false, elapsed: 0, duration: 0, factor: 1 };

    // Entrance animation state
    this.entranceAnim = { active: false, elapsed: 0, duration: 0, targets: [] };

    // Edge glow meshes (populated in _collectEdgeGlows)
    this.edgeGlowMeshes = [];
    this._collectEdgeGlows();

    // HTML overlays
    this.flashOverlay = this._createFlashOverlay();

    // Create ambient particle system
    this._createAmbientParticles();

    // --- Wire events ---
    this._onHit = (data) => this.onHit(data);
    this._onPlayerHit = (data) => this.onPlayerHit(data);
    this._onPlayerThrow = (data) => this.onThrow(data, true);
    this._onOpponentThrow = (data) => this.onThrow(data, false);
    this._onCombo = (data) => this.onCombo(data);
    this._onGameOver = (data) => this.onGameOver(data);
    this._onRestart = () => this.reset();
    this._onOpponentHit = (data) => this.onOpponentHit(data);

    eventBus.on(Events.SPECTACLE_HIT, this._onHit);
    eventBus.on(Events.PLAYER_HIT, this._onPlayerHit);
    eventBus.on(Events.PLAYER_THROW, this._onPlayerThrow);
    eventBus.on(Events.OPPONENT_THROW, this._onOpponentThrow);
    eventBus.on(Events.SPECTACLE_COMBO, this._onCombo);
    eventBus.on(Events.GAME_OVER, this._onGameOver);
    eventBus.on(Events.GAME_RESTART, this._onRestart);
    eventBus.on(Events.OPPONENT_HIT, this._onOpponentHit);
  }

  // =========================================================================
  // HTML Overlay
  // =========================================================================

  _createFlashOverlay() {
    const el = document.createElement('div');
    el.id = 'effects-flash-overlay';
    el.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 15;
      opacity: 0; transition: opacity 0.15s ease-out;
    `;
    document.body.appendChild(el);
    return el;
  }

  flash(color, duration = EFFECTS.FLASH_DURATION, alpha = EFFECTS.FLASH_ALPHA) {
    this.flashOverlay.style.background = color;
    this.flashOverlay.style.opacity = String(alpha);
    this.flashOverlay.style.transition = `opacity ${duration}ms ease-out`;
    // Force reflow so transition fires
    void this.flashOverlay.offsetWidth;
    setTimeout(() => {
      this.flashOverlay.style.opacity = '0';
    }, 16);
  }

  // =========================================================================
  // Ambient particles (dust/spark motes drifting upward -- active from frame 1)
  // =========================================================================

  _createAmbientParticles() {
    const count = EFFECTS.AMBIENT_PARTICLE_COUNT;
    const positions = new Float32Array(count * 3);
    this._ambientVelocities = [];

    const hw = ARENA.WIDTH / 2;
    const hd = ARENA.DEPTH / 2;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * ARENA.WIDTH * 1.2;
      positions[i * 3 + 1] = Math.random() * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * ARENA.DEPTH * 1.5;
      this._ambientVelocities.push({
        x: (Math.random() - 0.5) * 0.3,
        y: 0.15 + Math.random() * 0.25,
        z: (Math.random() - 0.5) * 0.2,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.ambientPoints = new THREE.Points(geo, mat);
    this.scene.add(this.ambientPoints);
  }

  _updateAmbientParticles(delta) {
    if (!this.ambientPoints) return;
    const posAttr = this.ambientPoints.geometry.getAttribute('position');
    const arr = posAttr.array;

    for (let i = 0; i < EFFECTS.AMBIENT_PARTICLE_COUNT; i++) {
      const idx = i * 3;
      const vel = this._ambientVelocities[i];
      arr[idx] += vel.x * delta;
      arr[idx + 1] += vel.y * delta;
      arr[idx + 2] += vel.z * delta;

      // Wrap around when particles float too high
      if (arr[idx + 1] > 7) {
        arr[idx + 1] = -0.5;
        arr[idx] = (Math.random() - 0.5) * ARENA.WIDTH * 1.2;
        arr[idx + 2] = (Math.random() - 0.5) * ARENA.DEPTH * 1.5;
      }
    }
    posAttr.needsUpdate = true;
  }

  // =========================================================================
  // Particle bursts (hit effects, explosions)
  // =========================================================================

  spawnBurst(position, color, count = EFFECTS.HIT_PARTICLES, speed = 6) {
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        Math.random() * (speed * 0.7) + 1,
        (Math.random() - 0.5) * speed,
      ));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color,
      size: EFFECTS.PARTICLE_SIZE,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.particleBursts.push({
      points,
      velocities,
      geo,
      mat,
      life: EFFECTS.PARTICLE_LIFE,
      elapsed: 0,
    });
  }

  _updateParticleBursts(delta) {
    for (let i = this.particleBursts.length - 1; i >= 0; i--) {
      const burst = this.particleBursts[i];
      burst.elapsed += delta;

      if (burst.elapsed >= burst.life) {
        // Clean up
        this.scene.remove(burst.points);
        burst.geo.dispose();
        burst.mat.dispose();
        this.particleBursts.splice(i, 1);
        continue;
      }

      // Update positions and fade
      const progress = burst.elapsed / burst.life;
      burst.mat.opacity = 1 - progress;

      const posAttr = burst.geo.getAttribute('position');
      const arr = posAttr.array;
      const count = burst.velocities.length;

      for (let j = 0; j < count; j++) {
        const vel = burst.velocities[j];
        arr[j * 3] += vel.x * delta;
        arr[j * 3 + 1] += vel.y * delta;
        arr[j * 3 + 2] += vel.z * delta;
        // Gravity
        vel.y -= 8 * delta;
      }
      posAttr.needsUpdate = true;
    }
  }

  // =========================================================================
  // Projectile trail
  // =========================================================================

  spawnTrailParticle(position, color) {
    const geo = new THREE.SphereGeometry(EFFECTS.TRAIL_SIZE, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    this.scene.add(mesh);

    this.trailParticles.push({
      mesh,
      geo,
      mat,
      life: EFFECTS.TRAIL_LIFE,
      elapsed: 0,
    });
  }

  _updateTrailParticles(delta) {
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const trail = this.trailParticles[i];
      trail.elapsed += delta;

      if (trail.elapsed >= trail.life) {
        this.scene.remove(trail.mesh);
        trail.geo.dispose();
        trail.mat.dispose();
        this.trailParticles.splice(i, 1);
        continue;
      }

      const progress = trail.elapsed / trail.life;
      trail.mat.opacity = 0.5 * (1 - progress);
      const s = 1 - progress * 0.6;
      trail.mesh.scale.setScalar(s);
    }
  }

  // =========================================================================
  // Muzzle flash (bright PointLight at throw origin)
  // =========================================================================

  spawnMuzzleFlash(position, color) {
    const light = new THREE.PointLight(color, EFFECTS.MUZZLE_FLASH_INTENSITY, EFFECTS.MUZZLE_FLASH_DISTANCE);
    light.position.set(position.x, position.y, position.z);
    this.scene.add(light);

    this.muzzleFlashes.push({
      light,
      duration: EFFECTS.MUZZLE_FLASH_DURATION / 1000,
      elapsed: 0,
    });
  }

  _updateMuzzleFlashes(delta) {
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const mf = this.muzzleFlashes[i];
      mf.elapsed += delta;

      if (mf.elapsed >= mf.duration) {
        this.scene.remove(mf.light);
        mf.light.dispose();
        this.muzzleFlashes.splice(i, 1);
        continue;
      }

      const progress = mf.elapsed / mf.duration;
      mf.light.intensity = EFFECTS.MUZZLE_FLASH_INTENSITY * (1 - progress);
    }
  }

  // =========================================================================
  // Camera shake
  // =========================================================================

  startShake(intensity = EFFECTS.CAMERA_SHAKE_HIT, duration = EFFECTS.CAMERA_SHAKE_DURATION) {
    // If already shaking, take the stronger intensity
    if (this.cameraShake.active) {
      this.cameraShake.intensity = Math.max(this.cameraShake.intensity, intensity);
      this.cameraShake.duration = Math.max(this.cameraShake.duration, duration);
      this.cameraShake.elapsed = 0;
    } else {
      this.cameraShake = { active: true, intensity, duration, elapsed: 0 };
    }
  }

  _updateCameraShake(delta) {
    if (!this.cameraShake.active) return;

    this.cameraShake.elapsed += delta;
    if (this.cameraShake.elapsed >= this.cameraShake.duration) {
      this.camera.position.copy(this.originalCameraPos);
      this.cameraShake.active = false;
      return;
    }

    const decay = 1 - this.cameraShake.elapsed / this.cameraShake.duration;
    const i = this.cameraShake.intensity * decay;
    this.camera.position.x = this.originalCameraPos.x + (Math.random() - 0.5) * i;
    this.camera.position.y = this.originalCameraPos.y + (Math.random() - 0.5) * i * 0.5;
  }

  // =========================================================================
  // Arena edge glow pulse
  // =========================================================================

  _collectEdgeGlows() {
    // The LevelBuilder creates MeshBasicMaterial glow strips.
    // We find them by matching the arena edge glow color.
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.isMeshBasicMaterial) {
        if (obj.material.color && obj.material.color.getHex() === ARENA.EDGE_GLOW_COLOR) {
          this.edgeGlowMeshes.push(obj);
        }
      }
    });
  }

  _updateEdgeGlowPulse(delta) {
    // Sinusoidal pulse on edge glow opacity
    const t = this.elapsedTime;
    const period = EFFECTS.GLOW_PULSE_PERIOD;
    const osc = (Math.sin(t * Math.PI * 2 / period) + 1) * 0.5;
    const opacity = EFFECTS.GLOW_PULSE_MIN + osc * (EFFECTS.GLOW_PULSE_MAX - EFFECTS.GLOW_PULSE_MIN);

    for (const mesh of this.edgeGlowMeshes) {
      mesh.material.opacity = opacity;
    }
  }

  // =========================================================================
  // Combo / streak text overlays (HTML)
  // =========================================================================

  showComboText(combo) {
    const size = Math.min(
      EFFECTS.COMBO_TEXT_BASE_SIZE + combo * EFFECTS.COMBO_TEXT_GROW,
      EFFECTS.COMBO_TEXT_MAX_SIZE,
    );

    const el = document.createElement('div');
    el.textContent = `${combo}x COMBO!`;
    el.style.cssText = `
      position: fixed; top: 45%; left: 50%;
      transform: translate(-50%, -50%) scale(0.3);
      font-size: ${size}px; font-weight: 900;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #ffcc00;
      text-shadow: 0 0 20px rgba(255,204,0,0.8), 0 2px 4px rgba(0,0,0,0.6);
      z-index: 16; pointer-events: none;
      opacity: 1;
      transition: transform ${EFFECTS.COMBO_FADE_DURATION}ms cubic-bezier(0.17, 0.67, 0.35, 1.2),
                  opacity ${EFFECTS.COMBO_FADE_DURATION}ms ease-out;
    `;
    document.body.appendChild(el);

    // Animate: scale up then fade
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%, -60%) scale(1.3)';
      el.style.opacity = '0';
    });

    setTimeout(() => el.remove(), EFFECTS.COMBO_FADE_DURATION + 50);
  }

  showStreakText(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      position: fixed; top: 40%; left: 50%;
      transform: translate(-50%, -50%) scale(2.5);
      font-size: ${EFFECTS.STREAK_TEXT_SIZE}px; font-weight: 900;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #ffffff;
      text-shadow: 0 0 30px rgba(255,100,0,0.9), 0 0 60px rgba(255,50,0,0.6),
                   0 4px 8px rgba(0,0,0,0.8);
      z-index: 17; pointer-events: none;
      opacity: 0;
      transition: transform ${EFFECTS.STREAK_FADE_DURATION}ms cubic-bezier(0.17, 0.67, 0.35, 1.0),
                  opacity ${EFFECTS.STREAK_FADE_DURATION * 0.4}ms ease-out;
    `;
    document.body.appendChild(el);

    // Slam in: scale from 2.5 to 1 and fade in
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%, -50%) scale(1)';
      el.style.opacity = '1';
    });

    // Hold, then fade out
    setTimeout(() => {
      el.style.transition = `transform ${EFFECTS.STREAK_FADE_DURATION * 0.5}ms ease-in, opacity ${EFFECTS.STREAK_FADE_DURATION * 0.5}ms ease-in`;
      el.style.transform = 'translate(-50%, -50%) scale(0.8)';
      el.style.opacity = '0';
    }, EFFECTS.STREAK_FADE_DURATION * 0.6);

    setTimeout(() => el.remove(), EFFECTS.STREAK_FADE_DURATION * 1.2);
  }

  // =========================================================================
  // HUD heart shake on damage
  // =========================================================================

  shakeHUD() {
    const hud = document.getElementById('game-hud');
    if (!hud) return;

    const healthEl = hud.querySelector('div');
    if (!healthEl) return;

    healthEl.style.transition = 'transform 0.08s ease-out';
    healthEl.style.transform = 'scale(1.3)';

    let shakes = 0;
    const shakeInterval = setInterval(() => {
      shakes++;
      const offset = (Math.random() - 0.5) * EFFECTS.HUD_SHAKE_INTENSITY;
      healthEl.style.transform = `scale(1.1) translateX(${offset}px)`;
      if (shakes > 4) {
        clearInterval(shakeInterval);
        healthEl.style.transform = 'scale(1)';
      }
    }, 60);
  }

  // =========================================================================
  // Entrance animation (characters rise from below arena)
  // =========================================================================

  startEntrance(targets) {
    // targets = array of { mesh, targetY }
    this.entranceAnim = {
      active: true,
      elapsed: 0,
      duration: EFFECTS.ENTRANCE_RISE_DURATION / 1000,
      targets: targets.map(t => ({
        mesh: t.mesh,
        startY: EFFECTS.ENTRANCE_RISE_FROM_Y,
        targetY: t.targetY,
      })),
    };

    // Set initial positions below arena
    for (const t of this.entranceAnim.targets) {
      t.mesh.position.y = t.startY;
    }

    // Camera flash on start
    this.flash('#ffffff', EFFECTS.ENTRANCE_FLASH_DURATION, 0.6);
  }

  _updateEntrance(delta) {
    if (!this.entranceAnim.active) return;

    this.entranceAnim.elapsed += delta;
    const progress = Math.min(this.entranceAnim.elapsed / this.entranceAnim.duration, 1);
    const eased = easeOutBounce(progress);

    for (const t of this.entranceAnim.targets) {
      t.mesh.position.y = t.startY + (t.targetY - t.startY) * eased;
    }

    if (progress >= 1) {
      this.entranceAnim.active = false;
      // Landing shake
      this.startShake(0.12, 0.15);
    }
  }

  // =========================================================================
  // Slow motion (game over)
  // =========================================================================

  startSlowMo(duration = EFFECTS.SLOWMO_DURATION, factor = EFFECTS.SLOWMO_FACTOR) {
    this.slowMo = { active: true, elapsed: 0, duration, factor };
  }

  /**
   * Returns the delta multiplier (1.0 normally, < 1.0 during slow-mo).
   */
  getDeltaMultiplier() {
    if (!this.slowMo.active) return 1.0;
    return this.slowMo.factor;
  }

  _updateSlowMo(delta) {
    if (!this.slowMo.active) return;
    this.slowMo.elapsed += delta;
    if (this.slowMo.elapsed >= this.slowMo.duration) {
      this.slowMo.active = false;
    }
  }

  // =========================================================================
  // Event handlers
  // =========================================================================

  onHit(data) {
    // Opponent was hit by player projectile -- blue-white flash on impact
    const pos = new THREE.Vector3(data.x, data.y, data.z);
    this.spawnBurst(pos, PROJECTILE.PLAYER_COLOR, EFFECTS.HIT_PARTICLES, 5);
    this.flash('rgba(255, 100, 100, 0.5)', 120, 0.2);
  }

  onOpponentHit(data) {
    // Additional: small camera shake on opponent hit
    this.startShake(EFFECTS.CAMERA_SHAKE_HIT, EFFECTS.CAMERA_SHAKE_DURATION * 0.6);
  }

  onPlayerHit(data) {
    // Player takes damage -- strong red flash, big shake, particle burst
    const pos = new THREE.Vector3(data.x, data.y, data.z);
    this.spawnBurst(pos, PROJECTILE.OPPONENT_COLOR, EFFECTS.HIT_PARTICLES, 6);
    this.flash('rgba(255, 0, 0, 0.7)', EFFECTS.FLASH_DAMAGE_DURATION, EFFECTS.FLASH_DAMAGE_ALPHA);
    this.startShake(EFFECTS.CAMERA_SHAKE_DAMAGE, EFFECTS.CAMERA_SHAKE_DURATION * 1.2);
    this.shakeHUD();
  }

  onThrow(data, isPlayer) {
    const pos = new THREE.Vector3(data.x, data.y, data.z);
    const color = isPlayer ? PROJECTILE.PLAYER_COLOR : PROJECTILE.OPPONENT_COLOR;
    this.spawnMuzzleFlash(pos, color);
    // Small burst at throw origin
    this.spawnBurst(pos, color, 5, 2);
  }

  onCombo(data) {
    const combo = data.combo;
    this.showComboText(combo);

    // More particles at higher combos
    const particleCount = Math.min(EFFECTS.COMBO_PARTICLES + combo * 2, 35);
    // Spawn burst at center-ish position
    this.spawnBurst(new THREE.Vector3(0, 2, 0), 0xffcc00, particleCount, 7);

    // Flash intensity scales with combo
    const alpha = Math.min(0.15 + combo * 0.03, 0.4);
    this.flash('rgba(255, 204, 0, 0.6)', 200, alpha);

    // Camera shake scales with combo
    const shakeIntensity = Math.min(0.05 + combo * 0.02, 0.2);
    this.startShake(shakeIntensity, 0.15);

    // Check for streak milestones
    const milestoneText = EFFECTS.STREAK_MILESTONES[combo];
    if (milestoneText) {
      this.showStreakText(milestoneText);
      // Big burst for streak
      this.spawnBurst(new THREE.Vector3(0, 2, 0), 0xff6600, EFFECTS.STREAK_PARTICLES, 10);
      this.startShake(EFFECTS.CAMERA_SHAKE_STREAK, 0.3);
    }
  }

  onGameOver(data) {
    // Slow motion
    this.startSlowMo();

    // Final explosion from center
    this.spawnBurst(
      new THREE.Vector3(0, 1.5, 0),
      0xff4444,
      EFFECTS.GAMEOVER_EXPLOSION_PARTICLES,
      8,
    );

    // Red flash
    this.flash('rgba(255, 0, 0, 0.6)', 500, 0.5);

    // Strong shake
    this.startShake(0.3, 0.4);

    // Camera zoom toward center (subtle offset)
    this._gameOverZoom = {
      active: true,
      elapsed: 0,
      duration: 0.8,
      startZ: this.originalCameraPos.z,
      targetZ: this.originalCameraPos.z - EFFECTS.GAMEOVER_ZOOM_OFFSET,
    };
  }

  _updateGameOverZoom(delta) {
    if (!this._gameOverZoom || !this._gameOverZoom.active) return;
    this._gameOverZoom.elapsed += delta;
    const progress = Math.min(this._gameOverZoom.elapsed / this._gameOverZoom.duration, 1);
    // Smooth easeOut
    const eased = 1 - Math.pow(1 - progress, 3);
    this.camera.position.z = this._gameOverZoom.startZ +
      (this._gameOverZoom.targetZ - this._gameOverZoom.startZ) * eased;

    if (progress >= 1) {
      this._gameOverZoom.active = false;
    }
  }

  // =========================================================================
  // Update trails for active projectiles (called from Game.js)
  // =========================================================================

  updateProjectileTrails(projectiles, delta) {
    if (!this._trailTimer) this._trailTimer = 0;
    this._trailTimer += delta;

    if (this._trailTimer >= EFFECTS.TRAIL_SPAWN_INTERVAL) {
      this._trailTimer = 0;
      for (const proj of projectiles) {
        if (!proj.alive) continue;
        const color = proj.isPlayer ? PROJECTILE.PLAYER_COLOR : PROJECTILE.OPPONENT_COLOR;
        this.spawnTrailParticle(proj.mesh.position, color);
      }
    }
  }

  // =========================================================================
  // Main update (called every frame from Game.js)
  // =========================================================================

  update(delta) {
    this.elapsedTime += delta;

    this._updateAmbientParticles(delta);
    this._updateParticleBursts(delta);
    this._updateTrailParticles(delta);
    this._updateMuzzleFlashes(delta);
    this._updateCameraShake(delta);
    this._updateEdgeGlowPulse(delta);
    this._updateEntrance(delta);
    this._updateSlowMo(delta);
    this._updateGameOverZoom(delta);
  }

  // =========================================================================
  // Reset / cleanup
  // =========================================================================

  reset() {
    // Reset camera position and orientation
    this.camera.position.copy(this.originalCameraPos);
    this.camera.lookAt(CAMERA.LOOK_AT_X, CAMERA.LOOK_AT_Y, CAMERA.LOOK_AT_Z);
    this.cameraShake = { active: false, intensity: 0, duration: 0, elapsed: 0 };

    // Reset slow-mo
    this.slowMo = { active: false, elapsed: 0, duration: 0, factor: 1 };

    // Reset game over zoom
    this._gameOverZoom = null;

    // Clear particle bursts
    for (const burst of this.particleBursts) {
      this.scene.remove(burst.points);
      burst.geo.dispose();
      burst.mat.dispose();
    }
    this.particleBursts = [];

    // Clear trail particles
    for (const trail of this.trailParticles) {
      this.scene.remove(trail.mesh);
      trail.geo.dispose();
      trail.mat.dispose();
    }
    this.trailParticles = [];

    // Clear muzzle flashes
    for (const mf of this.muzzleFlashes) {
      this.scene.remove(mf.light);
      mf.light.dispose();
    }
    this.muzzleFlashes = [];

    // Reset entrance anim
    this.entranceAnim = { active: false, elapsed: 0, duration: 0, targets: [] };

    // Clear flash overlay
    this.flashOverlay.style.opacity = '0';
  }

  destroy() {
    // Unsubscribe
    eventBus.off(Events.SPECTACLE_HIT, this._onHit);
    eventBus.off(Events.PLAYER_HIT, this._onPlayerHit);
    eventBus.off(Events.PLAYER_THROW, this._onPlayerThrow);
    eventBus.off(Events.OPPONENT_THROW, this._onOpponentThrow);
    eventBus.off(Events.SPECTACLE_COMBO, this._onCombo);
    eventBus.off(Events.GAME_OVER, this._onGameOver);
    eventBus.off(Events.GAME_RESTART, this._onRestart);
    eventBus.off(Events.OPPONENT_HIT, this._onOpponentHit);

    this.reset();

    // Remove ambient particles
    if (this.ambientPoints) {
      this.scene.remove(this.ambientPoints);
      this.ambientPoints.geometry.dispose();
      this.ambientPoints.material.dispose();
      this.ambientPoints = null;
    }

    // Remove flash overlay
    if (this.flashOverlay && this.flashOverlay.parentNode) {
      this.flashOverlay.parentNode.removeChild(this.flashOverlay);
    }
  }
}
