import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  BOARD,
  DIRECTION_RULES,
  FACILITY_DIRECTIONS,
  TIDAL_RULES,
} from '../../../src/core/Constants.js';
import { createHexCoordinates, hexDistance } from '../../../src/systems/HexGridSystem.js';
import {
  createEnvironment,
  defaultRotationFor,
  directionFactor,
  directionOutputTable,
  isCoastalCell,
  optimalRotationFor,
  randomSeed,
  tidalFactor,
  tidalRangeAt,
  tidalSiteInfo,
  windDirectionAt,
} from '../../../src/systems/EnvironmentSystem.js';

const SEED = 20400101;

function stateWithSeed(seed = SEED) {
  const state = new GameState();
  state.environment = createEnvironment(seed);
  return state;
}

test('같은 씨앗은 같은 환경을, 다른 씨앗은 다른 환경을 만든다', () => {
  const first = createEnvironment(SEED);
  const second = createEnvironment(SEED);
  const other = createEnvironment(SEED + 1);

  expect(first).toEqual(second);
  expect(first.seed).toBe(SEED);
  expect(other.seed).toBe(SEED + 1);
  expect(JSON.stringify(other)).not.toBe(JSON.stringify(first));
});

test('무작위 씨앗은 32비트 정수이고 새 게임마다 환경을 다시 만든다', () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  }
  const state = new GameState();
  expect(Number.isInteger(state.environment.seed)).toBe(true);
  expect(state.environment.windDirections).toHaveLength(BOARD.EXPANDED_CELLS);
  expect(state.environment.tidalRanges).toHaveLength(BOARD.EXPANDED_CELLS);
});

test('풍향은 37칸 모두 0~7이고 한 방향으로 고정되지 않는다', () => {
  const { windDirections } = createEnvironment(SEED);

  expect(windDirections).toHaveLength(BOARD.EXPANDED_CELLS);
  windDirections.forEach((direction) => {
    expect(Number.isInteger(direction)).toBe(true);
    expect(direction).toBeGreaterThanOrEqual(0);
    expect(direction).toBeLessThan(FACILITY_DIRECTIONS.length);
  });
  expect(new Set(windDirections).size).toBeGreaterThan(1);
});

test('조수간만의 차는 해안 칸에만 있고 2~8m 안에 든다', () => {
  const { tidalRanges } = createEnvironment(SEED);

  tidalRanges.forEach((range, index) => {
    if (!isCoastalCell(index)) {
      expect(range, `cell ${index}`).toBeNull();
      return;
    }
    expect(range, `cell ${index}`).toBeGreaterThanOrEqual(TIDAL_RULES.RANGE_MIN_M);
    expect(range, `cell ${index}`).toBeLessThanOrEqual(TIDAL_RULES.RANGE_MAX_M);
    expect(Math.round(range * 10)).toBeCloseTo(range * 10);
  });
});

test('해안 칸은 3링 18칸뿐이다', () => {
  const coords = createHexCoordinates(BOARD.EXPANDED_RADIUS);
  const coastal = coords.map((_, index) => index).filter(isCoastalCell);

  expect(coastal).toHaveLength(18);
  coastal.forEach((index) => {
    expect(hexDistance(coords[index], { q: 0, r: 0 })).toBe(TIDAL_RULES.COASTAL_RING);
  });
  expect(isCoastalCell(0)).toBe(false);
  expect(isCoastalCell(18)).toBe(false);
  expect(isCoastalCell(-1)).toBe(false);
  expect(isCoastalCell(99)).toBe(false);
});

test('태양광 출력은 남향에서 가장 크고 동서가 대칭이다', () => {
  const state = stateWithSeed();
  const south = FACILITY_DIRECTIONS.findIndex(({ id }) => id === DIRECTION_RULES.SOLAR_OPTIMAL);
  const east = FACILITY_DIRECTIONS.findIndex(({ id }) => id === 'E');
  const west = FACILITY_DIRECTIONS.findIndex(({ id }) => id === 'W');
  const north = FACILITY_DIRECTIONS.findIndex(({ id }) => id === 'N');

  expect(optimalRotationFor(state, 'solar', 5)).toBe(south);
  expect(defaultRotationFor('solar')).toBe(south);
  expect(directionFactor(state, 'solar', 5, south)).toBe(DIRECTION_RULES.SOLAR_FACTORS_BY_DEVIATION[0]);
  expect(directionFactor(state, 'solar', 5, east)).toBe(directionFactor(state, 'solar', 5, west));
  expect(directionFactor(state, 'solar', 5, north)).toBe(DIRECTION_RULES.SOLAR_FACTORS_BY_DEVIATION[4]);
  expect(directionFactor(state, 'solar', 5, east)).toBeLessThan(directionFactor(state, 'solar', 5, south));
  // 방향이 없는 시설은 언제나 1이다.
  expect(directionFactor(state, 'residential', 5, north)).toBe(1);
  expect(optimalRotationFor(state, 'residential', 5)).toBeNull();
});

test('풍력 출력은 그 칸의 풍향에서 가장 크고 기본 회전은 북향이다', () => {
  const state = stateWithSeed();
  expect(defaultRotationFor('wind')).toBe(0);

  for (let index = 0; index < BOARD.EXPANDED_CELLS; index += 1) {
    const best = windDirectionAt(state, index);
    expect(optimalRotationFor(state, 'wind', index)).toBe(best);
    expect(directionFactor(state, 'wind', index, best)).toBe(DIRECTION_RULES.WIND_FACTORS_BY_DEVIATION[0]);
    const opposite = (best + 4) % FACILITY_DIRECTIONS.length;
    expect(directionFactor(state, 'wind', index, opposite))
      .toBe(DIRECTION_RULES.WIND_FACTORS_BY_DEVIATION[4]);
  }
});

test('방향별 출력표는 8행이고 최댓값만 best로 표시한다', () => {
  const state = stateWithSeed();
  const table = directionOutputTable(state, 'wind', 7);

  expect(table).toHaveLength(FACILITY_DIRECTIONS.length);
  table.forEach((row, rotation) => {
    expect(row).toMatchObject({
      rotation,
      id: FACILITY_DIRECTIONS[rotation].id,
      label: FACILITY_DIRECTIONS[rotation].label,
      angle: FACILITY_DIRECTIONS[rotation].angle,
    });
    expect(typeof row.factor).toBe('number');
  });
  const best = table.filter(({ best: isBest }) => isBest);
  expect(best).toHaveLength(1);
  expect(best[0].rotation).toBe(windDirectionAt(state, 7));
  expect(Math.max(...table.map(({ factor }) => factor))).toBe(best[0].factor);

  // 방향이 없는 시설도 8행을 돌려주되 모두 1배이므로 전부 best다.
  const flat = directionOutputTable(state, 'residential', 7);
  expect(flat.map(({ factor }) => factor)).toEqual(Array(8).fill(1));
  expect(flat.every(({ best: isBest }) => isBest)).toBe(true);
});

test('조력 출력 배율은 기준 조차 대비로 계산되고 상하한에서 잘린다', () => {
  const state = stateWithSeed();
  const coastal = Array.from({ length: BOARD.EXPANDED_CELLS }, (_, index) => index).filter(isCoastalCell);

  coastal.forEach((index) => {
    const range = tidalRangeAt(state, index);
    const expected = Math.min(
      TIDAL_RULES.MAX_FACTOR,
      Math.max(TIDAL_RULES.MIN_FACTOR, range / TIDAL_RULES.REFERENCE_RANGE_M),
    );
    expect(tidalFactor(state, index), `cell ${index}`).toBeCloseTo(expected, 10);
  });

  // 내륙 칸은 조차가 없으므로 1배로 취급한다(배치 자체가 막힌다).
  expect(tidalRangeAt(state, 0)).toBeNull();
  expect(tidalFactor(state, 0)).toBe(1);

  const clamped = stateWithSeed();
  const first = coastal[0];
  clamped.environment.tidalRanges[first] = TIDAL_RULES.RANGE_MIN_M;
  expect(tidalFactor(clamped, first)).toBe(TIDAL_RULES.MIN_FACTOR);
  clamped.environment.tidalRanges[first] = TIDAL_RULES.RANGE_MAX_M;
  expect(tidalFactor(clamped, first)).toBe(TIDAL_RULES.MAX_FACTOR);
});

test('해안 입지 안내는 조차와 출력 배율을 한 문장으로 알려준다', () => {
  const state = stateWithSeed();
  const coastal = Array.from({ length: BOARD.EXPANDED_CELLS }, (_, index) => index).find(isCoastalCell);
  const info = tidalSiteInfo(state, coastal);

  expect(info).toMatchObject({
    range: tidalRangeAt(state, coastal),
    factor: tidalFactor(state, coastal),
  });
  expect(info.label).toBe(TIDAL_RULES.LABEL(info.range, info.factor));
  expect(info.label).toMatch(/^조차 \d+(\.\d)?m · 출력 \d+%$/);
  expect(tidalSiteInfo(state, 0)).toBeNull();
});
