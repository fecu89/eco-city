// src/playfun.js — Play.fun (OpenGameProtocol) integration
import { eventBus, Events } from './core/EventBus.js';

const GAME_ID = 'af712990-8369-4a7a-a3b5-0c0f968d5002';
let sdk = null;
let initialized = false;

export async function initPlayFun() {
  const SDKClass = typeof PlayFunSDK !== 'undefined' ? PlayFunSDK
    : typeof OpenGameSDK !== 'undefined' ? OpenGameSDK : null;
  if (!SDKClass) {
    console.warn('Play.fun SDK not loaded');
    return;
  }

  try {
    sdk = new SDKClass({ gameId: GAME_ID, ui: { usePointsWidget: true } });
    await sdk.init();
    initialized = true;
    console.log('[Play.fun] SDK initialized');
  } catch (err) {
    console.warn('[Play.fun] SDK init failed:', err);
    return;
  }

  // addPoints() — buffer points locally during gameplay (non-blocking)
  eventBus.on(Events.SCORE_CHANGED, ({ earned }) => {
    if (initialized && earned > 0) {
      try { sdk.addPoints(earned); } catch {}
    }
  });

  // savePoints() — ONLY at game over (opens blocking modal)
  eventBus.on(Events.GAME_OVER, () => {
    if (initialized) {
      try { sdk.savePoints(); } catch {}
    }
  });

  // Save on page unload
  window.addEventListener('beforeunload', () => {
    if (initialized) {
      try { sdk.savePoints(); } catch {}
    }
  });
}
