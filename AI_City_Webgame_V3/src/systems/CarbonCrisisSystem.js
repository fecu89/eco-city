import { CARBON_CRISIS } from '../core/Constants.js';

export function applyCarbonCrisis(state, hourlyCarbon) {
  const active = state.questIndex > CARBON_CRISIS.ACTIVE_AFTER_QUEST
    || state.claimedQuestIds?.has?.('growth-cost');
  state.carbonWarningMilestones ||= new Set();
  if (!active) {
    return { active: false, hours: state.carbonCrisisHours || 0, warnings: [], gameOverTransition: false };
  }
  if (state.gameOver) {
    return { active: true, hours: state.carbonCrisisHours, warnings: [], gameOverTransition: false };
  }

  const previousHours = Math.max(0, Number(state.carbonCrisisHours) || 0);
  const unsafe = Number(hourlyCarbon) > CARBON_CRISIS.SAFE_HOURLY;
  state.carbonCrisisHours = unsafe
    ? previousHours + 1
    : Math.max(0, previousHours - CARBON_CRISIS.RECOVERY_PER_SAFE_HOUR);

  const warnings = CARBON_CRISIS.WARNING_HOURS.filter((milestone) => (
    previousHours < milestone
    && state.carbonCrisisHours >= milestone
    && !state.carbonWarningMilestones.has(milestone)
  ));
  warnings.forEach((milestone) => state.carbonWarningMilestones.add(milestone));

  const gameOverTransition = state.carbonCrisisHours >= CARBON_CRISIS.GAME_OVER_HOURS;
  if (gameOverTransition) {
    state.carbonCrisisHours = CARBON_CRISIS.GAME_OVER_HOURS;
    state.gameOver = true;
    state.gameOverReason = 'carbon_crisis';
  }
  return {
    active: true,
    unsafe,
    hours: state.carbonCrisisHours,
    warnings,
    gameOverTransition,
  };
}
