import {
  CITY_EVENTS,
  EVENT_FORECAST_HOURS,
  EVENT_GAP_HOURS,
  FULL_EVENT_DECK,
  OPENING_EVENT_DECK,
} from '../core/EventDefinitions.js';

function rotatedDeck(deck, seed) {
  const offset = Math.abs(Math.trunc(Number(seed) || 0)) % deck.length;
  return [...deck.slice(offset), ...deck.slice(0, offset)];
}

function scheduleDeck(deck, seed, startHour, cycle = 0) {
  let cursor = startHour + EVENT_FORECAST_HOURS;
  return rotatedDeck(deck, seed + cycle).map((type, index) => {
    const definition = CITY_EVENTS[type];
    const item = {
      id: `event-${cycle}-${index}-${type}`,
      type,
      announceAt: cursor - EVENT_FORECAST_HOURS,
      startAt: cursor,
      endAt: cursor + definition.durationHours,
    };
    cursor = item.endAt + EVENT_GAP_HOURS;
    return item;
  });
}

export function createEventSchedule(seed, startHour = 0) {
  return scheduleDeck(OPENING_EVENT_DECK, seed, startHour, 0);
}

function completedIds(state) {
  return new Set((state.events.completed || []).map((item) => typeof item === 'string' ? item : item.id));
}

function ensureSchedule(state) {
  state.events.schedule ||= [];
  state.events.completed ||= [];
  state.events.forecastAcknowledgedIds ||= [];
  if (!state.events.schedule.length) {
    state.events.schedule = createEventSchedule(state.events.seed, state.elapsedGameHours);
  }
  const hasDrought = state.events.schedule.some(({ type }) => type === 'drought');
  if (state.events.completed.length >= 2 && !hasDrought) {
    const lastEnd = Math.max(state.elapsedGameHours, ...state.events.schedule.map(({ endAt }) => endAt));
    state.events.schedule.push(...scheduleDeck(['drought'], state.events.seed, lastEnd + EVENT_GAP_HOURS - EVENT_FORECAST_HOURS, 1));
  }
  const done = completedIds(state);
  const hasFuture = state.events.schedule.some((item) => !done.has(item.id) && item.endAt > state.elapsedGameHours);
  if (!hasFuture) {
    const lastEnd = Math.max(state.elapsedGameHours, ...state.events.schedule.map(({ endAt }) => endAt));
    const cycle = Math.floor(state.events.schedule.length / FULL_EVENT_DECK.length) + 1;
    state.events.schedule.push(...scheduleDeck(FULL_EVENT_DECK, state.events.seed, lastEnd + EVENT_GAP_HOURS - EVENT_FORECAST_HOURS, cycle));
  }
}

function eventById(state, id) {
  return state.events.schedule.find((item) => item.id === id) || null;
}

function freshMetrics(event) {
  return {
    eventId: event.id,
    hours: 0,
    outageHours: 0,
    batteryEnergyUsed: 0,
    minimumEssentialSupply: 100,
    netIncome: 0,
    carbonViolations: 0,
    waterViolations: 0,
  };
}

function eventWaterLimit(state, event) {
  if (event?.type !== 'drought') return null;
  const baseline = Number(state.baseline?.hourlyWater);
  return (Number.isFinite(baseline) && baseline > 0 ? baseline : 10) * 0.75;
}

function diagnosisFor(metrics) {
  const candidates = [
    { metric: 'essential', score: metrics.outageHours * 100 + (100 - metrics.minimumEssentialSupply), label: '필수시설 전력 공급' },
    { metric: 'water', score: metrics.waterViolations * 20, label: '물 사용량' },
    { metric: 'economy', score: Math.max(0, -metrics.netIncome) * 10, label: '운영 수익' },
    { metric: 'carbon', score: metrics.carbonViolations * 10, label: '탄소 배출' },
  ];
  return candidates.sort((a, b) => b.score - a.score)[0];
}

function completeActiveEvent(state, event) {
  const metrics = state.events.currentMetrics || freshMetrics(event);
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

function recordEventHour(state, event, summary) {
  const metrics = state.events.currentMetrics || freshMetrics(event);
  metrics.hours += 1;
  if ((summary.essentialSupplyPercent ?? 100) < 90) metrics.outageHours += 1;
  metrics.batteryEnergyUsed += Object.values(summary.batteryOperations || {})
    .reduce((sum, item) => sum + (Number(item.discharged) || 0), 0);
  metrics.minimumEssentialSupply = Math.min(metrics.minimumEssentialSupply, summary.essentialSupplyPercent ?? 100);
  metrics.netIncome += Number(summary.netCredits) || 0;
  if ((summary.hourlyCarbon || 0) > 10) metrics.carbonViolations += 1;
  const waterLimit = eventWaterLimit(state, event);
  if (waterLimit != null && (summary.hourlyWater || 0) > waterLimit) metrics.waterViolations += 1;
  state.events.currentMetrics = metrics;
}

export function eventModifierForFacility(eventType, facilityType) {
  if (eventType === 'heatwave') {
    if (facilityType === 'residential') return { demand: 1.25 };
    if (facilityType === 'data') return { water: 1.2 };
    if (facilityType === 'solar') return { supply: 1.1 };
  }
  if (eventType === 'nightPeak') {
    if (facilityType === 'residential') return { demand: 1.25 };
    if (facilityType === 'solar') return { supply: 0.05 };
  }
  if (eventType === 'lowWind' && facilityType === 'wind') return { supply: 0.35 };
  return {};
}

export function activeEventContext(state) {
  const event = eventById(state, state.events?.activeId);
  if (!event) return { event: null, byFacility: null, city: {} };
  return {
    event,
    byFacility: (index) => eventModifierForFacility(event.type, state.grid[index]?.type),
    city: {
      waterLimit: eventWaterLimit(state, event),
      waterLimitRatio: event.type === 'drought' ? 0.75 : 1,
      coolingEffectiveness: event.type === 'drought' ? 1.25 : 1,
    },
  };
}

export function advanceCityEvents(state, summary = null) {
  if ((state.progression?.chapter || 1) < 3) {
    return { active: null, forecast: null, forecasted: null, started: null, ended: null, result: null };
  }
  ensureSchedule(state);
  const hour = state.elapsedGameHours;
  let ended = null;
  const activeBefore = eventById(state, state.events.activeId);
  if (activeBefore && hour >= activeBefore.endAt) ended = completeActiveEvent(state, activeBefore);

  const done = completedIds(state);
  const next = state.events.schedule.find((item) => !done.has(item.id) && item.endAt > hour) || null;
  let started = null;
  if (!state.events.activeId && next && hour >= next.startAt && hour < next.endAt) {
    state.events.activeId = next.id;
    state.events.currentMetrics = freshMetrics(next);
    started = next;
  }
  const active = eventById(state, state.events.activeId);
  if (summary && active) recordEventHour(state, active, summary);

  const forecast = !active && next && hour >= next.announceAt && hour < next.startAt ? next : null;
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
