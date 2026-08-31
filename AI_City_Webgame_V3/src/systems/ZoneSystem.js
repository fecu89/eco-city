import { BOARD, ECONOMY_RULES, FACILITIES } from '../core/Constants.js';
import { EXPANSION_UPKEEP } from '../core/ZoneDefinitions.js';
import { roundCredits } from '../core/Money.js';
import { createHexCoordinates, expandHexGrid, hexDistance } from './HexGridSystem.js';

const initialIndices = () => Array.from({ length: BOARD.INITIAL_CELLS }, (_, index) => index);

export function expansionGroups(coords = createHexCoordinates(BOARD.EXPANDED_RADIUS)) {
  const outer = coords
    .map((coord, index) => ({ coord, index }))
    .filter(({ coord }) => hexDistance(coord, { q: 0, r: 0 }) === BOARD.EXPANDED_RADIUS);
  return {
    east: outer.filter(({ coord }) => coord.q + coord.r / 2 > 0).map(({ index }) => index),
    west: outer.filter(({ coord }) => coord.q + coord.r / 2 < 0).map(({ index }) => index),
  };
}

export function isExpansionCellActive(state, index) {
  if (index < BOARD.INITIAL_CELLS) return true;
  return new Set(state.expansion?.activeCellIndices || initialIndices()).has(index);
}

export function activateExpansionSide(state, side) {
  const groups = expansionGroups();
  if (!groups[side]) return { ok: false, reason: 'invalid_side' };
  state.expansion ||= { phase: 0, firstChoice: null, activeCellIndices: initialIndices() };
  const previousActive = new Set(state.expansion.activeCellIndices || initialIndices());
  if (state.boardRadius < BOARD.EXPANDED_RADIUS) {
    state.grid = expandHexGrid(state.grid, state.boardRadius, BOARD.EXPANDED_RADIUS);
    state.boardRadius = BOARD.EXPANDED_RADIUS;
  }
  if (state.expansion.phase >= 2) return { ok: false, reason: 'already_expanded' };
  if (state.expansion.phase === 1 && state.expansion.firstChoice === side) {
    return { ok: false, reason: 'side_already_active' };
  }
  const phase = state.expansion.phase === 0 ? 1 : 2;
  const activeCellIndices = phase === 1
    ? [...initialIndices(), ...groups[side]]
    : Array.from({ length: BOARD.MAX_CELLS }, (_, index) => index);
  state.expansion = {
    ...state.expansion,
    phase,
    firstChoice: state.expansion.firstChoice || side,
    activeCellIndices,
  };
  const addedIndices = activeCellIndices.filter((index) => !previousActive.has(index));
  state.expandedCells = new Set(addedIndices);
  return { ok: true, side, phase, addedIndices, activeCellIndices };
}

export function cellZoneTrait(state, index) {
  if (!isExpansionCellActive(state, index) || index < BOARD.INITIAL_CELLS) return null;
  const coord = createHexCoordinates(BOARD.EXPANDED_RADIUS)[index];
  if (!coord) return null;
  const east = coord.q + coord.r / 2 > 0;
  if (east) return coord.r <= 0 ? 'solar' : 'residential';
  return coord.r >= 0 ? 'wind' : 'industrial';
}

export function zoneModifierForCell(state, index, facilityType) {
  const trait = cellZoneTrait(state, index);
  if (trait === 'solar' && facilityType === 'solar') return { supply: 1.2 };
  if (trait === 'wind' && facilityType === 'wind') return { supply: 1.2 };
  if (trait === 'residential') {
    if (facilityType === 'residential') return { income: 1.15 };
    if (['factory', 'thermal'].includes(facilityType)) {
      return { buildCostFlat: FACILITIES[facilityType].cost * 0.2 };
    }
  }
  if (trait === 'industrial') {
    if (facilityType === 'factory') return { buildCostFlat: -FACILITIES.factory.cost * 0.15 };
    if (facilityType === 'residential') {
      return { healthCostFlat: ECONOMY_RULES.POLLUTION_HEALTH_COST * 0.25 };
    }
  }
  return {};
}

export function constructionCostForCell(state, index, facilityType, extraModifier = null) {
  const base = FACILITIES[facilityType]?.cost || 0;
  const zone = zoneModifierForCell(state, index, facilityType);
  const flat = (Number(zone.buildCostFlat) || 0) + (Number(extraModifier?.buildCostFlat) || 0);
  return roundCredits(Math.max(0, base + flat));
}

export function expansionUpkeep(state) {
  if (state.expansion?.firstChoice === 'legacy_full') return EXPANSION_UPKEEP[2];
  return EXPANSION_UPKEEP[state.expansion?.phase || 0] ?? 0;
}
