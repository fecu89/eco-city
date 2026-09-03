import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { DEMAND_VARIATION, WEATHER_RULES } from '../../../src/core/Constants.js';
import { CITY_EVENTS, STRESS_PHASES } from '../../../src/core/EventDefinitions.js';
import { createEnvironment, demandVariationFactor } from '../../../src/systems/EnvironmentSystem.js';
import {
  baseWeatherKindAt,
  precipitationKindForMonth,
  weatherAt,
  weatherBlockIndex,
  weatherForDay,
  weatherForecast,
  windSpeedAt,
  windSpeedFactor,
} from '../../../src/systems/WeatherSystem.js';
import { buildCityModifierContext } from '../../../src/systems/CityModifierSystem.js';
import { calculatePowerNetwork } from '../../../src/systems/PowerNetworkSystem.js';
import { getDailySolarMultiplier } from '../../../src/systems/ClimateSystem.js';
import { createHexCoordinates } from '../../../src/systems/HexGridSystem.js';
import { FACILITIES } from '../../../src/core/Constants.js';

const SEED = 20400101;
const DAYS = 400;
const { HOLD_DAYS, WIND } = WEATHER_RULES;

function stateWithSeed(seed = SEED) {
  const state = new GameState();
  state.environment = createEnvironment(seed);
  return state;
}

function series(seed, days = DAYS) {
  return Array.from({ length: days }, (_, day) => weatherForDay(seed, day, { month: 7 }));
}

test('같은 씨앗은 같은 날씨를, 다른 씨앗은 다른 날씨를 낸다', () => {
  const a = series(SEED);
  const b = series(SEED);
  const c = series(SEED + 1);
  expect(a).toEqual(b);
  expect(a.map(({ kind }) => kind).join('')).not.toBe(c.map(({ kind }) => kind).join(''));
  expect(a.map(({ windSpeedMs }) => windSpeedMs)).not.toEqual(c.map(({ windSpeedMs }) => windSpeedMs));
});

test('날씨는 맑음·흐림·강수 세 종류만 나오고 400일 안에 셋 다 등장한다', () => {
  const kinds = new Set(Array.from({ length: DAYS }, (_, day) => baseWeatherKindAt(SEED, day)));
  expect([...kinds].sort()).toEqual([...WEATHER_RULES.BASE_KINDS].sort());
  expect(baseWeatherKindAt(SEED, 0)).toBe(WEATHER_RULES.INITIAL_KIND);
});

test('강수는 12~2월엔 눈, 그 밖엔 비로 표시되고 태양광은 0이다', () => {
  expect(precipitationKindForMonth(1)).toBe('snow');
  expect(precipitationKindForMonth(12)).toBe('snow');
  expect(precipitationKindForMonth(7)).toBe('rain');
  const wetDay = Array.from({ length: DAYS }, (_, day) => day).find((day) => baseWeatherKindAt(SEED, day) === 'precipitation');
  expect(wetDay).toBeDefined();
  const winter = weatherForDay(SEED, wetDay, { month: 1 });
  const summer = weatherForDay(SEED, wetDay, { month: 7 });
  expect(winter).toMatchObject({ kind: 'snow', baseKind: 'precipitation', label: '눈', icon: 'snowflake', solarFactor: 0 });
  expect(summer).toMatchObject({ kind: 'rain', baseKind: 'precipitation', label: '비', icon: 'cloud-rain', solarFactor: 0 });
  // 눈이든 비든 풍속은 같다 — 풍력은 날씨 종류와 무관하다.
  expect(winter.windSpeedMs).toBe(summer.windSpeedMs);
});

test('태양광 배율은 맑음 100~120%, 흐림 10~90% 안에서 묶음마다 다르게 뽑힌다', () => {
  const days = series(SEED);
  const clear = days.filter(({ kind }) => kind === 'clear');
  const cloudy = days.filter(({ kind }) => kind === 'cloudy');
  expect(clear.length).toBeGreaterThan(0);
  expect(cloudy.length).toBeGreaterThan(0);
  clear.forEach(({ solarFactor }) => {
    expect(solarFactor).toBeGreaterThanOrEqual(1);
    expect(solarFactor).toBeLessThanOrEqual(1.2);
  });
  cloudy.forEach(({ solarFactor }) => {
    expect(solarFactor).toBeGreaterThanOrEqual(0.1);
    expect(solarFactor).toBeLessThanOrEqual(0.9);
  });
  expect(new Set(cloudy.map(({ solarFactor }) => solarFactor)).size).toBeGreaterThan(3);
});

test('풍속은 범위 안에 들고 출력은 시동·정격·최대·안전 정지 곡선을 따른다', () => {
  for (let day = 0; day < DAYS; day += 1) {
    const speed = windSpeedAt(SEED, day);
    expect(speed).toBeGreaterThanOrEqual(WIND.SPEED_MIN_MS);
    expect(speed).toBeLessThanOrEqual(WIND.SPEED_MAX_MS);
  }
  expect(windSpeedFactor(WIND.CUT_IN_MS - 0.1)).toBe(0);
  expect(windSpeedFactor(WIND.CUT_IN_MS)).toBe(0);
  expect(windSpeedFactor((WIND.CUT_IN_MS + WIND.RATED_MS) / 2)).toBeCloseTo(0.5, 2);
  expect(windSpeedFactor(WIND.RATED_MS)).toBe(1);
  expect(windSpeedFactor(WIND.CUT_OUT_MS - 0.1)).toBe(WIND.MAX_FACTOR);
  expect(windSpeedFactor(WIND.CUT_OUT_MS)).toBe(0);
  expect(windSpeedFactor(Number.NaN)).toBe(0);
});

test('풍력 장기 평균 출력은 옛 4일 고정 패턴(0.84)에서 크게 벗어나지 않는다', () => {
  let total = 0;
  let count = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    for (let day = 0; day < DAYS; day += 1) {
      total += weatherForDay(seed, day, { month: 7 }).windFactor;
      count += 1;
    }
  }
  const average = total / count;
  expect(average).toBeGreaterThan(0.7);
  expect(average).toBeLessThan(0.9);
});

test('날씨는 HOLD_DAYS일 묶음 안에서 바뀌지 않고 묶음 경계에서만 바뀐다', () => {
  expect(HOLD_DAYS).toBeGreaterThanOrEqual(5);
  const days = series(SEED);
  let changes = 0;
  for (let day = 1; day < DAYS; day += 1) {
    const same = days[day].kind === days[day - 1].kind
      && days[day].solarFactor === days[day - 1].solarFactor
      && days[day].windSpeedMs === days[day - 1].windSpeedMs;
    if (day % HOLD_DAYS !== 0) {
      expect(same).toBe(true);
      expect(weatherBlockIndex(day)).toBe(weatherBlockIndex(day - 1));
    } else if (!same) {
      changes += 1;
    }
  }
  expect(changes).toBeGreaterThan(10);
});

test('수요 변동도 같은 묶음 주기로만 바뀐다', () => {
  expect(DEMAND_VARIATION.HOLD_DAYS).toBeGreaterThanOrEqual(5);
  const state = stateWithSeed();
  let changes = 0;
  for (let day = 1; day < DAYS; day += 1) {
    const same = demandVariationFactor(state, day) === demandVariationFactor(state, day - 1);
    if (day % DEMAND_VARIATION.HOLD_DAYS !== 0) expect(same).toBe(true);
    else if (!same) changes += 1;
  }
  expect(changes).toBeGreaterThan(10);
});

test('강제 날씨는 종류·풍속을 덮어쓰고 출처를 남긴다', () => {
  const forced = weatherForDay(SEED, 3, { month: 7, forced: { kind: 'snow', windSpeedMs: 2, source: '폭설·한파' } });
  expect(forced).toMatchObject({ kind: 'snow', label: '눈', solarFactor: 0, windSpeedMs: 2, windFactor: 0, forcedBy: '폭설·한파' });
  const unknown = weatherForDay(SEED, 3, { month: 7, forced: { kind: 'hail', source: 'x' } });
  expect(unknown.kind).toBe(weatherForDay(SEED, 3, { month: 7 }).kind);
});

test('진행 중인 기후 이벤트가 오늘 날씨를 정하고, 예보는 일정표를 본다', () => {
  const state = stateWithSeed();
  state.elapsedGameDays = 40;
  state.progression = { ...state.progression, chapter: 3 };
  state.events = {
    ...state.events,
    activeId: 'event-0-0-monsoon',
    schedule: [
      { id: 'event-0-0-monsoon', type: 'monsoon', announceAt: 16, startAt: 40, endAt: 46 },
      { id: 'event-0-1-heatwave', type: 'heatwave', announceAt: 60, startAt: 84, endAt: 92 },
    ],
  };
  const today = weatherAt(state);
  expect(today).toMatchObject({ kind: 'rain', solarFactor: 0, forcedBy: CITY_EVENTS.monsoon.label });
  // 이벤트가 끝난 뒤의 날은 자연 날씨다.
  expect(weatherAt(state, 46).forcedBy).toBeNull();
  // 예보는 일정표에서 이벤트가 덮는 날을 그 이벤트 날씨로 낸다.
  const [tomorrow] = weatherForecast(state, 1);
  expect(tomorrow).toMatchObject({ dayIndex: 41, kind: 'rain', forcedBy: CITY_EVENTS.monsoon.label });
  expect(weatherAt(state, 84)).toMatchObject({ kind: 'clear', forcedBy: CITY_EVENTS.heatwave.label });
});

test('무풍·미세먼지는 흐림에 약풍을 고정해 풍력을 멈춘다', () => {
  const state = stateWithSeed();
  state.elapsedGameDays = 40;
  state.events = {
    ...state.events,
    activeId: 'event-0-0-stagnantAir',
    schedule: [{ id: 'event-0-0-stagnantAir', type: 'stagnantAir', announceAt: 16, startAt: 40, endAt: 46 }],
  };
  const today = weatherAt(state);
  expect(today).toMatchObject({ kind: 'cloudy', windSpeedMs: WEATHER_RULES.EVENT_WEATHER.stagnantAir.windSpeedMs, windFactor: 0 });
});

test('최종시험 단계는 그 단계에 맞는 날씨를 강제하고 다음 단계도 미리 내다본다', () => {
  const state = stateWithSeed();
  state.elapsedGameDays = 100;
  const monsoonIndex = STRESS_PHASES.findIndex(({ id }) => id === 'monsoonFront');
  const monsoon = STRESS_PHASES[monsoonIndex];
  state.stressTest = { status: 'running', phaseIndex: monsoonIndex, phaseDay: monsoon.durationDays - 1, attempts: 1 };
  expect(weatherAt(state)).toMatchObject({ kind: 'rain', solarFactor: 0, forcedBy: monsoon.label });
  const next = STRESS_PHASES[monsoonIndex + 1];
  const [tomorrow] = weatherForecast(state, 1);
  expect(tomorrow.forcedBy).toBe(WEATHER_RULES.EVENT_WEATHER[next.id] ? next.label : null);
});

test('도시 수정자는 태양광엔 날씨 배율을, 풍력엔 풍속 배율을, 조력엔 1을 싣는다', () => {
  const state = stateWithSeed();
  state.elapsedGameDays = 12;
  state.grid = Array(19).fill(null);
  state.grid[0] = { type: 'solar', level: 1, priority: 'normal', rotation: 4 };
  state.grid[1] = { type: 'wind', level: 1, priority: 'normal', rotation: state.environment.windDirections[1] };
  state.grid[2] = { type: 'tidal', level: 1, priority: 'normal' };
  const coords = createHexCoordinates(2);
  const context = buildCityModifierContext(state, { coords });
  const weather = weatherAt(state);
  expect(context.city.weather).toEqual(weather);
  expect(context.byFacility[0].daily.supply).toBe(weather.solarFactor);
  expect(context.byFacility[1].daily.supply).toBe(weather.windFactor);
  expect(context.byFacility[2].daily.supply).toBe(1);

  // 전력망의 발전 가능량에 그대로 반영된다(태양광은 낮/밤 평균 11/24도 곱한다).
  const power = calculatePowerNetwork({ grid: state.grid, coords, modifierContext: context });
  expect(power.generationAvailableByIndex[0]).toBeCloseTo(FACILITIES.solar.supply * getDailySolarMultiplier() * weather.solarFactor, 2);
  expect(power.generationAvailableByIndex[1]).toBeCloseTo(FACILITIES.wind.supply * weather.windFactor, 2);
});
