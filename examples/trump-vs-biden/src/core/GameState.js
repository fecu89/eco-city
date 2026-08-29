// =============================================================================
// GameState.js — Centralized state singleton. Systems read from it.
// Events trigger mutations. reset() restores clean slate for restarts.
// =============================================================================

import { PLAYER, SCORING } from './Constants.js';

class GameState {
  constructor() {
    this.bestScore = 0;
    this.bestCombo = 0;
    this.isMuted = false;
    this.reset();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.health = PLAYER.HEALTH;
    this.started = false;
    this.gameOver = false;
  }

  addScore(points = 1) {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }
  }

  incrementCombo() {
    this.combo += 1;
    this.comboTimer = SCORING.COMBO_TIMEOUT;
    if (this.combo > this.bestCombo) {
      this.bestCombo = this.combo;
    }
  }

  resetCombo() {
    this.combo = 0;
    this.comboTimer = 0;
  }

  takeDamage(amount = 1) {
    this.health = Math.max(0, this.health - amount);
  }
}

export const gameState = new GameState();
