import { assetLoader } from '../assets/AssetLoader.js';
import { FACILITY_ASSET_IDS } from '../assets/assetRegistry.js';
import { prepareAssetGeometry } from '../assets/geometryUtils.js';
import { CITY_ASSET_FOOTPRINT, CITY_ASSETS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { createFacilityFallbackGeometry, disposeFacilityFallbacks } from './FacilityGeometryFactory.js';
import * as THREE from 'three';

// 지오메트리/머티리얼은 시설 타입이 아니라 실제 에셋 id로 캐시한다. 한 타입 안에서
// 레벨마다 다른 에셋을 쓸 수 있고(예: 화력발전 1~3단계), 반대로 여러 레벨이 같은 에셋을
// 공유하면(예: 대부분의 시설) 자연히 한 번만 로드된다.
const primaryGeometries = new Map();
const primaryMaterials = new Map();
const typeFallbackGeometries = new Map();
let initPromise = null;
let status = { state: 'idle', loaded: [], fallbacks: [], errors: [] };

function levelAssetId(type, level = 1) {
  const ids = FACILITY_ASSET_IDS[type];
  if (!ids?.length) return null;
  const index = Math.max(0, Math.min(ids.length - 1, Math.trunc(level) - 1));
  return ids[index] || ids[0];
}

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

  // 한 시설 타입이 레벨마다 서로 다른 에셋을 참조할 수 있으므로, 전체 타입에서 실제로
  // 쓰이는 고유 에셋 id를 모아 한 번씩만 로드한다(같은 id를 쓰는 레벨/타입은 캐시를
  // 공유한다 — 예: 순환냉각과 조력이 둘 다 storageTank를 1레벨로 쓰는 경우).
  const definitionByAssetId = new Map();
  definitions.forEach(([type, definition]) => {
    (FACILITY_ASSET_IDS[type] || []).forEach((assetId) => {
      if (!assetId || definitionByAssetId.has(assetId)) return;
      definitionByAssetId.set(assetId, definition);
    });
  });
  const jobs = [...definitionByAssetId.entries()].map(([assetId, definition]) => ({ assetId, definition }));

  let completed = 0;
  initPromise = Promise.all(jobs.map(async ({ assetId, definition }) => {
    try {
      const { geometry, material } = await loadFacilityAsset(assetId, definition);
      primaryGeometries.set(assetId, geometry);
      if (material) primaryMaterials.set(assetId, material);
    } catch (error) {
      // Quaternius energy downloads need manual acquisition, so code geometry is expected.
      if (!assetId.startsWith('energy.')) {
        status.errors.push(`${assetId}: ${error?.message || error}`);
      }
    } finally {
      completed += 1;
      onProgress(completed, jobs.length);
    }
  })).then(() => {
    // 로딩 자체는 에셋 id 단위로 한 번씩만 하지만, 성공/폴백 보고는 타입 단위로 따로 집계한다 —
    // 여러 타입이 같은 1레벨 에셋을 공유해도(예: 순환냉각·조력) 모든 타입이 각자 보고된다.
    definitions.forEach(([type]) => {
      const primaryAssetId = FACILITY_ASSET_IDS[type]?.[0];
      (primaryAssetId && primaryGeometries.has(primaryAssetId) ? status.loaded : status.fallbacks).push(type);
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
  const assetId = levelAssetId(type, level);
  const geometry = assetId && primaryGeometries.get(assetId);
  return geometry || typeFallbackGeometries.get(type) || createFacilityFallbackGeometry(type);
}

export function getFacilityMaterial(type, level = 1) {
  const assetId = levelAssetId(type, level);
  return (assetId && primaryMaterials.get(assetId)) || null;
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

export function disposeCityAssets() {
  // primaryGeometries/primaryMaterials는 성공적으로 불러온 실제 에셋만 담는다(폴백은
  // typeFallbackGeometries의 별도 캐시가 FacilityGeometryFactory에서 자체 관리한다).
  primaryGeometries.forEach((geometry) => geometry.dispose());
  primaryMaterials.forEach((material) => material.dispose());
  primaryGeometries.clear();
  primaryMaterials.clear();
  typeFallbackGeometries.clear();
  assetLoader.dispose();
  initPromise = null;
  status = { state: 'idle', loaded: [], fallbacks: [], errors: [] };
  disposeFacilityFallbacks();
}
