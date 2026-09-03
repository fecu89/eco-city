import { RESEARCH_RULES } from './Constants.js';
import { settingsRow } from './Settings.js';

// 기간·비용·선행조건·효과(outcome)·해금 퀘스트는 settings.json RESEARCH 표에서 id로 읽는다.
// 이름·아이콘·분기(branch)는 화면용 문구/분류라 여기에 남긴다. realMinutesAt1x는 RESEARCH_RULES에서 파생한다.
function research(id, name, icon, branch) {
  const numbers = settingsRow('RESEARCH', id);
  return Object.freeze({
    id,
    name,
    icon,
    durationDays: numbers.durationDays,
    realMinutesAt1x: numbers.durationDays / RESEARCH_RULES.GAME_DAYS_PER_REAL_MINUTE,
    cost: numbers.cost,
    prerequisites: numbers.prerequisites,
    outcome: numbers.outcome,
    branch,
    unlockAfterQuestId: numbers.unlockAfterQuestId ?? null,
  });
}

export const RESEARCH = Object.freeze({
  solar2: research('solar2', '고효율 태양전지', 'sun', 'generation'),
  wind2: research('wind2', '풍력 예측 제어', 'wind', 'generation'),
  battery2: research('battery2', '차세대 저장 화학', 'battery-charging', 'storage'),
  smartGrid: research('smartGrid', '스마트 전력망', 'network', 'grid'),
  tidal1: research('tidal1', '조력 발전 실증', 'waves', 'generation'),
  green2: research('green2', '도시 수관 네트워크', 'trees', 'environment'),
  green3: research('green3', '기후회복 생태축', 'leaf', 'environment'),
  solar3: research('solar3', '태양광 자동 추적', 'orbit', 'generation'),
  wind3: research('wind3', '풍력 자율 제어', 'fan', 'generation'),
  battery3: research('battery3', '비상 저장망', 'shield-check', 'storage'),
});

export const LEGACY_RESEARCH_IDS = Object.freeze(['renewable3']);

// 시설 종류·기술 레벨 → 그 레벨을 주는 연구 id({ solar: { 2: 'solar2', 3: 'solar3' }, … }).
// RESEARCH 표의 outcome.tech에서 파생한다 — 별도 표로 두면 연구를 추가할 때 어긋난다.
export const TECH_RESEARCH_BY_FACILITY = Object.freeze(Object.fromEntries(
  Object.entries(Object.values(RESEARCH).reduce((table, item) => {
    const [type, level] = item.outcome?.tech || [];
    if (type) (table[type] ||= {})[level] = item.id;
    return table;
  }, {})).map(([type, levels]) => [type, Object.freeze(levels)]),
));
