import { assetLoader } from '../assets/AssetLoader.js';
import { FACILITY_ASSET_IDS } from '../assets/assetRegistry.js';
import { prepareAssetGeometry } from '../assets/geometryUtils.js';
import { CITY_ASSET_FOOTPRINT, CITY_ASSETS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { createFacilityFallbackGeometry, disposeFacilityFallbacks } from './FacilityGeometryFactory.js';
import * as THREE from 'three';

const primaryGeometries = new Map();
const primaryMaterials = new Map();
let initPromise = null;
let status = { state: 'idle', loaded: [], fallbacks: [], errors: [] };

export function configurePaletteMaterial(material, assetId) {
  if (!material) return material;
  material.userData = { ...material.userData, assetId };
  if (assetId?.startsWith('energy.') || !material.map) return material;
  material.map.magFilter = THREE.NearestFilter;
  material.map.minFilter = THREE.NearestFilter;
  material.map.generateMipmaps = false;
  material.map.needsUpdate = true;
  material.userData.paletteSampling = 'nearest-no-mipmaps';
  if (/^(residential|commercial|industrial)\./.test(assetId) && material.isMeshStandardMaterial) {
    // Kenney 팔레트 상단의 순검정 음영이 작은 아이소메트릭 건물에서 구멍처럼 보이지 않게 한다.
    material.emissive.setHex(0x243443);
    material.emissiveIntensity = 0.42;
    material.userData.paletteBlackLift = true;
  }
  return material;
}

async function loadFacility(type, definition) {
  const assetId = FACILITY_ASSET_IDS[type]?.[0];
  if (!assetId) throw new Error(`No registered asset for ${type}`);
  const primitives = await assetLoader.getPrimitives(assetId);
  if (!primitives.length) throw new Error(`Registered asset ${assetId} is procedural`);
  const primitive = primitives[0];
  const material = Array.isArray(primitive.material) ? primitive.material[0]?.clone() : primitive.material?.clone();
  const configuredMaterial = configurePaletteMaterial(material, assetId);
  const geometry = prepareAssetGeometry(primitives, definition.height, CITY_ASSET_FOOTPRINT);
  if (configuredMaterial?.userData?.paletteBlackLift) {
    // 압축된 Kenney 노멀 일부가 확대/병합 뒤 반전된 것처럼 보이므로 웹 런타임용
    // 단일 geometry에서 다시 계산한다. 텍스처를 빼도 남던 검은 삼각 파편을 막는다.
    geometry.computeVertexNormals();
    geometry.normalizeNormals();
  }
  return {
    geometry,
    material: configuredMaterial,
  };
}

export function initCityAssets(onProgress = () => {}) {
  if (initPromise) return initPromise;
  const definitions = Object.entries(CITY_ASSETS);
  status = { state: 'loading', loaded: [], fallbacks: [], errors: [] };
  definitions.forEach(([type]) => primaryGeometries.set(type, createFacilityFallbackGeometry(type)));

  let completed = 0;
  initPromise = Promise.all(definitions.map(async ([type, definition]) => {
    try {
      const { geometry, material } = await loadFacility(type, definition);
      primaryGeometries.set(type, geometry);
      if (material) primaryMaterials.set(type, material);
      status.loaded.push(type);
    } catch (error) {
      status.fallbacks.push(type);
      // Quaternius energy downloads need manual acquisition, so code geometry is expected.
      if (!FACILITY_ASSET_IDS[type]?.[0]?.startsWith('energy.')) {
        status.errors.push(`${type}: ${error?.message || error}`);
      }
    } finally {
      completed += 1;
      onProgress(completed, definitions.length);
    }
  })).then(() => {
    status.loaded.sort();
    status.fallbacks.sort();
    status.state = 'ready';
    const payload = getAssetStatus();
    eventBus.emit(status.errors.length ? Events.ASSETS_FAILED : Events.ASSETS_READY, payload);
    return payload;
  });
  return initPromise;
}

export function getFacilityGeometry(type) {
  return primaryGeometries.get(type) || createFacilityFallbackGeometry(type);
}

export function getFacilityMaterial(type) {
  return primaryMaterials.get(type) || null;
}

export function getSupplementGeometry() {
  return null;
}

export function getCityNeutralTexture() {
  return null;
}

export function getAssetStatus() {
  return {
    state: status.state,
    loaded: [...status.loaded],
    fallbacks: [...status.fallbacks],
    errors: [...status.errors],
    materials: Object.fromEntries([...primaryMaterials.entries()].map(([type, material]) => [type, {
      assetId: material.userData?.assetId || null,
      paletteSampling: material.userData?.paletteSampling || null,
      paletteBlackLift: Boolean(material.userData?.paletteBlackLift),
      minFilter: material.map?.minFilter ?? null,
      magFilter: material.map?.magFilter ?? null,
      generateMipmaps: material.map?.generateMipmaps ?? null,
      materialUuid: material.uuid,
      textureUuid: material.map?.uuid || null,
    }])),
    cache: assetLoader.getStatus(),
  };
}

export function disposeCityAssets() {
  primaryGeometries.forEach((geometry, type) => {
    if (status.loaded.includes(type)) geometry.dispose();
  });
  primaryMaterials.forEach((material) => material.dispose());
  primaryGeometries.clear();
  primaryMaterials.clear();
  assetLoader.dispose();
  initPromise = null;
  status = { state: 'idle', loaded: [], fallbacks: [], errors: [] };
  disposeFacilityFallbacks();
}
