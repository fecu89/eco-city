// =============================================================================
// Menu.js — Game over overlay (DOM-based, references elements in index.html)
// =============================================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class Menu {
  constructor() {
    this.gameoverOverlay = document.getElementById('gameover-overlay');
    this.restartBtn = document.getElementById('restart-btn');
    this.finalScoreEl = document.getElementById('final-score');
    this.bestScoreEl = document.getElementById('best-score');

    this.restartBtn.addEventListener('click', () => {
      this.gameoverOverlay.classList.add('hidden');
      eventBus.emit(Events.GAME_RESTART);
    });

    // Also allow Space or Enter to restart when game over
    this._keyHandler = (e) => {
      if (gameState.gameOver && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.gameoverOverlay.classList.add('hidden');
        eventBus.emit(Events.GAME_RESTART);
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    eventBus.on(Events.GAME_OVER, ({ score }) => this.showGameOver(score));
  }

  showGameOver(score) {
    this.finalScoreEl.textContent = `Score: ${score}`;
    this.bestScoreEl.textContent = `Best: ${gameState.bestScore}`;
    this.gameoverOverlay.classList.remove('hidden');
  }
}
