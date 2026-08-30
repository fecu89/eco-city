const WIND_PROFILE = [0.6, 0.9, 1.1, 0.75];

const normalizeHour = (hour) => ((Math.trunc(hour) % 24) + 24) % 24;

export function getSolarMultiplier(hour) {
  const h = normalizeHour(hour);
  if (h <= 5 || h >= 19) return 0;
  if (h <= 7 || h >= 17) return 0.5;
  return 1;
}

export function getWindMultiplier(tickIndex) {
  return WIND_PROFILE[((Math.trunc(tickIndex) % WIND_PROFILE.length) + WIND_PROFILE.length) % WIND_PROFILE.length];
}

export function getWorldPhase(hour) {
  const h = normalizeHour(hour);
  if (h >= 6 && h <= 8) return 'dawn';
  if (h >= 9 && h <= 17) return 'day';
  if (h >= 18 && h <= 20) return 'dusk';
  return 'night';
}

export function getDemandMultiplier(type, { heatwave = false, adjacentGreen = false } = {}) {
  if (!heatwave || !['residential', 'data', 'cooling'].includes(type)) return 1;
  if (type === 'residential' && adjacentGreen) return 1.1;
  return 1.25;
}

export function getThreeHourForecast(hour, tickIndex) {
  return [1, 2, 3].map((offset) => {
    const nextHour = normalizeHour(hour + offset);
    return { hour: nextHour, solar: getSolarMultiplier(nextHour), wind: getWindMultiplier(tickIndex + offset) };
  });
}
