import { CONSTRUCTION, FACILITIES } from '../core/Constants.js';
import { roundCredits } from '../core/Money.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const IDENTITY_OPERATION_PROFILE = Object.freeze({
  operational: true,
  dev: 1,
  supply: 1,
  demand: 1,
  income: 1,
  upkeep: 1,
  carbon: 1,
  water: 1,
  researchSpeed: 1,
  workforce: 1,
  functionality: 1,
  batteryCapacity: 1,
  batteryThroughput: 1,
});

const ZERO_OPERATION_PROFILE = Object.freeze({
  operational: false,
  dev: 0,
  supply: 0,
  demand: 0,
  income: 0,
  upkeep: 0,
  carbon: 0,
  water: 0,
  researchSpeed: 0,
  workforce: 0,
  functionality: 0,
  batteryCapacity: 0,
  batteryThroughput: 0,
});

export function constructionDurationHours(type) {
  return CONSTRUCTION.BUILD_HOURS[type] ?? null;
}

export function upgradeDurationHours(fromLevel) {
  return CONSTRUCTION.UPGRADE_HOURS[Math.trunc(Number(fromLevel))] ?? null;
}

export function createBuildProject({ type, paidCost }) {
  const durationHours = constructionDurationHours(type);
  if (!FACILITIES[type] || !durationHours) throw new Error(`Unknown build project type: ${type}`);
  return {
    kind: 'build',
    elapsedHours: 0,
    durationHours,
    paidCost: roundCredits(Math.max(0, Number(paidCost) || 0)),
  };
}

export function createUpgradeProject({ cell, paidCost }) {
  const fromLevel = Math.trunc(Number(cell?.level));
  const durationHours = upgradeDurationHours(fromLevel);
  const facility = FACILITIES[cell?.type];
  if (!facility || !durationHours || fromLevel >= facility.maxLevel) {
    throw new Error(`Invalid upgrade project: ${cell?.type || 'unknown'} Lv.${fromLevel || 0}`);
  }
  return {
    kind: 'upgrade',
    fromLevel,
    toLevel: fromLevel + 1,
    elapsedHours: 0,
    durationHours,
    paidCost: roundCredits(Math.max(0, Number(paidCost) || 0)),
    suspendedOperationMode: cell.operationMode || 'normal',
  };
}

export function isBuildProject(cell) {
  return cell?.project?.kind === 'build';
}

export function isOperationalCell(cell) {
  return Boolean(cell) && !isBuildProject(cell);
}

export function operationalGrid(grid = []) {
  return grid.map((cell) => isOperationalCell(cell) ? cell : null);
}

export function completedCellForProject(cell) {
  if (!cell) return null;
  const completed = { ...cell, project: null };
  if (cell.project?.kind === 'upgrade') {
    completed.level = cell.project.toLevel;
    completed.operationMode = cell.project.suspendedOperationMode || cell.operationMode || 'normal';
  }
  return completed;
}

export function finalGridAfterProjects(grid = []) {
  return grid.map(completedCellForProject);
}

export function operationProfileForCell(cell) {
  const project = cell?.project;
  if (!project) return IDENTITY_OPERATION_PROFILE;
  if (project.kind === 'build') return ZERO_OPERATION_PROFILE;
  if (project.kind !== 'upgrade') return IDENTITY_OPERATION_PROFILE;

  const ratio = CONSTRUCTION.UPGRADE_RATIOS[project.fromLevel] ?? 1;
  if (cell.type === 'residential') {
    return { ...IDENTITY_OPERATION_PROFILE, dev: 0.8, supply: 0.8, demand: 0.8, income: 0.8, carbon: 0.8, water: 0.8, researchSpeed: 0.8, workforce: 0.8, functionality: 0.8 };
  }
  if (cell.type === 'data') {
    return { ...IDENTITY_OPERATION_PROFILE, dev: ratio, supply: ratio, demand: 0.7, income: 0.6, carbon: 0.7, water: 0.7, researchSpeed: 0.5, functionality: 0.7 };
  }
  if (cell.type === 'battery') {
    return { ...IDENTITY_OPERATION_PROFILE, dev: ratio, batteryThroughput: 0.5 };
  }
  return {
    ...IDENTITY_OPERATION_PROFILE,
    dev: ratio,
    supply: ratio,
    demand: ratio,
    income: ratio,
    carbon: ratio,
    water: ratio,
    researchSpeed: ratio,
    functionality: ratio,
  };
}

export function normalizeConstructionProject(cell, rawProject) {
  if (rawProject == null) return { valid: true, complete: false, project: null };
  const kind = rawProject?.kind;
  const paidCost = Number(rawProject?.paidCost);
  const elapsedHours = Number(rawProject?.elapsedHours);
  const durationHours = Number(rawProject?.durationHours);
  const commonValid = ['build', 'upgrade'].includes(kind)
    && Number.isFinite(paidCost)
    && paidCost >= 0
    && Number.isInteger(elapsedHours)
    && elapsedHours >= 0
    && Number.isInteger(durationHours)
    && durationHours > 0;
  if (!commonValid) {
    return { valid: false, kind, restoreOperationMode: rawProject?.suspendedOperationMode || cell?.operationMode || 'normal' };
  }

  if (kind === 'build') {
    const expectedDuration = constructionDurationHours(cell?.type);
    if (!expectedDuration || durationHours !== expectedDuration) return { valid: false, kind };
    return {
      valid: true,
      complete: elapsedHours >= durationHours,
      project: {
        kind,
        elapsedHours: Math.min(elapsedHours, durationHours),
        durationHours,
        paidCost: roundCredits(paidCost),
      },
    };
  }

  const fromLevel = Number(rawProject?.fromLevel);
  const toLevel = Number(rawProject?.toLevel);
  const expectedDuration = upgradeDurationHours(fromLevel);
  const validUpgrade = Number.isInteger(fromLevel)
    && Number.isInteger(toLevel)
    && fromLevel === Number(cell?.level)
    && toLevel === fromLevel + 1
    && toLevel <= (FACILITIES[cell?.type]?.maxLevel || 0)
    && durationHours === expectedDuration;
  if (!validUpgrade) {
    return { valid: false, kind, restoreOperationMode: rawProject?.suspendedOperationMode || cell?.operationMode || 'normal' };
  }
  return {
    valid: true,
    complete: elapsedHours >= durationHours,
    project: {
      kind,
      fromLevel,
      toLevel,
      elapsedHours: Math.min(elapsedHours, durationHours),
      durationHours,
      paidCost: roundCredits(paidCost),
      suspendedOperationMode: rawProject?.suspendedOperationMode || cell?.operationMode || 'normal',
    },
  };
}

export function projectProgress(project, fractionalHour = 0) {
  const duration = Math.max(1, Math.trunc(Number(project?.durationHours) || 0));
  const elapsed = Math.max(0, Number(project?.elapsedHours) || 0);
  const fraction = clamp(Number(fractionalHour) || 0, 0, 1);
  return clamp((elapsed + fraction) / duration, 0, 1);
}

export function projectStage(project) {
  const progress = projectProgress(project);
  if (progress >= 1) return 'complete';
  if (progress >= 0.7) return 'shell';
  if (progress >= 0.3) return 'skeleton';
  return 'foundation';
}

export function projectRefund(project) {
  const elapsed = Math.max(0, Math.trunc(Number(project?.elapsedHours) || 0));
  const duration = Math.max(1, Math.trunc(Number(project?.durationHours) || 0));
  if (elapsed >= duration) return null;
  const paidCost = roundCredits(Math.max(0, Number(project?.paidCost) || 0));
  let ratio = CONSTRUCTION.REFUND_RATIOS.LATE;
  if (elapsed * 4 < duration) ratio = CONSTRUCTION.REFUND_RATIOS.EARLY;
  else if (elapsed * 4 < duration * 3) ratio = CONSTRUCTION.REFUND_RATIOS.MID;
  return roundCredits(paidCost * ratio);
}

export function advanceConstructionProjects(state) {
  const advanced = [];
  const completed = [];
  const stageChanged = [];
  state.grid.forEach((cell, index) => {
    const project = cell?.project;
    if (!project) return;
    const previousStage = projectStage(project);
    project.elapsedHours = Math.min(
      Math.max(1, Math.trunc(Number(project.durationHours) || 1)),
      Math.max(0, Math.trunc(Number(project.elapsedHours) || 0)) + 1,
    );
    const nextStage = projectStage(project);
    advanced.push({ index, kind: project.kind, elapsedHours: project.elapsedHours, durationHours: project.durationHours });
    if (previousStage !== nextStage) stageChanged.push({ index, kind: project.kind, previousStage, stage: nextStage });
    if (project.elapsedHours < project.durationHours) return;

    const transition = {
      index,
      kind: project.kind,
      type: cell.type,
      level: project.kind === 'upgrade' ? project.toLevel : cell.level,
      paidCost: project.paidCost,
    };
    if (project.kind === 'upgrade') {
      cell.level = project.toLevel;
      cell.operationMode = project.suspendedOperationMode || cell.operationMode || 'normal';
    }
    cell.project = null;
    completed.push(transition);
  });
  return { advanced, completed, stageChanged };
}

export function cancelConstructionProject(state, index) {
  const cell = state.grid[index];
  const project = cell?.project;
  if (!project) return { ok: false, reason: cell ? 'no_project' : 'empty' };
  const refund = projectRefund(project);
  if (refund == null) return { ok: false, reason: 'already_complete' };
  const result = { ok: true, index, kind: project.kind, type: cell.type, refund, project: { ...project } };
  state.credits = roundCredits(state.credits + refund);
  if (project.kind === 'build') {
    state.grid[index] = null;
  } else {
    cell.level = project.fromLevel;
    cell.operationMode = project.suspendedOperationMode || cell.operationMode || 'normal';
    cell.project = null;
  }
  return result;
}
