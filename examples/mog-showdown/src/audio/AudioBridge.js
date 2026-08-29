/**
 * AudioBridge -- Wires EventBus events to audio playback.
 * Listens for game events and triggers appropriate BGM/SFX.
 * All communication through EventBus -- no direct imports of game scenes.
 */

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { audioManager } from './AudioManager.js';
import { gameplayBGM, gameOverWinBGM, gameOverLoseBGM } from './music.js';
import {
  powerupCollectSfx,
  attackHitSfx,
  frameMogSfx,
  comboSfx,
  lifeLostSfx,
  gameOverSfx,
} from './sfx.js';

export function initAudioBridge() {
  // --- Init Strudel on first user interaction (browser autoplay policy) ---
  eventBus.on(Events.AUDIO_INIT, () => {
    audioManager.init();
  });

  // --- BGM transitions (Strudel) ---

  // Game starts -> gameplay music
  eventBus.on(Events.MUSIC_GAMEPLAY, () => {
    audioManager.playMusic(gameplayBGM);
  });

  // Game over -> appropriate theme based on score
  eventBus.on(Events.MUSIC_GAMEOVER, (data) => {
    const won = data?.won ?? (gameState.score > 20);
    if (won) {
      audioManager.playMusic(gameOverWinBGM);
    } else {
      audioManager.playMusic(gameOverLoseBGM);
    }
  });

  // Stop music
  eventBus.on(Events.MUSIC_STOP, () => {
    audioManager.stopMusic();
  });

  // --- SFX (Web Audio API -- direct one-shot calls) ---

  eventBus.on(Events.POWERUP_COLLECTED, () => {
    powerupCollectSfx();
  });

  eventBus.on(Events.ATTACK_HIT, () => {
    attackHitSfx();
  });

  eventBus.on(Events.MOG_FRAMEMOG, () => {
    frameMogSfx();
  });

  eventBus.on(Events.SPECTACLE_COMBO, () => {
    comboSfx();
  });

  eventBus.on(Events.LIFE_LOST, () => {
    lifeLostSfx();
  });

  // Game over: stop BGM, play game_over SFX, then start game-over BGM
  eventBus.on(Events.GAME_OVER, (data) => {
    audioManager.stopMusic();
    gameOverSfx();
    // Delay before starting game over theme to let SFX play
    setTimeout(() => {
      const won = data?.won ?? (gameState.score > 20);
      eventBus.emit(Events.MUSIC_GAMEOVER, { won });
    }, 800);
  });

  // Game restart: stop all, prepare for next game start
  eventBus.on(Events.GAME_RESTART, () => {
    audioManager.stopMusic();
  });

  // Game start: begin gameplay BGM
  eventBus.on(Events.GAME_START, () => {
    eventBus.emit(Events.MUSIC_GAMEPLAY);
  });

  // --- Mute toggle ---
  eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
    gameState.isMuted = !gameState.isMuted;
    try { localStorage.setItem('muted', gameState.isMuted); } catch (_) { /* noop */ }
    if (gameState.isMuted) {
      audioManager.muteStop();
    } else {
      // Unmuting -- resume music if we were playing
      audioManager.resumeMusic();
    }
  });
}
