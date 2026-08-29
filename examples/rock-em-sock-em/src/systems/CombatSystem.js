// =============================================================================
// CombatSystem.js — Handles punch execution, blocking, damage, hit detection
//
// Listens to punch/block events from InputSystem and AI.
// Manages cooldowns, damage calculation, and head health.
// Emits hit results and head-pop (knockout) events.
// =============================================================================

import { COMBAT } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class CombatSystem {
  constructor() {
    // Listen to player input
    eventBus.on(Events.PLAYER_PUNCH_LEFT, () => this.playerPunch('left'));
    eventBus.on(Events.PLAYER_PUNCH_RIGHT, () => this.playerPunch('right'));
    eventBus.on(Events.PLAYER_BLOCK_START, () => { gameState.playerBlocking = true; });
    eventBus.on(Events.PLAYER_BLOCK_END, () => { gameState.playerBlocking = false; });

    // Listen to AI actions
    eventBus.on(Events.OPPONENT_PUNCH_LEFT, () => this.opponentPunch('left'));
    eventBus.on(Events.OPPONENT_PUNCH_RIGHT, () => this.opponentPunch('right'));
    eventBus.on(Events.OPPONENT_BLOCK_START, () => { gameState.opponentBlocking = true; });
    eventBus.on(Events.OPPONENT_BLOCK_END, () => { gameState.opponentBlocking = false; });
  }

  playerPunch(side) {
    if (gameState.roundOver || gameState.gameOver) return;
    if (gameState.playerPunchCooldown > 0) return;
    if (gameState.playerBlocking) return; // Can't punch while blocking

    gameState.playerPunching = side;
    gameState.playerPunchTimer = COMBAT.PUNCH_DURATION;
    gameState.playerPunchCooldown = COMBAT.PUNCH_COOLDOWN;
    gameState.playerBlocking = false; // Cancel block on punch

    // Emit spectacle action
    eventBus.emit(Events.SPECTACLE_ACTION, { actor: 'player', action: 'punch', side });

    // Check if hit connects (at mid-punch)
    // Actual hit check happens in update() when punch reaches peak
  }

  opponentPunch(side) {
    if (gameState.roundOver || gameState.gameOver) return;
    if (gameState.opponentPunchCooldown > 0) return;
    if (gameState.opponentBlocking) return;

    gameState.opponentPunching = side;
    gameState.opponentPunchTimer = COMBAT.PUNCH_DURATION;
    gameState.opponentPunchCooldown = COMBAT.PUNCH_COOLDOWN;
    gameState.opponentBlocking = false;

    eventBus.emit(Events.SPECTACLE_ACTION, { actor: 'opponent', action: 'punch', side });
  }

  update(delta) {
    if (gameState.roundOver || gameState.gameOver) return;

    // --- Update cooldowns ---
    if (gameState.playerPunchCooldown > 0) {
      gameState.playerPunchCooldown -= delta;
    }
    if (gameState.opponentPunchCooldown > 0) {
      gameState.opponentPunchCooldown -= delta;
    }

    // --- Player punch animation + hit check ---
    if (gameState.playerPunching) {
      gameState.playerPunchTimer -= delta;

      // Hit check at the midpoint of the punch
      const halfDuration = COMBAT.PUNCH_DURATION / 2;
      const prevTimer = gameState.playerPunchTimer + delta;
      if (prevTimer >= halfDuration && gameState.playerPunchTimer < halfDuration) {
        this.resolveHit('player');
      }

      if (gameState.playerPunchTimer <= 0) {
        gameState.playerPunching = null;
        gameState.playerPunchTimer = 0;
      }
    }

    // --- Opponent punch animation + hit check ---
    if (gameState.opponentPunching) {
      gameState.opponentPunchTimer -= delta;

      const halfDuration = COMBAT.PUNCH_DURATION / 2;
      const prevTimer = gameState.opponentPunchTimer + delta;
      if (prevTimer >= halfDuration && gameState.opponentPunchTimer < halfDuration) {
        this.resolveHit('opponent');
      }

      if (gameState.opponentPunchTimer <= 0) {
        gameState.opponentPunching = null;
        gameState.opponentPunchTimer = 0;
      }
    }

    // --- Combo timer ---
    if (gameState.comboTimer > 0) {
      gameState.comboTimer -= delta;
      if (gameState.comboTimer <= 0) {
        gameState.combo = 0;
      }
    }
  }

  /**
   * Resolve a hit from attacker to defender.
   * @param {'player' | 'opponent'} attacker
   */
  resolveHit(attacker) {
    const isPlayer = attacker === 'player';
    const defenderBlocking = isPlayer ? gameState.opponentBlocking : gameState.playerBlocking;

    let damage = COMBAT.PUNCH_DAMAGE;
    let blocked = false;

    if (defenderBlocking) {
      damage = COMBAT.BLOCKED_DAMAGE;
      blocked = true;
    }

    if (isPlayer) {
      gameState.opponentHeadHealth -= damage;
      if (gameState.opponentHeadHealth < 0) gameState.opponentHeadHealth = 0;

      eventBus.emit(Events.HIT_OPPONENT, { damage, blocked });

      if (!blocked) {
        // Update combo
        gameState.combo += 1;
        gameState.comboTimer = COMBAT.COMBO_WINDOW;
        if (gameState.combo > gameState.bestCombo) {
          gameState.bestCombo = gameState.combo;
        }

        eventBus.emit(Events.SPECTACLE_HIT, { attacker: 'player', damage, combo: gameState.combo });

        if (gameState.combo >= 3) {
          eventBus.emit(Events.SPECTACLE_COMBO, { combo: gameState.combo });
        }
      }

      // Check knockout
      if (gameState.opponentHeadHealth <= 0) {
        this.knockout('opponent');
      }
    } else {
      gameState.playerHeadHealth -= damage;
      if (gameState.playerHeadHealth < 0) gameState.playerHeadHealth = 0;

      eventBus.emit(Events.HIT_PLAYER, { damage, blocked });

      // Reset player combo on getting hit (if not blocked)
      if (!blocked) {
        gameState.combo = 0;
        gameState.comboTimer = 0;
      }

      eventBus.emit(Events.SPECTACLE_HIT, { attacker: 'opponent', damage, combo: 0 });

      // Check knockout
      if (gameState.playerHeadHealth <= 0) {
        this.knockout('player');
      }
    }
  }

  /**
   * Handle knockout — head pops up.
   * @param {'player' | 'opponent'} loser
   */
  knockout(loser) {
    gameState.roundOver = true;

    if (loser === 'opponent') {
      gameState.opponentHeadPopped = true;
      eventBus.emit(Events.HEAD_POP_OPPONENT);

      // Player wins the round
      gameState.addScore(1);
      eventBus.emit(Events.SCORE_CHANGED, { score: gameState.score });
      eventBus.emit(Events.ROUND_WON, { winner: 'player', score: gameState.score });

      // Reset for next round after delay
      gameState.roundResetTimer = COMBAT.ROUND_RESET_DELAY;
    } else {
      gameState.playerHeadPopped = true;
      eventBus.emit(Events.HEAD_POP_PLAYER);

      // AI wins = game over
      gameState.gameOver = true;
      eventBus.emit(Events.GAME_OVER, { score: gameState.score });
      eventBus.emit(Events.MUSIC_GAMEOVER);
    }
  }
}
