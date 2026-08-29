// =============================================================================
// EventBus.js — Singleton pub/sub for all module communication
// Events use domain:action naming. Modules never import each other directly.
// =============================================================================

export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_RESTART: 'game:restart',

  // Player
  PLAYER_MOVE: 'player:move',
  PLAYER_JUMP: 'player:jump',
  PLAYER_DIED: 'player:died',

  // Score
  SCORE_CHANGED: 'score:changed',

  // Crowd Dash specific
  HEART_COLLECTED: 'heart:collected',
  CROWD_SPAWNED: 'crowd:spawned',

  // Visual effects
  SCREEN_SHAKE: 'vfx:shake',
  FLASH: 'vfx:flash',
  DEATH_SLOWMO: 'vfx:death-slowmo',

  // Audio (used by /add-audio)
  AUDIO_INIT: 'audio:init',
  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',
  MUSIC_MENU: 'music:menu',
  MUSIC_GAMEPLAY: 'music:gameplay',
  MUSIC_GAMEOVER: 'music:gameover',
  MUSIC_STOP: 'music:stop',
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
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    return this;
  }

  emit(event, data) {
    if (!this.listeners[event]) return this;
    this.listeners[event].forEach(callback => {
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
