// =============================================================================
// CameraEffects.js — Camera juice for Crowd Dash
//
// Three effects layered on top of the base camera position:
//   1. Screen shake on collision/death (decaying random offset)
//   2. Lateral sway (camera tilts slightly when player dodges)
//   3. Speed-based FOV widening (rush feeling at high speed)
//
// Also handles:
//   4. Collection flash (brief ambient light intensity bump)
//   5. Speed-based fog color shift (environment gets warmer/more intense)
//   6. Death slow-motion (brief time slowdown before game over overlay)
//
// All tunables from Constants.CAMERA_FX and Constants.VFX.
// Wired via EventBus events.
// =============================================================================

import * as THREE from 'three';
import { CAMERA_FX, VFX, PLAYER, DIFFICULTY } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

export class CameraEffects {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;

    // ---- Shake state ----
    this._shakeTime = 0;
    this._shakeDuration = 0;
    this._shakeIntensity = 0;
    this._shakeOffset = new THREE.Vector3();

    // ---- Sway state ----
    this._currentSway = 0; // smoothed sway angle (radians)

    // ---- FOV state ----
    this._currentFOV = CAMERA_FX.FOV_BASE;

    // ---- Flash state ----
    this._flashTime = 0;
    this._flashActive = false;
    this._ambientLight = null; // will be set externally

    // ---- Fog color shift ----
    this._baseFogColor = new THREE.Color(VFX.SPEED_FOG_COLOR_SLOW);
    this._fastFogColor = new THREE.Color(VFX.SPEED_FOG_COLOR_FAST);

    // ---- Death slow-mo ----
    this._slowmoActive = false;
    this._slowmoTime = 0;
    this._slowmoCallback = null;

    // ---- Wire events ----
    eventBus.on(Events.PLAYER_DIED, (data) => this._onDeath(data));
    eventBus.on(Events.HEART_COLLECTED, () => this._onHeartCollected());
    eventBus.on(Events.SCREEN_SHAKE, (data) => this.triggerShake(data));
    eventBus.on(Events.FLASH, () => this._onHeartCollected());
  }

  /**
   * Set a reference to the scene's ambient light so flash can modify it.
   */
  setAmbientLight(light) {
    this._ambientLight = light;
    this._baseAmbientIntensity = light.intensity;
  }

  // ---- Public update (called every frame) ----

  update(delta, moveX, speed) {
    this._updateShake(delta);
    this._updateSway(delta, moveX);
    this._updateFOV(delta, speed);
    this._updateFlash(delta);
    this._updateFogColor(speed);
    this._updateSlowmo(delta);
  }

  /**
   * Returns the shake offset to be added to camera position.
   */
  getShakeOffset() {
    return this._shakeOffset;
  }

  /**
   * Returns the current time scale (1.0 normally, < 1.0 during slow-mo).
   * Game.js multiplies delta by this value.
   */
  getTimeScale() {
    if (this._slowmoActive) {
      return VFX.DEATH_SLOWMO_FACTOR;
    }
    return 1.0;
  }

  // ---- Screen Shake ----

  triggerShake(data) {
    const intensity = (data && data.intensity) || CAMERA_FX.SHAKE_INTENSITY;
    const duration = (data && data.duration) || CAMERA_FX.SHAKE_DURATION;
    this._shakeIntensity = intensity;
    this._shakeDuration = duration;
    this._shakeTime = 0;
  }

  _updateShake(delta) {
    if (this._shakeTime >= this._shakeDuration) {
      this._shakeOffset.set(0, 0, 0);
      return;
    }

    this._shakeTime += delta;
    const t = this._shakeTime / this._shakeDuration;
    const decay = Math.exp(-CAMERA_FX.SHAKE_DECAY * t);
    const intensity = this._shakeIntensity * decay;

    this._shakeOffset.set(
      (Math.random() - 0.5) * 2 * intensity,
      (Math.random() - 0.5) * 2 * intensity * 0.6,
      (Math.random() - 0.5) * 2 * intensity * 0.3,
    );
  }

  // ---- Lateral Sway ----

  _updateSway(delta, moveX) {
    const targetSway = -moveX * CAMERA_FX.SWAY_FACTOR;
    this._currentSway += (targetSway - this._currentSway) * Math.min(1, CAMERA_FX.SWAY_SMOOTHING * delta);
    this.camera.rotation.z = this._currentSway;
  }

  // ---- Speed-based FOV ----

  _updateFOV(delta, speed) {
    // Map speed from PLAYER.FORWARD_SPEED..DIFFICULTY.MAX_SPEED to FOV_BASE..FOV_MAX
    const speedNorm = Math.max(0, Math.min(1,
      (speed - PLAYER.FORWARD_SPEED) / (DIFFICULTY.MAX_SPEED - PLAYER.FORWARD_SPEED)
    ));
    const targetFOV = CAMERA_FX.FOV_BASE + speedNorm * (CAMERA_FX.FOV_MAX - CAMERA_FX.FOV_BASE);

    this._currentFOV += (targetFOV - this._currentFOV) * Math.min(1, CAMERA_FX.FOV_SMOOTHING * delta);
    this.camera.fov = this._currentFOV;
    this.camera.updateProjectionMatrix();
  }

  // ---- Collection Flash ----

  _onHeartCollected() {
    this._flashActive = true;
    this._flashTime = 0;
  }

  _updateFlash(delta) {
    if (!this._flashActive || !this._ambientLight) return;

    this._flashTime += delta;
    if (this._flashTime >= VFX.FLASH_DURATION) {
      this._flashActive = false;
      this._ambientLight.intensity = this._baseAmbientIntensity;
      return;
    }

    // Quick bright then fade
    const t = this._flashTime / VFX.FLASH_DURATION;
    const flashCurve = 1.0 - t; // linear fade out from peak
    this._ambientLight.intensity = this._baseAmbientIntensity + VFX.FLASH_INTENSITY * flashCurve;
  }

  // ---- Fog Color Shift ----

  _updateFogColor(speed) {
    if (!this.scene.fog) return;

    const speedNorm = Math.max(0, Math.min(1,
      (speed - PLAYER.FORWARD_SPEED) / (DIFFICULTY.MAX_SPEED - PLAYER.FORWARD_SPEED)
    ));

    this.scene.fog.color.copy(this._baseFogColor).lerp(this._fastFogColor, speedNorm);
    this.scene.background.copy(this.scene.fog.color);
  }

  // ---- Death Slow-Motion ----

  _onDeath() {
    this.triggerShake({
      intensity: CAMERA_FX.SHAKE_INTENSITY * 1.5,
      duration: CAMERA_FX.SHAKE_DURATION * 1.5,
    });
    this._slowmoActive = true;
    this._slowmoTime = 0;
  }

  _updateSlowmo(delta) {
    if (!this._slowmoActive) return;

    // Use real delta (not slowed) for the slow-mo timer
    this._slowmoTime += delta;

    if (this._slowmoTime >= VFX.DEATH_SLOWMO_DURATION) {
      this._slowmoActive = false;
    }
  }

  // ---- Cleanup ----

  destroy() {
    // nothing to dispose, just event listeners (EventBus.removeAll handles those)
  }
}
