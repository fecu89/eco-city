// =============================================================================
// AudioBridge.js — Wires EventBus events to audio playback
// Listens for game events and triggers appropriate BGM/SFX.
// AudioContext is initialized on first user interaction (autoplay policy).
// All calls wrapped in try/catch — audio failures never break gameplay.
// =============================================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { audioManager } from './AudioManager.js';
import { gameplayBGM, gameOverBGM } from './music.js';
import {
  catchSfx,
  missSfx,
  flexSfx,
  powerupSfx,
  comboSfx,
  streakSfx,
  entranceSfx,
} from './sfx.js';

/**
 * Initialize the audio bridge. Call once from main.js.
 * Sets up all EventBus listeners for audio playback.
 */
export function initAudioBridge() {
  // --- AudioContext init on first user interaction ---
  let audioInitialized = false;

  function ensureAudioInit() {
    if (audioInitialized) return;
    audioInitialized = true;
    try {
      audioManager.init();
      // Restore mute state from localStorage
      try {
        const savedMute = localStorage.getItem('muted');
        if (savedMute === 'true') {
          gameState.isMuted = true;
          audioManager.setMuted(true);
        }
      } catch (_) {}
    } catch (e) {
      console.warn('[AudioBridge] Failed to init AudioContext:', e);
    }
  }

  // Init on any user interaction (click, tap, key)
  const interactionEvents = ['click', 'touchstart', 'keydown'];
  function handleFirstInteraction() {
    ensureAudioInit();
    // Remove listeners after first interaction
    interactionEvents.forEach(evt => {
      window.removeEventListener(evt, handleFirstInteraction, { capture: true });
    });
  }
  interactionEvents.forEach(evt => {
    window.addEventListener(evt, handleFirstInteraction, { capture: true, once: true });
  });

  // Also init on explicit AUDIO_INIT event
  eventBus.on(Events.AUDIO_INIT, () => ensureAudioInit());

  // --- BGM transitions ---

  // GAME_START ensures AudioContext is ready (MUSIC_GAMEPLAY handles actual BGM)
  eventBus.on(Events.GAME_START, () => {
    try { ensureAudioInit(); } catch (_) {}
  });

  eventBus.on(Events.MUSIC_GAMEPLAY, () => {
    try {
      ensureAudioInit();
      if (!gameState.isMuted) {
        audioManager.playMusic(gameplayBGM);
      }
    } catch (_) {}
  });

  eventBus.on(Events.GAME_OVER, () => {
    try {
      audioManager.stopMusic();
      if (!gameState.isMuted) {
        audioManager.playMusic(gameOverBGM);
      }
    } catch (_) {}
  });

  eventBus.on(Events.MUSIC_GAMEOVER, () => {
    try {
      if (!gameState.isMuted) {
        audioManager.playMusic(gameOverBGM);
      }
    } catch (_) {}
  });

  eventBus.on(Events.GAME_RESTART, () => {
    try {
      audioManager.stopMusic();
      // Gameplay BGM will start via GAME_START event from startGame()
    } catch (_) {}
  });

  eventBus.on(Events.MUSIC_STOP, () => {
    try {
      audioManager.stopMusic();
    } catch (_) {}
  });

  // --- SFX (one-shot) ---

  eventBus.on(Events.WEIGHT_CAUGHT, () => {
    try { catchSfx(); } catch (_) {}
  });

  eventBus.on(Events.WEIGHT_MISSED, () => {
    try { missSfx(); } catch (_) {}
  });

  eventBus.on(Events.PLAYER_FLEX, () => {
    try { flexSfx(); } catch (_) {}
  });

  eventBus.on(Events.POWERUP_COLLECTED, () => {
    try { powerupSfx(); } catch (_) {}
  });

  eventBus.on(Events.SPECTACLE_COMBO, (data) => {
    try {
      const combo = data?.combo || 1;
      comboSfx(combo);
    } catch (_) {}
  });

  eventBus.on(Events.SPECTACLE_STREAK, () => {
    try { streakSfx(); } catch (_) {}
  });

  eventBus.on(Events.SPECTACLE_ENTRANCE, () => {
    try { entranceSfx(); } catch (_) {}
  });

  // --- Mute toggle ---

  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    try {
      ensureAudioInit();
      gameState.isMuted = !gameState.isMuted;
      try { localStorage.setItem('muted', gameState.isMuted); } catch (_) {}
      audioManager.setMuted(gameState.isMuted);
      if (gameState.isMuted) {
        audioManager.stopMusic();
      } else {
        // Resume BGM if game is active
        if (gameState.started && !gameState.gameOver) {
          audioManager.playMusic(gameplayBGM);
        } else if (gameState.gameOver) {
          audioManager.playMusic(gameOverBGM);
        }
      }
    } catch (_) {}
  });
}
