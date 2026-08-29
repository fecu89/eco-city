// =============================================================================
// Game.js — Main orchestrator for Rock 'Em Sock 'Em Robots
//
// Initializes renderer, scene, camera, and all systems.
// Runs the animation loop. Manages robot creation and round resets.
// Camera is fixed behind the player robot, looking at the opponent.
//
// On startup, preloads all GLB models before creating game entities.
// =============================================================================

import * as THREE from 'three';
import { GAME, CAMERA, COLORS, PLAYER, OPPONENT, COMBAT, MODELS } from './Constants.js';
import { eventBus, Events } from './EventBus.js';
import { gameState } from './GameState.js';
import { preloadAll } from '../level/AssetLoader.js';
import { InputSystem } from '../systems/InputSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { AISystem } from '../systems/AISystem.js';
import { AnimationSystem } from '../systems/AnimationSystem.js';
import { createRobot, disposeRobot } from '../entities/Robot.js';
import { HealthBar } from '../entities/HealthBar.js';
import { LevelBuilder } from '../level/LevelBuilder.js';
import { Menu } from '../ui/Menu.js';

export class Game {
  constructor() {
    this.clock = new THREE.Clock();

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GAME.MAX_DPR));
    this.renderer.setClearColor(COLORS.SKY);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.prepend(this.renderer.domElement);

    // --- Scene ---
    this.scene = new THREE.Scene();

    // --- Camera (fixed, behind player) ---
    this.camera = new THREE.PerspectiveCamera(
      GAME.FOV,
      window.innerWidth / window.innerHeight,
      GAME.NEAR,
      GAME.FAR
    );
    this.camera.position.set(CAMERA.POSITION_X, CAMERA.POSITION_Y, CAMERA.POSITION_Z);
    this.camera.lookAt(CAMERA.LOOK_AT_X, CAMERA.LOOK_AT_Y, CAMERA.LOOK_AT_Z);

    // --- Systems ---
    this.input = new InputSystem();
    this.level = new LevelBuilder(this.scene);
    this.combat = new CombatSystem();
    this.ai = new AISystem();
    this.menu = new Menu();
    this.animationSystem = null;

    // --- Robot meshes ---
    this.playerRobot = null;
    this.opponentRobot = null;
    this.playerHealthBar = null;
    this.opponentHealthBar = null;

    // --- Track async init ---
    this.ready = false;

    // --- Events ---
    eventBus.on(Events.GAME_RESTART, () => this.restart());
    eventBus.on(Events.ROUND_WON, () => {
      // Round reset is handled in animate() via roundResetTimer
    });

    // --- Resize ---
    window.addEventListener('resize', () => this.onResize());

    // --- Render loop (starts immediately, but skips game logic until ready) ---
    this.renderer.setAnimationLoop(() => this.animate());

    // --- Preload models and start ---
    this.init();
  }

  /**
   * Preload all GLB assets, build the level, then start the game.
   */
  async init() {
    try {
      // Collect all model paths to preload (base models + animation GLBs)
      const modelPaths = [];
      for (const config of Object.values(MODELS)) {
        if (config.path) modelPaths.push(config.path);
        if (config.walkPath) modelPaths.push(config.walkPath);
        if (config.runPath) modelPaths.push(config.runPath);
      }

      console.log('[Game] Preloading models:', modelPaths);
      await preloadAll(modelPaths, (loaded, total) => {
        console.log(`[Game] Loaded ${loaded}/${total} models`);
      });
    } catch (err) {
      // Non-fatal — individual loadModel calls will also catch and fall back
      console.warn('[Game] Some models failed to preload (primitives will be used):', err.message);
    }

    // Build the level (async for ring GLB loading)
    await this.level.build();

    // Start the game
    await this.startGame();
    this.ready = true;

    // Emit spectacle entrance
    eventBus.emit(Events.SPECTACLE_ENTRANCE, { game: 'rock-em-sock-em' });
  }

  async startGame() {
    gameState.reset();
    gameState.started = true;

    await this.createRobots();
    this.input.setGameActive(true);
    this.ai.reset();

    eventBus.emit(Events.MUSIC_GAMEPLAY);
  }

  async createRobots() {
    // Clean up existing robots
    this.destroyRobots();

    // Player robot (Blue Bomber) — faces -Z (toward opponent)
    this.playerRobot = await createRobot(
      { body: PLAYER.COLOR_BODY, dark: PLAYER.COLOR_DARK, glove: PLAYER.COLOR_GLOVE, accent: PLAYER.COLOR_ACCENT },
      false, // faces -Z
      'player'
    );
    this.playerRobot.position.set(0, 0.3, PLAYER.POSITION_Z);
    this.scene.add(this.playerRobot);

    // Opponent robot (Red Rocker) — faces +Z (toward player)
    this.opponentRobot = await createRobot(
      { body: OPPONENT.COLOR_BODY, dark: OPPONENT.COLOR_DARK, glove: OPPONENT.COLOR_GLOVE, accent: OPPONENT.COLOR_ACCENT },
      true, // faces +Z
      'opponent'
    );
    this.opponentRobot.position.set(0, 0.3, OPPONENT.POSITION_Z);
    this.scene.add(this.opponentRobot);

    // Health bars
    this.playerHealthBar = new HealthBar(COLORS.HEALTH_BAR_PLAYER);
    this.playerRobot.add(this.playerHealthBar.group);

    this.opponentHealthBar = new HealthBar(COLORS.HEALTH_BAR_OPPONENT);
    this.opponentRobot.add(this.opponentHealthBar.group);

    // Animation system
    if (this.animationSystem) {
      this.animationSystem.setRobots(this.playerRobot, this.opponentRobot);
    } else {
      this.animationSystem = new AnimationSystem(this.playerRobot, this.opponentRobot);
    }
  }

  destroyRobots() {
    if (this.playerRobot) {
      if (this.playerHealthBar) {
        this.playerHealthBar.dispose();
        this.playerHealthBar = null;
      }
      this.scene.remove(this.playerRobot);
      disposeRobot(this.playerRobot);
      this.playerRobot = null;
    }
    if (this.opponentRobot) {
      if (this.opponentHealthBar) {
        this.opponentHealthBar.dispose();
        this.opponentHealthBar = null;
      }
      this.scene.remove(this.opponentRobot);
      disposeRobot(this.opponentRobot);
      this.opponentRobot = null;
    }
  }

  async restart() {
    this.destroyRobots();
    await this.startGame();
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), GAME.MAX_DELTA);

    this.input.update();

    if (this.ready && gameState.started && !gameState.gameOver) {
      // --- Round reset timer ---
      if (gameState.roundOver && !gameState.gameOver) {
        gameState.roundResetTimer -= delta;
        if (gameState.roundResetTimer <= 0) {
          gameState.resetRound();
          this.createRobots();
          this.ai.reset();
          eventBus.emit(Events.ROUND_RESET);
        }
      }

      // --- Update systems ---
      this.combat.update(delta);
      this.ai.update(delta);

      // --- Animation ---
      if (this.animationSystem) {
        this.animationSystem.update(delta);
      }

      // --- Health bars ---
      if (this.playerHealthBar) {
        this.playerHealthBar.update(
          gameState.playerHeadHealth / COMBAT.MAX_HEAD_HEALTH,
          this.camera
        );
      }
      if (this.opponentHealthBar) {
        this.opponentHealthBar.update(
          gameState.opponentHeadHealth / COMBAT.MAX_HEAD_HEALTH,
          this.camera
        );
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
