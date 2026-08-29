// =============================================================================
// Menu.js — Game over overlay. Shows score, best score, health info.
// Also shows in-game HUD (health hearts + score + combo).
// =============================================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { PLAYER, SAFE_ZONE } from '../core/Constants.js';

export class Menu {
  constructor() {
    // Game over overlay
    this.gameoverOverlay = document.getElementById('gameover-overlay');
    this.restartBtn = document.getElementById('restart-btn');
    this.finalScoreEl = document.getElementById('final-score');
    this.bestScoreEl = document.getElementById('best-score');

    // HUD elements (created dynamically)
    this._createHUD();

    // Restart button
    this.restartBtn.addEventListener('click', () => {
      this.gameoverOverlay.classList.add('hidden');
      eventBus.emit(Events.GAME_RESTART);
    });

    // Also allow Space/Enter to restart when game over overlay is visible
    window.addEventListener('keydown', (e) => {
      if (gameState.gameOver && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.gameoverOverlay.classList.add('hidden');
        eventBus.emit(Events.GAME_RESTART);
      }
    });

    // Listen for game events
    eventBus.on(Events.GAME_OVER, ({ score }) => this.showGameOver(score));
    eventBus.on(Events.HEALTH_CHANGED, ({ health }) => this.updateHealth(health));
    eventBus.on(Events.SCORE_CHANGED, ({ score }) => this.updateScore(score));
    eventBus.on(Events.COMBO_CHANGED, ({ combo }) => this.updateCombo(combo));
    eventBus.on(Events.GAME_RESTART, () => this.onRestart());
  }

  _createHUD() {
    // HUD container — positioned below safe zone
    this.hud = document.createElement('div');
    this.hud.id = 'game-hud';
    this.hud.style.cssText = `
      position: fixed;
      top: max(${SAFE_ZONE.TOP_PX + 8}px, calc(${SAFE_ZONE.TOP_PERCENT}vh + 8px));
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 0 16px;
      z-index: 10;
      pointer-events: none;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    `;

    // Health display (left side)
    this.healthEl = document.createElement('div');
    this.healthEl.style.cssText = `
      font-size: clamp(20px, 4vmin, 32px);
      color: #ff4444;
      text-shadow: 0 0 8px rgba(255,68,68,0.5);
      letter-spacing: 4px;
    `;
    this.hud.appendChild(this.healthEl);

    // Score + combo display (right side)
    const rightCol = document.createElement('div');
    rightCol.style.cssText = `
      text-align: right;
    `;

    this.scoreEl = document.createElement('div');
    this.scoreEl.style.cssText = `
      font-size: clamp(18px, 3.5vmin, 28px);
      color: #ffffff;
      font-weight: bold;
      text-shadow: 0 0 8px rgba(255,255,255,0.3);
    `;
    rightCol.appendChild(this.scoreEl);

    this.comboEl = document.createElement('div');
    this.comboEl.style.cssText = `
      font-size: clamp(14px, 2.5vmin, 22px);
      color: #ffcc00;
      font-weight: bold;
      text-shadow: 0 0 8px rgba(255,204,0,0.5);
      transition: transform 0.15s ease-out;
    `;
    rightCol.appendChild(this.comboEl);

    this.hud.appendChild(rightCol);
    document.body.appendChild(this.hud);

    // Initialize display
    this.updateHealth(PLAYER.HEALTH);
    this.updateScore(0);
    this.updateCombo(0);
  }

  updateHealth(health) {
    // Show hearts
    const full = health;
    const empty = PLAYER.HEALTH - health;
    let hearts = '';
    for (let i = 0; i < full; i++) hearts += '\u2764'; // Red heart
    for (let i = 0; i < empty; i++) hearts += '\u2661'; // Empty heart
    this.healthEl.textContent = hearts;
  }

  updateScore(score) {
    this.scoreEl.textContent = `Score: ${score}`;
  }

  updateCombo(combo) {
    if (combo >= 2) {
      this.comboEl.textContent = `${combo}x Combo!`;
      // Pulse animation
      this.comboEl.style.transform = 'scale(1.3)';
      setTimeout(() => {
        this.comboEl.style.transform = 'scale(1)';
      }, 150);
    } else {
      this.comboEl.textContent = '';
    }
  }

  showGameOver(score) {
    this.finalScoreEl.textContent = `Score: ${score}`;
    this.bestScoreEl.textContent = `Best: ${gameState.bestScore}`;
    this.gameoverOverlay.classList.remove('hidden');

    // Hide HUD during game over
    this.hud.style.display = 'none';
  }

  onRestart() {
    this.gameoverOverlay.classList.add('hidden');
    this.hud.style.display = 'flex';
    this.updateHealth(PLAYER.HEALTH);
    this.updateScore(0);
    this.updateCombo(0);
  }
}
