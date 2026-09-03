import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { createDaySettler, createSimulationController } from '../../../src/systems/SimulationSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { applyOperationalRisk } from '../../../src/systems/CityFailureSystem.js';
import { DEMAND_VARIATION, FACILITY_DEMAND_BY_LEVEL } from '../../../src/core/Constants.js';
import { createEnvironment, demandVariationFactor } from '../../../src/systems/EnvironmentSystem.js';

test('one settlement advances exactly one day and applies power income once', () => {
  const state = new GameState();
  state.grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
  state.unlockedFacilities.add('thermal');
  const settleDay = createDaySettler({ calculatePowerNetwork, settleEconomy });

  const result = settleDay(state);

  expect(state.elapsedGameDays).toBe(1);
  expect(state.tickIndex).toBe(1);
  expect(result.power.facilityPower[1].ratio).toBe(1);
  // 화력·주거 인접 페널티와 건강 비용은 첫 정산부터 공개·적용된다.
  expect(state.lastTickSummary.netCredits).toBe(-0.74);
  expect(state.lastTickSummary).toMatchObject({ capacity: 6, used: 3 });
});

test('daily settlement applies research demand before power and advances research before quest progress', () => {
  const state = new GameState();
  const order = [];
  const powerResult = { nextBatteries: {}, facilityPower: { 3: { ratio: 0.95 } }, routes: [], demand: 10, delivered: 10, lowCarbonPercent: 0 };
  const settleDay = createDaySettler({
    getResearchDemand: () => { order.push('research-demand'); return { 3: 2 }; },
    calculatePowerNetwork: ({ additionalDemandByIndex }) => {
      order.push(`power:${additionalDemandByIndex[3]}`);
      return powerResult;
    },
    settleEconomy: () => {
      order.push('economy');
      return {
        nextCredits: 11, netCredits: 1, dailyCarbon: 0, dailyWater: 0,
        labor: { workforce: 0, jobs: 0, employmentRate: 0, industryFill: 0 },
        facilityEconomy: {}, overcrowding: 0, health: 0,
      };
    },
    advanceResearch: (_state, facilityPower) => { order.push(`research-progress:${facilityPower[3].ratio}`); return { status: 'running' }; },
    evaluateQuest: () => { order.push('quest'); },
  });
  const result = settleDay(state);
  expect(order).toEqual(['research-demand', 'power:2', 'economy', 'research-progress:0.95', 'quest']);
  expect(result.research).toEqual({ status: 'running' });
  expect(state.lastSettlementDelta).toBe(1);
  expect(state.elapsedGameDays).toBe(1);
});

test('daily settlement passes the authoritative axial coordinates to power and economy', () => {
  const state = new GameState();
  const calls = [];
  const settleDay = createDaySettler({
    calculatePowerNetwork: ({ coords }) => {
      calls.push({ stage: 'power', coords });
      return { nextBatteries: {}, facilityPower: {}, routes: [], demand: 0, delivered: 0, lowCarbonPercent: 0 };
    },
    settleEconomy: ({ coords }) => {
      calls.push({ stage: 'economy', coords });
      return {
        nextCredits: state.credits,
        netCredits: 0,
        dailyCarbon: 0,
        dailyWater: 0,
        labor: { workforce: 0, jobs: 0, employmentRate: 0, industryFill: 0 },
        facilityEconomy: {},
        overcrowding: 0,
        health: 0,
      };
    },
  });
  settleDay(state);
  expect(calls.map(({ stage }) => stage)).toEqual(['power', 'economy']);
  expect(calls[0].coords).toHaveLength(19);
  expect(calls[1].coords).toBe(calls[0].coords);
});

test('the displayed settlement delta is rounded to cents', () => {
  const state = new GameState();
  const settleDay = createDaySettler({
    calculatePowerNetwork: () => ({
      nextBatteries: {}, facilityPower: {}, routes: [], demand: 0, delivered: 0, lowCarbonPercent: 0,
    }),
    settleEconomy: () => ({
      nextCredits: 10.015,
      netCredits: 0.015,
      dailyCarbon: 0,
      dailyWater: 0,
      labor: { workforce: 0, jobs: 0, employmentRate: 0, industryFill: 0 },
      facilityEconomy: {},
      overcrowding: 0,
      health: 0,
    }),
  });

  settleDay(state);

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

test('simulation controller reset clears speed, progress, and every pause reason', () => {
  for (const scale of [0, 1, 4]) {
    let nextId = 0;
    let currentTime = 0;
    const timers = new Map();
    const controller = createSimulationController({
      intervalMs: 1000,
      settle: () => {},
      now: () => currentTime,
      setTimer: (fn, ms) => { const id = ++nextId; timers.set(id, { fn, ms }); return id; },
      clearTimer: (id) => timers.delete(id),
    });

    controller.start();
    currentTime = 250;
    controller.setTimeScale(scale);
    controller.pause('modal');
    controller.pause('hidden');
    controller.reset();

    expect(controller.getState(), `reset from ${scale}x`).toMatchObject({
      running: true,
      paused: false,
      pauseReasons: [],
      scheduled: true,
      timeScale: 1,
      progress: 0,
    });
    expect(timers.size).toBe(1);
    controller.dispose();
  }
});

test('a city with no essential facilities is fully supplied, not blacked out', () => {
  const state = new GameState();
  state.questIndex = 4;
  const settleDay = createDaySettler({ calculatePowerNetwork, settleEconomy });

  const { summary } = settleDay(state);

  expect(summary.essentialSupplyPercent).toBe(100);
  applyOperationalRisk(state, summary);
  expect(state.operationalRisk.essentialBlackoutDays).toBe(0);
});

test('연속한 두 날의 도시 수요는 그날의 수요 변동 계수를 그대로 따른다', () => {
  const state = new GameState();
  // 변동은 판의 씨앗에서 나온다. 씨앗을 고정해야 기대값을 계산할 수 있다.
  state.environment = createEnvironment(20400134);
  state.grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  state.grid[1] = { type: 'residential', level: 2, priority: 'essential' };
  state.grid[2] = { type: 'factory', level: 1, priority: 'normal' };
  const settleDay = createDaySettler({ calculatePowerNetwork, settleEconomy });
  const baseDemand = FACILITY_DEMAND_BY_LEVEL.residential[2] + FACILITY_DEMAND_BY_LEVEL.factory[1];
  // 수요 변동은 HOLD_DAYS일 묶음 단위로만 바뀌므로, 묶음 경계를 넘는 두 날(마지막 날 → 다음 묶음 첫날)을 본다.
  const boundary = DEMAND_VARIATION.HOLD_DAYS;
  state.elapsedGameDays = boundary - 2;

  const first = settleDay(state).summary.demand;
  const second = settleDay(state).summary.demand;

  expect(state.elapsedGameDays).toBe(boundary);
  expect(first).toBeCloseTo(baseDemand * demandVariationFactor(state, boundary - 1), 1);
  expect(second).toBeCloseTo(baseDemand * demandVariationFactor(state, boundary), 1);
  expect(first).not.toBe(second);
  expect(Math.abs(second - first)).toBeLessThanOrEqual(2 * DEMAND_VARIATION.AMPLITUDE * baseDemand);
  // 화력 13E는 흔들린 수요를 여전히 덮으므로 공급률은 두 날 모두 만족이다.
  expect(state.lastTickSummary.deliveredPower).toBeCloseTo(second, 5);
});
