import { settingsRow } from './Settings.js';

// 배터리 저장 전력 사용 정책. 플레이어가 시설에서 직접 조정하는 레버는
// 전력 우선순위와 이 배터리 정책이고, 나머지는 연구 · 강화 · 배치로 움직인다.
// 예비율(reserveRatio)과 필수시설 전용 여부는 settings.json OPERATION_PROFILES.BATTERY_POLICIES에서 읽고,
// 화면 라벨과 정책 순서는 여기서 정한다.
const BATTERY_POLICY_LABELS = Object.freeze({
  auto: '자동',
  reserve30: '최소 30%',
  reserve50: '최소 50%',
  essential: '필수시설 전용',
});

export const BATTERY_POLICIES = Object.freeze(Object.fromEntries(Object.entries(BATTERY_POLICY_LABELS).map(([id, label]) => {
  const numbers = settingsRow('OPERATION_PROFILES.BATTERY_POLICIES', id);
  return [id, Object.freeze({
    id,
    label,
    reserveRatio: numbers.reserveRatio,
    essentialOnlyBelowReserve: numbers.essentialOnlyBelowReserve,
  })];
})));
