import * as THREE from 'three';
import { GAME, CAMERA, COLORS, PLAYER, BOUNDS } from './Constants.js';
import { eventBus, Events } from './EventBus.js';
import { gameState } from './GameState.js';
import { InputSystem } from '../systems/InputSystem.js';
import { loadWorld, getGroundHeight } from '../level/WorldLoader.js';
import { Player } from '../gameplay/Player.js';

export class Game {
  constructor() {
    this.clock = new THREE.Clock();
    this.yaw = -Math.PI * 0.5;  // face along +X into the arcade
    this.pitch = 0.0;
    this.player = null;

    // Renderer — antialias OFF is critical for Gaussian Splats
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GAME.MAX_DPR));
    this.renderer.setClearColor(COLORS.SKY);
    document.body.prepend(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      GAME.FOV, window.innerWidth / window.innerHeight, GAME.NEAR, GAME.FAR
    );

    // Systems
    this.input = new InputSystem();

    // Lighting for mesh objects (character model)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dir = new THREE.DirectionalLight(0xffffee, 1.5);
    dir.position.set(2, 5, 3);
    this.scene.add(dir);

    // Pointer lock for mouse look (orbits around player)
    this.renderer.domElement.addEventListener('click', () => {
      this.renderer.domElement.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.renderer.domElement) return;
      this.yaw -= e.movementX * CAMERA.MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * CAMERA.MOUSE_SENSITIVITY;
      this.pitch = Math.max(-0.5, Math.min(1.2, this.pitch));
    });

    eventBus.on(Events.GAME_RESTART, () => this.restart());
    window.addEventListener('resize', () => this.onResize());

    this.loadingEl = document.getElementById('loading');
    this.init();
  }

  async init() {
    try {
      if (this.loadingEl) this.loadingEl.textContent = 'Loading world...';
      await loadWorld(this.scene, this.renderer, this.camera);

      // Create the player character
      this.player = new Player(this.scene);

      if (this.loadingEl) this.loadingEl.classList.add('hidden');
    } catch (err) {
      console.error('[Game] World load error:', err);
      if (this.loadingEl) this.loadingEl.textContent = 'World load failed';
    }

    this.startGame();
    this.renderer.setAnimationLoop(() => this.animate());
  }

  startGame() {
    gameState.reset();
    gameState.started = true;
    if (this.player) this.player.reset();
    this.yaw = Math.PI * 0.5;
    this.pitch = 0.05;
  }

  restart() { this.startGame(); }

  animate() {
    const delta = Math.min(this.clock.getDelta(), GAME.MAX_DELTA);
    this.input.update();

    if (gameState.started && !gameState.gameOver && this.player) {
      // Update player movement + animation (pass camera yaw as azimuth)
      this.player.update(delta, this.input, this.yaw);

      // Pin player to starting Y (collider is unreliable after Y-flip)
      const pp = this.player.mesh.position;
      pp.y = PLAYER.START_Y;

      // Clamp player to world bounds
      pp.x = Math.max(BOUNDS.MIN_X, Math.min(BOUNDS.MAX_X, pp.x));
      pp.z = Math.max(BOUNDS.MIN_Z, Math.min(BOUNDS.MAX_Z, pp.z));

      // Third-person camera: orbit behind player
      const idealX = pp.x + Math.sin(this.yaw) * CAMERA.FOLLOW_DISTANCE;
      const idealZ = pp.z + Math.cos(this.yaw) * CAMERA.FOLLOW_DISTANCE;
      const idealY = pp.y + CAMERA.FOLLOW_HEIGHT + Math.sin(this.pitch) * CAMERA.FOLLOW_DISTANCE * 0.5;

      // Smooth follow
      const t = 1 - Math.exp(-CAMERA.LERP_SPEED * delta);
      this.camera.position.x += (idealX - this.camera.position.x) * t;
      this.camera.position.y += (idealY - this.camera.position.y) * t;
      this.camera.position.z += (idealZ - this.camera.position.z) * t;

      // Look at player
      this.camera.lookAt(pp.x, pp.y + CAMERA.LOOK_HEIGHT, pp.z);
    }

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
