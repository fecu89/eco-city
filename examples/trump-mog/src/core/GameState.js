import { MOG } from './Constants.js';

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.bestScore = this.bestScore || 0;
    this.started = false;
    this.gameOver = false;
    this.mogMeter = 0;
    this.mogCount = 0;
    this.perfectCount = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.trumpScale = 1.0;
    this.bidenScale = 1.0;
    this.trumpExpression = 'normal';
    this.bidenExpression = 'normal';
    this.round = 1;
  }

  addScore(points = 1) {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }
  }

  addMogPower(amount) {
    this.mogMeter = Math.min(this.mogMeter + amount, MOG.METER_MAX);
  }

  isMogMeterFull() {
    return this.mogMeter >= MOG.METER_MAX;
  }
}

export const gameState = new GameState();
