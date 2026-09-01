import { QUESTS } from '../core/QuestDefinitions.js';
import { QUEST_REQUIREMENTS, STAGES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { createHexCoordinates, neighborIndices } from './HexGridSystem.js';
import { roundCredits } from '../core/Money.js';
import { isOperationalCell } from './ConstructionProjectSystem.js';
import {
  claimClimateQuest,
  currentClimateQuestEvaluation,
  isClimateQuestActive,
} from './ClimateQuestSystem.js';

const facilities = (state, type) => state.grid.filter((cell) => isOperationalCell(cell) && cell.type === type);

function hasAdjacent(state, index, types) {
  const coords = createHexCoordinates(state.boardRadius);
  return neighborIndices(index, coords).some((neighbor) => (
    isOperationalCell(state.grid[neighbor]) && types.has(state.grid[neighbor].type)
  ));
}

export function evaluateCurrentQuest(state) {
  if (isClimateQuestActive(state)) return currentClimateQuestEvaluation(state);
  const wasReady = state.questStatus === 'ready_to_claim';
  let ready = state.questStatus === 'ready_to_claim';
  if (state.questIndex === 1) ready = facilities(state, 'residential').length >= 2;
  if (state.questIndex === 3) ready = facilities(state, 'green').length >= 1;
  if (ready) {
    state.questStatus = 'ready_to_claim';
    if (!wasReady) eventBus.emit(Events.QUEST_READY, { quest: QUESTS[state.questIndex - 1] });
  }
  return { ready, quest: QUESTS[state.questIndex - 1], progress: state.questProgress };
}

function stageForQuest(questIndex) {
  if (questIndex <= 5) return STAGES.EXECUTION;
  if (questIndex <= 14) return STAGES.REDESIGN;
  return STAGES.REPORT;
}

export function claimCurrentQuest(state) {
  if (isClimateQuestActive(state)) return claimClimateQuest(state);
  const quest = QUESTS[state.questIndex - 1];
  if (!quest) return { ok: false, reason: 'not_ready' };
  if (state.claimedQuestIds.has(quest.id)) return { ok: false, reason: 'already_claimed' };
  if (state.questStatus !== 'ready_to_claim') return { ok: false, reason: 'not_ready' };
  state.claimedQuestIds.add(quest.id);
  state.progression.tutorialQuestIndex = Math.min(6, quest.index);
  state.progression.tutorialQuestStatus = 'complete';
  state.credits = roundCredits(state.credits + quest.reward.credits);
  quest.reward.unlockFacilities.forEach((facility) => state.unlockedFacilities.add(facility));
  if (state.questIndex === 4) {
    state.firstCitySnapshot = state.grid.map((cell) => (cell ? { ...cell } : null));
    state.baseline = { ...(state.metrics || {}), ...(state.lastTickSummary || {}) };
  }
  if (state.questIndex === 4) state.researchMenuUnlocked = true;
  if (state.questIndex === 15) {
    state.campaignComplete = true;
    state.questStatus = 'claimed';
    const result = { ok: true, credits: quest.reward.credits, unlockedFacility: null, unlockedFacilities: [], nextQuest: null, campaignComplete: true };
    eventBus.emit(Events.QUEST_CLAIMED, { quest, result });
    return result;
  }
  state.questIndex += 1;
  state.questStatus = 'active';
  state.questProgress = {};
  state.stage = stageForQuest(state.questIndex);
  if (state.questIndex === 12) state.climateAlert = 'extreme_heat';
  if (quest.index === 12) state.climateAlert = 'normal';
  const result = {
    ok: true,
    credits: quest.reward.credits,
    unlockedFacility: quest.reward.unlockFacility,
    unlockedFacilities: [...quest.reward.unlockFacilities],
    nextQuest: state.questIndex,
    expandGrid: quest.index === 6,
  };
  if (quest.index === 6) {
    state.progression.chapter = 3;
    state.progression.objectiveSetId = null;
    state.progression.objectiveProgress = {};
    state.climateCampaign = {
      ...state.climateCampaign,
      status: 'briefing',
      eventType: null,
      scheduledEventId: null,
      progress: {},
      lastResult: null,
    };
  } else if (quest.index < 6) {
    state.progression.tutorialQuestIndex = state.questIndex;
    state.progression.tutorialQuestStatus = 'active';
  }
  eventBus.emit(Events.QUEST_CLAIMED, { quest, result });
  return result;
}

const allRatios = (state, type, summary) => state.grid
  .map((cell, index) => (isOperationalCell(cell) && cell.type === type ? summary.facilityPower?.[index]?.ratio ?? 0 : null))
  .filter((ratio) => ratio != null);

export function applySimulationQuestProgress(state, summary) {
  if (isClimateQuestActive(state)) return currentClimateQuestEvaluation(state);
  let condition = false;
  let required = 3;
  switch (state.questIndex) {
    case 2:
      condition = Object.entries(summary.facilityEconomy || {}).some(([index, item]) => state.grid[index]?.type === 'factory'
        && isOperationalCell(state.grid[index])
        && hasAdjacent(state, Number(index), new Set(['thermal']))
        && (summary.facilityPower?.[index]?.ratio ?? 0) >= 0.5
        && item.operationRatio >= 0.5
        && item.income > 0);
      break;
    case 3:
      return evaluateCurrentQuest(state);
    case 4:
      condition = Object.entries(summary.facilityPower || {}).some(([index, item]) => isOperationalCell(state.grid[index]) && state.grid[index].type === 'data' && item.ratio >= 0.9);
      break;
    case 5:
      condition = facilities(state, 'nuclear').length > 0
        && summary.lowCarbonPercent >= QUEST_REQUIREMENTS.TRANSITION_LOW_CARBON_PERCENT
        && summary.dailyCarbon <= QUEST_REQUIREMENTS.TRANSITION_CARBON_MAX
        && summary.netCredits > 0;
      break;
    case 6: {
      const baselineWater = Number.isFinite(state.baseline?.dailyWater)
        ? state.baseline.dailyWater
        : summary.dailyWater;
      condition = state.grid.some((cell, dataIndex) => isOperationalCell(cell) && cell.type === 'data'
        && (summary.facilityPower?.[dataIndex]?.ratio ?? 0) >= QUEST_REQUIREMENTS.WATER_CYCLE_POWER_RATIO
        && neighborIndices(dataIndex, createHexCoordinates(state.boardRadius)).some((coolingIndex) => (
          isOperationalCell(state.grid[coolingIndex])
          && state.grid[coolingIndex].type === 'cooling'
          && (summary.facilityPower?.[coolingIndex]?.ratio ?? 0) >= QUEST_REQUIREMENTS.WATER_CYCLE_POWER_RATIO
        )))
        && summary.dailyWater <= baselineWater;
      break;
    }
    case 7:
      condition = summary.lowCarbonPercent >= QUEST_REQUIREMENTS.FIRST_SOLAR_LOW_CARBON_PERCENT
        && (summary.routes || []).some((route) => (
          state.grid[route.from]?.type === 'solar' && route.delivered > 0
        ));
      break;
    case 9: {
      const delivered = (summary.routes || [])
        .filter((route) => route.kind === 'battery' && (route.lowCarbonDelivered > 0 || ['solar', 'wind'].includes(state.grid[route.from]?.type)))
        .reduce((sum, route) => sum + (route.lowCarbonDelivered ?? route.delivered), 0);
      condition = delivered > 0;
      state.questProgress.hubEnergy = condition
        ? Math.round(((state.questProgress.hubEnergy || 0) + delivered) * 100) / 100
        : 0;
      break;
    }
    case 11:
      condition = summary.netCredits > 0 && state.grid.some((cell, index) => isOperationalCell(cell) && cell.type === 'residential' && hasAdjacent(state, index, new Set(['green'])));
      break;
    case 12: {
      const ratios = state.grid
        .map((cell, index) => (isOperationalCell(cell) && (cell.priority === 'essential' || ['residential', 'cooling'].includes(cell.type))
          ? summary.facilityPower?.[index]?.ratio ?? 0
          : null))
        .filter((ratio) => ratio != null);
      condition = state.climateAlert === 'extreme_heat' && ratios.length > 0 && ratios.every((ratio) => ratio >= 0.9);
      break;
    }
    case 13:
      condition = summary.hour >= 19 && summary.hour <= 23 && summary.deliveredPower >= summary.demand && summary.batteryStored >= 5;
      break;
    case 14:
      condition = (state.research.completedIds.has('renewable3') || state.grid.some((cell) => isOperationalCell(cell) && cell.level >= 3))
        && summary.lowCarbonPercent >= 70
        && summary.dailyWater < (state.baseline?.dailyWater ?? Infinity)
        && summary.netCredits > 0;
      break;
    default:
      return evaluateCurrentQuest(state);
  }
  state.questProgress.consecutiveDays = condition ? (state.questProgress.consecutiveDays || 0) + 1 : 0;
  if ([2, 4, 5, 6, 7].includes(state.questIndex)) required = QUEST_REQUIREMENTS.OPERATING_DAYS;
  if (state.questIndex === 14) required = 4;
  const ready = state.questIndex === 9
    ? state.questProgress.consecutiveDays >= 3 && state.questProgress.hubEnergy >= 8
    : state.questProgress.consecutiveDays >= required;
  if (ready && state.questStatus !== 'ready_to_claim') {
    state.questStatus = 'ready_to_claim';
    eventBus.emit(Events.QUEST_READY, { quest: QUESTS[state.questIndex - 1] });
  }
  return evaluateCurrentQuest(state);
}

export function markQuestQuizResult(state, passed) {
  if (passed && state.questIndex === 15) state.questStatus = 'ready_to_claim';
  return evaluateCurrentQuest(state);
}

export function requestEmergencySupport(state) {
  if (state.emergencySupport?.used) return { ok: false, reason: 'already_used' };
  if (state.credits > 1) return { ok: false, reason: 'not_eligible' };
  state.emergencySupport = { used: true, economyScorePenalty: 2 };
  state.decisionCounts.emergencySupport = (state.decisionCounts.emergencySupport || 0) + 1;
  state.credits = roundCredits(state.credits + 4);
  return { ok: true, credits: state.credits };
}
