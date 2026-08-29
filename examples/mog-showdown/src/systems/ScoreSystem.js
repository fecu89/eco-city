import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { MOG } from '../core/Constants.js';

/**
 * ScoreSystem -- handles scoring, combo tracking, and mog meter progression.
 * Listens for power-up collection and attack hit events.
 */
export class ScoreSystem {
  constructor() {
    this.onPowerupCollected = this.onPowerupCollected.bind(this);
    this.onAttackHit = this.onAttackHit.bind(this);
    this.onFrameMog = this.onFrameMog.bind(this);

    eventBus.on(Events.POWERUP_COLLECTED, this.onPowerupCollected);
    eventBus.on(Events.ATTACK_HIT, this.onAttackHit);
    eventBus.on(Events.MOG_FRAMEMOG, this.onFrameMog);
  }

  onPowerupCollected(data) {
    // Score a point
    gameState.addScore(1);

    // Increment combo
    gameState.addCombo();

    // Emit score change
    eventBus.emit(Events.SCORE_CHANGED, { score: gameState.score });

    // Spectacle: hit
    eventBus.emit(Events.SPECTACLE_HIT, { type: data?.type });

    // Spectacle: combo
    if (gameState.combo > 1) {
      eventBus.emit(Events.SPECTACLE_COMBO, { combo: gameState.combo });
    }

    // Spectacle: streak milestones
    const collected = gameState.powerupsCollected;
    if (collected === 5 || collected === 10 || collected === 25) {
      eventBus.emit(Events.SPECTACLE_STREAK, { streak: collected });
    }

    // Mog meter progression
    const mogFilled = gameState.addMogProgress();
    if (mogFilled) {
      eventBus.emit(Events.MOG_LEVELUP, { mogLevel: gameState.mogLevel });
      eventBus.emit(Events.MOG_FRAMEMOG, { mogLevel: gameState.mogLevel });
    }
  }

  onAttackHit() {
    // Break combo
    gameState.breakCombo();
    eventBus.emit(Events.COMBO_BREAK);

    // Lose a life
    const livesRemaining = gameState.loseLife();
    eventBus.emit(Events.LIFE_LOST, { lives: livesRemaining });
    eventBus.emit(Events.PLAYER_DAMAGED, { lives: livesRemaining });

    // Check for game over
    if (livesRemaining <= 0) {
      eventBus.emit(Events.PLAYER_DIED);
    }
  }

  onFrameMog(data) {
    // Bonus points for frame mog
    gameState.addScore(MOG.FRAME_MOG_BONUS);
    eventBus.emit(Events.SCORE_CHANGED, { score: gameState.score });
  }

  destroy() {
    eventBus.off(Events.POWERUP_COLLECTED, this.onPowerupCollected);
    eventBus.off(Events.ATTACK_HIT, this.onAttackHit);
    eventBus.off(Events.MOG_FRAMEMOG, this.onFrameMog);
  }
}
