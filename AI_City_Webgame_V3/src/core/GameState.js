import { BOARD, FACILITIES, GAME, STAGES, STORAGE_LEVELS, TIME } from './Constants.js';
import { CAMPAIGN_QUEST_INDEXES } from './CampaignProgression.js';
import { roundCredits } from './Money.js';
import { normalizeConstructionProject } from './ConstructionProject.js';
import { createEnvironment, normalizeEnvironment, normalizeRotation } from './Environment.js';

export const SAVE_VERSION = 10;

const initialCellIndices = () => Array.from({ length: BOARD.INITIAL_CELLS }, (_, index) => index);

function progressionDefaults() {
  return {
    chapter: 1,
    tutorialQuestIndex: 1,
    tutorialQuestStatus: 'active',
    tutorialProgress: {},
    objectiveSetId: null,
    objectiveProgress: {},
    completedObjectiveSetIds: [],
  };
}

function expansionDefaults() {
  return { phase: 0, firstChoice: null, activeCellIndices: initialCellIndices() };
}

function eventDefaults() {
  return {
    seed: GAME.EVENT_SEED,
    schedule: [],
    activeId: null,
    completed: [],
    forecastAcknowledgedIds: [],
    currentMetrics: null,
    lastResult: null,
  };
}

function climateCampaignDefaults() {
  return {
    status: 'locked',
    eventType: null,
    attempt: 0,
    scheduledEventId: null,
    progress: {},
    lastResult: null,
    completedEventTypes: [],
  };
}

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.stage = STAGES.EXECUTION;
    this.credits = GAME.INITIAL_CREDITS;
    this.turn = 0;
    this.selectedFacility = 'residential';
    this.selectedCell = null;
    this.boardRadius = BOARD.INITIAL_RADIUS;
    this.grid = Array(BOARD.INITIAL_CELLS).fill(null); // {type, level, rotation}
    this.constructionPlan = []; // 저장하지 않는 임시 건설안: { index, type, rotation }
    // 이 판의 자연 조건(칸별 풍향·해안 조차). 새 게임마다 새 씨앗으로 다시 뽑고 저장에 남는다.
    this.environment = createEnvironment();
    this.metrics = null;
    this.baseline = null;
    this.firstCitySnapshot = null;

    this.quizPool = []; // sampled QUIZ_BANK subset for this playthrough
    this.quizIndex = 0;
    this.quizCorrect = 0;
    this.quizAnswered = false;
    this.quizKind = null;
    this.quizResearchId = null;
    this.quizPassThreshold = 0;
    this.quizAttempts = {};
    this.quizResults = {};

    this.sound = true;
    this.musicEnabled = true;

    this.expandedCells = new Set();

    this.questIndex = 1;
    this.questStatus = 'active';
    this.questProgress = {};
    this.claimedQuestIds = new Set();
    this.unlockedFacilities = new Set(['residential']);
    this.upgradePermitLevel = 1;
    this.campaignComplete = false;
    this.elapsedGameDays = 0;
    this.timeScale = TIME.DEFAULT_SCALE;
    this.lastSettlementDelta = 0;
    this.tickIndex = 0;
    this.lastTickSummary = null;
    this.climateAlert = 'normal';
    this.consecutiveEssentialOutageDays = 0;
    this.emergencySupportUsedQuestIds = new Set();
    this.progression = progressionDefaults();
    this.expansion = expansionDefaults();
    this.events = eventDefaults();
    this.climateCampaign = climateCampaignDefaults();
    this.stressTest = { status: 'locked', phaseIndex: 0, phaseDay: 0, result: null, metrics: null, attempts: 0, waterBaseline: null };
    this.operationalRisk = { negativeCreditDays: 0, essentialBlackoutDays: 0, warningIds: [] };
    this.emergencySupport = { used: false, economyScorePenalty: 0 };
    this.decisionCounts = {
      priorityChanges: 0,
      researchPauses: 0,
      emergencySupport: 0,
      batteryPolicyChanges: 0,
    };
    this.onboardingVersionSeen = 0;
    this.tutorialStep = 'build-button';
    this.tutorialComplete = false;
    this.researchMenuUnlocked = false;
    this.research = {
      jobs: {},
      completedIds: new Set(),
      techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0, green: 1 },
      quizCreditQuestionIds: {},
    };
    this.carbonCrisisDays = 0;
    this.workforceRebalanceGraceDays = 0;
    this.carbonWarningMilestones = new Set();
    this.gameOver = false;
    this.gameOverReason = null;
    this.simulationTotals = {
      days: 0,
      netCredits: 0,
      transmissionEfficiency: 0,
      lowCarbonPercent: 0,
      employmentRate: 0,
      industryFill: 0,
      essentialOutageDays: 0,
      overcrowding: 0,
      health: 0,
      deliveredEnergy: 0,
      renewableDeliveredEnergy: 0,
      nuclearDeliveredEnergy: 0,
      batteryEnergyUsed: 0,
      grossIncome: 0,
      factoryIncome: 0,
      peakDemand: 0,
      peakAvailableSupply: 0,
    };
  }

  get isEditable() {
    return this.stage === STAGES.EXECUTION || this.stage === STAGES.REDESIGN;
  }

  // --- persistence (see systems/SaveSystem.js for localStorage I/O) ---

  serialize() {
    return {
      v: SAVE_VERSION,
      stage: this.stage,
      credits: this.credits,
      turn: this.turn,
      selectedFacility: this.selectedFacility,
      selectedCell: this.selectedCell,
      boardRadius: this.boardRadius,
      grid: this.grid,
      environment: structuredClone(this.environment),
      baseline: this.baseline,
      firstCitySnapshot: this.firstCitySnapshot,
      quizPool: this.quizPool,
      quizIndex: this.quizIndex,
      quizCorrect: this.quizCorrect,
      quizKind: this.quizKind,
      quizResearchId: this.quizResearchId,
      quizPassThreshold: this.quizPassThreshold,
      quizAttempts: this.quizAttempts,
      quizResults: this.quizResults,
      sound: this.sound,
      musicEnabled: this.musicEnabled,
      questIndex: this.questIndex,
      questStatus: this.questStatus,
      questProgress: this.questProgress,
      claimedQuestIds: [...this.claimedQuestIds],
      unlockedFacilities: [...this.unlockedFacilities],
      upgradePermitLevel: this.upgradePermitLevel,
      campaignComplete: this.campaignComplete,
      elapsedGameDays: this.elapsedGameDays,
      timeScale: this.timeScale,
      lastSettlementDelta: this.lastSettlementDelta,
      tickIndex: this.tickIndex,
      lastTickSummary: this.lastTickSummary,
      climateAlert: this.climateAlert,
      consecutiveEssentialOutageDays: this.consecutiveEssentialOutageDays,
      emergencySupportUsedQuestIds: [...this.emergencySupportUsedQuestIds],
      progression: structuredClone(this.progression),
      expansion: structuredClone(this.expansion),
      events: structuredClone(this.events),
      climateCampaign: structuredClone(this.climateCampaign),
      stressTest: structuredClone(this.stressTest),
      operationalRisk: structuredClone(this.operationalRisk),
      emergencySupport: structuredClone(this.emergencySupport),
      decisionCounts: structuredClone(this.decisionCounts),
      onboardingVersionSeen: this.onboardingVersionSeen,
      tutorialStep: this.tutorialStep,
      tutorialComplete: this.tutorialComplete,
      researchMenuUnlocked: this.researchMenuUnlocked,
      research: {
        jobs: Object.fromEntries(Object.entries(this.research.jobs).map(([id, job]) => [id, { ...job }])),
        completedIds: [...this.research.completedIds],
        techLevels: { ...this.research.techLevels },
        quizCreditQuestionIds: structuredClone(this.research.quizCreditQuestionIds || {}),
      },
      carbonCrisisDays: this.carbonCrisisDays,
      workforceRebalanceGraceDays: this.workforceRebalanceGraceDays,
      carbonWarningMilestones: [...this.carbonWarningMilestones],
      gameOver: this.gameOver,
      gameOverReason: this.gameOverReason,
      simulationTotals: this.simulationTotals,
    };
  }

  hydrate(data) {
    if (!data || data.v !== SAVE_VERSION) return false;
    try {
      this.stage = data.stage ?? this.stage;
      this.credits = roundCredits(data.credits ?? this.credits);
      this.turn = data.turn ?? this.turn;
      this.selectedFacility = data.selectedFacility ?? this.selectedFacility;
      this.selectedCell = data.selectedCell ?? null;
      this.boardRadius = data.boardRadius ?? this.boardRadius;
      this.grid = Array.isArray(data.grid) ? data.grid.map(normalizeCell) : this.grid;
      // 환경이 없거나 형태가 깨진 저장은 새 환경으로 시작한다 — 풍향·조차가 없으면
      // 발전 계산이 통째로 무너지기 때문이다.
      this.environment = normalizeEnvironment(data.environment) || createEnvironment();
      this.constructionPlan = [];
      this.baseline = data.baseline ?? this.baseline;
      this.firstCitySnapshot = data.firstCitySnapshot ?? this.firstCitySnapshot;
      this.quizPool = data.quizPool ?? this.quizPool;
      this.quizIndex = data.quizIndex ?? 0;
      this.quizCorrect = data.quizCorrect ?? 0;
      this.quizKind = data.quizKind ?? null;
      this.quizResearchId = data.quizResearchId ?? null;
      this.quizPassThreshold = data.quizPassThreshold ?? 0;
      this.quizAttempts = data.quizAttempts ?? {};
      this.quizResults = data.quizResults ?? {};
      this.sound = data.sound ?? true;
      this.musicEnabled = data.musicEnabled ?? this.musicEnabled;
      this.questIndex = data.questIndex ?? 1;
      if (this.questIndex === 6 && this.stage === STAGES.DIAGNOSIS) this.stage = STAGES.REDESIGN;
      // 최종시험은 재설계 단계다. 19단계를 REPORT로 기록한 옛 저장은 보드가 얼어붙으므로 되돌린다.
      if (this.questIndex === CAMPAIGN_QUEST_INDEXES.FINAL_TEST
        && !data.campaignComplete
        && this.stage === STAGES.REPORT) {
        this.stage = STAGES.REDESIGN;
      }
      this.questStatus = data.questStatus ?? 'active';
      this.questProgress = data.questProgress ?? {};
      this.claimedQuestIds = new Set(data.claimedQuestIds || []);
      this.unlockedFacilities = new Set(data.unlockedFacilities || ['residential']);
      this.upgradePermitLevel = data.upgradePermitLevel ?? 1;
      this.campaignComplete = !!data.campaignComplete;
      this.elapsedGameDays = data.elapsedGameDays ?? 0;
      this.timeScale = TIME.ALLOWED_SCALES.includes(Number(data.timeScale))
        ? Number(data.timeScale)
        : TIME.DEFAULT_SCALE;
      this.lastSettlementDelta = data.lastSettlementDelta ?? 0;
      this.tickIndex = data.tickIndex ?? 0;
      this.lastTickSummary = data.lastTickSummary ?? null;
      this.climateAlert = data.climateAlert ?? 'normal';
      this.consecutiveEssentialOutageDays = data.consecutiveEssentialOutageDays ?? 0;
      this.emergencySupportUsedQuestIds = new Set(data.emergencySupportUsedQuestIds || []);
      this.progression = {
        ...progressionDefaults(),
        ...(data.progression || {}),
        tutorialProgress: { ...(data.progression?.tutorialProgress || {}) },
        objectiveProgress: { ...(data.progression?.objectiveProgress || {}) },
        completedObjectiveSetIds: [...(data.progression?.completedObjectiveSetIds || [])],
      };
      this.expansion = {
        ...expansionDefaults(),
        ...(data.expansion || {}),
        activeCellIndices: [...(data.expansion?.activeCellIndices || initialCellIndices())],
      };
      this.events = {
        ...eventDefaults(),
        ...(data.events || {}),
        schedule: [...(data.events?.schedule || [])],
        completed: [...(data.events?.completed || [])],
        forecastAcknowledgedIds: [...(data.events?.forecastAcknowledgedIds || [])],
      };
      this.climateCampaign = {
        ...climateCampaignDefaults(),
        ...(data.climateCampaign || {}),
        progress: { ...(data.climateCampaign?.progress || {}) },
        completedEventTypes: [...(data.climateCampaign?.completedEventTypes || [])],
      };
      this.stressTest = {
        status: 'locked', phaseIndex: 0, phaseDay: 0, result: null, metrics: null, attempts: 0,
        waterBaseline: null,
        ...(data.stressTest || {}),
      };
      this.operationalRisk = {
        negativeCreditDays: 0, essentialBlackoutDays: 0, warningIds: [],
        ...(data.operationalRisk || {}),
        warningIds: [...(data.operationalRisk?.warningIds || [])],
      };
      this.emergencySupport = {
        used: false, economyScorePenalty: 0,
        ...(data.emergencySupport || {}),
      };
      this.decisionCounts = {
        priorityChanges: 0,
        researchPauses: 0,
        emergencySupport: 0,
        batteryPolicyChanges: 0,
        ...(data.decisionCounts || {}),
      };
      this.onboardingVersionSeen = data.onboardingVersionSeen ?? 0;
      this.tutorialStep = data.tutorialStep ?? 'build-button';
      this.tutorialComplete = !!data.tutorialComplete;
      this.researchMenuUnlocked = !!data.researchMenuUnlocked;
      this.research = {
        jobs: Object.fromEntries(Object.entries(data.research?.jobs || {}).map(([id, job]) => [id, { ...job }])),
        completedIds: new Set(data.research?.completedIds || []),
        techLevels: {
          solar: data.research?.techLevels?.solar ?? 1,
          wind: data.research?.techLevels?.wind ?? 1,
          battery: data.research?.techLevels?.battery ?? 1,
          tidal: data.research?.techLevels?.tidal ?? 0,
          green: data.research?.techLevels?.green ?? 1,
        },
        quizCreditQuestionIds: structuredClone(data.research?.quizCreditQuestionIds || {}),
      };
      this.carbonCrisisDays = Math.max(0, Number(data.carbonCrisisDays) || 0);
      this.workforceRebalanceGraceDays = Math.max(0, Number(data.workforceRebalanceGraceDays) || 0);
      this.carbonWarningMilestones = new Set(data.carbonWarningMilestones || []);
      this.gameOver = !!data.gameOver;
      this.gameOverReason = data.gameOverReason ?? null;
      this.simulationTotals = { ...this.simulationTotals, ...(data.simulationTotals || {}) };
      return true;
    } catch (err) {
      console.error('GameState.hydrate failed, starting fresh:', err);
      this.reset();
      return false;
    }
  }
}

export function normalizeCell(cell) {
  if (!cell) return null;
  if (!FACILITIES[cell.type]) return null;
  const maxLevel = FACILITIES[cell.type]?.maxLevel || 3;
  let level = Math.max(1, Math.min(maxLevel, Math.trunc(Number(cell.level) || 1)));
  const normalizedProject = normalizeConstructionProject({ ...cell, level }, cell.project);
  if (!normalizedProject.valid && normalizedProject.kind === 'build') return null;
  if (normalizedProject.valid && normalizedProject.complete && normalizedProject.project?.kind === 'upgrade') {
    level = normalizedProject.project.toLevel;
  }
  let batteryStoredLowCarbon = Math.max(0, Number(cell.batteryStoredLowCarbon) || 0);
  let batteryStoredFossil = Math.max(0, Number(cell.batteryStoredFossil) || 0);
  if (cell.type === 'battery') {
    const capacity = (STORAGE_LEVELS[level]?.capacity || 0) * 1.3;
    const total = batteryStoredLowCarbon + batteryStoredFossil;
    if (total > capacity && total > 0) {
      const scale = capacity / total;
      batteryStoredLowCarbon = Math.round(batteryStoredLowCarbon * scale * 100) / 100;
      batteryStoredFossil = Math.round((capacity - batteryStoredLowCarbon) * 100) / 100;
    }
  }
  // 칸이 가질 수 있는 필드를 여기서 전부 다시 만든다. 예전 저장본에만 있던 필드는
  // 이 목록에 없으므로 자연스럽게 사라진다.
  return {
    type: cell.type,
    level,
    rotation: normalizeRotation(cell.rotation, cell.type),
    priority: cell.priority || (['residential', 'cooling'].includes(cell.type) ? 'essential' : 'normal'),
    project: normalizedProject.valid && !normalizedProject.complete ? normalizedProject.project : null,
    ...(cell.type === 'battery' ? { batteryPolicy: cell.batteryPolicy || 'auto' } : {}),
    batteryStoredLowCarbon,
    batteryStoredFossil,
  };
}

export const gameState = new GameState();
