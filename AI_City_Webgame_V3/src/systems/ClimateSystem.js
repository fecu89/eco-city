const WIND_PROFILE = [0.6, 0.9, 1.1, 0.75];

const normalizeHour = (hour) => ((Number(hour) % 24) + 24) % 24;

export function getSolarMultiplier(hour) {
  const h = normalizeHour(hour);
  if (h <= 5 || h >= 19) return 0;
  if (h <= 7 || h >= 17) return 0.5;
  return 1;
}

export function getDailySolarMultiplier() {
  return 11 / 24;
}

export function getWindMultiplier(tickIndex) {
  return WIND_PROFILE[((Math.trunc(tickIndex) % WIND_PROFILE.length) + WIND_PROFILE.length) % WIND_PROFILE.length];
}

export function getDemandMultiplier(type, { heatwave = false, adjacentGreen = false } = {}) {
  if (!heatwave || !['residential', 'data', 'cooling'].includes(type)) return 1;
  if (type === 'residential' && adjacentGreen) return 1.1;
  return 1.25;
}

export function getThreeDayForecast(dayIndex, tickIndex) {
  return [1, 2, 3].map((offset) => {
    const nextDayIndex = Math.max(0, Math.trunc(Number(dayIndex) || 0) + offset);
    return {
      dayIndex: nextDayIndex,
      solar: getDailySolarMultiplier(),
      wind: getWindMultiplier(tickIndex + offset),
    };
  });
}
