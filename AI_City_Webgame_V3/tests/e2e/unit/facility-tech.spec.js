import { test, expect } from '@playwright/test';
import { FACILITIES } from '../../../src/core/Constants.js';
import { gameState } from '../../../src/core/GameState.js';
import {
  expandBoard,
  placeFacility,
  validatePlacement,
  validateUpgrade,
  upgradeRequirementMessage,
  facilityUnlockMessage,
  demolishCell,
  upgradeCell,
} from '../../../src/systems/BoardSystem.js';
import { evaluateCurrentQuest } from '../../../src/systems/QuestSystem.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';
import { isCoastalCell } from '../../../src/systems/EnvironmentSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';
import { completeResearchJob, startResearch } from '../../../src/systems/ResearchSystem.js';
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
  gameState.claimedQuestIds.add('extreme-heat');
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

test('placement validator and placement command share tidal coastal rules and cost', () => {
  gameState.credits = 20;
  gameState.questIndex = 11;
  gameState.unlockedFacilities.add('tidal');
  gameState.research.techLevels.tidal = 1;
  gameState.selectedFacility = 'tidal';
  // 조력은 바다와 맞닿은 3링에만 설 수 있으므로 확장한 37칸 보드가 필요하다.
  expandBoard(gameState, 'east');
  expandBoard(gameState, 'west');
  const coords = createHexCoordinates(3);
  const coastal = coords.findIndex((_, index) => isCoastalCell(index));
  const inland = coords.findIndex((_, index) => !isCoastalCell(index));
  expect(validatePlacement(gameState, 'tidal', inland)).toMatchObject({ ok: false, reason: 'coastal_required' });
  expect(validatePlacement(gameState, 'tidal', coastal)).toMatchObject({ ok: true });
  expect(placeFacility(coastal)).toMatchObject({ ok: true, index: coastal, key: 'tidal' });
  expect(gameState.grid[coastal].project).toMatchObject({ kind: 'build', durationDays: 15, elapsedDays: 0 });
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
  // 태양광은 퀘스트 보상이 아니라 6단계 뒤 첫 확장 방향(동부)으로 열린다.
  expect(facilityUnlockMessage(gameState, 'solar')).toContain('퀘스트 6');
  expect(facilityUnlockMessage(gameState, 'solar')).toContain('동부 확장');
  // 방향을 고르고 나면 반대편 재생에너지는 8단계 보상이 실제 다음 행동이다.
  gameState.expansion.firstChoice = 'east';
  expect(facilityUnlockMessage(gameState, 'wind')).toContain('퀘스트 8');
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
  expect(economy.dailyCarbon).toBe(0);
  expect(economy.dailyWater).toBe(1);
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

test('green upgrades require their dedicated research after the city permit', () => {
  gameState.questIndex = 8;
  gameState.credits = 100;
  gameState.upgradePermitLevel = 2;
  gameState.grid[0] = { type: 'green', level: 1 };

  const locked = validateUpgrade(gameState, 0);
  expect(locked).toMatchObject({ ok: false, reason: 'technology_required', requiredLevel: 2 });
  expect(upgradeRequirementMessage(gameState, locked)).toContain('도시 수관 네트워크');

  gameState.research.completedIds.add('green2');
  gameState.research.techLevels.green = 2;
  expect(validateUpgrade(gameState, 0)).toMatchObject({ ok: true, nextLevel: 2 });
});

// 8단계는 '데이터센터 현대화'다 — 스마트 전력망 연구와 가동 가능한 데이터센터 Lv.2를 함께 요구한다.
// "연구가 강화를 열고, 공사가 끝나야 조건이 성립한다"는 원래 구조는 그대로 두고 대상만 현재 퀘스트에 맞춘다.
test('completed smart grid research can upgrade the data center and satisfy quest 8', () => {
  gameState.stage = 5;
  gameState.questIndex = 8;
  gameState.grid[0] = { type: 'data', level: 1 };
  gameState.grid[1] = { type: 'residential', level: 1 };
  gameState.credits = 100;
  gameState.upgradePermitLevel = 2;
  gameState.research.completedIds.add('smartGrid');
  expect(evaluateCurrentQuest(gameState).ready).toBe(false);
  expect(validateUpgrade(gameState, 0)).toMatchObject({ ok: true, nextLevel: 2 });
  expect(upgradeCell(0)).toMatchObject({ ok: true, level: 1, targetLevel: 2, durationDays: 8 });
  expect(gameState.grid[0]).toMatchObject({ level: 1, project: { kind: 'upgrade', fromLevel: 1, toLevel: 2 } });
  expect(evaluateCurrentQuest(gameState).ready).toBe(false);
  for (let day = 0; day < 8; day++) advanceConstructionProjects(gameState);
  expect(gameState.grid[0]).toMatchObject({ level: 2, project: null });
  expect(evaluateCurrentQuest(gameState).ready).toBe(true);

  // 같은 규칙이 재생에너지에도 적용된다 — 연구를 마친 시설만 Lv.2로 올릴 수 있다.
  // 태양광 Lv.2는 인력을 더 쓰므로 주거지를 한 채 더 두어 인력 부족이 판정을 가리지 않게 한다.
  gameState.grid[3] = { type: 'residential', level: 1 };
  gameState.grid[2] = { type: 'solar', level: 1 };
  expect(validateUpgrade(gameState, 2)).toMatchObject({ ok: false, reason: 'technology_required' });
  gameState.research.completedIds.add('solar2');
  gameState.research.techLevels.solar = 2;
  expect(validateUpgrade(gameState, 2)).toMatchObject({ ok: true, nextLevel: 2 });
});

test('a facility with an active project cannot be upgraded or demolished again', () => {
  gameState.credits = 100;
  gameState.upgradePermitLevel = 2;
  gameState.grid[0] = { type: 'residential', level: 1 };
  expect(upgradeCell(0)).toMatchObject({ ok: true, targetLevel: 2 });
  expect(validateUpgrade(gameState, 0)).toMatchObject({ ok: false, reason: 'project_in_progress' });
  expect(demolishCell(0)).toMatchObject({ ok: false, reason: 'project_in_progress' });
});

test('a data center assigned to active research cannot start an upgrade', () => {
  gameState.credits = 100;
  gameState.upgradePermitLevel = 2;
  gameState.researchMenuUnlocked = true;
  gameState.unlockedFacilities.add('solar');
  gameState.grid[0] = { type: 'data', level: 1 };

  expect(startResearch(gameState, 'solar2', 0)).toMatchObject({ ok: true, dataCenterIndex: 0 });
  const validation = validateUpgrade(gameState, 0);

  expect(validation).toMatchObject({ ok: false, reason: 'research_in_progress' });
  expect(upgradeRequirementMessage(gameState, validation)).toContain('연구를 완료하거나 취소');
  expect(upgradeCell(0)).toMatchObject({ ok: false, reason: 'research_in_progress' });
  expect(gameState.grid[0].project).toBeUndefined();
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
    capacity: 6,
    used: 12,
    shortage: 6,
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
      elapsedEffectiveDays: 180,
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

test('level-three permits open in climate preparation order and every facility is permitted by quest thirteen', () => {
  const validationFor = (type, questIndex) => {
    gameState.reset();
    gameState.questIndex = questIndex;
    gameState.upgradePermitLevel = 2;
    gameState.credits = 500;
    gameState.research.techLevels = {
      solar: 3, wind: 3, battery: 3, tidal: 3, green: 3,
    };
    gameState.grid = Array(19).fill(null);
    if (type === 'residential') {
      gameState.grid[0] = { type, level: 2 };
      return validateUpgrade(gameState, 0);
    }
    gameState.grid[0] = { type: 'residential', level: 3 };
    gameState.grid[1] = { type, level: 2 };
    return validateUpgrade(gameState, 1);
  };

  for (const type of ['thermal', 'nuclear', 'wind']) {
    expect(validationFor(type, 10), `${type} before quest 10 claim`).toMatchObject({
      ok: false, reason: 'city_permit_required',
    });
    expect(validationFor(type, 11), `${type} after quest 10 claim`).toMatchObject({ ok: true, nextLevel: 3 });
  }

  for (const type of ['solar', 'tidal']) {
    expect(validationFor(type, 11), `${type} before quest 11 claim`).toMatchObject({
      ok: false, reason: 'city_permit_required',
    });
    expect(validationFor(type, 12), `${type} after quest 11 claim`).toMatchObject({ ok: true, nextLevel: 3 });
  }

  expect(validationFor('factory', 12)).toMatchObject({ ok: false, reason: 'city_permit_required' });
  for (const type of Object.keys(FACILITIES)) {
    expect(validationFor(type, 13), `${type} at quest 13`).toMatchObject({ ok: true, nextLevel: 3 });
  }
});

test('level-three permit messages name the quest that unlocks the selected facility', () => {
  gameState.credits = 500;
  gameState.upgradePermitLevel = 2;
  gameState.research.techLevels = { solar: 3, wind: 3, battery: 3, tidal: 3, green: 3 };
  gameState.grid[0] = { type: 'thermal', level: 2 };
  expect(upgradeRequirementMessage(gameState, validateUpgrade(gameState, 0))).toContain('퀘스트 10');

  gameState.grid[0] = { type: 'solar', level: 2 };
  expect(upgradeRequirementMessage(gameState, validateUpgrade(gameState, 0))).toContain('퀘스트 11');

  gameState.grid[0] = { type: 'factory', level: 2 };
  expect(upgradeRequirementMessage(gameState, validateUpgrade(gameState, 0))).toContain('퀘스트 12');
});
