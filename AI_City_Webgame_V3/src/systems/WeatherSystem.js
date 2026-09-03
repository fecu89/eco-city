// 상태(state)에 기대는 날씨 조회. 순수 계산은 core/Weather.js에 있다.
// 오늘은 진행 중인 기후 이벤트·최종시험 단계가 날씨를 고정하고, 내일 예보는 일정표를 본다.
import { WEATHER_RULES } from '../core/Constants.js';
import { CITY_EVENTS, STRESS_PHASES } from '../core/EventDefinitions.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';
import { calendarAtElapsedDay } from './CalendarSystem.js';
import { weatherForDay } from '../core/Weather.js';

export {
  baseWeatherKindAt,
  weatherBlockIndex,
  precipitationKindForMonth,
  solarWeatherFactorAt,
  windSpeedAt,
  windSpeedFactor,
  weatherForDay,
} from '../core/Weather.js';

function environmentSeed(state) {
  const seed = Number(state?.environment?.seed);
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

function forcedByDefinition(id, label) {
  const rule = WEATHER_RULES.EVENT_WEATHER[id];
  return rule ? { ...rule, source: label } : null;
}

// 최종시험은 단계가 날짜순으로 이어지므로 오늘 단계에서 offset일 뒤의 단계를 걸어서 찾는다.
function stressPhaseAtOffset(state, offsetDays) {
  const stress = state?.stressTest;
  if (stress?.status !== 'running') return null;
  let index = Number(stress.phaseIndex) || 0;
  let remaining = (STRESS_PHASES[index]?.durationDays || 0) - (Number(stress.phaseDay) || 0);
  let offset = Math.max(0, Math.trunc(Number(offsetDays) || 0));
  while (STRESS_PHASES[index] && offset >= remaining) {
    offset -= remaining;
    index += 1;
    remaining = STRESS_PHASES[index]?.durationDays || 0;
  }
  return STRESS_PHASES[index] || null;
}

function forcedWeatherAt(state, dayIndex) {
  const today = Number(state?.elapsedGameDays) || 0;
  const phase = stressPhaseAtOffset(state, dayIndex - today);
  if (phase) return forcedByDefinition(phase.id, phase.label);
  if (state?.stressTest?.status === 'running') return null;
  const finalTest = Number(state?.questIndex) >= CAMPAIGN_QUEST_INDEXES.FINAL_TEST;
  if (finalTest) return null;
  const events = state?.events;
  if (dayIndex === today) {
    const active = events?.schedule?.find?.((item) => item.id === events.activeId) || null;
    return active ? forcedByDefinition(active.type, CITY_EVENTS[active.type]?.label || active.type) : null;
  }
  const scheduled = events?.schedule?.find?.((item) => item.startAt <= dayIndex && dayIndex < item.endAt) || null;
  return scheduled ? forcedByDefinition(scheduled.type, CITY_EVENTS[scheduled.type]?.label || scheduled.type) : null;
}

export function weatherAt(state, dayIndex = state?.elapsedGameDays ?? 0) {
  const day = Math.max(0, Math.trunc(Number(dayIndex) || 0));
  return weatherForDay(environmentSeed(state), day, {
    month: calendarAtElapsedDay(day).month,
    forced: forcedWeatherAt(state, day),
  });
}

// 내일부터 days일치 예보. 이벤트 일정이 잡힌 날은 그 이벤트 날씨로 나온다.
export function weatherForecast(state, days = 1) {
  const today = Math.max(0, Math.trunc(Number(state?.elapsedGameDays) || 0));
  const count = Math.max(1, Math.trunc(Number(days)) || 1);
  return Array.from({ length: count }, (_, offset) => weatherAt(state, today + offset + 1));
}
