import { assetLoader } from '../assets/AssetLoader.js';
import { FACILITY_ASSET_IDS } from '../assets/assetRegistry.js';
import { prepareAssetGeometry } from '../assets/geometryUtils.js';
import { CITY_ASSET_FOOTPRINT, CITY_ASSETS, VISUAL } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { createFacilityFallbackGeometry, disposeFacilityFallbacks } from './FacilityGeometryFactory.js';
import * as THREE from 'three';

// 지오메트리/머티리얼은 시설 타입이 아니라 실제 에셋 id로 캐시한다. 한 타입 안에서
// 레벨마다 다른 에셋을 쓸 수 있고(예: 화력발전 1~3단계), 반대로 여러 레벨이 같은 에셋을
// 공유하면(예: 대부분의 시설) 자연히 한 번만 로드된다.
// 캐시 키는 에셋 id만으로는 부족하다. 같은 GLB를 쓰는 두 시설이라도 CITY_ASSETS의
// 목표 높이가 다르면 정규화된 geometry도 달라야 한다(예: 순환냉각 0.6 vs 조력 0.58).
const primaryGeometries = new Map();
const primaryMaterials = new Map();
const typeFallbackGeometries = new Map();
let initPromise = null;
let status = { state: 'idle', loaded: [], fallbacks: [], errors: [] };

function assetCacheKey(assetId, height) {
  return `${assetId}@${height}`;
}

function levelCacheKey(type, level = 1) {
  const assetId = levelAssetId(type, level);
  return assetId ? assetCacheKey(assetId, CITY_ASSETS[type]?.height) : null;
}

function levelAssetId(type, level = 1) {
  const ids = FACILITY_ASSET_IDS[type];
  if (!ids?.length) return null;
  const index = Math.max(0, Math.min(ids.length - 1, Math.trunc(level) - 1));
  return ids[index] || ids[0];
}

export function configurePaletteMaterial(material, assetId) {
  if (!material) return material;
  material.userData = { ...material.userData, assetId };
  if (!material.map) return material;
  material.map.magFilter = THREE.NearestFilter;
  material.map.minFilter = THREE.NearestFilter;
  material.map.generateMipmaps = false;
  material.map.needsUpdate = true;
  material.userData.paletteSampling = 'nearest-no-mipmaps';
  // 검정 보정을 받는 에셋 계열(id 접두사)·발광색·세기는 settings.json VISUAL.ASSET.PALETTE_BLACK_LIFT.
  const blackLift = VISUAL.ASSET.PALETTE_BLACK_LIFT;
  const idText = String(assetId);
  if (blackLift.assetPrefixes.some((prefix) => idText.startsWith(`${prefix}.`)) && material.isMeshStandardMaterial) {
    // Kenney 팔레트 상단의 순검정 음영이 작은 아이소메트릭 건물에서 구멍처럼 보이지 않게 한다.
    material.emissive.setHex(blackLift.emissive);
    material.emissiveIntensity = blackLift.intensity;
    material.userData.paletteBlackLift = true;
  }
  return material;
}

async function loadFacilityAsset(assetId, definition) {
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
  definitions.forEach(([type]) => typeFallbackGeometries.set(type, createFacilityFallbackGeometry(type)));

  // 한 시설 타입이 레벨마다 서로 다른 에셋을 참조할 수 있으므로, 실제로 쓰이는
  // (에셋 id, 목표 높이) 조합을 모아 한 번씩만 로드한다. 같은 조합을 쓰는 레벨/타입은
  // 캐시를 공유하고, 같은 GLB라도 높이가 다르면 각자 정규화된 geometry를 받는다
  // (예: 순환냉각 0.6과 조력 0.58이 둘 다 storageTank를 1레벨로 쓰는 경우).
  const jobByCacheKey = new Map();
  definitions.forEach(([type, definition]) => {
    (FACILITY_ASSET_IDS[type] || []).forEach((assetId) => {
      if (!assetId) return;
      const cacheKey = assetCacheKey(assetId, definition.height);
      if (jobByCacheKey.has(cacheKey)) return;
      jobByCacheKey.set(cacheKey, { cacheKey, assetId, definition });
    });
  });
  const jobs = [...jobByCacheKey.values()];

  let completed = 0;
  initPromise = Promise.all(jobs.map(async ({ cacheKey, assetId, definition }) => {
    try {
      const { geometry, material } = await loadFacilityAsset(assetId, definition);
      primaryGeometries.set(cacheKey, geometry);
      if (material) primaryMaterials.set(cacheKey, material);
    } catch (error) {
      status.errors.push(`${assetId}: ${error?.message || error}`);
    } finally {
      completed += 1;
      onProgress(completed, jobs.length);
    }
  })).then(() => {
    // 로딩 자체는 에셋 id 단위로 한 번씩만 하지만, 성공/폴백 보고는 타입 단위로 따로 집계한다 —
    // 여러 타입이 같은 1레벨 에셋을 공유해도(예: 순환냉각·조력) 모든 타입이 각자 보고된다.
    definitions.forEach(([type]) => {
      const primaryKey = levelCacheKey(type, 1);
      (primaryKey && primaryGeometries.has(primaryKey) ? status.loaded : status.fallbacks).push(type);
    });
    status.loaded.sort();
    status.fallbacks.sort();
    status.state = 'ready';
    const payload = getAssetStatus();
    eventBus.emit(status.errors.length ? Events.ASSETS_FAILED : Events.ASSETS_READY, payload);
    return payload;
  });
  return initPromise;
}

export function getFacilityGeometry(type, level = 1) {
  const cacheKey = levelCacheKey(type, level);
  const geometry = cacheKey && primaryGeometries.get(cacheKey);
  return geometry || typeFallbackGeometries.get(type) || createFacilityFallbackGeometry(type);
}

export function getFacilityMaterial(type, level = 1) {
  const cacheKey = levelCacheKey(type, level);
  return (cacheKey && primaryMaterials.get(cacheKey)) || null;
}

// 모든 레벨 에셋이 실제 모델로 교체된 타입의 폴백 geometry는 다시 그려질 일이 없다.
// 씬이 메시 geometry를 갈아 끼운 뒤에 불러야 안전하다(교체 전에 버리면 다음 렌더에서
// 같은 버퍼를 다시 올린다).
export function disposeReplacedFallbackGeometries() {
  const replaced = [];
  typeFallbackGeometries.forEach((geometry, type) => {
    const assetIds = FACILITY_ASSET_IDS[type] || [];
    const fullyLoaded = assetIds.length > 0 && assetIds.every((assetId) => (
      Boolean(assetId) && primaryGeometries.has(assetCacheKey(assetId, CITY_ASSETS[type]?.height))
    ));
    if (fullyLoaded) replaced.push(type);
  });
  replaced.forEach((type) => typeFallbackGeometries.delete(type));
  disposeFacilityFallbacks(replaced);
  return replaced;
}

export function getAssetStatus() {
  return {
    state: status.state,
    loaded: [...status.loaded],
    fallbacks: [...status.fallbacks],
    errors: [...status.errors],
    // 타입당 대표(1레벨) 머티리얼만 보고한다 — 상위 레벨에서 실제로 다른 에셋을
    // 쓰더라도, 이 상태 리포트는 항상 타입 하나에 항목 하나를 유지한다.
    materials: Object.fromEntries(Object.keys(CITY_ASSETS).map((type) => {
      const material = getFacilityMaterial(type, 1);
      if (!material) return null;
      return [type, {
        assetId: material.userData?.assetId || null,
        paletteSampling: material.userData?.paletteSampling || null,
        paletteBlackLift: Boolean(material.userData?.paletteBlackLift),
        minFilter: material.map?.minFilter ?? null,
        magFilter: material.map?.magFilter ?? null,
        generateMipmaps: material.map?.generateMipmaps ?? null,
        materialUuid: material.uuid,
        textureUuid: material.map?.uuid || null,
      }];
    }).filter(Boolean)),
    cache: assetLoader.getStatus(),
  };
}

export async function disposeCityAssets() {
  // primaryGeometries/primaryMaterials는 성공적으로 불러온 실제 에셋만 담는다(폴백은
  // typeFallbackGeometries의 별도 캐시가 FacilityGeometryFactory에서 자체 관리한다).
  primaryGeometries.forEach((geometry) => geometry.dispose());
  primaryMaterials.forEach((material) => {
    material.map?.dispose?.();
    material.dispose();
  });
  primaryGeometries.clear();
  primaryMaterials.clear();
  typeFallbackGeometries.clear();
  disposeFacilityFallbacks();
  // GLB 원본은 아직 로딩 중일 수 있다 — 해제가 끝난 뒤에 반환해야 호출자가 VRAM 잔량을 잴 수 있다.
  await assetLoader.dispose();
  initPromise = null;
  status = { state: 'idle', loaded: [], fallbacks: [], errors: [] };
}
