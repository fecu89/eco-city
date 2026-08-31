const WARNING_THRESHOLDS = Object.freeze({
  credit: Object.freeze([6, 12]),
  essential: Object.freeze([3, 6]),
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

export function applyOperationalRisk(state, summary) {
  state.operationalRisk ||= { negativeCreditHours: 0, essentialBlackoutHours: 0, warningIds: [] };
  state.operationalRisk.warningIds ||= [];
  if (state.gameOver) {
    return { ...state.operationalRisk, warnings: [], pauseTransition: null, gameOverTransition: false };
  }
  const creditBefore = Math.max(0, Number(state.operationalRisk.negativeCreditHours) || 0);
  const essentialBefore = Math.max(0, Number(state.operationalRisk.essentialBlackoutHours) || 0);
  const negativeCreditHours = advanceCounter(creditBefore, state.credits < 0);
  const essentialBlackoutHours = advanceCounter(
    essentialBefore,
    (summary.essentialSupplyPercent ?? 100) <= 5,
  );
  state.operationalRisk.negativeCreditHours = negativeCreditHours;
  state.operationalRisk.essentialBlackoutHours = essentialBlackoutHours;
  const warnings = [
    ...newlyCrossedWarnings(state, 'credit', creditBefore, negativeCreditHours),
    ...newlyCrossedWarnings(state, 'essential', essentialBefore, essentialBlackoutHours),
  ];
  const pauseTransition = warnings.includes('credit-12')
    ? 'credit-12'
    : warnings.includes('essential-6')
      ? 'essential-6'
      : null;
  let gameOverTransition = false;
  if (negativeCreditHours >= 24) {
    state.gameOver = true;
    state.gameOverReason = 'bankruptcy';
    gameOverTransition = true;
  } else if (essentialBlackoutHours >= 12) {
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
