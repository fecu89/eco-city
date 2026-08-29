import { GAME, STAGES } from './Constants.js';

export const SAVE_VERSION = 1;

class GameState {
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

    this.reflection = '';
    this.energyScaleSeen = false;

    this.diagnosisFound = new Set();
    this.diagnosisHintUsed = false;

    this.evidence = [];
    this.badges = new Set();

    this.sound = true;
    this.musicEnabled = false;

    this.advisorQuestions = 0;
    this.transcripts = { execution: [], redesign: [] };

    this.expandedCells = new Set();

    this.bonusRound = { active: false, creditMultiplier: 1 };
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
      reflection: this.reflection,
      energyScaleSeen: this.energyScaleSeen,
      diagnosisFound: [...this.diagnosisFound],
      diagnosisHintUsed: this.diagnosisHintUsed,
      evidence: this.evidence,
      badges: [...this.badges],
      sound: this.sound,
      musicEnabled: this.musicEnabled,
      advisorQuestions: this.advisorQuestions,
      transcripts: this.transcripts,
      bonusRound: this.bonusRound,
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
      this.grid = Array.isArray(data.grid) ? data.grid : this.grid;
      this.baseline = data.baseline ?? this.baseline;
      this.firstCitySnapshot = data.firstCitySnapshot ?? this.firstCitySnapshot;
      this.quizPool = data.quizPool ?? this.quizPool;
      this.quizIndex = data.quizIndex ?? 0;
      this.quizCorrect = data.quizCorrect ?? 0;
      this.reflection = data.reflection ?? '';
      this.energyScaleSeen = !!data.energyScaleSeen;
      this.diagnosisFound = new Set(data.diagnosisFound || []);
      this.diagnosisHintUsed = !!data.diagnosisHintUsed;
      this.evidence = data.evidence ?? [];
      this.badges = new Set(data.badges || []);
      this.sound = data.sound ?? true;
      this.musicEnabled = !!data.musicEnabled;
      this.advisorQuestions = data.advisorQuestions ?? 0;
      this.transcripts = data.transcripts ?? { execution: [], redesign: [] };
      this.bonusRound = data.bonusRound ?? { active: false, creditMultiplier: 1 };
      return true;
    } catch (err) {
      console.error('GameState.hydrate failed, starting fresh:', err);
      this.reset();
      return false;
    }
  }
}

export const gameState = new GameState();
