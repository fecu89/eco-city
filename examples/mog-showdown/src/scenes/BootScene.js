import Phaser from 'phaser';
import { CHARACTER } from '../core/Constants.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.load.spritesheet('clavicular-head', 'assets/characters/clavicular/clavicular-expressions.png', {
      frameWidth: CHARACTER.FRAME_W,
      frameHeight: CHARACTER.FRAME_H,
    });
    this.load.spritesheet('androgenic-head', 'assets/characters/androgenic/androgenic-expressions.png', {
      frameWidth: CHARACTER.FRAME_W,
      frameHeight: CHARACTER.FRAME_H,
    });
  }

  create() {
    this.scene.start('GameScene');
    // Launch UIScene in parallel (mute button visible across all scenes)
    this.scene.launch('UIScene');
  }
}
