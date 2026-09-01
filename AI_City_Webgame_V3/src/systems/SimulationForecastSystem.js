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

function remainingDays(project) {
  return Math.max(0, project.durationDays - project.elapsedDays);
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

function severityForDay(day) {
  const warnings = day.warnings.length;
  const powerGap = Math.max(0, day.summary.demand - day.summary.deliveredPower);
  const creditGap = Math.max(0, -day.summary.netCredits);
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

function runForecastForHorizon(forecastState, settleDay, fallbackSummary, horizonDays) {
  const daily = [];
  const timeline = [];
  let finalResult = null;

  eventBus.withSuppressedEvents(() => {
    for (let dayOffset = 1; dayOffset <= horizonDays; dayOffset += 1) {
      finalResult = settleDay(forecastState);
      const day = {
        dayOffset,
        summary: structuredClone(finalResult.summary),
        economy: structuredClone(finalResult.economy),
        power: structuredClone(finalResult.power),
        warnings: forecastWarnings(finalResult),
      };
      daily.push(day);
      if (finalResult.construction.completed.length) {
        timeline.push({
          ...day,
          completed: structuredClone(finalResult.construction.completed),
        });
      }
    }
  });

  const worstInterval = daily.length
    ? daily.reduce((worst, day) => severityForDay(day) > severityForDay(worst) ? day : worst)
    : null;

  return {
    horizonDays,
    daily,
    timeline,
    worstInterval,
    finalSummary: finalResult?.summary ? structuredClone(finalResult.summary) : fallbackSummary,
    finalEconomy: finalResult?.economy ? structuredClone(finalResult.economy) : null,
    finalPower: finalResult?.power ? structuredClone(finalResult.power) : null,
    finalState: forecastState,
  };
}

function runProjectForecast(forecastState, settleDay, fallbackSummary) {
  const horizonDays = activeProjects(forecastState)
    .reduce((maximum, { project }) => Math.max(maximum, remainingDays(project)), 0);
  return runForecastForHorizon(forecastState, settleDay, fallbackSummary, horizonDays);
}

export function forecastConstruction(state, plannedProjects = [], { settleDay } = {}) {
  if (typeof settleDay !== 'function') throw new TypeError('forecastConstruction requires settleDay.');
  const forecastState = cloneSimulationState(state);
  plannedProjects.forEach((planned) => placePlannedProject(forecastState, planned));
  return runProjectForecast(forecastState, settleDay, state.lastTickSummary);
}

export function forecastUpgrade(state, index, { paidCost, settleDay } = {}) {
  if (typeof settleDay !== 'function') throw new TypeError('forecastUpgrade requires settleDay.');
  const forecastState = cloneSimulationState(state);
  const cell = forecastState.grid[index];
  if (!cell || cell.project) throw new Error(`Invalid upgrade forecast cell: ${index}`);
  const normalizedCost = roundCredits(Math.max(0, Number(paidCost) || 0));
  cell.project = createUpgradeProject({ cell, paidCost: normalizedCost });
  forecastState.credits = roundCredits(forecastState.credits - normalizedCost);
  return runProjectForecast(forecastState, settleDay, state.lastTickSummary);
}

export function forecastSimulation(state, horizonDays, { settleDay } = {}) {
  if (typeof settleDay !== 'function') throw new TypeError('forecastSimulation requires settleDay.');
  const days = Math.max(0, Math.trunc(Number(horizonDays) || 0));
  const forecastState = cloneSimulationState(state);
  return runForecastForHorizon(forecastState, settleDay, state.lastTickSummary, days);
}
