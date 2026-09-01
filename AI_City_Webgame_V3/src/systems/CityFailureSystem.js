import { CITY_FAILURE_RULES } from '../core/Constants.js';

const WARNING_THRESHOLDS = Object.freeze({
  credit: Object.freeze([
    CITY_FAILURE_RULES.CREDIT_WARNING_HOURS,
    CITY_FAILURE_RULES.CREDIT_PAUSE_HOURS,
  ]),
  essential: Object.freeze([
    CITY_FAILURE_RULES.ESSENTIAL_WARNING_HOURS,
    CITY_FAILURE_RULES.ESSENTIAL_PAUSE_HOURS,
  ]),
});

function advanceCounter(current, unsafe) {
  return unsafe ? current + 1 : Math.max(0, current - 1);
}

function newlyCrossedWarnings(state, kind, before, after) {
  const warnings = [];
  WARNING_THRESHOLDS[kind].forEach((threshold) => {
    const id = `${kind}-${threshold}`;
    if (before < threshold && after >= threshold && !state.operationalRisk.warningIds.includes(id)) {
      state.operationalRisk.warningIds.push(id);
      warnings.push(id);
    }
  });
  return warnings;
}

export function isOperationalRiskActive(state) {
  return Boolean(
    state.claimedQuestIds?.has?.(CITY_FAILURE_RULES.ACTIVE_AFTER_QUEST_ID)
    || Number(state.questIndex) > CITY_FAILURE_RULES.ACTIVE_AFTER_QUEST_INDEX
    || Number(state.progression?.chapter) > 1,
  );
}

export function applyOperationalRisk(state, summary) {
  state.operationalRisk ||= { negativeCreditHours: 0, essentialBlackoutHours: 0, warningIds: [] };
  state.operationalRisk.warningIds ||= [];
  if (state.gameOver) {
    return { ...state.operationalRisk, warnings: [], pauseTransition: null, gameOverTransition: false };
  }
  const gridIsOperational = isOperationalRiskActive(state);
  if (!gridIsOperational) {
    state.operationalRisk.negativeCreditHours = 0;
    state.operationalRisk.essentialBlackoutHours = 0;
    return { ...state.operationalRisk, warnings: [], pauseTransition: null, gameOverTransition: false };
  }
  const creditBefore = Math.max(0, Number(state.operationalRisk.negativeCreditHours) || 0);
  const essentialBefore = Math.max(0, Number(state.operationalRisk.essentialBlackoutHours) || 0);
  const negativeCreditHours = advanceCounter(creditBefore, state.credits < 0);
  const essentialBlackoutHours = advanceCounter(
    essentialBefore,
    (summary.essentialSupplyPercent ?? 100) <= CITY_FAILURE_RULES.ESSENTIAL_BLACKOUT_PERCENT,
  );
  state.operationalRisk.negativeCreditHours = negativeCreditHours;
  state.operationalRisk.essentialBlackoutHours = essentialBlackoutHours;
  const warnings = [
    ...newlyCrossedWarnings(state, 'credit', creditBefore, negativeCreditHours),
    ...newlyCrossedWarnings(state, 'essential', essentialBefore, essentialBlackoutHours),
  ];
  const creditPauseId = `credit-${CITY_FAILURE_RULES.CREDIT_PAUSE_HOURS}`;
  const essentialPauseId = `essential-${CITY_FAILURE_RULES.ESSENTIAL_PAUSE_HOURS}`;
  const pauseTransition = warnings.includes(creditPauseId)
    ? creditPauseId
    : warnings.includes(essentialPauseId)
      ? essentialPauseId
      : null;
  let gameOverTransition = false;
  if (negativeCreditHours >= CITY_FAILURE_RULES.CREDIT_GAME_OVER_HOURS) {
    state.gameOver = true;
    state.gameOverReason = 'bankruptcy';
    gameOverTransition = true;
  } else if (essentialBlackoutHours >= CITY_FAILURE_RULES.ESSENTIAL_GAME_OVER_HOURS) {
    state.gameOver = true;
    state.gameOverReason = 'essential_blackout';
    gameOverTransition = true;
  }
  return {
    negativeCreditHours,
    essentialBlackoutHours,
    warningIds: [...state.operationalRisk.warningIds],
    warnings,
    pauseTransition,
    gameOverTransition,
  };
}
