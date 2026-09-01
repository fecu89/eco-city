const MULTIPLICATIVE_FIELDS = Object.freeze([
  'supply', 'demand', 'income', 'upkeep', 'carbon', 'water',
  'researchSpeed', 'workforce', 'negative', 'effectiveness',
]);

const round = (value) => Math.round(value * 1e8) / 1e8;

function composeFacilityModifiers(modifiers) {
  const result = {};
  modifiers.filter(Boolean).forEach((modifier) => {
    Object.entries(modifier).forEach(([field, rawValue]) => {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return;
      result[field] = MULTIPLICATIVE_FIELDS.includes(field)
        ? round((result[field] ?? 1) * value)
        : round((result[field] ?? 0) + value);
    });
  });
  return Object.freeze(result);
}

export function facilityModifierForClimate(definition, facilityType, level = 1) {
  if (!definition) return Object.freeze({});
  const base = definition.facilityModifiers?.[facilityType] || null;
  if (facilityType !== 'green' || !definition.greenAbsorptionByLevel) {
    return base ? Object.freeze({ ...base }) : Object.freeze({});
  }
  const safeLevel = Math.max(1, Math.min(3, Math.trunc(Number(level) || 1)));
  return composeFacilityModifiers([
    base,
    { negative: definition.greenAbsorptionByLevel[safeLevel] ?? 1 },
  ]);
}

export function cityModifierForClimate(definition, { baselineWater = 10 } = {}) {
  const city = definition?.cityModifiers || {};
  const waterLimitRatio = Number.isFinite(Number(city.waterLimitRatio))
    ? Number(city.waterLimitRatio)
    : 1;
  const coolingEffectiveness = Number(
    city.coolingEffectiveness
      ?? definition?.facilityModifiers?.cooling?.effectiveness
      ?? 1,
  );
  return Object.freeze({
    ...city,
    waterLimitRatio,
    waterLimit: waterLimitRatio < 1 ? round(Math.max(0, Number(baselineWater) || 0) * waterLimitRatio) : null,
    coolingEffectiveness: Number.isFinite(coolingEffectiveness) ? coolingEffectiveness : 1,
    carbonFlat: Number(city.carbonFlat) || 0,
  });
}

export function composeClimateDefinitions(definitions = []) {
  const active = definitions.filter(Boolean);
  const facilityTypes = new Set(active.flatMap((definition) => Object.keys(definition.facilityModifiers || {})));
  const facilityModifiers = {};
  facilityTypes.forEach((facilityType) => {
    facilityModifiers[facilityType] = composeFacilityModifiers(
      active.map((definition) => definition.facilityModifiers?.[facilityType]),
    );
  });
  const cityModifiers = active.reduce((composed, definition) => {
    const city = definition.cityModifiers || {};
    if (Number.isFinite(Number(city.waterLimitRatio))) {
      composed.waterLimitRatio = round((composed.waterLimitRatio ?? 1) * Number(city.waterLimitRatio));
    }
    if (Number.isFinite(Number(city.coolingEffectiveness))) {
      composed.coolingEffectiveness = round((composed.coolingEffectiveness ?? 1) * Number(city.coolingEffectiveness));
    }
    if (Number.isFinite(Number(city.carbonFlat))) {
      composed.carbonFlat = round((composed.carbonFlat ?? 0) + Number(city.carbonFlat));
    }
    return composed;
  }, {});
  const greenAbsorptionByLevel = active.some(({ greenAbsorptionByLevel: values }) => values)
    ? Object.freeze([0, 1, 2, 3].map((level) => level === 0 ? 1 : round(active.reduce((ratio, definition) => (
      ratio * (definition.greenAbsorptionByLevel?.[level] ?? 1)
    ), 1))))
    : null;
  return Object.freeze({
    id: active.map(({ id }) => id).join('+') || 'normal',
    label: active.map(({ label }) => label).join(' + ') || '평상시',
    durationDays: Math.max(0, ...active.map(({ durationDays }) => Number(durationDays) || 0)),
    facilityModifiers: Object.freeze(facilityModifiers),
    cityModifiers: Object.freeze(cityModifiers),
    greenAbsorptionByLevel,
  });
}
