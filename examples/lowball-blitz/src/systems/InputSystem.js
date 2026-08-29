// =============================================================================
// InputSystem.js -- Keyboard + touch input for auto-runner
//
// WASD / Arrow keys for left/right lane movement.
// Space for throwing envelopes.
// Virtual joystick for mobile movement, dedicated throw button for mobile throw.
// =============================================================================

const HAS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export class InputSystem {
  constructor() {
    this.keys = {};
    this._throwJustPressed = false;
    this._throwConsumed = false;
    this._gameActive = false;

    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.code === 'Space' && !this._throwConsumed) {
        this._throwJustPressed = true;
        this._throwConsumed = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') {
        this._throwConsumed = false;
      }
    });

    // Touch / joystick state
    this._touchLeft = false;
    this._touchRight = false;

    // Joystick tracking
    this._joystickTouchId = null;
    this._joystickCenterX = 0;
    this._joystickCenterY = 0;
    this._joystickDeltaX = 0;

    if (HAS_TOUCH) {
      this._setupJoystick();
      this._setupThrowButton();
    }
  }

  _setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const thumb = document.getElementById('joystick-thumb');
    if (!zone || !thumb) return;

    // Show joystick + throw button on touch devices
    zone.style.display = 'flex';
    const throwBtn = document.getElementById('throw-btn');
    if (throwBtn) throwBtn.style.display = 'flex';
    const hints = document.getElementById('mobile-hints');
    if (hints) hints.style.display = 'block';

    const baseRadius = zone.offsetWidth / 2;
    const maxDelta = baseRadius * 0.6; // max thumb travel as fraction of base radius

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this._joystickTouchId !== null) return; // already tracking a finger

      const touch = e.changedTouches[0];
      this._joystickTouchId = touch.identifier;

      // Use the center of the joystick zone as reference
      const rect = zone.getBoundingClientRect();
      this._joystickCenterX = rect.left + rect.width / 2;
      this._joystickCenterY = rect.top + rect.height / 2;

      this._updateJoystick(touch.clientX, touch.clientY, thumb, maxDelta);
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (touch.identifier === this._joystickTouchId) {
          this._updateJoystick(touch.clientX, touch.clientY, thumb, maxDelta);
          break;
        }
      }
    }, { passive: false });

    const endHandler = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this._joystickTouchId) {
          this._joystickTouchId = null;
          this._joystickDeltaX = 0;
          this._touchLeft = false;
          this._touchRight = false;
          // Reset thumb to center
          thumb.style.transform = 'translate(-50%, -50%)';
          break;
        }
      }
    };

    zone.addEventListener('touchend', endHandler, { passive: true });
    zone.addEventListener('touchcancel', endHandler, { passive: true });
  }

  _updateJoystick(touchX, touchY, thumbEl, maxDelta) {
    const dx = touchX - this._joystickCenterX;
    // Clamp delta
    const clampedDx = Math.max(-maxDelta, Math.min(maxDelta, dx));
    this._joystickDeltaX = clampedDx / maxDelta; // -1 to 1

    // Move thumb visually
    const thumbPx = clampedDx;
    const dy = touchY - this._joystickCenterY;
    const clampedDy = Math.max(-maxDelta, Math.min(maxDelta, dy));
    thumbEl.style.transform = `translate(calc(-50% + ${thumbPx}px), calc(-50% + ${clampedDy}px))`;

    // Map to left/right with a dead zone
    const deadZone = 0.2;
    this._touchLeft = this._joystickDeltaX < -deadZone;
    this._touchRight = this._joystickDeltaX > deadZone;
  }

  _setupThrowButton() {
    const btn = document.getElementById('throw-btn');
    if (!btn) return;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._gameActive) {
        this._throwJustPressed = true;
      }
    }, { passive: false });
  }

  isDown(code) { return !!this.keys[code]; }

  setGameActive(active) {
    this._gameActive = active;
  }

  update() {
    // throwPressed is consumed once per frame via the getter
  }

  /** Consume the throw input -- returns true only once per press */
  get throwPressed() {
    if (this._throwJustPressed) {
      this._throwJustPressed = false;
      return true;
    }
    return false;
  }

  get forward() { return false; } // no forward control in auto-runner
  get backward() { return false; } // no backward control in auto-runner
  get left() {
    return this.isDown('KeyA') || this.isDown('ArrowLeft') || this._touchLeft;
  }
  get right() {
    return this.isDown('KeyD') || this.isDown('ArrowRight') || this._touchRight;
  }
  get shift() { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }
  get jump() { return this.isDown('Space'); }

  get moveX() { return (this.right ? 1 : 0) - (this.left ? 1 : 0); }
  get moveZ() { return 0; }
}
