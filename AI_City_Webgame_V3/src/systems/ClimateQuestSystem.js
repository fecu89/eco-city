import { climateQuestByIndex } from '../core/ClimateCampaignDefinitions.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';
import { CITY_EVENTS } from '../core/EventDefinitions.js';
import { eventBus, Events } from '../core/EventBus.js';
import { QUESTS } from '../core/QuestDefinitions.js';
import { CLIMATE_QUEST_RULES, FACILITY_GROUPS, POWER_RULES, STAGES, WATER_RULES } from '../core/Constants.js';
import { roundCredits } from '../core/Money.js';
import { isOperationalCell } from './ConstructionProjectSystem.js';

const CLIMATE_QUEST_MIN = CAMPAIGN_QUEST_INDEXES.CLIMATE_START;
const CLIMATE_QUEST_MAX = CAMPAIGN_QUEST_INDEXES.CLIMATE_END;
// 필수시설 공급률 목표(%)와 "실제 공급" 판정 하한(E). settings.json CLIMATE_QUEST_RULES / POWER_RULES.
const SUPPLY_TARGET = CLIMATE_QUEST_RULES.SUPPLY_TARGET_PERCENT;
const DELIVERY_EPSILON = POWER_RULES.DELIVERY_EPSILON_E;

function campaignState(state) {
  state.climateCampaign ||= {
    status: 'locked',
    eventType: null,
    attempt: 0,
    scheduledEventId: null,
    progress: {},
    lastResult: null,
    completedEventTypes: [],
  };
  state.climateCampaign.progress ||= {};
  state.climateCampaign.completedEventTypes ||= [];
  return state.climateCampaign;
}

function operationalIndices(state, type) {
  return state.grid
    .map((cell, index) => (isOperationalCell(cell) && cell.type === type ? index : null))
    .filter((index) => index != null);
}

function hasTidalPreparation(state, quest) {
  if (!quest?.entry) return true;
  return state.research?.completedIds?.has?.(quest.entry.research) === true
    && operationalIndices(state, quest.entry.facility).length > 0;
}

function resetEventAttempt(state) {
  const activeId = state.climateCampaign?.scheduledEventId;
  if (state.events?.activeId === activeId) state.events.activeId = null;
  state.events ||= {};
  state.events.currentMetrics = null;
  state.events.schedule = [];
  state.events.forecastAcknowledgedIds = [];
}

function initialProgress(state = null) {
  const measuredWater = Number(state?.lastTickSummary?.dailyWater);
  const cityBaselineWater = Number(state?.baseline?.dailyWater);
  return {
    consecutiveDays: 0,
    bestConsecutiveDays: 0,
    qualifiedDays: 0,
    batteryEnergy: 0,
    batteryReserveMinimum: null,
    tidalEnergy: 0,
    generationTypeDays: 0,
    // 이벤트 물 한도는 브리핑을 수락한 순간의 실제 사용량을 기준으로 잡는다.
    waterBaseline: Number.isFinite(measuredWater) && measuredWater > 0
      ? measuredWater
      : Number.isFinite(cityBaselineWater) && cityBaselineWater > 0
        ? cityBaselineWater
        : WATER_RULES.DEFAULT_BASELINE,
  };
}

function batteryDischarged(summary) {
  if (Number.isFinite(summary?.batteryDischarged)) return Math.max(0, Number(summary.batteryDischarged));
  return Object.values(summary?.batteryOperations || {})
    .reduce((sum, operation) => sum + Math.max(0, Number(operation?.discharged) || 0), 0);
}

function deliveredByType(state, summary, type) {
  const direct = Number(summary?.generationDeliveredByType?.[type]);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return (summary?.routes || []).reduce((sum, route) => (
    state.grid?.[route.from]?.type === type
      ? sum + Math.max(0, Number(route.delivered) || 0)
      : sum
  ), 0);
}

function generationTypeCount(state, summary) {
  const direct = summary?.generationDeliveredByType;
  if (direct && typeof direct === 'object') {
    return Object.entries(direct)
      .filter(([type, delivered]) => FACILITY_GROUPS.GENERATION.includes(type)
        && Number(delivered) >= DELIVERY_EPSILON)
      .length;
  }
  const types = new Set((summary?.routes || [])
    .filter((route) => Number(route.delivered) >= DELIVERY_EPSILON)
    .map((route) => state.grid?.[route.from]?.type)
    .filter((type) => FACILITY_GROUPS.GENERATION.includes(type)));
  return types.size;
}

function allFacilityRatiosAtLeast(state, summary, types, minimum, { requireEachType = false } = {}) {
  const ratiosByType = new Map(types.map((type) => [type, []]));
  state.grid.forEach((cell, index) => {
    if (!isOperationalCell(cell) || !types.includes(cell.type)) return;
    const consumerRatio = Number(summary?.facilityPower?.[index]?.ratio);
    const generationRatio = FACILITY_GROUPS.GENERATION.includes(cell.type)
      ? Number((summary?.routes || []).some((route) => (
        route.from === index && Number(route.delivered) >= DELIVERY_EPSILON
      )))
      : 0;
    ratiosByType.get(cell.type).push(Number.isFinite(consumerRatio) ? consumerRatio : generationRatio);
  });
  if (requireEachType && [...ratiosByType.values()].some((ratios) => ratios.length === 0)) return false;
  const ratios = [...ratiosByType.values()].flat();
  return ratios.length > 0 && ratios.every((ratio) => ratio >= minimum);
}

function dayQualifies(state, quest, summary) {
  const essentialReady = Number(summary?.essentialSupplyPercent) >= SUPPLY_TARGET;
  switch (quest.objective) {
    case 'essential':
    case 'battery':
      return essentialReady;
    case 'diversity':
      return essentialReady && generationTypeCount(state, summary) >= quest.generationTypeTarget;
    case 'winter':
      return Number(summary?.netCredits) > 0
        && allFacilityRatiosAtLeast(state, summary, ['residential'], POWER_RULES.OUTAGE_RATIO);
    case 'water': {
      const waterLimit = Number(summary?.waterLimit);
      return Number.isFinite(waterLimit)
        && Number(summary?.dailyWater) <= waterLimit
        && allFacilityRatiosAtLeast(state, summary, ['data', 'nuclear'], POWER_RULES.OUTAGE_RATIO, { requireEachType: true });
    }
    case 'cleanAir':
      return Number(summary?.dailyCarbon) <= quest.carbonTarget && essentialReady;
    case 'wildfire':
      return Number(summary?.dailyCarbon) <= quest.carbonTarget && Number(summary?.netCredits) > 0;
    case 'tidal':
      return essentialReady;
    default:
      return false;
  }
}

function attemptPassed(quest, progress) {
  const bestConsecutiveDays = Math.max(
    Number(progress.bestConsecutiveDays) || 0,
    Number(progress.consecutiveDays) || 0,
  );
  if (bestConsecutiveDays < quest.targetDays) return false;
  if (quest.objective === 'battery') {
    const dischargedEnough = (progress.batteryEnergy || 0) >= quest.batteryTarget;
    const reserveMaintained = quest.batteryReserveTarget != null
      && progress.batteryReserveMinimum != null
      && Number(progress.batteryReserveMinimum) >= quest.batteryReserveTarget;
    return dischargedEnough || reserveMaintained;
  }
  if (quest.objective === 'tidal') return (progress.tidalEnergy || 0) >= quest.tidalEnergyTarget;
  return true;
}

function eventMatches(campaign, event) {
  return Boolean(event && event.id === campaign.scheduledEventId);
}

export function isClimateQuestActive(state) {
  return Number(state?.questIndex) >= CLIMATE_QUEST_MIN
    && Number(state?.questIndex) <= CLIMATE_QUEST_MAX
    && climateQuestByIndex(state.questIndex) != null;
}

export function acknowledgeClimateBriefing(state) {
  if (!isClimateQuestActive(state)) return { ok: false, reason: 'not_climate_quest' };
  const quest = climateQuestByIndex(state.questIndex);
  const campaign = campaignState(state);
  if (!['briefing', 'result', 'locked'].includes(campaign.status)) {
    return { ok: false, reason: 'already_started' };
  }
  if (!hasTidalPreparation(state, quest)) {
    return {
      ok: false,
      reason: 'tidal_preparation_required',
      requiredResearch: quest.entry?.research,
      requiredFacility: quest.entry?.facility,
    };
  }

  resetEventAttempt(state);
  const attempt = Math.max(0, Math.trunc(Number(campaign.attempt) || 0)) + 1;
  const startAt = state.elapsedGameDays + quest.forecastDays;
  const event = {
    id: `climate-q${quest.index}-a${attempt}`,
    source: 'campaign',
    type: quest.eventType,
    announceAt: state.elapsedGameDays,
    startAt,
    endAt: startAt + CITY_EVENTS[quest.eventType].durationDays,
  };
  state.events.schedule = [event];
  Object.assign(campaign, {
    status: 'preparation',
    eventType: quest.eventType,
    attempt,
    scheduledEventId: event.id,
    progress: initialProgress(state),
    lastResult: null,
  });
  state.questStatus = 'active';
  state.questProgress = campaign.progress;
  const result = {
    ok: true,
    questIndex: quest.index,
    eventType: quest.eventType,
    startsInDays: quest.forecastDays,
    startAt,
    endAt: event.endAt,
    event,
  };
  eventBus.emit(Events.CLIMATE_QUEST_BRIEFING_ACKNOWLEDGED, result);
  return result;
}

export function currentClimateQuestEvaluation(state) {
  const quest = climateQuestByIndex(state?.questIndex);
  if (!quest) return { ready: false, quest: null, status: 'inactive', progress: {} };
  const campaign = campaignState(state);
  const progress = campaign.progress || initialProgress();
  const event = state.events?.schedule?.find?.(({ id }) => id === campaign.scheduledEventId) || null;
  return {
    ready: state.questStatus === 'ready_to_claim' && campaign.lastResult?.passed === true,
    quest,
    status: campaign.status,
    attempt: campaign.attempt,
    event,
    startsInDays: event ? Math.max(0, event.startAt - state.elapsedGameDays) : null,
    remainingDays: event ? Math.max(0, event.endAt - state.elapsedGameDays) : null,
    consecutiveDays: progress.consecutiveDays || 0,
    bestConsecutiveDays: Math.max(progress.bestConsecutiveDays || 0, progress.consecutiveDays || 0),
    qualifiedDays: progress.qualifiedDays || 0,
    batteryEnergy: progress.batteryEnergy || 0,
    batteryReserveMinimum: Number.isFinite(Number(progress.batteryReserveMinimum))
      && progress.batteryReserveMinimum != null
      ? Number(progress.batteryReserveMinimum)
      : null,
    tidalEnergy: progress.tidalEnergy || 0,
    progress,
    result: campaign.lastResult,
  };
}

export function advanceClimateQuest(state, summary = null, eventTransition = {}) {
  if (!isClimateQuestActive(state)) return currentClimateQuestEvaluation(state);
  const quest = climateQuestByIndex(state.questIndex);
  const campaign = campaignState(state);
  if (eventMatches(campaign, eventTransition.started)
    || (campaign.scheduledEventId != null
      && state.events?.activeId === campaign.scheduledEventId)) campaign.status = 'active';

  const ended = eventMatches(campaign, eventTransition.ended)
    ? eventTransition.ended
    : null;
  if (campaign.status === 'active' && summary && !ended) {
    const progress = campaign.progress;
    const qualifies = dayQualifies(state, quest, summary);
    progress.consecutiveDays = qualifies ? (progress.consecutiveDays || 0) + 1 : 0;
    progress.bestConsecutiveDays = Math.max(
      progress.bestConsecutiveDays || 0,
      progress.consecutiveDays,
    );
    if (qualifies) progress.qualifiedDays = (progress.qualifiedDays || 0) + 1;
    if (quest.objective === 'battery') {
      progress.batteryEnergy = (progress.batteryEnergy || 0) + batteryDischarged(summary);
      const stored = Number(summary?.batteryStored);
      if (Number.isFinite(stored)) {
        const previousMinimum = Number(progress.batteryReserveMinimum);
        progress.batteryReserveMinimum = progress.batteryReserveMinimum == null
          || !Number.isFinite(previousMinimum)
          ? stored
          : Math.min(previousMinimum, stored);
      }
    }
    if (quest.objective === 'diversity' && qualifies) {
      progress.generationTypeDays = (progress.generationTypeDays || 0) + 1;
    }
    if (quest.objective === 'tidal') {
      progress.tidalEnergy = (progress.tidalEnergy || 0) + deliveredByType(state, summary, 'tidal');
    }
    state.questProgress = progress;
  }

  if (ended) {
    const passed = attemptPassed(quest, campaign.progress);
    const result = {
      questIndex: quest.index,
      eventId: ended.id,
      eventType: quest.eventType,
      attempt: campaign.attempt,
      passed,
      progress: { ...campaign.progress },
    };
    campaign.status = 'result';
    campaign.lastResult = result;
    state.questStatus = passed ? 'ready_to_claim' : 'active';
    eventBus.emit(Events.CLIMATE_QUEST_RESULT, result);
    if (passed) eventBus.emit(Events.QUEST_READY, { quest: QUESTS[quest.index - 1], evaluation: result });
  }
  return currentClimateQuestEvaluation(state);
}

export function retryClimateQuest(state) {
  const campaign = campaignState(state);
  if (!isClimateQuestActive(state) || campaign.status !== 'result' || campaign.lastResult?.passed) {
    return { ok: false, reason: 'retry_unavailable' };
  }
  campaign.status = 'briefing';
  eventBus.emit(Events.CLIMATE_QUEST_RETRY_REQUESTED, { questIndex: state.questIndex, attempt: campaign.attempt + 1 });
  return acknowledgeClimateBriefing(state);
}

export function claimClimateQuest(state) {
  if (!isClimateQuestActive(state)) return { ok: false, reason: 'not_climate_quest' };
  const quest = climateQuestByIndex(state.questIndex);
  const campaign = campaignState(state);
  if (state.questStatus !== 'ready_to_claim' || campaign.lastResult?.passed !== true) {
    return { ok: false, reason: 'not_ready' };
  }
  if (state.claimedQuestIds.has(quest.id)) return { ok: false, reason: 'already_claimed' };

  state.claimedQuestIds.add(quest.id);
  state.credits = roundCredits(state.credits + quest.reward.credits);
  quest.reward.unlockFacilities.forEach((type) => state.unlockedFacilities.add(type));
  if (quest.reward.upgradePermitLevel) {
    state.upgradePermitLevel = Math.max(state.upgradePermitLevel, quest.reward.upgradePermitLevel);
  }
  if (!campaign.completedEventTypes.includes(quest.eventType)) {
    campaign.completedEventTypes.push(quest.eventType);
  }

  const completedEventTypes = [...campaign.completedEventTypes];
  const result = {
    ok: true,
    credits: quest.reward.credits,
    unlockedFacilities: [...quest.reward.unlockFacilities],
    unlockedResearch: [...quest.reward.unlockResearch],
    upgradePermitLevel: quest.reward.upgradePermitLevel,
    upgradePermitFacilities: [...quest.reward.upgradePermitFacilities],
    stressTest: quest.reward.stressTest,
    nextQuest: quest.index + 1,
  };

  state.questIndex = quest.index + 1;
  state.questProgress = {};
  state.events.activeId = null;
  state.events.currentMetrics = null;
  state.events.schedule = [];
  if (quest.index === CLIMATE_QUEST_MAX) {
    state.questStatus = 'active';
    // 최종시험 동안에도 도시를 고칠 수 있어야 한다. 보고서 단계는 시험을 통과한 뒤에 설정된다.
    state.stage = STAGES.REDESIGN;
    state.progression.chapter = 4;
    state.stressTest.status = 'ready';
    Object.assign(campaign, {
      status: 'complete',
      eventType: null,
      scheduledEventId: null,
      progress: {},
      completedEventTypes,
    });
  } else {
    state.questStatus = 'active';
    state.stage = STAGES.REDESIGN;
    state.progression.chapter = 3;
    Object.assign(campaign, {
      status: 'briefing',
      eventType: null,
      scheduledEventId: null,
      progress: {},
      lastResult: null,
      completedEventTypes,
    });
  }

  eventBus.emit(Events.QUEST_CLAIMED, { quest: QUESTS[quest.index - 1], result });
  return result;
}
