import { SETTINGS, settingsRow } from './Settings.js';

// 지역 특성 배율(생활지역: 주거 수입·오염 시설 건설비 / 산업지역: 공장 건설비·주거 건강비). settings.json ZONES.TRAIT_MODIFIERS.
export const ZONE_TRAIT_MODIFIERS = SETTINGS.ZONES.TRAIT_MODIFIERS;

// 설명 문구의 "+20%" 같은 비율은 위 배율에서 만든다 — 값을 바꾸면 문구도 따라간다.
const percentLabel = (ratio) => {
  const percent = Math.round(ratio * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};
const multiplierLabel = (multiplier) => percentLabel(multiplier - 1);

// 지역 특성 문구. 실제 배율은 ZONE_TRAIT_MODIFIERS·ENERGY_SITE_OUTPUT_MULTIPLIER이고 ZoneSystem.js가 적용한다.
export const ZONE_TRAITS = Object.freeze({
  solar: Object.freeze({
    id: 'solar',
    side: 'east',
    label: '태양광 우수지역',
    icon: 'sun',
    description: `태양광 출력 ${multiplierLabel(SETTINGS.ZONES.ENERGY_SITE_OUTPUT_MULTIPLIER)}`,
  }),
  residential: Object.freeze({
    id: 'residential',
    side: 'east',
    label: '생활지역',
    icon: 'building-2',
    description: `주거 수입 ${multiplierLabel(ZONE_TRAIT_MODIFIERS.residential.RESIDENTIAL_INCOME)} · 공장·화력 건설비 ${percentLabel(ZONE_TRAIT_MODIFIERS.residential.HEAVY_BUILD_COST_RATIO)}`,
  }),
  wind: Object.freeze({
    id: 'wind',
    side: 'west',
    label: '풍황 우수지역',
    icon: 'wind',
    // "변동폭 +10%"는 대응하는 규칙 값이 없는 설명 문구라 그대로 둔다.
    description: `풍력 평균 출력 ${multiplierLabel(SETTINGS.ZONES.ENERGY_SITE_OUTPUT_MULTIPLIER)} · 변동폭 +10%`,
  }),
  industrial: Object.freeze({
    id: 'industrial',
    side: 'west',
    label: '산업지역',
    icon: 'factory',
    description: `공장 건설비 ${percentLabel(ZONE_TRAIT_MODIFIERS.industrial.FACTORY_BUILD_COST_RATIO)} · 주거 오염 건강비 ${percentLabel(ZONE_TRAIT_MODIFIERS.industrial.RESIDENTIAL_HEALTH_COST_RATIO)}`,
  }),
});

// 확장 방향 문구. 해금 시설(facility)과 지역 특성 목록(traits)은 settings.json ZONES.EXPANSION_SIDES에서 읽는다.
const EXPANSION_SIDE_COPY = Object.freeze({
  east: { label: '동부 확장', description: '태양광과 주거 수익에 유리하지만 오염 시설 건설비가 높습니다.' },
  west: { label: '서부 확장', description: '풍력과 공장 건설에 유리하지만 주거 오염 피해가 커집니다.' },
});

export const EXPANSION_SIDES = Object.freeze(Object.fromEntries(Object.entries(EXPANSION_SIDE_COPY).map(([id, copy]) => {
  const numbers = settingsRow('ZONES.EXPANSION_SIDES', id);
  return [id, Object.freeze({
    id,
    label: copy.label,
    facility: numbers.facility,
    traits: numbers.traits,
    description: copy.description,
  })];
})));

export const EXPANSION_UPKEEP = SETTINGS.ZONES.EXPANSION_UPKEEP;

export const ENERGY_SITE_OUTPUT_MULTIPLIER = SETTINGS.ZONES.ENERGY_SITE_OUTPUT_MULTIPLIER;

// 조력은 더 이상 특정 우수 입지를 쓰지 않는다. 해안 칸마다 다른 조수간만의 차가
// 출력을 정하며, 그 값은 EnvironmentSystem이 판마다 새로 뽑는다.
export const ENERGY_SITE_LABELS = Object.freeze({
  solar: `태양광 우수 입지 · 출력 ${multiplierLabel(ENERGY_SITE_OUTPUT_MULTIPLIER)}`,
  wind: `풍황 우수 입지 · 출력 ${multiplierLabel(ENERGY_SITE_OUTPUT_MULTIPLIER)}`,
});

// 확장 한 방향에서 열리는 칸 수. 바깥 링(37−19=18칸)을 동·서로 반씩 나눈다(ZoneSystem.expansionGroups와 같은 값).
export const EXPANSION_CELLS_PER_SIDE = (SETTINGS.BOARD.EXPANDED_CELLS - SETTINGS.BOARD.INITIAL_CELLS) / 2;
