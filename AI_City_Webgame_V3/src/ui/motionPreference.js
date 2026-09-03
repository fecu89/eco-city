// 운영체제·브라우저의 "동작 줄이기" 설정. CSS는 @media (prefers-reduced-motion:reduce)로
// 처리하지만 JS 애니메이션(anime.js, chart.js)은 미디어 쿼리를 스스로 보지 않으므로
// 애니메이션을 시작하기 전에 이 함수로 물어본다.
export function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
