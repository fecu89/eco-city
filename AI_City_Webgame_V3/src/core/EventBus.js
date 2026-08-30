export const Events = {
  // Game lifecycle
  GAME_RESET: 'game:reset',
  GAME_LOADED: 'game:loaded',
  SIMULATION_TICKED: 'simulation:ticked',
  SIMULATION_PAUSE_CHANGED: 'simulation:pauseChanged',
  QUEST_PROGRESSED: 'quest:progressed',
  QUEST_READY: 'quest:ready',
  QUEST_CLAIMED: 'quest:claimed',
  QUEST_STARTED: 'quest:started',
  FACILITY_PRIORITY_CHANGED: 'facility:priorityChanged',
  RESEARCH_START_REQUESTED: 'research:startRequested',
  RESEARCH_STARTED: 'research:started',
  RESEARCH_CANCEL_REQUESTED: 'research:cancelRequested',
  RESEARCH_CANCELLED: 'research:cancelled',
  RESEARCH_ASSIGN_REQUESTED: 'research:assignRequested',
  RESEARCH_ASSIGNED: 'research:assigned',
  RESEARCH_PROGRESS: 'research:progress',
  RESEARCH_COMPLETED: 'research:completed',
  RESEARCH_ACCELERATED: 'research:accelerated',
  CARBON_WARNING: 'carbon:warning',
  GAME_OVER: 'game:over',

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

  // Quiz / concepts
  QUIZ_ANSWERED: 'quiz:answered',
  QUIZ_FINISHED: 'quiz:finished',

  // Diagnosis
  DIAGNOSIS_TILE_FOUND: 'diagnosis:tileFound',
  DIAGNOSIS_COMPLETE: 'diagnosis:complete',

  // UI
  TOAST_SHOW: 'toast:show',
  HUD_PANEL_CHANGED: 'hud:panelChanged',
  THEME_CHANGED: 'theme:changed',
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
