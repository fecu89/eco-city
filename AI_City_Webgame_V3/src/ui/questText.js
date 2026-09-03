import { FACILITIES } from '../core/Constants.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { formatCredits } from './format.js';

const facilityNames = (keys) => keys
  .map((facility) => FACILITIES[facility]?.name || facility)
  .join('·');

// 퀘스트 보상 한 줄. 퀘스트 카드와 완료 토스트가 같은 문장을 쓴다.
export function rewardText(quest) {
  const reward = quest?.reward ?? {};
  const parts = [];
  if (reward.credits) parts.push(formatCredits(reward.credits));
  if (reward.unlockFacilities?.length) {
    parts.push(`${facilityNames(reward.unlockFacilities)} 해금`);
  }
  if (reward.unlockResearch?.length) {
    parts.push(`${reward.unlockResearch.map((id) => RESEARCH[id]?.name || id).join('·')} 해금`);
  }
  if (reward.upgradePermitFacilities?.length) {
    parts.push(`${facilityNames(reward.upgradePermitFacilities)} Lv.3 강화 허가`);
  }
  if (reward.upgradePermitLevel) parts.push(`Lv.${reward.upgradePermitLevel} 강화 허가`);
  return `보상 ${parts.join(' · ') || '최종 성적표'}`;
}
