import { STRESS_TEST_RULES } from './Constants.js';

const event = (id, label, icon, durationHours, description, preparation) => Object.freeze({
  id, label, icon, durationHours, description, preparation,
});

// 한 게임 시간이 현실 1초이므로 짧은 수치만으로는 예보가 실제 의사결정 시간을 주지 못한다.
// 첫 예보 때 자동 일시정지하는 UI와 함께 24시간의 운영·재정 준비 구간을 보장한다.
export const EVENT_FORECAST_HOURS = 24;
export const EVENT_GAP_HOURS = 3;

export const CITY_EVENTS = Object.freeze({
  heatwave: event(
    'heatwave',
    '폭염',
    'thermometer-sun',
    8,
    '주거 전력과 데이터센터 물 부담 증가 · 태양광 출력 상승',
    '주거지와 냉각시설의 전력 우선순위를 높이고 배터리 예비력을 확보하세요.',
  ),
  nightPeak: event(
    'nightPeak',
    '야간 피크',
    'moon-star',
    5,
    '주거 전력 수요 증가 · 태양광 출력 거의 정지',
    '태양광을 제외한 발전 예비력을 확보하고 배터리를 미리 충전하세요.',
  ),
  lowWind: event(
    'lowWind',
    '무풍',
    'wind',
    6,
    '풍력 출력이 평소의 35%로 감소',
    '풍력 외 발전원을 가동하고 저장 전력을 필수시설에 우선 배분하세요.',
  ),
  drought: event(
    'drought',
    '물 부족',
    'droplets',
    6,
    '물 허용량 감소 · 순환냉각 효과 증가',
    '데이터센터를 절약 모드로 전환하고 순환냉각 연결과 물 사용량을 점검하세요.',
  ),
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
