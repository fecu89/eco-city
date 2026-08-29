import Phaser from 'phaser';
import { GAME, PX, EFFECTS, COLORS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

/**
 * ParticleManager -- handles all particle effects in the game.
 * Emits bursts on spectacle events, manages ambient particles,
 * and provides the player trail system.
 *
 * Uses Phaser Graphics circles as lightweight particles since
 * we don't have texture atlases for particle images.
 */
export class ParticleManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];       // Active particle objects
    this.ambientParticles = []; // Persistent ambient motes
    this.trailParticles = [];   // Player trail particles
    this.trailTimer = 0;

    // --- Bind event listeners ---
    this._onSpectacleHit = (data) => this.onSpectacleHit(data);
    this._onSpectacleAction = (data) => this.onSpectacleAction(data);
    this._onSpectacleCombo = (data) => this.onSpectacleCombo(data);
    this._onSpectacleStreak = (data) => this.onSpectacleStreak(data);
    this._onSpectacleNearMiss = (data) => this.onSpectacleNearMiss(data);
    this._onFrameMog = (data) => this.onFrameMog(data);
    this._onSpectacleEntrance = (data) => this.onSpectacleEntrance(data);

    eventBus.on(Events.SPECTACLE_HIT, this._onSpectacleHit);
    eventBus.on(Events.SPECTACLE_ACTION, this._onSpectacleAction);
    eventBus.on(Events.SPECTACLE_COMBO, this._onSpectacleCombo);
    eventBus.on(Events.SPECTACLE_STREAK, this._onSpectacleStreak);
    eventBus.on(Events.SPECTACLE_NEAR_MISS, this._onSpectacleNearMiss);
    eventBus.on(Events.MOG_FRAMEMOG, this._onFrameMog);
    eventBus.on(Events.SPECTACLE_ENTRANCE, this._onSpectacleEntrance);

    // Start ambient particles immediately
    this.initAmbientParticles();
  }

  // --- Ambient particles (drifting motes from frame 1) ---
  initAmbientParticles() {
    const colors = EFFECTS.AMBIENT_PARTICLE_COLORS;
    for (let i = 0; i < EFFECTS.AMBIENT_PARTICLE_COUNT; i++) {
      this.spawnAmbientParticle(colors[i % colors.length], true);
    }
  }

  spawnAmbientParticle(color, randomStart = false) {
    const size = Phaser.Math.FloatBetween(EFFECTS.AMBIENT_PARTICLE_SIZE_MIN, EFFECTS.AMBIENT_PARTICLE_SIZE_MAX);
    const x = Phaser.Math.Between(0, GAME.WIDTH);
    const y = randomStart ? Phaser.Math.Between(0, GAME.HEIGHT) : -size;
    const alpha = Phaser.Math.FloatBetween(0.15, EFFECTS.AMBIENT_PARTICLE_ALPHA);

    const gfx = this.scene.add.graphics();
    gfx.fillStyle(color, alpha);
    gfx.fillCircle(0, 0, size);
    gfx.setPosition(x, y);
    gfx.setDepth(1);
    gfx.setBlendMode(Phaser.BlendModes.ADD);

    const speedY = Phaser.Math.FloatBetween(EFFECTS.AMBIENT_PARTICLE_SPEED_MIN, EFFECTS.AMBIENT_PARTICLE_SPEED_MAX);
    const driftX = Phaser.Math.FloatBetween(-15 * PX, 15 * PX);
    const wobbleSpeed = Phaser.Math.FloatBetween(0.5, 2.0);
    const wobbleAmp = Phaser.Math.FloatBetween(10 * PX, 30 * PX);

    this.ambientParticles.push({
      gfx,
      speedY,
      driftX,
      wobbleSpeed,
      wobbleAmp,
      time: Phaser.Math.FloatBetween(0, Math.PI * 2),
      baseX: x,
      color,
    });
  }

  updateAmbientParticles(delta) {
    const dt = delta * 0.001;
    const colors = EFFECTS.AMBIENT_PARTICLE_COLORS;

    for (let i = this.ambientParticles.length - 1; i >= 0; i--) {
      const p = this.ambientParticles[i];
      p.time += dt * p.wobbleSpeed;
      p.baseX += p.driftX * dt;
      p.gfx.x = p.baseX + Math.sin(p.time) * p.wobbleAmp;
      p.gfx.y += p.speedY * dt;

      // Respawn when off screen
      if (p.gfx.y > GAME.HEIGHT + 20) {
        p.gfx.destroy();
        this.ambientParticles.splice(i, 1);
        this.spawnAmbientParticle(colors[Math.floor(Math.random() * colors.length)], false);
      }
    }
  }

  // --- Burst particles ---
  emitBurst(x, y, count, colors, speedMin, speedMax, sizeMin, sizeMax, lifespan, blendMode) {
    blendMode = blendMode ?? Phaser.BlendModes.ADD;
    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.FloatBetween(speedMin || EFFECTS.PARTICLE_SPEED_MIN, speedMax || EFFECTS.PARTICLE_SPEED_MAX);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = Phaser.Math.FloatBetween(sizeMin || EFFECTS.PARTICLE_SIZE_MIN, sizeMax || EFFECTS.PARTICLE_SIZE_MAX);
      const color = Array.isArray(colors) ? colors[Math.floor(Math.random() * colors.length)] : colors;
      const life = lifespan || EFFECTS.PARTICLE_LIFESPAN;

      const gfx = this.scene.add.graphics();
      gfx.fillStyle(color, 1);
      gfx.fillCircle(0, 0, size);
      gfx.setPosition(x, y);
      gfx.setDepth(10);
      gfx.setBlendMode(blendMode);

      const particle = {
        gfx,
        vx,
        vy,
        life,
        maxLife: life,
        size,
      };

      this.particles.push(particle);
    }
  }

  updateBurstParticles(delta) {
    const dt = delta * 0.001;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;

      if (p.life <= 0) {
        p.gfx.destroy();
        this.particles.splice(i, 1);
        continue;
      }

      p.gfx.x += p.vx * dt;
      p.gfx.y += p.vy * dt;

      // Fade out
      const ratio = p.life / p.maxLife;
      p.gfx.setAlpha(ratio);
      p.gfx.setScale(0.5 + ratio * 0.5);

      // Gravity-like pull
      p.vy += 120 * PX * dt;
    }
  }

  // --- Player trail ---
  updateTrail(player, delta) {
    if (!player || !player.sprite) return;

    this.trailTimer += delta;
    const body = player.sprite.body;
    const isMoving = body && (Math.abs(body.velocity.x) > 10);

    if (isMoving && this.trailTimer >= EFFECTS.TRAIL_FREQUENCY) {
      this.trailTimer = 0;
      const colors = [COLORS.NEON_GOLD, COLORS.NEON_BLUE, COLORS.NEON_PURPLE];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = EFFECTS.TRAIL_PARTICLE_SIZE;

      const gfx = this.scene.add.graphics();
      gfx.fillStyle(color, EFFECTS.TRAIL_ALPHA);
      gfx.fillCircle(0, 0, size);
      gfx.setPosition(player.sprite.x, player.sprite.y);
      gfx.setDepth(0);
      gfx.setBlendMode(Phaser.BlendModes.ADD);

      this.trailParticles.push({
        gfx,
        life: EFFECTS.TRAIL_LIFESPAN,
        maxLife: EFFECTS.TRAIL_LIFESPAN,
      });
    }

    // Update trail particles
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life -= delta;

      if (p.life <= 0) {
        p.gfx.destroy();
        this.trailParticles.splice(i, 1);
        continue;
      }

      const ratio = p.life / p.maxLife;
      p.gfx.setAlpha(ratio * EFFECTS.TRAIL_ALPHA);
      p.gfx.setScale(ratio);
    }
  }

  // --- Event handlers ---
  onSpectacleHit(data) {
    if (!this.scene || !this.scene.player) return;
    const x = this.scene.player.sprite.x;
    const y = this.scene.player.sprite.y;

    this.emitBurst(
      x, y,
      EFFECTS.HIT_PARTICLE_COUNT,
      [COLORS.NEON_GOLD, COLORS.NEON_BLUE, 0x22CC55, 0xFF69B4],
      EFFECTS.PARTICLE_SPEED_MIN,
      EFFECTS.PARTICLE_SPEED_MAX,
    );
  }

  onSpectacleAction(data) {
    // Light particle trail on movement -- emit fewer to avoid overwhelming
    if (!this.scene || !this.scene.player) return;
    const x = this.scene.player.sprite.x;
    const y = this.scene.player.sprite.y;

    // Only emit a tiny burst every so often (throttle)
    if (!this._lastActionTime || (Date.now() - this._lastActionTime > 200)) {
      this._lastActionTime = Date.now();
      this.emitBurst(
        x, y + 20 * PX,
        4,
        [COLORS.NEON_GOLD, COLORS.NEON_PURPLE],
        40 * PX,
        80 * PX,
        EFFECTS.PARTICLE_SIZE_MIN,
        EFFECTS.PARTICLE_SIZE_MAX * 0.6,
        300,
      );
    }
  }

  onSpectacleCombo(data) {
    if (!this.scene || !this.scene.player) return;
    const x = this.scene.player.sprite.x;
    const y = this.scene.player.sprite.y;
    const combo = data.combo || 2;

    // Scale particles with combo
    const count = Math.min(EFFECTS.ACTION_PARTICLE_COUNT + combo * 2, 30);
    this.emitBurst(
      x, y,
      count,
      [COLORS.NEON_GOLD, COLORS.NEON_PINK, COLORS.NEON_PURPLE],
      EFFECTS.PARTICLE_SPEED_MIN,
      EFFECTS.PARTICLE_SPEED_MAX * (1 + combo * 0.05),
    );
  }

  onSpectacleStreak(data) {
    // Full-screen particle explosion at milestones
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT * 0.45;

    this.emitBurst(
      cx, cy,
      EFFECTS.STREAK_PARTICLE_COUNT,
      [COLORS.NEON_GOLD, COLORS.NEON_BLUE, COLORS.NEON_PINK, COLORS.NEON_PURPLE, 0x22CC55],
      EFFECTS.PARTICLE_SPEED_MIN * 1.5,
      EFFECTS.PARTICLE_SPEED_MAX * 2,
      EFFECTS.PARTICLE_SIZE_MIN,
      EFFECTS.PARTICLE_SIZE_MAX * 1.5,
      800,
    );
  }

  onSpectacleNearMiss(data) {
    if (!this.scene || !this.scene.player) return;
    const x = this.scene.player.sprite.x;
    const y = this.scene.player.sprite.y;

    this.emitBurst(
      x, y,
      EFFECTS.NEAR_MISS_PARTICLE_COUNT,
      [COLORS.NEON_BLUE, 0xFFFFFF],
      EFFECTS.PARTICLE_SPEED_MIN * 0.5,
      EFFECTS.PARTICLE_SPEED_MAX * 0.7,
      EFFECTS.PARTICLE_SIZE_MIN,
      EFFECTS.PARTICLE_SIZE_MAX * 0.7,
      350,
    );
  }

  onFrameMog(data) {
    if (!this.scene || !this.scene.player) return;
    const x = this.scene.player.sprite.x;
    const y = this.scene.player.sprite.y;

    // Massive golden burst from the player
    this.emitBurst(
      x, y,
      EFFECTS.FRAME_MOG_PARTICLE_COUNT,
      [COLORS.NEON_GOLD, 0xFFAA00, 0xFFFFFF],
      EFFECTS.PARTICLE_SPEED_MIN * 2,
      EFFECTS.PARTICLE_SPEED_MAX * 2.5,
      EFFECTS.PARTICLE_SIZE_MIN * 1.5,
      EFFECTS.PARTICLE_SIZE_MAX * 2,
      700,
    );
  }

  onSpectacleEntrance(data) {
    if (!this.scene || !this.scene.player) return;
    const x = this.scene.player.sprite.x;
    const y = this.scene.player.sprite.y;

    // Landing burst
    this.emitBurst(
      x, y + 20 * PX,
      EFFECTS.ENTRANCE_PARTICLE_COUNT,
      [COLORS.NEON_GOLD, COLORS.NEON_BLUE, COLORS.NEON_PURPLE],
      EFFECTS.PARTICLE_SPEED_MIN,
      EFFECTS.PARTICLE_SPEED_MAX * 1.3,
      EFFECTS.PARTICLE_SIZE_MIN,
      EFFECTS.PARTICLE_SIZE_MAX * 1.2,
      600,
    );
  }

  // --- Main update loop ---
  update(delta, player) {
    this.updateAmbientParticles(delta);
    this.updateBurstParticles(delta);
    this.updateTrail(player, delta);
  }

  destroy() {
    eventBus.off(Events.SPECTACLE_HIT, this._onSpectacleHit);
    eventBus.off(Events.SPECTACLE_ACTION, this._onSpectacleAction);
    eventBus.off(Events.SPECTACLE_COMBO, this._onSpectacleCombo);
    eventBus.off(Events.SPECTACLE_STREAK, this._onSpectacleStreak);
    eventBus.off(Events.SPECTACLE_NEAR_MISS, this._onSpectacleNearMiss);
    eventBus.off(Events.MOG_FRAMEMOG, this._onFrameMog);
    eventBus.off(Events.SPECTACLE_ENTRANCE, this._onSpectacleEntrance);

    // Clean up all particles
    this.particles.forEach(p => p.gfx.destroy());
    this.particles = [];
    this.ambientParticles.forEach(p => p.gfx.destroy());
    this.ambientParticles = [];
    this.trailParticles.forEach(p => p.gfx.destroy());
    this.trailParticles = [];
  }
}
