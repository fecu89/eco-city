import Phaser from 'phaser';
import { GameConfig } from './core/GameConfig.js';
import { eventBus, Events } from './core/EventBus.js';
import { gameState } from './core/GameState.js';

const game = new Phaser.Game(GameConfig);

// Expose for testing
window.__GAME__ = game;
window.__GAME_STATE__ = gameState;
window.__EVENT_BUS__ = eventBus;
window.__EVENTS__ = Events;

// AI-readable game state snapshot
window.render_game_to_text = () => {
  if (!game || !gameState) return JSON.stringify({ error: 'not_ready' });

  const activeScenes = game.scene.getScenes(true).map(s => s.scene.key);
  const payload = {
    coords: 'origin:top-left x:right y:down',
    mode: gameState.gameOver ? 'game_over' : gameState.started ? 'playing' : 'menu',
    scene: activeScenes[0] || null,
    scenes: activeScenes,
    score: gameState.score,
    bestScore: gameState.bestScore,
    mogMeter: gameState.mogMeter,
    mogPercent: Math.round((gameState.mogMeter / 1000) * 100),
    combo: gameState.combo,
    maxCombo: gameState.maxCombo,
    trumpScale: gameState.trumpScale,
    bidenScale: gameState.bidenScale,
    trumpExpression: gameState.trumpExpression || 'normal',
    bidenExpression: gameState.bidenExpression || 'normal',
    perfects: gameState.perfectCount,
    totalMogs: gameState.mogCount,
  };

  return JSON.stringify(payload);
};

// Deterministic time-stepping
window.advanceTime = (ms) => {
  return new Promise((resolve) => {
    const start = performance.now();
    function step() {
      if (performance.now() - start >= ms) return resolve();
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
};
