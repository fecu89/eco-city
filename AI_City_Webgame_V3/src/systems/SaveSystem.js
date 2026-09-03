import { BOARD, FACILITIES, GAME, SAVE_MESSAGES, TIME, WORKFORCE_RULES } from '../core/Constants.js';
import { SAVE_VERSION, normalizeCell } from '../core/GameState.js';
import { gameState } from '../core/GameState.js';
import { roundCredits } from '../core/Money.js';
import { eventBus, Events } from '../core/EventBus.js';
import { axialToWorld, createHexCoordinates, expandHexGrid, hexDistance } from './HexGridSystem.js';
import { createEnvironment, normalizeRotation } from '../core/Environment.js';
import { refreshMetrics } from './BoardSystem.js';
import { readStorage, removeStorage, writeStorage } from '../core/safeStorage.js';
import { CAMPAIGN_QUEST_INDEXES, PREPARATION_QUEST_IDS } from '../core/CampaignProgression.js';
import { QUESTS } from '../core/QuestDefinitions.js';
import { EXPANSION_SIDES } from '../core/ZoneDefinitions.js';

// 현재 버전보다 새로운 저장을 보관하는 백업 키.
const NEWER_SAVE_KEY = `${GAME.AUTOSAVE_KEY}-newer`;

let saveTimer = null;
let simulationSaveTimer = null;
let lastSimulationSaveAt = 0;

// 저장소가 막힌 브라우저에서는 자동저장이 매번 조용히 실패한다. 로그는 실패할 때마다 남기되,
// 토스트는 세션당 한 번만 띄운다 — 정산·건설마다 같은 경고가 쌓이면 화면을 덮는다.
let storageBlockedNotified = false;

function notifyStorageBlocked() {
  console.warn(SAVE_MESSAGES.AUTOSAVE_FAILED_LOG);
  if (storageBlockedNotified) return;
  storageBlockedNotified = true;
  eventBus.emit(Events.TOAST_SHOW, {
    title: SAVE_MESSAGES.STORAGE_BLOCKED_TITLE,
    text: SAVE_MESSAGES.STORAGE_BLOCKED_TEXT,
    priority: true,
  });
}

function persist() {
  let payload;
  try {
    payload = JSON.stringify(gameState.serialize());
  } catch (err) {
    console.warn(`${SAVE_MESSAGES.AUTOSAVE_FAILED_LOG}:`, err);
    return;
  }
  // writeStorage는 예외를 삼키고 false만 돌려준다. 반환값을 버리면 실패가 그대로 묻힌다.
  if (!writeStorage(GAME.AUTOSAVE_KEY, payload)) notifyStorageBlocked();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, GAME.AUTOSAVE_DEBOUNCE_MS);
}

// 탭을 숨기거나 페이지를 떠날 때 호출한다. 디바운스(600ms)와 정산 스로틀(10초) 때문에
// 그냥 두면 마지막 건설이나 최대 10게임일치 정산이 통째로 사라진다.
export function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (simulationSaveTimer != null) {
    clearTimeout(simulationSaveTimer);
    simulationSaveTimer = null;
  }
  lastSimulationSaveAt = Date.now();
  persist();
}

function scheduleSimulationSave() {
  const elapsed = Date.now() - lastSimulationSaveAt;
  if (elapsed >= GAME.SIMULATION_SAVE_THROTTLE_MS) {
    lastSimulationSaveAt = Date.now();
    persist();
    return;
  }
  if (simulationSaveTimer != null) return;
  simulationSaveTimer = setTimeout(() => {
    simulationSaveTimer = null;
    lastSimulationSaveAt = Date.now();
    persist();
  }, GAME.SIMULATION_SAVE_THROTTLE_MS - elapsed);
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
  window.addEventListener('pagehide', flushSave);
}

export function loadSavedGame() {
  try {
    const raw = readStorage(GAME.AUTOSAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    // 더 새로운 버전으로 저장된 판은 되돌릴 수 없다. 새 도시로 시작하되 원본을 덮어쓰지 않고
    // 백업 키에 남겨, 예전 버전을 열었다가 진행 상황을 잃는 일이 없게 한다.
    if (Number(parsed?.v) > SAVE_VERSION) {
      writeStorage(NEWER_SAVE_KEY, raw);
      gameState.reset();
      return false;
    }
    const data = migrateSaveData(parsed);
    const ok = gameState.hydrate(data);
    // metrics는 저장되지 않는다. 다시 계산해 두지 않으면 새로고침 직후 레이더 차트가 비고
    // BOARD_PLACED 페이로드가 metrics: null을 싣는다.
    if (ok) {
      refreshMetrics();
      eventBus.emit(Events.GAME_LOADED, {});
    }
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

// 지금은 쓰지 않는 옛 저장 필드. 접두사 규칙 대신 이름을 명시한다 —
// 'ai'로 시작한다는 이유만으로 지우면 나중에 airQuality 같은 정상 상태까지 사라진다.
const OBSOLETE_SAVE_KEYS = Object.freeze([
  // v1 레거시(AI 어드바이저·증거 수집)
  'evidence', 'badges', 'advisorQuestions', 'transcripts', 'aiAdvice', 'aiHistory', 'gridSize',
  // v3까지 쓰던 시(hour) 기반 시계
  'simulationDay', 'simulationHour',
  // v6에서 제거한 진단 스캐너
  'diagnosisFound', 'diagnosisHintUsed', 'diagnosisScannerActive',
]);

export function stripObsoleteState(data) {
  const clean = { ...data };
  OBSOLETE_SAVE_KEYS.forEach((key) => { delete clean[key]; });
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
    timeScale: TIME.DEFAULT_SCALE,
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

// 아래 마이그레이션들의 퀘스트 번호는 모두 옛 15퀘스트 체계다. 지금의
// CAMPAIGN_QUEST_INDEXES와 의미가 다르므로 상수로 바꾸면 안 된다.
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
      priorityChanges: 0,
      researchPauses: 0,
      emergencySupport: Number(legacySupportUsed),
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
    // v7 시(hour) 틱은 v8 일(day) 틱으로 1:1 이름만 바뀌었다.
    elapsedGameDays: Math.max(0, Number(data.elapsedGameHours) || 0),
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
    },
    carbonCrisisDays: Math.max(0, Number(data.carbonCrisisHours) || 0),
    workforceRebalanceGraceDays: WORKFORCE_RULES.REBALANCE_GRACE_DAYS,
    simulationTotals,
  };
  delete migrated.elapsedGameHours;
  delete migrated.consecutiveEssentialOutageHours;
  delete migrated.carbonCrisisHours;
  delete migrated.research.quizAccelerationBankHours;
  return migrated;
}

function resetClimateStateForPreparation(data) {
  return {
    climateCampaign: {
      status: 'locked',
      eventType: null,
      attempt: 0,
      scheduledEventId: null,
      progress: {},
      lastResult: null,
      completedEventTypes: [],
    },
    events: {
      ...(data.events || {}),
      schedule: [],
      activeId: null,
      forecastAcknowledgedIds: [],
      currentMetrics: null,
      lastResult: null,
    },
  };
}

const allCellIndices = () => Array.from({ length: BOARD.MAX_CELLS }, (_, index) => index);

// 기후전 구간(11~18)에서는 캠페인이 이벤트 일정을 통째로 소유한다(campaignOwnsSchedule).
// 그런데 v8 저장의 climateCampaign.status는 'locked'(또는 없음)일 수 있고, 그대로 옮기면
// 캠페인이 일정을 놓아 버려 무작위 이벤트 덱이 기후 퀘스트 위에 겹쳐 깔린다.
// 브리핑부터 다시 시작하도록 상태만 정규화한다 — 이미 통과한 이벤트 기록은 그대로 둔다.
const CAMPAIGN_SCHEDULE_STATUSES = ['briefing', 'preparation', 'active', 'result'];

function normalizeClimateCampaignForMigration(data, questIndex) {
  if (questIndex < CAMPAIGN_QUEST_INDEXES.CLIMATE_START
    || questIndex > CAMPAIGN_QUEST_INDEXES.CLIMATE_END) return null;
  const campaign = data.climateCampaign || {};
  if (CAMPAIGN_SCHEDULE_STATUSES.includes(campaign.status)) return null;
  return {
    climateCampaign: {
      ...campaign,
      status: 'briefing',
      eventType: null,
      scheduledEventId: null,
      progress: {},
      attempt: Math.max(0, Number(campaign.attempt) || 0),
      lastResult: campaign.lastResult ?? null,
      completedEventTypes: [...(campaign.completedEventTypes || [])],
    },
  };
}

// 준비 퀘스트가 주는 강화 허가 레벨(7단계 보상 Lv.2). 퀘스트 정의가 유일한 출처다.
const PREPARATION_UPGRADE_PERMIT_LEVEL = QUESTS.reduce((level, quest) => (
  PREPARATION_QUEST_IDS.includes(quest.id)
    ? Math.max(level, Number(quest.reward.upgradePermitLevel) || 0)
    : level
), 1);

// v8은 준비 퀘스트(7~10)가 없었다. 기후전으로 옮겨지는 저장은 그 보상을 받은 적이 없으므로
// tidal1 연구도, 2차 확장도, 풍력·태양광도 영원히 잠긴 채 18단계 브리핑에서 막힌다.
// 준비 단계를 통과한 것으로 간주하고 보상을 채워 넣는다.
function grantSkippedPreparation(data, questIndex) {
  const claimed = new Set(data.claimedQuestIds || []);
  const unlocked = new Set(data.unlockedFacilities || ['residential']);
  let expansion = structuredClone(data.expansion || {
    phase: 0,
    firstChoice: null,
    activeCellIndices: Array.from({ length: BOARD.INITIAL_CELLS }, (_, index) => index),
  });
  let grid = data.grid;
  let boardRadius = data.boardRadius;
  let upgradePermitLevel = data.upgradePermitLevel;

  if (questIndex >= CAMPAIGN_QUEST_INDEXES.CLIMATE_START) {
    PREPARATION_QUEST_IDS.forEach((id) => claimed.add(id));
    ['battery', 'solar', 'wind'].forEach((type) => unlocked.add(type));
    // 완료로 채워 넣은 준비 퀘스트의 보상도 함께 줘야 도시가 기후전 내내 Lv.1에 묶이지 않는다.
    upgradePermitLevel = Math.max(Number(upgradePermitLevel) || 1, PREPARATION_UPGRADE_PERMIT_LEVEL);
    if (expansion.phase === 1) {
      expansion = { ...expansion, phase: 2, activeCellIndices: allCellIndices() };
    }
  }
  if (expansion.phase >= 1) {
    // 확장 방향 보상은 activateExpansionSide에서만 주어지므로 마이그레이션이 직접 채운다.
    const chosen = EXPANSION_SIDES[expansion.firstChoice];
    if (chosen) unlocked.add(chosen.facility);
    if (expansion.phase >= 2) Object.values(EXPANSION_SIDES).forEach((side) => unlocked.add(side.facility));
    if (Array.isArray(grid) && grid.length === BOARD.INITIAL_CELLS) {
      grid = expandHexGrid(grid, BOARD.INITIAL_RADIUS, BOARD.EXPANDED_RADIUS);
    }
    boardRadius = Math.max(Number(boardRadius) || BOARD.INITIAL_RADIUS, BOARD.EXPANDED_RADIUS);
  }

  return {
    claimedQuestIds: [...claimed],
    unlockedFacilities: [...unlocked],
    expansion,
    grid,
    boardRadius,
    upgradePermitLevel,
  };
}

export function migrateV8ToV9(data) {
  const oldQuestIndex = Math.max(1, Math.min(15, Math.trunc(Number(data.questIndex) || 1)));
  const campaignComplete = Boolean(data.campaignComplete);
  const completedClimateEvents = [...(data.climateCampaign?.completedEventTypes || [])];
  const unfinishedFirstClimate = !campaignComplete
    && oldQuestIndex > 6
    && oldQuestIndex < 15
    && completedClimateEvents.length === 0;
  const questIndex = campaignComplete || oldQuestIndex >= 15
    ? CAMPAIGN_QUEST_INDEXES.FINAL_TEST
    : oldQuestIndex <= CAMPAIGN_QUEST_INDEXES.FOUNDATION_END
      ? oldQuestIndex
      : unfinishedFirstClimate
        ? CAMPAIGN_QUEST_INDEXES.PREPARATION_START
        : Math.min(CAMPAIGN_QUEST_INDEXES.CLIMATE_END, oldQuestIndex + 4);
  const resetClimate = unfinishedFirstClimate ? resetClimateStateForPreparation(data) : null;
  const progression = {
    ...(data.progression || {}),
    chapter: questIndex <= CAMPAIGN_QUEST_INDEXES.FOUNDATION_END
      ? data.progression?.chapter ?? 1
      : questIndex <= CAMPAIGN_QUEST_INDEXES.PREPARATION_END
        ? 2
        : questIndex <= CAMPAIGN_QUEST_INDEXES.CLIMATE_END ? 3 : 4,
    objectiveSetId: questIndex <= CAMPAIGN_QUEST_INDEXES.FOUNDATION_END
      ? data.progression?.objectiveSetId ?? null
      : null,
    objectiveProgress: questIndex <= CAMPAIGN_QUEST_INDEXES.FOUNDATION_END
      ? { ...(data.progression?.objectiveProgress || {}) }
      : {},
  };

  return {
    ...data,
    v: 9,
    questIndex,
    questStatus: unfinishedFirstClimate ? 'active' : data.questStatus || 'active',
    questProgress: unfinishedFirstClimate ? {} : { ...(data.questProgress || {}) },
    progression,
    ...grantSkippedPreparation(data, questIndex),
    ...(resetClimate || {}),
    ...(resetClimate ? {} : normalizeClimateCampaignForMigration(data, questIndex) || {}),
  };
}

// v9까지는 섬의 자연 조건(칸별 풍향·해안 조차)도, 시설의 방향도 없었다. 옛 도시는 새 환경을
// 받고 모든 시설이 그 시설의 기본 방향(태양광 남향, 나머지 북향)으로 서 있던 것으로 본다.
export function migrateV9ToV10(data) {
  return {
    ...data,
    v: 10,
    environment: createEnvironment(),
    grid: (data.grid || []).map((cell) => (cell
      ? { ...cell, rotation: normalizeRotation(cell.rotation, cell.type) }
      : null)),
  };
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
  if (migrated.v === 8) migrated = migrateV8ToV9(migrated);
  if (migrated.v === 9) migrated = migrateV9ToV10(migrated);
  if (migrated.v !== SAVE_VERSION) throw new Error(`Unsupported save version: ${migrated.v}`);
  return stripObsoleteState(migrated);
}

export function migrateV1Save(data) {
  return migrateSaveData(data);
}

export function clearSavedGame() {
  removeStorage(GAME.AUTOSAVE_KEY);
}
