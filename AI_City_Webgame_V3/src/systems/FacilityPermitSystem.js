import {
  FACILITIES,
  FACILITY_LIMITS_BY_QUEST,
  GRID_RESERVE_RULES,
} from '../core/Constants.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';
import { validateWorkforceTransition } from './WorkforceSystem.js';

const LAST_QUEST = CAMPAIGN_QUEST_INDEXES.FINAL_TEST;

function countType(grid, type) {
  return (grid || []).reduce((count, cell) => count + Number(cell?.type === type), 0);
}

export function getFacilityLimits(questIndex = 1) {
  const throughQuest = Math.max(1, Math.min(LAST_QUEST, Math.trunc(Number(questIndex) || 1)));
  const limits = {};
  for (let quest = 1; quest <= throughQuest; quest += 1) {
    Object.entries(FACILITY_LIMITS_BY_QUEST[quest] || {}).forEach(([type, limit]) => {
      limits[type] = Math.max(limits[type] ?? 0, limit);
    });
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

function facilityLimitsForState(state) {
  return getFacilityLimits(state?.questIndex);
}

function facilityPermitMessage({ ok, type, current, planned, limit, nextIncreaseQuest }) {
  if (ok) return `${FACILITIES[type]?.name || type} 건설 허가 ${current + planned}/${limit}`;
  const next = nextIncreaseQuest
    ? `퀘스트 ${nextIncreaseQuest} 완료 후 한도가 늘어납니다.`
    : '현재 캠페인의 최대 허가 수에 도달했습니다.';
  return `${FACILITIES[type]?.name || type} 허가 ${current + planned}/${limit}. ${next}`;
}

export function getFacilityPermitForCount(state, type, planned = 0) {
  const limits = facilityLimitsForState(state);
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

function hasCompletedStorageHub(state) {
  return state?.claimedQuestIds?.has?.(GRID_RESERVE_RULES.BATTERY_SUBSTITUTE_QUEST_ID) === true;
}

export function validateGridFacilityDependencies(grid, state = null) {
  const nuclearCount = countType(grid, 'nuclear');
  const thermalCount = countType(grid, 'thermal');
  const batteryCount = countType(grid, 'battery');
  if (nuclearCount < 1) {
    return { ok: true, reason: null, reserveType: null, message: '핵발전 예비력 조건이 필요하지 않습니다.' };
  }
  if (thermalCount > 0) {
    return { ok: true, reason: null, reserveType: 'thermal', message: '화력발전이 핵발전 예비력을 제공합니다.' };
  }
  if (hasCompletedStorageHub(state) && batteryCount > 0) {
    return { ok: true, reason: null, reserveType: 'battery', message: '에너지저장 시설이 핵발전 예비력을 제공합니다.' };
  }
  return {
    ok: false,
    reason: 'thermal_reserve_required',
    reserveType: null,
    message: '핵발전을 운영하려면 화력발전 1기가 필요합니다. 폭염 경보 퀘스트 완료 후에는 에너지저장 시설로 대체할 수 있습니다.',
  };
}

export function validateDemolitionPermit(state, index) {
  const cell = state?.grid?.[index];
  if (!cell) return { ok: false, reason: 'empty', message: '철거할 시설이 없습니다.' };
  const nuclearCount = countType(state.grid, 'nuclear');
  if (nuclearCount > 0 && ['thermal', 'battery'].includes(cell.type)) {
    const projectedGrid = state.grid.map((item, cellIndex) => cellIndex === index ? null : item);
    const dependency = validateGridFacilityDependencies(projectedGrid, state);
    if (!dependency.ok) {
      const batteryReserve = cell.type === 'battery';
      return {
        ok: false,
        reason: batteryReserve ? 'last_battery_supports_nuclear' : 'last_thermal_supports_nuclear',
        message: batteryReserve
          ? '화력 없는 핵발전망의 마지막 에너지저장 시설은 철거할 수 없습니다.'
          : '핵발전이 남아 있어 마지막 화력발전 예비력은 철거할 수 없습니다. 폭염 경보 퀘스트 완료 후 배터리로 대체할 수 있습니다.',
        resolution: batteryReserve
          ? '화력발전 예비력을 다시 확보하거나 핵발전을 먼저 철거하세요.'
          : '폭염 경보를 완료하고 에너지저장 시설을 유지하거나 핵발전을 먼저 철거하세요.',
      };
    }
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
