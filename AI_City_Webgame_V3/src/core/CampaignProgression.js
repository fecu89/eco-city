import { QUESTS } from './QuestDefinitions.js';

export const CAMPAIGN_QUEST_INDEXES = Object.freeze({
  // 1~5단계는 실행 단계, 6단계부터 재설계 단계다.
  EXECUTION_STAGE_LAST_QUEST: 5,
  // 기준 도시 지표를 저장하고 연구 메뉴를 여는 퀘스트.
  BASELINE_CAPTURE_QUEST: 4,
  FOUNDATION_END: 6,
  PREPARATION_START: 7,
  // 데이터센터 현대화 보상으로 반대편 외곽 9칸이 열리는 퀘스트.
  SECOND_EXPANSION_QUEST: 8,
  PREPARATION_END: 10,
  CLIMATE_START: 11,
  CLIMATE_END: 18,
  FINAL_TEST: 19,
});

// 기후전 진입 전에 반드시 완료되는 준비 퀘스트 4개(7~10단계)의 id다.
export const PREPARATION_QUEST_IDS = Object.freeze(QUESTS
  .slice(CAMPAIGN_QUEST_INDEXES.PREPARATION_START - 1, CAMPAIGN_QUEST_INDEXES.PREPARATION_END)
  .map((quest) => quest.id));

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
