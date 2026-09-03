import { test, expect } from '@playwright/test';
import { FACILITIES } from '../../../src/core/Constants.js';
import { GameState } from '../../../src/core/GameState.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';
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

  const solar = { type: 'solar', level: 1, operationMode: 'normal' };
  const solarStats = effectiveFacilityStats(solar, zoneModifierForCell(state, solarIndex, 'solar'));
  expect(solarStats.supply).toBeCloseTo(FACILITIES.solar.supply * 1.2);
  expect(constructionCostForCell(state, residentialIndex, 'factory')).toBeCloseTo(FACILITIES.factory.cost * 1.2);
  expect(constructionCostForCell(state, residentialIndex, 'residential')).toBe(FACILITIES.residential.cost);

  expandBoard(state, 'west');
  const industrialIndex = groups.west.find((index) => cellZoneTrait(state, index) === 'industrial');
  const windIndex = groups.west.find((index) => cellZoneTrait(state, index) === 'wind');
  expect(constructionCostForCell(state, industrialIndex, 'factory')).toBeCloseTo(FACILITIES.factory.cost * 0.85);
  const wind = { type: 'wind', level: 1, operationMode: 'normal' };
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

test('renewable placement preview uses real solar wind and three tidal site bonuses', () => {
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
  expect(tidal.siteBenefits).toBeInstanceOf(Map);
  expect([...solar.siteBenefits.values()].map(({ type }) => type)).toEqual(Array(5).fill('solar'));
  expect([...wind.siteBenefits.values()].map(({ type }) => type)).toEqual(Array(5).fill('wind'));
  expect([...tidal.siteBenefits.values()].map(({ type }) => type)).toEqual(Array(3).fill('tidal'));

  const tidalSites = [...tidal.siteBenefits.keys()];
  tidalSites.forEach((index) => {
    expect(zoneModifierForCell(state, index, 'tidal')).toMatchObject({ supply: 1.2 });
    expect(validatePlacement(state, 'tidal', index)).toMatchObject({ ok: true });
  });
  const ordinaryCoast = expansionGroups(coords).east
    .concat(expansionGroups(coords).west)
    .find((index) => !tidal.siteBenefits.has(index));
  expect(validatePlacement(state, 'tidal', ordinaryCoast)).toMatchObject({ ok: true });
  expect(zoneModifierForCell(state, ordinaryCoast, 'tidal')).toEqual({});
});
