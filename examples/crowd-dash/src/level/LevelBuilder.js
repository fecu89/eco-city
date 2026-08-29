// =============================================================================
// LevelBuilder.js — Neon city environment for Crowd Dash
// Dark road, box buildings with neon-colored emissive windows, fog, night sky.
// Buildings and road segments are recycled as the player moves forward.
// =============================================================================

import * as THREE from 'three';
import { WORLD, COLORS, VFX } from '../core/Constants.js';

export class LevelBuilder {
  constructor(scene) {
    this.scene = scene;
    this._buildings = [];
    this._roadSegments = [];
    this._laneMarkings = [];
    this._windowMeshes = [];    // track window meshes for pulsing
    this._neonPulseTime = 0;    // timer for neon pulse

    this.buildLighting();
    this.buildFog();
    this.buildInitialRoad(0);
    this.buildBuildings(0);
  }

  // ---- Lighting ----

  buildLighting() {
    // Dim ambient light for night atmosphere
    this.ambientLight = new THREE.AmbientLight(WORLD.AMBIENT_COLOR, WORLD.AMBIENT_INTENSITY);
    this.scene.add(this.ambientLight);

    // Subtle directional light (moonlight)
    const dir = new THREE.DirectionalLight(WORLD.DIR_LIGHT_COLOR, WORLD.DIR_LIGHT_INTENSITY);
    dir.position.set(5, 20, 10);
    this.scene.add(dir);

    // Neon point lights along the road for atmosphere
    this._streetLights = [];
    for (let i = 0; i < 8; i++) {
      const colorIndex = i % WORLD.NEON_COLORS.length;
      const light = new THREE.PointLight(
        WORLD.NEON_COLORS[colorIndex],
        WORLD.POINT_LIGHT_INTENSITY,
        WORLD.POINT_LIGHT_DISTANCE
      );
      light.position.set(
        (i % 2 === 0 ? -1 : 1) * (WORLD.ROAD_WIDTH * 0.4),
        3,
        -i * 15
      );
      this.scene.add(light);
      this._streetLights.push(light);
    }
  }

  buildFog() {
    this.scene.fog = new THREE.Fog(WORLD.FOG_COLOR, WORLD.FOG_NEAR, WORLD.FOG_FAR);
    this.scene.background = new THREE.Color(WORLD.SKY_COLOR);
  }

  // ---- Road ----

  buildInitialRoad(playerZ) {
    // Create a long dark road plane
    const roadGeo = new THREE.PlaneGeometry(WORLD.ROAD_WIDTH, WORLD.ROAD_LENGTH);
    const roadMat = new THREE.MeshLambertMaterial({ color: WORLD.ROAD_COLOR });
    this._road = new THREE.Mesh(roadGeo, roadMat);
    this._road.rotation.x = -Math.PI / 2;
    this._road.position.set(0, 0, playerZ - WORLD.ROAD_LENGTH * 0.3);
    this.scene.add(this._road);

    // Sidewalk edges (thin strips on each side)
    const sidewalkGeo = new THREE.PlaneGeometry(0.5, WORLD.ROAD_LENGTH);
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: WORLD.SIDEWALK_COLOR });
    this._sidewalkLeft = new THREE.Mesh(sidewalkGeo, sidewalkMat);
    this._sidewalkLeft.rotation.x = -Math.PI / 2;
    this._sidewalkLeft.position.set(-WORLD.ROAD_WIDTH * 0.5 - 0.25, 0.01, playerZ - WORLD.ROAD_LENGTH * 0.3);
    this.scene.add(this._sidewalkLeft);

    this._sidewalkRight = new THREE.Mesh(sidewalkGeo.clone(), sidewalkMat.clone());
    this._sidewalkRight.rotation.x = -Math.PI / 2;
    this._sidewalkRight.position.set(WORLD.ROAD_WIDTH * 0.5 + 0.25, 0.01, playerZ - WORLD.ROAD_LENGTH * 0.3);
    this.scene.add(this._sidewalkRight);

    // Center lane marking (dashed)
    this._buildLaneMarkings(playerZ);
  }

  _buildLaneMarkings(playerZ) {
    const markGeo = new THREE.PlaneGeometry(WORLD.LANE_MARKING_WIDTH, WORLD.LANE_MARKING_LENGTH);
    const markMat = new THREE.MeshBasicMaterial({ color: WORLD.LANE_MARKING_COLOR });

    const totalLen = WORLD.ROAD_LENGTH;
    const step = WORLD.LANE_MARKING_LENGTH + WORLD.LANE_MARKING_GAP;
    const startZ = playerZ + 10;

    for (let z = startZ; z > startZ - totalLen; z -= step) {
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0, 0.02, z);
      this.scene.add(mark);
      this._laneMarkings.push(mark);
    }
  }

  // ---- Buildings ----

  buildBuildings(playerZ) {
    const count = WORLD.BUILDING_COUNT_PER_SIDE;

    for (let side = -1; side <= 1; side += 2) {
      let zPos = playerZ + 10;
      for (let i = 0; i < count; i++) {
        const width = WORLD.BUILDING_WIDTH_MIN +
          Math.random() * (WORLD.BUILDING_WIDTH_MAX - WORLD.BUILDING_WIDTH_MIN);
        const height = WORLD.BUILDING_MIN_HEIGHT +
          Math.random() * (WORLD.BUILDING_MAX_HEIGHT - WORLD.BUILDING_MIN_HEIGHT);
        const depth = WORLD.BUILDING_DEPTH;

        const buildingGeo = new THREE.BoxGeometry(width, height, depth);
        const buildingMat = new THREE.MeshLambertMaterial({ color: WORLD.BUILDING_COLOR });
        const building = new THREE.Mesh(buildingGeo, buildingMat);

        const xPos = side * (WORLD.BUILDING_OFFSET_X + width * 0.5);
        building.position.set(xPos, height * 0.5, zPos - depth * 0.5);
        this.scene.add(building);
        this._buildings.push(building);

        // Add neon windows
        this._addWindows(building, xPos, height, zPos - depth * 0.5, width, depth, side);

        zPos -= depth + WORLD.BUILDING_GAP;
      }
    }
  }

  _addWindows(building, bx, bHeight, bz, bWidth, bDepth, side) {
    const rows = WORLD.WINDOW_ROWS;
    const cols = WORLD.WINDOW_COLS;
    const winSize = WORLD.WINDOW_SIZE;
    const gap = WORLD.WINDOW_GAP;

    // Only add windows on the side facing the road
    const faceX = bx - side * (bWidth * 0.5 + 0.01);
    const neonColor = WORLD.NEON_COLORS[Math.floor(Math.random() * WORLD.NEON_COLORS.length)];

    const winGeo = new THREE.PlaneGeometry(winSize, winSize);
    const winMat = new THREE.MeshBasicMaterial({
      color: neonColor,
      transparent: true,
      opacity: 0.8,
    });

    for (let row = 0; row < rows; row++) {
      // Skip some windows randomly for variety
      const rowY = 2 + row * gap;
      if (rowY > bHeight - 1) break;

      for (let col = 0; col < cols; col++) {
        if (Math.random() < 0.3) continue; // Skip ~30% of windows

        const colZ = bz - (cols - 1) * gap * 0.5 + col * gap;

        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(faceX, rowY, colZ);
        win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(win);
        this._buildings.push(win); // Track for cleanup
        this._windowMeshes.push({ mesh: win, material: winMat, phase: Math.random() * Math.PI * 2 });
      }
    }
  }

  // ---- Update (scroll road and buildings with player) ----

  update(playerZ, delta) {
    // Move road to stay centered on player
    this._road.position.z = playerZ - WORLD.ROAD_LENGTH * 0.3;
    this._sidewalkLeft.position.z = playerZ - WORLD.ROAD_LENGTH * 0.3;
    this._sidewalkRight.position.z = playerZ - WORLD.ROAD_LENGTH * 0.3;

    // Move street lights to follow player
    for (let i = 0; i < this._streetLights.length; i++) {
      const light = this._streetLights[i];
      // Keep lights spaced evenly around the player
      const targetZ = playerZ - i * 15 + 10;
      light.position.z = targetZ;
    }

    // Pulse neon windows (only update visible-ish ones for perf)
    if (delta > 0) {
      this._neonPulseTime += delta;
      const t = this._neonPulseTime * VFX.NEON_PULSE_SPEED * Math.PI * 2;
      for (let i = 0; i < this._windowMeshes.length; i++) {
        const w = this._windowMeshes[i];
        // Only pulse windows near the player (within 60 units)
        const dz = Math.abs(w.mesh.position.z - playerZ);
        if (dz > 60) continue;

        const pulse = VFX.NEON_PULSE_MIN +
          (VFX.NEON_PULSE_MAX - VFX.NEON_PULSE_MIN) *
          (0.5 + 0.5 * Math.sin(t + w.phase));
        w.material.opacity = 0.8 * pulse;
      }
    }
  }

  // ---- Cleanup ----

  destroy() {
    // Dispose road
    if (this._road) {
      this._road.geometry.dispose();
      this._road.material.dispose();
      this.scene.remove(this._road);
    }
    if (this._sidewalkLeft) {
      this._sidewalkLeft.geometry.dispose();
      this._sidewalkLeft.material.dispose();
      this.scene.remove(this._sidewalkLeft);
    }
    if (this._sidewalkRight) {
      this._sidewalkRight.geometry.dispose();
      this._sidewalkRight.material.dispose();
      this.scene.remove(this._sidewalkRight);
    }

    // Dispose buildings and windows
    for (const obj of this._buildings) {
      obj.geometry.dispose();
      obj.material.dispose();
      this.scene.remove(obj);
    }
    this._buildings = [];

    // Dispose lane markings
    for (const mark of this._laneMarkings) {
      mark.geometry.dispose();
      mark.material.dispose();
      this.scene.remove(mark);
    }
    this._laneMarkings = [];

    // Remove street lights
    for (const light of this._streetLights) {
      this.scene.remove(light);
    }
    this._streetLights = [];

    // Clear window tracking
    this._windowMeshes = [];
  }
}
