import { FACILITIES } from '../core/Constants.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { formatCredits } from './format.js';

const facilityNames = (keys) => keys
  .map((facility) => FACILITIES[facility]?.name || facility)
  .join('·');

// 퀘스트 보상 한 줄. 퀘스트 카드와 완료 토스트가 같은 문장을 쓴다.
export function rewardText(quest) {
  const parts = [];
  if (quest.reward.credits) parts.push(formatCredits(quest.reward.credits));
  if (quest.reward.unlockFacilities.length) {
    parts.push(`${facilityNames(quest.reward.unlockFacilities)} 해금`);
  }
  if (quest.reward.unlockResearch?.length) {
    parts.push(`${quest.reward.unlockResearch.map((id) => RESEARCH[id]?.name || id).join('·')} 해금`);
  }
  if (quest.reward.upgradePermitFacilities?.length) {
    parts.push(`${facilityNames(quest.reward.upgradePermitFacilities)} Lv.3 강화 허가`);
  }
  if (quest.reward.upgradePermitLevel) parts.push(`Lv.${quest.reward.upgradePermitLevel} 강화 허가`);
  return `보상 ${parts.join(' · ') || '최종 성적표'}`;
}
