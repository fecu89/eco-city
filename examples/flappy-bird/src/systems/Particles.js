import Phaser from 'phaser';
import { PARTICLES, PX } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    this.onEmit = ({ type, x, y }) => {
      if (type === 'score') {
        this.burstScore(x, y);
      } else if (type === 'death') {
        this.burstDeath(x, y);
      }
    };

    eventBus.on(Events.PARTICLES_EMIT, this.onEmit);
  }

  burstScore(x, y) {
    for (let i = 0; i < PARTICLES.SCORE_BURST_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / PARTICLES.SCORE_BURST_COUNT + Math.random() * 0.3;
      const speed = PARTICLES.SCORE_BURST_SPEED_MIN + Math.random() * (PARTICLES.SCORE_BURST_SPEED_MAX - PARTICLES.SCORE_BURST_SPEED_MIN);
      const radius = PARTICLES.SCORE_BURST_RADIUS_MIN + Math.random() * (PARTICLES.SCORE_BURST_RADIUS_MAX - PARTICLES.SCORE_BURST_RADIUS_MIN);
      const particle = this.scene.add.circle(x, y, radius, PARTICLES.SCORE_BURST_COLOR, 1);
      particle.setDepth(30);
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.2,
        duration: 300 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  burstDeath(x, y) {
    for (let i = 0; i < PARTICLES.DEATH_BURST_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / PARTICLES.DEATH_BURST_COUNT + Math.random() * 0.4;
      const speed = PARTICLES.DEATH_BURST_SPEED_MIN + Math.random() * (PARTICLES.DEATH_BURST_SPEED_MAX - PARTICLES.DEATH_BURST_SPEED_MIN);
      const color = Phaser.Utils.Array.GetRandom(PARTICLES.DEATH_BURST_COLORS);
      const radius = PARTICLES.DEATH_BURST_RADIUS_MIN + Math.random() * (PARTICLES.DEATH_BURST_RADIUS_MAX - PARTICLES.DEATH_BURST_RADIUS_MIN);
      const particle = this.scene.add.circle(x, y, radius, color, 1);
      particle.setDepth(30);
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed - 20 * PX,
        alpha: 0,
        scale: 0.1,
        duration: 400 + Math.random() * 300,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  destroy() {
    eventBus.off(Events.PARTICLES_EMIT, this.onEmit);
  }
}
