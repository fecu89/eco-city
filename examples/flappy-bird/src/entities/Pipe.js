import Phaser from 'phaser';
import { PIPE, GAME, GROUND, PX } from '../core/Constants.js';

export class Pipe {
  constructor(scene, x, gapCenterY) {
    this.scene = scene;
    this.scored = false;

    const halfGap = PIPE.GAP / 2;
    const topPipeHeight = gapCenterY - halfGap;
    const bottomPipeY = gapCenterY + halfGap;
    const bottomPipeHeight = GROUND.Y - bottomPipeY;

    // Generate textures once (cached by key, using rounded height for stable keys)
    const topKey = Math.round(topPipeHeight);
    const botKey = Math.round(bottomPipeHeight);
    this.ensureTextures(scene, topPipeHeight, bottomPipeHeight, topKey, botKey);

    // Top pipe (flipped)
    this.top = scene.physics.add.image(x, topPipeHeight / 2, `pipe-top-${topKey}`);
    this.top.body.setAllowGravity(false);
    this.top.body.setImmovable(true);
    this.top.body.setVelocityX(-PIPE.SPEED);
    this.top.setDepth(5);

    // Bottom pipe
    this.bottom = scene.physics.add.image(x, bottomPipeY + bottomPipeHeight / 2, `pipe-bot-${botKey}`);
    this.bottom.body.setAllowGravity(false);
    this.bottom.body.setImmovable(true);
    this.bottom.body.setVelocityX(-PIPE.SPEED);
    this.bottom.setDepth(5);

    // Score zone (invisible trigger between pipes)
    this.scoreZone = scene.add.zone(x + PIPE.WIDTH / 2 + 2 * PX, gapCenterY, 4 * PX, PIPE.GAP);
    scene.physics.add.existing(this.scoreZone, false);
    this.scoreZone.body.setAllowGravity(false);
    this.scoreZone.body.setVelocityX(-PIPE.SPEED);
  }

  ensureTextures(scene, topH, botH, topKey, botKey) {
    const topTexKey = `pipe-top-${topKey}`;
    const botTexKey = `pipe-bot-${botKey}`;

    if (!scene.textures.exists(topTexKey)) {
      const g = scene.add.graphics();
      this.drawPipe(g, PIPE.WIDTH, topH, true);
      g.generateTexture(topTexKey, Math.ceil(PIPE.WIDTH + PIPE.CAP_OVERHANG * 2), Math.ceil(topH));
      g.destroy();
    }

    if (!scene.textures.exists(botTexKey)) {
      const g = scene.add.graphics();
      this.drawPipe(g, PIPE.WIDTH, botH, false);
      g.generateTexture(botTexKey, Math.ceil(PIPE.WIDTH + PIPE.CAP_OVERHANG * 2), Math.ceil(botH));
      g.destroy();
    }
  }

  drawPipe(gfx, width, height, flipped) {
    const capH = PIPE.CAP_HEIGHT;
    const overhang = PIPE.CAP_OVERHANG;
    const totalW = width + overhang * 2;

    // Pipe body
    gfx.fillStyle(PIPE.BODY_COLOR, 1);
    gfx.fillRect(overhang, 0, width, height);

    // Highlight stripe
    gfx.fillStyle(PIPE.HIGHLIGHT_COLOR, 1);
    gfx.fillRect(overhang + 4 * PX, 0, 6 * PX, height);

    // Dark edge
    gfx.fillStyle(PIPE.BODY_DARK, 1);
    gfx.fillRect(overhang + width - 6 * PX, 0, 6 * PX, height);

    // Cap
    const capY = flipped ? height - capH : 0;
    gfx.fillStyle(PIPE.CAP_COLOR, 1);
    gfx.fillRect(0, capY, totalW, capH);

    // Cap highlight
    gfx.fillStyle(PIPE.HIGHLIGHT_COLOR, 1);
    gfx.fillRect(2 * PX, capY + 2 * PX, 6 * PX, capH - 4 * PX);

    // Cap dark edge
    gfx.fillStyle(PIPE.BODY_DARK, 1);
    gfx.fillRect(totalW - 6 * PX, capY, 6 * PX, capH);
  }

  isOffScreen() {
    return this.top.x < -PIPE.WIDTH - 20 * PX;
  }

  destroy() {
    this.top.destroy();
    this.bottom.destroy();
    this.scoreZone.destroy();
  }
}
