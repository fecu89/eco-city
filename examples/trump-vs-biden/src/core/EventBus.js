// =============================================================================
// EventBus.js — Singleton pub/sub for all inter-module communication.
// Modules never import each other directly. Events use domain:action naming.
// =============================================================================

export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_RESTART: 'game:restart',

  // Player actions
  PLAYER_THROW: 'player:throw',
  PLAYER_HIT: 'player:hit',         // Player got hit by opponent projectile
  PLAYER_MOVE: 'player:move',

  // Opponent actions
  OPPONENT_THROW: 'opponent:throw',
  OPPONENT_HIT: 'opponent:hit',      // Opponent got hit by player projectile

  // Health / scoring
  HEALTH_CHANGED: 'health:changed',
  SCORE_CHANGED: 'score:changed',
  COMBO_CHANGED: 'combo:changed',

  // Spectacle events (used by visual polish step)
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
