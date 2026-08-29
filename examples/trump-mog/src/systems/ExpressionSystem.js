import { eventBus, Events } from '../core/EventBus.js';
import { CHARACTER } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';

const EXP = CHARACTER.EXPRESSION;

/**
 * Maps game events to character expression changes.
 * Call initExpressionSystem() in GameScene.create().
 */
export function initExpressionSystem() {
  // Perfect mog — Trump celebrates, opponent shocked
  eventBus.on(Events.MOG_PERFECT, () => {
    eventBus.emit(Events.EXPRESSION_CHANGE, { target: 'trump', expression: EXP.HAPPY });
    eventBus.emit(Events.EXPRESSION_CHANGE, { target: 'biden', expression: EXP.SURPRISED });
  });

  // Good mog — Trump happy, opponent angry
  eventBus.on(Events.MOG_GOOD, () => {
    eventBus.emit(Events.EXPRESSION_CHANGE, { target: 'trump', expression: EXP.HAPPY });
    eventBus.emit(Events.EXPRESSION_CHANGE, { target: 'biden', expression: EXP.ANGRY });
  });

  // Miss — Trump surprised, opponent smug
  eventBus.on(Events.MOG_MISS, () => {
    eventBus.emit(Events.EXPRESSION_CHANGE, { target: 'trump', expression: EXP.SURPRISED });
    eventBus.emit(Events.EXPRESSION_CHANGE, { target: 'biden', expression: EXP.HAPPY });
  });

  // Meter full — Trump ecstatic, opponent devastated
  eventBus.on(Events.MOG_METER_FULL, () => {
    eventBus.emit(Events.EXPRESSION_CHANGE, { target: 'trump', expression: EXP.HAPPY });
    eventBus.emit(Events.EXPRESSION_CHANGE, { target: 'biden', expression: EXP.ANGRY });
  });
}

/**
 * Remove all expression listeners. Call on scene shutdown.
 */
export function destroyExpressionSystem() {
  // EventBus.removeAll() is called on restart, so this is a no-op safety net
}
