import { Matrix4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { assetIdsByPhase, getAsset } from './assetRegistry.js';

export class AssetLoader {
  constructor({ gltfLoader = null } = {}) {
    this.loader = gltfLoader || new GLTFLoader();
    this.loader.setMeshoptDecoder?.(MeshoptDecoder);
    this.urlPromises = new Map();
    this.loadedById = new Map();
    this.failures = {};
  }

  loadAsset(id) {
    const asset = getAsset(id);
    if (!asset.path) return Promise.resolve(null);
    if (this.loadedById.has(id)) return this.loadedById.get(id);
    let request = this.urlPromises.get(asset.path);
    if (!request) {
      request = this.loader.loadAsync(asset.path);
      this.urlPromises.set(asset.path, request);
    }
    const tracked = request.then((gltf) => {
      delete this.failures[id];
      gltf.scene.updateMatrixWorld(true);
      return gltf;
    }).catch((error) => {
      this.failures[id] = error?.message || String(error);
      throw error;
    });
    this.loadedById.set(id, tracked);
    return tracked;
  }

  async preloadPhase(phase) {
    return Promise.allSettled(assetIdsByPhase(phase).map((id) => this.loadAsset(id)));
  }

  async cloneScene(id) {
    const gltf = await this.loadAsset(id);
    return gltf ? skeletonClone(gltf.scene) : null;
  }

  async getPrimitives(id) {
    const gltf = await this.loadAsset(id);
    if (!gltf) return [];
    const inverseRoot = new Matrix4().copy(gltf.scene.matrixWorld).invert();
    const primitives = [];
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      primitives.push({
        geometry: object.geometry,
        material: object.material,
        matrix: new Matrix4().multiplyMatrices(inverseRoot, object.matrixWorld),
        castShadow: false,
        receiveShadow: false,
      });
    });
    return primitives;
  }

  getStatus() {
    return {
      cachedUrls: [...this.urlPromises.keys()],
      requestedIds: [...this.loadedById.keys()],
      failures: { ...this.failures },
    };
  }

  dispose() {
    const seen = new Set();
    this.loadedById.forEach((promise) => promise.then((gltf) => {
      if (!gltf || seen.has(gltf)) return;
      seen.add(gltf);
      gltf.scene.traverse((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => material.dispose?.());
      });
    }).catch(() => {}));
    this.urlPromises.clear();
    this.loadedById.clear();
    this.failures = {};
  }
}

export const assetLoader = new AssetLoader();
