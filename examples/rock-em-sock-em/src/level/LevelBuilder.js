// =============================================================================
// LevelBuilder.js — Constructs the boxing ring and arena environment
//
// Loads the boxing-ring.glb model. Falls back to procedural primitives
// if the model fails to load. Lighting is always built procedurally.
// =============================================================================

import * as THREE from 'three';
import { RING, COLORS, MODELS } from '../core/Constants.js';
import { loadModel } from './AssetLoader.js';

export class LevelBuilder {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this.ringModel = null;
  }

  /**
   * Build the full arena. Call after construction.
   * Async because it attempts to load the boxing ring GLB.
   */
  async build() {
    this.buildFloor();
    await this.buildRing();
    this.buildLighting();
  }

  buildFloor() {
    // Dark arena floor
    const floorGeo = new THREE.PlaneGeometry(RING.FLOOR_SIZE, RING.FLOOR_SIZE);
    const floorMat = new THREE.MeshLambertMaterial({ color: RING.FLOOR_COLOR });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.meshes.push(floor);
  }

  /**
   * Load the boxing ring GLB or fall back to primitives.
   */
  async buildRing() {
    let glbLoaded = false;

    try {
      const config = MODELS.BOXING_RING;
      const model = await loadModel(config.path);

      const scale = config.scale;
      model.scale.set(scale, scale, scale);

      // Force world matrix update so bounding box accounts for scale
      model.updateMatrixWorld(true);

      // Compute bounding box in world space (includes scale)
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Position the ring so its bottom sits at ground level
      model.position.y = (config.positionY || 0) - box.min.y;
      // Center on X/Z
      model.position.x = -center.x;
      model.position.z = -center.z;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(model);
      this.ringModel = model;
      glbLoaded = true;

      console.log(`[LevelBuilder] Loaded ${config.path} — size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
    } catch (err) {
      console.warn('[LevelBuilder] Failed to load boxing-ring.glb, using primitive fallback:', err.message);
    }

    if (!glbLoaded) {
      this.buildRingPlatform();
      this.buildRopes();
      this.buildCornerPosts();
    }
  }

  // --- Primitive fallback methods (original implementation) ---

  buildRingPlatform() {
    // Raised platform
    const platformGeo = new THREE.BoxGeometry(
      RING.PLATFORM_WIDTH, RING.PLATFORM_HEIGHT, RING.PLATFORM_DEPTH
    );
    const platformMat = new THREE.MeshLambertMaterial({ color: RING.PLATFORM_COLOR });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = RING.PLATFORM_HEIGHT / 2;
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.scene.add(platform);
    this.meshes.push(platform);

    // Canvas (top surface)
    const canvasGeo = new THREE.BoxGeometry(
      RING.PLATFORM_WIDTH - 0.1, RING.CANVAS_HEIGHT, RING.PLATFORM_DEPTH - 0.1
    );
    const canvasMat = new THREE.MeshLambertMaterial({ color: RING.CANVAS_COLOR });
    const canvas = new THREE.Mesh(canvasGeo, canvasMat);
    canvas.position.y = RING.PLATFORM_HEIGHT + RING.CANVAS_HEIGHT / 2;
    canvas.receiveShadow = true;
    this.scene.add(canvas);
    this.meshes.push(canvas);

    // Ring apron (skirt)
    const apronMat = new THREE.MeshLambertMaterial({ color: 0x222244 });
    const sides = [
      { w: RING.PLATFORM_WIDTH, d: 0.05, x: 0, z: RING.PLATFORM_DEPTH / 2 },
      { w: RING.PLATFORM_WIDTH, d: 0.05, x: 0, z: -RING.PLATFORM_DEPTH / 2 },
      { w: 0.05, d: RING.PLATFORM_DEPTH, x: RING.PLATFORM_WIDTH / 2, z: 0 },
      { w: 0.05, d: RING.PLATFORM_DEPTH, x: -RING.PLATFORM_WIDTH / 2, z: 0 },
    ];
    sides.forEach(({ w, d, x, z }) => {
      const geo = new THREE.BoxGeometry(w, RING.PLATFORM_HEIGHT, d);
      const mesh = new THREE.Mesh(geo, apronMat);
      mesh.position.set(x, RING.PLATFORM_HEIGHT / 2, z);
      this.scene.add(mesh);
      this.meshes.push(mesh);
    });
  }

  buildCornerPosts() {
    const postGeo = new THREE.CylinderGeometry(
      RING.POST_RADIUS, RING.POST_RADIUS, RING.POST_HEIGHT, 8
    );
    const postMat = new THREE.MeshLambertMaterial({ color: RING.POST_COLOR });

    const halfW = RING.PLATFORM_WIDTH / 2 - 0.1;
    const halfD = RING.PLATFORM_DEPTH / 2 - 0.1;
    const corners = [
      [halfW, halfD], [halfW, -halfD],
      [-halfW, halfD], [-halfW, -halfD],
    ];

    const capGeo = new THREE.SphereGeometry(RING.POST_RADIUS * 1.8, 8, 8);
    const capColors = [0xcc2222, 0x2266cc, 0xcc2222, 0x2266cc];

    corners.forEach(([x, z], i) => {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, RING.PLATFORM_HEIGHT + RING.POST_HEIGHT / 2, z);
      post.castShadow = true;
      this.scene.add(post);
      this.meshes.push(post);

      const capMat = new THREE.MeshLambertMaterial({ color: capColors[i] });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, RING.PLATFORM_HEIGHT + RING.POST_HEIGHT + 0.05, z);
      this.scene.add(cap);
      this.meshes.push(cap);
    });
  }

  buildRopes() {
    const ropeGeo = new THREE.CylinderGeometry(
      RING.ROPE_RADIUS, RING.ROPE_RADIUS, 1, 6
    );
    const ropeMat = new THREE.MeshLambertMaterial({ color: RING.ROPE_COLOR });

    const halfW = RING.PLATFORM_WIDTH / 2 - 0.1;
    const halfD = RING.PLATFORM_DEPTH / 2 - 0.1;
    const heights = [RING.ROPE_HEIGHT_1, RING.ROPE_HEIGHT_2, RING.ROPE_HEIGHT_3];

    const ropeSides = [
      { length: RING.PLATFORM_WIDTH - 0.2, rotY: 0, x: 0, z: halfD },
      { length: RING.PLATFORM_WIDTH - 0.2, rotY: 0, x: 0, z: -halfD },
      { length: RING.PLATFORM_DEPTH - 0.2, rotY: Math.PI / 2, x: halfW, z: 0 },
      { length: RING.PLATFORM_DEPTH - 0.2, rotY: Math.PI / 2, x: -halfW, z: 0 },
    ];

    heights.forEach(h => {
      ropeSides.forEach(({ length, rotY, x, z }) => {
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        rope.scale.y = length;
        rope.rotation.z = Math.PI / 2;
        rope.rotation.y = rotY;
        rope.position.set(x, RING.PLATFORM_HEIGHT + h, z);
        this.scene.add(rope);
        this.meshes.push(rope);
      });
    });
  }

  buildLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(COLORS.AMBIENT_LIGHT, COLORS.AMBIENT_INTENSITY);
    this.scene.add(ambient);

    // Main directional (sun/arena light)
    const dirLight = new THREE.DirectionalLight(COLORS.DIR_LIGHT, COLORS.DIR_INTENSITY);
    dirLight.position.set(3, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 20;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    this.scene.add(dirLight);

    // Overhead spotlight (arena spotlight effect)
    const spot = new THREE.SpotLight(COLORS.SPOT_LIGHT, COLORS.SPOT_INTENSITY);
    spot.position.set(0, 8, 0);
    spot.angle = Math.PI / 4;
    spot.penumbra = 0.5;
    spot.decay = 1.5;
    spot.distance = 20;
    spot.target.position.set(0, 0, 0);
    this.scene.add(spot);
    this.scene.add(spot.target);

    // Colored rim lights for each side
    const blueLight = new THREE.PointLight(0x4488ff, 0.4, 10);
    blueLight.position.set(0, 3, 4);
    this.scene.add(blueLight);

    const redLight = new THREE.PointLight(0xff4444, 0.4, 10);
    redLight.position.set(0, 3, -4);
    this.scene.add(redLight);
  }

  dispose() {
    // Dispose primitive meshes
    this.meshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
      this.scene.remove(mesh);
    });
    this.meshes = [];

    // Dispose GLB ring model
    if (this.ringModel) {
      this.ringModel.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.ringModel);
      this.ringModel = null;
    }
  }
}
