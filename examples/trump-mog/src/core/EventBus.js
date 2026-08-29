export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_RESTART: 'game:restart',

  // Mog actions
  MOG_ATTEMPT: 'mog:attempt',
  MOG_PERFECT: 'mog:perfect',
  MOG_GOOD: 'mog:good',
  MOG_MISS: 'mog:miss',
  MOG_METER_FULL: 'mog:meter_full',

  // Score
  SCORE_CHANGED: 'score:changed',

  // Particles
  PARTICLES_EMIT: 'particles:emit',

  // Expressions
  EXPRESSION_CHANGE: 'expression:change',
  EXPRESSION_RESET: 'expression:reset',

  // Audio
  AUDIO_INIT: 'audio:init',
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
