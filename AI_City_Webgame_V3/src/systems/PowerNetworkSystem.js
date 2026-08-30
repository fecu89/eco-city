import { FACILITIES, LEVEL_MULTIPLIERS, POWER_RULES, STORAGE_LEVELS } from '../core/Constants.js';
import { getDemandMultiplier, getSolarMultiplier, getWindMultiplier } from './ClimateSystem.js';

const round2 = (value) => Math.round(value * 100) / 100;
const LOW_CARBON = new Set(['nuclear', 'solar', 'wind']);
const PRIORITY = { essential: 0, normal: 1, saving: 2 };

const coords = (index, size) => [Math.floor(index / size), index % size];
const distance = (a, b, size) => {
  const [ar, ac] = coords(a, size);
  const [br, bc] = coords(b, size);
  return Math.abs(ar - br) + Math.abs(ac - bc);
};

export function directEfficiency(tileDistance) {
  return round2(Math.max(
    POWER_RULES.MIN_EFFICIENCY,
    1 - POWER_RULES.LOSS_PER_EXTRA_TILE * Math.max(0, tileDistance - 1),
  ));
}

export function isBatteryNeighbor(batteryIndex, consumerIndex, size) {
  const [br, bc] = coords(batteryIndex, size);
  const [cr, cc] = coords(consumerIndex, size);
  return Math.max(Math.abs(br - cr), Math.abs(bc - cc)) === 1;
}

function levelValue(cell, field) {
  const facility = FACILITIES[cell.type];
  if (field === 'supply') return (facility.supply || 0) * LEVEL_MULTIPLIERS.output[cell.level];
  return (facility.demand || 0) * LEVEL_MULTIPLIERS.demand[cell.level];
}

export function calculatePowerNetwork({ grid, size, hour = 12, tickIndex = 0, heatwave = false }) {
  const sources = [];
  const batteries = [];
  const consumers = [];
  const facilityPower = {};

  grid.forEach((cell, index) => {
    if (!cell) return;
    if (['thermal', 'nuclear', 'solar', 'wind'].includes(cell.type)) {
      let multiplier = 1;
      if (cell.type === 'solar') multiplier = getSolarMultiplier(hour);
      if (cell.type === 'wind') multiplier = getWindMultiplier(tickIndex);
      sources.push({ index, type: cell.type, available: levelValue(cell, 'supply') * multiplier, lowCarbon: LOW_CARBON.has(cell.type) });
      return;
    }
    if (cell.type === 'battery') {
      const level = STORAGE_LEVELS[cell.level];
      batteries.push({
        index,
        capacity: level.capacity,
        throughput: level.throughput,
        throughputLeft: level.throughput,
        lowCarbon: cell.batteryStoredLowCarbon || 0,
        fossil: cell.batteryStoredFossil || 0,
      });
      return;
    }
    const demand = levelValue(cell, 'demand') * getDemandMultiplier(cell.type, {
      heatwave,
      adjacentGreen: grid.some((other, otherIndex) => other?.type === 'green' && distance(index, otherIndex, size) === 1),
    });
    if (demand > 0) consumers.push({ index, demand, priority: cell.priority || (['residential', 'cooling'].includes(cell.type) ? 'essential' : 'normal') });
  });

  consumers.sort((a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || a.index - b.index);
  const routes = [];
  let lowCarbonDelivered = 0;
  let deliveredTotal = 0;
  const demandTotal = consumers.reduce((sum, consumer) => sum + consumer.demand, 0);

  consumers.forEach((consumer) => {
    let remaining = consumer.demand;
    let delivered = 0;
    const candidates = [];
    sources.forEach((source) => candidates.push({ kind: 'direct', source, efficiency: directEfficiency(distance(source.index, consumer.index, size)) }));
    batteries.filter((battery) => isBatteryNeighbor(battery.index, consumer.index, size)).forEach((battery) => {
      if (battery.lowCarbon + battery.fossil > 0) candidates.push({ kind: 'battery', battery, efficiency: POWER_RULES.HUB_EFFICIENCY });
      sources.forEach((source) => candidates.push({
        kind: 'hub',
        battery,
        source,
        efficiency: round2(directEfficiency(distance(source.index, battery.index, size)) * POWER_RULES.HUB_EFFICIENCY),
      }));
    });
    candidates.sort((a, b) => b.efficiency - a.efficiency || (a.source?.index ?? a.battery.index) - (b.source?.index ?? b.battery.index));

    for (const candidate of candidates) {
      if (remaining <= 0) break;
      if (candidate.kind === 'battery') {
        const battery = candidate.battery;
        const stored = battery.lowCarbon + battery.fossil;
        const possible = Math.min(remaining, stored * POWER_RULES.HUB_EFFICIENCY, battery.throughputLeft);
        if (possible <= 0) continue;
        const drawn = possible / POWER_RULES.HUB_EFFICIENCY;
        const lowShare = stored ? battery.lowCarbon / stored : 0;
        battery.lowCarbon = Math.max(0, battery.lowCarbon - drawn * lowShare);
        battery.fossil = Math.max(0, battery.fossil - drawn * (1 - lowShare));
        battery.throughputLeft -= possible;
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
    if (room > 0 && battery.throughputLeft > 0) {
      const chargeSources = [...sources].sort((a, b) => directEfficiency(distance(b.index, battery.index, size)) - directEfficiency(distance(a.index, battery.index, size)));
      for (const source of chargeSources) {
        const efficiency = directEfficiency(distance(source.index, battery.index, size)) * POWER_RULES.HUB_EFFICIENCY;
        const charge = Math.min(room - (battery.lowCarbon + battery.fossil - stored), battery.throughputLeft, source.available * efficiency);
        if (charge <= 0) continue;
        source.available -= charge / efficiency;
        battery.throughputLeft -= charge;
        if (source.lowCarbon) battery.lowCarbon += charge;
        else battery.fossil += charge;
      }
    }
    nextBatteries[battery.index] = { lowCarbon: round2(battery.lowCarbon), fossil: round2(battery.fossil) };
  });

  return {
    facilityPower,
    routes,
    nextBatteries,
    demand: round2(demandTotal),
    delivered: round2(deliveredTotal),
    loss: round2(Math.max(0, demandTotal - deliveredTotal)),
    lowCarbonDelivered: round2(lowCarbonDelivered),
    lowCarbonPercent: deliveredTotal ? Math.round((lowCarbonDelivered / deliveredTotal) * 100) : 0,
  };
}
