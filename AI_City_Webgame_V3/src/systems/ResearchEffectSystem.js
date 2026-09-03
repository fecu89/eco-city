import { POWER_RULES, RESEARCH_EFFECTS, RESEARCH_TUNING } from '../core/Constants.js';

// 완료한 연구가 시뮬레이션에 주는 효과. 배수는 settings.json RESEARCH_EFFECTS, 연구 전 송전 손실은 POWER_RULES.
export function researchEffects(state) {
  const completed = state.research?.completedIds || new Set();
  return {
    solarSupply: completed.has('solar2') ? RESEARCH_EFFECTS.SOLAR_SUPPLY : 1,
    windSupply: completed.has('wind2') ? RESEARCH_EFFECTS.WIND_SUPPLY : 1,
    lowWindSupply: completed.has('wind2')
      ? RESEARCH_TUNING.LOW_WIND_SUPPLY_RESEARCHED
      : RESEARCH_TUNING.LOW_WIND_SUPPLY_BASE,
    batteryCapacity: completed.has('battery2') ? RESEARCH_EFFECTS.BATTERY_CAPACITY : 1,
    transmissionLossPerTile: completed.has('smartGrid')
      ? RESEARCH_EFFECTS.SMART_GRID_LOSS_PER_EXTRA_TILE
      : POWER_RULES.LOSS_PER_EXTRA_TILE,
    batteryReservePolicies: completed.has('battery2'),
    batteryEmergencyReserve: completed.has('battery3'),
  };
}
