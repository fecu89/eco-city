import { STRESS_TEST_RULES } from './Constants.js';

const event = (id, label, icon, durationHours, description) => Object.freeze({
  id, label, icon, durationHours, description,
});

export const EVENT_FORECAST_HOURS = 6;
export const EVENT_GAP_HOURS = 3;

export const CITY_EVENTS = Object.freeze({
  heatwave: event('heatwave', '폭염', 'thermometer-sun', 8, '주거 전력과 데이터센터 물 부담 증가 · 태양광 출력 상승'),
  nightPeak: event('nightPeak', '야간 피크', 'moon-star', 5, '주거 전력 수요 증가 · 태양광 출력 거의 정지'),
  lowWind: event('lowWind', '무풍', 'wind', 6, '풍력 출력이 평소의 35%로 감소'),
  drought: event('drought', '물 부족', 'droplets', 6, '물 허용량 감소 · 순환냉각 효과 증가'),
});

export const OPENING_EVENT_DECK = Object.freeze(['heatwave', 'nightPeak', 'lowWind']);
export const FULL_EVENT_DECK = Object.freeze(['heatwave', 'nightPeak', 'lowWind', 'drought']);

export const STRESS_PHASES = Object.freeze([
  Object.freeze({ id: 'normal', label: '평상시', icon: 'activity', durationHours: STRESS_TEST_RULES.PHASE_HOURS.NORMAL }),
  Object.freeze({ id: 'heatwave', label: '폭염', icon: 'thermometer-sun', durationHours: STRESS_TEST_RULES.PHASE_HOURS.HEATWAVE }),
  Object.freeze({ id: 'nightPeak', label: '저녁 피크', icon: 'moon-star', durationHours: STRESS_TEST_RULES.PHASE_HOURS.NIGHT_PEAK }),
  Object.freeze({ id: 'lowWindNight', label: '무풍 야간', icon: 'cloud-moon', durationHours: STRESS_TEST_RULES.PHASE_HOURS.LOW_WIND_NIGHT }),
  Object.freeze({ id: 'recovery', label: '회복', icon: 'heart-pulse', durationHours: STRESS_TEST_RULES.PHASE_HOURS.RECOVERY }),
]);
