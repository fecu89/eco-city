import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';

const Permits = await import('../../../src/systems/FacilityPermitSystem.js').catch(() => ({}));

const {
  getFacilityLimits,
  getFacilityPermit,
  validateDemolitionPermit,
  validateGridFacilityDependencies,
} = Permits;

test('facility limits expose the approved cumulative capacity through all fifteen quests', () => {
  expect(getFacilityLimits(1)).toMatchObject({ residential: 2 });
  expect(getFacilityLimits(3)).toMatchObject({ green: 1 });
  expect(getFacilityLimits(6)).toMatchObject({ green: 2 });
  expect(getFacilityLimits(9)).toMatchObject({ green: 3 });
  expect(getFacilityLimits(5)).toMatchObject({ residential: 5, thermal: 2, nuclear: 1 });
  expect(getFacilityLimits(10)).toMatchObject({ nuclear: 2, solar: 4, battery: 3, green: 3 });
  expect(getFacilityLimits(15)).toMatchObject({ residential: 10, nuclear: 2, solar: 6, tidal: 3 });
});

test('committed and planned facilities share one quest cap', () => {
  const state = new GameState();
  state.questIndex = 1;
  state.grid[0] = { type: 'residential', level: 1 };
  expect(getFacilityPermit(state, 'residential', [{ index: 1, type: 'residential' }])).toMatchObject({
    ok: false,
    current: 1,
    planned: 1,
    limit: 2,
    reason: 'facility_limit',
  });
});

test('a capped facility explains the next quest that expands its permit', () => {
  const state = new GameState();
  state.questIndex = 5;
  state.grid[0] = { type: 'nuclear', level: 1 };
  expect(getFacilityPermit(state, 'nuclear')).toMatchObject({
    ok: false,
    limit: 1,
    nextIncreaseQuest: 10,
  });
  expect(getFacilityPermit(state, 'nuclear').message).toContain('퀘스트 10');
});

test('existing over-cap saves retain buildings but cannot place another one', () => {
  const state = new GameState();
  state.questIndex = 1;
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[1] = { type: 'residential', level: 1 };
  state.grid[2] = { type: 'residential', level: 1 };
  expect(state.grid.filter(Boolean)).toHaveLength(3);
  expect(getFacilityPermit(state, 'residential')).toMatchObject({ ok: false, current: 3, limit: 2 });
});

test('nuclear needs thermal reserve and the last supporting thermal cannot be demolished', () => {
  expect(validateGridFacilityDependencies([{ type: 'nuclear', level: 1 }])).toMatchObject({
    ok: false,
    reason: 'thermal_reserve_required',
  });

  const state = new GameState();
  state.grid[0] = { type: 'thermal', level: 1 };
  state.grid[1] = { type: 'nuclear', level: 1 };
  expect(validateDemolitionPermit(state, 0)).toMatchObject({
    ok: false,
    reason: 'last_thermal_supports_nuclear',
  });
  expect(validateDemolitionPermit(state, 1)).toMatchObject({ ok: true });
});

test('a residence cannot be demolished when it would leave facilities understaffed', () => {
  const state = new GameState();
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[1] = { type: 'factory', level: 1 };
  state.grid[2] = { type: 'data', level: 1 };

  expect(validateDemolitionPermit(state, 0)).toMatchObject({
    ok: false,
    reason: 'workforce_shortage_after_demolition',
    capacity: 0,
    used: 7,
    shortage: 7,
  });
});

test('a legacy understaffed save can demolish a staffed facility to recover', () => {
  const state = new GameState();
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[1] = { type: 'nuclear', level: 3 };
  state.grid[2] = { type: 'thermal', level: 1 };

  expect(validateDemolitionPermit(state, 1)).toMatchObject({ ok: true });
});
