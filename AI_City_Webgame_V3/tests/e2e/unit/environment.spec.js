import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import {
  BOARD,
  DEMAND_VARIATION,
  DIRECTION_RULES,
  FACILITY_DIRECTIONS,
  TIDAL_RULES,
} from '../../../src/core/Constants.js';
import { createHexCoordinates, hexDistance } from '../../../src/systems/HexGridSystem.js';
import {
  createEnvironment,
  defaultRotationFor,
  demandVariationFactor,
  directionFactor,
  holdBlockIndex,
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

// ─────────────────────────────────────────────────────────────────────────────
// 일일 수요 변동 — 판의 씨앗과 게임일만으로 정해지는 결정론적 계열.
// ─────────────────────────────────────────────────────────────────────────────

const variationSeries = (state, days = 30) => (
  Array.from({ length: days }, (_, offset) => demandVariationFactor(state, offset + 1))
);

test('같은 씨앗의 수요 변동은 매번 같고, 진폭 안에서 날마다 달라진다', () => {
  const state = stateWithSeed();
  const twin = stateWithSeed();
  const other = stateWithSeed(SEED + 7);
  const series = variationSeries(state);

  expect(series).toEqual(variationSeries(twin));
  expect(series).not.toEqual(variationSeries(other));
  series.forEach((factor, offset) => {
    expect(factor, `day ${offset + 1}`).toBeGreaterThanOrEqual(1 - DEMAND_VARIATION.AMPLITUDE);
    expect(factor, `day ${offset + 1}`).toBeLessThanOrEqual(1 + DEMAND_VARIATION.AMPLITUDE);
  });
  // 값은 HOLD_DAYS일 묶음 단위로만 바뀐다(플레이어가 대응할 틈). 묶음 수만큼은 서로 다른 값이어야 한다.
  const blocks = new Set(series.map((_, offset) => holdBlockIndex(offset + 1, DEMAND_VARIATION.HOLD_DAYS))).size;
  expect(blocks).toBeGreaterThan(1);
  expect(new Set(series).size).toBe(blocks);
  expect(Math.max(...series) - Math.min(...series)).toBeGreaterThan(0.02);
});

test('이웃한 두 날은 표본을 나눠 가져 하루 만에 최대폭으로 뒤집히지 않는다', () => {
  const state = stateWithSeed();
  // 평활 구간이 S일이라 연속한 두 날은 표본 하나만 갈린다 → 하루 변화폭은 2A/S 이하다.
  const maximumStep = (2 * DEMAND_VARIATION.AMPLITUDE) / DEMAND_VARIATION.SMOOTHING_DAYS;
  for (let day = 2; day <= 60; day += 1) {
    const step = Math.abs(demandVariationFactor(state, day) - demandVariationFactor(state, day - 1));
    expect(step, `day ${day}`).toBeLessThanOrEqual(maximumStep);
  }
});

test('수요 변동 문구는 부호를 그대로 드러내고 평년은 ±0%로 밝힌다', () => {
  expect(DEMAND_VARIATION.CAUSE_LABEL(1.04)).toBe('오늘 수요 변동 +4%');
  expect(DEMAND_VARIATION.CAUSE_LABEL(0.97)).toBe('오늘 수요 변동 -3%');
  expect(DEMAND_VARIATION.CAUSE_LABEL(1)).toBe('오늘 수요 변동 ±0%');
  // 반올림으로 0%가 되는 날도 "평년 수준"으로 읽히도록 ±를 붙인다.
  expect(DEMAND_VARIATION.CAUSE_LABEL(1.004)).toBe('오늘 수요 변동 ±0%');
  expect(DEMAND_VARIATION.CAUSE_LABEL(undefined)).toBe('오늘 수요 변동 ±0%');
});

test('수요 변동은 날짜를 넘겨받지 않거나 환경이 없어도 진폭 안의 수를 돌려준다', () => {
  const state = stateWithSeed();
  state.elapsedGameDays = 9;

  expect(demandVariationFactor(state)).toBe(demandVariationFactor(state, 9));
  // 0일 이전은 0일로 접는다 — 예보가 음수 날짜를 물어도 같은 값이 나온다.
  expect(demandVariationFactor(state, -5)).toBe(demandVariationFactor(state, 0));
  [null, undefined, {}, { environment: {} }, { environment: { seed: 'x' } }].forEach((broken) => {
    const factor = demandVariationFactor(broken, 5);
    expect(Number.isFinite(factor), JSON.stringify(broken)).toBe(true);
    expect(factor).toBeGreaterThanOrEqual(1 - DEMAND_VARIATION.AMPLITUDE);
    expect(factor).toBeLessThanOrEqual(1 + DEMAND_VARIATION.AMPLITUDE);
  });
});
