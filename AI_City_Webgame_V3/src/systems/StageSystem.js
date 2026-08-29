import { STAGE_INFO } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';

export function setStage(next) {
  const from = gameState.stage;
  gameState.stage = next;
  gameState.selectedCell = null;
  eventBus.emit(Events.STAGE_CHANGED, { stage: next, from });
  return next;
}

export function currentStageInfo() {
  return STAGE_INFO[gameState.stage];
}
