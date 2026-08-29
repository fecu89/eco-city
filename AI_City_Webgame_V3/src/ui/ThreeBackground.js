// 장식 배경은 CSS 레이어 하나로 충분하다. 별도 WebGL context와 RAF loop를 만들지 않는다.
export function initThreeBackground(element) {
  element?.classList.add('ready');
}
