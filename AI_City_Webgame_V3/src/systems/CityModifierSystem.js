import {
  ECONOMY_RULES,
  FACILITIES,
  FACILITY_ECONOMY,
  LEVEL_MULTIPLIERS,
  WORKFORCE_LEVELS,
} from '../core/Constants.js';
import {
  BATTERY_POLICIES,
  isOperationModeAvailable,
  operationModeDefinition,
} from '../core/OperationDefinitions.js';
import { createHexCoordinates, hexDistance, neighborIndices } from './HexGridSystem.js';
import { expansionUpkeep, zoneModifierForCell } from './ZoneSystem.js';
import { activeEventContext } from './CityEventSystem.js';
import { carbonPressureForHours } from './CarbonCrisisSystem.js';
import { researchEffects } from './ResearchEffectSystem.js';
import { stressModifierForFacility } from './StressTestSystem.js';
import { isOperationalCell, operationProfileForCell } from './ConstructionProjectSystem.js';

const MULTIPLICATIVE_FIELDS = Object.freeze([
  'supply', 'demand', 'income', 'upkeep', 'carbon', 'water', 'researchSpeed', 'workforce',
]);
const ADDITIVE_FIELDS = Object.freeze(['workforceFlat', 'healthCostFlat', 'buildCostFlat']);
const FACILITY_PRIORITIES = new Set(['essential', 'normal', 'saving']);

export function identityModifier() {
  return {
    supply: 1,
    demand: 1,
    income: 1,
    upkeep: 1,
    carbon: 1,
    water: 1,
    researchSpeed: 1,
    workforce: 1,
    workforceFlat: 0,
    healthCostFlat: 0,
    buildCostFlat: 0,
  };
}

export function composeModifiers(...modifiers) {
  const composed = identityModifier();
  modifiers.filter(Boolean).forEach((modifier) => {
    MULTIPLICATIVE_FIELDS.forEach((field) => {
      const value = Number(modifier[field]);
      if (Number.isFinite(value)) composed[field] *= value;
    });
    ADDITIVE_FIELDS.forEach((field) => {
      const value = Number(modifier[field]);
      if (Number.isFinite(value)) composed[field] += value;
    });
  });
  return composed;
}

function safeLevel(cell) {
  return Math.max(1, Math.min(3, Math.trunc(Number(cell?.level) || 1)));
}

function baseFacilityStats(cell) {
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
    water: cell.type === 'cooling'
      ? 0
      : water < 0
        ? water * LEVEL_MULTIPLIERS.negative[level]
        : water * LEVEL_MULTIPLIERS.impact[level],
    workforce: WORKFORCE_LEVELS[cell.type]?.[level] ?? 0,
    researchSpeed: 1,
    healthCostFlat: 0,
    buildCostFlat: 0,
  };
}

function normalizeModifier(modifier = {}) {
  if (modifier.combined) return composeModifiers(modifier.combined);
  if (modifier.mode || modifier.event || modifier.zone || modifier.research || modifier.stress) {
    return composeModifiers(
      modifier.mode,
      modifier.event,
      modifier.zone,
      modifier.research,
      modifier.stress,
    );
  }
  return composeModifiers(modifier);
}

export function effectiveFacilityStats(cell, modifier = {}) {
  const base = baseFacilityStats(cell);
  const combined = normalizeModifier(modifier);
  const project = operationProfileForCell(cell);
  return {
    ...base,
    dev: base.dev * project.dev,
    supply: base.supply * combined.supply * project.supply,
    demand: base.demand * combined.demand * project.demand,
    income: base.income * combined.income * project.income,
    upkeep: base.upkeep * combined.upkeep * project.upkeep,
    carbon: base.carbon * combined.carbon * project.carbon,
    water: base.water * combined.water * project.water,
    researchSpeed: base.researchSpeed * combined.researchSpeed * project.researchSpeed,
    workforce: Math.max(0, (base.workforce * combined.workforce + combined.workforceFlat) * project.workforce),
    healthCostFlat: (base.healthCostFlat + combined.healthCostFlat) * (project.operational ? project.carbon : 0),
    buildCostFlat: base.buildCostFlat + combined.buildCostFlat,
  };
}

function modifierAt(source, index) {
  if (!source) return identityModifier();
  if (typeof source === 'function') return source(index) || identityModifier();
  return source[index] || source.default || identityModifier();
}

function coordinatesFor(state, coords) {
  if (coords) return coords;
  return createHexCoordinates(state.grid.length === 37 ? 3 : 2);
}

function hasAdjacentType(state, index, coords, type) {
  return neighborIndices(index, coords).some((neighbor) => (
    isOperationalCell(state.grid[neighbor]) && state.grid[neighbor].type === type
  ));
}

function hasGreenCluster(state, coords) {
  const greenIndices = state.grid
    .map((cell, index) => isOperationalCell(cell) && cell.type === 'green' ? index : null)
    .filter((index) => index != null);
  return greenIndices.some((start) => {
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      neighborIndices(current, coords).forEach((neighbor) => {
        if (!isOperationalCell(state.grid[neighbor]) || state.grid[neighbor].type !== 'green' || visited.has(neighbor)) return;
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }
    return visited.size >= 3;
  });
}

function resolvedOperationMode(cell) {
  if (cell.operationMode !== 'auto') return cell.operationMode || 'normal';
  return cell.automaticOperationMode || 'normal';
}

function lowCarbonSurplus(state) {
  const summary = state.lastTickSummary;
  if (!summary) return 0;
  if (Number.isFinite(Number(summary.lowCarbonSurplus))) return Math.max(0, Number(summary.lowCarbonSurplus));
  return Math.max(0, (Number(summary.lowCarbonDelivered) || 0) - (Number(summary.demand) || 0));
}

export function applyAutomaticOperationModes(state) {
  const effects = researchEffects(state);
  if (!effects.demandResponse) return [];
  const margin = (Number(state.lastTickSummary?.deliveredPower) || 0)
    - (Number(state.lastTickSummary?.demand) || 0);
  const changes = [];
  state.grid.forEach((cell, index) => {
    if (!isOperationalCell(cell) || cell.project || cell.operationMode !== 'auto' || (Number(cell.level) || 1) < 3) return;
    let resolvedMode = 'normal';
    if (cell.type === 'residential') resolvedMode = margin <= 1 ? 'forced' : 'normal';
    else if (cell.type === 'factory') resolvedMode = margin <= 1 ? 'eco' : margin >= 5 ? 'boost' : 'normal';
    else return;
    if (cell.automaticOperationMode === resolvedMode) return;
    const previousMode = cell.automaticOperationMode || 'normal';
    cell.automaticOperationMode = resolvedMode;
    state.decisionCounts ||= {};
    state.decisionCounts.automaticModeChanges = (state.decisionCounts.automaticModeChanges || 0) + 1;
    changes.push({ index, type: cell.type, previousMode, resolvedMode });
  });
  return changes;
}

export function buildCityModifierContext(state, {
  coords = null,
  calendar = null,
  eventModifiers = null,
  zoneModifiers = null,
  researchModifiers = null,
  stressModifiers = null,
} = {}) {
  const byFacility = {};
  const boardCoords = coordinatesFor(state, coords);
  const activeEvent = activeEventContext(state);
  const carbonPressure = carbonPressureForHours(state.carbonCrisisHours);
  const effects = researchEffects(state);
  const greenCluster = hasGreenCluster(state, boardCoords);
  const greenFactoryHealthMultiplierByIndex = {};
  state.grid.forEach((cell, index) => {
    if (!isOperationalCell(cell)) return;
    const mode = cell.project?.kind === 'upgrade'
      ? identityModifier()
      : operationModeDefinition(cell.type, resolvedOperationMode(cell))?.modifier || identityModifier();
    const eventBase = eventModifiers
      ? modifierAt(eventModifiers, index)
      : activeEvent.byFacility?.(index) || identityModifier();
    const event = composeModifiers(eventBase, {
      demand: activeEvent.event?.type === 'heatwave' && cell.type === 'residential' && greenCluster
        ? 1.2 / 1.25
        : 1,
      income: cell.type === 'residential' ? carbonPressure.residentialIncomeMultiplier : 1,
      water: carbonPressure.waterMultiplier,
    });
    const zone = zoneModifiers
      ? modifierAt(zoneModifiers, index)
      : zoneModifierForCell(state, index, cell.type);
    const adjacentGreen = hasAdjacentType(state, index, boardCoords, 'green');
    if (cell.type === 'factory' && adjacentGreen) greenFactoryHealthMultiplierByIndex[index] = 0.75;
    const systemResearch = {
      supply: cell.type === 'solar'
        ? effects.solarSupply
        : cell.type === 'wind'
          ? effects.windSupply * (activeEvent.event?.type === 'lowWind' ? effects.lowWindSupply / 0.35 : 1)
          : 1,
      income: cell.type === 'residential' && adjacentGreen ? 1.05 : 1,
      researchSpeed: cell.type === 'data' && (Number(cell.level) || 1) >= 3 && lowCarbonSurplus(state) >= 3
        ? 1.25
        : 1,
    };
    const research = composeModifiers(systemResearch, modifierAt(researchModifiers, index));
    const stress = stressModifiers
      ? modifierAt(stressModifiers, index)
      : stressModifierForFacility(state, cell.type);
    byFacility[index] = {
      mode,
      event,
      zone,
      research,
      stress,
      combined: composeModifiers(mode, event, zone, research, stress),
    };
  });
  return {
    byFacility,
    city: {
      coords,
      calendar,
      expansionUpkeep: expansionUpkeep(state),
      healthCostFlat: 0,
      buildCostFlat: 0,
      waterLimit: activeEvent.city.waterLimit ?? null,
      coolingEffectiveness: activeEvent.city.coolingEffectiveness ?? 1,
      activeEvent: activeEvent.event,
      healthMultiplier: carbonPressure.healthMultiplier,
      carbonPressure,
      batteryCapacityMultiplier: effects.batteryCapacity,
      transmissionLossPerExtraTile: effects.transmissionLossPerTile,
      batteryReservePolicies: effects.batteryReservePolicies,
      batteryEmergencyReserve: effects.batteryEmergencyReserve,
      demandResponse: effects.demandResponse,
      greenCluster,
      greenFactoryHealthMultiplierByIndex,
    },
  };
}

export function facilityModifierAt(context, index) {
  return context?.byFacility?.[index] || identityModifier();
}

function modeForecast(cell, beforeMode, afterMode) {
  const before = effectiveFacilityStats(cell, {
    mode: operationModeDefinition(cell.type, beforeMode)?.modifier,
  });
  const after = effectiveFacilityStats(cell, {
    mode: operationModeDefinition(cell.type, afterMode)?.modifier,
  });
  const pair = (field) => ({ before: before[field], after: after[field], delta: after[field] - before[field] });
  return {
    demand: pair('demand'),
    supply: pair('supply'),
    powerMargin: { before: -before.demand, after: -after.demand, delta: before.demand - after.demand },
    income: pair('income'),
    netIncome: pair('income'),
    carbon: pair('carbon'),
    water: pair('water'),
    workforce: pair('workforce'),
    researchSpeed: pair('researchSpeed'),
  };
}

export function previewFacilityOperationMode(state, index, mode) {
  const cell = state.grid[index];
  if (!cell) return { ok: false, reason: 'invalid_facility' };
  if (!operationModeDefinition(cell.type, mode)) return { ok: false, reason: 'unsupported_mode' };
  if (!isOperationModeAvailable(cell, mode, state)) return { ok: false, reason: 'mode_locked' };
  const before = cell.operationMode || 'normal';
  return { ok: true, before, after: mode, forecast: modeForecast(cell, before, mode) };
}

export function availableBatteryPolicies(state, cell) {
  if (cell?.type !== 'battery') return [];
  const policies = [BATTERY_POLICIES.auto];
  if ((Number(cell.level) || 1) >= 2 && researchEffects(state).batteryReservePolicies) {
    policies.push(BATTERY_POLICIES.reserve30, BATTERY_POLICIES.reserve50);
  }
  if ((Number(cell.level) || 1) >= 3 && researchEffects(state).batteryEmergencyReserve) {
    policies.push(BATTERY_POLICIES.essential);
  }
  return policies;
}

export function setBatteryPolicy(state, index, policy) {
  const cell = state.grid[index];
  if (!cell || cell.type !== 'battery') return { ok: false, reason: 'invalid_battery' };
  if (!availableBatteryPolicies(state, cell).some(({ id }) => id === policy)) {
    return { ok: false, reason: 'policy_locked' };
  }
  const before = cell.batteryPolicy || 'auto';
  cell.batteryPolicy = policy;
  if (before !== policy) {
    state.decisionCounts ||= {};
    state.decisionCounts.batteryPolicyChanges = (state.decisionCounts.batteryPolicyChanges || 0) + 1;
  }
  return { ok: true, before, after: policy, definition: BATTERY_POLICIES[policy] };
}

export function setFacilityPriority(state, index, priority) {
  const cell = state.grid[index];
  if (!cell) return { ok: false, reason: 'invalid_facility' };
  if (!FACILITY_PRIORITIES.has(priority)) return { ok: false, reason: 'invalid_priority' };
  const before = cell.priority || 'normal';
  cell.priority = priority;
  if (before !== priority) {
    state.decisionCounts ||= {};
    state.decisionCounts.priorityChanges = (state.decisionCounts.priorityChanges || 0) + 1;
  }
  return { ok: true, before, after: priority };
}

export function setFacilityOperationMode(state, index, mode) {
  const preview = previewFacilityOperationMode(state, index, mode);
  if (!preview.ok) return preview;
  if (preview.before !== mode) {
    state.grid[index].operationMode = mode;
    state.decisionCounts ||= {};
    state.decisionCounts.modeChanges = (state.decisionCounts.modeChanges || 0) + 1;
  }
  return preview;
}
