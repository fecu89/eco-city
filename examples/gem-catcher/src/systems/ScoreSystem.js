import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

export class ScoreSystem {
  constructor() {
    this.onGemCaught = this.onGemCaught.bind(this);
    eventBus.on(Events.GEM_CAUGHT, this.onGemCaught);
  }

  onGemCaught() {
    gameState.addScore(1);
    eventBus.emit(Events.SCORE_CHANGED, { score: gameState.score });
  }

  destroy() {
    eventBus.off(Events.GEM_CAUGHT, this.onGemCaught);
  }
}
