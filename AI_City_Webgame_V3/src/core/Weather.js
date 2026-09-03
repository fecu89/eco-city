// 날씨 계산(순수 함수). 판의 씨앗과 게임일만으로 정해지므로 저장하지 않으며, 같은 판을 다시
// 돌리거나 예보가 같은 날짜를 다시 정산해도 같은 값이 나온다.
//
// 모든 값은 HOLD_DAYS일 묶음(b = ⌊d / HOLD_DAYS⌋) 단위로만 바뀐다 — 날마다 튀면 대응할 수 없다.
//
//   종류(b): 마르코프 사슬. 0번 묶음은 INITIAL_KIND, b번은 (b−1)번 종류의 전이 확률표에 표본 하나를 대본다.
//   태양광(b): 그 묶음 종류의 SOLAR_FACTOR_RANGE 안에서 표본 하나로 정한다(강수는 0).
//   풍속(b):  이웃한 SMOOTHING_DAYS개 묶음의 표본을 평균해 SPEED_MIN~SPEED_MAX m/s로 편다. 날씨 종류와 무관하다.
//   풍력 출력: 시동 풍속 아래 0, 정격에서 1, 그 위로 MAX_FACTOR까지 선형, 안전 정지 이상 0.
import { WEATHER_RULES } from './Constants.js';
import { clampNumber, holdBlockIndex, seededDailyDraw } from './Environment.js';

const SALT = Object.freeze({ KIND: 1, SOLAR: 2, WIND: 3 });
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const lerp = ([min, max], t) => min + (max - min) * t;

const kindSeriesBySeed = new Map();

function normalizeSeed(seed) {
  const numeric = Number(seed);
  return Number.isFinite(numeric) ? Math.trunc(numeric) >>> 0 : 0;
}

function normalizeDay(dayIndex) {
  return Math.max(0, Math.trunc(Number(dayIndex) || 0));
}

// 날씨 값이 유지되는 묶음 번호. 같은 묶음의 날들은 종류·태양광 배율·풍속이 모두 같다.
export function weatherBlockIndex(dayIndex) {
  return holdBlockIndex(dayIndex, WEATHER_RULES.HOLD_DAYS);
}

function nextKind(previous, draw) {
  const row = WEATHER_RULES.TRANSITIONS[previous] || WEATHER_RULES.TRANSITIONS[WEATHER_RULES.INITIAL_KIND];
  let cursor = 0;
  for (const kind of WEATHER_RULES.BASE_KINDS) {
    cursor += Number(row[kind]) || 0;
    if (draw < cursor) return kind;
  }
  return WEATHER_RULES.BASE_KINDS[WEATHER_RULES.BASE_KINDS.length - 1];
}

// 기본 날씨 종류('clear' | 'cloudy' | 'precipitation'). 이벤트 강제는 여기서 다루지 않는다.
export function baseWeatherKindAt(seed, dayIndex) {
  const key = normalizeSeed(seed);
  const block = weatherBlockIndex(dayIndex);
  let series = kindSeriesBySeed.get(key);
  if (!series) {
    series = [WEATHER_RULES.INITIAL_KIND];
    kindSeriesBySeed.set(key, series);
  }
  while (series.length <= block) {
    series.push(nextKind(series[series.length - 1], seededDailyDraw(key, series.length, SALT.KIND)));
  }
  return series[block];
}

// 눈·비는 같은 강수이고 달력 월로만 갈린다.
export function precipitationKindForMonth(month) {
  return WEATHER_RULES.SNOW_MONTHS.includes(Number(month)) ? 'snow' : 'rain';
}

export function baseKindOf(kind) {
  return kind === 'rain' || kind === 'snow' ? 'precipitation' : kind;
}

export function solarWeatherFactorAt(seed, dayIndex, kind) {
  const range = WEATHER_RULES.SOLAR_FACTOR_RANGE[baseKindOf(kind)] || WEATHER_RULES.SOLAR_FACTOR_RANGE.clear;
  return round2(lerp(range, seededDailyDraw(normalizeSeed(seed), weatherBlockIndex(dayIndex), SALT.SOLAR)));
}

export function windSpeedAt(seed, dayIndex) {
  const { SPEED_MIN_MS, SPEED_MAX_MS, SMOOTHING_DAYS } = WEATHER_RULES.WIND;
  const key = normalizeSeed(seed);
  const block = weatherBlockIndex(dayIndex);
  const samples = Math.max(1, Math.trunc(Number(SMOOTHING_DAYS)) || 1);
  let total = 0;
  for (let offset = 0; offset < samples; offset += 1) {
    total += seededDailyDraw(key, block - offset, SALT.WIND);
  }
  return round1(lerp([SPEED_MIN_MS, SPEED_MAX_MS], total / samples));
}

export function windSpeedFactor(speedMs) {
  const { CUT_IN_MS, RATED_MS, MAX_FACTOR, CUT_OUT_MS } = WEATHER_RULES.WIND;
  const speed = Number(speedMs);
  if (!Number.isFinite(speed) || speed < CUT_IN_MS || speed >= CUT_OUT_MS) return 0;
  return round2(clampNumber((speed - CUT_IN_MS) / (RATED_MS - CUT_IN_MS), 0, MAX_FACTOR));
}

// 하루치 날씨 묶음. forced가 있으면(기후 이벤트·최종시험 단계) 종류와 풍속을 그에 맞춘다.
export function weatherForDay(seed, dayIndex, { month = 1, forced = null } = {}) {
  const day = normalizeDay(dayIndex);
  const baseKind = baseWeatherKindAt(seed, day);
  const naturalKind = baseKind === 'precipitation' ? precipitationKindForMonth(month) : baseKind;
  const kind = forced?.kind && WEATHER_RULES.DISPLAY[forced.kind] ? forced.kind : naturalKind;
  const windSpeedMs = Number.isFinite(Number(forced?.windSpeedMs)) ? round1(Number(forced.windSpeedMs)) : windSpeedAt(seed, day);
  const display = WEATHER_RULES.DISPLAY[kind];
  return {
    dayIndex: day,
    kind,
    baseKind: baseKindOf(kind),
    label: display.label,
    icon: display.icon,
    solarFactor: solarWeatherFactorAt(seed, day, kind),
    windSpeedMs,
    windFactor: windSpeedFactor(windSpeedMs),
    forcedBy: forced?.source ?? null,
  };
}
