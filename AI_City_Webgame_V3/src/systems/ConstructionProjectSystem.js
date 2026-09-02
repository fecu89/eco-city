import { CONSTRUCTION, FACILITIES } from '../core/Constants.js';
import { roundCredits } from '../core/Money.js';
import {
  constructionDurationDays,
  isBuildProject,
  isOperationalCell,
  normalizeConstructionProject,
  upgradeDurationDays,
} from '../core/ConstructionProject.js';

// 순수 헬퍼는 core/ConstructionProject.js가 소유한다. 기존 import 경로를 유지하려고 다시 내보낸다.
export {
  constructionDurationDays,
  isBuildProject,
  isOperationalCell,
  normalizeConstructionProject,
  upgradeDurationDays,
};

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

export function createBuildProject({ type, paidCost }) {
  const durationDays = constructionDurationDays(type);
  if (!FACILITIES[type] || !durationDays) throw new Error(`Unknown build project type: ${type}`);
  return {
    kind: 'build',
    elapsedDays: 0,
    durationDays,
    paidCost: roundCredits(Math.max(0, Number(paidCost) || 0)),
  };
}

export function createUpgradeProject({ cell, paidCost }) {
  const fromLevel = Math.trunc(Number(cell?.level));
  const durationDays = upgradeDurationDays(fromLevel);
  const facility = FACILITIES[cell?.type];
  if (!facility || !durationDays || fromLevel >= facility.maxLevel) {
    throw new Error(`Invalid upgrade project: ${cell?.type || 'unknown'} Lv.${fromLevel || 0}`);
  }
  return {
    kind: 'upgrade',
    fromLevel,
    toLevel: fromLevel + 1,
    elapsedDays: 0,
    durationDays,
    paidCost: roundCredits(Math.max(0, Number(paidCost) || 0)),
    suspendedOperationMode: cell.operationMode || 'normal',
  };
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
    return { ...IDENTITY_OPERATION_PROFILE, dev: ratio, supply: ratio, demand: 0.7, income: 0.6, carbon: 0.7, water: 0.7, researchSpeed: 0, functionality: 0.7 };
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

export function projectProgress(project, fractionalDay = 0) {
  const duration = Math.max(1, Math.trunc(Number(project?.durationDays) || 0));
  const elapsed = Math.max(0, Number(project?.elapsedDays) || 0);
  const fraction = clamp(Number(fractionalDay) || 0, 0, 1);
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
  const elapsed = Math.max(0, Math.trunc(Number(project?.elapsedDays) || 0));
  const duration = Math.max(1, Math.trunc(Number(project?.durationDays) || 0));
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
    project.elapsedDays = Math.min(
      Math.max(1, Math.trunc(Number(project.durationDays) || 1)),
      Math.max(0, Math.trunc(Number(project.elapsedDays) || 0)) + 1,
    );
    const nextStage = projectStage(project);
    advanced.push({ index, kind: project.kind, elapsedDays: project.elapsedDays, durationDays: project.durationDays });
    if (previousStage !== nextStage) stageChanged.push({ index, kind: project.kind, previousStage, stage: nextStage });
    if (project.elapsedDays < project.durationDays) return;

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
