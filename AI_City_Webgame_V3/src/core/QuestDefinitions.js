function quest(id, title, goal, credits, unlockFacilities, progressKind, details, quizKind = null) {
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
    }),
  });
}

const RAW_QUESTS = [
  quest('first-citizens', '2040, 첫 시민', '주거지 2개를 건설하세요.', 4, ['factory', 'thermal'], 'count', [
    '주거지 2개를 완공하세요.',
    '보상으로 공장과 화력발전을 동시에 해금합니다.',
  ]),
  quest('power-on', '생산 기반을 함께 켜라', '공장과 화력발전을 서로 인접하게 배치하세요.', 5, ['green'], 'count', [
    '공장 1개와 화력발전 1개가 필요합니다.',
    '두 시설을 같은 건설 계획에 올린 뒤 한꺼번에 확정하면 운영비 손실을 피할 수 있습니다.',
    '두 시설은 육각형 한 칸 거리로 인접해야 합니다.',
    '완료하면 LEVEL 3부터 첫 녹지 1칸을 조성할 수 있습니다.',
  ]),
  quest('jobs-and-tax', '일자리와 세금', '발전소에 인접한 공장을 흑자로 2시간 가동하세요.', 6, 'data', 'hours', [
    '발전소와 인접한 공장의 전력 공급률이 50% 이상이어야 합니다.',
    '공장에서 실제 수입이 발생하는 상태를 2시간 연속 유지하세요.',
  ]),
  quest('research-seed', '연구도시의 씨앗', '데이터센터 전력 공급률을 90% 이상으로 2시간 유지하세요.', 8, 'nuclear', 'hours', [
    '데이터센터를 건설하세요.',
    '해당 데이터센터의 전력 공급률 90% 이상을 2시간 연속 유지하세요.',
  ]),
  quest('growth-cost', '탄소 전환선', '핵발전을 가동해 저탄소 전력 40% 이상, CO₂ 12 이하와 흑자를 2시간 유지하세요.', 8, 'cooling', 'hours', [
    '핵발전 1기와 화력 예비력 1기를 함께 유지하세요.',
    '저탄소 전력이 실제 공급 전력의 40% 이상이어야 합니다.',
    '시간당 CO₂ 12 이하와 순수익 0 초과를 2시간 연속 유지하세요.',
    'CO₂ 12는 전환 단계 목표이며 도시의 장기 안전 기준은 8입니다.',
  ]),
  quest('water-cycle', '도시 물순환', '데이터센터와 순환냉각을 연결하고 물 사용을 기준 이하로 2시간 유지하세요.', 14, 'solar', 'hours', [
    '데이터센터와 순환냉각을 서로 인접하게 배치하세요.',
    '두 시설의 전력 공급률을 각각 90% 이상으로 유지하세요.',
    '시간당 물 사용량이 기준 도시보다 높지 않은 상태를 2시간 유지하세요.',
  ]),
  quest('first-solar', '첫 태양광 전환', '태양광 전력을 공급해 저탄소 비율 30% 이상을 2시간 유지하세요.', 6, 'battery', 'hours', [
    '태양광이 소비 시설에 실제 전력을 보내야 합니다.',
    '저탄소 전력 비율 30% 이상을 2시간 연속 유지하세요.',
  ]),
  quest('solar-efficiency', '태양의 효율', '고효율 태양전지 연구를 끝내고 태양광을 Lv.2로 강화하세요.', 8, 'wind', 'research', [
    '데이터센터에서 고효율 태양전지 연구를 완료하세요.',
    '진행 중인 연구 카드의 에너지 퀴즈로 연구를 가속할 수 있습니다.',
    '태양광 시설 하나를 Lv.2로 강화하세요.',
  ]),
  quest('storage-hub', '7칸 저장 허브', '저장 허브를 거쳐 저탄소 전력 8E를 누적 전송하세요.', 8, null, 'energy', [
    '에너지저장 시설을 재생에너지와 소비 시설 사이에 배치하세요.',
    '저장 허브 경로로 전달된 저탄소 전력을 누적 8E 달성하세요.',
  ]),
  quest('wind-forecast', '바람을 예측하다', '풍력 예측 연구를 끝내고 풍력을 Lv.2로 강화하세요.', 10, null, 'research', [
    '풍력 예측 제어 연구를 완료하세요.',
    '풍력 시설 하나를 Lv.2로 강화하세요.',
  ]),
  quest('living-neighborhood', '숨 쉬는 생활권', '주거지와 녹지를 연결하고 3시간 흑자를 유지하세요.', 10, null, 'hours', [
    '주거지 하나 이상이 녹지와 인접해야 합니다.',
    '시간당 순수익 0 초과를 3시간 연속 유지하세요.',
  ]),
  quest('extreme-heat', '극한 폭염', '폭염 중 필수시설 전력 공급률 90% 이상을 3시간 유지하세요.', 10, null, 'hours', [
    '폭염 경보가 활성화된 동안 진행됩니다.',
    '주거지·순환냉각·필수 지정 시설의 전력 공급률을 모두 90% 이상으로 유지하세요.',
    '조건을 3시간 연속 유지하세요.',
  ]),
  quest('night-grid', '긴 밤의 전력망', '야간 저장량 5E 이상과 안정 공급을 3시간 유지하세요.', 12, null, 'hours', [
    '19시부터 23시 사이에만 시간이 누적됩니다.',
    '저장 전력 5E 이상과 수요 이상의 전력 공급을 3시간 유지하세요.',
  ]),
  quest('low-carbon-water', '저탄소 물순환 도시', '저탄소 70%, 기준보다 낮은 물 사용과 흑자를 4시간 유지하세요.', 14, null, 'hours', [
    '저탄소 전력 비율 70% 이상을 유지하세요.',
    '기준 도시보다 낮은 시간당 물 사용량과 흑자를 함께 달성하세요.',
    '모든 조건을 4시간 연속 유지하세요.',
  ]),
  quest('climate-council', '기후시민위원회', '최종 운영 판단 퀴즈를 통과하세요.', 0, null, 'quiz', [
    '기후·전력·물순환 운영 문제 4개에 답하세요.',
    '3개 이상 정답이면 최종 성적표가 열립니다.',
  ], 'climate-council'),
];

export const QUESTS = Object.freeze(RAW_QUESTS.map((definition, index) => Object.freeze({
  ...definition,
  index: index + 1,
})));

export const QUEST_COUNT = QUESTS.length;
