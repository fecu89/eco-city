import {
  BOARD,
  ECONOMY_RULES,
  FACILITIES,
  FACILITY_DEMAND_BY_LEVEL,
  FACILITY_ECONOMY,
  FACILITY_WATER_BY_LEVEL,
  GREEN_RULES,
  HEATWAVE_RULES,
  LEVEL_MULTIPLIERS,
  POWER_RULES,
  RESEARCH_RULES,
  RESEARCH_TUNING,
  WORKFORCE_LEVELS,
} from '../core/Constants.js';
import { BATTERY_POLICIES } from '../core/OperationDefinitions.js';
import { createHexCoordinates, hexDistance, neighborIndices } from './HexGridSystem.js';
import { expansionUpkeep, zoneModifierForCell } from './ZoneSystem.js';
import { activeEventContext } from './CityEventSystem.js';
import { carbonPressureForDays } from './CarbonCrisisSystem.js';
import { researchEffects } from './ResearchEffectSystem.js';
import { stressCityModifier, stressModifierForFacility } from './StressTestSystem.js';
import { isOperationalCell, operationProfileForCell } from './ConstructionProjectSystem.js';
import { demandVariationFactor, directionFactor, tidalFactor } from './EnvironmentSystem.js';
import { weatherAt } from './WeatherSystem.js';

const MULTIPLICATIVE_FIELDS = Object.freeze([
  'supply', 'demand', 'income', 'upkeep', 'carbon', 'water', 'negative', 'researchSpeed', 'workforce',
]);
const ADDITIVE_FIELDS = Object.freeze(['workforceFlat', 'healthCostFlat', 'buildCostFlat']);
const FACILITY_PRIORITIES = new Set(Object.keys(POWER_RULES.PRIORITY_ORDER));

export function identityModifier() {
  return {
    supply: 1,
    demand: 1,
    income: 1,
    upkeep: 1,
    carbon: 1,
    water: 1,
    negative: 1,
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

// 소비 시설의 수요·물은 종류별 레벨 표가 있으면 일반 배율 대신 그 표를 쓴다(FACILITY_DEMAND_BY_LEVEL).
// 표가 없는 시설은 예전 그대로 LEVEL_MULTIPLIERS를 곱한다.
function levelTableValue(table, level) {
  const value = Number(table?.[level]);
  return Number.isFinite(value) ? value : null;
}

function baseFacilityStats(cell) {
  const facility = FACILITIES[cell.type];
  const economy = FACILITY_ECONOMY[cell.type];
  const level = safeLevel(cell);
  const carbon = facility.carbon || 0;
  const water = facility.water || 0;
  const tableDemand = levelTableValue(FACILITY_DEMAND_BY_LEVEL[cell.type], level);
  const tableWater = levelTableValue(FACILITY_WATER_BY_LEVEL[cell.type], level);
  return {
    dev: (facility.dev || 0) * LEVEL_MULTIPLIERS.output[level],
    demand: tableDemand ?? (facility.demand || 0) * LEVEL_MULTIPLIERS.demand[level],
    supply: (facility.supply || 0) * LEVEL_MULTIPLIERS.output[level],
    income: (economy.income || 0) * LEVEL_MULTIPLIERS.output[level],
    upkeep: (economy.upkeep || 0) * ECONOMY_RULES.UPKEEP_LEVEL_MULTIPLIERS[level],
    carbon: carbon < 0
      ? carbon * LEVEL_MULTIPLIERS.negative[level]
      : carbon * LEVEL_MULTIPLIERS.impact[level],
    water: cell.type === 'cooling'
      ? 0
      : tableWater ?? (water < 0
        ? water * LEVEL_MULTIPLIERS.negative[level]
        : water * LEVEL_MULTIPLIERS.impact[level]),
    workforce: WORKFORCE_LEVELS[cell.type]?.[level] ?? 0,
    researchSpeed: 1,
    healthCostFlat: 0,
    buildCostFlat: 0,
  };
}

function normalizeModifier(modifier = {}) {
  if (modifier.combined) return composeModifiers(modifier.combined);
  if (modifier.event || modifier.zone || modifier.research || modifier.stress || modifier.site || modifier.daily) {
    return composeModifiers(
      modifier.event,
      modifier.zone,
      modifier.research,
      modifier.stress,
      modifier.site,
      modifier.daily,
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
    carbon: base.carbon * (base.carbon < 0 ? combined.negative : combined.carbon) * project.carbon,
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
  return createHexCoordinates(state.grid.length === BOARD.EXPANDED_CELLS ? BOARD.EXPANDED_RADIUS : BOARD.INITIAL_RADIUS);
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
    return visited.size >= GREEN_RULES.CLUSTER_MIN_CELLS;
  });
}

function strongestResidentialGreenModifier(state, index, coords) {
  // 인접(거리 1) 녹지는 레벨별로, 거리 2 녹지는 DISTANCE2_MIN_LEVEL 이상일 때만 주거 수입·폭염 수요를 완화한다.
  let income = 1;
  let heatDemand = HEATWAVE_RULES.DEMAND_MULTIPLIER;
  state.grid.forEach((cell, greenIndex) => {
    if (!isOperationalCell(cell) || cell.type !== 'green') return;
    const level = safeLevel(cell);
    const distance = hexDistance(coords[index], coords[greenIndex]);
    if (distance === 1) {
      income = Math.max(income, GREEN_RULES.ADJACENT_INCOME_BY_LEVEL[level]);
      heatDemand = Math.min(heatDemand, HEATWAVE_RULES.GREEN_RELIEF.ADJACENT_DEMAND_BY_LEVEL[level]);
    } else if (distance === 2 && level >= GREEN_RULES.DISTANCE2_MIN_LEVEL) {
      income = Math.max(income, GREEN_RULES.DISTANCE2_INCOME);
      heatDemand = Math.min(heatDemand, HEATWAVE_RULES.GREEN_RELIEF.DISTANCE2_DEMAND);
    }
  });
  return { income, heatDemand, supported: income > 1 };
}

function lowCarbonSurplus(state) {
  const summary = state.lastTickSummary;
  if (!summary) return 0;
  if (Number.isFinite(Number(summary.lowCarbonSurplus))) return Math.max(0, Number(summary.lowCarbonSurplus));
  return Math.max(0, (Number(summary.lowCarbonDelivered) || 0) - (Number(summary.demand) || 0));
}

// 풍력 완화 연구(wind2)는 원래 은퇴한 이벤트 id 'lowWind' 하나에만 걸려 있었다. 그 이벤트가
// 사라진 뒤로는 어떤 재난에서도 발동하지 않는 죽은 코드였다. 이제는 "이 이벤트가 풍력 출력을
// 실제로 깎는가"(해당 칸의 이벤트 공급 배율 < 1)로 판정한다 — 무풍·미세먼지(0.25),
// 해안 초강풍(0.1), 겨울 재난(0.6)이 모두 여기에 해당한다.
//
// 배율은 옛 코드의 `lowWindSupply / 0.35`를 그대로 유지한다. 0.35는 은퇴한 lowWind의 풍력
// 배율이자 연구 전 lowWindSupply 기준값이었고, 두 값이 같아 식이 애매했다. 이벤트 자체의
// 배율로 나누면(`/ eventWindSupply`) 연구를 하지 않은 도시까지 무풍 피해가 0.25→0.35로
// 줄고 해안 초강풍은 0.1→0.35로 사실상 무력해진다 — 재난 난이도는 설계자의 몫이므로
// 건드리지 않는다. 연구가 실제로 사 준 몫(0.35→0.5, 약 +43%)만 곱한다.
function lowWindRelief(facilityType, eventModifier, effects) {
  if (facilityType !== 'wind') return 1;
  const eventWindSupply = Number(eventModifier?.supply);
  if (!Number.isFinite(eventWindSupply) || eventWindSupply >= 1) return 1;
  return effects.lowWindSupply / RESEARCH_TUNING.LOW_WIND_SUPPLY_BASE;
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
  const stressCity = stressCityModifier(state);
  const carbonPressure = carbonPressureForDays(state.carbonCrisisDays);
  const effects = researchEffects(state);
  const greenCluster = hasGreenCluster(state, boardCoords);
  // 오늘 하루의 도시 소비 전력 변동. 판의 씨앗과 게임일만으로 정해지므로 예보가 같은 날을
  // 다시 정산해도 같은 값이 나온다(SimulationForecastSystem은 복제 상태로 settleDay를 돌린다).
  const demandVariation = demandVariationFactor(state, state.elapsedGameDays);
  // 오늘의 날씨. 태양광은 맑음·흐림·강수에, 풍력은 풍속에만 따른다(조력·화력·핵은 무관).
  // 진행 중인 기후 이벤트·최종시험 단계가 있으면 WeatherSystem이 그에 맞춘 날씨를 돌려준다.
  const weather = weatherAt(state, state.elapsedGameDays);
  const greenFactoryHealthMultiplierByIndex = {};
  state.grid.forEach((cell, index) => {
    if (!isOperationalCell(cell)) return;
    const greenSupport = cell.type === 'residential'
      ? strongestResidentialGreenModifier(state, index, boardCoords)
      : { income: 1, heatDemand: HEATWAVE_RULES.DEMAND_MULTIPLIER, supported: false };
    const eventBase = eventModifiers
      ? modifierAt(eventModifiers, index)
      : activeEvent.byFacility?.(index) || identityModifier();
    const event = composeModifiers(eventBase, {
      demand: activeEvent.event?.type === 'heatwave' && cell.type === 'residential' && greenSupport.supported
        ? greenSupport.heatDemand / HEATWAVE_RULES.DEMAND_MULTIPLIER
        : 1,
      income: cell.type === 'residential' ? carbonPressure.residentialIncomeMultiplier : 1,
      water: carbonPressure.waterMultiplier,
    });
    const zone = zoneModifiers
      ? modifierAt(zoneModifiers, index)
      : zoneModifierForCell(state, index, cell.type);
    const adjacentGreen = hasAdjacentType(state, index, boardCoords, 'green');
    if (cell.type === 'factory' && adjacentGreen) greenFactoryHealthMultiplierByIndex[index] = GREEN_RULES.FACTORY_HEALTH_MULTIPLIER;
    const systemResearch = {
      supply: cell.type === 'solar'
        ? effects.solarSupply
        : cell.type === 'wind'
          ? effects.windSupply * lowWindRelief(cell.type, eventBase, effects)
          : 1,
      income: cell.type === 'residential' ? greenSupport.income : 1,
      researchSpeed: cell.type === 'data'
        && (Number(cell.level) || 1) >= RESEARCH_RULES.DATA_CENTER_SURPLUS_BONUS.MIN_LEVEL
        && lowCarbonSurplus(state) >= RESEARCH_RULES.DATA_CENTER_SURPLUS_BONUS.MIN_SURPLUS_E
        ? RESEARCH_RULES.DATA_CENTER_SURPLUS_BONUS.SPEED_MULTIPLIER
        : 1,
    };
    const research = composeModifiers(systemResearch, modifierAt(researchModifiers, index));
    const stress = stressModifiers
      ? modifierAt(stressModifiers, index)
      : stressModifierForFacility(state, cell.type, cell.level);
    // 이 칸의 자연 조건: 태양광·풍력은 건설 때 고른 방향이 최적 방향과 얼마나 맞는지,
    // 조력은 그 해안 칸의 조수간만의 차가 출력을 정한다. 지역 특성(zone) 위에 곱해진다.
    const site = {
      supply: cell.type === 'tidal'
        ? tidalFactor(state, index)
        : directionFactor(state, cell.type, index, cell.rotation),
    };
    // 그날의 수요 변동은 전력을 실제로 쓰는 시설(주거·공장·데이터센터·순환냉각·에너지저장
    // 보조전력)에만 걸린다. 발전 시설과 녹지는 수요가 0이라 곱할 것이 없다.
    const daily = {
      demand: FACILITY_DEMAND_BY_LEVEL[cell.type] ? demandVariation : 1,
      supply: cell.type === 'solar' ? weather.solarFactor : cell.type === 'wind' ? weather.windFactor : 1,
    };
    byFacility[index] = {
      event,
      zone,
      research,
      stress,
      site,
      daily,
      combined: composeModifiers(event, zone, research, stress, site, daily),
    };
  });
  return {
    byFacility,
    city: {
      coords,
      calendar,
      expansionUpkeep: expansionUpkeep(state),
      demandVariation,
      weather,
      healthCostFlat: 0,
      buildCostFlat: 0,
      waterLimit: activeEvent.city.waterLimit ?? stressCity.waterLimit ?? null,
      coolingEffectiveness: (activeEvent.city.coolingEffectiveness ?? 1) * (stressCity.coolingEffectiveness ?? 1),
      carbonFlat: (activeEvent.city.carbonFlat ?? 0) + (stressCity.carbonFlat ?? 0),
      activeEvent: activeEvent.event,
      healthMultiplier: carbonPressure.healthMultiplier,
      carbonPressure,
      batteryCapacityMultiplier: effects.batteryCapacity,
      transmissionLossPerExtraTile: effects.transmissionLossPerTile,
      batteryReservePolicies: effects.batteryReservePolicies,
      batteryEmergencyReserve: effects.batteryEmergencyReserve,
      greenCluster,
      greenFactoryHealthMultiplierByIndex,
    },
  };
}

export function facilityModifierAt(context, index) {
  return context?.byFacility?.[index] || identityModifier();
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
