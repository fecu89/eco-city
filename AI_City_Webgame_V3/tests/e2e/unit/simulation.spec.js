import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { createHourSettler, createSimulationController } from '../../../src/systems/SimulationSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';

test('one settlement advances exactly one hour and applies power income once', () => {
  const state = new GameState();
  state.grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
  state.unlockedFacilities.add('thermal');
  const settleHour = createHourSettler({ calculatePowerNetwork, settleEconomy });

  const result = settleHour(state);

  expect(state.elapsedGameHours).toBe(1);
  expect(state.tickIndex).toBe(1);
  expect(result.power.facilityPower[1].ratio).toBe(1);
  // 화력·주거 인접 페널티와 건강 비용은 첫 정산부터 공개·적용된다.
  expect(state.lastTickSummary.netCredits).toBe(-0.8);
  expect(state.lastTickSummary).toMatchObject({ capacity: 10, used: 2 });
});

test('hourly settlement applies research demand before power and advances research before quest progress', () => {
  const state = new GameState();
  const order = [];
  const powerResult = { nextBatteries: {}, facilityPower: { 3: { ratio: 0.95 } }, routes: [], demand: 10, delivered: 10, lowCarbonPercent: 0 };
  const settleHour = createHourSettler({
    getResearchDemand: () => { order.push('research-demand'); return { 3: 2 }; },
    calculatePowerNetwork: ({ additionalDemandByIndex }) => {
      order.push(`power:${additionalDemandByIndex[3]}`);
      return powerResult;
    },
    settleEconomy: () => {
      order.push('economy');
      return {
        nextCredits: 11, netCredits: 1, hourlyCarbon: 0, hourlyWater: 0,
        labor: { workforce: 0, jobs: 0, employmentRate: 0, industryFill: 0 },
        facilityEconomy: {}, overcrowding: 0, health: 0,
      };
    },
    advanceResearch: (_state, facilityPower) => { order.push(`research-progress:${facilityPower[3].ratio}`); return { status: 'running' }; },
    evaluateQuest: () => { order.push('quest'); },
  });
  const result = settleHour(state);
  expect(order).toEqual(['research-demand', 'power:2', 'economy', 'research-progress:0.95', 'quest']);
  expect(result.research).toEqual({ status: 'running' });
  expect(state.lastSettlementDelta).toBe(1);
  expect(state.elapsedGameHours).toBe(1);
});

test('hourly settlement passes the authoritative axial coordinates to power and economy', () => {
  const state = new GameState();
  const calls = [];
  const settleHour = createHourSettler({
    calculatePowerNetwork: ({ coords }) => {
      calls.push({ stage: 'power', coords });
      return { nextBatteries: {}, facilityPower: {}, routes: [], demand: 0, delivered: 0, lowCarbonPercent: 0 };
    },
    settleEconomy: ({ coords }) => {
      calls.push({ stage: 'economy', coords });
      return {
        nextCredits: state.credits,
        netCredits: 0,
        hourlyCarbon: 0,
        hourlyWater: 0,
        labor: { workforce: 0, jobs: 0, employmentRate: 0, industryFill: 0 },
        facilityEconomy: {},
        overcrowding: 0,
        health: 0,
      };
    },
  });
  settleHour(state);
  expect(calls.map(({ stage }) => stage)).toEqual(['power', 'economy']);
  expect(calls[0].coords).toHaveLength(19);
  expect(calls[1].coords).toBe(calls[0].coords);
});

test('the displayed settlement delta is rounded to cents', () => {
  const state = new GameState();
  const settleHour = createHourSettler({
    calculatePowerNetwork: () => ({
      nextBatteries: {}, facilityPower: {}, routes: [], demand: 0, delivered: 0, lowCarbonPercent: 0,
    }),
    settleEconomy: () => ({
      nextCredits: 10.015,
      netCredits: 0.015,
      hourlyCarbon: 0,
      hourlyWater: 0,
      labor: { workforce: 0, jobs: 0, employmentRate: 0, industryFill: 0 },
      facilityEconomy: {},
      overcrowding: 0,
      health: 0,
    }),
  });

  settleHour(state);

  expect(state.credits).toBe(10.02);
  expect(state.lastSettlementDelta).toBe(0.02);
});

test('simulation controller keeps one timer across nested pause and resume', () => {
  let nextId = 0;
  const timers = new Map();
  const controller = createSimulationController({
    intervalMs: 5000,
    settle: () => {},
    setTimer: (fn, ms) => { const id = ++nextId; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => timers.delete(id),
  });

  controller.start();
  expect(timers.size).toBe(1);
  controller.pause('modal');
  controller.pause('hidden');
  expect(timers.size).toBe(0);
  controller.resume('modal');
  expect(timers.size).toBe(0);
  controller.resume('hidden');
  expect(timers.size).toBe(1);
  controller.resume('hidden');
  expect(timers.size).toBe(1);
});
