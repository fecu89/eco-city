import { CARBON_CRISIS } from '../core/Constants.js';

export function carbonPressureForHours(unsafeHours = 0) {
  const hours = Math.max(0, Number(unsafeHours) || 0);
  if (hours >= 168) return { tier: 'extreme', unsafeHours: hours, healthMultiplier: 1.5, residentialIncomeMultiplier: 0.9, waterMultiplier: 1.05, reportPenalty: 5 };
  if (hours >= 144) return { tier: 'severe', unsafeHours: hours, healthMultiplier: 1.5, residentialIncomeMultiplier: 0.9, waterMultiplier: 1.05, reportPenalty: 5 };
  if (hours >= 72) return { tier: 'danger', unsafeHours: hours, healthMultiplier: 1.5, residentialIncomeMultiplier: 0.9, waterMultiplier: 1.05, reportPenalty: 0 };
  if (hours >= 24) return { tier: 'watch', unsafeHours: hours, healthMultiplier: 1.25, residentialIncomeMultiplier: 1, waterMultiplier: 1, reportPenalty: 0 };
  return { tier: 'normal', unsafeHours: hours, healthMultiplier: 1, residentialIncomeMultiplier: 1, waterMultiplier: 1, reportPenalty: 0 };
}

export function applyCarbonCrisis(state, hourlyCarbon) {
  const active = state.questIndex > CARBON_CRISIS.ACTIVE_AFTER_QUEST
    || state.claimedQuestIds?.has?.('growth-cost');
  state.carbonWarningMilestones ||= new Set();
  if (!active) {
    return { active: false, hours: state.carbonCrisisHours || 0, warnings: [], gameOverTransition: false, pressure: carbonPressureForHours(state.carbonCrisisHours) };
  }
  if (state.gameOver) {
    return { active: true, hours: state.carbonCrisisHours, warnings: [], gameOverTransition: false, pressure: carbonPressureForHours(state.carbonCrisisHours) };
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
    pressure: carbonPressureForHours(state.carbonCrisisHours),
  };
}
