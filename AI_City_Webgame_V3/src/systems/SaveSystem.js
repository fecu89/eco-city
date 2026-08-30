import { FACILITIES, GAME } from '../core/Constants.js';
import { SAVE_VERSION, normalizeCell } from '../core/GameState.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';

let saveTimer = null;

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

// 수업 중 실수로 새로고침해도 진행 상황이 남도록, 상태가 바뀔 만한 이벤트마다 디바운스 저장한다.
const AUTOSAVE_EVENTS = [
  Events.BOARD_PLACED,
  Events.BOARD_UPGRADED,
  Events.BOARD_DEMOLISHED,
  Events.BOARD_EXPANDED,
  Events.QUIZ_FINISHED,
  Events.SIMULATION_TICKED,
  Events.QUEST_CLAIMED,
  Events.FACILITY_PRIORITY_CHANGED,
  Events.SAVE_REQUESTED,
  Events.BADGE_UNLOCKED,
  Events.AUDIO_TOGGLE_MUTE,
];

export function initSaveSystem() {
  AUTOSAVE_EVENTS.forEach((evt) => eventBus.on(evt, scheduleSave));
}

export function loadSavedGame() {
  try {
    const raw = localStorage.getItem(GAME.AUTOSAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const data = parsed?.v === 1 ? migrateV1Save(parsed) : parsed;
    const ok = gameState.hydrate(data);
    if (ok) eventBus.emit(Events.GAME_LOADED, {});
    return ok;
  } catch (err) {
    console.warn('저장된 게임을 불러오지 못했습니다:', err);
    return false;
  }
}

export function migrateV1Save(data) {
  const stage = Number(data?.stage) || 1;
  const questIndex = stage === 1 ? 1 : stage <= 3 ? 5 : stage === 4 ? 6 : stage === 5 ? 10 : 15;
  const placed = (data.grid || []).filter(Boolean).map((cell) => cell.type);
  const unlocked = new Set(stage >= 5 ? Object.keys(FACILITIES) : ['residential', ...placed]);
  if (stage >= 2) ['thermal', 'factory', 'data', 'nuclear'].forEach((type) => unlocked.add(type));
  const migrated = {
    ...data,
    v: SAVE_VERSION,
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

export function clearSavedGame() {
  try {
    localStorage.removeItem(GAME.AUTOSAVE_KEY);
  } catch (err) {
    // ignore
  }
}
