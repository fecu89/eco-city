import { SIMULATION } from '../core/Constants.js';
import { createHexCoordinates } from './HexGridSystem.js';
import { calendarAtElapsedHour } from './CalendarSystem.js';
import { roundCredits } from '../core/Money.js';
import { applyCarbonCrisis } from './CarbonCrisisSystem.js';
import { applyAutomaticOperationModes, buildCityModifierContext } from './CityModifierSystem.js';
import { advanceCityEvents } from './CityEventSystem.js';
import { applyOperationalRisk, isOperationalRiskActive } from './CityFailureSystem.js';
import { advanceStressTest } from './StressTestSystem.js';
import { advanceConstructionProjects, isOperationalCell } from './ConstructionProjectSystem.js';

const round1 = (value) => Math.round(value * 10) / 10;

export function createHourSettler({
  calculatePowerNetwork,
  settleEconomy,
  getResearchDemand = () => ({}),
  advanceResearch = () => ({ status: 'idle' }),
  evaluateQuest = null,
}) {
  return (state) => {
    state.elapsedGameHours += 1;
    state.tickIndex += 1;
    const construction = advanceConstructionProjects(state);
    const coords = createHexCoordinates(state.boardRadius);
    const calendar = calendarAtElapsedHour(state.elapsedGameHours);
    const stressRunning = state.stressTest?.status === 'running';
    const eventTransition = stressRunning
      ? { forecasted: null, started: null, ended: null, result: null }
      : advanceCityEvents(state);
    const automaticModeChanges = applyAutomaticOperationModes(state);
    const modifierContext = buildCityModifierContext(state, { coords, calendar });
    const additionalDemandByIndex = getResearchDemand(state);
    const power = calculatePowerNetwork({
      grid: state.grid,
      coords,
      hour: calendar.hour,
      tickIndex: state.tickIndex,
      heatwave: state.climateAlert === 'extreme_heat',
      additionalDemandByIndex,
      batteryReserveUnlocked: state.claimedQuestIds?.has?.('storage-hub') === true,
      modifierContext,
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
      modifierContext,
    });
    const creditsBefore = state.credits;
    state.credits = roundCredits(economy.nextCredits);
    state.lastSettlementDelta = roundCredits(state.credits - creditsBefore);
    const research = advanceResearch(state, power.facilityPower, modifierContext);
    const summary = {
      hour: calendar.hour,
      day: calendar.day,
      calendar,
      netCredits: economy.netCredits,
      hourlyCarbon: economy.hourlyCarbon,
      hourlyWater: economy.hourlyWater,
      lowCarbonPercent: power.lowCarbonPercent,
      lowCarbonDelivered: power.lowCarbonDelivered,
      lowCarbonSurplus: power.lowCarbonSurplus,
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
      batteryOperations: power.batteryOperations,
      batteryStored: round1(Object.values(power.nextBatteries).reduce((sum, item) => sum + item.lowCarbon + item.fossil, 0)),
      overcrowding: economy.overcrowding,
      health: economy.health,
      expansionUpkeep: economy.expansionUpkeep,
      modifiers: modifierContext,
      waterLimit: modifierContext.city.waterLimit,
      automaticModeChanges,
    };
    const deliveredOnRoutes = power.routes.reduce((sum, route) => sum + route.delivered, 0);
    const transmissionEfficiency = deliveredOnRoutes
      ? power.routes.reduce((sum, route) => sum + route.delivered * route.efficiency, 0) / deliveredOnRoutes * 100
      : 100;
    const essentialIndices = state.grid
      .map((cell, index) => (isOperationalCell(cell)
        && (cell.priority === 'essential' || ['residential', 'cooling'].includes(cell.type)) ? index : null))
      .filter((index) => index != null);
    const essentialSupplyPercent = essentialIndices.length
      ? essentialIndices.reduce((sum, index) => sum + (power.facilityPower[index]?.ratio ?? 0), 0) / essentialIndices.length * 100
      : 0;
    const essentialOutage = essentialIndices.some((index) => (power.facilityPower[index]?.ratio ?? 0) < 0.9);
    summary.transmissionEfficiency = round1(transmissionEfficiency);
    summary.essentialSupplyPercent = round1(essentialSupplyPercent);
    const cityEvent = stressRunning
      ? { active: null, forecast: null, forecasted: null, started: null, ended: null, result: null }
      : advanceCityEvents(state, summary);
    summary.cityEvent = {
      active: cityEvent.active,
      forecast: cityEvent.forecast,
      forecasted: eventTransition.forecasted || cityEvent.forecasted,
      started: eventTransition.started || cityEvent.started,
      ended: eventTransition.ended || cityEvent.ended,
      result: eventTransition.result || cityEvent.result,
    };
    const operationalRisk = stressRunning
      ? { warnings: [], pauseTransition: null, gameOverTransition: false, risk: state.operationalRisk }
      : applyOperationalRisk(state, summary);
    summary.operationalRisk = operationalRisk;
    state.simulationTotals.hours += 1;
    state.simulationTotals.netCredits += economy.netCredits;
    state.simulationTotals.transmissionEfficiency += transmissionEfficiency / 100;
    state.simulationTotals.lowCarbonPercent += power.lowCarbonPercent;
    state.simulationTotals.employmentRate += economy.labor.employmentRate;
    state.simulationTotals.industryFill += economy.labor.industryFill;
    state.simulationTotals.essentialOutageHours += isOperationalRiskActive(state) && essentialOutage ? 1 : 0;
    state.simulationTotals.overcrowding += economy.overcrowding;
    state.simulationTotals.health += economy.health;
    state.simulationTotals.deliveredEnergy = (state.simulationTotals.deliveredEnergy || 0) + power.delivered;
    state.simulationTotals.renewableDeliveredEnergy = (state.simulationTotals.renewableDeliveredEnergy || 0)
      + power.routes.reduce((sum, route) => (
        ['solar', 'wind', 'tidal'].includes(state.grid[route.from]?.type) ? sum + route.delivered : sum
      ), 0);
    state.simulationTotals.nuclearDeliveredEnergy = (state.simulationTotals.nuclearDeliveredEnergy || 0)
      + power.routes.reduce((sum, route) => state.grid[route.from]?.type === 'nuclear' ? sum + route.delivered : sum, 0);
    state.simulationTotals.batteryEnergyUsed = (state.simulationTotals.batteryEnergyUsed || 0)
      + Object.values(power.batteryOperations || {}).reduce((sum, operation) => sum + (operation.discharged || 0), 0);
    state.simulationTotals.grossIncome = (state.simulationTotals.grossIncome || 0) + economy.grossIncome;
    state.simulationTotals.factoryIncome = (state.simulationTotals.factoryIncome || 0)
      + Object.entries(economy.facilityEconomy).reduce((sum, [index, facility]) => (
        state.grid[Number(index)]?.type === 'factory' ? sum + facility.income : sum
      ), 0);
    state.simulationTotals.peakDemand = Math.max(state.simulationTotals.peakDemand || 0, power.demand);
    state.simulationTotals.peakAvailableSupply = Math.max(
      state.simulationTotals.peakAvailableSupply || 0,
      power.generationAvailable,
    );
    state.lastTickSummary = summary;
    if (!stressRunning) evaluateQuest?.(state, summary);
    const carbonCrisis = applyCarbonCrisis(state, summary.hourlyCarbon);
    summary.carbonCrisis = carbonCrisis;
    const stressTest = stressRunning ? advanceStressTest(state, summary) : null;
    summary.stressTest = stressTest;
    return { construction, power, economy, research, carbonCrisis, operationalRisk, cityEvent: summary.cityEvent, stressTest, summary };
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
