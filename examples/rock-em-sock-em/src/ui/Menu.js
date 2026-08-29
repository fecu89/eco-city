// =============================================================================
// Menu.js — Game over overlay and restart handling
//
// Shows score when player loses. Restart button emits GAME_RESTART.
// Also shows round-won banner briefly when player wins a round.
// =============================================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class Menu {
  constructor() {
    this.gameoverOverlay = document.getElementById('gameover-overlay');
    this.restartBtn = document.getElementById('restart-btn');
    this.finalScoreEl = document.getElementById('final-score');
    this.bestScoreEl = document.getElementById('best-score');
    this.roundBanner = document.getElementById('round-banner');

    // Restart
    this.restartBtn.addEventListener('click', () => {
      this.gameoverOverlay.classList.add('hidden');
      eventBus.emit(Events.GAME_RESTART);
    });

    // Also restart on touch (mobile)
    this.restartBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.gameoverOverlay.classList.add('hidden');
      eventBus.emit(Events.GAME_RESTART);
    });

    // Game over
    eventBus.on(Events.GAME_OVER, ({ score }) => this.showGameOver(score));

    // Round won — show brief banner
    eventBus.on(Events.ROUND_WON, ({ score }) => this.showRoundWon(score));
  }

  showGameOver(score) {
    this.finalScoreEl.textContent = `Rounds Won: ${score}`;
    this.bestScoreEl.textContent = `Best: ${gameState.bestScore}`;
    this.gameoverOverlay.classList.remove('hidden');
  }

  showRoundWon(score) {
    if (!this.roundBanner) return;
    this.roundBanner.textContent = `KNOCKOUT! Round ${score} won!`;
    this.roundBanner.classList.remove('hidden');

    setTimeout(() => {
      this.roundBanner.classList.add('hidden');
    }, 1800);
  }
}
