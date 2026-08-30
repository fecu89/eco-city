import { RESEARCH_RULES } from '../core/Constants.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { roundCredits } from '../core/Money.js';

function prerequisiteMet(state, prerequisite) {
  const [kind, id, rawLevel] = prerequisite.split(':');
  if (kind === 'facility') return state.unlockedFacilities.has(id);
  if (kind === 'research') return state.research.completedIds.has(id);
  if (kind === 'tech') return (state.research.techLevels[id] || 0) >= Number(rawLevel);
  return false;
}

function prerequisiteLabel(prerequisite) {
  const [kind, id, rawLevel] = prerequisite.split(':');
  if (kind === 'facility') return `${id} 시설 해금 필요`;
  if (kind === 'research') return `${RESEARCH[id]?.name || id} 완료 필요`;
  if (kind === 'tech') return `${id} 기술 Lv.${rawLevel} 필요`;
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
    const reasonCodes = definition.prerequisites.filter((item) => !prerequisiteMet(state, item));
    const completed = state.research.completedIds.has(definition.id);
    return {
      ...definition,
      completed,
      active: Boolean(jobs[definition.id]),
      available: !completed && !jobs[definition.id] && reasonCodes.length === 0,
      reasonCodes,
      reasonLabels: reasonCodes.map(prerequisiteLabel),
    };
  });
}

function validDataCenter(state, index) {
  return Number.isInteger(index) && state.grid[index]?.type === 'data';
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
  const bankedHours = Math.max(0, Number(state.research.quizAccelerationBankHours) || 0);
  state.research.quizAccelerationBankHours = 0;
  jobs[researchId] = {
    id: researchId,
    dataCenterIndex,
    elapsedEffectiveHours: Math.min(definition.durationHours, bankedHours),
    status: 'running',
    paidCost: definition.cost,
  };
  return { ok: true, researchId, dataCenterIndex, cost: definition.cost, bankedHoursApplied: bankedHours };
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
    if (validDataCenter(state, job.dataCenterIndex)) {
      demand[job.dataCenterIndex] = RESEARCH_RULES.EXTRA_DEMAND;
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

export function accelerateResearchFromQuiz(state, hours = RESEARCH_RULES.QUIZ_ACCELERATION_HOURS) {
  const accelerationHours = Math.max(0, Number(hours) || 0);
  const active = [...activeResearchJobs(state)];
  if (!active.length) {
    state.research.quizAccelerationBankHours = Math.max(
      0,
      (Number(state.research.quizAccelerationBankHours) || 0) + accelerationHours,
    );
    return {
      appliedJobs: [],
      bankedHours: state.research.quizAccelerationBankHours,
      completed: [],
    };
  }

  const completed = [];
  active.forEach((job) => {
    const definition = RESEARCH[job.id];
    if (!definition) return;
    job.elapsedEffectiveHours = Math.min(
      definition.durationHours,
      job.elapsedEffectiveHours + accelerationHours,
    );
    if (job.elapsedEffectiveHours >= definition.durationHours) {
      const completion = completeResearchJob(state, job.id);
      if (completion) completed.push(completion);
    }
  });
  return {
    appliedJobs: active.map(({ id }) => id),
    bankedHours: 0,
    completed,
  };
}

export function advanceResearchOneHour(state, facilityPower) {
  const results = {};
  const completed = [];

  for (const active of [...activeResearchJobs(state)]) {
    const definition = RESEARCH[active.id];
    if (!definition) continue;
    if (!validDataCenter(state, active.dataCenterIndex)) {
      active.dataCenterIndex = null;
      active.status = 'unassigned';
      results[active.id] = { status: 'unassigned', advancedHours: 0, completed: false };
      continue;
    }
    const ratio = facilityPower?.[active.dataCenterIndex]?.ratio ?? 0;
    if (ratio < RESEARCH_RULES.POWER_THRESHOLD) {
      active.status = 'underpowered';
      results[active.id] = { status: 'underpowered', advancedHours: 0, completed: false, ratio };
      continue;
    }
    const dataCenterLevel = state.grid[active.dataCenterIndex]?.level || 1;
    const advancedHours = RESEARCH_RULES.DATA_CENTER_SPEED[dataCenterLevel] || 1;
    active.elapsedEffectiveHours = Math.min(definition.durationHours, active.elapsedEffectiveHours + advancedHours);
    active.status = 'running';
    if (active.elapsedEffectiveHours < definition.durationHours) {
      results[active.id] = {
        status: 'running',
        advancedHours,
        completed: false,
        ratio,
        elapsedEffectiveHours: active.elapsedEffectiveHours,
      };
      continue;
    }
    const completion = completeResearchJob(state, active.id);
    const result = {
      status: 'completed',
      advancedHours,
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
