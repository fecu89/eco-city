// =============================================================================
// GameState.js — Single centralized state object
// Systems read from it. Events trigger mutations. Has reset() for clean restarts.
// =============================================================================

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.bestScore = this.bestScore || 0;
    this.started = false;
    this.gameOver = false;
    this.wave = 0;
    this.castleHealth = 100;
    this.maxCastleHealth = 100;
    this.enemiesKilled = 0;
    this.isMuted = false;
  }

  addScore(points = 1) {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }
  }
}

export const gameState = new GameState();
