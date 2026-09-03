import { BOARD, COOLING_RULES, ECONOMY_RULES, FACILITY_GROUPS } from '../core/Constants.js';
import { createHexCoordinates, hexDistance } from './HexGridSystem.js';
import { effectiveFacilityStats, facilityModifierAt } from './CityModifierSystem.js';
import { operationProfileForCell, operationalGrid } from './ConstructionProjectSystem.js';

const round2 = (value) => Math.round(value * 100) / 100;
// 순환냉각의 수혜 시설은 COOLING_RULES의 감축량 표에 행이 있는 시설이다.
const COOLED_TYPES = Object.freeze(Object.keys(COOLING_RULES.TARGET_WATER_REDUCTION_PER_LEVEL));

function safeLevel(cell) {
  return Math.max(1, Math.min(3, Math.trunc(Number(cell?.level) || 1)));
}

function topologyFor(grid, coords) {
  if (coords) return coords;
  if (grid.length === BOARD.INITIAL_CELLS) return createHexCoordinates(BOARD.INITIAL_RADIUS);
  if (grid.length === BOARD.EXPANDED_CELLS) return createHexCoordinates(BOARD.EXPANDED_RADIUS);
  return [];
}

function strongestCoolingSupport(grid, index, coords, facilityOperations) {
  if (!coords.length) return 0;
  return grid.reduce((strongest, cooler, coolerIndex) => {
    if (cooler?.type !== 'cooling') return strongest;
    const coolerLevel = safeLevel(cooler);
    const tileDistance = hexDistance(coords[index], coords[coolerIndex]);
    if (tileDistance !== 1 && !(
      tileDistance === COOLING_RULES.EXTENDED_RANGE_DISTANCE
      && coolerLevel >= COOLING_RULES.EXTENDED_RANGE_LEVEL
    )) return strongest;
    const powerRatio = Math.max(0, Math.min(1, Number(facilityOperations[coolerIndex]?.powerRatio) || 0));
    const levelBonus = coolerLevel >= COOLING_RULES.BONUS_LEVEL ? COOLING_RULES.LEVEL_TWO_EFFECT_MULTIPLIER : 1;
    const rangeMultiplier = tileDistance === COOLING_RULES.EXTENDED_RANGE_DISTANCE
      ? COOLING_RULES.EXTENDED_RANGE_MULTIPLIER
      : 1;
    const projectMultiplier = operationProfileForCell(cooler).functionality;
    return Math.max(strongest, powerRatio * levelBonus * rangeMultiplier * projectMultiplier);
  }, 0);
}

export function facilityLevelStats(cell) {
  return effectiveFacilityStats(cell);
}

export function calculateEnvironmentalOperations({
  grid,
  coords = null,
  facilityOperations = {},
  modifierContext = null,
}) {
  grid = operationalGrid(grid);
  const boardCoords = topologyFor(grid, coords);
  const byFacility = {};
  let dailyCarbon = 0;
  let dailyWater = 0;

  grid.forEach((cell, index) => {
    if (!cell) return;
    const stats = effectiveFacilityStats(cell, facilityModifierAt(modifierContext, index));
    const operation = facilityOperations[index] || {};
    const powerRatio = Math.max(0, Math.min(1, Number(operation.powerRatio) || 0));
    // 화면용 operationRatio는 소수 첫째 자리로 반올림돼 있다. 배출·냉각수는 급전량에
    // 연속적으로 비례해야 하므로 반올림 전 값이 있으면 그것을 쓴다.
    const rawOperationRatio = Number.isFinite(Number(operation.operationRatioRaw))
      ? Number(operation.operationRatioRaw)
      : Number(operation.operationRatio);
    const operationRatio = Math.max(0, Math.min(1, rawOperationRatio || 0));
    // 발전 시설은 대기 운전만으로도 바닥선만큼 배출하고, 그 위로는 급전량에 비례한다.
    const generationRatio = Math.max(ECONOMY_RULES.GENERATION_IDLE_EMISSION_RATIO, operationRatio);
    const carbonFactor = stats.carbon < 0
      ? 1
      : FACILITY_GROUPS.OUTPUT_LINKED_CARBON.includes(cell.type)
        ? operationRatio
        : stats.supply > 0
          ? generationRatio
          : 0;
    let carbon = stats.carbon * carbonFactor;
    let water = stats.water * (stats.demand > 0
      ? powerRatio
      : stats.supply > 0 ? generationRatio : 1);

    if (COOLED_TYPES.includes(cell.type)) {
      const coolingSupport = strongestCoolingSupport(
        grid,
        index,
        boardCoords,
        facilityOperations,
      );
      const effectiveCoolingRatio = Math.min(powerRatio, coolingSupport);
      const coolingEffectiveness = modifierContext?.city?.coolingEffectiveness ?? 1;
      const reduction = COOLING_RULES.TARGET_WATER_REDUCTION_PER_LEVEL[cell.type]
        * safeLevel(cell)
        * effectiveCoolingRatio
        * coolingEffectiveness;
      water = Math.max(0, water - reduction);
    }

    carbon = round2(carbon);
    water = round2(water);
    dailyCarbon += carbon;
    dailyWater += water;
    byFacility[index] = { carbon, water };
  });

  return {
    byFacility,
    dailyCarbon: Math.max(0, round2(dailyCarbon + (Number(modifierContext?.city?.carbonFlat) || 0))),
    dailyWater: Math.max(0, round2(dailyWater)),
  };
}
