import * as THREE from 'three';
import { mergeAssetPrimitives, prepareAssetGeometry } from '../assets/geometryUtils.js';
import {
  BOARD,
  COAST_PROP_ROTATION_OFFSETS,
  HEX_TILE_VISUALS,
  ISLAND_LAYER_ELEVATIONS,
} from '../core/Constants.js';
import { axialToWorld, createHexCoordinates, hexDistance } from '../systems/HexGridSystem.js';
import { configurePaletteMaterial } from '../level/CityAssetLoader.js';

const MATRIX_HELPER = new THREE.Object3D();
const ORIGIN = Object.freeze({ q: 0, r: 0 });
const MAX_ISLAND_RADIUS = BOARD.EXPANDED_RADIUS;
const SHORE_RADIUS = MAX_ISLAND_RADIUS + 1;
const WATER_RADIUS = 8;
const HEX_LONG_DIAMETER = BOARD.HEX_SIZE * 2;
const HEX_ROTATION_STEP = Math.PI / 3;

const COAST_INDEXES = Object.freeze({
  dock: Object.freeze([3, 15]),
  grassHill: Object.freeze([5, 9, 18, 22]),
  stoneHill: Object.freeze([7, 20]),
  forest: Object.freeze([0, 12]),
});

const WATER_INDEXES = Object.freeze({
  rocks: Object.freeze([1, 7, 13, 19, 25]),
  island: Object.freeze([4, 15, 26]),
  ship: Object.freeze([8, 26]),
});

function coordinateKey({ q, r }) {
  return `${q},${r}`;
}

function coordinatesAt(coordinates, indexes) {
  return indexes.map((index) => coordinates[index]).filter(Boolean);
}

function withoutCoordinates(coordinates, removedGroups) {
  const removed = new Set(removedGroups.flat().map(coordinateKey));
  return coordinates.filter((coordinate) => !removed.has(coordinateKey(coordinate)));
}

function radialBounds(geometry) {
  const positions = geometry.getAttribute('position');
  let minRadius = Infinity;
  let maxRadius = 0;
  for (let index = 0; index < positions.count; index++) {
    const radius = Math.hypot(positions.getX(index), positions.getZ(index));
    minRadius = Math.min(minRadius, radius);
    maxRadius = Math.max(maxRadius, radius);
  }
  return {
    minRadius: Number((Number.isFinite(minRadius) ? minRadius : 0).toFixed(3)),
    maxRadius: Number(maxRadius.toFixed(3)),
  };
}

export function snapHexRotation(angle) {
  return Math.round(angle / HEX_ROTATION_STEP) * HEX_ROTATION_STEP;
}

function firstMaterial(primitive, fallbackColor, assetId) {
  const source = Array.isArray(primitive?.material) ? primitive.material[0] : primitive?.material;
  const material = source?.clone() || new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.9 });
  return configurePaletteMaterial(material, assetId);
}

function setInstance(mesh, index, coordinate, y = -0.08, rotationY = 0, scale = 1) {
  const { x, z } = axialToWorld(coordinate, BOARD.HEX_SIZE);
  MATRIX_HELPER.position.set(x, y, z);
  MATRIX_HELPER.rotation.set(0, rotationY, 0);
  MATRIX_HELPER.scale.setScalar(scale);
  MATRIX_HELPER.updateMatrix();
  mesh.setMatrixAt(index, MATRIX_HELPER.matrix);
}

export function createCityEnvironment3D({ scene, assetLoader }) {
  const root = new THREE.Group();
  root.name = 'island-environment';
  scene.add(root);
  const resources = [];
  let loadPromise = null;
  let state = 'idle';
  const allCoordinates = createHexCoordinates(WATER_RADIUS);
  const landCoordinates = allCoordinates.filter((coordinate) => hexDistance(coordinate, ORIGIN) <= MAX_ISLAND_RADIUS);
  const shoreCoordinates = allCoordinates.filter((coordinate) => hexDistance(coordinate, ORIGIN) === SHORE_RADIUS);
  const waterCoordinates = allCoordinates.filter((coordinate) => {
    const distance = hexDistance(coordinate, ORIGIN);
    return distance >= SHORE_RADIUS + 1 && distance <= WATER_RADIUS;
  });
  const nearShoreWaterCoordinates = waterCoordinates.filter((coordinate) => hexDistance(coordinate, ORIGIN) === SHORE_RADIUS + 1);
  const shipRingCoordinates = waterCoordinates.filter((coordinate) => hexDistance(coordinate, ORIGIN) === SHORE_RADIUS + 2);
  const coastCoordinates = {
    dock: coordinatesAt(shoreCoordinates, COAST_INDEXES.dock),
    grassHill: coordinatesAt(shoreCoordinates, COAST_INDEXES.grassHill),
    stoneHill: coordinatesAt(shoreCoordinates, COAST_INDEXES.stoneHill),
    forest: coordinatesAt(shoreCoordinates, COAST_INDEXES.forest),
  };
  const detailedWaterCoordinates = {
    waterRocks: coordinatesAt(nearShoreWaterCoordinates, WATER_INDEXES.rocks),
    waterIsland: coordinatesAt(nearShoreWaterCoordinates, WATER_INDEXES.island),
    ship: coordinatesAt(shipRingCoordinates, WATER_INDEXES.ship),
  };
  const baseShoreCoordinates = withoutCoordinates(shoreCoordinates, Object.values(coastCoordinates));
  const baseWaterCoordinates = withoutCoordinates(waterCoordinates, [
    detailedWaterCoordinates.waterRocks,
    detailedWaterCoordinates.waterIsland,
  ]);
  // 모래/해안 모델은 얇아서 단독 배치하면 섬 가장자리가 꺼져 보인다.
  // 해안 전체에 물 타일 한 층을 먼저 깔고, 바깥 바다와 같은 InstancedMesh로 묶는다.
  const renderedWaterCoordinates = [...shoreCoordinates, ...baseWaterCoordinates];
  const stats = {
    landInstances: landCoordinates.length,
    shoreInstances: shoreCoordinates.length,
    waterInstances: waterCoordinates.length,
    shoreWaterSupportInstances: shoreCoordinates.length,
    renderedWaterInstances: shoreCoordinates.length + waterCoordinates.length,
    baseShoreInstances: baseShoreCoordinates.length,
    baseWaterInstances: baseWaterCoordinates.length,
    oceanPlane: false,
    environmentScale: 1,
    roadModels: [],
    treeInstances: 0,
    treeLayers: 0,
    rockInstances: 0,
    tileCoverage: {
      land: HEX_TILE_VISUALS.landCoverage,
      shore: HEX_TILE_VISUALS.shoreCoverage,
      water: HEX_TILE_VISUALS.waterCoverage,
    },
    layerElevations: {
      shore: ISLAND_LAYER_ELEVATIONS.shore,
      shoreWaterSupport: ISLAND_LAYER_ELEVATIONS.shoreWaterSupport,
      water: ISLAND_LAYER_ELEVATIONS.water,
    },
    coastalPropInstances: {
      dock: coastCoordinates.dock.length,
      grassHill: coastCoordinates.grassHill.length,
      stoneHill: coastCoordinates.stoneHill.length,
      forest: coastCoordinates.forest.length,
      waterRocks: detailedWaterCoordinates.waterRocks.length,
      waterIsland: detailedWaterCoordinates.waterIsland.length,
      ship: detailedWaterCoordinates.ship.length,
    },
    coastalPropRotations: {
      dock: [],
    },
    coastalPropLayers: 0,
    coastalBounds: { minRadius: 0, maxRadius: 0 },
    vehicleInstances: 0,
    citizenInstances: 0,
    fallbackLayers: [],
    errors: [],
  };

  const own = (resource) => {
    resources.push(resource);
    return resource;
  };

  async function terrainResources(id, fallbackColor, coverage) {
    const targetFootprint = HEX_LONG_DIAMETER * coverage;
    try {
      const primitives = await assetLoader.getPrimitives(id);
      if (!primitives.length) throw new Error(`${id} contains no mesh primitive`);
      return {
        // Hexagon Kit의 footprint는 긴 지름(z) 기준이다. 높이 제한을 넉넉히 두어
        // 평평한 타일도 footprint가 중심 간격을 정확히 덮도록 한다.
        geometry: own(prepareAssetGeometry(primitives, targetFootprint, targetFootprint)),
        material: own(firstMaterial(primitives[0], fallbackColor, id)),
      };
    } catch (error) {
      stats.fallbackLayers.push(id);
      stats.errors.push(error?.message || String(error));
      return {
        geometry: own(new THREE.CylinderGeometry(
          BOARD.HEX_SIZE * coverage,
          BOARD.HEX_SIZE * coverage,
          0.12,
          6,
        )),
        material: own(new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.94 })),
      };
    }
  }

  async function addTerrainLayer({
    id,
    name,
    coordinates,
    fallbackColor,
    y,
    yForIndex,
    coverage,
    radial = false,
  }) {
    const { geometry, material } = await terrainResources(id, fallbackColor, coverage);
    const mesh = new THREE.InstancedMesh(geometry, material, coordinates.length);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    coordinates.forEach((coordinate, index) => {
      const { x, z } = axialToWorld(coordinate, BOARD.HEX_SIZE);
      const rotation = radial
        ? snapHexRotation(Math.atan2(z, x) + Math.PI / 2)
        : (index % 6) * HEX_ROTATION_STEP;
      setInstance(mesh, index, coordinate, yForIndex ? yForIndex(index) : y, rotation);
    });
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    return mesh;
  }

  async function addDecoration({ id, name, coordinates, targetHeight, targetFootprint, fallbackColor, y = -0.01 }) {
    try {
      const primitives = await assetLoader.getPrimitives(id);
      if (!primitives.length) return;
      const geometry = own(prepareAssetGeometry(primitives, targetHeight, targetFootprint));
      const material = own(firstMaterial(primitives[0], fallbackColor, id));
      const mesh = new THREE.InstancedMesh(geometry, material, coordinates.length);
      mesh.name = name;
      mesh.frustumCulled = false;
      coordinates.forEach((coordinate, index) => setInstance(mesh, index, coordinate, y, index * 1.91, 0.9 + (index % 2) * 0.08));
      mesh.instanceMatrix.needsUpdate = true;
      root.add(mesh);
    } catch (error) {
      stats.errors.push(error?.message || String(error));
    }
  }

  async function addStaticCoastCollection(layers) {
    const templates = [];
    const placedGeometries = [];
    let material = null;
    try {
      const transformedPrimitives = [];
      for (const layer of layers) {
        const primitives = await assetLoader.getPrimitives(layer.id);
        if (!primitives.length) throw new Error(`${layer.id} contains no mesh primitive`);
        const targetFootprint = HEX_LONG_DIAMETER * HEX_TILE_VISUALS.shoreCoverage;
        const geometry = prepareAssetGeometry(primitives, targetFootprint, targetFootprint);
        templates.push(geometry);
        if (!material) material = firstMaterial(primitives[0], layer.fallbackColor, layer.id);
        layer.coordinates.forEach((coordinate, index) => {
          const { x, z } = axialToWorld(coordinate, BOARD.HEX_SIZE);
          const baseRotation = layer.radial
            ? snapHexRotation(Math.atan2(z, x) + Math.PI / 2)
            : (index % 6) * HEX_ROTATION_STEP;
          const rotation = baseRotation + (layer.rotationOffset || 0);
          if (layer.rotationStatKey) stats.coastalPropRotations[layer.rotationStatKey].push(rotation);
          const placedGeometry = geometry.clone();
          placedGeometry.rotateY(rotation);
          placedGeometry.translate(x, ISLAND_LAYER_ELEVATIONS.shore, z);
          placedGeometries.push(placedGeometry);
          transformedPrimitives.push({ geometry: placedGeometry });
        });
      }
      const geometry = own(mergeAssetPrimitives(transformedPrimitives));
      stats.coastalBounds = radialBounds(geometry);
      const mesh = new THREE.Mesh(geometry, own(material));
      mesh.name = 'coast-static-details';
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    } catch (error) {
      material?.dispose?.();
      stats.errors.push(error?.message || String(error));
    } finally {
      placedGeometries.forEach((geometry) => geometry.dispose());
      templates.forEach((geometry) => geometry.dispose());
    }
  }

  function addOceanPlane() {
    const geometry = own(new THREE.PlaneGeometry(28, 28));
    const material = own(new THREE.MeshStandardMaterial({
      color: 0x2f86b7,
      roughness: 0.72,
      metalness: 0.04,
    }));
    const ocean = new THREE.Mesh(geometry, material);
    ocean.name = 'island-ocean-plane';
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = ISLAND_LAYER_ELEVATIONS.ocean;
    root.add(ocean);
    stats.oceanPlane = true;
  }

  function loadIdle() {
    if (loadPromise) return loadPromise;
    state = 'loading';
    addOceanPlane();
    loadPromise = Promise.all([
      addTerrainLayer({ id: 'terrain.hexGrass', name: 'island-land', coordinates: landCoordinates, fallbackColor: 0x6fa861, y: ISLAND_LAYER_ELEVATIONS.land, coverage: HEX_TILE_VISUALS.landCoverage }),
      addTerrainLayer({ id: 'terrain.hexDirt', name: 'island-shore', coordinates: baseShoreCoordinates, fallbackColor: 0xb89b69, y: ISLAND_LAYER_ELEVATIONS.shore, coverage: HEX_TILE_VISUALS.shoreCoverage }),
      addTerrainLayer({
        id: 'terrain.hexWater',
        name: 'island-water-ring',
        coordinates: renderedWaterCoordinates,
        fallbackColor: 0x3d9bc7,
        y: ISLAND_LAYER_ELEVATIONS.water,
        yForIndex: (index) => (
          index < shoreCoordinates.length
            ? ISLAND_LAYER_ELEVATIONS.shoreWaterSupport
            : ISLAND_LAYER_ELEVATIONS.water
        ),
        coverage: HEX_TILE_VISUALS.waterCoverage,
      }),
      addStaticCoastCollection([
        {
          id: 'environment.coast.dock',
          coordinates: coastCoordinates.dock,
          fallbackColor: 0xc68c66,
          radial: true,
          rotationOffset: COAST_PROP_ROTATION_OFFSETS.dock,
          rotationStatKey: 'dock',
        },
        { id: 'environment.coast.grassHill', coordinates: coastCoordinates.grassHill, fallbackColor: 0x5f9b58 },
        { id: 'environment.coast.stoneHill', coordinates: coastCoordinates.stoneHill, fallbackColor: 0x71808a },
        { id: 'environment.coast.forest', coordinates: coastCoordinates.forest, fallbackColor: 0x4f8b49 },
      ]),
      addTerrainLayer({ id: 'environment.water.rocks', name: 'nearshore-rocks', coordinates: detailedWaterCoordinates.waterRocks, fallbackColor: 0x4b9dc2, y: ISLAND_LAYER_ELEVATIONS.water, coverage: HEX_TILE_VISUALS.waterCoverage }),
      addTerrainLayer({ id: 'environment.water.island', name: 'nearshore-islands', coordinates: detailedWaterCoordinates.waterIsland, fallbackColor: 0xcaa66c, y: ISLAND_LAYER_ELEVATIONS.water, coverage: HEX_TILE_VISUALS.waterCoverage }),
      addDecoration({ id: 'environment.water.ship', name: 'nearshore-ships', coordinates: detailedWaterCoordinates.ship, targetHeight: 0.14, targetFootprint: 0.42, fallbackColor: 0xad6847, y: ISLAND_LAYER_ELEVATIONS.ship }),
    ]).then(() => {
      stats.treeInstances = coastCoordinates.forest.length;
      stats.treeLayers = coastCoordinates.forest.length ? 1 : 0;
      stats.rockInstances = coastCoordinates.stoneHill.length + detailedWaterCoordinates.waterRocks.length;
      stats.coastalPropLayers = 4;
      state = 'ready';
    });
    return loadPromise;
  }

  // 플레이 영역 확장은 클릭 가능한 셀만 늘린다. 섬 전체 크기는 처음부터 고정이다.
  function setBoardRadius() {
    root.scale.setScalar(1);
  }

  function setTheme(theme) {
    root.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if ('envMapIntensity' in material) material.envMapIntensity = theme === 'light' ? 0.55 : 0.35;
        if (object.name === 'island-ocean-plane') material.color?.setHex(theme === 'light' ? 0x65b9d6 : 0x2f86b7);
      });
    });
  }

  function getStats() {
    return { state, ...stats };
  }

  function dispose() {
    root.removeFromParent();
    resources.forEach((resource) => resource?.dispose?.());
    resources.length = 0;
  }

  return { loadIdle, setBoardRadius, setTheme, getStats, dispose };
}
