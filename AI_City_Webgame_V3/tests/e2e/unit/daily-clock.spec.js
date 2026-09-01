import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { RESEARCH } from '../../../src/core/ResearchDefinitions.js';
import { calendarAtElapsedDay, intervalForTimeScale } from '../../../src/systems/CalendarSystem.js';
import { getDailySolarMultiplier, getWindMultiplier } from '../../../src/systems/ClimateSystem.js';
import { createBuildProject } from '../../../src/systems/ConstructionProjectSystem.js';
import { createDaySettler } from '../../../src/systems/SimulationSystem.js';

const emptyPower = () => ({
  nextBatteries: {},
  facilityPower: {},
  routes: [],
  demand: 0,
  delivered: 0,
  lowCarbonPercent: 0,
  lowCarbonDelivered: 0,
  lowCarbonSurplus: 0,
  batteryOperations: {},
  generationAvailable: 0,
});

const emptyEconomy = ({ credits }) => ({
  nextCredits: credits,
  netCredits: 0,
  dailyCarbon: 0,
  dailyWater: 0,
  labor: { capacity: 0, used: 0, workforce: 0, jobs: 0, employmentRate: 0, industryFill: 0 },
  facilityEconomy: {},
  facilityEnvironment: {},
  overcrowding: 0,
  health: 0,
  grossIncome: 0,
  expansionUpkeep: 0,
});

test('one tick represents one calendar day while real intervals stay unchanged', () => {
  expect(calendarAtElapsedDay(0)).toEqual({ year: 2040, month: 1, day: 1, elapsedGameDays: 0 });
  expect(calendarAtElapsedDay(1)).toEqual({ year: 2040, month: 1, day: 2, elapsedGameDays: 1 });
  expect(intervalForTimeScale(1)).toBe(1000);
  expect(intervalForTimeScale(2)).toBe(500);
  expect(intervalForTimeScale(4)).toBe(250);
  expect(intervalForTimeScale(0)).toBeNull();
});

test('solar uses the previous curve daily average and lighting cannot change it', () => {
  expect(getDailySolarMultiplier()).toBeCloseTo(11 / 24, 8);
  expect([0, 1, 2, 3].map(getWindMultiplier)).toEqual([0.6, 0.9, 1.1, 0.75]);
});

test('duration numbers keep the same real completion time', () => {
  expect(createBuildProject({ type: 'factory', paidCost: 4 })).toMatchObject({ durationDays: 8, elapsedDays: 0 });
  expect(RESEARCH.solar2).toMatchObject({ durationDays: 120, realMinutesAt1x: 2 });
});

test('one settlement advances one day and exposes daily environmental rates', () => {
  const state = new GameState();
  const settleDay = createDaySettler({ calculatePowerNetwork: emptyPower, settleEconomy: emptyEconomy });

  settleDay(state);

  expect(state.elapsedGameDays).toBe(1);
  expect(state.lastTickSummary).toMatchObject({ dayIndex: 1, dailyCarbon: 0, dailyWater: 0 });
  expect(state.lastTickSummary.calendar).toEqual({ year: 2040, month: 1, day: 2, elapsedGameDays: 1 });
});
