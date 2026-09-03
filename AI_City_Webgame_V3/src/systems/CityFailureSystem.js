import { CITY_FAILURE_RULES } from '../core/Constants.js';

const WARNING_THRESHOLDS = Object.freeze({
  credit: Object.freeze([
    CITY_FAILURE_RULES.CREDIT_WARNING_DAYS,
    CITY_FAILURE_RULES.CREDIT_PAUSE_DAYS,
  ]),
  essential: Object.freeze([
    CITY_FAILURE_RULES.ESSENTIAL_WARNING_DAYS,
    CITY_FAILURE_RULES.ESSENTIAL_PAUSE_DAYS,
  ]),
});

// 일시정지 모달이 문자열 형식을 다시 만들지 않도록 id를 여기서 한 번만 정의한다.
export const OPERATIONAL_PAUSE_IDS = Object.freeze({
  CREDIT: `credit-${CITY_FAILURE_RULES.CREDIT_PAUSE_DAYS}`,
  ESSENTIAL: `essential-${CITY_FAILURE_RULES.ESSENTIAL_PAUSE_DAYS}`,
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
  state.operationalRisk ||= { negativeCreditDays: 0, essentialBlackoutDays: 0, warningIds: [] };
  state.operationalRisk.warningIds ||= [];
  if (state.gameOver) {
    return { ...state.operationalRisk, warnings: [], pauseTransition: null, gameOverTransition: false };
  }
  const gridIsOperational = isOperationalRiskActive(state);
  if (!gridIsOperational) {
    state.operationalRisk.negativeCreditDays = 0;
    state.operationalRisk.essentialBlackoutDays = 0;
    return { ...state.operationalRisk, warnings: [], pauseTransition: null, gameOverTransition: false };
  }
  const creditBefore = Math.max(0, Number(state.operationalRisk.negativeCreditDays) || 0);
  const essentialBefore = Math.max(0, Number(state.operationalRisk.essentialBlackoutDays) || 0);
  const migrationGraceActive = (Number(state.workforceRebalanceGraceDays) || 0) > 0;
  const negativeCreditDays = migrationGraceActive && state.credits < 0
    ? creditBefore
    : advanceCounter(creditBefore, state.credits < 0);
  const essentialBlackoutDays = advanceCounter(
    essentialBefore,
    (summary.essentialSupplyPercent ?? 100) <= CITY_FAILURE_RULES.ESSENTIAL_BLACKOUT_PERCENT,
  );
  state.operationalRisk.negativeCreditDays = negativeCreditDays;
  state.operationalRisk.essentialBlackoutDays = essentialBlackoutDays;
  const warnings = [
    ...newlyCrossedWarnings(state, 'credit', creditBefore, negativeCreditDays),
    ...newlyCrossedWarnings(state, 'essential', essentialBefore, essentialBlackoutDays),
  ];
  const pauseTransition = warnings.includes(OPERATIONAL_PAUSE_IDS.CREDIT)
    ? OPERATIONAL_PAUSE_IDS.CREDIT
    : warnings.includes(OPERATIONAL_PAUSE_IDS.ESSENTIAL)
      ? OPERATIONAL_PAUSE_IDS.ESSENTIAL
      : null;
  let gameOverTransition = false;
  if (negativeCreditDays >= CITY_FAILURE_RULES.CREDIT_GAME_OVER_DAYS) {
    state.gameOver = true;
    state.gameOverReason = 'bankruptcy';
    gameOverTransition = true;
  } else if (essentialBlackoutDays >= CITY_FAILURE_RULES.ESSENTIAL_GAME_OVER_DAYS) {
    state.gameOver = true;
    state.gameOverReason = 'essential_blackout';
    gameOverTransition = true;
  }
  return {
    negativeCreditDays,
    essentialBlackoutDays,
    warningIds: [...state.operationalRisk.warningIds],
    warnings,
    pauseTransition,
    gameOverTransition,
  };
}
