import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { CITY_EVENTS, EVENT_FORECAST_DAYS, EVENT_GAP_DAYS } from '../../../src/core/EventDefinitions.js';
import {
  activeEventContext,
  advanceCityEvents,
  createEventSchedule,
  eventModifierForFacility,
} from '../../../src/systems/CityEventSystem.js';

function eventState() {
  const state = new GameState();
  state.progression.chapter = 3;
  return state;
}

test('opening schedule contains each readable event once, with 24-day preparation forecasts and no overlap', () => {
  const schedule = createEventSchedule(20400101, 10);
  expect(schedule.map(({ type }) => type).sort()).toEqual(['heatwave', 'monsoon', 'typhoon'].sort());
  schedule.forEach((item) => expect(item.startAt - item.announceAt).toBe(EVENT_FORECAST_DAYS));
  for (let index = 1; index < schedule.length; index += 1) {
    expect(schedule[index].startAt).toBeGreaterThan(schedule[index - 1].endAt);
    expect(schedule[index].announceAt - schedule[index - 1].endAt).toBe(EVENT_GAP_DAYS);
  }
});

test('event boundary follows forecast then active then ended exactly once', () => {
  const state = eventState();
  state.events.schedule = [{ id: 'heat-1', type: 'heatwave', announceAt: 2, startAt: 8, endAt: 16 }];
  state.elapsedGameDays = 1;
  expect(advanceCityEvents(state)).toMatchObject({ forecast: null, active: null });
  state.elapsedGameDays = 2;
  expect(advanceCityEvents(state)).toMatchObject({ forecasted: { id: 'heat-1' }, active: null });
  expect(advanceCityEvents(state).forecasted).toBeNull();
  state.elapsedGameDays = 8;
  expect(advanceCityEvents(state)).toMatchObject({ started: { id: 'heat-1' }, active: { id: 'heat-1' } });
  state.elapsedGameDays = 16;
  expect(advanceCityEvents(state)).toMatchObject({ ended: { id: 'heat-1' }, active: null });
  expect(state.events.completed).toHaveLength(1);
});

test('all Korean climate modifiers apply only to their matching facilities', () => {
  expect(eventModifierForFacility('heatwave', 'residential')).toEqual({ demand: 1.25 });
  expect(eventModifierForFacility('heatwave', 'data')).toEqual({ water: 1.2 });
  expect(eventModifierForFacility('heatwave', 'solar')).toEqual({ supply: 1.1 });
  expect(eventModifierForFacility('monsoon', 'solar')).toEqual({ supply: 0.4 });
  expect(eventModifierForFacility('typhoon', 'wind')).toEqual({ supply: 0.2 });

  const state = eventState();
  state.baseline = { dailyWater: 8 };
  state.events.schedule = [{ id: 'dry-1', type: 'drought', announceAt: 0, startAt: 6, endAt: 12 }];
  state.elapsedGameDays = 6;
  advanceCityEvents(state);
  expect(activeEventContext(state).city).toMatchObject({
    waterLimit: 5.6,
    waterLimitRatio: 0.7,
    coolingEffectiveness: 1.25,
  });
});

test('drought enters only after two completed events', () => {
  const state = eventState();
  advanceCityEvents(state);
  expect(state.events.schedule.some(({ type }) => type === 'drought')).toBe(false);
  state.events.completed = [{ id: 'done-1' }];
  advanceCityEvents(state);
  expect(state.events.schedule.some(({ type }) => type === 'drought')).toBe(false);
  state.events.completed.push({ id: 'done-2' });
  advanceCityEvents(state);
  expect(state.events.schedule.some(({ type }) => type === 'drought')).toBe(true);
});

test('event result records operating metrics and diagnoses the worst outcome', () => {
  const state = eventState();
  state.events.schedule = [{ id: 'air-1', type: 'stagnantAir', announceAt: 0, startAt: 0, endAt: CITY_EVENTS.stagnantAir.durationDays }];
  advanceCityEvents(state);
  for (let day = 0; day < CITY_EVENTS.stagnantAir.durationDays; day += 1) {
    state.elapsedGameDays = day;
    advanceCityEvents(state, {
      essentialSupplyPercent: day < 3 ? 40 : 95,
      batteryOperations: { 2: { discharged: 1.5 } },
      netCredits: -1,
      dailyCarbon: 12,
      dailyWater: 5,
    });
  }
  state.elapsedGameDays = CITY_EVENTS.stagnantAir.durationDays;
  const ended = advanceCityEvents(state).ended;
  expect(ended.metrics).toMatchObject({
    days: 6,
    outageDays: 3,
    batteryEnergyUsed: 9,
    minimumEssentialSupply: 40,
    netIncome: -6,
    carbonViolations: 6,
    averageDailyCarbon: 12,
    maxDailyCarbon: 12,
    waterViolationDays: 0,
  });
  expect(ended.diagnosis.metric).toBe('essential');
});

test('campaign briefing owns the event schedule and prevents random events from being appended', () => {
  const state = eventState();
  state.questIndex = 7;
  state.climateCampaign.status = 'briefing';
  advanceCityEvents(state);
  expect(state.events.schedule).toEqual([]);

  state.climateCampaign.status = 'preparation';
  state.events.schedule = [{
    id: 'climate-q7-a1', source: 'campaign', type: 'heatwave', announceAt: 0, startAt: 24, endAt: 32,
  }];
  advanceCityEvents(state);
  expect(state.events.schedule).toHaveLength(1);
  expect(state.events.schedule[0].source).toBe('campaign');
});
