import { BOARD, FACILITIES, GAME, TIME } from '../core/Constants.js';
import { SAVE_VERSION, normalizeCell } from '../core/GameState.js';
import { gameState } from '../core/GameState.js';
import { roundCredits } from '../core/Money.js';
import { eventBus, Events } from '../core/EventBus.js';
import { axialToWorld, createHexCoordinates, hexDistance } from './HexGridSystem.js';

let saveTimer = null;
let simulationSaveTimer = null;
let lastSimulationSaveAt = 0;
const SIMULATION_SAVE_INTERVAL_MS = 10000;

function persist() {
  try {
    localStorage.setItem(GAME.AUTOSAVE_KEY, JSON.stringify(gameState.serialize()));
  } catch (err) {
    console.warn('자동저장 실패:', err);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, GAME.AUTOSAVE_DEBOUNCE_MS);
}

function scheduleSimulationSave() {
  const elapsed = Date.now() - lastSimulationSaveAt;
  if (elapsed >= SIMULATION_SAVE_INTERVAL_MS) {
    lastSimulationSaveAt = Date.now();
    persist();
    return;
  }
  if (simulationSaveTimer != null) return;
  simulationSaveTimer = setTimeout(() => {
    simulationSaveTimer = null;
    lastSimulationSaveAt = Date.now();
    persist();
  }, SIMULATION_SAVE_INTERVAL_MS - elapsed);
}

// 수업 중 실수로 새로고침해도 진행 상황이 남도록, 상태가 바뀔 만한 이벤트마다 디바운스 저장한다.
const AUTOSAVE_EVENTS = [
  Events.CONSTRUCTION_STARTED,
  Events.CONSTRUCTION_COMPLETED,
  Events.CONSTRUCTION_CANCELLED,
  Events.UPGRADE_STARTED,
  Events.UPGRADE_COMPLETED,
  Events.UPGRADE_CANCELLED,
  Events.BOARD_PLACED,
  Events.BOARD_UPGRADED,
  Events.BOARD_DEMOLISHED,
  Events.BOARD_EXPANDED,
  Events.QUIZ_FINISHED,
  Events.QUEST_CLAIMED,
  Events.FACILITY_PRIORITY_CHANGED,
  Events.SAVE_REQUESTED,
  Events.AUDIO_TOGGLE_MUTE,
];

export function initSaveSystem() {
  AUTOSAVE_EVENTS.forEach((evt) => eventBus.on(evt, scheduleSave));
  eventBus.on(Events.SIMULATION_TICKED, scheduleSimulationSave);
}

export function loadSavedGame() {
  try {
    const raw = localStorage.getItem(GAME.AUTOSAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const data = migrateSaveData(parsed);
    const ok = gameState.hydrate(data);
    if (ok) eventBus.emit(Events.GAME_LOADED, {});
    return ok;
  } catch (err) {
    console.warn('저장된 게임을 불러오지 못했습니다:', err);
    gameState.reset();
    return false;
  }
}

export function migrateV1ToV2(data) {
  const stage = Number(data?.stage) || 1;
  const questIndex = stage === 1 ? 1 : stage <= 3 ? 5 : stage === 4 ? 6 : stage === 5 ? 10 : 15;
  const placed = (data.grid || []).filter(Boolean).map((cell) => cell.type);
  const unlocked = new Set(stage >= 5 ? Object.keys(FACILITIES) : ['residential', ...placed]);
  if (stage >= 2) ['thermal', 'factory', 'data', 'nuclear'].forEach((type) => unlocked.add(type));
  const migrated = {
    ...data,
    v: 2,
    grid: (data.grid || []).map(normalizeCell),
    questIndex,
    questStatus: stage === 6 ? 'claimed' : 'active',
    questProgress: {},
    claimedQuestIds: [],
    unlockedFacilities: [...unlocked],
    upgradePermitLevel: stage >= 5 ? 3 : 1,
    campaignComplete: stage === 6,
    simulationHour: 8,
    simulationDay: 1,
    tickIndex: 0,
    lastTickSummary: null,
    climateAlert: 'normal',
    consecutiveEssentialOutageHours: 0,
    emergencySupportUsedQuestIds: [],
    simulationTotals: {
      hours: 0,
      netCredits: 0,
      transmissionEfficiency: 0,
      lowCarbonPercent: 0,
      employmentRate: 0,
      industryFill: 0,
      essentialOutageHours: 0,
      overcrowding: 0,
      health: 0,
    },
  };
  delete migrated[['evi', 'dence'].join('')];
  return migrated;
}

const angle = (x, y) => Math.atan2(y, x);

export function mapLegacySquareGrid(grid, size) {
  if (![5, 6].includes(size) || grid.length !== size * size) {
    throw new Error(`Unsupported legacy square board: ${size} (${grid.length} cells)`);
  }
  const center = (size - 1) / 2;
  const occupied = grid
    .map((cell, index) => ({
      cell,
      index,
      x: index % size - center,
      y: Math.floor(index / size) - center,
    }))
    .filter(({ cell }) => cell)
    .sort((a, b) => (
      Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)
      || angle(a.x, a.y) - angle(b.x, b.y)
      || a.index - b.index
    ));
  const coords = createHexCoordinates(BOARD.EXPANDED_RADIUS);
  const targets = coords
    .map((coord, index) => ({ coord, index, world: axialToWorld(coord, 1) }))
    .sort((a, b) => (
      hexDistance(a.coord, { q: 0, r: 0 }) - hexDistance(b.coord, { q: 0, r: 0 })
      || angle(a.world.x, a.world.z) - angle(b.world.x, b.world.z)
      || a.index - b.index
    ));
  const next = Array(BOARD.EXPANDED_CELLS).fill(null);
  const indexMap = new Map();
  occupied.forEach((entry, position) => {
    next[targets[position].index] = { ...entry.cell };
    indexMap.set(entry.index, targets[position].index);
  });
  return { grid: next, indexMap, boardRadius: BOARD.EXPANDED_RADIUS };
}

function remapSnapshot(snapshot, indexMap) {
  if (!Array.isArray(snapshot)) return snapshot ?? null;
  const next = Array(BOARD.EXPANDED_CELLS).fill(null);
  snapshot.forEach((cell, oldIndex) => {
    const newIndex = indexMap.get(oldIndex);
    if (cell && newIndex !== undefined) next[newIndex] = { ...cell };
  });
  return next;
}

export function migrateV2ToV3(data) {
  const grid = Array.isArray(data.grid) ? data.grid : [];
  const occupied = grid.some(Boolean);
  if (!occupied) {
    return {
      ...data,
      v: 3,
      boardRadius: BOARD.INITIAL_RADIUS,
      grid: Array(BOARD.INITIAL_CELLS).fill(null),
      firstCitySnapshot: null,
      selectedCell: null,
      diagnosisFound: [],
      questProgress: {},
      gridSize: undefined,
    };
  }
  const size = Number(data.gridSize) || Math.sqrt(grid.length);
  const mapped = mapLegacySquareGrid(grid, size);
  return {
    ...data,
    v: 3,
    boardRadius: mapped.boardRadius,
    grid: mapped.grid,
    firstCitySnapshot: remapSnapshot(data.firstCitySnapshot, mapped.indexMap),
    selectedCell: mapped.indexMap.get(data.selectedCell) ?? null,
    diagnosisFound: (data.diagnosisFound || []).map((index) => mapped.indexMap.get(index)).filter((index) => index !== undefined),
    questProgress: {},
    gridSize: undefined,
  };
}

export function stripObsoleteState(data) {
  const clean = { ...data };
  const obsolete = new Set([
    'evidence', 'badges', 'advisorQuestions', 'transcripts', 'aiAdvice', 'aiHistory',
    'simulationDay', 'simulationHour', 'gridSize',
    'diagnosisFound', 'diagnosisHintUsed', 'diagnosisScannerActive',
  ]);
  Object.keys(clean).forEach((key) => {
    if (obsolete.has(key) || key.toLowerCase().startsWith('ai')) delete clean[key];
  });
  return clean;
}

export function migrateV3ToV4(data) {
  const simulationDay = Math.max(1, Number(data.simulationDay) || 1);
  const simulationHour = Number.isFinite(Number(data.simulationHour)) ? Number(data.simulationHour) : 8;
  const elapsedGameHours = Math.max(0, (simulationDay - 1) * 24 + simulationHour - 8);
  return stripObsoleteState({
    ...data,
    v: 4,
    elapsedGameHours,
    timeScale: 1,
    lastSettlementDelta: 0,
    onboardingVersionSeen: 0,
    tutorialStep: 'build-button',
    tutorialComplete: false,
    researchMenuUnlocked: Number(data.questIndex) >= 4,
    research: {
      active: null,
      completedIds: [],
      techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0 },
    },
  });
}

export function migrateV4ToV5(data) {
  const active = data.research?.active;
  const existingJobs = data.research?.jobs || {};
  const jobs = Object.fromEntries(Object.entries(existingJobs).map(([id, job]) => [id, { ...job, id: job?.id || id }]));
  if (active?.id && !jobs[active.id]) jobs[active.id] = { ...active };
  const questIndex = Number(data.questIndex) || 1;
  const research = { ...(data.research || {}) };
  delete research.active;
  return {
    ...data,
    v: 5,
    credits: roundCredits(data.credits),
    upgradePermitLevel: questIndex >= 8 && questIndex <= 12
      ? Math.max(2, Number(data.upgradePermitLevel) || 1)
      : Number(data.upgradePermitLevel) || 1,
    diagnosisScannerActive: data.diagnosisScannerActive ?? true,
    research: {
      ...research,
      jobs,
      quizAccelerationBankHours: Math.max(0, Number(data.research?.quizAccelerationBankHours) || 0),
      quizCreditQuestionIds: structuredClone(data.research?.quizCreditQuestionIds || {}),
    },
    carbonCrisisHours: Math.max(0, Number(data.carbonCrisisHours) || 0),
    carbonWarningMilestones: Array.isArray(data.carbonWarningMilestones) ? data.carbonWarningMilestones : [],
    gameOver: !!data.gameOver,
    gameOverReason: data.gameOverReason ?? null,
  };
}

function legacyProgression(data, changedReady) {
  const questIndex = Math.max(1, Math.min(15, Math.trunc(Number(data.questIndex) || 1)));
  const campaignComplete = Boolean(data.campaignComplete);
  const completedObjectiveSetIds = [];
  if (questIndex >= 10 || campaignComplete) completedObjectiveSetIds.push('transition-choice');
  if (questIndex >= 13 || campaignComplete) completedObjectiveSetIds.push('specialization');
  if (questIndex >= 15 || campaignComplete) completedObjectiveSetIds.push('resilience');
  const objectiveSetId = campaignComplete || questIndex >= 15 || questIndex <= 6
    ? null
    : questIndex <= 9
      ? 'transition-choice'
      : questIndex <= 12
        ? 'specialization'
        : 'resilience';
  return {
    chapter: campaignComplete || questIndex >= 15 ? 4 : questIndex <= 6 ? 1 : questIndex <= 9 ? 2 : 3,
    tutorialQuestIndex: Math.min(6, questIndex),
    tutorialQuestStatus: questIndex > 6 ? 'claimed' : (changedReady ? 'active' : data.questStatus || 'active'),
    tutorialProgress: questIndex <= 6 && !changedReady ? { ...(data.questProgress || {}) } : {},
    objectiveSetId,
    objectiveProgress: {},
    completedObjectiveSetIds,
  };
}

function legacyExpansion(data, grid) {
  const isExpanded = grid.length === BOARD.EXPANDED_CELLS || Number(data.boardRadius) >= BOARD.EXPANDED_RADIUS;
  return isExpanded
    ? {
      phase: 2,
      firstChoice: 'legacy_full',
      activeCellIndices: Array.from({ length: BOARD.EXPANDED_CELLS }, (_, index) => index),
    }
    : {
      phase: 0,
      firstChoice: null,
      activeCellIndices: Array.from({ length: BOARD.INITIAL_CELLS }, (_, index) => index),
    };
}

function normalizeV6Grid(data) {
  const expanded = Array.isArray(data.grid) && (data.grid.length === BOARD.EXPANDED_CELLS || Number(data.boardRadius) >= BOARD.EXPANDED_RADIUS);
  const length = expanded ? BOARD.EXPANDED_CELLS : BOARD.INITIAL_CELLS;
  return Array.from({ length }, (_, index) => normalizeCell(data.grid?.[index] ?? null));
}

export function migrateV5ToV6(data) {
  const changedReady = [9, 14].includes(Number(data.questIndex)) && data.questStatus === 'ready_to_claim';
  const grid = normalizeV6Grid(data);
  const completedIds = [...(data.research?.completedIds || [])];
  const completed = new Set(completedIds);
  const techLevels = {
    solar: Math.max(1, Math.min(3, Number(data.research?.techLevels?.solar) || 1)),
    wind: Math.max(1, Math.min(3, Number(data.research?.techLevels?.wind) || 1)),
    battery: Math.max(1, Math.min(3, Number(data.research?.techLevels?.battery) || 1)),
    tidal: Math.max(0, Math.min(3, Number(data.research?.techLevels?.tidal) || 0)),
  };
  if (completed.has('renewable3')) {
    for (const type of ['solar', 'wind', 'battery', 'tidal']) techLevels[type] = Math.max(3, techLevels[type]);
  }
  const campaignComplete = Boolean(data.campaignComplete);
  const legacySupportUsed = Array.isArray(data.emergencySupportUsedQuestIds)
    && data.emergencySupportUsedQuestIds.length > 0;
  const boardRadius = grid.length === BOARD.EXPANDED_CELLS ? BOARD.EXPANDED_RADIUS : BOARD.INITIAL_RADIUS;
  const selectedCell = Number.isInteger(data.selectedCell) && data.selectedCell >= 0 && data.selectedCell < grid.length
    ? data.selectedCell
    : null;
  return {
    ...data,
    v: 6,
    credits: roundCredits(data.credits),
    boardRadius,
    grid,
    selectedCell,
    timeScale: TIME.ALLOWED_SCALES.includes(Number(data.timeScale)) ? Number(data.timeScale) : TIME.DEFAULT_SCALE,
    upgradePermitLevel: Math.max(1, Math.min(3, Math.trunc(Number(data.upgradePermitLevel) || 1))),
    questStatus: changedReady ? 'active' : data.questStatus || 'active',
    questProgress: changedReady ? {} : { ...(data.questProgress || {}) },
    progression: legacyProgression(data, changedReady),
    expansion: legacyExpansion(data, grid),
    events: {
      seed: GAME.EVENT_SEED,
      schedule: [],
      activeId: null,
      completed: [],
      forecastAcknowledgedIds: [],
    },
    stressTest: {
      status: campaignComplete ? 'legacy_complete' : Number(data.questIndex) >= 15 ? 'ready' : 'locked',
      phaseIndex: 0,
      phaseHour: 0,
      result: null,
    },
    operationalRisk: {
      negativeCreditHours: 0,
      essentialBlackoutHours: Math.max(0, Number(data.consecutiveEssentialOutageHours) || 0),
      warningIds: [],
    },
    emergencySupport: {
      used: legacySupportUsed,
      economyScorePenalty: legacySupportUsed ? 2 : 0,
    },
    decisionCounts: {
      modeChanges: 0,
      priorityChanges: 0,
      researchPauses: 0,
      emergencySupport: Number(legacySupportUsed),
      automaticModeChanges: 0,
      batteryPolicyChanges: 0,
    },
    research: {
      ...(data.research || {}),
      jobs: Object.fromEntries(Object.entries(data.research?.jobs || {}).map(([id, job]) => [id, { ...job, id: job?.id || id }])),
      completedIds,
      techLevels,
      quizAccelerationBankHours: Math.max(0, Number(data.research?.quizAccelerationBankHours) || 0),
    },
  };
}

export function migrateV6ToV7(data) {
  return {
    ...data,
    v: 7,
    grid: (data.grid || []).map((cell) => cell ? { ...normalizeCell({ ...cell, project: null }), project: null } : null),
  };
}

function migrateLegacyProject(project) {
  if (!project) return null;
  const migrated = {
    ...project,
    elapsedDays: Math.max(0, Number(project.elapsedHours) || 0),
    durationDays: Math.max(0, Number(project.durationHours) || 0),
  };
  delete migrated.elapsedHours;
  delete migrated.durationHours;
  return migrated;
}

function migrateLegacyResearchJob(job, id) {
  const migrated = {
    ...job,
    id: job?.id || id,
    elapsedEffectiveDays: Math.max(0, Number(job?.elapsedEffectiveHours) || 0),
  };
  if (job?.durationHours != null) migrated.durationDays = Math.max(0, Number(job.durationHours) || 0);
  delete migrated.elapsedEffectiveHours;
  delete migrated.durationHours;
  return migrated;
}

function migrateLegacySummary(summary) {
  if (!summary) return summary ?? null;
  const migrated = {
    ...summary,
    dailyCarbon: Number(summary.dailyCarbon ?? summary.hourlyCarbon) || 0,
    dailyWater: Number(summary.dailyWater ?? summary.hourlyWater) || 0,
  };
  delete migrated.hour;
  delete migrated.hourlyCarbon;
  delete migrated.hourlyWater;
  return migrated;
}

function migrateLegacyStressTest(stressTest, campaignComplete) {
  const source = stressTest || {};
  const metrics = source.metrics ? {
    ...source.metrics,
    days: Number(source.metrics.days ?? source.metrics.hours) || 0,
    blackoutDays: Number(source.metrics.blackoutDays ?? source.metrics.blackoutHours) || 0,
    carbonRiskDays: Number(source.metrics.carbonRiskDays ?? source.metrics.carbonRiskHours) || 0,
    waterViolationDays: Number(source.metrics.waterViolationDays ?? source.metrics.waterViolationHours) || 0,
    recoveryDays: source.metrics.recoveryDays ?? source.metrics.recoveryHours ?? null,
    consecutiveBankruptcyDays: Number(source.metrics.consecutiveBankruptcyDays ?? source.metrics.consecutiveBankruptcyHours) || 0,
    maxConsecutiveBankruptcyDays: Number(source.metrics.maxConsecutiveBankruptcyDays ?? source.metrics.maxConsecutiveBankruptcyHours) || 0,
  } : null;
  if (metrics) {
    for (const key of ['hours', 'blackoutHours', 'carbonRiskHours', 'waterViolationHours', 'recoveryHours', 'consecutiveBankruptcyHours', 'maxConsecutiveBankruptcyHours']) {
      delete metrics[key];
    }
  }
  const migrated = {
    ...source,
    status: campaignComplete ? 'passed' : 'locked',
    phaseDay: Number(source.phaseDay ?? source.phaseHour) || 0,
    metrics,
  };
  delete migrated.phaseHour;
  delete migrated.startedAtHour;
  return migrated;
}

export function migrateV7ToV8(data) {
  const campaignComplete = Boolean(data.campaignComplete);
  const legacyQuestIndex = Math.max(1, Math.min(15, Math.trunc(Number(data.questIndex) || 1)));
  const questIndex = campaignComplete ? 15 : legacyQuestIndex <= 6 ? legacyQuestIndex : 7;
  const simulationTotals = {
    ...(data.simulationTotals || {}),
    days: Number(data.simulationTotals?.days ?? data.simulationTotals?.hours) || 0,
    essentialOutageDays: Number(
      data.simulationTotals?.essentialOutageDays ?? data.simulationTotals?.essentialOutageHours,
    ) || 0,
  };
  delete simulationTotals.hours;
  delete simulationTotals.essentialOutageHours;

  const questProgress = {
    ...(questIndex === legacyQuestIndex ? data.questProgress || {} : {}),
  };
  if (questProgress.consecutiveHours != null) {
    questProgress.consecutiveDays = Math.max(0, Number(questProgress.consecutiveHours) || 0);
    delete questProgress.consecutiveHours;
  }

  const migrated = {
    ...data,
    v: 8,
    questIndex,
    questStatus: campaignComplete ? 'claimed' : 'active',
    questProgress,
    elapsedGameDays: Math.floor(Math.max(0, Number(data.elapsedGameHours) || 0) / 24),
    grid: (data.grid || []).map((cell) => cell ? {
      ...cell,
      project: migrateLegacyProject(cell.project),
    } : null),
    lastTickSummary: migrateLegacySummary(data.lastTickSummary),
    consecutiveEssentialOutageDays: Math.max(0, Number(data.consecutiveEssentialOutageHours) || 0),
    climateCampaign: {
      status: campaignComplete ? 'complete' : questIndex >= 7 ? 'briefing' : 'locked',
      eventType: null,
      attempt: 0,
      scheduledEventId: null,
      progress: {},
      lastResult: null,
      completedEventTypes: [],
    },
    stressTest: migrateLegacyStressTest(data.stressTest, campaignComplete),
    operationalRisk: {
      negativeCreditDays: Math.max(0, Number(data.operationalRisk?.negativeCreditHours) || 0),
      essentialBlackoutDays: Math.max(0, Number(data.operationalRisk?.essentialBlackoutHours) || 0),
      warningIds: [...(data.operationalRisk?.warningIds || [])],
    },
    research: {
      ...(data.research || {}),
      jobs: Object.fromEntries(Object.entries(data.research?.jobs || {}).map(([id, job]) => [
        id,
        migrateLegacyResearchJob(job, id),
      ])),
      techLevels: {
        solar: Math.max(1, Number(data.research?.techLevels?.solar) || 1),
        wind: Math.max(1, Number(data.research?.techLevels?.wind) || 1),
        battery: Math.max(1, Number(data.research?.techLevels?.battery) || 1),
        tidal: Math.max(0, Number(data.research?.techLevels?.tidal) || 0),
        green: 1,
      },
      quizAccelerationBankDays: Math.max(0, Number(data.research?.quizAccelerationBankHours) || 0),
    },
    carbonCrisisDays: Math.max(0, Number(data.carbonCrisisHours) || 0),
    workforceRebalanceGraceDays: 24,
    simulationTotals,
  };
  delete migrated.elapsedGameHours;
  delete migrated.consecutiveEssentialOutageHours;
  delete migrated.carbonCrisisHours;
  delete migrated.research.quizAccelerationBankHours;
  return migrated;
}

export function migrateSaveData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid save payload');
  let migrated = structuredClone(data);
  if (migrated.v === 1) migrated = migrateV1ToV2(migrated);
  if (migrated.v === 2) migrated = migrateV2ToV3(migrated);
  if (migrated.v === 3) migrated = migrateV3ToV4(migrated);
  if (migrated.v === 4) migrated = migrateV4ToV5(migrated);
  if (migrated.v === 5) migrated = migrateV5ToV6(migrated);
  if (migrated.v === 6) migrated = migrateV6ToV7(migrated);
  if (migrated.v === 7) migrated = migrateV7ToV8(migrated);
  if (migrated.v !== SAVE_VERSION) throw new Error(`Unsupported save version: ${migrated.v}`);
  return stripObsoleteState(migrated);
}

export function migrateV1Save(data) {
  return migrateSaveData(data);
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(GAME.AUTOSAVE_KEY);
  } catch (err) {
    // ignore
  }
}
