import { EVENT_FORECAST_HOURS } from './EventDefinitions.js';

const card = (id, category, title, description, durationHours = 0) => Object.freeze({
  id,
  category,
  title,
  description,
  durationHours,
});

export const OBJECTIVE_SETS = Object.freeze({
  'transition-choice': Object.freeze({
    id: 'transition-choice',
    chapter: 2,
    title: '전환 방향 선택',
    required: 2,
    cards: Object.freeze([
      card('transition-low-carbon', 'energy', '저탄소 전환', '저탄소 전력 40% 이상을 3시간 유지', 3),
      card('transition-economy', 'economy', '성장 여력', '시간당 순수익 +4.00 이상을 3시간 유지', 3),
      card('transition-carbon', 'environment', '탄소 안전선', 'CO₂ 10/h 이하를 3시간 유지', 3),
    ]),
    reward: Object.freeze({
      credits: 8,
      unlockFacilities: Object.freeze(['battery', 'wind']),
      upgradePermitLevel: 2,
      openSecondExpansion: true,
    }),
    nextSetId: 'specialization',
  }),
  specialization: Object.freeze({
    id: 'specialization',
    chapter: 2,
    title: '도시 전문화',
    required: 2,
    cards: Object.freeze([
      card('specialization-technology', 'technology', '전문 기술', '전문화 연구 1개와 해당 시설 Lv.2 달성'),
      card('specialization-grid', 'energy', '효율적 전력망', '충전량 8E의 가동 배터리 또는 송전효율 90%를 3시간 유지', 3),
      card('specialization-citizen', 'citizen', '시민과 필수시설', '필수시설 전력 90%·고용률 80%를 3시간 유지', 3),
    ]),
    reward: Object.freeze({ credits: 10, unlockFacilities: Object.freeze([]), chapterThreeEvents: true }),
    nextSetId: 'resilience',
  }),
  resilience: Object.freeze({
    id: 'resilience',
    chapter: 3,
    title: '회복탄력 도시',
    required: 3,
    cards: Object.freeze([
      card('resilience-profit', 'economy', '지속 흑자', '양의 순수익을 4시간 유지', 4),
      card('resilience-event-reserve', 'energy', '비상 예비력', `${EVENT_FORECAST_HOURS}시간 전 예보에 대비해 이벤트 중 필수시설 90%·저장량 5E를 4시간 유지`, 4),
      card('resilience-environment', 'environment', '저탄소 물관리', '저탄소 70%·물 제한 이내를 4시간 유지', 4),
      card('resilience-technology', 'technology', '고도화', '고급 연구 1개 또는 기능 시설 Lv.3 달성'),
    ]),
    reward: Object.freeze({ credits: 12, unlockFacilities: Object.freeze([]), stressTest: true }),
    nextSetId: null,
  }),
});

export const OBJECTIVE_SET_ORDER = Object.freeze(['transition-choice', 'specialization', 'resilience']);

export function objectiveSetById(id) {
  return OBJECTIVE_SETS[id] || null;
}
