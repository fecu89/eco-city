// 새 게임마다 한 번 뽑아 저장에 남는 "이 섬의 자연 조건"이다.
//  - windDirections: 칸마다의 풍향(0~7, FACILITY_DIRECTIONS 인덱스)
//  - tidalRanges: 해안 칸의 조수간만의 차(m). 내륙 칸은 null이다.
// 시설은 건설할 때 고른 방향(cell.rotation)이 이 조건과 얼마나 맞는지에 따라 출력이 달라진다.
import { BOARD, DEMAND_VARIATION, DIRECTION_RULES, FACILITY_DIRECTIONS, TIDAL_RULES } from './Constants.js';
import { createHexCoordinates, hexDistance } from './HexGrid.js';

export const DIRECTION_COUNT = FACILITY_DIRECTIONS.length;
export const SOLAR_OPTIMAL_ROTATION = FACILITY_DIRECTIONS.findIndex(({ id }) => id === DIRECTION_RULES.SOLAR_OPTIMAL);
// 셀마다 주풍향에서 흔들리는 폭(45° 몇 칸). 이웃 칸이 서로 다르되 섬 전체에는 경향이 남는다. settings.json DIRECTION_RULES.
const WIND_LOCAL_SPREAD = DIRECTION_RULES.WIND_LOCAL_SPREAD;

export const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp = clampNumber;
const round1 = (value) => Math.round(value * 10) / 10;

// 결정론적 32비트 PRNG. 같은 씨앗이면 언제나 같은 섬이 나온다.
export function mulberry32(seed) {
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

// 도시 소비 전력 변동. 판의 씨앗과 게임일만으로 정해지므로 같은 판을 다시 돌리면
// 같은 날에 같은 값이 나오고, 예보(같은 날짜를 다시 정산하는 복제 상태)와 실제 정산이 어긋나지 않는다.
// 값은 HOLD_DAYS일 묶음(b = ⌊d / HOLD_DAYS⌋) 단위로만 바뀐다 — 날마다 튀면 플레이어가 대응할 수 없다.
//
//   draw(b)   = mulberry32(seed + b × STRIDE)()                        ∈ [0, 1)
//   noise(b)  = (draw(b) + draw(b−1) + … + draw(b−S+1)) / S × 2 − 1    ∈ [−1, 1)
//   factor(d) = 1 + AMPLITUDE × noise(⌊d / HOLD_DAYS⌋)                  ∈ [1−A, 1+A)
//
// S = DEMAND_VARIATION.SMOOTHING_DAYS. 이웃한 묶음이 표본 S−1개를 함께 쓰므로 한 번에
// 최대폭으로 뒤집히지 않고(변화폭 ≤ 2A/S) 완만하게 오르내린다. 0 이전은 0으로 접는다.
const DEMAND_NOISE_STRIDE = 0x9e3779b9; // 황금비 상수 — 날짜마다 씨앗을 멀리 떨어뜨린다

const DAILY_SALT_STRIDE = 0x85ebca6b; // 같은 날의 다른 용도(날씨·풍속)를 서로 떨어뜨리는 두 번째 상수

// 씨앗·날짜·용도(salt)로 정해지는 [0, 1) 표본. salt 0은 수요 변동이 쓰던 표본과 같다.
export function seededDailyDraw(seed, dayIndex, salt = 0) {
  const day = Math.max(0, Math.trunc(Number(dayIndex) || 0));
  const base = (Number(seed) >>> 0) + Math.imul(day, DEMAND_NOISE_STRIDE) + Math.imul(Math.trunc(Number(salt) || 0), DAILY_SALT_STRIDE);
  return mulberry32(base >>> 0)();
}

function demandNoiseDraw(seed, dayIndex) {
  return seededDailyDraw(seed, dayIndex, 0);
}

// 게임일을 "값이 유지되는 묶음" 번호로 접는다. holdDays가 1이면 날짜 그대로다.
export function holdBlockIndex(dayIndex, holdDays) {
  const day = Math.max(0, Math.trunc(Number(dayIndex) || 0));
  const hold = Math.max(1, Math.trunc(Number(holdDays)) || 1);
  return Math.floor(day / hold);
}

export function demandVariationFactor(state, dayIndex = state?.elapsedGameDays ?? 0) {
  const rawSeed = Number(state?.environment?.seed);
  const seed = Number.isFinite(rawSeed) ? Math.trunc(rawSeed) >>> 0 : 0;
  const smoothingDays = Math.max(1, Math.trunc(Number(DEMAND_VARIATION.SMOOTHING_DAYS)) || 1);
  const block = holdBlockIndex(dayIndex, DEMAND_VARIATION.HOLD_DAYS);
  let total = 0;
  for (let offset = 0; offset < smoothingDays; offset += 1) {
    total += demandNoiseDraw(seed, block - offset);
  }
  const noise = (total / smoothingDays) * 2 - 1;
  return 1 + DEMAND_VARIATION.AMPLITUDE * noise;
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
