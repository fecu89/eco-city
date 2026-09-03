import { test, expect } from '@playwright/test';
import { FACILITIES, TIDAL_RULES } from '../../../src/core/Constants.js';
import { GameState } from '../../../src/core/GameState.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';
import {
  createEnvironment,
  isCoastalCell,
  tidalFactor,
  tidalSiteInfo,
} from '../../../src/systems/EnvironmentSystem.js';
import {
  cellZoneTrait,
  constructionCostForCell,
  expansionGroups,
  expansionUpkeep,
  zoneModifierForCell,
} from '../../../src/systems/ZoneSystem.js';
import { expandBoard, placementPreview, validatePlacement } from '../../../src/systems/BoardSystem.js';
import { buildCityModifierContext, effectiveFacilityStats } from '../../../src/systems/CityModifierSystem.js';
import { settleEconomy } from '../../../src/systems/EconomySystem.js';

test('outer ring splits deterministically into nine east and nine west cells by world x', () => {
  const coords = createHexCoordinates(3);
  const groups = expansionGroups(coords);
  expect(groups.east).toHaveLength(9);
  expect(groups.west).toHaveLength(9);
  expect(new Set([...groups.east, ...groups.west]).size).toBe(18);
  expect(groups.east.every((index) => coords[index].q + coords[index].r / 2 > 0)).toBe(true);
  expect(groups.west.every((index) => coords[index].q + coords[index].r / 2 < 0)).toBe(true);
});

test('first expansion activates only the chosen side and second expansion opens the remainder', () => {
  const state = new GameState();
  const groups = expansionGroups(createHexCoordinates(3));
  expect(expandBoard(state, 'east')).toMatchObject({ ok: true, side: 'east', phase: 1 });
  expect(state.grid).toHaveLength(37);
  expect(state.expansion.activeCellIndices).toHaveLength(28);
  expect(validatePlacement(state, 'residential', groups.west[0])).toMatchObject({
    ok: false,
    reason: 'inactive_expansion',
  });
  expect(validatePlacement(state, 'residential', groups.east[0]).reason).not.toBe('inactive_expansion');

  expect(expandBoard(state, 'west')).toMatchObject({ ok: true, side: 'west', phase: 2 });
  expect(state.expansion.activeCellIndices).toHaveLength(37);
});

test('zone traits alter matching output and construction costs without affecting other facilities', () => {
  const state = new GameState();
  expandBoard(state, 'east');
  const coords = createHexCoordinates(3);
  const groups = expansionGroups(coords);
  const solarIndex = groups.east.find((index) => cellZoneTrait(state, index) === 'solar');
  const residentialIndex = groups.east.find((index) => cellZoneTrait(state, index) === 'residential');
  expect(solarIndex).toBeDefined();
  expect(residentialIndex).toBeDefined();

  const solar = { type: 'solar', level: 1 };
  const solarStats = effectiveFacilityStats(solar, zoneModifierForCell(state, solarIndex, 'solar'));
  expect(solarStats.supply).toBeCloseTo(FACILITIES.solar.supply * 1.2);
  expect(constructionCostForCell(state, residentialIndex, 'factory')).toBeCloseTo(FACILITIES.factory.cost * 1.2);
  expect(constructionCostForCell(state, residentialIndex, 'residential')).toBe(FACILITIES.residential.cost);

  expandBoard(state, 'west');
  const industrialIndex = groups.west.find((index) => cellZoneTrait(state, index) === 'industrial');
  const windIndex = groups.west.find((index) => cellZoneTrait(state, index) === 'wind');
  expect(constructionCostForCell(state, industrialIndex, 'factory')).toBeCloseTo(FACILITIES.factory.cost * 0.85);
  const wind = { type: 'wind', level: 1 };
  expect(effectiveFacilityStats(wind, zoneModifierForCell(state, windIndex, 'wind')).supply)
    .toBeCloseTo(FACILITIES.wind.supply * 1.2);
});

test('expansion upkeep is zero, one, then two point five credits per hour', () => {
  const state = new GameState();
  expect(expansionUpkeep(state)).toBe(0);
  expandBoard(state, 'east');
  expect(expansionUpkeep(state)).toBe(1);
  let modifierContext = buildCityModifierContext(state);
  expect(settleEconomy({ grid: state.grid, credits: 10, modifierContext }).expansionUpkeep).toBe(1);
  expandBoard(state, 'west');
  expect(expansionUpkeep(state)).toBe(2.5);
  modifierContext = buildCityModifierContext(state);
  expect(settleEconomy({ grid: state.grid, credits: 10, modifierContext }).netCredits).toBe(-2.5);
});

test('each expansion side exposes a benefit and a competing placement consequence', () => {
  const state = new GameState();
  expandBoard(state, 'east');
  const eastTraits = new Set(state.expansion.activeCellIndices.map((index) => cellZoneTrait(state, index)).filter(Boolean));
  expect(eastTraits).toEqual(new Set(['solar', 'residential']));
  expect(constructionCostForCell(state, state.expansion.activeCellIndices.find((i) => cellZoneTrait(state, i) === 'residential'), 'thermal'))
    .toBeGreaterThan(FACILITIES.thermal.cost);

  expandBoard(state, 'west');
  const westTraits = new Set(state.expansion.activeCellIndices.map((index) => cellZoneTrait(state, index)).filter(Boolean));
  expect(westTraits).toEqual(new Set(['solar', 'residential', 'wind', 'industrial']));
  expect(zoneModifierForCell(state, state.expansion.activeCellIndices.find((i) => cellZoneTrait(state, i) === 'industrial'), 'residential').healthCostFlat)
    .toBeGreaterThan(0);
});

test('renewable placement preview keeps the solar and wind zone bonuses and drops the tidal sites', () => {
  const state = new GameState();
  expandBoard(state, 'east');
  expandBoard(state, 'west');
  state.unlockedFacilities.add('tidal');
  state.research.techLevels.tidal = 1;
  // 조력 건설 허가는 10단계('해안 조력 실증')부터 1기다. 1단계 상태로는 시설 허가에서
  // 먼저 막혀 지형 보너스 판정에 닿지 못한다.
  state.questIndex = 10;
  const coords = createHexCoordinates(3);
  const emptyGrid = Array(37).fill(null);

  const solar = placementPreview('solar', emptyGrid, coords, state);
  const wind = placementPreview('wind', emptyGrid, coords, state);
  const tidal = placementPreview('tidal', emptyGrid, coords, state);

  expect(solar.siteBenefits).toBeInstanceOf(Map);
  expect(wind.siteBenefits).toBeInstanceOf(Map);
  expect([...solar.siteBenefits.values()].map(({ type }) => type)).toEqual(Array(5).fill('solar'));
  expect([...wind.siteBenefits.values()].map(({ type }) => type)).toEqual(Array(5).fill('wind'));
  // 조력 우수 입지는 사라졌다. 출력은 이제 해안 칸마다 다른 조수간만의 차가 정한다.
  expect(tidal.siteBenefits.size).toBe(0);
});

test('조력은 해안 칸에만 지을 수 있고 내륙은 이유를 밝혀 막는다', () => {
  const state = new GameState();
  expandBoard(state, 'east');
  expandBoard(state, 'west');
  state.environment = createEnvironment(20400101);
  state.unlockedFacilities.add('tidal');
  state.research.techLevels.tidal = 1;
  state.questIndex = 10;
  state.credits = 20;
  const coords = createHexCoordinates(3);

  const inland = coords.map((_, index) => index).find((index) => !isCoastalCell(index));
  expect(validatePlacement(state, 'tidal', inland)).toMatchObject({
    ok: false,
    reason: 'coastal_required',
    message: '조력발전은 바다와 맞닿은 해안 칸에만 지을 수 있습니다.',
  });

  const coastal = coords.map((_, index) => index).filter(isCoastalCell);
  expect(coastal).toHaveLength(18);
  coastal.forEach((index) => {
    expect(validatePlacement(state, 'tidal', index), `cell ${index}`).toMatchObject({ ok: true });
    expect(zoneModifierForCell(state, index, 'tidal')).toEqual({});
  });
});

test('해안 입지 안내는 그 칸의 조차와 출력 배율을 알려준다', () => {
  const state = new GameState();
  expandBoard(state, 'east');
  expandBoard(state, 'west');
  state.environment = createEnvironment(20400101);
  const coords = createHexCoordinates(3);
  const coastal = coords.map((_, index) => index).filter(isCoastalCell);

  coastal.forEach((index) => {
    const info = tidalSiteInfo(state, index);
    expect(info.range).toBe(state.environment.tidalRanges[index]);
    expect(info.factor).toBeCloseTo(tidalFactor(state, index), 10);
    expect(info.label).toBe(TIDAL_RULES.LABEL(info.range, info.factor));
  });
  // 씨앗 20400101에서 19번 칸은 조차 2.6m — 기준(5m)의 절반이라 출력도 52%다.
  expect(tidalSiteInfo(state, 19)).toMatchObject({ range: 2.6, factor: 0.52, label: '조차 2.6m · 출력 52%' });
  expect(tidalSiteInfo(state, 0)).toBeNull();
});
