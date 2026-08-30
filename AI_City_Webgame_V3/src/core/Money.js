import { DISPLAY_UNITS } from './Constants.js';

export function roundCredits(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) || Math.abs(rounded) < 0.005 ? 0 : rounded;
}

function normalizeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Object.is(numeric, -0) ? 0 : numeric;
}

function trimFraction(value, maximumFractionDigits = 2) {
  return normalizeNumber(value).toFixed(maximumFractionDigits).replace(/\.?0+$/, '');
}

export function formatCompactNumber(value, { fractionDigits = 2 } = {}) {
  const numeric = normalizeNumber(value);
  const magnitude = Math.abs(numeric);
  if (magnitude < 1_000) return numeric.toFixed(fractionDigits);
  if (magnitude >= 1_000_000) return `${trimFraction(numeric / 1_000_000)}M`;
  return `${trimFraction(numeric / 1_000)}K`;
}

export function exactNumberLabel(value, fractionDigits = 2) {
  const numeric = Math.abs(normalizeNumber(value)) < 0.5 * (10 ** -fractionDigits)
    ? 0
    : normalizeNumber(value);
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatCredits(value, { suffix = true, compact = false } = {}) {
  const rounded = roundCredits(value);
  const text = compact && Math.abs(rounded) >= 1_000
    ? formatCompactNumber(rounded)
    : rounded.toFixed(2);
  return suffix ? `${text} ${DISPLAY_UNITS.CREDIT}` : text;
}
