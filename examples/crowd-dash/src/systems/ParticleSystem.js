// =============================================================================
// ParticleSystem.js — Lightweight particle effects for Crowd Dash
//
// Four subsystems:
//   1. Heart collection burst (pink sparkles on pickup)
//   2. Player trail (neon glow behind the runner)
//   3. Death explosion (colorful blast on collision)
//   4. Ambient motes (floating city dust / light particles)
//
// All particles are simple THREE.Points with per-particle attributes.
// Wired via EventBus events. All tunables live in Constants.PARTICLES.
// =============================================================================

import * as THREE from 'three';
import { PARTICLES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

// ---- Individual particle data ----
class Particle {
  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.life = 0;
    this.maxLife = 1;
    this.active = false;
    this.size = 0.1;
    this.gravity = 0;
  }

  reset() {
    this.active = false;
    this.life = 0;
  }
}

// ---- Particle pool rendered as a single Points mesh ----
class ParticlePool {
  constructor(scene, maxCount, color, opacity = 1.0) {
    this.scene = scene;
    this.maxCount = maxCount;
    this.particles = [];
    for (let i = 0; i < maxCount; i++) {
      this.particles.push(new Particle());
    }

    // Geometry with per-particle positions + sizes
    this.positions = new Float32Array(maxCount * 3);
    this.sizes = new Float32Array(maxCount);
    this.alphas = new Float32Array(maxCount);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    this.material = new THREE.PointsMaterial({
      color: color,
      size: 0.1,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  _acquire() {
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.particles[i].active) {
        return this.particles[i];
      }
    }
    return null;
  }

  update(delta) {
    for (let i = 0; i < this.maxCount; i++) {
      const p = this.particles[i];
      if (!p.active) {
        // Hide inactive particles far away
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = -1000;
        this.positions[i * 3 + 2] = 0;
        this.sizes[i] = 0;
        this.alphas[i] = 0;
        continue;
      }

      p.life += delta;
      if (p.life >= p.maxLife) {
        p.reset();
        this.positions[i * 3 + 1] = -1000;
        this.sizes[i] = 0;
        this.alphas[i] = 0;
        continue;
      }

      // Apply velocity + gravity
      p.position.x += p.velocity.x * delta;
      p.position.y += p.velocity.y * delta;
      p.position.z += p.velocity.z * delta;
      p.velocity.y += p.gravity * delta;

      // Fade out over lifetime
      const t = p.life / p.maxLife;
      const alpha = 1.0 - t * t; // quadratic fade

      this.positions[i * 3] = p.position.x;
      this.positions[i * 3 + 1] = p.position.y;
      this.positions[i * 3 + 2] = p.position.z;
      this.sizes[i] = p.size * (1.0 - t * 0.5); // shrink slightly
      this.alphas[i] = alpha;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  destroy() {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.points);
  }
}

// =============================================================================
// Main ParticleSystem — orchestrates all subsystems
// =============================================================================

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    // Pool for heart collection bursts
    this._heartPool = new ParticlePool(
      scene,
      PARTICLES.HEART_BURST_COUNT * 5, // allow several bursts at once
      PARTICLES.HEART_BURST_COLOR,
    );

    // Pool for player trail
    this._trailPool = new ParticlePool(
      scene,
      Math.ceil(PARTICLES.TRAIL_EMIT_RATE * PARTICLES.TRAIL_LIFETIME * 2),
      PARTICLES.TRAIL_COLOR,
      0.7,
    );
    this._trailTimer = 0;

    // Pool for death explosion
    this._deathPool = new ParticlePool(
      scene,
      PARTICLES.DEATH_COUNT * 2,
      0xffffff, // white base, we color per-burst conceptually (additive blending makes it glow)
    );

    // Pool for ambient motes
    this._ambientPool = new ParticlePool(
      scene,
      PARTICLES.AMBIENT_COUNT,
      0xffffff,
      PARTICLES.AMBIENT_OPACITY,
    );
    this._ambientInitialized = false;

    // Wire events
    eventBus.on(Events.HEART_COLLECTED, (data) => this._emitHeartBurst(data));
    eventBus.on(Events.PLAYER_DIED, (data) => this._emitDeathExplosion(data));
  }

  // ---- Public update (called every frame from Game.js) ----

  update(delta, playerPos, speed) {
    // Emit trail particles behind player
    if (playerPos) {
      this._updateTrail(delta, playerPos, speed);
      this._updateAmbient(delta, playerPos);
    }

    // Update all pools
    this._heartPool.update(delta);
    this._trailPool.update(delta);
    this._deathPool.update(delta);
    this._ambientPool.update(delta);
  }

  // ---- Heart Collection Burst ----

  _emitHeartBurst(data) {
    const pos = data && data.position;
    if (!pos) return;

    for (let i = 0; i < PARTICLES.HEART_BURST_COUNT; i++) {
      const p = this._heartPool._acquire();
      if (!p) break;

      p.active = true;
      p.life = 0;
      p.maxLife = PARTICLES.HEART_BURST_LIFETIME * (0.7 + Math.random() * 0.6);
      p.size = PARTICLES.HEART_BURST_SIZE * (0.5 + Math.random());
      p.gravity = PARTICLES.HEART_BURST_GRAVITY;

      p.position.set(
        pos.x + (Math.random() - 0.5) * 0.3,
        pos.y + (Math.random() - 0.5) * 0.3,
        pos.z + (Math.random() - 0.5) * 0.3,
      );

      // Random spherical velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = PARTICLES.HEART_BURST_SPEED * (0.5 + Math.random() * 0.5);
      p.velocity.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi)) * speed * 0.8 + 2.0, // bias upward
        Math.sin(phi) * Math.sin(theta) * speed,
      );
    }
  }

  // ---- Player Trail ----

  _updateTrail(delta, playerPos, speed) {
    this._trailTimer += delta;

    // Emit rate scales with speed for denser trail at high speed
    const speedFactor = speed / 12; // normalize to base speed
    const emitInterval = 1.0 / (PARTICLES.TRAIL_EMIT_RATE * Math.max(speedFactor, 0.5));

    while (this._trailTimer >= emitInterval) {
      this._trailTimer -= emitInterval;

      const p = this._trailPool._acquire();
      if (!p) break;

      p.active = true;
      p.life = 0;
      p.maxLife = PARTICLES.TRAIL_LIFETIME;
      p.size = PARTICLES.TRAIL_SIZE * (0.5 + Math.random() * 0.5);
      p.gravity = 0;

      p.position.set(
        playerPos.x + (Math.random() - 0.5) * PARTICLES.TRAIL_SPREAD,
        PARTICLES.TRAIL_OFFSET_Y + Math.random() * 0.4,
        playerPos.z + 0.5 + Math.random() * 0.3, // slightly behind player
      );

      // Drift slightly upward and outward
      p.velocity.set(
        (Math.random() - 0.5) * 0.5,
        0.3 + Math.random() * 0.4,
        0.5, // move backward relative to forward motion
      );
    }
  }

  // ---- Death Explosion ----

  _emitDeathExplosion(data) {
    const pos = data && data.position;
    // Use a fallback position at origin if none provided
    const x = pos ? pos.x : 0;
    const y = pos ? pos.y : 1.0;
    const z = pos ? pos.z : 0;

    for (let i = 0; i < PARTICLES.DEATH_COUNT; i++) {
      const p = this._deathPool._acquire();
      if (!p) break;

      p.active = true;
      p.life = 0;
      p.maxLife = PARTICLES.DEATH_LIFETIME * (0.5 + Math.random() * 0.5);
      p.size = PARTICLES.DEATH_SIZE * (0.5 + Math.random());
      p.gravity = PARTICLES.DEATH_GRAVITY;

      p.position.set(
        x + (Math.random() - 0.5) * 0.5,
        y + (Math.random() - 0.5) * 0.5,
        z + (Math.random() - 0.5) * 0.5,
      );

      // Explosive spherical velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = PARTICLES.DEATH_SPEED * (0.3 + Math.random() * 0.7);
      p.velocity.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi)) * speed * 0.6 + 2.0,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
    }
  }

  // ---- Ambient Floating Motes ----

  _updateAmbient(delta, playerPos) {
    // On first call, spawn all ambient particles around player
    if (!this._ambientInitialized) {
      this._ambientInitialized = true;
      for (let i = 0; i < PARTICLES.AMBIENT_COUNT; i++) {
        this._spawnAmbientParticle(playerPos, true);
      }
    }

    // Respawn expired ambient particles
    for (let i = 0; i < this._ambientPool.maxCount; i++) {
      const p = this._ambientPool.particles[i];
      if (!p.active) {
        this._spawnAmbientParticle(playerPos, false);
      }
    }
  }

  _spawnAmbientParticle(playerPos, randomPhase) {
    const p = this._ambientPool._acquire();
    if (!p) return;

    p.active = true;
    p.life = randomPhase ? Math.random() * PARTICLES.AMBIENT_LIFETIME : 0;
    p.maxLife = PARTICLES.AMBIENT_LIFETIME * (0.5 + Math.random() * 0.5);
    p.size = PARTICLES.AMBIENT_SIZE * (0.5 + Math.random());
    p.gravity = 0;

    p.position.set(
      playerPos.x + (Math.random() - 0.5) * PARTICLES.AMBIENT_SPREAD_X * 2,
      1.0 + Math.random() * PARTICLES.AMBIENT_SPREAD_Y,
      playerPos.z + (Math.random() - 0.5) * PARTICLES.AMBIENT_SPREAD_Z * 2,
    );

    // Gentle random drift
    p.velocity.set(
      (Math.random() - 0.5) * PARTICLES.AMBIENT_SPEED,
      (Math.random() - 0.5) * PARTICLES.AMBIENT_SPEED * 0.3,
      (Math.random() - 0.5) * PARTICLES.AMBIENT_SPEED,
    );
  }

  // ---- Cleanup ----

  destroy() {
    this._heartPool.destroy();
    this._trailPool.destroy();
    this._deathPool.destroy();
    this._ambientPool.destroy();
  }
}
