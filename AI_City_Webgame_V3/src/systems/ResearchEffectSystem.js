export function researchEffects(state) {
  const completed = state.research?.completedIds || new Set();
  return {
    solarSupply: completed.has('solar2') ? 1.2 : 1,
    windSupply: completed.has('wind2') ? 1.15 : 1,
    lowWindSupply: completed.has('wind2') ? 0.5 : 0.35,
    batteryCapacity: completed.has('battery2') ? 1.3 : 1,
    transmissionLossPerTile: completed.has('smartGrid') ? 0.04 : 0.06,
    demandResponse: completed.has('demandResponse'),
    batteryReservePolicies: completed.has('battery2'),
    batteryEmergencyReserve: completed.has('battery3'),
  };
}
