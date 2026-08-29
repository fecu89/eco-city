export const Events = {
  // Game lifecycle
  GAME_RESET: 'game:reset',
  GAME_LOADED: 'game:loaded',
  STAGE_CHANGED: 'stage:changed',

  // Board
  BOARD_PLACED: 'board:placed',
  BOARD_UPGRADED: 'board:upgraded',
  BOARD_DEMOLISHED: 'board:demolished',
  BOARD_FACILITY_SELECTED: 'board:facilitySelected',
  BOARD_EXPANDED: 'board:expanded',

  // 3D camera / assets / visual motion
  CAMERA_CHANGED: 'camera:changed',
  CAMERA_RESET: 'camera:reset',
  ASSETS_READY: 'assets:ready',
  ASSETS_FAILED: 'assets:failed',
  VISUAL_MOTION_STARTED: 'visual:motionStarted',
  VISUAL_MOTION_COMPLETED: 'visual:motionCompleted',

  // Advisor
  ADVISOR_ASKED: 'advisor:asked',
  ADVISOR_BLIND_BUILD: 'advisor:blindBuild',

  // Quiz / concepts
  QUIZ_ANSWERED: 'quiz:answered',
  QUIZ_FINISHED: 'quiz:finished',
  REFLECTION_SAVED: 'reflection:saved',

  // Diagnosis
  DIAGNOSIS_TILE_FOUND: 'diagnosis:tileFound',
  DIAGNOSIS_COMPLETE: 'diagnosis:complete',

  // Redesign
  EVIDENCE_SAVED: 'evidence:saved',
  REDESIGN_VALIDATED: 'redesign:validated',

  // Report / bonus
  BONUS_ROUND_STARTED: 'report:bonusStarted',

  // Achievements
  BADGE_UNLOCKED: 'badge:unlocked',

  // UI
  TOAST_SHOW: 'toast:show',
  HUD_PANEL_CHANGED: 'hud:panelChanged',
  MODAL_OPEN: 'modal:open',
  MODAL_CLOSE: 'modal:close',

  // Audio
  AUDIO_INIT: 'audio:init',
  AUDIO_SFX: 'audio:sfx',
  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',

  // Save
  SAVE_REQUESTED: 'save:requested',
};

class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  off(event, callback) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    return this;
  }

  emit(event, data) {
    if (!this.listeners[event]) return this;
    this.listeners[event].forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error(`EventBus error in ${event}:`, err);
      }
    });
    return this;
  }

  removeAll() {
    this.listeners = {};
    return this;
  }
}

export const eventBus = new EventBus();
