import { GameState } from '../core/GameState.js';
import { eventBus } from '../core/EventBus.js';
import { roundCredits } from '../core/Money.js';
import { createBuildProject, createUpgradeProject } from './ConstructionProjectSystem.js';

export function cloneSimulationState(state) {
  const clone = new GameState();
  if (!clone.hydrate(structuredClone(state.serialize()))) {
    throw new Error('Unable to clone game state for construction forecast.');
  }
  return clone;
}

function remainingHours(project) {
  return Math.max(0, project.durationHours - project.elapsedHours);
}

function activeProjects(state) {
  return state.grid
    .map((cell, index) => cell?.project ? { index, cell, project: cell.project } : null)
    .filter(Boolean);
}

function forecastWarnings(result) {
  const warnings = [];
  const { summary } = result;
  if (summary.deliveredPower + 0.001 < summary.demand) warnings.push('power_shortfall');
  if (summary.netCredits < 0) warnings.push('negative_income');
  if (summary.used > summary.capacity) warnings.push('workforce_shortage');
  if (summary.demand > 0 && summary.batteryStored <= 0) warnings.push('battery_empty');
  if (summary.cityEvent?.started) warnings.push('city_event_started');
  return warnings;
}

function severityForHour(hour) {
  const warnings = hour.warnings.length;
  const powerGap = Math.max(0, hour.summary.demand - hour.summary.deliveredPower);
  const creditGap = Math.max(0, -hour.summary.netCredits);
  return warnings * 1000 + powerGap * 10 + creditGap;
}

function placePlannedProject(state, planned) {
  const { index, type } = planned;
  if (!Number.isInteger(index) || index < 0 || index >= state.grid.length) {
    throw new Error(`Invalid planned project index: ${index}`);
  }
  if (state.grid[index]) throw new Error(`Planned project cell ${index} is already occupied.`);
  const paidCost = roundCredits(Math.max(0, Number(planned.paidCost) || 0));
  state.grid[index] = {
    type,
    level: 1,
    operationMode: 'normal',
    priority: ['residential', 'cooling'].includes(type) ? 'essential' : 'normal',
    ...(type === 'battery' ? {
      batteryPolicy: 'auto',
      batteryStoredLowCarbon: 0,
      batteryStoredFossil: 0,
    } : {}),
    project: createBuildProject({ type, paidCost }),
  };
  state.credits = roundCredits(state.credits - paidCost);
}

function runForecast(forecastState, settleHour, fallbackSummary) {
  const horizonHours = activeProjects(forecastState)
    .reduce((maximum, { project }) => Math.max(maximum, remainingHours(project)), 0);
  const hourly = [];
  const timeline = [];
  let finalResult = null;

  eventBus.withSuppressedEvents(() => {
    for (let hourOffset = 1; hourOffset <= horizonHours; hourOffset += 1) {
      finalResult = settleHour(forecastState);
      const hour = {
        hourOffset,
        summary: structuredClone(finalResult.summary),
        economy: structuredClone(finalResult.economy),
        power: structuredClone(finalResult.power),
        warnings: forecastWarnings(finalResult),
      };
      hourly.push(hour);
      if (finalResult.construction.completed.length) {
        timeline.push({
          ...hour,
          completed: structuredClone(finalResult.construction.completed),
        });
      }
    }
  });

  const worstInterval = hourly.length
    ? hourly.reduce((worst, hour) => severityForHour(hour) > severityForHour(worst) ? hour : worst)
    : null;

  return {
    horizonHours,
    hourly,
    timeline,
    worstInterval,
    finalSummary: finalResult?.summary ? structuredClone(finalResult.summary) : fallbackSummary,
    finalEconomy: finalResult?.economy ? structuredClone(finalResult.economy) : null,
    finalPower: finalResult?.power ? structuredClone(finalResult.power) : null,
    finalState: forecastState,
  };
}

export function forecastConstruction(state, plannedProjects = [], { settleHour } = {}) {
  if (typeof settleHour !== 'function') throw new TypeError('forecastConstruction requires settleHour.');
  const forecastState = cloneSimulationState(state);
  plannedProjects.forEach((planned) => placePlannedProject(forecastState, planned));
  return runForecast(forecastState, settleHour, state.lastTickSummary);
}

export function forecastUpgrade(state, index, { paidCost, settleHour } = {}) {
  if (typeof settleHour !== 'function') throw new TypeError('forecastUpgrade requires settleHour.');
  const forecastState = cloneSimulationState(state);
  const cell = forecastState.grid[index];
  if (!cell || cell.project) throw new Error(`Invalid upgrade forecast cell: ${index}`);
  const normalizedCost = roundCredits(Math.max(0, Number(paidCost) || 0));
  cell.project = createUpgradeProject({ cell, paidCost: normalizedCost });
  forecastState.credits = roundCredits(forecastState.credits - normalizedCost);
  return runForecast(forecastState, settleHour, state.lastTickSummary);
}
