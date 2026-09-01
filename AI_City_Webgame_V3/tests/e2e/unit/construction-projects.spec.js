import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  advanceConstructionProjects,
  cancelConstructionProject,
  constructionDurationDays,
  createBuildProject,
  createUpgradeProject,
  projectProgress,
  projectRefund,
  projectStage,
  upgradeDurationDays,
} from '../../../src/systems/ConstructionProjectSystem.js';

test('facility projects expose the approved game-hour durations', () => {
  expect(constructionDurationDays('green')).toBe(3);
  expect(constructionDurationDays('residential')).toBe(5);
  expect(constructionDurationDays('factory')).toBe(8);
  expect(constructionDurationDays('thermal')).toBe(12);
  expect(constructionDurationDays('nuclear')).toBe(18);
  expect(upgradeDurationDays(1)).toBe(8);
  expect(upgradeDurationDays(2)).toBe(15);
});

test('project progress and stages use elapsed game hours', () => {
  expect(projectProgress({ elapsedDays: 0, durationDays: 10 })).toBe(0);
  expect(projectProgress({ elapsedDays: 3, durationDays: 10 })).toBe(0.3);
  expect(projectProgress({ elapsedDays: 7, durationDays: 10 })).toBe(0.7);
  expect(projectProgress({ elapsedDays: 12, durationDays: 10 })).toBe(1);
  expect(projectStage({ elapsedDays: 0, durationDays: 10 })).toBe('foundation');
  expect(projectStage({ elapsedDays: 3, durationDays: 10 })).toBe('skeleton');
  expect(projectStage({ elapsedDays: 7, durationDays: 10 })).toBe('shell');
  expect(projectStage({ elapsedDays: 10, durationDays: 10 })).toBe('complete');
});

test('visual project progress includes the real-time fraction before the next settlement hour', () => {
  const project = { elapsedDays: 1, durationDays: 5 };
  expect(projectProgress(project, 0)).toBe(0.2);
  expect(projectProgress(project, 0.5)).toBe(0.3);
  expect(projectProgress(project, 1)).toBe(0.4);
});

test('refund boundaries use actual paid cost and exact integer comparisons', () => {
  expect(projectRefund({ elapsedDays: 1, durationDays: 5, paidCost: 10 })).toBe(8);
  expect(projectRefund({ elapsedDays: 2, durationDays: 8, paidCost: 10 })).toBe(6.5);
  expect(projectRefund({ elapsedDays: 5, durationDays: 8, paidCost: 10 })).toBe(6.5);
  expect(projectRefund({ elapsedDays: 6, durationDays: 8, paidCost: 10 })).toBe(5);
  expect(projectRefund({ elapsedDays: 8, durationDays: 8, paidCost: 10 })).toBeNull();
});

test('advancing completes every due project before returning transitions', () => {
  const state = new GameState();
  state.grid[0] = {
    type: 'factory',
    level: 1,
    operationMode: 'normal',
    project: { ...createBuildProject({ type: 'factory', paidCost: 4 }), elapsedDays: 7 },
  };
  state.grid[1] = {
    type: 'thermal',
    level: 1,
    operationMode: 'normal',
    project: { ...createUpgradeProject({ cell: { type: 'thermal', level: 1, operationMode: 'eco' }, paidCost: 5 }), elapsedDays: 7 },
  };

  const result = advanceConstructionProjects(state);

  expect(result.completed).toEqual([
    expect.objectContaining({ index: 0, kind: 'build', type: 'factory', level: 1 }),
    expect.objectContaining({ index: 1, kind: 'upgrade', type: 'thermal', level: 2 }),
  ]);
  expect(state.grid[0].project).toBeNull();
  expect(state.grid[1]).toMatchObject({ level: 2, operationMode: 'eco', project: null });
});

test('cancelling build and upgrade projects applies distinct restoration rules', () => {
  const state = new GameState();
  state.credits = 1;
  state.grid[0] = {
    type: 'residential',
    level: 1,
    operationMode: 'normal',
    project: { ...createBuildProject({ type: 'residential', paidCost: 2 }), elapsedDays: 1 },
  };
  state.grid[1] = {
    type: 'factory',
    level: 1,
    operationMode: 'normal',
    project: { ...createUpgradeProject({ cell: { type: 'factory', level: 1, operationMode: 'boost' }, paidCost: 4 }), elapsedDays: 2 },
  };

  expect(cancelConstructionProject(state, 0)).toMatchObject({ ok: true, kind: 'build', refund: 1.6 });
  expect(state.grid[0]).toBeNull();
  expect(state.credits).toBe(2.6);

  expect(cancelConstructionProject(state, 1)).toMatchObject({ ok: true, kind: 'upgrade', refund: 2.6 });
  expect(state.grid[1]).toMatchObject({ level: 1, operationMode: 'boost', project: null });
  expect(state.credits).toBe(5.2);
});

test('completed projects cannot be cancelled', () => {
  const state = new GameState();
  state.grid[0] = {
    type: 'green',
    level: 1,
    project: { ...createBuildProject({ type: 'green', paidCost: 2 }), elapsedDays: 3 },
  };

  expect(cancelConstructionProject(state, 0)).toEqual({ ok: false, reason: 'already_complete' });
  expect(state.grid[0]).not.toBeNull();
});
