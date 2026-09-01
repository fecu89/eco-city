import { test, expect } from '@playwright/test';
import { FACILITIES } from '../../../src/core/Constants.js';
import { gameState } from '../../../src/core/GameState.js';
import {
  placeFacility,
  validatePlacement,
  validateUpgrade,
  upgradeRequirementMessage,
  facilityUnlockMessage,
  demolishCell,
  upgradeCell,
} from '../../../src/systems/BoardSystem.js';
import { evaluateCurrentQuest } from '../../../src/systems/QuestSystem.js';
import { createHexCoordinates, isOuterRing } from '../../../src/systems/HexGridSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { completeResearchJob } from '../../../src/systems/ResearchSystem.js';
import { advanceConstructionProjects } from '../../../src/systems/ConstructionProjectSystem.js';

test.beforeEach(() => gameState.reset());

test('board placement enforces quest capacity and thermal reserve for nuclear', () => {
  gameState.credits = 100;
  gameState.grid[0] = { type: 'residential', level: 1 };
  gameState.grid[1] = { type: 'residential', level: 1 };
  expect(validatePlacement(gameState, 'residential', 2)).toMatchObject({
    ok: false,
    reason: 'facility_limit',
  });

  gameState.questIndex = 5;
  gameState.unlockedFacilities.add('nuclear');
  expect(validatePlacement(gameState, 'nuclear', 2)).toMatchObject({
    ok: false,
    reason: 'thermal_reserve_required',
  });
  gameState.grid[3] = { type: 'thermal', level: 1 };
  expect(validatePlacement(gameState, 'nuclear', 2)).toMatchObject({ ok: true });
});

test('a proven storage hub can reserve a newly placed nuclear facility without thermal', () => {
  gameState.credits = 100;
  gameState.questIndex = 10;
  gameState.unlockedFacilities.add('nuclear');
  gameState.claimedQuestIds.add('storage-hub');
  gameState.grid[0] = { type: 'residential', level: 1 };
  gameState.grid[1] = { type: 'battery', level: 1 };

  expect(validatePlacement(gameState, 'nuclear', 2)).toMatchObject({ ok: true });
});

test('a valid nuclear reserve never bypasses the construction credit check', () => {
  gameState.credits = 0;
  gameState.questIndex = 5;
  gameState.unlockedFacilities.add('nuclear');
  gameState.grid[0] = { type: 'thermal', level: 1 };

  expect(validatePlacement(gameState, 'nuclear', 1)).toMatchObject({
    ok: false,
    reason: 'insufficient_credits',
  });
});

test('board demolition command preserves the last thermal reserve while nuclear remains', () => {
  gameState.grid[0] = { type: 'thermal', level: 1 };
  gameState.grid[1] = { type: 'nuclear', level: 1 };
  expect(demolishCell(0)).toMatchObject({ ok: false, reason: 'last_thermal_supports_nuclear' });
  expect(gameState.grid[0]?.type).toBe('thermal');
});

test('placement validator and placement command share tidal outer-ring rules and cost', () => {
  gameState.credits = 20;
  gameState.questIndex = 11;
  gameState.unlockedFacilities.add('tidal');
  gameState.research.techLevels.tidal = 1;
  gameState.selectedFacility = 'tidal';
  const coords = createHexCoordinates(2);
  const outer = coords.findIndex((_, index) => isOuterRing(index, coords, 2));
  expect(validatePlacement(gameState, 'tidal', 0)).toMatchObject({ ok: false, reason: 'outer_ring_only' });
  expect(validatePlacement(gameState, 'tidal', outer)).toMatchObject({ ok: true });
  expect(placeFacility(outer)).toMatchObject({ ok: true, index: outer, key: 'tidal' });
  expect(gameState.grid[outer].project).toMatchObject({ kind: 'build', durationHours: 15, elapsedHours: 0 });
  expect(gameState.credits).toBe(13);
  expect(FACILITIES.tidal).toMatchObject({ cost: 7, supply: 10, carbon: 0, water: 0 });
});

test('permit, technology, credit, and facility locks explain the exact next action', () => {
  gameState.grid[0] = { type: 'solar', level: 1 };
  gameState.upgradePermitLevel = 1;
  gameState.research.techLevels.solar = 2;
  expect(upgradeRequirementMessage(gameState, validateUpgrade(gameState, 0))).toContain('퀘스트 7');
  gameState.upgradePermitLevel = 2;
  gameState.research.techLevels.solar = 1;
  expect(upgradeRequirementMessage(gameState, validateUpgrade(gameState, 0))).toContain('고효율 태양전지');
  gameState.research.techLevels.solar = 2;
  gameState.credits = 0;
  expect(upgradeRequirementMessage(gameState, validateUpgrade(gameState, 0))).toContain('크레딧');
  expect(facilityUnlockMessage(gameState, 'solar')).toContain('퀘스트 6');
  expect(facilityUnlockMessage(gameState, 'tidal')).toContain('조력 발전 실증');
});

test('tidal generation is stable at every hour and costs 0.3 credits per hour', () => {
  const coords = createHexCoordinates(2);
  const grid = Array(19).fill(null);
  grid[7] = { type: 'tidal', level: 1 };
  grid[0] = { type: 'residential', level: 1 };
  for (const hour of [0, 6, 12, 23]) {
    const power = calculatePowerNetwork({ grid, coords, hour, tickIndex: hour });
    expect(power.facilityPower[0].ratio).toBe(1);
  }
  const economy = settleEconomy({ grid, coords, facilityPower: { 0: { ratio: 1 } }, credits: 10 });
  expect(economy.facilityEconomy[7].upkeep).toBe(0.3);
  expect(economy.hourlyCarbon).toBe(0);
  expect(economy.hourlyWater).toBe(1);
});

test('renewable upgrades report city permit, technology, and credit gates independently', () => {
  gameState.grid[0] = { type: 'solar', level: 1 };
  gameState.credits = 100;
  gameState.upgradePermitLevel = 1;
  gameState.research.techLevels.solar = 2;
  expect(validateUpgrade(gameState, 0)).toMatchObject({ ok: false, reason: 'city_permit_required' });

  gameState.upgradePermitLevel = 2;
  gameState.research.techLevels.solar = 1;
  expect(validateUpgrade(gameState, 0)).toMatchObject({ ok: false, reason: 'technology_required' });

  gameState.research.techLevels.solar = 2;
  gameState.credits = 0;
  expect(validateUpgrade(gameState, 0)).toMatchObject({ ok: false, reason: 'insufficient_credits' });
});

test('completed solar research can upgrade solar and satisfy quest 8', () => {
  gameState.stage = 5;
  gameState.questIndex = 8;
  gameState.questProgress.quizPassed = true;
  gameState.grid[0] = { type: 'solar', level: 1 };
  gameState.grid[1] = { type: 'residential', level: 1 };
  gameState.credits = 100;
  gameState.upgradePermitLevel = 2;
  gameState.research.completedIds.add('solar2');
  gameState.research.techLevels.solar = 2;
  expect(validateUpgrade(gameState, 0)).toMatchObject({ ok: true, nextLevel: 2 });
  expect(upgradeCell(0)).toMatchObject({ ok: true, level: 1, targetLevel: 2, durationHours: 8 });
  expect(gameState.grid[0]).toMatchObject({ level: 1, project: { kind: 'upgrade', fromLevel: 1, toLevel: 2 } });
  expect(evaluateCurrentQuest(gameState).ready).toBe(false);
  for (let hour = 0; hour < 8; hour++) advanceConstructionProjects(gameState);
  expect(gameState.grid[0]).toMatchObject({ level: 2, project: null });
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);
});

test('a facility with an active project cannot be upgraded or demolished again', () => {
  gameState.credits = 100;
  gameState.upgradePermitLevel = 2;
  gameState.grid[0] = { type: 'residential', level: 1, operationMode: 'normal' };
  expect(upgradeCell(0)).toMatchObject({ ok: true, targetLevel: 2 });
  expect(validateUpgrade(gameState, 0)).toMatchObject({ ok: false, reason: 'project_in_progress' });
  expect(demolishCell(0)).toMatchObject({ ok: false, reason: 'project_in_progress' });
});

test('an upgrade is blocked when its extra staff would exceed the resident population', () => {
  gameState.questIndex = 7;
  gameState.credits = 100;
  gameState.upgradePermitLevel = 2;
  gameState.grid[0] = { type: 'residential', level: 1 };
  gameState.grid[1] = { type: 'nuclear', level: 1 };
  gameState.grid[2] = { type: 'factory', level: 1 };

  const validation = validateUpgrade(gameState, 2);
  expect(validation).toMatchObject({
    ok: false,
    reason: 'insufficient_workforce',
    capacity: 10,
    used: 11,
    shortage: 1,
  });
  expect(upgradeRequirementMessage(gameState, validation)).toContain('주거지');
});

test('level-three renewable upgrades require and receive their own branch research', () => {
  gameState.credits = 500;
  gameState.upgradePermitLevel = 3;
  gameState.research.completedIds = new Set(['solar2', 'wind2', 'battery2']);
  gameState.research.techLevels = { solar: 2, wind: 2, battery: 2, tidal: 1 };
  for (const researchId of ['solar3', 'wind3', 'battery3']) {
    gameState.research.jobs[researchId] = {
      id: researchId,
      dataCenterIndex: 5,
      elapsedEffectiveHours: 180,
      paidCost: 20,
    };
    completeResearchJob(gameState, researchId);
  }

  expect(gameState.research.techLevels).toEqual({ solar: 3, wind: 3, battery: 3, tidal: 1 });
  for (const type of ['solar', 'wind', 'battery']) {
    gameState.grid = Array(19).fill(null);
    gameState.grid[0] = { type: 'residential', level: 3, priority: 'essential' };
    gameState.grid[1] = { type, level: 2, priority: 'normal' };
    expect(validateUpgrade(gameState, 1), type).toMatchObject({ ok: true, nextLevel: 3 });
  }
});
