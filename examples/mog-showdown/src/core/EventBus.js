export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_RESTART: 'game:restart',

  // Player
  PLAYER_MOVE: 'player:move',
  PLAYER_DAMAGED: 'player:damaged',
  PLAYER_DIED: 'player:died',

  // Lives
  LIFE_LOST: 'life:lost',

  // Score
  SCORE_CHANGED: 'score:changed',

  // Power-ups & attacks
  POWERUP_COLLECTED: 'powerup:collected',
  ATTACK_HIT: 'attack:hit',

  // Mog system
  MOG_LEVELUP: 'mog:levelup',
  MOG_FRAMEMOG: 'mog:framemog',

  // Androgenic
  ANDROGENIC_THROW: 'androgenic:throw',
  ANDROGENIC_WIG_EXPOSED: 'androgenic:wigexposed',

  // Combo
  COMBO_BREAK: 'combo:break',

  // Particles
  PARTICLES_EMIT: 'particles:emit',

  // Spectacle (visual effects hooks -- emit during gameplay, design pass attaches effects)
  SPECTACLE_ENTRANCE: 'spectacle:entrance',
  SPECTACLE_ACTION: 'spectacle:action',
  SPECTACLE_HIT: 'spectacle:hit',
  SPECTACLE_COMBO: 'spectacle:combo',
  SPECTACLE_STREAK: 'spectacle:streak',
  SPECTACLE_NEAR_MISS: 'spectacle:near_miss',

  // Audio (used by /add-audio)
  AUDIO_INIT: 'audio:init',
  MUSIC_MENU: 'music:menu',
  MUSIC_GAMEPLAY: 'music:gameplay',
  MUSIC_GAMEOVER: 'music:gameover',
  MUSIC_STOP: 'music:stop',
  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',
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
