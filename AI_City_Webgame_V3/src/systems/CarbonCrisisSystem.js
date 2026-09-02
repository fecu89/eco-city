import { CARBON_CRISIS } from '../core/Constants.js';

// 경보 마일스톤은 주의 -> 위험 -> 심각 순서로 정의돼 있다.
const [WATCH_DAYS, DANGER_DAYS, SEVERE_DAYS] = CARBON_CRISIS.WARNING_DAYS;

export function carbonPressureForDays(unsafeDays = 0) {
  const days = Math.max(0, Number(unsafeDays) || 0);
  if (days >= CARBON_CRISIS.GAME_OVER_DAYS) return { tier: 'extreme', unsafeDays: days, healthMultiplier: 1.5, residentialIncomeMultiplier: 0.9, waterMultiplier: 1.05, reportPenalty: 5 };
  if (days >= SEVERE_DAYS) return { tier: 'severe', unsafeDays: days, healthMultiplier: 1.5, residentialIncomeMultiplier: 0.9, waterMultiplier: 1.05, reportPenalty: 5 };
  if (days >= DANGER_DAYS) return { tier: 'danger', unsafeDays: days, healthMultiplier: 1.5, residentialIncomeMultiplier: 0.9, waterMultiplier: 1.05, reportPenalty: 0 };
  if (days >= WATCH_DAYS) return { tier: 'watch', unsafeDays: days, healthMultiplier: 1.25, residentialIncomeMultiplier: 1, waterMultiplier: 1, reportPenalty: 0 };
  return { tier: 'normal', unsafeDays: days, healthMultiplier: 1, residentialIncomeMultiplier: 1, waterMultiplier: 1, reportPenalty: 0 };
}

export function applyCarbonCrisis(state, dailyCarbon) {
  const active = state.questIndex > CARBON_CRISIS.ACTIVE_AFTER_QUEST
    || state.claimedQuestIds?.has?.('growth-cost');
  state.carbonWarningMilestones ||= new Set();
  if (!active) {
    return { active: false, days: state.carbonCrisisDays || 0, warnings: [], gameOverTransition: false, pressure: carbonPressureForDays(state.carbonCrisisDays) };
  }
  if (state.gameOver) {
    return { active: true, days: state.carbonCrisisDays, warnings: [], gameOverTransition: false, pressure: carbonPressureForDays(state.carbonCrisisDays) };
  }

  const previousDays = Math.max(0, Number(state.carbonCrisisDays) || 0);
  const unsafe = Number(dailyCarbon) > CARBON_CRISIS.SAFE_DAILY;
  state.carbonCrisisDays = unsafe
    ? previousDays + 1
    : Math.max(0, previousDays - CARBON_CRISIS.RECOVERY_PER_SAFE_DAY);

  // 위기 일수를 0까지 되돌린 도시는 경보 이력도 함께 지운다. 다시 나빠지면 처음처럼 경고한다.
  if (state.carbonCrisisDays === 0) state.carbonWarningMilestones.clear();

  const warnings = CARBON_CRISIS.WARNING_DAYS.filter((milestone) => (
    previousDays < milestone
    && state.carbonCrisisDays >= milestone
    && !state.carbonWarningMilestones.has(milestone)
  ));
  warnings.forEach((milestone) => state.carbonWarningMilestones.add(milestone));

  const gameOverTransition = state.carbonCrisisDays >= CARBON_CRISIS.GAME_OVER_DAYS;
  if (gameOverTransition) {
    state.carbonCrisisDays = CARBON_CRISIS.GAME_OVER_DAYS;
    state.gameOver = true;
    state.gameOverReason = 'carbon_crisis';
  }
  return {
    active: true,
    unsafe,
    days: state.carbonCrisisDays,
    warnings,
    gameOverTransition,
    pressure: carbonPressureForDays(state.carbonCrisisDays),
  };
}
