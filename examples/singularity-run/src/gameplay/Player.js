import * as THREE from 'three';
import { PLAYER, RUNNER } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

export class Player {
  constructor(scene) {
    this.scene = scene;

    // Build the player mesh group (humanoid: body + head)
    this.group = new THREE.Group();

    // Body
    this.bodyGeo = new THREE.BoxGeometry(PLAYER.WIDTH, PLAYER.HEIGHT * 0.65, PLAYER.DEPTH);
    this.bodyMat = new THREE.MeshPhongMaterial({
      color: PLAYER.COLOR,
      emissive: PLAYER.GLOW_COLOR,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.9,
    });
    this.body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    this.body.position.y = PLAYER.HEIGHT * 0.325;
    this.group.add(this.body);

    // Head
    const headSize = PLAYER.WIDTH * 0.5;
    this.headGeo = new THREE.BoxGeometry(headSize, headSize, headSize);
    this.headMat = new THREE.MeshPhongMaterial({
      color: PLAYER.COLOR,
      emissive: PLAYER.GLOW_COLOR,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.9,
    });
    this.head = new THREE.Mesh(this.headGeo, this.headMat);
    this.head.position.y = PLAYER.HEIGHT * 0.65 + headSize * 0.5;
    this.group.add(this.head);

    // State
    this.targetLane = 0; // -1, 0, 1
    this.currentLaneX = 0; // actual X position (lerps toward target)
    this.velocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.normalScaleY = 1;
    this.runZ = 0; // Z position along the run (decreases as player runs forward)

    // Position at ground level, center lane
    this.group.position.set(0, 0, 0);
    this.scene.add(this.group);

    // For external reference (e.g., camera follow)
    this.mesh = this.group;
  }

  update(delta, input) {
    // --- Lane switching ---
    if (input.consumeSwipeLeft()) {
      if (this.targetLane > -1) {
        this.targetLane -= 1;
        eventBus.emit(Events.PLAYER_LANE_CHANGE, { lane: this.targetLane });
      }
    }
    if (input.consumeSwipeRight()) {
      if (this.targetLane < 1) {
        this.targetLane += 1;
        eventBus.emit(Events.PLAYER_LANE_CHANGE, { lane: this.targetLane });
      }
    }

    // Smooth lane interpolation
    const targetX = this.targetLane * RUNNER.LANE_WIDTH;
    this.currentLaneX += (targetX - this.currentLaneX) * Math.min(1, RUNNER.LANE_SWITCH_SPEED * delta);
    this.group.position.x = this.currentLaneX;

    // --- Jumping ---
    if (input.consumeJump() && !this.isJumping && !this.isSliding) {
      this.velocityY = RUNNER.JUMP_FORCE;
      this.isJumping = true;
      eventBus.emit(Events.PLAYER_JUMP);
    }

    if (this.isJumping) {
      this.velocityY -= RUNNER.GRAVITY * delta;
      this.group.position.y += this.velocityY * delta;

      // Land on ground
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.velocityY = 0;
        this.isJumping = false;
      }
    }

    // --- Sliding ---
    if (input.consumeSlide() && !this.isJumping && !this.isSliding) {
      this.isSliding = true;
      this.slideTimer = RUNNER.SLIDE_DURATION;
      // Scale down vertically to duck
      this.group.scale.y = 0.4;
      // Shift down so bottom stays on ground
      this.group.position.y = 0;
      eventBus.emit(Events.PLAYER_SLIDE);
    }

    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        this.group.scale.y = 1;
        this.group.position.y = 0;
      }
    }
  }

  /** Move the player forward along -Z by the given distance */
  moveForward(distance) {
    this.runZ -= distance;
    this.group.position.z = this.runZ;
  }

  /** Get AABB collision box in world space */
  getCollisionBox() {
    const pos = this.group.position;
    const halfW = PLAYER.WIDTH * 0.5;
    const halfD = PLAYER.DEPTH * 0.5;

    // Adjust height for sliding
    let height = PLAYER.HEIGHT;
    if (this.isSliding) {
      height *= 0.4;
    }

    const min = new THREE.Vector3(
      pos.x - halfW,
      pos.y,
      pos.z - halfD
    );
    const max = new THREE.Vector3(
      pos.x + halfW,
      pos.y + height,
      pos.z + halfD
    );

    return new THREE.Box3(min, max);
  }

  reset() {
    this.targetLane = 0;
    this.currentLaneX = 0;
    this.velocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.runZ = 0;
    this.group.scale.y = 1;
    this.group.position.set(0, 0, 0);
  }

  destroy() {
    this.bodyGeo.dispose();
    this.bodyMat.dispose();
    this.headGeo.dispose();
    this.headMat.dispose();
    this.scene.remove(this.group);
  }
}
