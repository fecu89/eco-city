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

  expect(state.simulationHour).toBe(9);
  expect(state.tickIndex).toBe(1);
  expect(result.power.facilityPower[1].ratio).toBe(1);
  expect(state.lastTickSummary.netCredits).toBe(-0.4);
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
