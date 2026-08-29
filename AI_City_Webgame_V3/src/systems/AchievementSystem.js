import { BADGES, GAME } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';

function unlock(id) {
  if (gameState.badges.has(id)) return;
  gameState.badges.add(id);
  const badge = BADGES.find((b) => b.id === id);
  eventBus.emit(Events.BADGE_UNLOCKED, { id, badge });
}

function checkSynergy(metrics) {
  if (metrics && metrics.synergyLinks >= 2) unlock('synergy');
}

export function initAchievementSystem() {
  eventBus.on(Events.BOARD_PLACED, ({ metrics, placedCount }) => {
    if (placedCount === GAME.MIN_CELLS_TO_COMPLETE_STAGE1) unlock('builder');
    checkSynergy(metrics);
  });

  eventBus.on(Events.BOARD_UPGRADED, ({ metrics }) => {
    unlock('upgrade');
    checkSynergy(metrics);
  });

  eventBus.on(Events.STAGE_CHANGED, ({ stage, from }) => {
    if (from === 1 && stage === 2) unlock('crisis');
  });

  eventBus.on(Events.BOARD_EXPANDED, () => unlock('expansion'));

  eventBus.on(Events.QUIZ_FINISHED, ({ passed }) => {
    if (passed) unlock('scholar');
  });

  eventBus.on(Events.DIAGNOSIS_COMPLETE, ({ noHints }) => {
    if (noHints) unlock('diagnosis');
  });

  eventBus.on(Events.EVIDENCE_SAVED, () => {
    const good = gameState.evidence.filter((e) => e.good).length;
    if (good >= 3) unlock('evidence');
  });

  eventBus.on(Events.REDESIGN_VALIDATED, ({ allPassed, metrics }) => {
    checkSynergy(metrics);
    if (allPassed) unlock('mayor');
  });
}
