import { POWER_RULES, STORAGE_LEVELS } from '../core/Constants.js';
import { getDailySolarMultiplier, getDemandMultiplier, getWindMultiplier } from './ClimateSystem.js';
import { createHexCoordinates, hexDistance } from './HexGridSystem.js';
import { effectiveFacilityStats, facilityModifierAt } from './CityModifierSystem.js';
import { BATTERY_POLICIES } from '../core/OperationDefinitions.js';
import { operationProfileForCell, operationalGrid } from './ConstructionProjectSystem.js';

const round2 = (value) => Math.round(value * 100) / 100;
const LOW_CARBON = new Set(['nuclear', 'solar', 'wind', 'tidal']);
const PRIORITY = { essential: 0, normal: 1, saving: 2 };

const inferCoordinates = (grid) => createHexCoordinates(grid.length === 37 ? 3 : 2);
const distance = (a, b, coordinates) => hexDistance(coordinates[a], coordinates[b]);

function sourceDispatchOrder(a, b) {
  // 동일 전력망에서는 셀 배열 번호나 화면 각도가 아니라 저탄소 급전 원칙과 육각 거리만 결과를 결정한다.
  return Number(b.source.lowCarbon) - Number(a.source.lowCarbon)
    || b.efficiency - a.efficiency
    || a.source.index - b.source.index;
}

function candidateLowCarbonShare(candidate) {
  if (candidate.source) return candidate.source.lowCarbon ? 1 : 0;
  const stored = candidate.battery.lowCarbon + candidate.battery.fossil;
  return stored ? candidate.battery.lowCarbon / stored : 0;
}

export function directEfficiency(tileDistance, lossPerExtraTile = POWER_RULES.LOSS_PER_EXTRA_TILE) {
  return round2(Math.max(
    POWER_RULES.MIN_EFFICIENCY,
    1 - lossPerExtraTile * Math.max(0, tileDistance - 1),
  ));
}

export function batteryDischargeAvailable(battery, consumerPriority = 'normal') {
  const stored = Math.max(0, battery.lowCarbon + battery.fossil);
  const policy = BATTERY_POLICIES[battery.policy] || BATTERY_POLICIES.auto;
  const reserve = battery.capacity * policy.reserveRatio;
  if (policy.essentialOnlyBelowReserve && consumerPriority === 'essential') return stored;
  return Math.max(0, stored - reserve);
}

export function isBatteryHubForConsumer(batteryIndex, consumerIndex, coordinates) {
  return distance(batteryIndex, consumerIndex, coordinates) <= 1;
}

export function isBatteryNeighbor(batteryIndex, consumerIndex, coordinates) {
  return isBatteryHubForConsumer(batteryIndex, consumerIndex, coordinates);
}

function levelValue(cell, field, modifier = null) {
  return effectiveFacilityStats(cell, modifier)[field] || 0;
}

export function generationAvailabilityMultiplier(type, { dayIndex = 0, tickIndex = dayIndex } = {}) {
  if (type === 'solar') return getDailySolarMultiplier();
  if (type === 'wind') return getWindMultiplier(tickIndex);
  return 1;
}

export function calculatePowerNetwork({
  grid,
  coords = null,
  dayIndex = 0,
  tickIndex = 0,
  heatwave = false,
  additionalDemandByIndex = {},
  batteryHubEfficiency = POWER_RULES.HUB_EFFICIENCY,
  batteryReserveUnlocked = false,
  modifierContext = null,
}) {
  grid = operationalGrid(grid);
  const coordinates = coords || inferCoordinates(grid);
  const transmissionLossPerTile = modifierContext?.city?.transmissionLossPerExtraTile
    ?? POWER_RULES.LOSS_PER_EXTRA_TILE;
  const routeEfficiency = (fromIndex, toIndex) => directEfficiency(
    distance(fromIndex, toIndex, coordinates),
    transmissionLossPerTile,
  );
  const capacityMultiplier = modifierContext?.city?.batteryCapacityMultiplier || 1;
  const reservePoliciesUnlocked = modifierContext?.city?.batteryReservePolicies === true;
  const emergencyReserveUnlocked = modifierContext?.city?.batteryEmergencyReserve === true;
  const sourceDefinitions = [];
  const batteries = [];
  const consumers = [];

  grid.forEach((cell, index) => {
    if (!cell) return;
    if (['thermal', 'nuclear', 'solar', 'wind', 'tidal'].includes(cell.type)) {
      const multiplier = generationAvailabilityMultiplier(cell.type, { dayIndex, tickIndex });
      sourceDefinitions.push({
        index,
        type: cell.type,
        available: levelValue(cell, 'supply', facilityModifierAt(modifierContext, index)) * multiplier,
        lowCarbon: LOW_CARBON.has(cell.type),
      });
      return;
    }
    if (cell.type === 'battery') {
      const level = STORAGE_LEVELS[cell.level];
      const projectProfile = operationProfileForCell(cell);
      const requestedPolicy = cell.batteryPolicy || 'auto';
      const policy = requestedPolicy === 'essential'
        ? (emergencyReserveUnlocked && cell.level >= 3 ? requestedPolicy : 'auto')
        : requestedPolicy === 'reserve30' || requestedPolicy === 'reserve50'
          ? (reservePoliciesUnlocked && cell.level >= 2 ? requestedPolicy : 'auto')
          : 'auto';
      const capacity = level.capacity * capacityMultiplier;
      const rawLowCarbon = Math.max(0, Number(cell.batteryStoredLowCarbon) || 0);
      const rawFossil = Math.max(0, Number(cell.batteryStoredFossil) || 0);
      const storedScale = rawLowCarbon + rawFossil > capacity
        ? capacity / (rawLowCarbon + rawFossil)
        : 1;
      batteries.push({
        index,
        capacity,
        throughput: level.throughput * projectProfile.batteryThroughput,
        throughputLeft: level.throughput * projectProfile.batteryThroughput,
        lowCarbon: rawLowCarbon * storedScale,
        fossil: rawFossil * storedScale,
        policy,
      });
      return;
    }
    const demand = (levelValue(cell, 'demand', facilityModifierAt(modifierContext, index))
      + (Number(additionalDemandByIndex[index]) || 0)) * getDemandMultiplier(cell.type, {
      heatwave,
      adjacentGreen: grid.some((other, otherIndex) => other?.type === 'green' && distance(index, otherIndex, coordinates) === 1),
    });
    if (demand > 0) consumers.push({
      index,
      type: cell.type,
      demand,
      priority: cell.priority || (['residential', 'cooling'].includes(cell.type) ? 'essential' : 'normal'),
    });
  });
  const generationAvailable = sourceDefinitions.reduce((sum, source) => sum + source.available, 0);
  const generationAvailableByIndex = Object.fromEntries(sourceDefinitions.map(({ index, available }) => (
    [index, round2(available)]
  )));

  const hasThermalReserve = sourceDefinitions.some(({ type }) => type === 'thermal');
  const hasStoredBatteryReserve = batteryReserveUnlocked && batteries.some(({ lowCarbon, fossil }) => lowCarbon + fossil > 0);
  const initiallyPermittedSources = sourceDefinitions.filter(({ type }) => (
    type !== 'nuclear' || hasThermalReserve || hasStoredBatteryReserve
  ));

  const allocateBatteryAuxiliaryDemand = (definitions) => {
    const sources = definitions.map((source) => ({ ...source }));
    const facilityPower = {};
    const batteryOperations = {};
    const routes = [];
    let deliveredTotal = 0;
    let lowCarbonDelivered = 0;

    batteries.forEach((battery) => {
      const demand = levelValue(
        grid[battery.index],
        'demand',
        facilityModifierAt(modifierContext, battery.index),
      );
      let remaining = demand;
      let delivered = 0;
      const candidates = sources
        .map((source) => ({ source, efficiency: routeEfficiency(source.index, battery.index) }))
        .sort(sourceDispatchOrder);
      candidates.forEach(({ source, efficiency }) => {
        if (remaining <= 0) return;
        const possible = Math.min(remaining, source.available * efficiency);
        if (possible <= 0) return;
        source.available -= possible / efficiency;
        delivered += possible;
        remaining -= possible;
        if (source.lowCarbon) lowCarbonDelivered += possible;
        routes.push({
          kind: 'direct',
          purpose: 'battery_auxiliary',
          from: source.index,
          via: null,
          to: battery.index,
          delivered: round2(possible),
          lowCarbonDelivered: source.lowCarbon ? round2(possible) : 0,
          efficiency,
        });
      });
      const ratio = demand ? delivered / demand : 1;
      const canOperate = ratio >= POWER_RULES.BATTERY_OPERATION_MIN_RATIO;
      facilityPower[battery.index] = { demand: round2(demand), delivered: round2(delivered), ratio: round2(ratio) };
      batteryOperations[battery.index] = {
        demand: round2(demand),
        delivered: round2(delivered),
        ratio: round2(ratio),
        canOperate,
        charged: 0,
        discharged: 0,
      };
      deliveredTotal += delivered;
    });
    return { sources, facilityPower, batteryOperations, routes, deliveredTotal, lowCarbonDelivered };
  };

  let allocation = allocateBatteryAuxiliaryDemand(initiallyPermittedSources);
  const hasOperationalStoredReserve = batteries.some((battery) => (
    allocation.batteryOperations[battery.index]?.canOperate
    && battery.lowCarbon + battery.fossil > 0
  ));
  if (!hasThermalReserve
    && initiallyPermittedSources.some(({ type }) => type === 'nuclear')
    && !hasOperationalStoredReserve) {
    allocation = allocateBatteryAuxiliaryDemand(sourceDefinitions.filter(({ type }) => type !== 'nuclear'));
  }

  const { sources, facilityPower, batteryOperations, routes } = allocation;
  const activeBatteries = batteries.filter(({ index }) => batteryOperations[index]?.canOperate);

  consumers.sort((a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1)
    || (POWER_RULES.CONSUMER_TYPE_ORDER[a.type] ?? 99) - (POWER_RULES.CONSUMER_TYPE_ORDER[b.type] ?? 99)
    || a.index - b.index);
  let lowCarbonDelivered = allocation.lowCarbonDelivered;
  let deliveredTotal = allocation.deliveredTotal;
  const demandTotal = batteries.reduce((sum, battery) => sum + levelValue(
    grid[battery.index],
    'demand',
    facilityModifierAt(modifierContext, battery.index),
  ), 0)
    + consumers.reduce((sum, consumer) => sum + consumer.demand, 0);

  consumers.forEach((consumer) => {
    let remaining = consumer.demand;
    let delivered = 0;
    const candidates = [];
    sources.forEach((source) => candidates.push({ kind: 'direct', source, efficiency: routeEfficiency(source.index, consumer.index) }));
    activeBatteries.filter((battery) => isBatteryHubForConsumer(battery.index, consumer.index, coordinates)).forEach((battery) => {
      if (batteryDischargeAvailable(battery, consumer.priority) > 0) candidates.push({ kind: 'battery', battery, efficiency: batteryHubEfficiency });
      sources.forEach((source) => candidates.push({
        kind: 'hub',
        battery,
        source,
        efficiency: round2(routeEfficiency(source.index, battery.index) * batteryHubEfficiency),
      }));
    });
    candidates.sort((a, b) => candidateLowCarbonShare(b) - candidateLowCarbonShare(a)
      || b.efficiency - a.efficiency
      || (a.source?.index ?? a.battery.index) - (b.source?.index ?? b.battery.index));

    for (const candidate of candidates) {
      if (remaining <= 0) break;
      if (candidate.kind === 'battery') {
        const battery = candidate.battery;
        const stored = battery.lowCarbon + battery.fossil;
        const availableStored = batteryDischargeAvailable(battery, consumer.priority);
        const possible = Math.min(remaining, availableStored * batteryHubEfficiency, battery.throughputLeft);
        if (possible <= 0) continue;
        const drawn = possible / batteryHubEfficiency;
        const lowShare = stored ? battery.lowCarbon / stored : 0;
        battery.lowCarbon = Math.max(0, battery.lowCarbon - drawn * lowShare);
        battery.fossil = Math.max(0, battery.fossil - drawn * (1 - lowShare));
        battery.throughputLeft -= possible;
        batteryOperations[battery.index].discharged += drawn;
        lowCarbonDelivered += possible * lowShare;
        delivered += possible;
        remaining -= possible;
        routes.push({
          kind: 'battery',
          from: battery.index,
          via: battery.index,
          to: consumer.index,
          delivered: round2(possible),
          lowCarbonDelivered: round2(possible * lowShare),
          efficiency: candidate.efficiency,
        });
        continue;
      }
      const source = candidate.source;
      const battery = candidate.battery;
      const throughput = battery ? battery.throughputLeft : Infinity;
      const possible = Math.min(remaining, source.available * candidate.efficiency, throughput);
      if (possible <= 0) continue;
      source.available -= possible / candidate.efficiency;
      if (battery) battery.throughputLeft -= possible;
      if (source.lowCarbon) lowCarbonDelivered += possible;
      delivered += possible;
      remaining -= possible;
      routes.push({
        kind: battery ? 'battery' : 'direct',
        from: source.index,
        via: battery?.index ?? null,
        to: consumer.index,
        delivered: round2(possible),
        lowCarbonDelivered: source.lowCarbon ? round2(possible) : 0,
        efficiency: candidate.efficiency,
      });
    }
    facilityPower[consumer.index] = {
      demand: round2(consumer.demand),
      delivered: round2(delivered),
      ratio: consumer.demand ? round2(delivered / consumer.demand) : 1,
    };
    deliveredTotal += delivered;
  });

  const nextBatteries = {};
  batteries.forEach((battery) => {
    const stored = battery.lowCarbon + battery.fossil;
    const room = Math.max(0, battery.capacity - stored);
    if (batteryOperations[battery.index].canOperate && room > 0 && battery.throughputLeft > 0) {
      const chargeSources = [...sources].sort((a, b) => Number(b.lowCarbon) - Number(a.lowCarbon)
        || routeEfficiency(b.index, battery.index) - routeEfficiency(a.index, battery.index)
        || a.index - b.index);
      for (const source of chargeSources) {
        const efficiency = routeEfficiency(source.index, battery.index) * batteryHubEfficiency;
        const charge = Math.min(room - (battery.lowCarbon + battery.fossil - stored), battery.throughputLeft, source.available * efficiency);
        if (charge <= 0) continue;
        source.available -= charge / efficiency;
        battery.throughputLeft -= charge;
        if (source.lowCarbon) battery.lowCarbon += charge;
        else battery.fossil += charge;
        batteryOperations[battery.index].charged += charge;
      }
    }
    batteryOperations[battery.index].charged = round2(batteryOperations[battery.index].charged);
    batteryOperations[battery.index].discharged = round2(batteryOperations[battery.index].discharged);
    nextBatteries[battery.index] = { lowCarbon: round2(battery.lowCarbon), fossil: round2(battery.fossil) };
  });

  return {
    facilityPower,
    batteryOperations,
    routes,
    nextBatteries,
    demand: round2(demandTotal),
    delivered: round2(deliveredTotal),
    loss: round2(Math.max(0, demandTotal - deliveredTotal)),
    lowCarbonDelivered: round2(lowCarbonDelivered),
    generationAvailable: round2(generationAvailable),
    generationAvailableByIndex,
    lowCarbonSurplus: round2(sources
      .filter(({ lowCarbon }) => lowCarbon)
      .reduce((sum, source) => sum + Math.max(0, source.available), 0)),
    lowCarbonPercent: deliveredTotal ? Math.round((lowCarbonDelivered / deliveredTotal) * 100) : 0,
  };
}
