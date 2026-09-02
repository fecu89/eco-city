import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { FACILITY_LIMITS_BY_QUEST } from '../../../src/core/Constants.js';
import { expandBoard, validatePlacement } from '../../../src/systems/BoardSystem.js';

const Permits = await import('../../../src/systems/FacilityPermitSystem.js').catch(() => ({}));

const {
  getFacilityLimits,
  getFacilityPermit,
  validateDemolitionPermit,
  validateGridFacilityDependencies,
} = Permits;

test('facility limits expose preparation capacity and never regress through all nineteen quests', () => {
  expect(getFacilityLimits(1)).toMatchObject({ residential: 2 });
  expect(getFacilityLimits(3)).toMatchObject({ green: 1 });
  expect(getFacilityLimits(6)).toMatchObject({ green: 2 });
  expect(getFacilityLimits(7)).toMatchObject({ residential: 7, solar: 2, battery: 2 });
  expect(getFacilityLimits(8)).toMatchObject({ data: 2, solar: 3, wind: 2 });
  expect(getFacilityLimits(9)).toMatchObject({ data: 3, wind: 3, green: 3 });
  expect(getFacilityLimits(10)).toMatchObject({ residential: 8, battery: 3, tidal: 1 });
  expect(getFacilityLimits(11)).toMatchObject({ residential: 8, solar: 3, battery: 3, wind: 3, tidal: 1 });
  expect(getFacilityLimits(5)).toMatchObject({ residential: 5, thermal: 2, nuclear: 1 });
  expect(getFacilityLimits(14)).toMatchObject({ nuclear: 2, solar: 4, battery: 3, green: 3 });
  expect(getFacilityLimits(19)).toMatchObject({ residential: 10, nuclear: 2, solar: 6, tidal: 3 });
});

test('legacy objective state cannot override the single quest-based permit cursor', () => {
  const state = new GameState();
  state.questIndex = 7;
  state.progression.objectiveSetId = 'specialization';
  state.progression.completedObjectiveSetIds = ['transition-choice'];
  state.unlockedFacilities.add('battery');
  state.unlockedFacilities.add('wind');

  expect(getFacilityPermit(state, 'battery')).toMatchObject({ ok: true, limit: 2 });
  // 조력은 10단계에서 처음 열린다. 7단계 커서는 목표 세트와 무관하게 0을 유지해야 한다.
  expect(getFacilityPermit(state, 'tidal')).toMatchObject({ ok: false, limit: 0 });
});

test('the west branch can actually build the wind turbine its quest seven text promises', () => {
  const state = new GameState();
  state.credits = 20;
  const expansion = expandBoard(state, 'west');
  expect(expansion).toMatchObject({ ok: true, unlockedFacility: 'wind' });
  state.questIndex = 7;

  expect(getFacilityLimits(7).wind).toBe(2);
  expect(validatePlacement(state, 'wind', expansion.addedIndices[0])).toMatchObject({ ok: true });
});

test('quest permit rows exist only where they actually raise a limit', () => {
  // 11·12행은 7~10행의 복사본이라 어떤 한도도 올리지 않는다.
  expect(Object.keys(FACILITY_LIMITS_BY_QUEST).map(Number)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19,
  ]);
  expect(getFacilityLimits(11)).toEqual(getFacilityLimits(10));
  expect(getFacilityLimits(12)).toEqual(getFacilityLimits(10));
});

test('final test permits come from quest nineteen even if legacy objective state is present', () => {
  const state = new GameState();
  state.questIndex = 19;
  state.progression.objectiveSetId = 'resilience';
  state.progression.completedObjectiveSetIds = ['transition-choice', 'specialization'];
  state.stressTest.status = 'ready';
  expect(getFacilityPermit(state, 'residential')).toMatchObject({ limit: 10 });
  expect(getFacilityPermit(state, 'solar')).toMatchObject({ limit: 6 });
  expect(getFacilityPermit(state, 'tidal')).toMatchObject({ limit: 3 });
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
    nextIncreaseQuest: 14,
  });
  expect(getFacilityPermit(state, 'nuclear').message).toContain('퀘스트 14');
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

test('claiming the heatwave quest lets a battery replace the last thermal reserve', () => {
  const state = new GameState();
  state.questIndex = 10;
  state.grid[0] = { type: 'thermal', level: 1 };
  state.grid[1] = { type: 'nuclear', level: 1 };
  state.grid[2] = { type: 'battery', level: 1 };

  expect(validateDemolitionPermit(state, 0)).toMatchObject({
    ok: false,
    reason: 'last_thermal_supports_nuclear',
  });

  state.claimedQuestIds.add('extreme-heat');
  expect(validateGridFacilityDependencies(
    state.grid.map((cell, index) => index === 0 ? null : cell),
    state,
  )).toMatchObject({ ok: true, reserveType: 'battery' });
  expect(validateDemolitionPermit(state, 0)).toMatchObject({ ok: true });
});

test('heatwave completion without a remaining battery does not waive nuclear reserve', () => {
  const state = new GameState();
  state.questIndex = 10;
  state.claimedQuestIds.add('extreme-heat');
  state.grid[0] = { type: 'thermal', level: 1 };
  state.grid[1] = { type: 'nuclear', level: 1 };

  expect(validateDemolitionPermit(state, 0)).toMatchObject({
    ok: false,
    reason: 'last_thermal_supports_nuclear',
  });
});

test('the last battery reserve cannot be demolished from a coal-free nuclear grid', () => {
  const state = new GameState();
  state.questIndex = 10;
  state.claimedQuestIds.add('extreme-heat');
  state.grid[0] = { type: 'battery', level: 1 };
  state.grid[1] = { type: 'nuclear', level: 1 };

  expect(validateDemolitionPermit(state, 0)).toMatchObject({
    ok: false,
    reason: 'last_battery_supports_nuclear',
  });
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
    used: 8,
    shortage: 8,
  });
});

test('a legacy understaffed save can demolish a staffed facility to recover', () => {
  const state = new GameState();
  state.grid[0] = { type: 'residential', level: 1 };
  state.grid[1] = { type: 'nuclear', level: 3 };
  state.grid[2] = { type: 'thermal', level: 1 };

  expect(validateDemolitionPermit(state, 1)).toMatchObject({ ok: true });
});
