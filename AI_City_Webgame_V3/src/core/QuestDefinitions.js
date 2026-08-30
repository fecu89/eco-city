export const QUESTS = Object.freeze([
  ['first-citizens', '첫 시민', 4, 'thermal'],
  ['power-on', '도시의 불을 켜라', 5, 'factory'],
  ['growth-engine', '성장 엔진', 6, 'data'],
  ['ai-district', 'AI 산업지구', 8, 'nuclear'],
  ['growth-cost', '성장의 대가', 8, 'cooling'],
  ['risk-scan', '문제 지점 스캔', 24, 'solar'],
  ['cool-core', '열을 잡아라', 6, 'battery'],
  ['clean-power-test', '깨끗한 전력 시험', 6, 'wind'],
  ['renewable-network', '재생에너지 네트워크', 8, 'green'],
  ['living-neighborhood', '숨 쉬는 생활권', 8, null],
  ['heatwave-survival', '극한 폭염 생존', 10, null],
  ['night-grid', '야간 전력망', 10, null],
  ['low-carbon-transition', '저탄소 전환', 10, null],
  ['water-smart-city', '물을 아끼는 도시', 12, null],
  ['climate-council', '기후시민위원회', 0, null],
].map(([id, title, credits, unlockFacility], index) => Object.freeze({
  index: index + 1,
  id,
  title,
  reward: Object.freeze({ credits, unlockFacility }),
})));

export const QUEST_COUNT = QUESTS.length;
