// =============================================================================
// Menu.js — Game over overlay with wave info
// =============================================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class Menu {
  constructor() {
    this.gameoverOverlay = document.getElementById('gameover-overlay');
    this.restartBtn = document.getElementById('restart-btn');
    this.finalScoreEl = document.getElementById('final-score');
    this.bestScoreEl = document.getElementById('best-score');
    this.waveEl = document.getElementById('final-wave');

    this.restartBtn.addEventListener('click', () => {
      this.gameoverOverlay.classList.add('hidden');
      eventBus.emit(Events.GAME_RESTART);
    });

    eventBus.on(Events.GAME_OVER, ({ score }) => this.showGameOver(score));
  }

  showGameOver(score) {
    this.finalScoreEl.textContent = `Score: ${score}`;
    this.bestScoreEl.textContent = `Best: ${gameState.bestScore}`;
    if (this.waveEl) {
      this.waveEl.textContent = `Wave: ${gameState.wave}`;
    }
    this.gameoverOverlay.classList.remove('hidden');
  }
}
