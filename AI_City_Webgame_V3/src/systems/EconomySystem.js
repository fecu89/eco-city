import {
  BOARD,
  ECONOMY_RULES,
  FACILITIES,
  FACILITY_GROUPS,
  WORKFORCE_LEVELS,
} from '../core/Constants.js';
import { createHexCoordinates, neighborIndices } from './HexGridSystem.js';
import { calculateWorkforce } from './WorkforceSystem.js';
import { roundCredits } from '../core/Money.js';
import { calculateEnvironmentalOperations } from './FacilityOperationSystem.js';
import { effectiveFacilityStats, facilityModifierAt } from './CityModifierSystem.js';
import { operationalGrid } from './ConstructionProjectSystem.js';

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const clamp01 = (value) => Math.max(0, Math.min(1, value));

export const calculateLabor = calculateWorkforce;

function topologyFor(grid, coords) {
  if (coords) return coords;
  if (grid.length === BOARD.INITIAL_CELLS) return createHexCoordinates(BOARD.INITIAL_RADIUS);
  if (grid.length === BOARD.EXPANDED_CELLS) return createHexCoordinates(BOARD.EXPANDED_RADIUS);
  return [];
}

export function settleEconomy({
  grid,
  coords = null,
  facilityPower = {},
  generationAvailableByIndex = {},
  generationDispatchedByIndex = {},
  credits = 0,
  modifierContext = null,
}) {
  grid = operationalGrid(grid);
  const boardCoords = topologyFor(grid, coords);
  const labor = calculateWorkforce(grid, modifierContext);
  const counts = {};
  const pollutedHomes = new Set();
  const pollutionPairKeys = new Set();
  const pollutionPairs = [];
  grid.forEach((cell, index) => {
    if (!cell) return;
    counts[cell.type] = (counts[cell.type] || 0) + 1;
    if (!FACILITY_GROUPS.HEAVY_POLLUTERS.includes(cell.type)) return;
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
    // 발전 시설의 가동률은 인력·전력 수요가 아니라 이 틱에 실제로 급전된 전력에서 나온다.
    // 급전 정보 없이 부르는 정적 미리보기에서는 발전 시설을 만가동으로 본다.
    const isGeneration = stats.supply > 0 && !stats.demand;
    const generationAvailable = isGeneration ? Number(generationAvailableByIndex[index]) : NaN;
    const generationOperationRatio = !Number.isFinite(generationAvailable)
      ? 1
      : generationAvailable > 0
        ? clamp01((Number(generationDispatchedByIndex[index]) || 0) / generationAvailable)
        : 0;
    const operationRatio = isGeneration
      ? generationOperationRatio
      : running ? powerRatio * laborMultiplier : 0;
    const residentialTaxRatio = ECONOMY_RULES.BASE_RESIDENTIAL_TAX_RATIO
      + (employmentMultiplier - ECONOMY_RULES.BASE_RESIDENTIAL_TAX_RATIO) * powerRatio;
    const income = stats.income * (cell.type === 'residential' ? residentialTaxRatio : operationRatio) * pollutionMultiplier;
    const upkeep = roundCredits(stats.upkeep);
    grossIncome += income;
    maintenance += upkeep;
    // operationRatio는 화면에 찍는 값이라 소수 첫째 자리로 반올림한다. 그런데 발전소의
    // 탄소·냉각수는 이 비율에 그대로 비례하므로, 반올림된 값을 물리에 쓰면 급전량 4%가
    // 0%로, 26%가 30%로 튀어 급전→배출 곡선이 계단이 된다. 반올림하지 않은 값을 따로 실어
    // FacilityOperationSystem이 그것을 읽게 한다.
    facilityEconomy[index] = {
      income: round2(income),
      upkeep,
      powerRatio: round1(powerRatio),
      operationRatio: round1(operationRatio),
      operationRatioRaw: clamp01(operationRatio),
      laborMultiplier,
      pollutionMultiplier,
    };
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
  const climateRecovery = Math.max(0, environment.dailyCarbon - ECONOMY_RULES.CARBON_SAFE_RATE) * ECONOMY_RULES.CLIMATE_RECOVERY_RATE;
  const expansionUpkeep = round1(modifierContext?.city?.expansionUpkeep || 0);
  const netCredits = roundCredits(grossIncome - maintenance - overcrowding - health - climateRecovery - expansionUpkeep);

  return {
    labor,
    facilityEconomy,
    grossIncome: round2(grossIncome),
    maintenance: roundCredits(maintenance),
    overcrowding: round1(overcrowding),
    health: round1(health),
    expansionUpkeep,
    climateRecovery: round1(climateRecovery),
    netCredits,
    nextCredits: roundCredits(credits + netCredits),
    dailyCarbon: round1(environment.dailyCarbon),
    dailyWater: round1(environment.dailyWater),
    facilityEnvironment: environment.byFacility,
  };
}
