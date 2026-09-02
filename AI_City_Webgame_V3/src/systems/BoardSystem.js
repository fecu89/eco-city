import {
  BOARD,
  DEMOLITION_REFUND_RATIO,
  FACILITIES,
  GRID_EXPANSION_SETTLE_MS,
  SCORING,
  STAGES,
  UPGRADE_COST_RATIOS,
} from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { roundCredits } from '../core/Money.js';
import { formatCredits } from '../core/Money.js';
import { QUESTS, questForState } from '../core/QuestDefinitions.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import {
  CAMPAIGN_QUEST_INDEXES,
  levelThreeUnlockQuestForFacility,
  upgradePermitLevelForFacility,
} from '../core/CampaignProgression.js';
import { getFacilityPermit, validateDemolitionPermit, validateGridFacilityDependencies } from './FacilityPermitSystem.js';
import { validateWorkforceTransition } from './WorkforceSystem.js';
import { calculateEnvironmentalOperations, facilityLevelStats } from './FacilityOperationSystem.js';
import { isBatteryHubForConsumer } from './PowerNetworkSystem.js';
import { buildCityModifierContext, effectiveFacilityStats, facilityModifierAt } from './CityModifierSystem.js';
import {
  createHexCoordinates,
  isOuterRing,
  neighborIndices as hexNeighborIndices,
} from './HexGridSystem.js';
import {
  activateExpansionSide,
  constructionCostForCell,
  energySiteBenefit,
  isExpansionCellActive,
} from './ZoneSystem.js';
import {
  createBuildProject,
  createUpgradeProject,
  finalGridAfterProjects,
  isOperationalCell,
  operationalGrid,
} from './ConstructionProjectSystem.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round1 = (v) => Math.round(v * 10) / 10;
const BATTERY_CONSUMER_TYPES = Object.freeze(['residential', 'factory', 'data', 'cooling']);

function researchJobForDataCenter(state, index) {
  return Object.values(state.research?.jobs || {}).find((job) => job.dataCenterIndex === index) || null;
}

function batteryHasConsumerNeighbor(grid, batteryIndex, coords) {
  return grid.some((cell, consumerIndex) => cell
    && isOperationalCell(cell)
    && BATTERY_CONSUMER_TYPES.includes(cell.type)
    && isBatteryHubForConsumer(batteryIndex, consumerIndex, coords));
}

export function cellStats(cell, modifier = null) {
  return modifier ? effectiveFacilityStats(cell, modifier) : facilityLevelStats(cell);
}

export function getBoardCoordinates(state = gameState) {
  return createHexCoordinates(state.boardRadius);
}

export function neighborIndices(index, coords = getBoardCoordinates()) {
  return hexNeighborIndices(index, coords);
}

export function hasNeighbor(grid, index, coords, types) {
  return neighborIndices(index, coords).some((i) => isOperationalCell(grid[i]) && types.includes(grid[i].type));
}

export function getCellSpatial(grid, index, coords = getBoardCoordinates()) {
  const cell = grid[index];
  if (!cell) return { positive: [], warnings: [] };
  const positive = [];
  const warnings = [];
  const t = cell.type;
  if (t === 'factory') (hasNeighbor(grid, index, coords, ['thermal', 'nuclear', 'solar', 'wind', 'tidal']) ? positive : warnings).push('발전소 인접');
  if (t === 'data') (hasNeighbor(grid, index, coords, ['cooling']) ? positive : warnings).push('순환냉각 인접');
  if (t === 'residential' && hasNeighbor(grid, index, coords, ['green'])) positive.push('녹지 생활권');
  if (['solar', 'wind'].includes(t)) {
    const connectedHub = neighborIndices(index, coords)
      .some((batteryIndex) => grid[batteryIndex]?.type === 'battery' && batteryHasConsumerNeighbor(grid, batteryIndex, coords));
    (connectedHub ? positive : warnings).push('소비지 저장 허브 연결');
  }
  if (t === 'battery' && batteryHasConsumerNeighbor(grid, index, coords)) positive.push('소비지 저장 허브');
  if (t === 'nuclear' && hasNeighbor(grid, index, coords, ['cooling'])) positive.push('냉각 보조');
  if (t === 'cooling' && hasNeighbor(grid, index, coords, ['data', 'nuclear'])) positive.push('냉각 수요 연결');
  if (['factory', 'thermal'].includes(t) && hasNeighbor(grid, index, coords, ['residential'])) warnings.push('주거지 오염 갈등');
  // 원전·데이터센터의 생활권 갈등과 오염 시설·녹지 충돌을 공간 비용으로 반영한다.
  if (t === 'nuclear' && hasNeighbor(grid, index, coords, ['residential'])) warnings.push('원전 인접 불안');
  if (t === 'data' && hasNeighbor(grid, index, coords, ['residential'])) warnings.push('소음·발열 민원');
  if (['thermal', 'factory'].includes(t) && hasNeighbor(grid, index, coords, ['green'])) warnings.push('녹지 훼손 갈등');
  // 반대쪽 시설(주거지/녹지)에서도 같은 갈등이 보이도록 대칭으로 표시한다 (점수 계산은 한쪽에서만 1회 적용).
  if (t === 'residential' && hasNeighbor(grid, index, coords, ['factory', 'thermal', 'nuclear', 'data'])) warnings.push('오염·불안 시설 인접');
  if (t === 'green' && hasNeighbor(grid, index, coords, ['thermal', 'factory'])) warnings.push('오염 시설 인접');
  return { positive, warnings };
}

// 3단계 대시보드/독(dock)에서 "이 시설을 놓으면 어디가 좋고 어디가 나쁜지" 미리보기에 쓰는 단순화된 관계표.
// getCellSpatial()의 라벨 있는 판정과 별개로, 빈 칸 하이라이트용 good/bad 판정만 담당한다.
export const PARTNER_RULES = {
  factory: { good: ['thermal', 'nuclear', 'solar', 'wind', 'tidal'], bad: ['residential'] },
  thermal: { good: ['factory'], bad: ['residential', 'green'] },
  nuclear: { good: ['cooling', 'factory'], bad: ['residential'] },
  data: { good: ['cooling'], bad: ['residential'] },
  residential: { good: ['green'], bad: ['factory', 'thermal', 'nuclear', 'data'] },
  solar: { good: ['battery'], bad: [] },
  wind: { good: ['battery'], bad: [] },
  battery: { good: BATTERY_CONSUMER_TYPES, bad: [] },
  cooling: { good: ['data', 'nuclear'], bad: [] },
  green: { good: ['residential'], bad: ['thermal', 'factory'] },
};

// 독에서 시설을 선택했을 때, 빈 칸 중 어디가 인접 보너스(good)/갈등(bad)을 받는지 계산한다.
export function placementPreview(facilityKey, grid, coords = getBoardCoordinates(), state = gameState) {
  const rule = PARTNER_RULES[facilityKey] || { good: [], bad: [] };
  const good = new Set();
  const bad = new Set();
  const siteBenefits = new Map();
  grid.forEach((cell, i) => {
    if (cell) return;
    const siteBenefit = energySiteBenefit(state, i, facilityKey);
    if (siteBenefit) {
      good.add(i);
      siteBenefits.set(i, siteBenefit);
    }
    const ns = neighborIndices(i, coords);
    const hasGood = ns.some((n) => {
      if (!grid[n] || !rule.good.includes(grid[n].type)) return false;
      if (['solar', 'wind'].includes(facilityKey) && grid[n].type === 'battery') {
        return batteryHasConsumerNeighbor(grid, n, coords);
      }
      return true;
    });
    if (hasGood) good.add(i);
    if (ns.some((n) => grid[n] && rule.bad.includes(grid[n].type))) bad.add(i);
  });
  return { good, bad, siteBenefits };
}

export function calcMetrics(grid, coords = getBoardCoordinates(), modifierContext = null) {
  grid = operationalGrid(grid);
  const previewOperations = Object.fromEntries(grid
    .map((cell, index) => cell ? [index, { powerRatio: 1, operationRatio: 1 }] : null)
    .filter(Boolean));
  const environment = calculateEnvironmentalOperations({
    grid,
    coords,
    facilityOperations: previewOperations,
    modifierContext,
  });
  let dev = 0, demand = 0, supply = 0, carbon = environment.dailyCarbon, water = environment.dailyWater, renewableSupply = 0, dataCount = 0, thermalCount = 0;
  let synergyScore = 0, synergyLinks = 0, conflictPairs = 0, heatCluster = 0;
  const linkedRenewables = new Set();
  const consumerHubBatteries = new Set();

  grid.forEach((cell, i) => {
    if (!cell) return;
    const s = cellStats(cell, facilityModifierAt(modifierContext, i));
    dev += s.dev; demand += s.demand; supply += s.supply;
    if (['solar', 'wind', 'tidal'].includes(cell.type)) renewableSupply += s.supply;
    if (cell.type === 'data') dataCount++;
    if (cell.type === 'thermal') thermalCount++;

    const ns = neighborIndices(i, coords);
    if (cell.type === 'factory') {
      if (ns.some((n) => grid[n] && ['thermal', 'nuclear', 'solar', 'wind', 'tidal'].includes(grid[n].type))) {
        const b = SCORING.SYNERGY.FACTORY_NEXT_TO_POWER_PER_LEVEL * cell.level;
        dev += b; synergyScore += b; synergyLinks++;
      }
    }
    if (cell.type === 'data') {
      if (ns.some((n) => grid[n]?.type === 'cooling')) {
        const b = SCORING.SYNERGY.DATA_NEXT_TO_COOLING_PER_LEVEL * cell.level;
        dev += b; synergyScore += b; synergyLinks++;
      }
      ns.forEach((n) => { if (grid[n]?.type === 'data' && n > i) heatCluster++; });
    }
    if (cell.type === 'residential' && ns.some((n) => grid[n]?.type === 'green')) {
      const b = SCORING.SYNERGY.RESIDENTIAL_NEXT_TO_GREEN_PER_LEVEL * cell.level;
      dev += b; synergyScore += b; synergyLinks++;
    }
    if (cell.type === 'battery' && batteryHasConsumerNeighbor(grid, i, coords)) {
      consumerHubBatteries.add(i); synergyLinks++; synergyScore += SCORING.SYNERGY.BATTERY_HUB_PER_LEVEL * cell.level;
    }
    if (cell.type === 'nuclear' && ns.some((n) => grid[n]?.type === 'cooling')) {
      synergyLinks++; synergyScore += SCORING.SYNERGY.NUCLEAR_NEXT_TO_COOLING;
    }
    if (['factory', 'thermal'].includes(cell.type)) {
      ns.forEach((n) => { if (grid[n]?.type === 'residential') { conflictPairs++; dev -= SCORING.CONFLICT_DEV_PENALTY.HEAVY_NEXT_TO_RESIDENTIAL; } });
    }
    // 원전 인접 주거지: 안전 불안이라는 사회적 갈등 — 발전점수 손실이 더 크다.
    if (cell.type === 'nuclear') {
      ns.forEach((n) => { if (grid[n]?.type === 'residential') { conflictPairs++; dev -= SCORING.CONFLICT_DEV_PENALTY.NUCLEAR_NEXT_TO_RESIDENTIAL; } });
    }
    // 데이터센터 인접 주거지: 소음·발열 민원.
    if (cell.type === 'data') {
      ns.forEach((n) => { if (grid[n]?.type === 'residential') { conflictPairs++; dev -= SCORING.CONFLICT_DEV_PENALTY.DATA_NEXT_TO_RESIDENTIAL; } });
    }
    // 오염 시설이 녹지를 훼손 — 탄소 부담이 늘어난 것처럼 취급.
    if (['thermal', 'factory'].includes(cell.type)) {
      ns.forEach((n) => { if (grid[n]?.type === 'green') conflictPairs++; });
    }
  });

  if (consumerHubBatteries.size) {
    grid.forEach((cell, index) => {
      if (['solar', 'wind'].includes(cell?.type)) linkedRenewables.add(index);
    });
  }

  let renewablePenalty = 0;
  grid.forEach((cell, i) => {
    if (!cell || !['solar', 'wind'].includes(cell.type)) return;
    const s = cellStats(cell);
    renewablePenalty += s.supply * (linkedRenewables.has(i)
      ? SCORING.RENEWABLE_PENALTY_RATIO.LINKED
      : SCORING.RENEWABLE_PENALTY_RATIO.UNLINKED);
  });
  const reliableSupply = Math.max(0, supply - renewablePenalty);
  const balance = reliableSupply - demand;
  const overload = Math.max(0, demand - reliableSupply);
  const sustainability = clamp(SCORING.SUSTAINABILITY.BASE
    - carbon * SCORING.SUSTAINABILITY.CARBON_WEIGHT
    - Math.max(0, water - SCORING.SUSTAINABILITY.FREE_WATER) * SCORING.SUSTAINABILITY.WATER_WEIGHT
    - overload * SCORING.SUSTAINABILITY.OVERLOAD_WEIGHT
    - conflictPairs * SCORING.SUSTAINABILITY.CONFLICT_WEIGHT, 0, 100);
  const reliability = clamp(SCORING.RELIABILITY.BASE
    + balance * SCORING.RELIABILITY.BALANCE_WEIGHT
    + linkedRenewables.size * SCORING.RELIABILITY.LINKED_RENEWABLE_WEIGHT
    - heatCluster * SCORING.RELIABILITY.HEAT_CLUSTER_WEIGHT, 0, 100);

  return {
    dev: Math.round(dev), demand: round1(demand), supply: round1(supply), reliableSupply: round1(reliableSupply), balance: round1(balance),
    carbon: Math.max(0, round1(carbon)), water: Math.max(0, round1(water)), heatCluster, renewableSupply: round1(renewableSupply),
    dataCount, thermalCount, synergyScore: Math.round(synergyScore), synergyLinks, conflictPairs,
    sustainability: Math.round(sustainability), reliability: Math.round(reliability),
  };
}

export function stageLevelCap(facilityType = null) {
  return facilityType
    ? upgradePermitLevelForFacility(gameState, facilityType)
    : gameState.upgradePermitLevel;
}

const upgradeCostRatio = (fromLevel) => (
  fromLevel === 1 ? UPGRADE_COST_RATIOS.FROM_LEVEL_1 : UPGRADE_COST_RATIOS.FROM_LEVEL_2_PLUS
);

export function upgradeCost(cell) {
  const f = FACILITIES[cell.type];
  return Math.ceil(f.cost * upgradeCostRatio(cell.level));
}

export function investedCost(cell) {
  let sum = FACILITIES[cell.type].cost;
  for (let l = 1; l < cell.level; l++) sum += Math.ceil(FACILITIES[cell.type].cost * upgradeCostRatio(l));
  return sum;
}

export function demolitionRefund(cell) {
  return Math.floor(investedCost(cell) * DEMOLITION_REFUND_RATIO);
}

export function refreshMetrics() {
  const coords = getBoardCoordinates(gameState);
  const modifierContext = buildCityModifierContext(gameState, { coords });
  gameState.metrics = calcMetrics(gameState.grid, coords, modifierContext);
  return gameState.metrics;
}

export function selectFacility(key) {
  if (!FACILITIES[key]) return;
  gameState.selectedFacility = key;
  eventBus.emit(Events.BOARD_FACILITY_SELECTED, { key });
}

const PLACEMENT_MESSAGES = Object.freeze({
  not_editable: '현재 퀘스트에서는 도시를 편집할 수 없습니다.',
  invalid_cell: '유효하지 않은 대지입니다.',
  inactive_expansion: '아직 개방하지 않은 확장 대지입니다.',
  occupied: '이미 시설이 있는 대지입니다.',
  locked_quest: '퀘스트 보상으로 먼저 해금해야 합니다.',
  locked_research: '연구를 완료해야 해금됩니다.',
  outer_ring_only: '조력발전은 현재 도시의 최외곽 육각에만 건설할 수 있습니다.',
  facility_limit: '현재 퀘스트의 시설 건설 허가 한도에 도달했습니다.',
  thermal_reserve_required: '핵발전을 건설하려면 화력발전 1기가 필요합니다. 폭염 경보 퀘스트 완료 후에는 배터리로 대체할 수 있습니다.',
  insufficient_credits: '건설 크레딧이 부족합니다.',
});

export function validatePlacement(state, facilityKey, index, {
  grid = state.grid,
  availableCredits = state.credits,
  plan = [],
  skipPermit = false,
  requireNuclearReserve = true,
} = {}) {
  const facility = FACILITIES[facilityKey];
  const coords = getBoardCoordinates(state);
  let reason = null;
  let permit = null;
  if (!state.isEditable) reason = 'not_editable';
  else if (!Number.isInteger(index) || !coords[index]) reason = 'invalid_cell';
  else if (!isExpansionCellActive(state, index)) reason = 'inactive_expansion';
  else if (grid[index]) reason = 'occupied';
  else if (!facility) reason = 'locked_quest';
  else if (facilityKey === 'tidal' && (!state.unlockedFacilities.has('tidal') || (state.research?.techLevels?.tidal || 0) < 1)) reason = 'locked_research';
  else if (!state.unlockedFacilities.has(facilityKey)) reason = 'locked_quest';
  else if (facility.placement === 'outer_ring' && !isOuterRing(index, coords, state.boardRadius)) reason = 'outer_ring_only';
  else if (!skipPermit && !(permit = getFacilityPermit(state, facilityKey, plan)).ok) reason = permit.reason;
  else {
    if (requireNuclearReserve && facilityKey === 'nuclear') {
      const projectedGrid = grid.map((cell) => cell ? { ...cell } : null);
      projectedGrid[index] = { type: facilityKey, level: 1 };
      plan.forEach((item) => {
        if (Number.isInteger(item?.index) && FACILITIES[item.type]) {
          projectedGrid[item.index] = { type: item.type, level: 1 };
        }
      });
      if (!validateGridFacilityDependencies(projectedGrid, state).ok) reason = 'thermal_reserve_required';
    }
    const buildCost = constructionCostForCell(state, index, facilityKey);
    if (!reason && availableCredits < buildCost) reason = 'insufficient_credits';
  }
  const buildCost = facility ? constructionCostForCell(state, index, facilityKey) : 0;
  return {
    ok: !reason,
    reason,
    facility,
    permit,
    buildCost,
    missingCredits: facility ? Math.max(0, Math.round((buildCost - availableCredits) * 10) / 10) : 0,
    message: reason === 'facility_limit' ? permit.message : reason ? PLACEMENT_MESSAGES[reason] : '건설할 수 있습니다.',
  };
}

export function validateUpgrade(state, index) {
  const cell = state.grid[index];
  if (!state.isEditable) return { ok: false, reason: 'not_editable' };
  if (!cell) return { ok: false, reason: 'invalid_cell' };
  if (cell.project) return { ok: false, reason: 'project_in_progress', facility: FACILITIES[cell.type] };
  const facility = FACILITIES[cell.type];
  if (cell.type === 'data' && researchJobForDataCenter(state, index)) {
    return { ok: false, reason: 'research_in_progress', facility };
  }
  if (cell.level >= facility.maxLevel) return { ok: false, reason: 'max_level', facility };
  const nextLevel = cell.level + 1;
  if (nextLevel > upgradePermitLevelForFacility(state, cell.type)) {
    return {
      ok: false,
      reason: 'city_permit_required',
      requiredLevel: nextLevel,
      unlockQuestIndex: nextLevel >= 3
        ? levelThreeUnlockQuestForFacility(cell.type)
        : CAMPAIGN_QUEST_INDEXES.PREPARATION_START,
      facility,
    };
  }
  if (['solar', 'wind', 'battery', 'green'].includes(cell.type)
    && nextLevel > (state.research?.techLevels?.[cell.type] || 0)) {
    return { ok: false, reason: 'technology_required', requiredLevel: nextLevel, facility };
  }
  const cost = upgradeCost(cell);
  if (state.credits < cost) return { ok: false, reason: 'insufficient_credits', cost, missingCredits: cost - state.credits, facility };
  const finalCurrentGrid = finalGridAfterProjects(state.grid);
  const projectedGrid = finalCurrentGrid.map((item, cellIndex) => cellIndex === index
    ? { ...item, level: nextLevel }
    : item);
  const workforce = validateWorkforceTransition(finalCurrentGrid, projectedGrid);
  if (!workforce.ok) {
    return { ok: false, reason: 'insufficient_workforce', cost, nextLevel, facility, ...workforce };
  }
  return { ok: true, reason: null, cost, nextLevel, facility };
}

export function upgradeRequirementMessage(state, validation) {
  if (validation.ok) return '강화할 수 있습니다.';
  if (validation.reason === 'city_permit_required') {
    const questIndex = validation.requiredLevel === 2
      ? CAMPAIGN_QUEST_INDEXES.PREPARATION_START
      : validation.unlockQuestIndex;
    // 서부 분기는 7~9단계 제목이 다르다. 분기에 맞는 퀘스트를 보여준다.
    const quest = questForState(state, questIndex);
    return `퀘스트 ${questIndex} ‘${quest.title}’를 완료하면 Lv.${validation.requiredLevel} 강화 허가가 열립니다.`;
  }
  if (validation.reason === 'technology_required') {
    const cell = state.grid.find((item) => item?.type === validation.facility && item) || null;
    const type = cell?.type || Object.entries(FACILITIES).find(([, facility]) => facility === validation.facility)?.[0];
    const researchId = validation.requiredLevel >= 3 ? {
      solar: 'solar3', wind: 'wind3', battery: 'battery3', green: 'green3',
    }[type] : {
      solar: 'solar2', wind: 'wind2', battery: 'battery2', green: 'green2',
    }[type];
    const name = RESEARCH[researchId]?.name || '해당 기술';
    return `${name} 연구를 완료해야 ${validation.facility.name} Lv.${validation.requiredLevel} 강화가 가능합니다.`;
  }
  if (validation.reason === 'insufficient_credits') {
    return `강화 크레딧 ${formatCredits(validation.missingCredits)}가 더 필요합니다.`;
  }
  if (validation.reason === 'insufficient_workforce') {
    return `강화 후 인력이 ${validation.shortage}명 부족합니다. 주거지를 먼저 건설하거나 강화하세요.`;
  }
  if (validation.reason === 'research_in_progress') {
    return '이 데이터센터의 연구를 완료하거나 취소한 뒤 강화할 수 있습니다.';
  }
  if (validation.reason === 'max_level') return '이미 최대 레벨입니다.';
  if (validation.reason === 'project_in_progress') return '현재 공사가 끝난 뒤 다시 시도하세요.';
  if (validation.reason === 'not_editable') return '현재 퀘스트에서는 시설을 강화할 수 없습니다.';
  return '이 시설을 지금 강화할 수 없습니다.';
}

export function facilityUnlockMessage(state, facilityKey) {
  if (facilityKey === 'tidal' && (state.research?.techLevels?.tidal || 0) < 1) {
    return `${RESEARCH.tidal1.name} 연구를 완료하면 해금됩니다.`;
  }
  const quest = QUESTS
    .map((item) => questForState(state, item.index))
    .find((item) => item.reward.unlockFacilities.includes(facilityKey));
  if (quest && !state.unlockedFacilities.has(facilityKey)) {
    return `퀘스트 ${quest.index} ‘${quest.title}’ 완료 보상으로 해금됩니다.`;
  }
  if (!state.isEditable) return '현재 퀘스트에서는 건설할 수 없습니다.';
  return '건설할 수 있습니다.';
}

export function placeFacility(index) {
  const key = gameState.selectedFacility;
  const validation = validatePlacement(gameState, key, index);
  if (!validation.ok) return validation;
  const f = validation.facility;

  gameState.grid[index] = {
    type: key,
    level: 1,
    operationMode: 'normal',
    ...(key === 'battery' ? { batteryPolicy: 'auto' } : {}),
    project: createBuildProject({ type: key, paidCost: validation.buildCost }),
  };
  gameState.credits = roundCredits(gameState.credits - validation.buildCost);
  gameState.turn++;
  const metrics = refreshMetrics();
  const placedCount = gameState.grid.filter(Boolean).length;
  return { ok: true, index, type: f.name, key, metrics, placedCount };
}

export function upgradeCell(index) {
  const validation = validateUpgrade(gameState, index);
  if (!validation.ok) return validation;
  const cell = gameState.grid[index];
  const f = validation.facility;
  const cost = validation.cost;

  gameState.credits = roundCredits(gameState.credits - cost);
  cell.project = createUpgradeProject({ cell, paidCost: cost });
  gameState.turn++;
  const metrics = refreshMetrics();
  return {
    ok: true,
    index,
    type: f.name,
    level: cell.level,
    targetLevel: cell.project.toLevel,
    durationDays: cell.project.durationDays,
    cost,
    metrics,
  };
}

export const startUpgrade = upgradeCell;

export function demolishCell(index) {
  const cell = gameState.grid[index];
  if (!cell) return { ok: false, reason: 'empty' };
  if (!gameState.isEditable) return { ok: false, reason: 'not_editable' };
  if (cell.project) return { ok: false, reason: 'project_in_progress' };
  const permit = validateDemolitionPermit(gameState, index);
  if (!permit.ok) return permit;
  const refund = demolitionRefund(cell);
  const name = FACILITIES[cell.type].name;
  gameState.grid[index] = null;
  gameState.credits = roundCredits(gameState.credits + refund);
  gameState.turn++;
  const metrics = refreshMetrics();
  return { ok: true, index, name, refund, previous: { ...cell }, metrics };
}

export function expandBoard(state = gameState, side = null) {
  if (!side) return { ok: false, reason: 'expansion_choice_required', requiresChoice: true };
  const oldRadius = state.boardRadius;
  const activation = activateExpansionSide(state, side);
  if (!activation.ok) return activation;
  if (state === gameState) refreshMetrics();
  return { ...activation, oldRadius, newRadius: state.boardRadius, metrics: state.metrics };
}

export function expandGrid(side = null) {
  if (!side) {
    eventBus.emit(Events.EXPANSION_CHOICE_REQUESTED, {});
    return { ok: false, reason: 'expansion_choice_required', requiresChoice: true };
  }
  const result = expandBoard(gameState, side);
  if (!result.ok) return result;
  eventBus.emit(Events.BOARD_EXPANDED, result);
  setTimeout(() => {
    gameState.expandedCells.clear();
    eventBus.emit(Events.BOARD_EXPANDED, { ...result, metrics: gameState.metrics, settled: true });
  }, GRID_EXPANSION_SETTLE_MS);
  return result;
}
