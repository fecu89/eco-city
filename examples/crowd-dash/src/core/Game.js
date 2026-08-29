// =============================================================================
// Game.js — Orchestrator for Crowd Dash
// Initializes Three.js renderer, scene, camera, all systems.
// Update loop: move player, spawn/recycle crowd, spawn hearts, check collisions.
// Difficulty scales over time.
// =============================================================================

import * as THREE from 'three';
import { GAME, CAMERA, COLORS, WORLD, PLAYER, CROWD, HEART, DIFFICULTY, VFX } from './Constants.js';
import { eventBus, Events } from './EventBus.js';
import { gameState } from './GameState.js';
import { InputSystem } from '../systems/InputSystem.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { CameraEffects } from '../systems/CameraEffects.js';
import { Player } from '../gameplay/Player.js';
import { CrowdPool } from '../gameplay/CrowdPerson.js';
import { HeartPool } from '../gameplay/Heart.js';
import { LevelBuilder } from '../level/LevelBuilder.js';
import { Menu } from '../ui/Menu.js';

export class Game {
  constructor() {
    this.clock = new THREE.Clock();

    // Renderer (DPR capped for mobile GPU performance)
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GAME.MAX_DPR));
    this.renderer.setClearColor(COLORS.SKY);
    document.body.prepend(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      GAME.FOV,
      window.innerWidth / window.innerHeight,
      GAME.NEAR,
      GAME.FAR
    );
    this.camera.position.set(CAMERA.OFFSET_X, CAMERA.OFFSET_Y, CAMERA.OFFSET_Z);
    this.camera.lookAt(0, CAMERA.LOOK_OFFSET_Y, -CAMERA.LOOK_AHEAD);

    // Systems
    this.input = new InputSystem();
    this.level = new LevelBuilder(this.scene);
    this.menu = new Menu();

    // Visual effect systems
    this.particles = new ParticleSystem(this.scene);
    this.cameraFx = new CameraEffects(this.camera, this.scene);

    // Give CameraEffects a reference to the ambient light for flash effect
    if (this.level.ambientLight) {
      this.cameraFx.setAmbientLight(this.level.ambientLight);
    }

    // Entity pools
    this.crowdPool = new CrowdPool(this.scene, CROWD.POOL_SIZE);
    this.heartPool = new HeartPool(this.scene, HEART.POOL_SIZE);

    // Player
    this.player = null;

    // Spawn timers
    this._crowdSpawnTimer = 0;
    this._heartSpawnTimer = 0;
    this._playTime = 0;
    this._lastScore = 0;

    // Death slow-mo state
    this._deathPending = false;
    this._deathTimer = 0;

    // Events
    eventBus.on(Events.GAME_RESTART, () => this.restart());

    // Audio: emit AUDIO_INIT on first user interaction (browser autoplay policy)
    this._audioInitDone = false;
    const initAudioOnce = () => {
      if (this._audioInitDone) return;
      this._audioInitDone = true;
      eventBus.emit(Events.AUDIO_INIT);
      window.removeEventListener('click', initAudioOnce);
      window.removeEventListener('touchstart', initAudioOnce);
      window.removeEventListener('keydown', initAudioOnce);
    };
    window.addEventListener('click', initAudioOnce);
    window.addEventListener('touchstart', initAudioOnce);
    window.addEventListener('keydown', initAudioOnce);

    // Resize
    window.addEventListener('resize', () => this.onResize());

    // Auto-start game (no title screen -- Play.fun handles the chrome)
    this.startGame();

    // Start render loop (official Three.js pattern -- pauses when tab hidden)
    this.renderer.setAnimationLoop(() => this.animate());
  }

  startGame() {
    gameState.reset();
    gameState.started = true;

    this.player = new Player(this.scene);
    this.input.setGameActive(true);

    // Reset timers
    this._crowdSpawnTimer = 0;
    this._heartSpawnTimer = 0;
    this._playTime = 0;
    this._lastScore = 0;

    eventBus.emit(Events.GAME_START);
  }

  restart() {
    // Clean up old entities
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    this.crowdPool.deactivateAll();
    this.heartPool.deactivateAll();

    // Clean up visual systems
    this.particles.destroy();
    this.cameraFx.destroy();

    // Rebuild level around origin
    this.level.destroy();
    this.level = new LevelBuilder(this.scene);

    // Recreate visual systems
    this.particles = new ParticleSystem(this.scene);
    this.cameraFx = new CameraEffects(this.camera, this.scene);
    if (this.level.ambientLight) {
      this.cameraFx.setAmbientLight(this.level.ambientLight);
    }

    // Reset death state
    this._deathPending = false;
    this._deathTimer = 0;

    this.startGame();
  }

  animate() {
    const rawDelta = Math.min(this.clock.getDelta(), GAME.MAX_DELTA);

    // Apply time scale from camera effects (slow-mo during death)
    const timeScale = this.cameraFx.getTimeScale();
    const delta = rawDelta * timeScale;

    this.input.update();

    // Handle death slow-mo pending state
    if (this._deathPending) {
      this._deathTimer += rawDelta;
      // Update camera effects and particles during slow-mo
      this.cameraFx.update(rawDelta, 0, gameState.speed);
      if (this.player) {
        this.particles.update(rawDelta, this.player.mesh.position, gameState.speed);
      }
      if (this._deathTimer >= VFX.DEATH_SLOWMO_DURATION) {
        this._deathPending = false;
        // Now actually trigger game over
        gameState.gameOver = true;
        this.input.setGameActive(false);
        eventBus.emit(Events.GAME_OVER, { score: gameState.score });
        eventBus.emit(Events.MUSIC_STOP);
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (gameState.started && !gameState.gameOver && this.player) {
      this._playTime += delta;

      // Update difficulty: speed increases over time
      gameState.speed = Math.min(
        PLAYER.FORWARD_SPEED + this._playTime * DIFFICULTY.SPEED_INCREASE_RATE,
        DIFFICULTY.MAX_SPEED
      );

      // Update player (auto-run + lateral input)
      this.player.update(delta, this.input, gameState.speed);

      // Update distance and score
      const playerZ = this.player.mesh.position.z;
      gameState.distance = Math.abs(playerZ);
      const distScore = Math.floor(gameState.distance * DIFFICULTY.DISTANCE_SCORE_RATE);
      if (distScore > this._lastScore) {
        gameState.score = distScore + gameState.heartsCollected * HEART.POINTS;
        this._lastScore = distScore;
        if (gameState.score > gameState.bestScore) {
          gameState.bestScore = gameState.score;
        }
        eventBus.emit(Events.SCORE_CHANGED, { score: gameState.score });
      }

      // Spawn crowd
      this._updateCrowdSpawning(delta, playerZ);

      // Spawn hearts
      this._updateHeartSpawning(delta, playerZ);

      // Update hearts (bob + rotate)
      this.heartPool.updateAll(delta);

      // Recycle entities behind player
      this.crowdPool.recycleBehind(playerZ, CROWD.DESPAWN_DISTANCE);
      this.heartPool.recycleBehind(playerZ, HEART.DESPAWN_DISTANCE);

      // Check collisions
      this._checkCollisions(playerZ);

      // Check heart collection
      this._checkHeartCollection();

      // Update level (scroll road, lights, neon pulse)
      this.level.update(playerZ, delta);

      // Update particle system
      this.particles.update(delta, this.player.mesh.position, gameState.speed);

      // Update camera effects (sway, FOV, shake, flash, fog color)
      this.cameraFx.update(delta, this.input.moveX, gameState.speed);

      // Update camera to follow player + apply effects
      const p = this.player.mesh.position;
      const shake = this.cameraFx.getShakeOffset();
      this.camera.position.set(
        p.x * 0.5 + CAMERA.OFFSET_X + shake.x,
        CAMERA.OFFSET_Y + shake.y,
        p.z + CAMERA.OFFSET_Z + shake.z
      );
      this.camera.lookAt(
        p.x * 0.3,
        CAMERA.LOOK_OFFSET_Y,
        p.z - CAMERA.LOOK_AHEAD
      );
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ---- Crowd Spawning ----

  _updateCrowdSpawning(delta, playerZ) {
    this._crowdSpawnTimer += delta;

    // Spawn rate decreases (spawns faster) over time
    const currentRate = Math.max(
      CROWD.INITIAL_SPAWN_RATE - this._playTime * DIFFICULTY.CROWD_DENSITY_RATE,
      CROWD.MIN_SPAWN_RATE
    );

    if (this._crowdSpawnTimer >= currentRate) {
      this._crowdSpawnTimer = 0;

      // Number of people per wave increases over time
      const waveSizeRange = CROWD.PEOPLE_PER_WAVE_MAX - CROWD.PEOPLE_PER_WAVE_MIN;
      const difficultyScale = Math.min(this._playTime / 60, 1); // 0..1 over 60 seconds
      const maxPeople = Math.floor(
        CROWD.PEOPLE_PER_WAVE_MIN + waveSizeRange +
        difficultyScale * (CROWD.WAVE_MAX_INCREASE - CROWD.PEOPLE_PER_WAVE_MAX)
      );
      const peopleCount = CROWD.PEOPLE_PER_WAVE_MIN +
        Math.floor(Math.random() * (maxPeople - CROWD.PEOPLE_PER_WAVE_MIN + 1));

      // Pick random lanes for this wave (no duplicates)
      const availableLanes = [...CROWD.LANES];
      const usedLanes = [];
      for (let i = 0; i < Math.min(peopleCount, availableLanes.length); i++) {
        const idx = Math.floor(Math.random() * availableLanes.length);
        usedLanes.push(availableLanes.splice(idx, 1)[0]);
      }

      const spawnZ = playerZ - CROWD.SPAWN_DISTANCE;

      for (const laneX of usedLanes) {
        const person = this.crowdPool.acquire();
        if (person) {
          // Add slight random offset to avoid perfect grid alignment
          const xOffset = (Math.random() - 0.5) * 0.3;
          const zOffset = (Math.random() - 0.5) * 2;
          person.activate(laneX + xOffset, spawnZ + zOffset);
        }
      }

      eventBus.emit(Events.CROWD_SPAWNED, { count: usedLanes.length });
    }
  }

  // ---- Heart Spawning ----

  _updateHeartSpawning(delta, playerZ) {
    this._heartSpawnTimer += delta;

    if (this._heartSpawnTimer >= HEART.SPAWN_INTERVAL) {
      this._heartSpawnTimer = 0;

      const heart = this.heartPool.acquire();
      if (heart) {
        // Random lane position
        const laneX = CROWD.LANES[Math.floor(Math.random() * CROWD.LANES.length)];
        const spawnZ = playerZ - HEART.SPAWN_DISTANCE;
        heart.activate(laneX, spawnZ);
      }
    }
  }

  // ---- Collision Detection ----

  _checkCollisions() {
    const playerBox = this.player.getBoundingBox();

    const active = this.crowdPool.getActive();
    for (let i = 0; i < active.length; i++) {
      const personBox = active[i].getBoundingBox();
      if (playerBox.intersectsBox(personBox)) {
        this._gameOver();
        return;
      }
    }
  }

  _checkHeartCollection() {
    const playerPos = this.player.mesh.position;
    const active = this.heartPool.getActive();

    for (let i = 0; i < active.length; i++) {
      if (active[i].isCollectedBy(playerPos)) {
        // Capture heart position before deactivating (for particle burst)
        const heartPos = active[i].group.position.clone();
        active[i].deactivate();
        gameState.heartsCollected++;
        gameState.score += HEART.POINTS;
        if (gameState.score > gameState.bestScore) {
          gameState.bestScore = gameState.score;
        }
        eventBus.emit(Events.HEART_COLLECTED, {
          total: gameState.heartsCollected,
          position: { x: heartPos.x, y: heartPos.y, z: heartPos.z },
        });
        eventBus.emit(Events.SCORE_CHANGED, { score: gameState.score });
      }
    }
  }

  _gameOver() {
    // Emit PLAYER_DIED with position for death particles and camera shake
    const pos = this.player ? this.player.mesh.position : null;
    eventBus.emit(Events.PLAYER_DIED, {
      position: pos ? { x: pos.x, y: pos.y + 0.5, z: pos.z } : null,
    });

    // Start death slow-mo — actual GAME_OVER is delayed
    this._deathPending = true;
    this._deathTimer = 0;
  }

  // ---- Resize ----

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
