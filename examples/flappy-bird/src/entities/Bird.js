import Phaser from 'phaser';
import { BIRD, GAME, GROUND, PX } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

export class Bird {
  constructor(scene) {
    this.scene = scene;
    this.alive = true;

    // Texture dimensions with padding
    const texW = BIRD.WIDTH + 10 * PX;
    const texH = BIRD.HEIGHT + 10 * PX;

    // Build the bird from graphics
    const gfx = scene.add.graphics();
    this.drawBird(gfx, texW, texH);
    gfx.generateTexture('bird', Math.ceil(texW), Math.ceil(texH));
    gfx.destroy();

    this.sprite = scene.physics.add.sprite(BIRD.START_X, BIRD.START_Y, 'bird');
    this.sprite.setBodySize(BIRD.WIDTH - 4 * PX, BIRD.HEIGHT - 4 * PX);
    this.sprite.body.setAllowGravity(false);
    this.sprite.setDepth(10);
  }

  drawBird(gfx, texW, texH) {
    const cx = texW / 2;
    const cy = texH / 2;

    // Body
    gfx.fillStyle(BIRD.BODY_COLOR, 1);
    gfx.fillEllipse(cx, cy, BIRD.WIDTH, BIRD.HEIGHT);

    // Belly highlight
    gfx.fillStyle(BIRD.BODY_LIGHT, 1);
    gfx.fillEllipse(cx + 2 * PX, cy + 3 * PX, BIRD.WIDTH * 0.6, BIRD.HEIGHT * 0.5);

    // Wing
    gfx.fillStyle(BIRD.WING_COLOR, 1);
    gfx.fillEllipse(cx - 4 * PX, cy - 1 * PX, 16 * PX, 10 * PX);

    // Eye (white)
    gfx.fillStyle(BIRD.EYE_COLOR, 1);
    gfx.fillCircle(cx + 8 * PX, cy - 4 * PX, 5 * PX);

    // Pupil
    gfx.fillStyle(BIRD.PUPIL_COLOR, 1);
    gfx.fillCircle(cx + 10 * PX, cy - 4 * PX, 2.5 * PX);

    // Beak
    gfx.fillStyle(BIRD.BEAK_COLOR, 1);
    gfx.fillTriangle(
      cx + 14 * PX, cy,
      cx + 22 * PX, cy + 3 * PX,
      cx + 14 * PX, cy + 6 * PX
    );
  }

  enableGravity() {
    this.sprite.body.setAllowGravity(true);
  }

  flap() {
    if (!this.alive) return;
    this.sprite.body.setVelocityY(BIRD.FLAP_VELOCITY);
    this.sprite.angle = BIRD.ROTATION_UP_DEG;
    eventBus.emit(Events.BIRD_FLAP);
  }

  update() {
    if (!this.alive) return;

    // Rotate bird based on velocity
    if (this.sprite.body.velocity.y > 0) {
      this.sprite.angle = Math.min(
        this.sprite.angle + BIRD.ROTATION_SPEED,
        BIRD.ROTATION_DOWN_DEG
      );
    }

    // Check floor/ceiling death
    if (this.sprite.y >= GROUND.Y - BIRD.HEIGHT / 2 || this.sprite.y <= 0) {
      this.die();
    }
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.body.setVelocityX(0);
    eventBus.emit(Events.BIRD_DIED, {
      x: this.sprite.x,
      y: this.sprite.y,
    });
  }

  destroy() {
    this.sprite.destroy();
  }
}
