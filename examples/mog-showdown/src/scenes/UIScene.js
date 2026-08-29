import Phaser from 'phaser';
import { GAME, PX } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { gameState } from '../core/GameState.js';

/**
 * UIScene -- Parallel overlay scene that runs on top of GameScene and GameOverScene.
 * Contains the mute button (visible in both scenes).
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    this._createMuteButton();

    // Listen for mute toggle to update icon
    this._onMuteToggle = () => {
      this._drawMuteIcon();
    };
    eventBus.on(Events.AUDIO_TOGGLE_MUTE, this._onMuteToggle);
  }

  _createMuteButton() {
    const ICON_SIZE = Math.max(16, Math.round(18 * PX));
    const MARGIN = Math.round(14 * PX);
    const x = GAME.WIDTH - MARGIN - ICON_SIZE;
    const y = GAME.HEIGHT - MARGIN - ICON_SIZE;

    // Hit zone -- semi-transparent circle, large enough for mobile touch (44px min)
    const hitRadius = Math.max(ICON_SIZE + 6, 22 * PX);
    this.muteBg = this.add.circle(x, y, hitRadius, 0x000000, 0.25)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);

    // Speaker icon drawn with Graphics API
    this.muteIcon = this.add.graphics().setDepth(101);
    this.muteIcon.setPosition(x, y);
    this._drawMuteIcon();

    // Click/tap toggles mute
    this.muteBg.on('pointerdown', () => {
      eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
    });

    // M key shortcut
    this.input.keyboard.on('keydown-M', () => {
      eventBus.emit(Events.AUDIO_TOGGLE_MUTE);
    });
  }

  _drawMuteIcon() {
    const gfx = this.muteIcon;
    const muted = gameState.isMuted;
    const s = Math.max(16, Math.round(18 * PX));

    gfx.clear();

    // Speaker body -- rectangle + triangle cone
    gfx.fillStyle(0xffffff, 0.7);
    gfx.fillRect(-s * 0.15, -s * 0.15, s * 0.15, s * 0.3);
    gfx.fillTriangle(-s * 0.15, -s * 0.3, -s * 0.15, s * 0.3, -s * 0.45, 0);

    if (!muted) {
      // Sound waves -- two arcs
      gfx.lineStyle(Math.max(1, 2 * PX), 0xffffff, 0.7);
      gfx.beginPath();
      gfx.arc(0, 0, s * 0.2, -Math.PI / 4, Math.PI / 4);
      gfx.strokePath();
      gfx.beginPath();
      gfx.arc(0, 0, s * 0.35, -Math.PI / 4, Math.PI / 4);
      gfx.strokePath();
    } else {
      // X mark over speaker
      gfx.lineStyle(Math.max(2, 3 * PX), 0xff4444, 0.9);
      gfx.lineBetween(s * 0.05, -s * 0.25, s * 0.35, s * 0.25);
      gfx.lineBetween(s * 0.05, s * 0.25, s * 0.35, -s * 0.25);
    }
  }

  shutdown() {
    if (this._onMuteToggle) {
      eventBus.off(Events.AUDIO_TOGGLE_MUTE, this._onMuteToggle);
    }
  }
}
