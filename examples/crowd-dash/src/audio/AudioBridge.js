// =============================================================================
// AudioBridge.js — Wires EventBus events to audio playback
// BGM via AudioManager (Strudel), SFX via Web Audio API (sfx.js).
// Handles mute toggle, M key shortcut, localStorage persistence.
// =============================================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { PLAYER } from '../core/Constants.js';
import { audioManager } from './AudioManager.js';
import { gameplayBGM, gameOverTheme } from './music.js';
import { heartPickupSfx, deathSfx, clickSfx, speedMilestoneSfx } from './sfx.js';

const PLAYER_FORWARD_SPEED = PLAYER.FORWARD_SPEED;

// Track whether audio init has been triggered (first user interaction)
let audioInitialized = false;

// Track the last speed milestone threshold crossed
let lastSpeedMilestone = 0;
const SPEED_MILESTONE_INTERVAL = 5; // every 5 units of speed increase

export function initAudio() {
  // ---- Restore mute preference from localStorage ----
  try {
    const saved = localStorage.getItem('crowd-dash-muted');
    if (saved === 'true') {
      gameState.isMuted = true;
    }
  } catch (e) { /* localStorage unavailable */ }

  // ---- Audio init (Strudel — must happen after user interaction) ----
  eventBus.on(Events.AUDIO_INIT, () => {
    if (audioInitialized) return;
    audioInitialized = true;
    audioManager.init();
    // Start gameplay BGM immediately since game auto-starts
    if (!gameState.isMuted) {
      audioManager.playMusic(gameplayBGM);
    }
  });

  // ---- BGM transitions (Strudel) ----
  eventBus.on(Events.MUSIC_GAMEPLAY, () => {
    audioManager.playMusic(gameplayBGM);
  });

  eventBus.on(Events.MUSIC_GAMEOVER, () => {
    audioManager.playMusic(gameOverTheme);
  });

  eventBus.on(Events.MUSIC_STOP, () => {
    audioManager.stopMusic();
  });

  // ---- SFX (Web Audio API — one-shot) ----

  // Heart collected
  eventBus.on(Events.HEART_COLLECTED, () => {
    heartPickupSfx();
  });

  // Player died — death SFX + stop BGM
  eventBus.on(Events.PLAYER_DIED, () => {
    deathSfx();
    // BGM stop is already emitted by Game.js via MUSIC_STOP
  });

  // Game over — play game over BGM after a brief pause
  eventBus.on(Events.GAME_OVER, () => {
    // Delay game over music to let the death SFX + silence land
    setTimeout(() => {
      if (gameState.gameOver) {
        eventBus.emit(Events.MUSIC_GAMEOVER);
      }
    }, 800);
  });

  // Game restart — restart gameplay BGM
  eventBus.on(Events.GAME_RESTART, () => {
    lastSpeedMilestone = 0;
    // GAME_START event from Game.js triggers MUSIC_GAMEPLAY
  });

  // Game start — start gameplay BGM
  eventBus.on(Events.GAME_START, () => {
    if (audioInitialized) {
      eventBus.emit(Events.MUSIC_GAMEPLAY);
    }
  });

  // Speed milestone SFX — fires when speed crosses thresholds
  eventBus.on(Events.SCORE_CHANGED, () => {
    const speedGain = gameState.speed - PLAYER_FORWARD_SPEED;
    const milestone = Math.floor(speedGain / SPEED_MILESTONE_INTERVAL);
    if (milestone > lastSpeedMilestone && milestone > 0) {
      lastSpeedMilestone = milestone;
      speedMilestoneSfx();
    }
  });

  // ---- Mute toggle ----
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    gameState.isMuted = !gameState.isMuted;

    // Persist preference
    try {
      localStorage.setItem('crowd-dash-muted', String(gameState.isMuted));
    } catch (e) { /* noop */ }

    if (gameState.isMuted) {
      audioManager.stopMusic();
    } else {
      // Resume appropriate BGM for current game state
      if (gameState.gameOver) {
        audioManager.playMusic(gameOverTheme);
      } else if (gameState.started) {
        audioManager.playMusic(gameplayBGM);
      }
    }
  });

  // ---- M key shortcut for mute toggle ----
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) {
      eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
    }
  });
}
