import { OBJECTIVE_SETS, objectiveSetById } from '../core/ObjectiveDefinitions.js';
import { roundCredits } from '../core/Money.js';
import { eventBus, Events } from '../core/EventBus.js';
import { activateExpansionSide } from './ZoneSystem.js';
import { isOperationalCell } from './ConstructionProjectSystem.js';

const SPECIALIZATION_RESEARCH = Object.freeze({
  solar2: 'solar',
  wind2: 'wind',
  battery2: 'battery',
  tidal1: 'tidal',
});
const ADVANCED_RESEARCH = new Set([
  'renewable3', 'solar3', 'wind3', 'battery3', 'smartGrid', 'demandResponse',
]);
const FUNCTIONAL_LEVEL_THREE = new Set(['factory', 'data', 'nuclear', 'solar', 'wind', 'battery', 'tidal']);

export function isObjectiveCampaignActive(state) {
  return Boolean(objectiveSetById(state.progression?.objectiveSetId));
}

export function startObjectiveCampaign(state) {
  if (state.campaignComplete || state.progression?.completedObjectiveSetIds?.includes('resilience')) {
    return { ok: false, reason: 'campaign_complete' };
  }
  state.progression ||= {};
  state.progression.chapter = 2;
  state.progression.objectiveSetId = 'transition-choice';
  state.progression.objectiveProgress = {};
  state.questStatus = 'claimed';
  const result = { ok: true, setId: 'transition-choice', set: OBJECTIVE_SETS['transition-choice'] };
  eventBus.emit(Events.OBJECTIVE_STARTED, result);
  return result;
}

function essentialSupplyRatio(state, summary) {
  if (Number.isFinite(summary.essentialSupplyPercent)) return summary.essentialSupplyPercent / 100;
  const essential = state.grid
    .map((cell, index) => (isOperationalCell(cell) && (cell.priority === 'essential' || ['residential', 'cooling'].includes(cell.type)) ? index : null))
    .filter((index) => index != null);
  if (!essential.length) return 0;
  return essential.reduce((sum, index) => sum + (summary.facilityPower?.[index]?.ratio ?? 0), 0) / essential.length;
}

function specializationTechnologyComplete(state) {
  return Object.entries(SPECIALIZATION_RESEARCH).some(([researchId, type]) => (
    state.research.completedIds.has(researchId)
    && state.grid.some((cell) => isOperationalCell(cell) && cell.type === type && cell.level >= 2)
  ));
}

function hasAdvancedTechnology(state) {
  return [...state.research.completedIds].some((id) => ADVANCED_RESEARCH.has(id))
    || state.grid.some((cell) => isOperationalCell(cell) && cell.level >= 3 && FUNCTIONAL_LEVEL_THREE.has(cell.type));
}

function objectiveCondition(id, state, summary) {
  const essential = essentialSupplyRatio(state, summary);
  switch (id) {
    case 'transition-low-carbon': return (summary.lowCarbonPercent || 0) >= 40;
    case 'transition-economy': return (summary.netCredits || 0) >= 4;
    case 'transition-carbon': return (summary.dailyCarbon ?? Infinity) <= 10;
    case 'specialization-technology': return specializationTechnologyComplete(state);
    case 'specialization-grid': {
      const batteryReady = (summary.batteryStored || 0) >= 8 && state.grid.some((cell, index) => (
        isOperationalCell(cell) && cell.type === 'battery' && (summary.facilityPower?.[index]?.ratio ?? 0) >= 0.9
      ));
      return batteryReady || (summary.transmissionEfficiency ?? 0) >= 90;
    }
    case 'specialization-citizen': return essential >= 0.9 && (summary.employmentRate || 0) >= 0.8;
    case 'resilience-profit': return (summary.netCredits || 0) > 0;
    case 'resilience-event-reserve': return Boolean(state.events?.activeId)
      && essential >= 0.9
      && (summary.batteryStored || 0) >= 5;
    case 'resilience-environment': return (summary.lowCarbonPercent || 0) >= 70
      && (summary.dailyWater ?? Infinity) <= (summary.waterLimit ?? 10);
    case 'resilience-technology': return hasAdvancedTechnology(state);
    default: return false;
  }
}

function cardEvaluation(state, definition, summary) {
  const previous = state.progression.objectiveProgress[definition.id] || {};
  const condition = objectiveCondition(definition.id, state, summary);
  const consecutiveDays = previous.completed
    ? Math.max(previous.consecutiveDays || 0, definition.durationDays || 0)
    : definition.durationDays
      ? condition ? (previous.consecutiveDays || 0) + 1 : 0
      : condition ? 1 : 0;
  const completed = Boolean(previous.completed || (definition.durationDays
    ? consecutiveDays >= definition.durationDays
    : condition));
  const progress = {
    consecutiveDays,
    completed,
    value: definition.durationDays ? Math.min(consecutiveDays, definition.durationDays) : completed ? 1 : 0,
    target: definition.durationDays || 1,
  };
  state.progression.objectiveProgress[definition.id] = progress;
  return { ...definition, ...progress };
}

export function currentObjectiveEvaluation(state) {
  const set = objectiveSetById(state.progression?.objectiveSetId);
  if (!set) return null;
  const cards = set.cards.map((definition) => ({
    ...definition,
    ...(state.progression.objectiveProgress?.[definition.id] || {
      consecutiveDays: 0, completed: false, value: 0, target: definition.durationDays || 1,
    }),
  }));
  const completedCount = cards.filter(({ completed }) => completed).length;
  return { setId: set.id, set, cards, completedCount, required: set.required, ready: completedCount >= set.required };
}

export function evaluateObjectiveSet(state, summary) {
  const set = objectiveSetById(state.progression?.objectiveSetId);
  if (!set) return { setId: null, cards: [], completedCount: 0, required: 0, ready: false };
  state.progression.objectiveProgress ||= {};
  const wasReady = currentObjectiveEvaluation(state)?.ready || false;
  const cards = set.cards.map((definition) => cardEvaluation(state, definition, summary));
  const completedCount = cards.filter(({ completed }) => completed).length;
  const ready = completedCount >= set.required;
  const result = { setId: set.id, set, cards, completedCount, required: set.required, ready };
  eventBus.emit(Events.OBJECTIVE_PROGRESSED, result);
  if (ready && !wasReady) eventBus.emit(Events.OBJECTIVE_READY, result);
  return result;
}

export function claimObjectiveSet(state) {
  const evaluation = currentObjectiveEvaluation(state);
  if (!evaluation?.ready) return { ok: false, reason: 'not_ready' };
  const set = evaluation.set;
  if (state.progression.completedObjectiveSetIds.includes(set.id)) {
    return { ok: false, reason: 'already_claimed' };
  }
  state.progression.completedObjectiveSetIds.push(set.id);
  state.credits = roundCredits(state.credits + set.reward.credits);
  (set.reward.unlockFacilities || []).forEach((facility) => state.unlockedFacilities.add(facility));
  if (set.reward.upgradePermitLevel) {
    state.upgradePermitLevel = Math.max(state.upgradePermitLevel, set.reward.upgradePermitLevel);
  }
  let expansion = null;
  if (set.reward.openSecondExpansion && state.expansion?.phase === 1) {
    expansion = activateExpansionSide(state, state.expansion.firstChoice === 'east' ? 'west' : 'east');
  }
  if (set.reward.stressTest) {
    state.stressTest.status = 'ready';
    state.progression.chapter = 4;
  }
  state.progression.objectiveSetId = set.nextSetId;
  state.progression.objectiveProgress = {};
  if (set.nextSetId) state.progression.chapter = OBJECTIVE_SETS[set.nextSetId].chapter;
  const result = {
    ok: true,
    setId: set.id,
    reward: { credits: set.reward.credits },
    nextSetId: set.nextSetId,
    chapterChanged: state.progression.chapter !== set.chapter,
    expansion,
  };
  eventBus.emit(Events.OBJECTIVE_CLAIMED, result);
  return result;
}
