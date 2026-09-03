import { QUESTS } from './QuestDefinitions.js';
import { SETTINGS } from './Settings.js';

// 캠페인 구간 경계 퀘스트 번호. 값은 settings.json CAMPAIGN.QUEST_INDEXES에 있다.
//  - EXECUTION_STAGE_LAST_QUEST: 여기까지가 실행 단계, 다음부터 재설계 단계다.
//  - BASELINE_CAPTURE_QUEST: 기준 도시 지표를 저장하고 연구 메뉴를 여는 퀘스트.
//  - SECOND_EXPANSION_QUEST: 데이터센터 현대화 보상으로 반대편 외곽 9칸이 열리는 퀘스트.
export const CAMPAIGN_QUEST_INDEXES = SETTINGS.CAMPAIGN.QUEST_INDEXES;

// 기후 대응 퀘스트 수(11~18단계 → 8). 화면의 "기후 대응 n / 8" 분모.
export const CLIMATE_QUEST_COUNT = CAMPAIGN_QUEST_INDEXES.CLIMATE_END - CAMPAIGN_QUEST_INDEXES.CLIMATE_START + 1;

// 기후전 진입 전에 반드시 완료되는 준비 퀘스트 4개(7~10단계)의 id다.
export const PREPARATION_QUEST_IDS = Object.freeze(QUESTS
  .slice(CAMPAIGN_QUEST_INDEXES.PREPARATION_START - 1, CAMPAIGN_QUEST_INDEXES.PREPARATION_END)
  .map((quest) => quest.id));

// Lv.3 강화는 기후전의 준비 순서를 따른다. 값은 해당 허가를 보상으로 주는 퀘스트 번호다
// (settings.json CAMPAIGN.LEVEL_THREE_UNLOCK_QUEST_BY_FACILITY).
export const LEVEL_THREE_UNLOCK_QUEST_BY_FACILITY = SETTINGS.CAMPAIGN.LEVEL_THREE_UNLOCK_QUEST_BY_FACILITY;

export function levelThreeUnlockQuestForFacility(facilityType) {
  return LEVEL_THREE_UNLOCK_QUEST_BY_FACILITY[facilityType] ?? SETTINGS.CAMPAIGN.LEVEL_THREE_UNLOCK_DEFAULT_QUEST;
}

export function upgradePermitLevelForFacility(state, facilityType) {
  const basePermit = Math.max(1, Math.min(3, Number(state?.upgradePermitLevel) || 1));
  if (basePermit >= 3) return basePermit;
  return Number(state?.questIndex) > levelThreeUnlockQuestForFacility(facilityType)
    ? 3
    : basePermit;
}
