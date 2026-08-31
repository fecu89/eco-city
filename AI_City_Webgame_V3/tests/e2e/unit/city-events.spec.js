import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { CITY_EVENTS } from '../../../src/core/EventDefinitions.js';
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

test('opening schedule contains each readable event once, with six-hour forecasts and no overlap', () => {
  const schedule = createEventSchedule(20400101, 10);
  expect(schedule.map(({ type }) => type).sort()).toEqual(['heatwave', 'lowWind', 'nightPeak'].sort());
  schedule.forEach((item) => expect(item.startAt - item.announceAt).toBe(6));
  for (let index = 1; index < schedule.length; index += 1) {
    expect(schedule[index].startAt).toBeGreaterThan(schedule[index - 1].endAt);
  }
});

test('event boundary follows forecast then active then ended exactly once', () => {
  const state = eventState();
  state.events.schedule = [{ id: 'heat-1', type: 'heatwave', announceAt: 2, startAt: 8, endAt: 16 }];
  state.elapsedGameHours = 1;
  expect(advanceCityEvents(state)).toMatchObject({ forecast: null, active: null });
  state.elapsedGameHours = 2;
  expect(advanceCityEvents(state)).toMatchObject({ forecasted: { id: 'heat-1' }, active: null });
  expect(advanceCityEvents(state).forecasted).toBeNull();
  state.elapsedGameHours = 8;
  expect(advanceCityEvents(state)).toMatchObject({ started: { id: 'heat-1' }, active: { id: 'heat-1' } });
  state.elapsedGameHours = 16;
  expect(advanceCityEvents(state)).toMatchObject({ ended: { id: 'heat-1' }, active: null });
  expect(state.events.completed).toHaveLength(1);
});

test('all four event modifiers apply only to their matching facilities', () => {
  expect(eventModifierForFacility('heatwave', 'residential')).toEqual({ demand: 1.25 });
  expect(eventModifierForFacility('heatwave', 'data')).toEqual({ water: 1.2 });
  expect(eventModifierForFacility('heatwave', 'solar')).toEqual({ supply: 1.1 });
  expect(eventModifierForFacility('nightPeak', 'solar')).toEqual({ supply: 0.05 });
  expect(eventModifierForFacility('lowWind', 'wind')).toEqual({ supply: 0.35 });

  const state = eventState();
  state.baseline = { hourlyWater: 8 };
  state.events.schedule = [{ id: 'dry-1', type: 'drought', announceAt: 0, startAt: 6, endAt: 12 }];
  state.elapsedGameHours = 6;
  advanceCityEvents(state);
  expect(activeEventContext(state).city).toMatchObject({
    waterLimit: 6,
    waterLimitRatio: 0.75,
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
  state.events.schedule = [{ id: 'wind-1', type: 'lowWind', announceAt: 0, startAt: 0, endAt: CITY_EVENTS.lowWind.durationHours }];
  advanceCityEvents(state);
  for (let hour = 0; hour < CITY_EVENTS.lowWind.durationHours; hour += 1) {
    state.elapsedGameHours = hour;
    advanceCityEvents(state, {
      essentialSupplyPercent: hour < 3 ? 40 : 95,
      batteryOperations: { 2: { discharged: 1.5 } },
      netCredits: -1,
      hourlyCarbon: 12,
      hourlyWater: 5,
    });
  }
  state.elapsedGameHours = CITY_EVENTS.lowWind.durationHours;
  const ended = advanceCityEvents(state).ended;
  expect(ended.metrics).toMatchObject({
    hours: 6,
    outageHours: 3,
    batteryEnergyUsed: 9,
    minimumEssentialSupply: 40,
    netIncome: -6,
    carbonViolations: 6,
  });
  expect(ended.diagnosis.metric).toBe('essential');
});
