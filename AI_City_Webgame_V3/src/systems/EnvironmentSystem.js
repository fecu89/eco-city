// 상태(state)에 기대는 환경 조회·출력 배율. 순수 생성/정규화 함수는 core/Environment.js에 있고
// 기존 import 경로를 위해 여기서 재수출한다.
import { DIRECTION_RULES, FACILITY_DIRECTIONS, TIDAL_RULES } from '../core/Constants.js';
import {
  DIRECTION_COUNT,
  SOLAR_OPTIMAL_ROTATION,
  clampNumber as clamp,
  defaultRotationFor,
  isCoastalCell,
  normalizeRotation,
} from '../core/Environment.js';

export {
  randomSeed,
  createEnvironment,
  normalizeEnvironment,
  isCoastalCell,
  defaultRotationFor,
  normalizeRotation,
} from '../core/Environment.js';

export function windDirectionAt(state, index) {
  const direction = Number(state?.environment?.windDirections?.[index]);
  return Number.isInteger(direction) && direction >= 0 && direction < DIRECTION_COUNT ? direction : 0;
}

export function tidalRangeAt(state, index) {
  if (!isCoastalCell(index)) return null;
  const range = Number(state?.environment?.tidalRanges?.[index]);
  return Number.isFinite(range) ? range : null;
}

export function tidalFactor(state, index) {
  const range = tidalRangeAt(state, index);
  if (range == null) return 1;
  return clamp(range / TIDAL_RULES.REFERENCE_RANGE_M, TIDAL_RULES.MIN_FACTOR, TIDAL_RULES.MAX_FACTOR);
}


export function optimalRotationFor(state, type, index) {
  if (type === 'solar') return SOLAR_OPTIMAL_ROTATION;
  if (type === 'wind') return windDirectionAt(state, index);
  return null;
}

export function directionFactor(state, type, index, rotation) {
  if (!DIRECTION_RULES.DIRECTIONAL_TYPES.includes(type)) return 1;
  const optimal = optimalRotationFor(state, type, index);
  if (optimal == null) return 1;
  const difference = Math.abs(normalizeRotation(rotation, type) - optimal);
  const deviation = Math.min(difference, DIRECTION_COUNT - difference);
  const factors = type === 'solar'
    ? DIRECTION_RULES.SOLAR_FACTORS_BY_DEVIATION
    : DIRECTION_RULES.WIND_FACTORS_BY_DEVIATION;
  return factors[deviation] ?? factors[factors.length - 1];
}

// 방향 선택 모달이 그대로 그리는 표. 8행 모두 배율을 담고 최댓값에 best를 세운다.
export function directionOutputTable(state, type, index) {
  const rows = FACILITY_DIRECTIONS.map(({ id, label, angle }, rotation) => ({
    rotation,
    id,
    label,
    angle,
    factor: directionFactor(state, type, index, rotation),
  }));
  const best = Math.max(...rows.map(({ factor }) => factor));
  return rows.map((row) => ({ ...row, best: row.factor === best }));
}

// 해안 칸의 조력 입지 안내. 내륙 칸은 null이다.
export function tidalSiteInfo(state, index) {
  const range = tidalRangeAt(state, index);
  if (range == null) return null;
  const factor = tidalFactor(state, index);
  return { range, factor, label: TIDAL_RULES.LABEL(range, factor) };
}
