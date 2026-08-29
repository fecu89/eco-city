// =============================================================================
// AISystem.js — Simple AI for the Red Rocker opponent
//
// Uses timing patterns to punch and block. Communicates via EventBus only.
// Difficulty scales slightly as player scores more rounds.
// =============================================================================

import { AI } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class AISystem {
  constructor() {
    this.nextActionTimer = 0;
    this.blockTimer = 0;
    this.isBlocking = false;

    // React to getting hit — sometimes block
    eventBus.on(Events.HIT_OPPONENT, ({ blocked }) => {
      if (!blocked && !this.isBlocking && Math.random() < AI.BLOCK_CHANCE) {
        this.startBlock();
      }
    });

    // Schedule first action
    this.scheduleNextAction();
  }

  scheduleNextAction() {
    const range = AI.MAX_PUNCH_INTERVAL - AI.MIN_PUNCH_INTERVAL;
    // Get slightly more aggressive as player scores
    const aggressionBonus = Math.min(gameState.score * 0.05, 0.3);
    const adjustedAggression = AI.AGGRESSION + aggressionBonus;

    this.nextActionTimer = AI.MIN_PUNCH_INTERVAL +
      range * (1 - adjustedAggression) * Math.random() +
      AI.REACTION_TIME;
  }

  startBlock() {
    if (gameState.roundOver || gameState.gameOver) return;
    this.isBlocking = true;
    eventBus.emit(Events.OPPONENT_BLOCK_START);

    const duration = AI.BLOCK_DURATION_MIN +
      Math.random() * (AI.BLOCK_DURATION_MAX - AI.BLOCK_DURATION_MIN);
    this.blockTimer = duration;
  }

  endBlock() {
    this.isBlocking = false;
    eventBus.emit(Events.OPPONENT_BLOCK_END);
  }

  update(delta) {
    if (gameState.roundOver || gameState.gameOver) return;

    // Handle block duration
    if (this.isBlocking) {
      this.blockTimer -= delta;
      if (this.blockTimer <= 0) {
        this.endBlock();
      }
      return; // Don't punch while blocking
    }

    // Count down to next action
    this.nextActionTimer -= delta;
    if (this.nextActionTimer <= 0) {
      this.doAction();
      this.scheduleNextAction();
    }
  }

  doAction() {
    if (gameState.opponentPunchCooldown > 0) return;

    // Decide: punch or block
    const willBlock = Math.random() < AI.BLOCK_CHANCE * 0.5;
    if (willBlock) {
      this.startBlock();
      return;
    }

    // Random side
    if (Math.random() < 0.5) {
      eventBus.emit(Events.OPPONENT_PUNCH_LEFT);
    } else {
      eventBus.emit(Events.OPPONENT_PUNCH_RIGHT);
    }
  }

  reset() {
    this.nextActionTimer = 0;
    this.blockTimer = 0;
    this.isBlocking = false;
    this.scheduleNextAction();
  }
}
