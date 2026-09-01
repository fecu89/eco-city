import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  advanceConstructionProjects,
  cancelConstructionProject,
  constructionDurationHours,
  createBuildProject,
  createUpgradeProject,
  projectProgress,
  projectRefund,
  projectStage,
  upgradeDurationHours,
} from '../../../src/systems/ConstructionProjectSystem.js';

test('facility projects expose the approved game-hour durations', () => {
  expect(constructionDurationHours('green')).toBe(3);
  expect(constructionDurationHours('residential')).toBe(5);
  expect(constructionDurationHours('factory')).toBe(8);
  expect(constructionDurationHours('thermal')).toBe(12);
  expect(constructionDurationHours('nuclear')).toBe(18);
  expect(upgradeDurationHours(1)).toBe(8);
  expect(upgradeDurationHours(2)).toBe(15);
});

test('project progress and stages use elapsed game hours', () => {
  expect(projectProgress({ elapsedHours: 0, durationHours: 10 })).toBe(0);
  expect(projectProgress({ elapsedHours: 3, durationHours: 10 })).toBe(0.3);
  expect(projectProgress({ elapsedHours: 7, durationHours: 10 })).toBe(0.7);
  expect(projectProgress({ elapsedHours: 12, durationHours: 10 })).toBe(1);
  expect(projectStage({ elapsedHours: 0, durationHours: 10 })).toBe('foundation');
  expect(projectStage({ elapsedHours: 3, durationHours: 10 })).toBe('skeleton');
  expect(projectStage({ elapsedHours: 7, durationHours: 10 })).toBe('shell');
  expect(projectStage({ elapsedHours: 10, durationHours: 10 })).toBe('complete');
});

test('visual project progress includes the real-time fraction before the next settlement hour', () => {
  const project = { elapsedHours: 1, durationHours: 5 };
  expect(projectProgress(project, 0)).toBe(0.2);
  expect(projectProgress(project, 0.5)).toBe(0.3);
  expect(projectProgress(project, 1)).toBe(0.4);
});

test('refund boundaries use actual paid cost and exact integer comparisons', () => {
  expect(projectRefund({ elapsedHours: 1, durationHours: 5, paidCost: 10 })).toBe(8);
  expect(projectRefund({ elapsedHours: 2, durationHours: 8, paidCost: 10 })).toBe(6.5);
  expect(projectRefund({ elapsedHours: 5, durationHours: 8, paidCost: 10 })).toBe(6.5);
  expect(projectRefund({ elapsedHours: 6, durationHours: 8, paidCost: 10 })).toBe(5);
  expect(projectRefund({ elapsedHours: 8, durationHours: 8, paidCost: 10 })).toBeNull();
});

test('advancing completes every due project before returning transitions', () => {
  const state = new GameState();
  state.grid[0] = {
    type: 'factory',
    level: 1,
    operationMode: 'normal',
    project: { ...createBuildProject({ type: 'factory', paidCost: 4 }), elapsedHours: 7 },
  };
  state.grid[1] = {
    type: 'thermal',
    level: 1,
    operationMode: 'normal',
    project: { ...createUpgradeProject({ cell: { type: 'thermal', level: 1, operationMode: 'eco' }, paidCost: 5 }), elapsedHours: 7 },
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
    project: { ...createBuildProject({ type: 'residential', paidCost: 2 }), elapsedHours: 1 },
  };
  state.grid[1] = {
    type: 'factory',
    level: 1,
    operationMode: 'normal',
    project: { ...createUpgradeProject({ cell: { type: 'factory', level: 1, operationMode: 'boost' }, paidCost: 4 }), elapsedHours: 2 },
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
    project: { ...createBuildProject({ type: 'green', paidCost: 2 }), elapsedHours: 3 },
  };

  expect(cancelConstructionProject(state, 0)).toEqual({ ok: false, reason: 'already_complete' });
  expect(state.grid[0]).not.toBeNull();
});
