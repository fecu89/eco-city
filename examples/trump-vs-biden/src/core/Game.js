// =============================================================================
// Game.js — Main orchestrator. Initializes all systems, manages the game
// lifecycle, runs the render loop. Fixed spectator camera looking at arena.
// =============================================================================

import * as THREE from 'three';
import { GAME, CAMERA, COLORS, ASSET_PATHS, PLAYER, OPPONENT } from './Constants.js';
import { eventBus, Events } from './EventBus.js';
import { gameState } from './GameState.js';
import { InputSystem } from '../systems/InputSystem.js';
import { EffectsSystem } from '../systems/EffectsSystem.js';
import { Player } from '../gameplay/Player.js';
import { Opponent } from '../gameplay/Opponent.js';
import { ProjectileManager } from '../gameplay/ProjectileManager.js';
import { LevelBuilder } from '../level/LevelBuilder.js';
import { Menu } from '../ui/Menu.js';
import { preloadAll } from '../level/AssetLoader.js';

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
    this.renderer.shadowMap.enabled = true;
    document.body.prepend(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera — fixed spectator view
    this.camera = new THREE.PerspectiveCamera(
      GAME.FOV, window.innerWidth / window.innerHeight, GAME.NEAR, GAME.FAR,
    );
    this.camera.position.set(CAMERA.POSITION_X, CAMERA.POSITION_Y, CAMERA.POSITION_Z);
    this.camera.lookAt(CAMERA.LOOK_AT_X, CAMERA.LOOK_AT_Y, CAMERA.LOOK_AT_Z);

    // Systems
    this.input = new InputSystem();
    this.level = new LevelBuilder(this.scene);
    this.effects = new EffectsSystem(this.scene, this.camera, this.level);
    this.menu = new Menu();
    this.player = null;
    this.opponent = null;
    this.projectileManager = null;

    // Events
    eventBus.on(Events.GAME_RESTART, () => this.restart());
    eventBus.on(Events.HEALTH_CHANGED, ({ health }) => this.onHealthChanged(health));
    eventBus.on(Events.OPPONENT_HIT, () => this.onOpponentHit());
    eventBus.on(Events.PLAYER_HIT, () => this.onPlayerHit());

    // Resize
    window.addEventListener('resize', () => this.onResize());

    // Start render loop (official Three.js pattern -- pauses when tab hidden)
    this.renderer.setAnimationLoop(() => this.animate());

    // Auto-start game (no title screen -- Play.fun handles the chrome)
    // Preload models first, then create entities.
    this._preloadAndStart();
  }

  async _preloadAndStart() {
    try {
      await preloadAll([ASSET_PATHS.TRUMP_MODEL, ASSET_PATHS.BIDEN_MODEL]);
      console.log('Models preloaded');
    } catch (err) {
      console.warn('Model preload failed, will use fallback boxes:', err.message);
    }
    this.startGame();
  }

  startGame() {
    gameState.reset();
    gameState.started = true;

    this.player = new Player(this.scene);
    this.opponent = new Opponent(this.scene);
    this.projectileManager = new ProjectileManager(this.scene);

    this.input.setGameActive(true);

    // Trigger entrance animation — characters rise from below arena
    if (this.effects) {
      this.effects.startEntrance([
        { mesh: this.player.mesh, targetY: PLAYER.START_Y },
        { mesh: this.opponent.mesh, targetY: OPPONENT.START_Y },
      ]);
    }
  }

  restart() {
    // Clean up old entities
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    if (this.opponent) {
      this.opponent.destroy();
      this.opponent = null;
    }
    if (this.projectileManager) {
      this.projectileManager.destroy();
      this.projectileManager = null;
    }

    // Reset effects (camera, slow-mo, particles)
    if (this.effects) {
      this.effects.reset();
    }

    this.startGame();
  }

  onHealthChanged(health) {
    if (health <= 0 && !gameState.gameOver) {
      gameState.gameOver = true;
      this.input.setGameActive(false);
      eventBus.emit(Events.GAME_OVER, { score: gameState.score });
    }
  }

  onOpponentHit() {
    if (this.player) {
      this.player.onHitOpponent();
    }
  }

  onPlayerHit() {
    if (this.player) {
      this.player.onTakeDamage();
    }
  }

  animate() {
    const rawDelta = Math.min(this.clock.getDelta(), GAME.MAX_DELTA);

    // Apply slow-mo multiplier (only affects gameplay entities, not effects)
    const slowMult = this.effects ? this.effects.getDeltaMultiplier() : 1;
    const delta = rawDelta * slowMult;

    this.input.update();

    if (gameState.started && !gameState.gameOver) {
      // Update player
      if (this.player) {
        this.player.update(delta, this.input);
      }

      // Update opponent AI (pass player position for aiming)
      if (this.opponent) {
        const playerPos = this.player ? this.player.mesh.position : null;
        this.opponent.update(delta, playerPos);
      }

      // Update projectiles (pass positions for collision)
      if (this.projectileManager) {
        const playerPos = this.player ? this.player.mesh.position : null;
        const opponentPos = this.opponent ? this.opponent.mesh.position : null;
        this.projectileManager.update(delta, playerPos, opponentPos);
      }
    }

    // Update effects system (uses raw delta so particles/ambient always animate smoothly)
    if (this.effects) {
      this.effects.update(rawDelta);

      // Spawn trails for active projectiles
      if (this.projectileManager && this.projectileManager.projectiles.length > 0) {
        this.effects.updateProjectileTrails(this.projectileManager.projectiles, rawDelta);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
