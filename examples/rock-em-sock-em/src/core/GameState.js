// =============================================================================
// GameState.js — Centralized state singleton for Rock 'Em Sock 'Em Robots
// Systems read from it. Events trigger mutations.
// =============================================================================

import { COMBAT } from './Constants.js';

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    // Game lifecycle
    this.started = false;
    this.gameOver = false;

    // Score (rounds won by player)
    this.score = 0;
    this.bestScore = this.bestScore || 0;

    // Head health (0 = head pops up = round lost)
    this.playerHeadHealth = COMBAT.MAX_HEAD_HEALTH;
    this.opponentHeadHealth = COMBAT.MAX_HEAD_HEALTH;

    // Blocking state
    this.playerBlocking = false;
    this.opponentBlocking = false;

    // Punch cooldowns
    this.playerPunchCooldown = 0;
    this.opponentPunchCooldown = 0;

    // Active punch state (for animation)
    this.playerPunching = null;   // null | 'left' | 'right'
    this.opponentPunching = null;
    this.playerPunchTimer = 0;
    this.opponentPunchTimer = 0;

    // Head pop state
    this.playerHeadPopped = false;
    this.opponentHeadPopped = false;

    // Round state
    this.roundOver = false;
    this.roundResetTimer = 0;

    // Combo tracking
    this.combo = 0;
    this.bestCombo = this.bestCombo || 0;
    this.comboTimer = 0;

    // Audio
    this.isMuted = this.isMuted || false;
  }

  addScore(points = 1) {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }
  }

  resetRound() {
    this.playerHeadHealth = COMBAT.MAX_HEAD_HEALTH;
    this.opponentHeadHealth = COMBAT.MAX_HEAD_HEALTH;
    this.playerBlocking = false;
    this.opponentBlocking = false;
    this.playerPunchCooldown = 0;
    this.opponentPunchCooldown = 0;
    this.playerPunching = null;
    this.opponentPunching = null;
    this.playerPunchTimer = 0;
    this.opponentPunchTimer = 0;
    this.playerHeadPopped = false;
    this.opponentHeadPopped = false;
    this.roundOver = false;
    this.roundResetTimer = 0;
    this.combo = 0;
    this.comboTimer = 0;
  }
}

export const gameState = new GameState();
