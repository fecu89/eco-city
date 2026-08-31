import { SIMULATION } from '../core/Constants.js';
import { createHexCoordinates } from './HexGridSystem.js';
import { calendarAtElapsedHour } from './CalendarSystem.js';
import { roundCredits } from '../core/Money.js';
import { applyCarbonCrisis } from './CarbonCrisisSystem.js';

const round1 = (value) => Math.round(value * 10) / 10;

export function createHourSettler({
  calculatePowerNetwork,
  settleEconomy,
  getResearchDemand = () => ({}),
  advanceResearch = () => ({ status: 'idle' }),
  evaluateQuest = null,
}) {
  return (state) => {
    const coords = createHexCoordinates(state.boardRadius);
    const calendar = calendarAtElapsedHour(state.elapsedGameHours);
    const additionalDemandByIndex = getResearchDemand(state);
    const power = calculatePowerNetwork({
      grid: state.grid,
      coords,
      hour: calendar.hour,
      tickIndex: state.tickIndex,
      heatwave: state.climateAlert === 'extreme_heat',
      additionalDemandByIndex,
    });
    Object.entries(power.nextBatteries).forEach(([index, stored]) => {
      const cell = state.grid[Number(index)];
      if (!cell) return;
      cell.batteryStoredLowCarbon = stored.lowCarbon;
      cell.batteryStoredFossil = stored.fossil;
    });
    const economy = settleEconomy({
      grid: state.grid,
      coords,
      facilityPower: power.facilityPower,
      credits: state.credits,
    });
    const creditsBefore = state.credits;
    state.credits = roundCredits(economy.nextCredits);
    state.lastSettlementDelta = roundCredits(state.credits - creditsBefore);
    const research = advanceResearch(state, power.facilityPower);
    const summary = {
      hour: calendar.hour,
      day: calendar.day,
      calendar,
      netCredits: economy.netCredits,
      hourlyCarbon: economy.hourlyCarbon,
      hourlyWater: economy.hourlyWater,
      lowCarbonPercent: power.lowCarbonPercent,
      deliveredPower: power.delivered,
      demand: power.demand,
      capacity: economy.labor.capacity,
      used: economy.labor.used,
      workforce: economy.labor.workforce,
      jobs: economy.labor.jobs,
      employmentRate: economy.labor.employmentRate,
      industryFill: economy.labor.industryFill,
      facilityPower: power.facilityPower,
      facilityEconomy: economy.facilityEconomy,
      facilityEnvironment: economy.facilityEnvironment,
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
    const carbonCrisis = applyCarbonCrisis(state, summary.hourlyCarbon);
    summary.carbonCrisis = carbonCrisis;
    state.tickIndex += 1;
    state.elapsedGameHours += 1;
    return { power, economy, research, carbonCrisis, summary };
  };
}

export function createSimulationController({
  settle,
  intervalMs = SIMULATION.HOUR_MS,
  getIntervalMs = (timeScale) => (timeScale === 0 ? null : intervalMs / timeScale),
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
  now = () => performance.now(),
}) {
  const pauseReasons = new Set();
  let timerId = null;
  let running = false;
  let timeScale = 1;
  let baseProgress = 0;
  let scheduledAt = null;
  let scheduledDelay = null;
  let scheduledInterval = null;

  const progressAt = (at = now()) => {
    if (timerId == null || scheduledAt == null || !scheduledInterval) return baseProgress;
    return Math.max(0, Math.min(1, baseProgress + (at - scheduledAt) / scheduledInterval));
  };

  const cancel = () => {
    if (timerId == null) return;
    clearTimer(timerId);
    timerId = null;
    scheduledAt = null;
    scheduledDelay = null;
    scheduledInterval = null;
  };
  const schedule = () => {
    if (!running || pauseReasons.size || timerId != null) return;
    const delay = getIntervalMs(timeScale);
    if (delay == null) return;
    scheduledAt = now();
    scheduledInterval = delay;
    scheduledDelay = delay * (1 - baseProgress);
    timerId = setTimer(() => {
      timerId = null;
      scheduledAt = null;
      scheduledDelay = null;
      scheduledInterval = null;
      baseProgress = 0;
      settle();
      schedule();
    }, scheduledDelay);
  };
  return {
    start() { running = true; schedule(); },
    pause(reason) {
      if (!pauseReasons.size) baseProgress = progressAt();
      pauseReasons.add(reason);
      cancel();
    },
    resume(reason) { pauseReasons.delete(reason); schedule(); },
    setTimeScale(scale) {
      getIntervalMs(scale);
      baseProgress = progressAt();
      timeScale = scale;
      if (scale === 0) pauseReasons.add('player');
      else pauseReasons.delete('player');
      cancel();
      schedule();
      return timeScale;
    },
    reset(scale = 1) {
      getIntervalMs(scale);
      cancel();
      pauseReasons.clear();
      baseProgress = 0;
      timeScale = scale;
      if (scale === 0) pauseReasons.add('player');
      schedule();
      return timeScale;
    },
    getProgress(at = now()) { return progressAt(at); },
    settleNow() { return settle(); },
    dispose() { running = false; cancel(); pauseReasons.clear(); baseProgress = 0; },
    getState() {
      return {
        running,
        paused: pauseReasons.size > 0,
        pauseReasons: [...pauseReasons],
        scheduled: timerId != null,
        timeScale,
        progress: progressAt(),
      };
    },
  };
}
