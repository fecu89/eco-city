// =============================================================================
// GameState.js — Centralized state singleton for Crowd Dash
// Systems read from it. Events trigger mutations. reset() for clean restarts.
// =============================================================================

import { PLAYER } from './Constants.js';

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.bestScore = this.bestScore || 0;
    this.started = false;
    this.gameOver = false;

    // Crowd Dash specific
    this.distance = 0;
    this.heartsCollected = 0;
    this.speed = PLAYER.FORWARD_SPEED;
    // Preserve isMuted across resets (user preference, not gameplay state)
    if (typeof this.isMuted === 'undefined') {
      this.isMuted = false;
    }
  }

  addScore(points = 1) {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }
  }
}

export const gameState = new GameState();
