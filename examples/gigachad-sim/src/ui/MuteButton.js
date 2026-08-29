// =============================================================================
// MuteButton.js — Mute toggle button (HTML/Canvas-based)
// Positioned bottom-right above Play.fun safe zone.
// Speaker icon drawn on a <canvas> element — no external assets.
// M key shortcut for keyboard toggle.
// =============================================================================

import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';
import { SAFE_ZONE } from '../core/Constants.js';

export class MuteButton {
  constructor() {
    this._iconSize = 18;
    this._buttonSize = 40;
    this._margin = 16;

    this._createButton();
    this._setupKeyboard();
    this._drawIcon();

    // Re-draw when mute state changes externally
    eventBus.on(Events.AUDIO_TOGGLE_MUTE, () => {
      // Defer to next tick so gameState.isMuted is already toggled
      requestAnimationFrame(() => this._drawIcon());
    });
  }

  _createButton() {
    // Container button
    this.container = document.createElement('div');
    this.container.id = 'mute-button';
    this.container.style.cssText = `
      position: fixed;
      bottom: max(${SAFE_ZONE.TOP_PX + this._margin}px, calc(${SAFE_ZONE.TOP_PERCENT}vh + ${this._margin}px));
      right: ${this._margin}px;
      width: ${this._buttonSize}px;
      height: ${this._buttonSize}px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.2);
      cursor: pointer;
      z-index: 25;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
      transition: background 0.2s;
    `;

    // Canvas for speaker icon
    this.canvas = document.createElement('canvas');
    this.canvas.width = this._iconSize * 2;
    this.canvas.height = this._iconSize * 2;
    this.canvas.style.cssText = `
      width: ${this._iconSize}px;
      height: ${this._iconSize}px;
      pointer-events: none;
    `;
    this.container.appendChild(this.canvas);

    // Hover effect
    this.container.addEventListener('mouseenter', () => {
      this.container.style.background = 'rgba(0, 0, 0, 0.6)';
    });
    this.container.addEventListener('mouseleave', () => {
      this.container.style.background = 'rgba(0, 0, 0, 0.4)';
    });

    // Click handler
    this.container.addEventListener('click', (e) => {
      e.stopPropagation();
      eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
    });

    // Touch handler (prevent double-fire on mobile)
    this.container.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
    }, { passive: false });

    document.body.appendChild(this.container);
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat) {
        eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
      }
    });
  }

  _drawIcon() {
    const ctx = this.canvas.getContext('2d');
    const s = this._iconSize * 2; // canvas is 2x for retina
    const cx = s / 2;
    const cy = s / 2;
    const unit = s * 0.2;

    ctx.clearRect(0, 0, s, s);
    ctx.save();

    // Speaker body — rectangle + triangle
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Speaker cone (left-pointing trapezoid)
    const bodyLeft = cx - unit * 1.6;
    const bodyRight = cx - unit * 0.3;
    const bodyTop = cy - unit * 0.5;
    const bodyBottom = cy + unit * 0.5;

    // Rectangular part
    ctx.fillRect(bodyRight - unit * 0.4, bodyTop, unit * 0.4, unit * 1.0);

    // Triangle cone
    ctx.beginPath();
    ctx.moveTo(bodyRight - unit * 0.4, bodyTop);
    ctx.lineTo(bodyLeft, cy - unit * 1.1);
    ctx.lineTo(bodyLeft, cy + unit * 1.1);
    ctx.lineTo(bodyRight - unit * 0.4, bodyBottom);
    ctx.closePath();
    ctx.fill();

    if (!gameState.isMuted) {
      // Sound waves — two arcs on the right side
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      // Small wave
      ctx.beginPath();
      ctx.arc(cx + unit * 0.1, cy, unit * 0.8, -Math.PI / 3.5, Math.PI / 3.5);
      ctx.stroke();

      // Large wave
      ctx.beginPath();
      ctx.arc(cx + unit * 0.1, cy, unit * 1.4, -Math.PI / 3.5, Math.PI / 3.5);
      ctx.stroke();
    } else {
      // X mark for muted
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2.5;

      const xCenter = cx + unit * 0.5;
      const xSize = unit * 0.9;

      ctx.beginPath();
      ctx.moveTo(xCenter - xSize, cy - xSize);
      ctx.lineTo(xCenter + xSize, cy + xSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(xCenter - xSize, cy + xSize);
      ctx.lineTo(xCenter + xSize, cy - xSize);
      ctx.stroke();
    }

    ctx.restore();
  }
}
