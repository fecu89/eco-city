export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_RESTART: 'game:restart',

  // Player
  PLAYER_LANE_CHANGE: 'player:laneChange',
  PLAYER_JUMP: 'player:jump',
  PLAYER_SLIDE: 'player:slide',
  PLAYER_DIED: 'player:died',

  // Score
  SCORE_CHANGED: 'score:changed',

  // Collectibles
  COLLECTIBLE_PICKED: 'collectible:picked',

  // Speed
  SPEED_CHANGED: 'speed:changed',

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
