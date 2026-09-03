// 배터리 저장 전력 사용 정책. 플레이어가 시설에서 직접 조정하는 레버는
// 전력 우선순위와 이 배터리 정책이고, 나머지는 연구 · 강화 · 배치로 움직인다.
export const BATTERY_POLICIES = Object.freeze({
  auto: Object.freeze({ id: 'auto', label: '자동', reserveRatio: 0, essentialOnlyBelowReserve: false }),
  reserve30: Object.freeze({ id: 'reserve30', label: '최소 30%', reserveRatio: 0.3, essentialOnlyBelowReserve: false }),
  reserve50: Object.freeze({ id: 'reserve50', label: '최소 50%', reserveRatio: 0.5, essentialOnlyBelowReserve: false }),
  essential: Object.freeze({ id: 'essential', label: '필수시설 전용', reserveRatio: 0.5, essentialOnlyBelowReserve: true }),
});
