import { test, expect } from '@playwright/test';
import { GameState, SAVE_VERSION, normalizeCell } from '../../../src/core/GameState.js';
import { BOARD, DIRECTION_RULES, FACILITY_DIRECTIONS, TIDAL_RULES } from '../../../src/core/Constants.js';
import { migrateSaveData, migrateV9ToV10 } from '../../../src/systems/SaveSystem.js';
import { createEnvironment, isCoastalCell } from '../../../src/systems/EnvironmentSystem.js';

function v9Save(overrides = {}) {
  const serialized = new GameState().serialize();
  delete serialized.environment;
  return {
    ...serialized,
    v: 9,
    ...overrides,
  };
}

function hydrated(save) {
  const state = new GameState();
  expect(state.hydrate(migrateSaveData(save))).toBe(true);
  return state;
}

test('v10은 옛 저장에 섬의 자연 조건과 시설 기본 방향을 채워 준다', () => {
  const migrated = migrateV9ToV10(v9Save({
    credits: 21.5,
    questIndex: 12,
    grid: [
      { type: 'solar', level: 2, project: null },
      { type: 'wind', level: 1, project: null },
      { type: 'residential', level: 1, project: null },
      null,
    ],
  }));

  expect(migrated).toMatchObject({ v: 10, credits: 21.5, questIndex: 12 });
  expect(migrated.environment.windDirections).toHaveLength(BOARD.EXPANDED_CELLS);
  expect(migrated.environment.tidalRanges).toHaveLength(BOARD.EXPANDED_CELLS);
  expect(Number.isInteger(migrated.environment.seed)).toBe(true);
  // 태양광은 남향, 나머지는 북향으로 서 있던 것으로 본다.
  expect(migrated.grid[0]).toMatchObject({ type: 'solar', level: 2, rotation: DIRECTION_RULES.DEFAULT_ROTATION.solar });
  expect(migrated.grid[1]).toMatchObject({ type: 'wind', level: 1, rotation: DIRECTION_RULES.DEFAULT_ROTATION.wind });
  expect(migrated.grid[2]).toMatchObject({ type: 'residential', rotation: 0 });
  expect(migrated.grid[3]).toBeNull();
});

test('마이그레이션 사슬은 v10에서 끝나고 도시를 잃지 않는다', () => {
  const migrated = migrateSaveData(v9Save({
    questIndex: 15,
    credits: 40,
    grid: [{ type: 'nuclear', level: 2, project: null }],
  }));

  expect(migrated.v).toBe(SAVE_VERSION);
  expect(SAVE_VERSION).toBe(10);
  expect(migrated).toMatchObject({ questIndex: 15, credits: 40 });
  expect(migrated.grid[0]).toMatchObject({ type: 'nuclear', level: 2, rotation: 0 });
});

test('저장한 환경은 되살아나고 방향은 칸마다 그대로 남는다', () => {
  const source = new GameState();
  source.environment = createEnvironment(20400134);
  source.grid[0] = normalizeCell({ type: 'wind', level: 1, rotation: 5 });
  source.grid[1] = normalizeCell({ type: 'solar', level: 1, rotation: 2 });

  const restored = new GameState();
  expect(restored.hydrate(structuredClone(source.serialize()))).toBe(true);
  expect(restored.environment).toEqual(source.environment);
  expect(restored.environment.seed).toBe(20400134);
  expect(restored.grid[0]).toMatchObject({ type: 'wind', rotation: 5 });
  expect(restored.grid[1]).toMatchObject({ type: 'solar', rotation: 2 });
});

test('환경이 없거나 형태가 깨진 저장은 새 환경으로 시작한다', () => {
  const payload = new GameState().serialize();

  for (const broken of [
    undefined,
    null,
    'not-an-object',
    { seed: 1, windDirections: [], tidalRanges: [] },
    { seed: 1, windDirections: Array(BOARD.EXPANDED_CELLS).fill(9), tidalRanges: Array(BOARD.EXPANDED_CELLS).fill(null) },
    { windDirections: Array(BOARD.EXPANDED_CELLS).fill(0), tidalRanges: Array(BOARD.EXPANDED_CELLS).fill(null) },
  ]) {
    const state = new GameState();
    expect(state.hydrate({ ...structuredClone(payload), environment: broken })).toBe(true);
    expect(state.environment.windDirections).toHaveLength(BOARD.EXPANDED_CELLS);
    state.environment.windDirections.forEach((direction) => {
      expect(direction).toBeGreaterThanOrEqual(0);
      expect(direction).toBeLessThan(FACILITY_DIRECTIONS.length);
    });
    state.environment.tidalRanges.forEach((range, index) => {
      if (!isCoastalCell(index)) expect(range).toBeNull();
      else expect(range).toBeGreaterThanOrEqual(TIDAL_RULES.RANGE_MIN_M);
    });
  }
});

test('새 게임마다 자연 조건을 다시 뽑는다', () => {
  const seeds = new Set();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = new GameState();
    seeds.add(state.environment.seed);
    state.reset();
    seeds.add(state.environment.seed);
  }
  expect(seeds.size).toBeGreaterThan(1);
});
