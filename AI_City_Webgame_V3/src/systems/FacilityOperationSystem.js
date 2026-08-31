import {
  ECONOMY_RULES,
  FACILITIES,
  FACILITY_ECONOMY,
  LEVEL_MULTIPLIERS,
} from '../core/Constants.js';
import { createHexCoordinates, neighborIndices } from './HexGridSystem.js';

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

function adjacentTo(grid, index, coords, type) {
  if (!coords.length) return false;
  return neighborIndices(index, coords).some((neighbor) => grid[neighbor]?.type === type);
}

export function facilityLevelStats(cell) {
  const facility = FACILITIES[cell.type];
  const economy = FACILITY_ECONOMY[cell.type];
  const level = safeLevel(cell);
  const carbon = facility.carbon || 0;
  const water = facility.water || 0;
  return {
    dev: (facility.dev || 0) * LEVEL_MULTIPLIERS.output[level],
    demand: (facility.demand || 0) * LEVEL_MULTIPLIERS.demand[level],
    supply: (facility.supply || 0) * LEVEL_MULTIPLIERS.output[level],
    income: (economy.income || 0) * LEVEL_MULTIPLIERS.output[level],
    upkeep: (economy.upkeep || 0) * ECONOMY_RULES.UPKEEP_LEVEL_MULTIPLIERS[level],
    carbon: carbon < 0
      ? carbon * LEVEL_MULTIPLIERS.negative[level]
      : carbon * LEVEL_MULTIPLIERS.impact[level],
    // 순환냉각은 독립적인 음수 자원이 아니라 연결 대상의 물 부담을 줄인다.
    water: cell.type === 'cooling'
      ? 0
      : water < 0
        ? water * LEVEL_MULTIPLIERS.negative[level]
        : water * LEVEL_MULTIPLIERS.impact[level],
  };
}

export function calculateEnvironmentalOperations({ grid, coords = null, facilityOperations = {} }) {
  const boardCoords = topologyFor(grid, coords);
  const byFacility = {};
  let hourlyCarbon = 0;
  let hourlyWater = 0;

  grid.forEach((cell, index) => {
    if (!cell) return;
    const stats = facilityLevelStats(cell);
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

    if (cell.type === 'data' && adjacentTo(grid, index, boardCoords, 'cooling')) {
      water -= 4 * safeLevel(cell);
    }
    if (cell.type === 'nuclear' && adjacentTo(grid, index, boardCoords, 'cooling')) {
      water -= 2 * safeLevel(cell);
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

