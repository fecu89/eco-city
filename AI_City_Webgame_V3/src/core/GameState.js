import { GAME, SIMULATION, STAGES } from './Constants.js';

export const SAVE_VERSION = 2;

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
    this.gridSize = GAME.INITIAL_GRID_SIZE;
    this.grid = Array(GAME.INITIAL_GRID_SIZE * GAME.INITIAL_GRID_SIZE).fill(null); // {type, level}
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

    this.badges = new Set();

    this.sound = true;
    this.musicEnabled = false;

    this.advisorQuestions = 0;
    this.transcripts = { execution: [], redesign: [] };

    this.expandedCells = new Set();

    this.questIndex = 1;
    this.questStatus = 'active';
    this.questProgress = {};
    this.claimedQuestIds = new Set();
    this.unlockedFacilities = new Set(['residential']);
    this.upgradePermitLevel = 1;
    this.campaignComplete = false;
    this.simulationHour = SIMULATION.START_HOUR;
    this.simulationDay = 1;
    this.tickIndex = 0;
    this.lastTickSummary = null;
    this.climateAlert = 'normal';
    this.consecutiveEssentialOutageHours = 0;
    this.emergencySupportUsedQuestIds = new Set();
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

  logTranscript(bucket, question, answer) {
    const list = this.transcripts[bucket];
    if (!list) return;
    list.push({ q: question, a: answer, ts: Date.now() });
  }

  // --- persistence (see systems/SaveSystem.js for localStorage I/O) ---

  serialize() {
    return {
      v: SAVE_VERSION,
      stage: this.stage,
      credits: this.credits,
      turn: this.turn,
      selectedFacility: this.selectedFacility,
      gridSize: this.gridSize,
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
      badges: [...this.badges],
      sound: this.sound,
      musicEnabled: this.musicEnabled,
      advisorQuestions: this.advisorQuestions,
      transcripts: this.transcripts,
      questIndex: this.questIndex,
      questStatus: this.questStatus,
      questProgress: this.questProgress,
      claimedQuestIds: [...this.claimedQuestIds],
      unlockedFacilities: [...this.unlockedFacilities],
      upgradePermitLevel: this.upgradePermitLevel,
      campaignComplete: this.campaignComplete,
      simulationHour: this.simulationHour,
      simulationDay: this.simulationDay,
      tickIndex: this.tickIndex,
      lastTickSummary: this.lastTickSummary,
      climateAlert: this.climateAlert,
      consecutiveEssentialOutageHours: this.consecutiveEssentialOutageHours,
      emergencySupportUsedQuestIds: [...this.emergencySupportUsedQuestIds],
      simulationTotals: this.simulationTotals,
    };
  }

  hydrate(data) {
    if (!data || data.v !== SAVE_VERSION) return false;
    try {
      this.stage = data.stage ?? this.stage;
      this.credits = data.credits ?? this.credits;
      this.turn = data.turn ?? this.turn;
      this.selectedFacility = data.selectedFacility ?? this.selectedFacility;
      this.gridSize = data.gridSize ?? this.gridSize;
      this.grid = Array.isArray(data.grid) ? data.grid.map(normalizeCell) : this.grid;
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
      this.badges = new Set(data.badges || []);
      this.sound = data.sound ?? true;
      this.musicEnabled = !!data.musicEnabled;
      this.advisorQuestions = data.advisorQuestions ?? 0;
      this.transcripts = data.transcripts ?? { execution: [], redesign: [] };
      this.questIndex = data.questIndex ?? 1;
      this.questStatus = data.questStatus ?? 'active';
      this.questProgress = data.questProgress ?? {};
      this.claimedQuestIds = new Set(data.claimedQuestIds || []);
      this.unlockedFacilities = new Set(data.unlockedFacilities || ['residential']);
      this.upgradePermitLevel = data.upgradePermitLevel ?? 1;
      this.campaignComplete = !!data.campaignComplete;
      this.simulationHour = data.simulationHour ?? SIMULATION.START_HOUR;
      this.simulationDay = data.simulationDay ?? 1;
      this.tickIndex = data.tickIndex ?? 0;
      this.lastTickSummary = data.lastTickSummary ?? null;
      this.climateAlert = data.climateAlert ?? 'normal';
      this.consecutiveEssentialOutageHours = data.consecutiveEssentialOutageHours ?? 0;
      this.emergencySupportUsedQuestIds = new Set(data.emergencySupportUsedQuestIds || []);
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
