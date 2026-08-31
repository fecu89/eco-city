import { RESEARCH_RULES } from './Constants.js';

const all = (...items) => Object.freeze({ mode: 'all', items: Object.freeze(items) });
const any = (...items) => Object.freeze({ mode: 'any', items: Object.freeze(items) });

function research(id, name, icon, durationHours, cost, prerequisites, outcome, branch) {
  return Object.freeze({
    id,
    name,
    icon,
    durationHours,
    realMinutesAt1x: durationHours / RESEARCH_RULES.GAME_HOURS_PER_REAL_MINUTE,
    cost,
    prerequisites,
    outcome: Object.freeze(outcome),
    branch,
  });
}

export const RESEARCH = Object.freeze({
  solar2: research('solar2', '고효율 태양전지', 'sun', 120, 10, all('facility:solar'), { tech: ['solar', 2], effect: 'solar_efficiency' }, 'generation'),
  wind2: research('wind2', '풍력 예측 제어', 'wind', 120, 10, all('facility:wind'), { tech: ['wind', 2], effect: 'wind_forecast' }, 'generation'),
  battery2: research('battery2', '차세대 저장 화학', 'battery-charging', 150, 15, all('facility:battery'), { tech: ['battery', 2], effect: 'battery_chemistry' }, 'storage'),
  smartGrid: research('smartGrid', '스마트 전력망', 'network', 150, 15, all('facility:data'), { effect: 'smart_grid' }, 'grid'),
  demandResponse: research('demandResponse', '수요 반응 시스템', 'gauge', 150, 15, all('facility:data'), { effect: 'demand_response' }, 'demand'),
  tidal1: research('tidal1', '조력 발전 실증', 'waves', 150, 18, any('research:solar2', 'research:wind2'), { tech: ['tidal', 1], unlockFacility: 'tidal' }, 'generation'),
  solar3: research('solar3', '태양광 자동 추적', 'orbit', 180, 20, all('research:solar2'), { tech: ['solar', 3] }, 'generation'),
  wind3: research('wind3', '풍력 자율 제어', 'fan', 180, 20, all('research:wind2'), { tech: ['wind', 3] }, 'generation'),
  battery3: research('battery3', '비상 저장망', 'shield-check', 180, 22, all('research:battery2'), { tech: ['battery', 3], effect: 'battery_emergency' }, 'storage'),
});

export const LEGACY_RESEARCH_IDS = Object.freeze(['renewable3']);
