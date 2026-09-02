import { QUESTS, questForState } from '../core/QuestDefinitions.js';
import { QUEST_REQUIREMENTS, STAGES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { createHexCoordinates, neighborIndices } from './HexGridSystem.js';
import { roundCredits } from '../core/Money.js';
import { isOperationalCell } from './ConstructionProjectSystem.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';
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

// 현재 도시 상태만으로 판정하는 퀘스트들. 조건이 다시 깨지면 준비 상태도 해제된다.
// 연속 일수 퀘스트는 applySimulationQuestProgress가 따로 관리한다.
const STATE_QUEST_PREDICATES = Object.freeze({
  1: (state) => facilities(state, 'residential').length >= 2,
  3: (state) => facilities(state, 'green').length >= 1,
  [CAMPAIGN_QUEST_INDEXES.PREPARATION_START]: (state) => state.research.completedIds.has(
    state.expansion?.firstChoice === 'west' ? 'wind2' : 'solar2',
  ),
  [CAMPAIGN_QUEST_INDEXES.SECOND_EXPANSION_QUEST]: (state) => state.research.completedIds.has('smartGrid')
    && state.grid.some((cell) => isOperationalCell(cell) && cell.type === 'data' && cell.level >= 2),
});

export function evaluateCurrentQuest(state) {
  if (isClimateQuestActive(state)) return currentClimateQuestEvaluation(state);
  const wasReady = state.questStatus === 'ready_to_claim';
  const predicate = STATE_QUEST_PREDICATES[state.questIndex];
  const ready = predicate ? predicate(state) : wasReady;
  if (ready) {
    state.questStatus = 'ready_to_claim';
    if (!wasReady) eventBus.emit(Events.QUEST_READY, { quest: questForState(state) });
  } else if (wasReady) {
    state.questStatus = 'active';
  }
  return { ready, quest: questForState(state), progress: state.questProgress };
}

// 최종시험(19단계)도 재설계 단계다. 시험 중에도 건설·강화·철거로 도시를 고칠 수 있어야 한다.
// STAGES.REPORT는 캠페인이 끝난 뒤에만 설정한다.
export function stageForQuest(questIndex) {
  return questIndex <= CAMPAIGN_QUEST_INDEXES.EXECUTION_STAGE_LAST_QUEST
    ? STAGES.EXECUTION
    : STAGES.REDESIGN;
}

export function claimCurrentQuest(state) {
  if (isClimateQuestActive(state)) return claimClimateQuest(state);
  const quest = questForState(state);
  if (!quest) return { ok: false, reason: 'not_ready' };
  if (state.claimedQuestIds.has(quest.id)) return { ok: false, reason: 'already_claimed' };
  if (state.questStatus !== 'ready_to_claim') return { ok: false, reason: 'not_ready' };
  state.claimedQuestIds.add(quest.id);
  state.progression.tutorialQuestIndex = Math.min(CAMPAIGN_QUEST_INDEXES.FOUNDATION_END, quest.index);
  state.progression.tutorialQuestStatus = 'complete';
  state.credits = roundCredits(state.credits + quest.reward.credits);
  quest.reward.unlockFacilities.forEach((facility) => state.unlockedFacilities.add(facility));
  if (quest.reward.upgradePermitLevel) {
    state.upgradePermitLevel = Math.max(state.upgradePermitLevel, quest.reward.upgradePermitLevel);
  }
  if (state.questIndex === CAMPAIGN_QUEST_INDEXES.BASELINE_CAPTURE_QUEST) {
    state.firstCitySnapshot = state.grid.map((cell) => (cell ? { ...cell } : null));
    state.baseline = { ...(state.metrics || {}), ...(state.lastTickSummary || {}) };
    state.researchMenuUnlocked = true;
  }
  if (state.questIndex === CAMPAIGN_QUEST_INDEXES.FINAL_TEST) {
    state.campaignComplete = true;
    state.questStatus = 'claimed';
    state.stage = STAGES.REPORT;
    const result = { ok: true, credits: quest.reward.credits, unlockedFacility: null, unlockedFacilities: [], nextQuest: null, campaignComplete: true };
    eventBus.emit(Events.QUEST_CLAIMED, { quest, result });
    return result;
  }
  state.questIndex += 1;
  state.questStatus = 'active';
  state.questProgress = {};
  state.stage = stageForQuest(state.questIndex);
  const result = {
    ok: true,
    credits: quest.reward.credits,
    unlockedFacility: quest.reward.unlockFacility,
    unlockedFacilities: [...quest.reward.unlockFacilities],
    unlockedResearch: [...(quest.reward.unlockResearch || [])],
    upgradePermitLevel: quest.reward.upgradePermitLevel || null,
    upgradePermitFacilities: [...(quest.reward.upgradePermitFacilities || [])],
    nextQuest: state.questIndex,
    expandGrid: quest.index === CAMPAIGN_QUEST_INDEXES.FOUNDATION_END,
    expandSecondGrid: quest.index === CAMPAIGN_QUEST_INDEXES.SECOND_EXPANSION_QUEST
      && state.expansion?.phase === 1,
    secondExpansionSide: quest.index === CAMPAIGN_QUEST_INDEXES.SECOND_EXPANSION_QUEST
      && state.expansion?.phase === 1
      ? state.expansion.firstChoice === 'east' ? 'west' : 'east'
      : null,
  };
  if (quest.index === CAMPAIGN_QUEST_INDEXES.FOUNDATION_END) {
    state.progression.chapter = 2;
    state.progression.objectiveSetId = null;
    state.progression.objectiveProgress = {};
    state.climateCampaign = {
      ...state.climateCampaign,
      status: 'locked',
      eventType: null,
      scheduledEventId: null,
      progress: {},
      lastResult: null,
    };
  } else if (quest.index === CAMPAIGN_QUEST_INDEXES.PREPARATION_END) {
    state.progression.chapter = 3;
    state.climateCampaign = {
      ...state.climateCampaign,
      status: 'briefing',
      eventType: null,
      scheduledEventId: null,
      progress: {},
      lastResult: null,
    };
  } else if (quest.index < CAMPAIGN_QUEST_INDEXES.FOUNDATION_END) {
    state.progression.tutorialQuestIndex = state.questIndex;
    state.progression.tutorialQuestStatus = 'active';
  }
  eventBus.emit(Events.QUEST_CLAIMED, { quest, result });
  return result;
}

export function applySimulationQuestProgress(state, summary) {
  if (isClimateQuestActive(state)) return currentClimateQuestEvaluation(state);
  let condition = false;
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
      // Q4의 기준 수치는 핵발전이 해금되기 전에 저장된다. Q5에서 필수로 추가한
      // 핵발전의 물 사용까지 그대로 비교하면, 냉각이 핵발전과도 맞닿는 두 방향만
      // 우연히 통과한다. Q6은 데이터센터 물순환을 검증하므로 새 핵발전 몫을 제외한
      // 동일 기준 도시끼리 비교한다.
      const nuclearWater = Object.entries(summary.facilityEnvironment || {})
        .reduce((total, [index, environment]) => (
          isOperationalCell(state.grid[Number(index)]) && state.grid[Number(index)].type === 'nuclear'
            ? total + (Number(environment?.water) || 0)
            : total
        ), 0);
      const comparableDailyWater = summary.dailyWater - nuclearWater;
      condition = state.grid.some((cell, dataIndex) => isOperationalCell(cell) && cell.type === 'data'
        && (summary.facilityPower?.[dataIndex]?.ratio ?? 0) >= QUEST_REQUIREMENTS.WATER_CYCLE_POWER_RATIO
        && neighborIndices(dataIndex, createHexCoordinates(state.boardRadius)).some((coolingIndex) => (
          isOperationalCell(state.grid[coolingIndex])
          && state.grid[coolingIndex].type === 'cooling'
          && (summary.facilityPower?.[coolingIndex]?.ratio ?? 0) >= QUEST_REQUIREMENTS.WATER_CYCLE_POWER_RATIO
        )))
        && comparableDailyWater <= baselineWater;
      break;
    }
    case 7:
    case 8:
      return evaluateCurrentQuest(state);
    case 9:
      {
        const type = state.expansion?.firstChoice === 'west' ? 'solar' : 'wind';
        condition = state.research.completedIds.has(`${type}2`)
        && (summary.routes || []).some((route) => (
          isOperationalCell(state.grid[route.from])
          && state.grid[route.from].type === type
          && Number(route.delivered) >= 0.1
        ));
      }
      break;
    case 10:
      condition = state.research.completedIds.has('tidal1')
        && facilities(state, 'tidal').length > 0
        && (summary.routes || []).some((route) => (
          isOperationalCell(state.grid[route.from])
          && state.grid[route.from].type === 'tidal'
          && Number(route.delivered) >= 0.1
        ));
      break;
    default:
      return evaluateCurrentQuest(state);
  }
  // 여기까지 오는 퀘스트는 모두 연속 운영일 조건이다. 나머지는 위에서 조기 반환한다.
  state.questProgress.consecutiveDays = condition ? (state.questProgress.consecutiveDays || 0) + 1 : 0;
  const ready = state.questProgress.consecutiveDays >= QUEST_REQUIREMENTS.OPERATING_DAYS;
  if (ready && state.questStatus !== 'ready_to_claim') {
    state.questStatus = 'ready_to_claim';
    eventBus.emit(Events.QUEST_READY, { quest: questForState(state) });
  }
  return evaluateCurrentQuest(state);
}

export function markQuestQuizResult(state, passed) {
  if (passed && state.questIndex === CAMPAIGN_QUEST_INDEXES.FINAL_TEST) state.questStatus = 'ready_to_claim';
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
