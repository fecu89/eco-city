import { QUESTS } from '../core/QuestDefinitions.js';
import { STAGES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

const facilities = (state, type) => state.grid.filter((cell) => cell?.type === type);
const POWER_PLANTS = new Set(['thermal', 'nuclear', 'solar', 'wind']);

function orthogonalNeighbors(index, size) {
  const row = Math.floor(index / size);
  const column = index % size;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dr, dc]) => [row + dr, column + dc])
    .filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size)
    .map(([r, c]) => r * size + c);
}

function hasAdjacent(state, index, types) {
  return orthogonalNeighbors(index, state.gridSize).some((neighbor) => types.has(state.grid[neighbor]?.type));
}

export function evaluateCurrentQuest(state) {
  const wasReady = state.questStatus === 'ready_to_claim';
  let ready = state.questStatus === 'ready_to_claim';
  if (state.questIndex === 1) ready = facilities(state, 'residential').length >= 2;
  if (state.questIndex === 6) ready = state.diagnosisFound.size >= 3;
  if (ready) {
    state.questStatus = 'ready_to_claim';
    if (!wasReady) eventBus.emit(Events.QUEST_READY, { quest: QUESTS[state.questIndex - 1] });
  }
  return { ready, quest: QUESTS[state.questIndex - 1], progress: state.questProgress };
}

function stageForQuest(questIndex) {
  if (questIndex <= 4) return STAGES.EXECUTION;
  if (questIndex === 5) return STAGES.CONCEPTS;
  if (questIndex === 6) return STAGES.DIAGNOSIS;
  if (questIndex <= 14) return STAGES.REDESIGN;
  return STAGES.REPORT;
}

export function claimCurrentQuest(state) {
  const quest = QUESTS[state.questIndex - 1];
  if (!quest) return { ok: false, reason: 'not_ready' };
  if (state.claimedQuestIds.has(quest.id)) return { ok: false, reason: 'already_claimed' };
  if (state.questStatus !== 'ready_to_claim') return { ok: false, reason: 'not_ready' };
  state.claimedQuestIds.add(quest.id);
  state.credits = Math.round((state.credits + quest.reward.credits) * 10) / 10;
  if (quest.reward.unlockFacility) state.unlockedFacilities.add(quest.reward.unlockFacility);
  if (state.questIndex === 4) {
    state.firstCitySnapshot = state.grid.map((cell) => (cell ? { ...cell } : null));
    state.baseline = { ...(state.metrics || {}), ...(state.lastTickSummary || {}) };
  }
  if (state.questIndex === 10) state.upgradePermitLevel = 2;
  if (state.questIndex === 13) state.upgradePermitLevel = 3;
  if (state.questIndex === 15) {
    state.campaignComplete = true;
    state.questStatus = 'claimed';
    const result = { ok: true, credits: quest.reward.credits, unlockedFacility: null, nextQuest: null, campaignComplete: true };
    eventBus.emit(Events.QUEST_CLAIMED, { quest, result });
    return result;
  }
  state.questIndex += 1;
  state.questStatus = 'active';
  state.questProgress = {};
  state.stage = stageForQuest(state.questIndex);
  if (state.questIndex === 11) state.climateAlert = 'extreme_heat';
  if (quest.index === 11) state.climateAlert = 'normal';
  const result = {
    ok: true,
    credits: quest.reward.credits,
    unlockedFacility: quest.reward.unlockFacility,
    nextQuest: state.questIndex,
    expandGrid: quest.index === 6,
  };
  eventBus.emit(Events.QUEST_CLAIMED, { quest, result });
  return result;
}

const allRatios = (state, type, summary) => state.grid
  .map((cell, index) => (cell?.type === type ? summary.facilityPower?.[index]?.ratio ?? 0 : null))
  .filter((ratio) => ratio != null);

export function applySimulationQuestProgress(state, summary) {
  let condition = false;
  let required = 3;
  switch (state.questIndex) {
    case 2: {
      const ratios = allRatios(state, 'residential', summary);
      condition = facilities(state, 'thermal').length > 0 && ratios.length > 0 && ratios.every((ratio) => ratio >= 0.9);
      break;
    }
    case 3:
      condition = Object.entries(summary.facilityEconomy || {}).some(([index, item]) => state.grid[index]?.type === 'factory'
        && hasAdjacent(state, Number(index), POWER_PLANTS)
        && (summary.facilityPower?.[index]?.ratio ?? 0) >= 0.5
        && item.operationRatio >= 0.5
        && item.income > 0);
      break;
    case 4:
      condition = state.grid.filter(Boolean).length >= 5 && Object.entries(summary.facilityPower || {}).some(([index, item]) => state.grid[index]?.type === 'data' && item.ratio >= 0.5);
      break;
    case 7:
      condition = Object.entries(summary.facilityPower || {}).some(([index, item]) => state.grid[index]?.type === 'cooling'
        && hasAdjacent(state, Number(index), new Set(['data', 'nuclear']))
        && item.ratio >= 0.9);
      break;
    case 9: {
      const delivered = (summary.routes || [])
        .filter((route) => route.kind === 'battery' && (route.lowCarbonDelivered > 0 || ['solar', 'wind'].includes(state.grid[route.from]?.type)))
        .reduce((sum, route) => sum + (route.lowCarbonDelivered ?? route.delivered), 0);
      state.questProgress.hubEnergy = Math.round(((state.questProgress.hubEnergy || 0) + delivered) * 100) / 100;
      condition = delivered > 0;
      break;
    }
    case 10:
      condition = summary.netCredits > 0 && state.grid.some((cell, index) => cell?.type === 'residential' && hasAdjacent(state, index, new Set(['green'])));
      break;
    case 11: {
      const ratios = allRatios(state, 'residential', summary);
      condition = state.climateAlert === 'extreme_heat' && ratios.length > 0 && ratios.every((ratio) => ratio >= 0.9);
      break;
    }
    case 12:
      condition = (summary.hour ?? state.simulationHour) >= 19 && (summary.hour ?? state.simulationHour) <= 23 && summary.deliveredPower >= summary.demand && summary.batteryStored >= 5;
      break;
    case 13:
      condition = summary.lowCarbonPercent >= 70 && summary.hourlyCarbon < (state.baseline?.hourlyCarbon ?? Infinity);
      break;
    case 14:
      condition = summary.hourlyWater < (state.baseline?.hourlyWater ?? Infinity) && summary.netCredits > 0;
      break;
    default:
      return evaluateCurrentQuest(state);
  }
  state.questProgress.consecutiveHours = condition ? (state.questProgress.consecutiveHours || 0) + 1 : 0;
  if ([2, 3, 4, 7, 10].includes(state.questIndex)) required = 2;
  const ready = state.questProgress.consecutiveHours >= required
    && (state.questIndex !== 9 || state.questProgress.hubEnergy >= 8);
  if (ready && state.questStatus !== 'ready_to_claim') {
    state.questStatus = 'ready_to_claim';
    eventBus.emit(Events.QUEST_READY, { quest: QUESTS[state.questIndex - 1] });
  }
  return evaluateCurrentQuest(state);
}

export function markQuestQuizResult(state, passed) {
  if (passed && [5, 8, 15].includes(state.questIndex)) state.questStatus = 'ready_to_claim';
  return evaluateCurrentQuest(state);
}

export function requestEmergencySupport(state) {
  const key = String(state.questIndex);
  if (state.emergencySupportUsedQuestIds.has(key)) return { ok: false, reason: 'already_used' };
  if (state.credits > 1) return { ok: false, reason: 'not_eligible' };
  state.emergencySupportUsedQuestIds.add(key);
  state.credits = Math.round((state.credits + 4) * 10) / 10;
  return { ok: true, credits: state.credits };
}
