// 새 게임마다 한 번 뽑아 저장에 남는 "이 섬의 자연 조건"이다.
//  - windDirections: 칸마다의 풍향(0~7, FACILITY_DIRECTIONS 인덱스)
//  - tidalRanges: 해안 칸의 조수간만의 차(m). 내륙 칸은 null이다.
// 시설은 건설할 때 고른 방향(cell.rotation)이 이 조건과 얼마나 맞는지에 따라 출력이 달라진다.
import { BOARD, DIRECTION_RULES, FACILITY_DIRECTIONS, TIDAL_RULES } from './Constants.js';
import { createHexCoordinates, hexDistance } from './HexGrid.js';

export const DIRECTION_COUNT = FACILITY_DIRECTIONS.length;
export const SOLAR_OPTIMAL_ROTATION = FACILITY_DIRECTIONS.findIndex(({ id }) => id === DIRECTION_RULES.SOLAR_OPTIMAL);
// 셀마다 주풍향에서 흔들리는 폭(45° 몇 칸). 이웃 칸이 서로 다르되 섬 전체에는 경향이 남는다.
const WIND_LOCAL_SPREAD = 2;

export const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp = clampNumber;
const round1 = (value) => Math.round(value * 10) / 10;

// 결정론적 32비트 PRNG. 같은 씨앗이면 언제나 같은 섬이 나온다.
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// 풍향 규칙: 게임마다 섬 전체의 주풍향(prevailing)을 하나 뽑고, 칸마다 −2~+2칸을 더한다.
// 그래서 이웃 칸끼리도 방향이 갈리지만(플레이어가 칸마다 확인해야 한다), 섬 전체로 보면
// 한쪽으로 부는 경향이 남는다.
export function createEnvironment(seed = randomSeed()) {
  const normalizedSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) >>> 0 : randomSeed();
  const random = mulberry32(normalizedSeed);
  const prevailing = Math.floor(random() * DIRECTION_COUNT) % DIRECTION_COUNT;
  const windDirections = [];
  const tidalRanges = [];
  for (let index = 0; index < BOARD.EXPANDED_CELLS; index += 1) {
    const offset = Math.floor(random() * (WIND_LOCAL_SPREAD * 2 + 1)) - WIND_LOCAL_SPREAD;
    windDirections.push(((prevailing + offset) % DIRECTION_COUNT + DIRECTION_COUNT) % DIRECTION_COUNT);
    const roll = random();
    tidalRanges.push(isCoastalCell(index)
      ? round1(TIDAL_RULES.RANGE_MIN_M + roll * (TIDAL_RULES.RANGE_MAX_M - TIDAL_RULES.RANGE_MIN_M))
      : null);
  }
  return { seed: normalizedSeed, windDirections, tidalRanges };
}

// 저장에서 되살린 환경을 방어적으로 검사한다. 형태가 맞지 않으면 null을 돌려주고
// 호출자가 새 환경을 만든다.
export function normalizeEnvironment(value) {
  if (!value || typeof value !== 'object') return null;
  const { seed, windDirections, tidalRanges } = value;
  if (!Number.isFinite(Number(seed))) return null;
  if (!Array.isArray(windDirections) || windDirections.length !== BOARD.EXPANDED_CELLS) return null;
  if (!Array.isArray(tidalRanges) || tidalRanges.length !== BOARD.EXPANDED_CELLS) return null;
  const normalizedWind = [];
  const normalizedTidal = [];
  for (let index = 0; index < BOARD.EXPANDED_CELLS; index += 1) {
    const direction = Number(windDirections[index]);
    if (!Number.isInteger(direction) || direction < 0 || direction >= DIRECTION_COUNT) return null;
    normalizedWind.push(direction);
    const range = tidalRanges[index];
    if (!isCoastalCell(index)) {
      normalizedTidal.push(null);
      continue;
    }
    const numeric = Number(range);
    if (!Number.isFinite(numeric)) return null;
    normalizedTidal.push(round1(clamp(numeric, TIDAL_RULES.RANGE_MIN_M, TIDAL_RULES.RANGE_MAX_M)));
  }
  return {
    seed: Math.trunc(Number(seed)) >>> 0,
    windDirections: normalizedWind,
    tidalRanges: normalizedTidal,
  };
}

export function isCoastalCell(index) {
  const coordinate = createHexCoordinates(BOARD.EXPANDED_RADIUS)[index];
  return Boolean(coordinate) && hexDistance(coordinate, { q: 0, r: 0 }) === TIDAL_RULES.COASTAL_RING;
}


// 건설 화면이 처음 제시하는 방향. 태양광은 남향, 나머지는 북향이다.
export function defaultRotationFor(type) {
  return DIRECTION_RULES.DEFAULT_ROTATION[type] ?? 0;
}

// 저장·계획·직접 배치에서 들어온 회전값을 0~7로 자른다. 값이 없으면 시설 기본값이다.
export function normalizeRotation(rotation, type) {
  const numeric = Math.trunc(Number(rotation));
  if (!Number.isFinite(numeric)) return defaultRotationFor(type);
  return ((numeric % DIRECTION_COUNT) + DIRECTION_COUNT) % DIRECTION_COUNT;
}
