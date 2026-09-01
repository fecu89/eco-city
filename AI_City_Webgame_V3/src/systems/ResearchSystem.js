import { FACILITIES, RESEARCH_RULES } from '../core/Constants.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { QUESTS } from '../core/QuestDefinitions.js';
import { roundCredits } from '../core/Money.js';
import { effectiveFacilityStats, facilityModifierAt } from './CityModifierSystem.js';
import { isOperationalCell, operationProfileForCell } from './ConstructionProjectSystem.js';
export { researchEffects } from './ResearchEffectSystem.js';

function prerequisiteMet(state, prerequisite) {
  const [kind, id, rawLevel] = prerequisite.split(':');
  if (kind === 'facility') return state.unlockedFacilities.has(id);
  if (kind === 'research') return state.research.completedIds.has(id);
  if (kind === 'tech') return (state.research.techLevels[id] || 0) >= Number(rawLevel);
  return false;
}

function prerequisiteGroup(definition) {
  if (Array.isArray(definition.prerequisites)) return { mode: 'all', items: definition.prerequisites };
  return definition.prerequisites || { mode: 'all', items: [] };
}

function unmetPrerequisites(state, definition) {
  const group = prerequisiteGroup(definition);
  const missing = group.items.filter((item) => !prerequisiteMet(state, item));
  if (group.mode === 'any' && missing.length < group.items.length) return [];
  return missing;
}

function prerequisiteLabel(prerequisite) {
  const [kind, id, rawLevel] = prerequisite.split(':');
  if (kind === 'facility') return `${FACILITIES[id]?.name || id} 해금 필요`;
  if (kind === 'research') return `${RESEARCH[id]?.name || id} 완료 필요`;
  if (kind === 'tech') return `${FACILITIES[id]?.name || id} 기술 Lv.${rawLevel} 필요`;
  if (kind === 'quest') {
    const quest = QUESTS.find(({ id: questId }) => questId === id);
    return `퀘스트 ‘${quest?.title || id}’ 완료 필요`;
  }
  return prerequisite;
}

function researchJobs(state) {
  state.research.jobs ||= {};
  return state.research.jobs;
}

export function activeResearchJobs(state) {
  return Object.values(researchJobs(state));
}

export function listResearchAvailability(state) {
  const jobs = researchJobs(state);
  return Object.values(RESEARCH).map((definition) => {
    const prerequisiteCodes = unmetPrerequisites(state, definition);
    const questCodes = definition.unlockAfterQuestId && !state.claimedQuestIds.has(definition.unlockAfterQuestId)
      ? [`quest:${definition.unlockAfterQuestId}`]
      : [];
    const reasonCodes = [...prerequisiteCodes, ...questCodes];
    const completed = state.research.completedIds.has(definition.id);
    const reasonLabels = [
      ...groupLabel(definition, prerequisiteCodes.map(prerequisiteLabel)),
      ...questCodes.map(prerequisiteLabel),
    ];
    return {
      ...definition,
      completed,
      active: Boolean(jobs[definition.id]),
      available: !completed && !jobs[definition.id] && reasonCodes.length === 0,
      reasonCodes,
      reasonLabels,
    };
  });
}

function groupLabel(definition, labels) {
  const group = prerequisiteGroup(definition);
  if (group.mode === 'any' && labels.length > 1) return [`${labels.join(' 또는 ')}`];
  return labels;
}

function validDataCenter(state, index) {
  return Number.isInteger(index)
    && isOperationalCell(state.grid[index])
    && state.grid[index].type === 'data';
}

function dataCenterJob(state, index, excludedResearchId = null) {
  return activeResearchJobs(state).find((job) => (
    job.id !== excludedResearchId && job.dataCenterIndex === index
  ));
}

export function startResearch(state, researchId, dataCenterIndex) {
  const definition = RESEARCH[researchId];
  const jobs = researchJobs(state);
  if (!definition) return { ok: false, reason: 'unknown_research' };
  if (!state.researchMenuUnlocked) return { ok: false, reason: 'research_locked' };
  if (jobs[researchId]) return { ok: false, reason: 'research_active' };
  if (state.research.completedIds.has(researchId)) return { ok: false, reason: 'already_completed' };
  const availability = listResearchAvailability(state).find(({ id }) => id === researchId);
  if (!availability.available) return { ok: false, reason: 'prerequisite', reasonCodes: availability.reasonCodes };
  if (!validDataCenter(state, dataCenterIndex)) return { ok: false, reason: 'invalid_data_center' };
  if (dataCenterJob(state, dataCenterIndex)) return { ok: false, reason: 'data_center_busy' };
  if (state.credits < definition.cost) return { ok: false, reason: 'insufficient_credits', cost: definition.cost };

  state.credits = roundCredits(state.credits - definition.cost);
  state.research.quizAccelerationBankDays = 0;
  jobs[researchId] = {
    id: researchId,
    dataCenterIndex,
    elapsedEffectiveDays: 0,
    status: 'running',
    paidCost: definition.cost,
  };
  return { ok: true, researchId, dataCenterIndex, cost: definition.cost, bankedDaysApplied: 0 };
}

export function cancelResearch(state, researchId) {
  const jobs = researchJobs(state);
  const active = jobs[researchId];
  if (!active) return { ok: false, reason: 'no_active_research' };
  const definition = RESEARCH[active.id];
  const refund = Math.floor((active.paidCost ?? definition.cost) * RESEARCH_RULES.CANCEL_REFUND_RATIO);
  state.credits = roundCredits(state.credits + refund);
  delete jobs[researchId];
  return { ok: true, researchId: active.id, refund };
}

export function assignResearchDataCenter(state, researchId, index) {
  const active = researchJobs(state)[researchId];
  if (!active) return { ok: false, reason: 'no_active_research' };
  if (!validDataCenter(state, index)) return { ok: false, reason: 'invalid_data_center' };
  if (dataCenterJob(state, index, researchId)) return { ok: false, reason: 'data_center_busy' };
  active.dataCenterIndex = index;
  active.status = 'running';
  return { ok: true, researchId: active.id, dataCenterIndex: index };
}

export function researchDemandByIndex(state) {
  return activeResearchJobs(state).reduce((demand, job) => {
    const cell = state.grid[job.dataCenterIndex];
    if (validDataCenter(state, job.dataCenterIndex)
      && (cell.project?.kind === 'upgrade' || cell.operationMode !== 'eco')) {
      demand[job.dataCenterIndex] = RESEARCH_RULES.EXTRA_DEMAND * operationProfileForCell(cell).demand;
    }
    return demand;
  }, {});
}

function applyOutcome(state, outcome) {
  if (outcome.tech) {
    const [type, level] = outcome.tech;
    state.research.techLevels[type] = Math.max(state.research.techLevels[type] || 0, level);
  }
  if (outcome.techAll) {
    Object.entries(outcome.techAll).forEach(([type, level]) => {
      state.research.techLevels[type] = Math.max(state.research.techLevels[type] || 0, level);
    });
  }
  if (outcome.unlockFacility) state.unlockedFacilities.add(outcome.unlockFacility);
}

export function completeResearchJob(state, researchId) {
  const jobs = researchJobs(state);
  const active = jobs[researchId];
  const definition = RESEARCH[researchId];
  if (!active || !definition) return null;
  state.research.completedIds.add(researchId);
  applyOutcome(state, definition.outcome);
  delete jobs[researchId];
  return { researchId, outcome: definition.outcome };
}

export function accelerateResearchFromQuiz(state, researchId, days = null) {
  const job = researchJobs(state)[researchId];
  const definition = RESEARCH[researchId];
  if (!job || !definition) {
    return { appliedJobs: [], days: 0, completed: [], reason: 'research_not_active' };
  }
  const accelerationDays = Math.max(
    0,
    Number(days ?? (definition.durationDays / RESEARCH_RULES.QUIZ_QUESTION_COUNT)) || 0,
  );
  job.elapsedEffectiveDays = Math.min(
    definition.durationDays,
    job.elapsedEffectiveDays + accelerationDays,
  );
  const completed = [];
  if (job.elapsedEffectiveDays >= definition.durationDays) {
    const completion = completeResearchJob(state, researchId);
    if (completion) completed.push(completion);
  }
  return {
    appliedJobs: [researchId],
    days: accelerationDays,
    completed,
  };
}

export function advanceResearchOneDay(state, facilityPower, modifierContext = null) {
  const results = {};
  const completed = [];

  for (const active of [...activeResearchJobs(state)]) {
    const definition = RESEARCH[active.id];
    if (!definition) continue;
    const previousStatus = active.status;
    if (!validDataCenter(state, active.dataCenterIndex)) {
      active.dataCenterIndex = null;
      active.status = 'unassigned';
      results[active.id] = { status: 'unassigned', advancedDays: 0, completed: false };
      continue;
    }
    const ratio = facilityPower?.[active.dataCenterIndex]?.ratio ?? 0;
    if (ratio < RESEARCH_RULES.POWER_THRESHOLD) {
      active.status = 'underpowered';
      results[active.id] = {
        status: 'underpowered',
        advancedDays: 0,
        completed: false,
        ratio,
        dataCenterIndex: active.dataCenterIndex,
        becameUnderpowered: previousStatus !== 'underpowered',
        recoveredPower: false,
      };
      continue;
    }
    const cell = state.grid[active.dataCenterIndex];
    const researchSpeed = effectiveFacilityStats(
      cell,
      facilityModifierAt(modifierContext, active.dataCenterIndex),
    ).researchSpeed;
    if (researchSpeed <= 0) {
      active.status = 'mode_paused';
      results[active.id] = {
        status: 'mode_paused',
        advancedDays: 0,
        completed: false,
        ratio,
        dataCenterIndex: active.dataCenterIndex,
      };
      continue;
    }
    const dataCenterLevel = state.grid[active.dataCenterIndex]?.level || 1;
    const advancedDays = (RESEARCH_RULES.DATA_CENTER_SPEED[dataCenterLevel] || 1) * researchSpeed;
    active.elapsedEffectiveDays = Math.min(definition.durationDays, active.elapsedEffectiveDays + advancedDays);
    active.status = 'running';
    if (active.elapsedEffectiveDays < definition.durationDays) {
      results[active.id] = {
        status: 'running',
        advancedDays,
        completed: false,
        ratio,
        dataCenterIndex: active.dataCenterIndex,
        becameUnderpowered: false,
        recoveredPower: previousStatus === 'underpowered',
        elapsedEffectiveDays: active.elapsedEffectiveDays,
      };
      continue;
    }
    const completion = completeResearchJob(state, active.id);
    const result = {
      status: 'completed',
      advancedDays,
      completed: true,
      researchId: definition.id,
      outcome: definition.outcome,
    };
    results[active.id] = result;
    if (completion) completed.push(result);
  }

  return { status: activeResearchJobs(state).length ? 'active' : 'idle', jobs: results, completed };
}

export function handleResearchFacilityRemoved(state, index) {
  activeResearchJobs(state).forEach((job) => {
    if (job.dataCenterIndex !== index) return;
    job.dataCenterIndex = null;
    job.status = 'unassigned';
  });
}
