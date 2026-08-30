import {
  ECONOMY_RULES,
  FACILITIES,
  FACILITY_ECONOMY,
  WORKFORCE_LEVELS,
} from '../core/Constants.js';

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

export function calculateLabor(grid) {
  let workforce = 0;
  let jobs = 0;
  grid.forEach((cell) => {
    if (!cell) return;
    if (cell.type === 'residential') workforce += WORKFORCE_LEVELS.residential[cell.level];
    if (cell.type === 'factory') jobs += WORKFORCE_LEVELS.factory[cell.level];
    if (cell.type === 'data') jobs += WORKFORCE_LEVELS.data[cell.level];
  });
  return {
    workforce,
    jobs,
    industryFill: jobs ? round1(Math.min(1, workforce / jobs)) : 0,
    employmentRate: workforce ? round1(Math.min(1, jobs / workforce)) : 0,
  };
}

const neighbors = (index, size) => {
  const row = Math.floor(index / size);
  const col = index % size;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dr, dc]) => [row + dr, col + dc])
    .filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size)
    .map(([r, c]) => r * size + c);
};

export function settleEconomy({ grid, size = Math.round(Math.sqrt(grid.length)), facilityPower = {}, hiddenCostsUnlocked = false, credits = 0 }) {
  const labor = calculateLabor(grid);
  const counts = {};
  const pollutedHomes = new Set();
  const pollutionPairs = new Set();
  grid.forEach((cell, index) => {
    if (!cell) return;
    counts[cell.type] = (counts[cell.type] || 0) + 1;
    if (!['factory', 'thermal'].includes(cell.type)) return;
    neighbors(index, size).forEach((neighbor) => {
      if (grid[neighbor]?.type !== 'residential') return;
      pollutedHomes.add(neighbor);
      pollutionPairs.add(`${Math.min(index, neighbor)}:${Math.max(index, neighbor)}`);
    });
  });

  let grossIncome = 0;
  let maintenance = 0;
  let hourlyCarbon = 0;
  let hourlyWater = 0;
  const facilityEconomy = {};

  grid.forEach((cell, index) => {
    if (!cell) return;
    const economy = FACILITY_ECONOMY[cell.type];
    const power = facilityPower[index];
    const powerRatio = power ? Math.max(0, Math.min(1, power.ratio ?? (power.demand ? power.delivered / power.demand : 1))) : (FACILITIES[cell.type].demand ? 0 : 1);
    const running = powerRatio >= ECONOMY_RULES.STOP_POWER_RATIO;
    const laborMultiplier = ['factory', 'data'].includes(cell.type) ? labor.industryFill : 1;
    const pollutionMultiplier = cell.type === 'residential' && pollutedHomes.has(index) && hiddenCostsUnlocked
      ? ECONOMY_RULES.POLLUTION_TAX_MULTIPLIER
      : 1;
    const employmentMultiplier = cell.type === 'residential'
      ? ECONOMY_RULES.BASE_RESIDENTIAL_TAX_RATIO + (1 - ECONOMY_RULES.BASE_RESIDENTIAL_TAX_RATIO) * labor.employmentRate
      : 1;
    const operationRatio = running ? powerRatio * laborMultiplier : 0;
    const income = economy.income * (cell.type === 'residential' ? powerRatio * employmentMultiplier : operationRatio) * pollutionMultiplier;
    const upkeep = round1(economy.upkeep * ECONOMY_RULES.UPKEEP_LEVEL_MULTIPLIERS[cell.level]);
    grossIncome += income;
    maintenance += upkeep;
    const carbonFactor = ['factory', 'data'].includes(cell.type) ? operationRatio : Math.max(0.25, operationRatio || (FACILITIES[cell.type].supply ? 0.25 : 0));
    hourlyCarbon += Math.max(0, FACILITIES[cell.type].carbon || 0) * carbonFactor;
    hourlyWater += (FACILITIES[cell.type].water || 0) * (FACILITIES[cell.type].demand ? powerRatio : 1);
    facilityEconomy[index] = { income: round2(income), upkeep, powerRatio: round1(powerRatio), operationRatio: round1(operationRatio), laborMultiplier, pollutionMultiplier };
  });

  const overcrowding = hiddenCostsUnlocked
    ? Object.entries(counts).reduce((sum, [type, count]) => sum + Math.max(0, count - ECONOMY_RULES.OVERCROWDING_FREE_COUNT) * FACILITIES[type].cost * ECONOMY_RULES.OVERCROWDING_COST_RATE, 0)
    : 0;
  const health = hiddenCostsUnlocked ? pollutionPairs.size * ECONOMY_RULES.POLLUTION_HEALTH_COST : 0;
  const climateRecovery = hiddenCostsUnlocked
    ? Math.max(0, hourlyCarbon - ECONOMY_RULES.CARBON_SAFE_RATE) * ECONOMY_RULES.CLIMATE_RECOVERY_RATE
    : 0;
  const netCredits = round1(grossIncome - maintenance - overcrowding - health - climateRecovery);

  return {
    labor,
    facilityEconomy,
    grossIncome: round2(grossIncome),
    maintenance: round1(maintenance),
    overcrowding: round1(overcrowding),
    health: round1(health),
    climateRecovery: round1(climateRecovery),
    netCredits,
    nextCredits: Math.max(0, round1(credits + netCredits)),
    hourlyCarbon: round1(hourlyCarbon),
    hourlyWater: Math.max(0, round1(hourlyWater)),
  };
}
