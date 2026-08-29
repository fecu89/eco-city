import { Game } from './core/Game.js';
import { gameState } from './core/GameState.js';

const game = new Game();

// Expose for testing
window.__GAME__ = game;
window.__GAME_STATE__ = gameState;

window.render_game_to_text = () => {
  if (!game || !gameState) return JSON.stringify({ error: 'not_ready' });

  const payload = {
    coords: 'origin:center x:right y:up z:toward-camera',
    mode: gameState.gameOver ? 'game_over' : gameState.started ? 'playing' : 'loading',
    score: gameState.score,
  };

  if (gameState.started && game.player) {
    const pos = game.player.mesh.position;
    payload.player = {
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      z: Math.round(pos.z * 100) / 100,
    };
  }

  return JSON.stringify(payload);
};

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
