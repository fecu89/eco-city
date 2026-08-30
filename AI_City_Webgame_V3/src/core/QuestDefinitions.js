const RAW_QUESTS = [
  ['first-citizens', '2040, 첫 시민', '주거지 2개를 건설하세요.', 4, 'thermal', 'count'],
  ['power-on', '도시의 불을 켜라', '모든 주거지의 전력 공급률을 90% 이상으로 2시간 유지하세요.', 5, 'factory', 'hours'],
  ['jobs-and-tax', '일자리와 세금', '발전소에 인접한 공장을 흑자로 2시간 가동하세요.', 6, 'data', 'hours'],
  ['research-seed', '연구도시의 씨앗', '데이터센터 전력 공급률을 90% 이상으로 2시간 유지하세요.', 8, 'nuclear', 'hours'],
  ['growth-cost', '탄소 경계선', '핵발전을 가동해 CO₂ 8 이하와 흑자를 2시간 유지하세요.', 8, 'cooling', 'hours'],
  ['risk-map', '위험 지도', '기존 도시의 탄소·냉각·송전 위험 지점 3곳을 찾으세요.', 14, 'solar', 'diagnosis'],
  ['cooling-loop', '냉각 회로', '데이터센터와 순환냉각을 연결해 2시간 가동하세요.', 6, 'battery', 'hours'],
  ['solar-efficiency', '태양의 효율', '재생에너지 퀴즈와 태양광 연구를 끝내고 태양광을 Lv.2로 강화하세요.', 8, 'wind', 'research', 'clean-power'],
  ['storage-hub', '7칸 저장 허브', '저장 허브를 거쳐 저탄소 전력 8E를 누적 전송하세요.', 8, 'green', 'energy'],
  ['wind-forecast', '바람을 예측하다', '풍력 예측 연구를 끝내고 풍력을 Lv.2로 강화하세요.', 10, null, 'research'],
  ['living-neighborhood', '숨 쉬는 생활권', '주거지와 녹지를 연결하고 3시간 흑자를 유지하세요.', 10, null, 'hours'],
  ['extreme-heat', '극한 폭염', '폭염 중 필수시설 전력 공급률 90% 이상을 3시간 유지하세요.', 10, null, 'hours'],
  ['night-grid', '긴 밤의 전력망', '야간 저장량 5E 이상과 안정 공급을 3시간 유지하세요.', 12, null, 'hours'],
  ['low-carbon-water', '저탄소 물순환 도시', '저탄소 70%, 기준보다 낮은 물 사용과 흑자를 4시간 유지하세요.', 14, null, 'hours'],
  ['climate-council', '기후시민위원회', '최종 운영 판단 퀴즈를 통과하세요.', 0, null, 'quiz', 'climate-council'],
];

export const QUESTS = Object.freeze(RAW_QUESTS.map(([
  id, title, goal, credits, unlockFacility, progressKind, quizKind,
], index) => Object.freeze({
  index: index + 1,
  id,
  title,
  goal,
  progressKind,
  quizKind: quizKind || null,
  reward: Object.freeze({ credits, unlockFacility }),
})));

export const QUEST_COUNT = QUESTS.length;
