import { RESEARCH_TUNING } from '../core/Constants.js';

export function researchEffects(state) {
  const completed = state.research?.completedIds || new Set();
  return {
    solarSupply: completed.has('solar2') ? 1.2 : 1,
    windSupply: completed.has('wind2') ? 1.15 : 1,
    lowWindSupply: completed.has('wind2')
      ? RESEARCH_TUNING.LOW_WIND_SUPPLY_RESEARCHED
      : RESEARCH_TUNING.LOW_WIND_SUPPLY_BASE,
    batteryCapacity: completed.has('battery2') ? 1.3 : 1,
    transmissionLossPerTile: completed.has('smartGrid') ? 0.04 : 0.06,
    batteryReservePolicies: completed.has('battery2'),
    batteryEmergencyReserve: completed.has('battery3'),
  };
}
