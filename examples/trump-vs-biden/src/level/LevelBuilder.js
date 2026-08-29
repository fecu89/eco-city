// =============================================================================
// LevelBuilder.js — Builds the arena environment.
//
// Dark platform with glowing edges, low walls, atmospheric lighting + fog.
// =============================================================================

import * as THREE from 'three';
import { ARENA, COLORS } from '../core/Constants.js';

export class LevelBuilder {
  constructor(scene) {
    this.scene = scene;

    this.buildGround();
    this.buildWalls();
    this.buildEdgeGlow();
    this.buildLighting();
    this.buildFog();
  }

  buildGround() {
    const geometry = new THREE.PlaneGeometry(ARENA.WIDTH, ARENA.DEPTH);
    const material = new THREE.MeshStandardMaterial({
      color: ARENA.GROUND_COLOR,
      roughness: 0.8,
      metalness: 0.2,
    });
    this.ground = new THREE.Mesh(geometry, material);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Grid lines on the arena floor for depth perception
    const gridHelper = new THREE.GridHelper(
      Math.max(ARENA.WIDTH, ARENA.DEPTH),
      20,
      0x555577,
      0x333355,
    );
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: ARENA.WALL_COLOR,
      roughness: 0.6,
      metalness: 0.3,
      transparent: true,
      opacity: 0.7,
    });

    const hw = ARENA.WIDTH / 2;
    const hd = ARENA.DEPTH / 2;
    const wh = ARENA.WALL_HEIGHT;

    // Left wall
    const leftGeo = new THREE.BoxGeometry(0.2, wh, ARENA.DEPTH);
    const leftWall = new THREE.Mesh(leftGeo, wallMat);
    leftWall.position.set(-hw, wh / 2, 0);
    this.scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(leftGeo, wallMat);
    rightWall.position.set(hw, wh / 2, 0);
    this.scene.add(rightWall);

    // Back wall (behind opponent)
    const backGeo = new THREE.BoxGeometry(ARENA.WIDTH + 0.4, wh, 0.2);
    const backWall = new THREE.Mesh(backGeo, wallMat);
    backWall.position.set(0, wh / 2, -hd);
    this.scene.add(backWall);

    // Front wall (behind player)
    const frontWall = new THREE.Mesh(backGeo, wallMat);
    frontWall.position.set(0, wh / 2, hd);
    this.scene.add(frontWall);
  }

  buildEdgeGlow() {
    // Glowing edges around the arena perimeter
    const glowMat = new THREE.MeshBasicMaterial({
      color: ARENA.EDGE_GLOW_COLOR,
      transparent: true,
      opacity: 0.5,
    });

    const hw = ARENA.WIDTH / 2;
    const hd = ARENA.DEPTH / 2;

    // Edge strips (thin, glowing bars along the floor perimeter)
    const edgeH = 0.05;
    const edgeW = 0.15;

    // Left/right edges
    const sideGeo = new THREE.BoxGeometry(edgeW, edgeH, ARENA.DEPTH + edgeW);
    const leftEdge = new THREE.Mesh(sideGeo, glowMat);
    leftEdge.position.set(-hw, edgeH / 2, 0);
    this.scene.add(leftEdge);

    const rightEdge = new THREE.Mesh(sideGeo, glowMat);
    rightEdge.position.set(hw, edgeH / 2, 0);
    this.scene.add(rightEdge);

    // Front/back edges
    const fbGeo = new THREE.BoxGeometry(ARENA.WIDTH + edgeW, edgeH, edgeW);
    const backEdge = new THREE.Mesh(fbGeo, glowMat);
    backEdge.position.set(0, edgeH / 2, -hd);
    this.scene.add(backEdge);

    const frontEdge = new THREE.Mesh(fbGeo, glowMat);
    frontEdge.position.set(0, edgeH / 2, hd);
    this.scene.add(frontEdge);

    // Point lights at corners for glow effect
    const cornerIntensity = 0.4;
    const cornerColor = ARENA.EDGE_GLOW_COLOR;
    const positions = [
      [-hw, 0.3, -hd],
      [hw, 0.3, -hd],
      [-hw, 0.3, hd],
      [hw, 0.3, hd],
    ];
    positions.forEach(([x, y, z]) => {
      const light = new THREE.PointLight(cornerColor, cornerIntensity, 6);
      light.position.set(x, y, z);
      this.scene.add(light);
    });
  }

  buildLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(COLORS.AMBIENT_LIGHT, COLORS.AMBIENT_INTENSITY);
    this.scene.add(ambient);

    // Main directional light (slightly warm)
    const directional = new THREE.DirectionalLight(COLORS.DIR_LIGHT, COLORS.DIR_INTENSITY);
    directional.position.set(5, 12, 8);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 1024;
    directional.shadow.mapSize.height = 1024;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 30;
    directional.shadow.camera.left = -12;
    directional.shadow.camera.right = 12;
    directional.shadow.camera.top = 8;
    directional.shadow.camera.bottom = -8;
    this.scene.add(directional);

    // Warm point light on the player side (red/orange tint)
    const playerLight = new THREE.PointLight(0xff6644, COLORS.POINT_INTENSITY, 15);
    playerLight.position.set(0, 3, 5);
    this.scene.add(playerLight);

    // Cool point light on the opponent side (blue tint)
    const opponentLight = new THREE.PointLight(0x4466ff, COLORS.POINT_INTENSITY, 15);
    opponentLight.position.set(0, 3, -5);
    this.scene.add(opponentLight);
  }

  buildFog() {
    this.scene.fog = new THREE.Fog(COLORS.FOG_COLOR, COLORS.FOG_NEAR, COLORS.FOG_FAR);
  }
}
