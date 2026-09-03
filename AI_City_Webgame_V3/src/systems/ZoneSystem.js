import { BOARD, ECONOMY_RULES, FACILITIES, FACILITY_GROUPS } from '../core/Constants.js';
import {
  ENERGY_SITE_LABELS,
  ENERGY_SITE_OUTPUT_MULTIPLIER,
  EXPANSION_SIDES,
  EXPANSION_UPKEEP,
  ZONE_TRAIT_MODIFIERS,
} from '../core/ZoneDefinitions.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';
import { roundCredits } from '../core/Money.js';
import { createHexCoordinates, expandHexGrid, hexDistance } from './HexGridSystem.js';

const initialIndices = () => Array.from({ length: BOARD.INITIAL_CELLS }, (_, index) => index);

// 6단계 보상 모달을 닫기 전에 새로고침하면 확장 선택이 통째로 사라진다.
// 준비 퀘스트에 들어왔는데 아직 확장하지 않았다면 선택을 다시 물어야 한다.
export function expansionChoicePending(state) {
  return Number(state?.questIndex) >= CAMPAIGN_QUEST_INDEXES.PREPARATION_START
    && (state?.expansion?.phase ?? 0) === 0
    && !state?.gameOver;
}

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
  const unlockedFacility = EXPANSION_SIDES[side].facility;
  state.unlockedFacilities?.add?.(unlockedFacility);
  const addedIndices = activeCellIndices.filter((index) => !previousActive.has(index));
  state.expandedCells = new Set(addedIndices);
  return { ok: true, side, phase, unlockedFacility, addedIndices, activeCellIndices };
}

export function cellZoneTrait(state, index) {
  if (!isExpansionCellActive(state, index) || index < BOARD.INITIAL_CELLS) return null;
  const coord = createHexCoordinates(BOARD.EXPANDED_RADIUS)[index];
  if (!coord) return null;
  const east = coord.q + coord.r / 2 > 0;
  if (east) return coord.r <= 0 ? 'solar' : 'residential';
  return coord.r >= 0 ? 'wind' : 'industrial';
}

// 지역 특성(동부 태양광·서부 풍황)에서 오는 입지 보너스다. 조력은 여기가 아니라
// 해안 칸의 조수간만의 차(EnvironmentSystem.tidalFactor)로 출력이 갈린다.
export function energySiteBenefit(state, index, facilityType) {
  if (!['solar', 'wind'].includes(facilityType) || !isExpansionCellActive(state, index)) return null;
  const coord = createHexCoordinates(BOARD.EXPANDED_RADIUS)[index];
  if (!coord) return null;
  const trait = cellZoneTrait(state, index);
  if (trait !== facilityType) return null;
  return {
    type: facilityType,
    label: ENERGY_SITE_LABELS[facilityType],
    supply: ENERGY_SITE_OUTPUT_MULTIPLIER,
  };
}

export function zoneModifierForCell(state, index, facilityType) {
  const trait = cellZoneTrait(state, index);
  const energySite = energySiteBenefit(state, index, facilityType);
  if (energySite) return { supply: energySite.supply };
  // 지역 특성 배율은 settings.json ZONES.TRAIT_MODIFIERS(ZoneDefinitions.ZONE_TRAIT_MODIFIERS)에 있다.
  if (trait === 'residential') {
    const modifiers = ZONE_TRAIT_MODIFIERS.residential;
    if (facilityType === 'residential') return { income: modifiers.RESIDENTIAL_INCOME };
    if (FACILITY_GROUPS.HEAVY_POLLUTERS.includes(facilityType)) {
      return { buildCostFlat: FACILITIES[facilityType].cost * modifiers.HEAVY_BUILD_COST_RATIO };
    }
  }
  if (trait === 'industrial') {
    const modifiers = ZONE_TRAIT_MODIFIERS.industrial;
    if (facilityType === 'factory') return { buildCostFlat: FACILITIES.factory.cost * modifiers.FACTORY_BUILD_COST_RATIO };
    if (facilityType === 'residential') {
      return { healthCostFlat: ECONOMY_RULES.POLLUTION_HEALTH_COST * modifiers.RESIDENTIAL_HEALTH_COST_RATIO };
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
