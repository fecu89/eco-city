import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CITY_ASSETS, CITY_ASSET_FOOTPRINT, CITY_ASSET_ROOT } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { createFacilityFallbackGeometry, disposeFacilityFallbacks } from './FacilityGeometryFactory.js';

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const primaryGeometries = new Map();
const supplementGeometries = new Map();
let neutralTexture = null;
let initPromise = null;
let status = { state: 'idle', loaded: [], fallbacks: [], errors: [] };

function loadGltf(path) {
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, reject);
  });
}

function loadTexture(path) {
  return new Promise((resolve, reject) => {
    textureLoader.load(path, resolve, undefined, reject);
  });
}

function releaseGltfMaterials(root) {
  const disposed = new Set();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if (disposed.has(material)) return;
      disposed.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose();
    });
  });
}

function normalizeFirstMesh(gltf, targetHeight, targetFootprint) {
  gltf.scene.updateMatrixWorld(true);
  let mesh = null;
  gltf.scene.traverse((child) => {
    if (!mesh && child.isMesh) mesh = child;
  });
  if (!mesh) throw new Error('GLB contains no mesh');

  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const footprint = Math.max(size.x, size.z);
  if (size.y <= 0 || footprint <= 0) {
    geometry.dispose();
    throw new Error('GLB has invalid bounds');
  }

  const scale = Math.min(targetHeight / size.y, targetFootprint / footprint);
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  releaseGltfMaterials(gltf.scene);
  return geometry;
}

async function loadPrimary(type, definition) {
  const gltf = await loadGltf(`${CITY_ASSET_ROOT}${definition.model}`);
  return normalizeFirstMesh(gltf, definition.height, CITY_ASSET_FOOTPRINT);
}

async function loadSupplement(type, definition) {
  if (!definition.supplement) return null;
  const gltf = await loadGltf(`${CITY_ASSET_ROOT}${definition.supplement}`);
  return normalizeFirstMesh(
    gltf,
    definition.supplementHeight,
    definition.supplementFootprint,
  );
}

export function initCityAssets(onProgress = () => {}) {
  if (initPromise) return initPromise;

  const definitions = Object.entries(CITY_ASSETS);
  const total = definitions.length + definitions.filter(([, def]) => def.supplement).length + 1;
  let completed = 0;
  status = { state: 'loading', loaded: [], fallbacks: [], errors: [] };
  definitions.forEach(([type]) => primaryGeometries.set(type, createFacilityFallbackGeometry(type)));

  const advance = () => {
    completed++;
    onProgress(completed, total);
  };

  const primaryJobs = definitions.map(async ([type, definition]) => {
    try {
      const geometry = await loadPrimary(type, definition);
      primaryGeometries.set(type, geometry);
      status.loaded.push(type);
    } catch (error) {
      status.fallbacks.push(type);
      status.errors.push(`${type}: ${error?.message || error}`);
    } finally {
      advance();
    }
  });

  const supplementJobs = definitions
    .filter(([, definition]) => definition.supplement)
    .map(async ([type, definition]) => {
      try {
        const geometry = await loadSupplement(type, definition);
        if (geometry) supplementGeometries.set(type, geometry);
      } catch (error) {
        status.errors.push(`${type} supplement: ${error?.message || error}`);
      } finally {
        advance();
      }
    });

  const textureJob = loadTexture(`${CITY_ASSET_ROOT}variation-c.png`)
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.magFilter = THREE.NearestFilter;
      neutralTexture = texture;
    })
    .catch((error) => {
      status.errors.push(`variation-c texture: ${error?.message || error}`);
    })
    .finally(advance);

  initPromise = Promise.all([...primaryJobs, ...supplementJobs, textureJob]).then(() => {
    status.loaded.sort();
    status.fallbacks.sort();
    status.state = 'ready';
    if (status.errors.length) eventBus.emit(Events.ASSETS_FAILED, getAssetStatus());
    else eventBus.emit(Events.ASSETS_READY, getAssetStatus());
    return getAssetStatus();
  });
  return initPromise;
}

export function getFacilityGeometry(type) {
  return primaryGeometries.get(type) || createFacilityFallbackGeometry(type);
}

export function getSupplementGeometry(type) {
  return supplementGeometries.get(type) || null;
}

export function getCityNeutralTexture() {
  return neutralTexture;
}

export function getAssetStatus() {
  return {
    state: status.state,
    loaded: [...status.loaded],
    fallbacks: [...status.fallbacks],
    errors: [...status.errors],
  };
}

export function disposeCityAssets() {
  primaryGeometries.forEach((geometry, type) => {
    if (status.loaded.includes(type)) geometry.dispose();
  });
  supplementGeometries.forEach((geometry) => geometry.dispose());
  primaryGeometries.clear();
  supplementGeometries.clear();
  neutralTexture?.dispose();
  neutralTexture = null;
  initPromise = null;
  status = { state: 'idle', loaded: [], fallbacks: [], errors: [] };
  disposeFacilityFallbacks();
}
