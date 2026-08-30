import { SIMULATION } from '../core/Constants.js';

const round1 = (value) => Math.round(value * 10) / 10;

export function createHourSettler({ calculatePowerNetwork, settleEconomy, evaluateQuest = null }) {
  return (state) => {
    const power = calculatePowerNetwork({
      grid: state.grid,
      size: state.gridSize,
      hour: state.simulationHour,
      tickIndex: state.tickIndex,
      heatwave: state.climateAlert === 'extreme_heat',
    });
    Object.entries(power.nextBatteries).forEach(([index, stored]) => {
      const cell = state.grid[Number(index)];
      if (!cell) return;
      cell.batteryStoredLowCarbon = stored.lowCarbon;
      cell.batteryStoredFossil = stored.fossil;
    });
    const economy = settleEconomy({
      grid: state.grid,
      size: state.gridSize,
      facilityPower: power.facilityPower,
      hiddenCostsUnlocked: state.questIndex >= 5,
      credits: state.credits,
    });
    state.credits = economy.nextCredits;
    state.tickIndex += 1;
    state.simulationHour += 1;
    if (state.simulationHour >= 24) {
      state.simulationHour = 0;
      state.simulationDay += 1;
    }
    const summary = {
      hour: state.simulationHour,
      day: state.simulationDay,
      netCredits: economy.netCredits,
      hourlyCarbon: economy.hourlyCarbon,
      hourlyWater: economy.hourlyWater,
      lowCarbonPercent: power.lowCarbonPercent,
      deliveredPower: power.delivered,
      demand: power.demand,
      workforce: economy.labor.workforce,
      jobs: economy.labor.jobs,
      employmentRate: economy.labor.employmentRate,
      industryFill: economy.labor.industryFill,
      facilityPower: power.facilityPower,
      facilityEconomy: economy.facilityEconomy,
      routes: power.routes,
      batteryStored: round1(Object.values(power.nextBatteries).reduce((sum, item) => sum + item.lowCarbon + item.fossil, 0)),
      overcrowding: economy.overcrowding,
      health: economy.health,
    };
    const deliveredOnRoutes = power.routes.reduce((sum, route) => sum + route.delivered, 0);
    const transmissionEfficiency = deliveredOnRoutes
      ? power.routes.reduce((sum, route) => sum + route.delivered * route.efficiency, 0) / deliveredOnRoutes * 100
      : 100;
    const essentialOutage = state.grid.some((cell, index) => cell
      && (cell.priority === 'essential' || ['residential', 'cooling'].includes(cell.type))
      && (power.facilityPower[index]?.ratio ?? 1) < 0.9);
    state.simulationTotals.hours += 1;
    state.simulationTotals.netCredits += economy.netCredits;
    state.simulationTotals.transmissionEfficiency += transmissionEfficiency / 100;
    state.simulationTotals.lowCarbonPercent += power.lowCarbonPercent;
    state.simulationTotals.employmentRate += economy.labor.employmentRate;
    state.simulationTotals.industryFill += economy.labor.industryFill;
    state.simulationTotals.essentialOutageHours += essentialOutage ? 1 : 0;
    state.simulationTotals.overcrowding += economy.overcrowding;
    state.simulationTotals.health += economy.health;
    state.lastTickSummary = summary;
    evaluateQuest?.(state, summary);
    return { power, economy, summary };
  };
}

export function createSimulationController({
  settle,
  intervalMs = SIMULATION.HOUR_MS,
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
}) {
  const pauseReasons = new Set();
  let timerId = null;
  let running = false;

  const cancel = () => {
    if (timerId == null) return;
    clearTimer(timerId);
    timerId = null;
  };
  const schedule = () => {
    if (!running || pauseReasons.size || timerId != null) return;
    timerId = setTimer(() => {
      timerId = null;
      settle();
      schedule();
    }, intervalMs);
  };
  return {
    start() { running = true; schedule(); },
    pause(reason) { pauseReasons.add(reason); cancel(); },
    resume(reason) { pauseReasons.delete(reason); schedule(); },
    settleNow() { return settle(); },
    dispose() { running = false; cancel(); pauseReasons.clear(); },
    getState() { return { running, paused: pauseReasons.size > 0, pauseReasons: [...pauseReasons], scheduled: timerId != null }; },
  };
}
