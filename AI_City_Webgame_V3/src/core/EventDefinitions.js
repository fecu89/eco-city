import { STRESS_TEST_RULES } from './Constants.js';
import {
  CLIMATE_EVENT_DEFINITIONS,
  FINAL_CLIMATE_PHASES,
} from './ClimateCampaignDefinitions.js';

// 한 게임일이 현실 1초이므로 퀘스트 시작 후 24일의 운영·재정 준비 구간을 보장한다.
// 준비 구간은 자동으로 일시정지하지 않으며, 실제 재해가 활성화될 때만 상단 상태를 표시한다.
export const EVENT_FORECAST_DAYS = 24;
export const EVENT_GAP_DAYS = 3;

export const CITY_EVENTS = CLIMATE_EVENT_DEFINITIONS;
export const OPENING_EVENT_DECK = Object.freeze(['heatwave', 'monsoon', 'typhoon']);
export const FULL_EVENT_DECK = Object.freeze(Object.keys(CITY_EVENTS));
export const STRESS_PHASES = FINAL_CLIMATE_PHASES;

// 이전 코드를 읽는 도구가 단계별 옛 수치를 진단할 수 있도록만 남긴다.
export const LEGACY_STRESS_PHASE_DAYS = STRESS_TEST_RULES.PHASE_DAYS;
