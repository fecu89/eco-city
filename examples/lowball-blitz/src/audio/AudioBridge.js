import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { audioManager } from './AudioManager.js';
import { gameplayBGM, gameOverTheme } from './music.js';
import { throwSfx, hitSfx, comboSfx, damageSfx, collectSfx, nearMissSfx } from './sfx.js';

export function initAudioBridge() {
  // Init Strudel on first user interaction (browser autoplay policy)
  eventBus.on(Events.AUDIO_INIT, () => audioManager.init());

  // --- BGM transitions (Strudel) ---
  eventBus.on(Events.GAME_START, () => audioManager.playMusic(gameplayBGM));
  eventBus.on(Events.GAME_RESTART, () => audioManager.playMusic(gameplayBGM));
  eventBus.on(Events.GAME_OVER, () => audioManager.playMusic(gameOverTheme));
  eventBus.on(Events.MUSIC_GAMEPLAY, () => audioManager.playMusic(gameplayBGM));
  eventBus.on(Events.MUSIC_GAMEOVER, () => audioManager.playMusic(gameOverTheme));
  eventBus.on(Events.MUSIC_STOP, () => audioManager.stopMusic());

  // --- SFX (Web Audio API -- direct one-shot calls) ---
  eventBus.on(Events.ENVELOPE_THROWN, () => throwSfx());
  eventBus.on(Events.HOUSE_HIT, () => hitSfx());
  eventBus.on(Events.COMBO_CHANGED, (data) => {
    if (data && data.combo >= 3) {
      comboSfx(data.combo);
    }
  });
  eventBus.on(Events.PLAYER_HIT, () => damageSfx());
  eventBus.on(Events.PANIC_COLLECTED, () => collectSfx());
  eventBus.on(Events.SPECTACLE_NEAR_MISS, () => nearMissSfx());

  // --- Mute toggle ---
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    gameState.isMuted = !gameState.isMuted;
    try { localStorage.setItem('lowball-blitz-muted', gameState.isMuted); } catch (_) { /* noop */ }
    if (gameState.isMuted) {
      audioManager.stopMusic();
    } else if (gameState.started && !gameState.gameOver) {
      // Resume gameplay music when unmuting during active gameplay
      audioManager.playMusic(gameplayBGM);
    }
    // Update mute button icon
    _updateMuteButton();
  });
}

/** Update the mute button UI (called from AudioBridge to keep audio concerns together) */
function _updateMuteButton() {
  const btn = document.getElementById('mute-btn');
  if (btn) {
    btn.textContent = gameState.isMuted ? '\u{1F507}' : '\u{1F50A}';
    btn.setAttribute('aria-label', gameState.isMuted ? 'Unmute audio' : 'Mute audio');
  }
}
