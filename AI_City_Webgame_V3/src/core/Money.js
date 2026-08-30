import { DISPLAY_UNITS } from './Constants.js';

export function roundCredits(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) || Math.abs(rounded) < 0.005 ? 0 : rounded;
}

export function formatCredits(value, { suffix = true } = {}) {
  const text = roundCredits(value).toFixed(2);
  return suffix ? `${text} ${DISPLAY_UNITS.CREDIT}` : text;
}
