// =============================================================================
// EventBus.js — Singleton pub/sub for all module communication
// All inter-module communication goes through here. domain:action naming.
// =============================================================================

export const Events = {
  // Game lifecycle
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_RESTART: 'game:restart',

  // Round
  ROUND_WON: 'round:won',
  ROUND_RESET: 'round:reset',

  // Combat — player
  PLAYER_PUNCH_LEFT: 'player:punchLeft',
  PLAYER_PUNCH_RIGHT: 'player:punchRight',
  PLAYER_BLOCK_START: 'player:blockStart',
  PLAYER_BLOCK_END: 'player:blockEnd',

  // Combat — opponent (AI)
  OPPONENT_PUNCH_LEFT: 'opponent:punchLeft',
  OPPONENT_PUNCH_RIGHT: 'opponent:punchRight',
  OPPONENT_BLOCK_START: 'opponent:blockStart',
  OPPONENT_BLOCK_END: 'opponent:blockEnd',

  // Hit results
  HIT_PLAYER: 'hit:player',       // { damage, blocked }
  HIT_OPPONENT: 'hit:opponent',    // { damage, blocked }

  // Head pop (knockout)
  HEAD_POP_PLAYER: 'headPop:player',
  HEAD_POP_OPPONENT: 'headPop:opponent',

  // Score
  SCORE_CHANGED: 'score:changed',

  // Spectacle events (for visual effects / promo)
  SPECTACLE_ENTRANCE: 'spectacle:entrance',
  SPECTACLE_ACTION: 'spectacle:action',
  SPECTACLE_HIT: 'spectacle:hit',
  SPECTACLE_COMBO: 'spectacle:combo',

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
