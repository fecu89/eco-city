import { BOARD, GAME, STAGES, TIME } from './Constants.js';
import { roundCredits } from './Money.js';

export const SAVE_VERSION = 5;

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
    this.grid = Array(BOARD.INITIAL_CELLS).fill(null); // {type, level}
    this.constructionPlan = []; // 저장하지 않는 임시 건설안: { index, type }
    this.metrics = null;
    this.baseline = null;
    this.firstCitySnapshot = null;

    this.quizPool = []; // sampled QUIZ_BANK subset for this playthrough
    this.quizIndex = 0;
    this.quizCorrect = 0;
    this.quizAnswered = false;
    this.quizKind = null;
    this.quizPassThreshold = 0;
    this.quizAttempts = {};
    this.quizResults = {};

    this.diagnosisFound = new Set();
    this.diagnosisHintUsed = false;
    this.diagnosisScannerActive = true;

    this.sound = true;
    this.musicEnabled = false;

    this.expandedCells = new Set();

    this.questIndex = 1;
    this.questStatus = 'active';
    this.questProgress = {};
    this.claimedQuestIds = new Set();
    this.unlockedFacilities = new Set(['residential']);
    this.upgradePermitLevel = 1;
    this.campaignComplete = false;
    this.elapsedGameHours = 0;
    this.timeScale = TIME.DEFAULT_SCALE;
    this.lastSettlementDelta = 0;
    this.tickIndex = 0;
    this.lastTickSummary = null;
    this.climateAlert = 'normal';
    this.consecutiveEssentialOutageHours = 0;
    this.emergencySupportUsedQuestIds = new Set();
    this.onboardingVersionSeen = 0;
    this.tutorialStep = 'build-button';
    this.tutorialComplete = false;
    this.researchMenuUnlocked = false;
    this.research = {
      jobs: {},
      completedIds: new Set(),
      techLevels: { solar: 1, wind: 1, battery: 1, tidal: 0 },
      quizAccelerationBankHours: 0,
    };
    this.carbonCrisisHours = 0;
    this.carbonWarningMilestones = new Set();
    this.gameOver = false;
    this.gameOverReason = null;
    this.simulationTotals = {
      hours: 0,
      netCredits: 0,
      transmissionEfficiency: 0,
      lowCarbonPercent: 0,
      employmentRate: 0,
      industryFill: 0,
      essentialOutageHours: 0,
      overcrowding: 0,
      health: 0,
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
      baseline: this.baseline,
      firstCitySnapshot: this.firstCitySnapshot,
      quizPool: this.quizPool,
      quizIndex: this.quizIndex,
      quizCorrect: this.quizCorrect,
      quizKind: this.quizKind,
      quizPassThreshold: this.quizPassThreshold,
      quizAttempts: this.quizAttempts,
      quizResults: this.quizResults,
      diagnosisFound: [...this.diagnosisFound],
      diagnosisHintUsed: this.diagnosisHintUsed,
      diagnosisScannerActive: this.diagnosisScannerActive,
      sound: this.sound,
      musicEnabled: this.musicEnabled,
      questIndex: this.questIndex,
      questStatus: this.questStatus,
      questProgress: this.questProgress,
      claimedQuestIds: [...this.claimedQuestIds],
      unlockedFacilities: [...this.unlockedFacilities],
      upgradePermitLevel: this.upgradePermitLevel,
      campaignComplete: this.campaignComplete,
      elapsedGameHours: this.elapsedGameHours,
      timeScale: this.timeScale,
      lastSettlementDelta: this.lastSettlementDelta,
      tickIndex: this.tickIndex,
      lastTickSummary: this.lastTickSummary,
      climateAlert: this.climateAlert,
      consecutiveEssentialOutageHours: this.consecutiveEssentialOutageHours,
      emergencySupportUsedQuestIds: [...this.emergencySupportUsedQuestIds],
      onboardingVersionSeen: this.onboardingVersionSeen,
      tutorialStep: this.tutorialStep,
      tutorialComplete: this.tutorialComplete,
      researchMenuUnlocked: this.researchMenuUnlocked,
      research: {
        jobs: Object.fromEntries(Object.entries(this.research.jobs).map(([id, job]) => [id, { ...job }])),
        completedIds: [...this.research.completedIds],
        techLevels: { ...this.research.techLevels },
        quizAccelerationBankHours: this.research.quizAccelerationBankHours,
      },
      carbonCrisisHours: this.carbonCrisisHours,
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
      this.constructionPlan = [];
      this.baseline = data.baseline ?? this.baseline;
      this.firstCitySnapshot = data.firstCitySnapshot ?? this.firstCitySnapshot;
      this.quizPool = data.quizPool ?? this.quizPool;
      this.quizIndex = data.quizIndex ?? 0;
      this.quizCorrect = data.quizCorrect ?? 0;
      this.quizKind = data.quizKind ?? null;
      this.quizPassThreshold = data.quizPassThreshold ?? 0;
      this.quizAttempts = data.quizAttempts ?? {};
      this.quizResults = data.quizResults ?? {};
      this.diagnosisFound = new Set(data.diagnosisFound || []);
      this.diagnosisHintUsed = !!data.diagnosisHintUsed;
      this.diagnosisScannerActive = data.diagnosisScannerActive ?? true;
      this.sound = data.sound ?? true;
      this.musicEnabled = !!data.musicEnabled;
      this.questIndex = data.questIndex ?? 1;
      if (this.questIndex === 6 && this.stage === STAGES.DIAGNOSIS) this.stage = STAGES.REDESIGN;
      this.questStatus = data.questStatus ?? 'active';
      this.questProgress = data.questProgress ?? {};
      this.claimedQuestIds = new Set(data.claimedQuestIds || []);
      this.unlockedFacilities = new Set(data.unlockedFacilities || ['residential']);
      this.upgradePermitLevel = data.upgradePermitLevel ?? 1;
      this.campaignComplete = !!data.campaignComplete;
      this.elapsedGameHours = data.elapsedGameHours ?? 0;
      this.timeScale = data.timeScale ?? TIME.DEFAULT_SCALE;
      this.lastSettlementDelta = data.lastSettlementDelta ?? 0;
      this.tickIndex = data.tickIndex ?? 0;
      this.lastTickSummary = data.lastTickSummary ?? null;
      this.climateAlert = data.climateAlert ?? 'normal';
      this.consecutiveEssentialOutageHours = data.consecutiveEssentialOutageHours ?? 0;
      this.emergencySupportUsedQuestIds = new Set(data.emergencySupportUsedQuestIds || []);
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
        },
        quizAccelerationBankHours: Math.max(0, Number(data.research?.quizAccelerationBankHours) || 0),
      };
      this.carbonCrisisHours = Math.max(0, Number(data.carbonCrisisHours) || 0);
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
  return {
    ...cell,
    priority: cell.priority || (['residential', 'cooling'].includes(cell.type) ? 'essential' : 'normal'),
    batteryStoredLowCarbon: Number(cell.batteryStoredLowCarbon) || 0,
    batteryStoredFossil: Number(cell.batteryStoredFossil) || 0,
  };
}

export const gameState = new GameState();
