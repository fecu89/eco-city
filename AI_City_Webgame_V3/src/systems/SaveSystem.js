import { GAME } from '../core/Constants.js';
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
  Events.STAGE_CHANGED,
  Events.QUIZ_FINISHED,
  Events.REFLECTION_SAVED,
  Events.EVIDENCE_SAVED,
  Events.REDESIGN_VALIDATED,
  Events.BADGE_UNLOCKED,
  Events.AUDIO_TOGGLE_MUTE,
  Events.BONUS_ROUND_STARTED,
];

export function initSaveSystem() {
  AUTOSAVE_EVENTS.forEach((evt) => eventBus.on(evt, scheduleSave));
}

export function loadSavedGame() {
  try {
    const raw = localStorage.getItem(GAME.AUTOSAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const ok = gameState.hydrate(data);
    if (ok) eventBus.emit(Events.GAME_LOADED, {});
    return ok;
  } catch (err) {
    console.warn('저장된 게임을 불러오지 못했습니다:', err);
    return false;
  }
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(GAME.AUTOSAVE_KEY);
  } catch (err) {
    // ignore
  }
}
