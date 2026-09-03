import { CALENDAR, HEATWAVE_RULES, SOLAR_RULES } from '../core/Constants.js';

// 풍력은 예전의 4일 고정 패턴 대신 날씨(core/Weather.js)의 풍속을 따른다.
const normalizeHour = (hour) => ((Number(hour) % CALENDAR.HOURS_PER_DAY) + CALENDAR.HOURS_PER_DAY) % CALENDAR.HOURS_PER_DAY;

// 시간대별 태양광 배율: 밤 0, 새벽·저녁 DUSK_MULTIPLIER, 낮 1. 경계 시각은 settings.json SOLAR_RULES.
export function getSolarMultiplier(hour) {
  const h = normalizeHour(hour);
  if (h <= SOLAR_RULES.NIGHT_END_HOUR || h >= SOLAR_RULES.NIGHT_START_HOUR) return 0;
  if (h <= SOLAR_RULES.DUSK_END_HOUR || h >= SOLAR_RULES.DUSK_START_HOUR) return SOLAR_RULES.DUSK_MULTIPLIER;
  return 1;
}

// 하루 평균 태양광 배율(유효 일조 시간 / 하루 시간).
export function getDailySolarMultiplier() {
  return SOLAR_RULES.DAILY_AVERAGE_LIT_HOURS / CALENDAR.HOURS_PER_DAY;
}

// 폭염 수요 배수. 영향 시설과 배수는 settings.json HEATWAVE_RULES.
export function getDemandMultiplier(type, { heatwave = false, adjacentGreen = false } = {}) {
  if (!heatwave || !HEATWAVE_RULES.AFFECTED_TYPES.includes(type)) return 1;
  if (type === 'residential' && adjacentGreen) return HEATWAVE_RULES.ADJACENT_GREEN_DEMAND_MULTIPLIER;
  return HEATWAVE_RULES.DEMAND_MULTIPLIER;
}
