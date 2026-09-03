import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  buildCityModifierContext,
  effectiveFacilityStats,
  setFacilityPriority,
} from '../../../src/systems/CityModifierSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';

const factory = (level = 1) => ({ type: 'factory', level, priority: 'normal' });

test('level event zone and research modifiers compose once', () => {
  const stats = effectiveFacilityStats(factory(2), {
    event: { demand: 1.4 },
    zone: { income: 1.35 },
    research: { carbon: 1.2 },
  });

  expect(stats.demand).toBeCloseTo(4 * 1.24 * 1.4);
  expect(stats.income).toBeCloseTo(1 * 1.48 * 1.35);
  expect(stats.carbon).toBeCloseTo(2 * 1.16 * 1.2);
  expect(stats.workforce).toBe(6);
});

test('operation context applies one facility modifier equally to power and economy', () => {
  const state = new GameState();
  state.grid[0] = { type: 'thermal', level: 1, priority: 'normal' };
  state.grid[1] = { type: 'residential', level: 1, priority: 'essential' };
  // 주거지 Lv.1 인력이 6명이라 한 채로는 화력+공장 일자리 9개를 못 채우고, 인력 부족
  // 계수(industryFill)가 시설 계수 위에 겹쳐 검증하려는 값을 가린다. 이 테스트가 보는
  // 것은 "시설 계수가 전력과 경제에 똑같이 적용되는가"이므로 인력을 충분히 채운다.
  state.grid[3] = { type: 'residential', level: 1, priority: 'essential' };
  state.grid[2] = factory(2);
  const modifierContext = buildCityModifierContext(state, {
    eventModifiers: { 2: { demand: 0.65, income: 0.7, carbon: 0.85 }, default: {} },
  });
  const power = calculatePowerNetwork({ grid: state.grid, modifierContext, hour: 12 });
  const economy = settleEconomy({
    grid: state.grid,
    modifierContext,
    facilityPower: power.facilityPower,
    credits: 10,
  });

  expect(power.facilityPower[2].demand).toBeCloseTo(4 * 1.24 * 0.65);
  expect(economy.facilityEconomy[2].income).toBeCloseTo(1 * 1.48 * 0.7);
  expect(economy.facilityEnvironment[2].carbon).toBeCloseTo(2 * 1.16 * 0.85);
});

test('priority changes are validated and counted only when the player selects a different priority', () => {
  const state = new GameState();
  state.grid[2] = factory(2);
  expect(setFacilityPriority(state, 2, 'essential')).toMatchObject({ ok: true, before: 'normal', after: 'essential' });
  expect(setFacilityPriority(state, 2, 'essential')).toMatchObject({ ok: true, before: 'essential', after: 'essential' });
  expect(setFacilityPriority(state, 2, 'invalid')).toMatchObject({ ok: false, reason: 'invalid_priority' });
  expect(state.decisionCounts.priorityChanges).toBe(1);
});
