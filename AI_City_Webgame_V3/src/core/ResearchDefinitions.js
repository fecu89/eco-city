import { RESEARCH_RULES } from './Constants.js';

function research(id, name, icon, durationHours, cost, prerequisites, outcome) {
  return Object.freeze({
    id,
    name,
    icon,
    durationHours,
    realMinutesAt1x: durationHours / RESEARCH_RULES.GAME_HOURS_PER_REAL_MINUTE,
    cost,
    prerequisites: Object.freeze([...prerequisites]),
    outcome: Object.freeze(outcome),
  });
}

export const RESEARCH = Object.freeze({
  solar2: research('solar2', '고효율 태양전지', 'sun', RESEARCH_RULES.DURATION_HOURS.STANDARD, 10, ['facility:solar'], { tech: ['solar', 2] }),
  wind2: research('wind2', '풍력 예측 제어', 'wind', RESEARCH_RULES.DURATION_HOURS.STANDARD, 10, ['facility:wind'], { tech: ['wind', 2] }),
  battery2: research('battery2', '차세대 저장 화학', 'battery-charging', RESEARCH_RULES.DURATION_HOURS.ADVANCED, 15, ['facility:battery'], { tech: ['battery', 2] }),
  tidal1: research('tidal1', '조력 발전 실증', 'waves', RESEARCH_RULES.DURATION_HOURS.ADVANCED, 18, ['tech:solar:2', 'tech:wind:2'], { tech: ['tidal', 1], unlockFacility: 'tidal' }),
  renewable3: research(
    'renewable3',
    '통합 재생전력망',
    'network',
    RESEARCH_RULES.DURATION_HOURS.CAPSTONE,
    24,
    ['research:solar2', 'research:wind2', 'research:battery2', 'research:tidal1'],
    { techAll: { solar: 3, wind: 3, battery: 3, tidal: 3 } },
  ),
});
