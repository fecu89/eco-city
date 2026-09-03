import { STRESS_TEST_RULES } from './Constants.js';
import {
  CLIMATE_EVENT_DEFINITIONS,
  FINAL_CLIMATE_PHASES,
} from './ClimateCampaignDefinitions.js';

// 예보 구간 상수는 Constants.js가 소유한다. 기존 임포트가 그대로 동작하도록 여기서 다시 내보낸다.
export { EVENT_FORECAST_DAYS, EVENT_GAP_DAYS } from './Constants.js';

export const CITY_EVENTS = CLIMATE_EVENT_DEFINITIONS;
export const OPENING_EVENT_DECK = Object.freeze(['heatwave', 'monsoon', 'typhoon']);
export const FULL_EVENT_DECK = Object.freeze(Object.keys(CITY_EVENTS));
export const STRESS_PHASES = FINAL_CLIMATE_PHASES;

// 최종 기후시험의 총 일수. 구간 수는 STRESS_PHASES.length로 읽는다.
export function stressTestTotalDays() {
  return STRESS_PHASES.reduce((sum, phase) => sum + phase.durationDays, 0);
}

// 이전 코드를 읽는 도구가 단계별 옛 수치를 진단할 수 있도록만 남긴다.
export const LEGACY_STRESS_PHASE_DAYS = STRESS_TEST_RULES.PHASE_DAYS;
