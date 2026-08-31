import { createHexCoordinates, hexDistance } from './HexGridSystem.js';
import { effectiveFacilityStats, facilityModifierAt } from './CityModifierSystem.js';

const round2 = (value) => Math.round(value * 100) / 100;

function safeLevel(cell) {
  return Math.max(1, Math.min(3, Math.trunc(Number(cell?.level) || 1)));
}

function topologyFor(grid, coords) {
  if (coords) return coords;
  if (grid.length === 19) return createHexCoordinates(2);
  if (grid.length === 37) return createHexCoordinates(3);
  return [];
}

function strongestCoolingSupport(grid, index, coords, facilityOperations) {
  if (!coords.length) return 0;
  return grid.reduce((strongest, cooler, coolerIndex) => {
    if (cooler?.type !== 'cooling') return strongest;
    const coolerLevel = safeLevel(cooler);
    const tileDistance = hexDistance(coords[index], coords[coolerIndex]);
    if (tileDistance !== 1 && !(tileDistance === 2 && coolerLevel >= 3)) return strongest;
    const powerRatio = Math.max(0, Math.min(1, Number(facilityOperations[coolerIndex]?.powerRatio) || 0));
    const levelBonus = coolerLevel >= 2 ? 1.25 : 1;
    const rangeMultiplier = tileDistance === 2 ? 0.5 : 1;
    return Math.max(strongest, powerRatio * levelBonus * rangeMultiplier);
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
  const boardCoords = topologyFor(grid, coords);
  const byFacility = {};
  let hourlyCarbon = 0;
  let hourlyWater = 0;

  grid.forEach((cell, index) => {
    if (!cell) return;
    const stats = effectiveFacilityStats(cell, facilityModifierAt(modifierContext, index));
    const operation = facilityOperations[index] || {};
    const powerRatio = Math.max(0, Math.min(1, Number(operation.powerRatio) || 0));
    const operationRatio = Math.max(0, Math.min(1, Number(operation.operationRatio) || 0));
    const carbonFactor = stats.carbon < 0
      ? 1
      : ['factory', 'data'].includes(cell.type)
        ? operationRatio
        : stats.supply > 0
          ? Math.max(0.25, operationRatio)
          : 0;
    let carbon = stats.carbon * carbonFactor;
    let water = stats.water * (stats.demand > 0 ? powerRatio : 1);

    if (['data', 'nuclear'].includes(cell.type)) {
      const coolingSupport = strongestCoolingSupport(
        grid,
        index,
        boardCoords,
        facilityOperations,
      );
      const effectiveCoolingRatio = Math.min(powerRatio, coolingSupport);
      const coolingEffectiveness = modifierContext?.city?.coolingEffectiveness ?? 1;
      const reduction = (cell.type === 'data' ? 4 : 2)
        * safeLevel(cell)
        * effectiveCoolingRatio
        * coolingEffectiveness;
      water = Math.max(0, water - reduction);
    }

    carbon = round2(carbon);
    water = round2(water);
    hourlyCarbon += carbon;
    hourlyWater += water;
    byFacility[index] = { carbon, water };
  });

  return {
    byFacility,
    hourlyCarbon: Math.max(0, round2(hourlyCarbon)),
    hourlyWater: Math.max(0, round2(hourlyWater)),
  };
}
