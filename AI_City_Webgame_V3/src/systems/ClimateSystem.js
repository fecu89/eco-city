const WIND_PROFILE = [0.6, 0.9, 1.1, 0.75];

const normalizeHour = (hour) => ((Number(hour) % 24) + 24) % 24;

function mixHex(from, to, amount) {
  const t = Math.max(0, Math.min(1, amount));
  const channel = (shift) => Math.round(((from >> shift) & 0xff) + (((to >> shift) & 0xff) - ((from >> shift) & 0xff)) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

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
  if (h >= 6 && h < 8) return 'dawn';
  if (h >= 8 && h <= 16) return 'day';
  if (h > 16 && h <= 18) return 'dusk';
  return 'night';
}

export function getSkyState(hour) {
  const h = normalizeHour(hour);
  const dayTop = 0x5aaee8;
  const dayBottom = 0xcbeaff;
  if (h >= 6 && h < 8) {
    const progress = (h - 6) / 2;
    return {
      hour: h,
      phase: 'dawn',
      topColor: mixHex(0x596b99, dayTop, progress),
      bottomColor: mixHex(0xf28b67, dayBottom, progress),
      illumination: 0.88 + progress * 0.12,
    };
  }
  if (h >= 8 && h <= 16) {
    const progress = (h - 8) / 8;
    return {
      hour: h,
      phase: 'day',
      topColor: dayTop,
      bottomColor: dayBottom,
      illumination: 1,
    };
  }
  if (h > 16 && h <= 18) {
    const progress = (h - 16) / 2;
    return {
      hour: h,
      phase: 'dusk',
      topColor: mixHex(dayTop, 0x69749d, progress),
      bottomColor: mixHex(dayBottom, 0xf08b67, progress),
      illumination: 1 - progress * 0.12,
    };
  }
  return {
    hour: h,
    phase: 'night',
    topColor: 0x102548,
    bottomColor: 0x294b70,
    illumination: 0.7,
  };
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
