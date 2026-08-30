import { FACILITIES, LEVEL_MULTIPLIERS, STAGES, GAME } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round1 = (v) => Math.round(v * 10) / 10;

export function cellStats(cell) {
  const f = FACILITIES[cell.type];
  const L = cell.level;
  const outMul = LEVEL_MULTIPLIERS.output[L];
  const demandMul = LEVEL_MULTIPLIERS.demand[L];
  const impactMul = LEVEL_MULTIPLIERS.impact[L];
  const negMul = LEVEL_MULTIPLIERS.negative[L];
  return {
    dev: (f.dev || 0) * outMul,
    demand: (f.demand || 0) * demandMul,
    supply: (f.supply || 0) * outMul,
    carbon: (f.carbon || 0) < 0 ? (f.carbon || 0) * negMul : (f.carbon || 0) * impactMul,
    water: (f.water || 0) < 0 ? (f.water || 0) * negMul : (f.water || 0) * impactMul,
  };
}

export function neighborIndices(index, size) {
  const r = Math.floor(index / size);
  const c = index % size;
  const arr = [];
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) arr.push(nr * size + nc);
  });
  return arr;
}

export function hasNeighbor(grid, index, size, types) {
  return neighborIndices(index, size).some((i) => grid[i] && types.includes(grid[i].type));
}

export function getCellSpatial(grid, index, size) {
  const cell = grid[index];
  if (!cell) return { positive: [], warnings: [] };
  const positive = [];
  const warnings = [];
  const t = cell.type;
  if (t === 'factory') (hasNeighbor(grid, index, size, ['thermal', 'nuclear', 'solar', 'wind']) ? positive : warnings).push('발전소 인접');
  if (t === 'data') (hasNeighbor(grid, index, size, ['cooling']) ? positive : warnings).push('순환냉각 인접');
  if (t === 'residential' && hasNeighbor(grid, index, size, ['green'])) positive.push('녹지 생활권');
  if (['solar', 'wind'].includes(t)) (hasNeighbor(grid, index, size, ['battery']) ? positive : warnings).push('저장장치 연결');
  if (t === 'battery' && hasNeighbor(grid, index, size, ['solar', 'wind'])) positive.push('재생에너지 연결');
  if (t === 'nuclear' && hasNeighbor(grid, index, size, ['cooling'])) positive.push('냉각 보조');
  if (t === 'cooling' && hasNeighbor(grid, index, size, ['data', 'nuclear'])) positive.push('냉각 수요 연결');
  if (['factory', 'thermal'].includes(t) && hasNeighbor(grid, index, size, ['residential'])) warnings.push('주거지 오염 갈등');
  // 추가 갈등 규칙: 원전·데이터센터의 사회적 갈등, 오염 시설과 녹지의 충돌 — 지도안의 SSI(과학기술 사회적 쟁점) 성취기준과 연결.
  if (t === 'nuclear' && hasNeighbor(grid, index, size, ['residential'])) warnings.push('원전 인접 불안');
  if (t === 'data' && hasNeighbor(grid, index, size, ['residential'])) warnings.push('소음·발열 민원');
  if (['thermal', 'factory'].includes(t) && hasNeighbor(grid, index, size, ['green'])) warnings.push('녹지 훼손 갈등');
  // 반대쪽 시설(주거지/녹지)에서도 같은 갈등이 보이도록 대칭으로 표시한다 (점수 계산은 한쪽에서만 1회 적용).
  if (t === 'residential' && hasNeighbor(grid, index, size, ['factory', 'thermal', 'nuclear', 'data'])) warnings.push('오염·불안 시설 인접');
  if (t === 'green' && hasNeighbor(grid, index, size, ['thermal', 'factory'])) warnings.push('오염 시설 인접');
  return { positive, warnings };
}

// 3단계 대시보드/독(dock)에서 "이 시설을 놓으면 어디가 좋고 어디가 나쁜지" 미리보기에 쓰는 단순화된 관계표.
// getCellSpatial()의 라벨 있는 판정과 별개로, 빈 칸 하이라이트용 good/bad 판정만 담당한다.
export const PARTNER_RULES = {
  factory: { good: ['thermal', 'nuclear', 'solar', 'wind'], bad: ['residential'] },
  thermal: { good: ['factory'], bad: ['residential', 'green'] },
  nuclear: { good: ['cooling', 'factory'], bad: ['residential'] },
  data: { good: ['cooling'], bad: ['residential'] },
  residential: { good: ['green'], bad: ['factory', 'thermal', 'nuclear', 'data'] },
  solar: { good: ['battery'], bad: [] },
  wind: { good: ['battery'], bad: [] },
  battery: { good: ['solar', 'wind'], bad: [] },
  cooling: { good: ['data', 'nuclear'], bad: [] },
  green: { good: ['residential'], bad: ['thermal', 'factory'] },
};

// 독에서 시설을 선택했을 때, 빈 칸 중 어디가 인접 보너스(good)/갈등(bad)을 받는지 계산한다.
export function placementPreview(facilityKey, grid, size) {
  const rule = PARTNER_RULES[facilityKey];
  const good = new Set();
  const bad = new Set();
  if (!rule) return { good, bad };
  grid.forEach((cell, i) => {
    if (cell) return;
    const ns = neighborIndices(i, size);
    if (ns.some((n) => grid[n] && rule.good.includes(grid[n].type))) good.add(i);
    if (ns.some((n) => grid[n] && rule.bad.includes(grid[n].type))) bad.add(i);
  });
  return { good, bad };
}

export function calcMetrics(grid, size) {
  let dev = 0, demand = 0, supply = 0, carbon = 0, water = 0, renewableSupply = 0, dataCount = 0, thermalCount = 0;
  let synergyScore = 0, synergyLinks = 0, conflictPairs = 0, heatCluster = 0;
  const linkedRenewables = new Set();

  grid.forEach((cell, i) => {
    if (!cell) return;
    const s = cellStats(cell);
    dev += s.dev; demand += s.demand; supply += s.supply; carbon += s.carbon; water += s.water;
    if (['solar', 'wind'].includes(cell.type)) renewableSupply += s.supply;
    if (cell.type === 'data') dataCount++;
    if (cell.type === 'thermal') thermalCount++;

    const ns = neighborIndices(i, size);
    if (cell.type === 'factory') {
      if (ns.some((n) => grid[n] && ['thermal', 'nuclear', 'solar', 'wind'].includes(grid[n].type))) {
        const b = 12 * cell.level;
        dev += b; synergyScore += b; synergyLinks++;
      }
    }
    if (cell.type === 'data') {
      if (ns.some((n) => grid[n]?.type === 'cooling')) {
        const b = 10 * cell.level;
        dev += b; water -= 4 * cell.level; synergyScore += b; synergyLinks++;
      }
      ns.forEach((n) => { if (grid[n]?.type === 'data' && n > i) heatCluster++; });
    }
    if (cell.type === 'residential' && ns.some((n) => grid[n]?.type === 'green')) {
      dev += 4 * cell.level; synergyScore += 4 * cell.level; synergyLinks++;
    }
    if (['solar', 'wind'].includes(cell.type) && ns.some((n) => grid[n]?.type === 'battery')) {
      linkedRenewables.add(i); synergyLinks++; synergyScore += 3 * cell.level;
    }
    if (cell.type === 'nuclear' && ns.some((n) => grid[n]?.type === 'cooling')) {
      water -= 2 * cell.level; synergyLinks++; synergyScore += 2;
    }
    if (['factory', 'thermal'].includes(cell.type)) {
      ns.forEach((n) => { if (grid[n]?.type === 'residential') { conflictPairs++; dev -= 3; carbon += 1; } });
    }
    // 원전 인접 주거지: 안전 불안이라는 사회적 갈등 — 발전점수 손실이 더 크다.
    if (cell.type === 'nuclear') {
      ns.forEach((n) => { if (grid[n]?.type === 'residential') { conflictPairs++; dev -= 4; } });
    }
    // 데이터센터 인접 주거지: 소음·발열 민원.
    if (cell.type === 'data') {
      ns.forEach((n) => { if (grid[n]?.type === 'residential') { conflictPairs++; dev -= 2; } });
    }
    // 오염 시설이 녹지를 훼손 — 탄소 부담이 늘어난 것처럼 취급.
    if (['thermal', 'factory'].includes(cell.type)) {
      ns.forEach((n) => { if (grid[n]?.type === 'green') { conflictPairs++; carbon += 0.5; } });
    }
  });

  water += heatCluster * 2;
  let renewablePenalty = 0;
  grid.forEach((cell, i) => {
    if (!cell || !['solar', 'wind'].includes(cell.type)) return;
    const s = cellStats(cell);
    renewablePenalty += s.supply * (linkedRenewables.has(i) ? 0.05 : 0.25);
  });
  const reliableSupply = Math.max(0, supply - renewablePenalty);
  const balance = reliableSupply - demand;
  const overload = Math.max(0, demand - reliableSupply);
  const sustainability = clamp(100 - carbon * 3.6 - Math.max(0, water - 10) * 2.5 - overload * 6 - conflictPairs * 4, 0, 100);
  const reliability = clamp(68 + balance * 3 + linkedRenewables.size * 6 - heatCluster * 5, 0, 100);

  return {
    dev: Math.round(dev), demand: round1(demand), supply: round1(supply), reliableSupply: round1(reliableSupply), balance: round1(balance),
    carbon: Math.max(0, round1(carbon)), water: Math.max(0, round1(water)), heatCluster, renewableSupply: round1(renewableSupply),
    dataCount, thermalCount, synergyScore: Math.round(synergyScore), synergyLinks, conflictPairs,
    sustainability: Math.round(sustainability), reliability: Math.round(reliability),
  };
}

export function stageLevelCap() {
  return gameState.upgradePermitLevel;
}

export function upgradeCost(cell) {
  const f = FACILITIES[cell.type];
  return Math.ceil(f.cost * (cell.level === 1 ? 1.0 : 1.45));
}

export function investedCost(cell) {
  let sum = FACILITIES[cell.type].cost;
  for (let l = 1; l < cell.level; l++) sum += Math.ceil(FACILITIES[cell.type].cost * (l === 1 ? 1.0 : 1.45));
  return sum;
}

export function demolitionRefund(cell) {
  return Math.floor(investedCost(cell) * 0.5);
}

export function refreshMetrics() {
  gameState.metrics = calcMetrics(gameState.grid, gameState.gridSize);
  return gameState.metrics;
}

export function selectFacility(key) {
  if (!FACILITIES[key]) return;
  gameState.selectedFacility = key;
  eventBus.emit(Events.BOARD_FACILITY_SELECTED, { key });
}

export function placeFacility(index) {
  if (!gameState.isEditable) return { ok: false, reason: 'not_editable' };
  if (gameState.grid[index]) return { ok: false, reason: 'occupied' };
  const f = FACILITIES[gameState.selectedFacility];
  if (!f || !gameState.unlockedFacilities.has(gameState.selectedFacility)) return { ok: false, reason: 'locked' };
  if (gameState.credits < f.cost) return { ok: false, reason: 'insufficient_credits', facility: f };

  gameState.grid[index] = { type: gameState.selectedFacility, level: 1 };
  gameState.credits -= f.cost;
  gameState.turn++;
  const metrics = refreshMetrics();
  const placedCount = gameState.grid.filter(Boolean).length;
  eventBus.emit(Events.BOARD_PLACED, { index, type: f.name, key: gameState.selectedFacility, metrics, placedCount });
  return { ok: true, metrics };
}

export function upgradeCell(index) {
  const cell = gameState.grid[index];
  if (!cell) return { ok: false, reason: 'empty' };
  if (!gameState.isEditable) return { ok: false, reason: 'not_editable' };
  const f = FACILITIES[cell.type];
  const cap = Math.min(f.maxLevel, stageLevelCap());
  if (cell.level >= cap) return { ok: false, reason: 'max_level' };
  const cost = upgradeCost(cell);
  if (gameState.credits < cost) return { ok: false, reason: 'insufficient_credits', cost };

  gameState.credits -= cost;
  cell.level++;
  gameState.turn++;
  const metrics = refreshMetrics();
  eventBus.emit(Events.BOARD_UPGRADED, { index, type: f.name, level: cell.level, metrics });
  return { ok: true, metrics };
}

export function demolishCell(index) {
  const cell = gameState.grid[index];
  if (!cell) return { ok: false, reason: 'empty' };
  if (!gameState.isEditable) return { ok: false, reason: 'not_editable' };
  const refund = demolitionRefund(cell);
  const name = FACILITIES[cell.type].name;
  gameState.grid[index] = null;
  gameState.credits += refund;
  gameState.turn++;
  const metrics = refreshMetrics();
  eventBus.emit(Events.BOARD_DEMOLISHED, { index, name, refund, metrics });
  return { ok: true, refund, metrics };
}

export function expandGrid(newSize) {
  const oldSize = gameState.gridSize;
  const old = gameState.grid;
  const newGrid = Array(newSize * newSize).fill(null);
  const newCells = new Set();
  for (let r = 0; r < oldSize; r++) {
    for (let c = 0; c < oldSize; c++) newGrid[r * newSize + c] = old[r * oldSize + c];
  }
  for (let r = 0; r < newSize; r++) {
    for (let c = 0; c < newSize; c++) {
      if (r >= oldSize || c >= oldSize) newCells.add(r * newSize + c);
    }
  }
  gameState.gridSize = newSize;
  gameState.grid = newGrid;
  gameState.expandedCells = newCells;
  const metrics = refreshMetrics();
  eventBus.emit(Events.BOARD_EXPANDED, { newSize, metrics });
  setTimeout(() => {
    gameState.expandedCells.clear();
    eventBus.emit(Events.BOARD_EXPANDED, { newSize, metrics: gameState.metrics, settled: true });
  }, 4200);
}

export const GRID_EXPANSION_SETTLE_MS = 4200;
