export const CAMPAIGN_QUEST_INDEXES = Object.freeze({
  FOUNDATION_END: 6,
  PREPARATION_START: 7,
  PREPARATION_END: 10,
  CLIMATE_START: 11,
  CLIMATE_END: 18,
  FINAL_TEST: 19,
});

// Lv.3 강화는 기후전의 준비 순서를 따른다. 값은 해당 허가를 보상으로 주는 퀘스트 번호다.
export const LEVEL_THREE_UNLOCK_QUEST_BY_FACILITY = Object.freeze({
  thermal: 10,
  nuclear: 10,
  wind: 10,
  solar: 11,
  tidal: 11,
  residential: 12,
  factory: 12,
  data: 12,
  battery: 12,
  cooling: 12,
  green: 12,
});

export function levelThreeUnlockQuestForFacility(facilityType) {
  return LEVEL_THREE_UNLOCK_QUEST_BY_FACILITY[facilityType] ?? 12;
}

export function upgradePermitLevelForFacility(state, facilityType) {
  const basePermit = Math.max(1, Math.min(3, Number(state?.upgradePermitLevel) || 1));
  if (basePermit >= 3) return basePermit;
  return Number(state?.questIndex) > levelThreeUnlockQuestForFacility(facilityType)
    ? 3
    : basePermit;
}
