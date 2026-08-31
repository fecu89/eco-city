import {
  ECONOMY_RULES,
  FACILITIES,
  WORKFORCE_LEVELS,
} from '../core/Constants.js';
import { createHexCoordinates, neighborIndices } from './HexGridSystem.js';
import { calculateWorkforce } from './WorkforceSystem.js';
import { roundCredits } from '../core/Money.js';
import { calculateEnvironmentalOperations } from './FacilityOperationSystem.js';
import { effectiveFacilityStats, facilityModifierAt } from './CityModifierSystem.js';

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

export const calculateLabor = calculateWorkforce;

function topologyFor(grid, coords) {
  if (coords) return coords;
  if (grid.length === 19) return createHexCoordinates(2);
  if (grid.length === 37) return createHexCoordinates(3);
  return [];
}

export function settleEconomy({
  grid,
  coords = null,
  facilityPower = {},
  credits = 0,
  modifierContext = null,
}) {
  const boardCoords = topologyFor(grid, coords);
  const labor = calculateWorkforce(grid, modifierContext);
  const counts = {};
  const pollutedHomes = new Set();
  const pollutionPairKeys = new Set();
  const pollutionPairs = [];
  grid.forEach((cell, index) => {
    if (!cell) return;
    counts[cell.type] = (counts[cell.type] || 0) + 1;
    if (!['factory', 'thermal'].includes(cell.type)) return;
    neighborIndices(index, boardCoords).forEach((neighbor) => {
      if (grid[neighbor]?.type !== 'residential') return;
      pollutedHomes.add(neighbor);
      const key = `${Math.min(index, neighbor)}:${Math.max(index, neighbor)}`;
      if (pollutionPairKeys.has(key)) return;
      pollutionPairKeys.add(key);
      pollutionPairs.push({ sourceIndex: index, homeIndex: neighbor });
    });
  });

  let grossIncome = 0;
  let maintenance = 0;
  const facilityEconomy = {};

  grid.forEach((cell, index) => {
    if (!cell) return;
    const stats = effectiveFacilityStats(cell, facilityModifierAt(modifierContext, index));
    const power = facilityPower[index];
    const powerRatio = power ? Math.max(0, Math.min(1, power.ratio ?? (power.demand ? power.delivered / power.demand : 1))) : (FACILITIES[cell.type].demand ? 0 : 1);
    const running = powerRatio >= ECONOMY_RULES.STOP_POWER_RATIO;
    const needsWorkers = cell.type !== 'residential' && (WORKFORCE_LEVELS[cell.type]?.[cell.level] ?? 0) > 0;
    const laborMultiplier = needsWorkers ? labor.industryFill : 1;
    const pollutionMultiplier = cell.type === 'residential' && pollutedHomes.has(index)
      ? ECONOMY_RULES.POLLUTION_TAX_MULTIPLIER
      : 1;
    const employmentMultiplier = cell.type === 'residential'
      ? ECONOMY_RULES.BASE_RESIDENTIAL_TAX_RATIO + (1 - ECONOMY_RULES.BASE_RESIDENTIAL_TAX_RATIO) * labor.employmentRate
      : 1;
    const operationRatio = running ? powerRatio * laborMultiplier : 0;
    const income = stats.income * (cell.type === 'residential' ? powerRatio * employmentMultiplier : operationRatio) * pollutionMultiplier;
    const upkeep = round1(stats.upkeep);
    grossIncome += income;
    maintenance += upkeep;
    facilityEconomy[index] = { income: round2(income), upkeep, powerRatio: round1(powerRatio), operationRatio: round1(operationRatio), laborMultiplier, pollutionMultiplier };
  });

  const environment = calculateEnvironmentalOperations({
    grid,
    coords: boardCoords,
    facilityOperations: facilityEconomy,
    modifierContext,
  });

  const overcrowding = Object.entries(counts).reduce((sum, [type, count]) => sum + Math.max(0, count - ECONOMY_RULES.OVERCROWDING_FREE_COUNT) * FACILITIES[type].cost * ECONOMY_RULES.OVERCROWDING_COST_RATE, 0);
  const zoneHealth = [...pollutedHomes].reduce((sum, index) => sum + effectiveFacilityStats(
    grid[index],
    facilityModifierAt(modifierContext, index),
  ).healthCostFlat, 0);
  const adjacencyHealth = pollutionPairs.reduce((sum, pair) => sum
    + ECONOMY_RULES.POLLUTION_HEALTH_COST
      * (modifierContext?.city?.greenFactoryHealthMultiplierByIndex?.[pair.sourceIndex] || 1), 0);
  const health = (adjacencyHealth + zoneHealth)
    * (modifierContext?.city?.healthMultiplier || 1)
    + (modifierContext?.city?.healthCostFlat || 0);
  const climateRecovery = Math.max(0, environment.hourlyCarbon - ECONOMY_RULES.CARBON_SAFE_RATE) * ECONOMY_RULES.CLIMATE_RECOVERY_RATE;
  const expansionUpkeep = round1(modifierContext?.city?.expansionUpkeep || 0);
  const netCredits = roundCredits(grossIncome - maintenance - overcrowding - health - climateRecovery - expansionUpkeep);

  return {
    labor,
    facilityEconomy,
    grossIncome: round2(grossIncome),
    maintenance: round1(maintenance),
    overcrowding: round1(overcrowding),
    health: round1(health),
    expansionUpkeep,
    climateRecovery: round1(climateRecovery),
    netCredits,
    nextCredits: roundCredits(credits + netCredits),
    hourlyCarbon: round1(environment.hourlyCarbon),
    hourlyWater: round1(environment.hourlyWater),
    facilityEnvironment: environment.byFacility,
  };
}
