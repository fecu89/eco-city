import { CLIMATE_QUESTS, CLIMATE_QUEST_ORDER } from './ClimateCampaignDefinitions.js';
import { stressTestTotalDays } from './EventDefinitions.js';

function quest(id, title, goal, credits, unlockFacilities, progressKind, details, {
  quizKind = null,
  unlockResearch = [],
  upgradePermitLevel = null,
  upgradePermitFacilities = [],
  stressTest = false,
} = {}) {
  const unlocks = Array.isArray(unlockFacilities)
    ? unlockFacilities
    : unlockFacilities ? [unlockFacilities] : [];
  return Object.freeze({
    id,
    title,
    goal,
    progressKind,
    quizKind,
    details: Object.freeze([...details]),
    reward: Object.freeze({
      credits,
      unlockFacility: unlocks[0] || null,
      unlockFacilities: Object.freeze([...unlocks]),
      unlockResearch: Object.freeze([...unlockResearch]),
      upgradePermitLevel,
      upgradePermitFacilities: Object.freeze([...upgradePermitFacilities]),
      stressTest,
    }),
  });
}

function campaignQuest(definition) {
  const unlockFacilities = Object.freeze([...definition.reward.unlockFacilities]);
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    goal: definition.goal,
    progressKind: 'climate',
    quizKind: null,
    details: definition.details,
    reward: Object.freeze({
      credits: definition.reward.credits,
      unlockFacility: unlockFacilities[0] || null,
      unlockFacilities,
      unlockResearch: definition.reward.unlockResearch,
      upgradePermitLevel: definition.reward.upgradePermitLevel,
      upgradePermitFacilities: definition.reward.upgradePermitFacilities,
      stressTest: definition.reward.stressTest,
    }),
  });
}

const RAW_QUESTS = [
  quest('first-citizens', '2040, 첫 시민', '주거지 2개를 건설하세요.', 4, ['factory', 'thermal'], 'count', [
    '주거지 2개를 완공하세요.',
    '보상으로 공장과 화력발전을 동시에 해금합니다.',
  ]),
  quest('power-on', '생산 기반을 함께 켜라', '공장과 화력발전을 인접 배치하고 공장을 흑자로 2일 가동하세요.', 5, ['green'], 'days', [
    '공장 1개와 화력발전 1개가 필요합니다.',
    '화력발전을 먼저 짓고 완공을 기다린 뒤 공장을 이어서 지으면 운영비 손실을 줄일 수 있습니다.',
    '두 시설은 육각형 한 칸 거리로 인접해야 합니다.',
    '공장 전력 공급률과 가동률을 50% 이상으로 유지해 실제 수입을 2일 연속 발생시키세요.',
    '완료하면 다음 퀘스트부터 첫 녹지 1칸을 조성할 수 있습니다.',
  ]),
  quest('jobs-and-tax', '첫 녹지 조성', '녹지 1칸을 건설하세요.', 6, 'data', 'count', [
    '이전 퀘스트 보상으로 해금된 녹지를 1칸 건설하세요.',
    '녹지는 탄소를 낮추고 인접한 주거지의 생활권을 개선합니다.',
    '완료하면 데이터센터를 해금합니다.',
  ]),
  quest('research-seed', '연구도시의 씨앗', '데이터센터 전력 공급률을 90% 이상으로 2일 유지하세요.', 8, 'nuclear', 'days', [
    '데이터센터를 건설하세요.',
    '전력이 부족하면 생활 필수 수요 다음으로 데이터센터, 공장 순서로 공급됩니다.',
    '해당 데이터센터의 전력 공급률 90% 이상을 2일 연속 유지하세요.',
  ]),
  quest('growth-cost', '탄소 전환선', '핵발전을 가동해 저탄소 전력 40% 이상, CO₂ 12 이하와 흑자를 2일 유지하세요.', 8, 'cooling', 'days', [
    '핵발전 1기와 화력 예비력 1기를 함께 유지하세요.',
    '전력망은 저탄소 전원을 먼저 급전하고 화력발전은 부족분을 보충합니다.',
    '저탄소 전력이 실제 공급 전력의 40% 이상이어야 합니다.',
    '일일 CO₂ 12 이하와 순수익 0 초과를 2일 연속 유지하세요.',
    'CO₂ 12는 전환 단계 목표이며 도시의 장기 안전 기준은 10입니다.',
  ]),
  quest('water-cycle', '도시 물순환', '데이터센터와 순환냉각을 연결하고 물 사용을 기준 이하로 2일 유지하세요.', 14, null, 'days', [
    '데이터센터와 순환냉각을 서로 인접하게 배치하세요.',
    '두 시설의 전력 공급률을 각각 90% 이상으로 유지하세요.',
    '일일 물 사용량이 기준 도시보다 높지 않은 상태를 2일 유지하세요.',
    '완료 후 첫 확장 방향을 고르면 동부는 태양광, 서부는 풍력이 해금됩니다.',
  ]),
  quest('solar-research-foundation', '태양광 연구 기초', '고효율 태양전지 연구를 완료하세요.', 10, 'battery', 'research', [
    '태양광을 해금한 뒤 데이터센터에서 고효율 태양전지 연구를 시작하세요.',
    '데이터센터 전력 공급률 90% 이상을 유지하면 연구가 진행됩니다.',
    '아직 맞히지 않은 전용 퀴즈로 남은 연구 시간을 줄일 수 있습니다.',
  ], { upgradePermitLevel: 2 }),
  quest('data-center-modernization', '데이터센터 현대화', '데이터센터 Lv.2와 스마트 전력망 연구를 완성하세요.', 12, 'wind', 'modernization', [
    '가동 가능한 데이터센터 한 곳을 Lv.2로 강화하세요.',
    '데이터센터에서 스마트 전력망 연구를 완료하세요.',
    '공사 중인 데이터센터는 강화 완료 조건에 포함되지 않습니다.',
    '완료하면 반대편 외곽 9칸과 그 지역의 재생에너지가 함께 열립니다.',
  ]),
  quest('wind-pilot-grid', '풍력 실증망', '풍력 예측 제어를 연구하고 풍력 전력을 2일 연속 공급하세요.', 12, null, 'days', [
    '풍력발전을 건설한 뒤 풍력 예측 제어 연구를 완료하세요.',
    '풍력발전에서 소비시설로 실제 전력이 전달되어야 합니다.',
    '두 조건을 같은 날 2일 연속 유지하세요.',
  ], { unlockResearch: ['tidal1'] }),
  quest('tidal-coast-pilot', '해안 조력 실증', '조력 연구와 발전소를 완성하고 조력 전력을 2일 연속 공급하세요.', 15, null, 'days', [
    '조력 발전 실증 연구를 완료하면 조력발전이 해금됩니다.',
    '활성화된 외곽 대지에 조력발전을 완공하세요.',
    '조력발전에서 소비시설로 실제 전력이 전달되는 날을 2일 연속 만드세요.',
  ], { upgradePermitFacilities: ['thermal', 'nuclear', 'wind'] }),
  ...CLIMATE_QUEST_ORDER.map((index) => campaignQuest(CLIMATE_QUESTS[index])),
  quest('national-climate-test', '대한민국 복합기후 시험', `${stressTestTotalDays()}일 복합 기후 스트레스 테스트를 통과하세요.`, 0, null, 'stress', [
    '8개 구간을 연속 운용하며 전력·경제·탄소·물 기준을 모두 지키세요.',
    '조력발전이 실제 전력을 공급해야 최종시험을 통과할 수 있습니다.',
    '녹지와 주거지 Lv.3는 필수 조건이 아닙니다.',
  ]),
];

export const QUESTS = Object.freeze(RAW_QUESTS.map((definition, index) => Object.freeze({
  ...definition,
  index: index + 1,
})));

export const QUEST_COUNT = QUESTS.length;

const WEST_BRANCH_QUESTS = Object.freeze({
  7: Object.freeze({
    ...QUESTS[6],
    title: '풍력 연구 기초',
    goal: '풍력 예측 제어 연구를 완료하세요.',
    details: Object.freeze([
      '서부 확장에서 해금된 풍력발전을 건설하세요.',
      '데이터센터에서 풍력 예측 제어 연구를 시작하세요.',
      '데이터센터 전력 공급률 90% 이상을 유지하면 연구가 진행됩니다.',
      '아직 맞히지 않은 전용 퀴즈로 남은 연구 시간을 줄일 수 있습니다.',
    ]),
  }),
  8: Object.freeze({
    ...QUESTS[7],
    reward: Object.freeze({
      ...QUESTS[7].reward,
      unlockFacility: 'solar',
      unlockFacilities: Object.freeze(['solar']),
    }),
  }),
  9: Object.freeze({
    ...QUESTS[8],
    title: '태양광 실증망',
    goal: '고효율 태양전지를 연구하고 태양광 전력을 2일 연속 공급하세요.',
    details: Object.freeze([
      '2차 동부 확장에서 해금된 태양광발전을 건설하세요.',
      '고효율 태양전지 연구를 완료하세요.',
      '태양광발전에서 소비시설로 실제 전력이 전달되는 날을 2일 연속 만드세요.',
    ]),
  }),
});

export function questForState(state, index = state?.questIndex) {
  const questIndex = Math.trunc(Number(index));
  if (state?.expansion?.firstChoice === 'west' && WEST_BRANCH_QUESTS[questIndex]) {
    return WEST_BRANCH_QUESTS[questIndex];
  }
  return QUESTS[questIndex - 1] || null;
}
