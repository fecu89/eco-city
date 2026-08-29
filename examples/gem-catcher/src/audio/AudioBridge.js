import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { audioManager } from './AudioManager.js';
import { gameplayBGM, gameOverTheme } from './music.js';
import { gemCatchSfx, skullHitSfx, lifeLostSfx, difficultyUpSfx, clickSfx } from './sfx.js';

export function initAudioBridge() {
  // Init Strudel on first user interaction (browser autoplay policy)
  eventBus.on(Events.AUDIO_INIT, () => audioManager.init());

  // BGM transitions (Strudel)
  // No menu music -- game boots directly into gameplay
  eventBus.on(Events.MUSIC_GAMEPLAY, () => audioManager.playMusic(gameplayBGM));
  eventBus.on(Events.MUSIC_GAMEOVER, () => audioManager.playMusic(gameOverTheme));
  eventBus.on(Events.MUSIC_STOP, () => audioManager.stopMusic());

  // SFX (Web Audio API -- direct one-shot calls)
  eventBus.on(Events.GEM_CAUGHT, () => gemCatchSfx());
  eventBus.on(Events.SKULL_CAUGHT, () => skullHitSfx());
  eventBus.on(Events.LIFE_LOST, () => lifeLostSfx());
  eventBus.on(Events.DIFFICULTY_UP, () => difficultyUpSfx());

  // Mute toggle
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    gameState.isMuted = !gameState.isMuted;
    // Persist preference
    try { localStorage.setItem('gem-catcher-muted', gameState.isMuted ? '1' : '0'); } catch (e) { /* noop */ }
    if (gameState.isMuted) {
      audioManager.stopMusic();
    }
  });

  // Restore mute preference from localStorage
  try {
    const saved = localStorage.getItem('gem-catcher-muted');
    if (saved === '1') {
      gameState.isMuted = true;
    }
  } catch (e) { /* noop */ }
}
