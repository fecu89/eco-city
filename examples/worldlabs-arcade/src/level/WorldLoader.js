import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { WORLD } from '../core/Constants.js';

let _colliderMesh = null;
let _splatMesh = null;

/**
 * Load the World Labs environment.
 */
export async function loadWorld(scene, renderer, camera) {
  // SparkRenderer — quality tuning for splat rendering
  const spark = new SparkRenderer({
    renderer,
    preBlurAmount: 0.1,      // Minimal blur — full-res splat is sharp enough
    maxPixelRadius: 512,     // Allow larger splats for close-up detail
  });
  scene.add(spark);

  const promises = [];

  if (WORLD.splatPath) {
    promises.push(loadSplat(scene).catch(err => {
      console.warn('[WorldLoader] Splat failed:', err.message);
    }));
  }

  if (WORLD.colliderPath) {
    promises.push(loadCollider(scene).catch(err => {
      console.warn('[WorldLoader] Collider failed:', err.message);
    }));
  }

  // Panorama disabled — same scene as splat causes "world inside world" doubling
  // if (WORLD.panoPath) { ... }

  await Promise.all(promises);

  console.log('[WorldLoader] Environment loaded',
    _splatMesh ? '(splat OK)' : '(no splat)',
    _colliderMesh ? '(collider OK)' : '(no collider)'
  );

  return { splat: _splatMesh, collider: _colliderMesh };
}

async function loadSplat(scene) {
  const splat = new SplatMesh({ url: WORLD.splatPath });
  splat.scale.setScalar(WORLD.scale);
  // World Labs SPZ is Y-flipped. rotation.x=PI flips Y and Z.
  // Compensate Z shift: world Z range [-1.08, 5.16] → offset = sum = 4.08
  splat.rotation.x = Math.PI;
  splat.position.set(WORLD.position.x, WORLD.position.y, WORLD.position.z + 4.08);
  scene.add(splat);
  if (splat.initialized) await splat.initialized;
  _splatMesh = splat;
}

async function loadCollider(scene) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(WORLD.colliderPath);
  _colliderMesh = gltf.scene;
  _colliderMesh.visible = false;
  _colliderMesh.scale.setScalar(WORLD.scale);
  // Match splat Y-flip: rotation.x=PI + Z compensation
  _colliderMesh.rotation.x = Math.PI;
  _colliderMesh.position.set(WORLD.position.x, WORLD.position.y, WORLD.position.z + 4.08);
  _colliderMesh.traverse(child => {
    if (child.isMesh) child.material.side = THREE.DoubleSide;
  });
  // Force matrix update so raycasts work before first render
  _colliderMesh.updateMatrixWorld(true);
  scene.add(_colliderMesh);
}

async function loadPanorama(scene) {
  const texLoader = new THREE.TextureLoader();
  const panoTex = await texLoader.loadAsync(WORLD.panoPath);
  panoTex.mapping = THREE.EquirectangularReflectionMapping;
  panoTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = panoTex;
  scene.environment = panoTex;
}

const _raycaster = new THREE.Raycaster();
const _upDir = new THREE.Vector3(0, 1, 0);
const _rayOrigin = new THREE.Vector3();

let _lastGroundY = 0;

export function getGroundHeight(x, z, fallback = 0) {
  if (!_colliderMesh) return fallback;
  // Raycast UPWARD from below — after Y-flip, the visual floor is the
  // lowest surface. Shooting up from below hits the floor first.
  _rayOrigin.set(x, -50, z);
  _raycaster.set(_rayOrigin, _upDir);
  const hits = _raycaster.intersectObject(_colliderMesh, true);
  if (hits.length > 0) {
    _lastGroundY = hits[0].point.y;
    return _lastGroundY;
  }
  // No hit — keep last known ground height to prevent floating
  return _lastGroundY;
}
