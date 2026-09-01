import {
  CITY_EVENTS,
  EVENT_FORECAST_DAYS,
  EVENT_GAP_DAYS,
  FULL_EVENT_DECK,
  OPENING_EVENT_DECK,
} from '../core/EventDefinitions.js';
import {
  cityModifierForClimate,
  facilityModifierForClimate,
} from './ClimateModifierSystem.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';

function rotatedDeck(deck, seed) {
  const offset = Math.abs(Math.trunc(Number(seed) || 0)) % deck.length;
  return [...deck.slice(offset), ...deck.slice(0, offset)];
}

function scheduleDeck(deck, seed, startDay, cycle = 0) {
  let cursor = startDay + EVENT_FORECAST_DAYS;
  return rotatedDeck(deck, seed + cycle).map((type, index) => {
    const definition = CITY_EVENTS[type];
    const item = {
      id: `event-${cycle}-${index}-${type}`,
      type,
      announceAt: cursor - EVENT_FORECAST_DAYS,
      startAt: cursor,
      endAt: cursor + definition.durationDays,
    };
    cursor = item.endAt + EVENT_GAP_DAYS + EVENT_FORECAST_DAYS;
    return item;
  });
}

export function createEventSchedule(seed, startDay = 0) {
  return scheduleDeck(OPENING_EVENT_DECK, seed, startDay, 0);
}

function completedIds(state) {
  return new Set((state.events.completed || []).map((item) => typeof item === 'string' ? item : item.id));
}

function campaignOwnsSchedule(state) {
  return state.questIndex >= CAMPAIGN_QUEST_INDEXES.CLIMATE_START
    && state.questIndex <= CAMPAIGN_QUEST_INDEXES.CLIMATE_END
    && ['briefing', 'preparation', 'active', 'result'].includes(state.climateCampaign?.status);
}

function ensureSchedule(state) {
  state.events.schedule ||= [];
  state.events.completed ||= [];
  state.events.forecastAcknowledgedIds ||= [];
  if (campaignOwnsSchedule(state)) return;
  if (!state.events.schedule.length) {
    state.events.schedule = createEventSchedule(state.events.seed, state.elapsedGameDays);
  }
  const hasDrought = state.events.schedule.some(({ type }) => type === 'drought');
  if (state.events.completed.length >= 2 && !hasDrought) {
    const lastEnd = Math.max(state.elapsedGameDays, ...state.events.schedule.map(({ endAt }) => endAt));
    state.events.schedule.push(...scheduleDeck(['drought'], state.events.seed, lastEnd + EVENT_GAP_DAYS, 1));
  }
  const done = completedIds(state);
  const hasFuture = state.events.schedule.some((item) => !done.has(item.id) && item.endAt > state.elapsedGameDays);
  if (!hasFuture) {
    const lastEnd = Math.max(state.elapsedGameDays, ...state.events.schedule.map(({ endAt }) => endAt));
    const cycle = Math.floor(state.events.schedule.length / FULL_EVENT_DECK.length) + 1;
    state.events.schedule.push(...scheduleDeck(FULL_EVENT_DECK, state.events.seed, lastEnd + EVENT_GAP_DAYS, cycle));
  }
}

function eventById(state, id) {
  return state.events.schedule.find((item) => item.id === id) || null;
}

function freshMetrics(event) {
  return {
    eventId: event.id,
    days: 0,
    outageDays: 0,
    batteryEnergyUsed: 0,
    minimumEssentialSupply: 100,
    netIncome: 0,
    carbonViolations: 0,
    carbonTotal: 0,
    averageDailyCarbon: 0,
    maxDailyCarbon: 0,
    waterViolationDays: 0,
  };
}

function eventWaterLimit(state, event) {
  const baseline = Number(state.baseline?.dailyWater);
  return cityModifierForClimate(CITY_EVENTS[event?.type], {
    baselineWater: Number.isFinite(baseline) && baseline > 0 ? baseline : 10,
  }).waterLimit;
}

function diagnosisFor(metrics) {
  const candidates = [
    { metric: 'essential', score: metrics.outageDays * 100 + (100 - metrics.minimumEssentialSupply), label: '필수시설 전력 공급' },
    { metric: 'water', score: metrics.waterViolationDays * 20, label: '물 사용량' },
    { metric: 'economy', score: Math.max(0, -metrics.netIncome) * 10, label: '운영 수익' },
    { metric: 'carbon', score: metrics.carbonViolations * 10, label: '탄소 배출' },
  ];
  return candidates.sort((a, b) => b.score - a.score)[0];
}

function completeActiveEvent(state, event) {
  const metrics = state.events.currentMetrics || freshMetrics(event);
  metrics.averageDailyCarbon = metrics.days ? metrics.carbonTotal / metrics.days : 0;
  const result = {
    id: event.id,
    type: event.type,
    metrics: { ...metrics },
    diagnosis: diagnosisFor(metrics),
  };
  state.events.completed.push(result);
  state.events.activeId = null;
  state.events.currentMetrics = null;
  state.events.lastResult = result;
  return result;
}

function recordEventDay(state, event, summary) {
  const metrics = state.events.currentMetrics || freshMetrics(event);
  metrics.days += 1;
  if ((summary.essentialSupplyPercent ?? 100) < 90) metrics.outageDays += 1;
  metrics.batteryEnergyUsed += Object.values(summary.batteryOperations || {})
    .reduce((sum, item) => sum + (Number(item.discharged) || 0), 0);
  metrics.minimumEssentialSupply = Math.min(metrics.minimumEssentialSupply, summary.essentialSupplyPercent ?? 100);
  metrics.netIncome += Number(summary.netCredits) || 0;
  const dailyCarbon = Number(summary.dailyCarbon) || 0;
  metrics.carbonTotal += dailyCarbon;
  metrics.maxDailyCarbon = Math.max(metrics.maxDailyCarbon, dailyCarbon);
  if (dailyCarbon > 10) metrics.carbonViolations += 1;
  const waterLimit = eventWaterLimit(state, event);
  if (waterLimit != null && (summary.dailyWater || 0) > waterLimit) metrics.waterViolationDays += 1;
  state.events.currentMetrics = metrics;
}

export function eventModifierForFacility(eventType, facilityType, level = 1) {
  return facilityModifierForClimate(CITY_EVENTS[eventType], facilityType, level);
}

export function activeEventContext(state) {
  const event = eventById(state, state.events?.activeId);
  if (!event) return { event: null, byFacility: null, city: {} };
  const definition = CITY_EVENTS[event.type];
  const baselineWater = Number(state.baseline?.dailyWater);
  const city = cityModifierForClimate(definition, {
    baselineWater: Number.isFinite(baselineWater) && baselineWater > 0 ? baselineWater : 10,
  });
  return {
    event,
    byFacility: (index) => eventModifierForFacility(event.type, state.grid[index]?.type, state.grid[index]?.level),
    city,
  };
}

export function advanceCityEvents(state, summary = null) {
  if ((state.progression?.chapter || 1) < 3) {
    return { active: null, forecast: null, forecasted: null, started: null, ended: null, result: null };
  }
  ensureSchedule(state);
  const currentDay = state.elapsedGameDays;
  let ended = null;
  const activeBefore = eventById(state, state.events.activeId);
  if (activeBefore && currentDay >= activeBefore.endAt) ended = completeActiveEvent(state, activeBefore);

  const done = completedIds(state);
  const next = state.events.schedule.find((item) => !done.has(item.id) && item.endAt > currentDay) || null;
  let started = null;
  if (!state.events.activeId && next && currentDay >= next.startAt && currentDay < next.endAt) {
    state.events.activeId = next.id;
    state.events.currentMetrics = freshMetrics(next);
    started = next;
  }
  const active = eventById(state, state.events.activeId);
  if (summary && active) recordEventDay(state, active, summary);

  const forecast = !active && next && currentDay >= next.announceAt && currentDay < next.startAt ? next : null;
  let forecasted = null;
  if (forecast && !state.events.forecastAcknowledgedIds.includes(forecast.id)) {
    state.events.forecastAcknowledgedIds.push(forecast.id);
    forecasted = forecast;
  }
  return {
    active,
    forecast,
    forecasted,
    started,
    ended,
    result: ended,
    activeModifiers: activeEventContext(state),
  };
}
