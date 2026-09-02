import { formatCompactNumber } from '../core/Money.js';

export { exactNumberLabel, formatCompactNumber, formatCredits } from '../core/Money.js';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

// 크레딧이 아닌 도시 지표(전력·CO₂·물)를 한 줄에 넣을 때 쓰는 표기.
// 1,000 이상은 K/M으로 줄이고, 그 아래는 소수 한 자리까지만 보여준다.
export function compactMetric(value) {
  const numeric = Number(value) || 0;
  return Math.abs(numeric) >= 1_000 ? formatCompactNumber(numeric) : String(round1(numeric));
}
