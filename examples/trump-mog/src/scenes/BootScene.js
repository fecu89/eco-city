import { GAME } from '../core/Constants.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Load expression spritesheets (4 frames: normal, happy, angry, surprised)
    this.load.spritesheet('trump-expressions', 'assets/trump-expressions.png', {
      frameWidth: 200,
      frameHeight: 300,
    });
    this.load.spritesheet('biden-expressions', 'assets/biden-expressions.png', {
      frameWidth: 200,
      frameHeight: 300,
    });

    // Optional background wallpaper
    this.load.image('bg-wallpaper', 'assets/bg-wallpaper.png');
    // Suppress missing file warning — wallpaper is optional
    this.load.on('loaderror', (file) => {
      if (file.key === 'bg-wallpaper') file.state = Phaser.Loader.FILE_COMPLETE;
    });

    // Loading bar
    const barW = GAME.WIDTH * 0.4;
    const barH = GAME.HEIGHT * 0.02;
    const barX = (GAME.WIDTH - barW) / 2;
    const barY = GAME.HEIGHT / 2;

    const bg = this.add.rectangle(GAME.WIDTH / 2, barY, barW, barH, 0x333333);
    const fill = this.add.rectangle(barX, barY, 0, barH, 0xff4444).setOrigin(0, 0.5);

    this.load.on('progress', (value) => {
      fill.width = barW * value;
    });
  }

  create() {
    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }
}
