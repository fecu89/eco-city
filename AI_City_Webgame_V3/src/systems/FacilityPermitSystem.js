import { FACILITIES, FACILITY_LIMITS_BY_QUEST } from '../core/Constants.js';
import { validateWorkforceTransition } from './WorkforceSystem.js';

const LAST_QUEST = 15;

function countType(grid, type) {
  return (grid || []).reduce((count, cell) => count + Number(cell?.type === type), 0);
}

export function getFacilityLimits(questIndex = 1) {
  const throughQuest = Math.max(1, Math.min(LAST_QUEST, Math.trunc(Number(questIndex) || 1)));
  const limits = {};
  for (let quest = 1; quest <= throughQuest; quest += 1) {
    Object.assign(limits, FACILITY_LIMITS_BY_QUEST[quest] || {});
  }
  return limits;
}

function findNextIncreaseQuest(questIndex, type, currentLimit) {
  for (let quest = Math.max(1, questIndex + 1); quest <= LAST_QUEST; quest += 1) {
    const nextLimit = FACILITY_LIMITS_BY_QUEST[quest]?.[type];
    if (Number.isFinite(nextLimit) && nextLimit > currentLimit) return quest;
  }
  return null;
}

function facilityPermitMessage({ ok, type, current, planned, limit, nextIncreaseQuest }) {
  if (ok) return `${FACILITIES[type]?.name || type} 건설 허가 ${current + planned}/${limit}`;
  const next = nextIncreaseQuest
    ? `퀘스트 ${nextIncreaseQuest} 완료 후 한도가 늘어납니다.`
    : '현재 캠페인의 최대 허가 수에 도달했습니다.';
  return `${FACILITIES[type]?.name || type} 허가 ${current + planned}/${limit}. ${next}`;
}

export function getFacilityPermitForCount(state, type, planned = 0) {
  const limits = getFacilityLimits(state?.questIndex);
  const current = countType(state?.grid, type);
  const safePlanned = Math.max(0, Math.trunc(Number(planned) || 0));
  const limit = limits[type] ?? 0;
  const projectedAfterPlacement = current + safePlanned + 1;
  const ok = projectedAfterPlacement <= limit;
  const nextIncreaseQuest = findNextIncreaseQuest(state?.questIndex || 1, type, limit);
  const result = {
    ok,
    current,
    planned: safePlanned,
    limit,
    projectedAfterPlacement,
    nextIncreaseQuest,
    reason: ok ? null : 'facility_limit',
  };
  return { ...result, message: facilityPermitMessage({ ...result, type }) };
}

export function getFacilityPermit(state, type, plan = []) {
  const planned = (plan || []).reduce((count, item) => count + Number(item?.type === type), 0);
  return getFacilityPermitForCount(state, type, planned);
}

export function validateGridFacilityDependencies(grid) {
  const nuclearCount = countType(grid, 'nuclear');
  const thermalCount = countType(grid, 'thermal');
  if (nuclearCount > 0 && thermalCount < 1) {
    return {
      ok: false,
      reason: 'thermal_reserve_required',
      message: '핵발전을 운영하려면 화력발전 예비력 1기를 함께 유지해야 합니다.',
    };
  }
  return { ok: true, reason: null, message: '필수 발전 예비력 조건을 충족했습니다.' };
}

export function validateDemolitionPermit(state, index) {
  const cell = state?.grid?.[index];
  if (!cell) return { ok: false, reason: 'empty', message: '철거할 시설이 없습니다.' };
  const nuclearCount = countType(state.grid, 'nuclear');
  const thermalCount = countType(state.grid, 'thermal');
  if (cell.type === 'thermal' && nuclearCount > 0 && thermalCount <= 1) {
    return {
      ok: false,
      reason: 'last_thermal_supports_nuclear',
      message: '핵발전이 남아 있어 마지막 화력발전 예비력은 철거할 수 없습니다. 핵발전을 먼저 철거하세요.',
      resolution: '핵발전소를 먼저 철거한 뒤 화력발전소를 철거하세요.',
    };
  }
  const projectedGrid = state.grid.map((item, cellIndex) => cellIndex === index ? null : item);
  const workforce = validateWorkforceTransition(state.grid, projectedGrid);
  if (!workforce.ok) {
    return {
      ok: false,
      reason: 'workforce_shortage_after_demolition',
      message: `철거하면 인력이 ${workforce.shortage}명 부족해져 주거지를 철거할 수 없습니다.`,
      resolution: '필요 인력이 적은 시설을 먼저 철거하거나 다른 주거지를 추가하세요.',
      ...workforce,
    };
  }
  return { ok: true, reason: null, message: '철거할 수 있습니다.' };
}
