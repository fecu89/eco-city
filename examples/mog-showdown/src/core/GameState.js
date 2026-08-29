import { LIVES, MOG } from './Constants.js';

class GameState {
  constructor() {
    this.isMuted = localStorage.getItem('muted') === 'true';
    this.reset();
  }

  reset() {
    this.score = 0;
    this.bestScore = this.bestScore || 0;
    this.started = false;
    this.gameOver = false;

    // Lives
    this.lives = LIVES.MAX;

    // Mog system
    this.mogLevel = 0;
    this.mogProgress = 0; // Power-ups collected toward next mog level

    // Combo tracking
    this.combo = 0;
    this.bestCombo = this.bestCombo || 0;

    // Stats
    this.powerupsCollected = 0;
  }

  addScore(points = 1) {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }
  }

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    return this.lives;
  }

  addMogProgress() {
    this.mogProgress++;
    this.powerupsCollected++;
    if (this.mogProgress >= MOG.POWERUPS_TO_FILL) {
      this.mogProgress = 0;
      this.mogLevel++;
      return true; // Mog meter filled
    }
    return false;
  }

  addCombo() {
    this.combo++;
    if (this.combo > this.bestCombo) {
      this.bestCombo = this.combo;
    }
  }

  breakCombo() {
    this.combo = 0;
  }
}

export const gameState = new GameState();
