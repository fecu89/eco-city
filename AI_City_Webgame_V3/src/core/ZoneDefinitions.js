export const ZONE_TRAITS = Object.freeze({
  solar: Object.freeze({
    id: 'solar',
    side: 'east',
    label: '태양광 우수지역',
    icon: 'sun',
    description: '태양광 출력 +20%',
  }),
  residential: Object.freeze({
    id: 'residential',
    side: 'east',
    label: '생활지역',
    icon: 'building-2',
    description: '주거 수입 +15% · 공장·화력 건설비 +20%',
  }),
  wind: Object.freeze({
    id: 'wind',
    side: 'west',
    label: '풍황 우수지역',
    icon: 'wind',
    description: '풍력 평균 출력 +20% · 변동폭 +10%',
  }),
  industrial: Object.freeze({
    id: 'industrial',
    side: 'west',
    label: '산업지역',
    icon: 'factory',
    description: '공장 건설비 -15% · 주거 오염 건강비 +25%',
  }),
});

export const EXPANSION_SIDES = Object.freeze({
  east: Object.freeze({
    id: 'east',
    label: '동부 확장',
    facility: 'solar',
    traits: Object.freeze(['solar', 'residential']),
    description: '태양광과 주거 수익에 유리하지만 오염 시설 건설비가 높습니다.',
  }),
  west: Object.freeze({
    id: 'west',
    label: '서부 확장',
    facility: 'wind',
    traits: Object.freeze(['wind', 'industrial']),
    description: '풍력과 공장 건설에 유리하지만 주거 오염 피해가 커집니다.',
  }),
});

export const EXPANSION_UPKEEP = Object.freeze({
  0: 0,
  1: 1,
  2: 2.5,
});

export const ENERGY_SITE_OUTPUT_MULTIPLIER = 1.2;

// 실제 해안 장식과 맞닿는 세 곳이다. 두 부두 수로와 서쪽 암반·섬 사이의
// 좁은 해협을 조차가 큰 조력 우수 입지로 사용한다.
export const TIDAL_SITE_COORDINATES = Object.freeze([
  Object.freeze({ q: -1, r: 3 }),
  Object.freeze({ q: 1, r: -3 }),
  Object.freeze({ q: -3, r: 0 }),
]);

export const ENERGY_SITE_LABELS = Object.freeze({
  solar: '태양광 우수 입지 · 출력 +20%',
  wind: '풍황 우수 입지 · 출력 +20%',
  tidal: '조차 우수 해협 · 출력 +20%',
});
