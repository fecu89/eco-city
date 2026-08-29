// =============================================================================
// Barn Defense - GameConfig
// Phaser configuration. Registers all scenes. No physics gravity needed.
// Uses DPR-aware scaling for crisp retina rendering.
// =============================================================================

import Phaser from 'phaser';
import { GAME, COLORS, DPR } from './Constants.js';
import { BootScene } from '../scenes/BootScene.js';
import { GameScene } from '../scenes/GameScene.js';
import { UIScene } from '../scenes/UIScene.js';
import { GameOverScene } from '../scenes/GameOverScene.js';
import { LevelCompleteScene } from '../scenes/LevelCompleteScene.js';

export const GameConfig = {
  type: Phaser.AUTO,
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  parent: 'game-container',
  backgroundColor: 0x1a3a0e,
  roundPixels: true,
  antialias: true,
  render: {
    preserveDrawingBuffer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1 / DPR,
  },
  scene: [BootScene, GameScene, UIScene, GameOverScene, LevelCompleteScene],
};
