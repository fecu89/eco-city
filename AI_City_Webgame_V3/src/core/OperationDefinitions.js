const defineMode = (id, label, description, modifier = {}) => Object.freeze({
  id,
  label,
  description,
  modifier: Object.freeze({ ...modifier }),
});

export const OPERATION_MODES = Object.freeze({
  residential: Object.freeze({
    normal: defineMode('normal', '일반', '기본 주거 전력과 수입', {
      demand: 1,
      income: 1,
    }),
    request: defineMode('request', '절전 요청', '전력 -15% · 주거 수입 -5%', {
      demand: 0.85,
      income: 0.95,
    }),
    forced: defineMode('forced', '강제 절전', '전력 -30% · 주거 수입 -15%', {
      demand: 0.7,
      income: 0.85,
    }),
    auto: defineMode('auto', '자동 수요반응', '전력 여유에 따라 일반/강제 절전 전환'),
  }),
  factory: Object.freeze({
    eco: defineMode('eco', '절전', '전력 -35% · 수익 -30% · 탄소 -15%', {
      demand: 0.65,
      income: 0.7,
      carbon: 0.85,
      workforce: 1,
    }),
    normal: defineMode('normal', '표준', '기본 생산량으로 운영', {
      demand: 1,
      income: 1,
      carbon: 1,
      workforce: 1,
    }),
    boost: defineMode('boost', '증산', '전력 +40% · 수익 +35% · 탄소 +20% · 인력 +1', {
      demand: 1.4,
      income: 1.35,
      carbon: 1.2,
      workforce: 1,
      workforceFlat: 1,
    }),
    auto: defineMode('auto', '자동 생산', '전력 여유에 따라 절전/표준/증산 전환'),
  }),
  data: Object.freeze({
    eco: defineMode('eco', '절전', '전력 -50% · 연구 정지', {
      demand: 0.5,
      researchSpeed: 0,
      water: 1,
    }),
    normal: defineMode('normal', '표준', '기본 연구 속도로 운영', {
      demand: 1,
      researchSpeed: 1,
      water: 1,
    }),
    research: defineMode('research', '집중 연구', '전력 +50% · 연구 +40% · 물 +20%', {
      demand: 1.5,
      researchSpeed: 1.4,
      water: 1.2,
    }),
  }),
});

export function operationModeDefinition(type, mode = 'normal') {
  return OPERATION_MODES[type]?.[mode] || null;
}

export function availableOperationModes(cell, state = null) {
  const definitions = OPERATION_MODES[cell?.type];
  if (!definitions) return [];
  const level = Number(cell?.level) || 1;
  if (level < 2) return [definitions.normal];
  if (cell.type === 'residential') {
    if (!state?.research?.completedIds?.has?.('demandResponse')) return [definitions.normal];
    return level >= 3
      ? [definitions.normal, definitions.request, definitions.forced, definitions.auto]
      : [definitions.normal, definitions.request, definitions.forced];
  }
  if (cell.type === 'factory') {
    const modes = [definitions.eco, definitions.normal, definitions.boost];
    if (level >= 3 && state?.research?.completedIds?.has?.('demandResponse')) modes.push(definitions.auto);
    return modes;
  }
  return Object.values(definitions);
}

export function isOperationModeAvailable(cell, mode, state = null) {
  return availableOperationModes(cell, state).some((definition) => definition.id === mode);
}

export const BATTERY_POLICIES = Object.freeze({
  auto: Object.freeze({ id: 'auto', label: '자동', reserveRatio: 0, essentialOnlyBelowReserve: false }),
  reserve30: Object.freeze({ id: 'reserve30', label: '최소 30%', reserveRatio: 0.3, essentialOnlyBelowReserve: false }),
  reserve50: Object.freeze({ id: 'reserve50', label: '최소 50%', reserveRatio: 0.5, essentialOnlyBelowReserve: false }),
  essential: Object.freeze({ id: 'essential', label: '필수시설 전용', reserveRatio: 0.5, essentialOnlyBelowReserve: true }),
});
