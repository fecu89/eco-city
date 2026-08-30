import * as THREE from 'three';
import {
  BOARD,
  CITY_AMBIENT,
  CITY_ASSETS,
  CITY_BUILDING_ORIENTATION,
  CITY_CAMERA,
  CITY_MOTION,
  facilityColorFor,
  HEX_TILE_VISUALS,
  LEVEL_VISUALS,
  THEME_SCHEMAS,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { assetLoader } from '../assets/AssetLoader.js';
import {
  getCityNeutralTexture,
  getFacilityGeometry,
  getFacilityMaterial,
  getSupplementGeometry,
  initCityAssets,
} from '../level/CityAssetLoader.js';
import { createCameraController } from '../systems/CameraController.js';
import { createBirdVisitController } from '../systems/AmbientBirdSystem.js';
import { getSkyState, getWorldPhase } from '../systems/ClimateSystem.js';
import { axialToWorld, createHexCoordinates } from '../systems/HexGridSystem.js';
import { createCityEnvironment3D } from './CityEnvironment3D.js';

// 모든 레이어는 씬 수명 동안 유지된다. 상태 갱신은 instance matrix/color/count만 바꾸므로
// 시설 선택 미리보기나 연속 배치 때 WebGL 버퍼를 생성·삭제하지 않는다.
const MAX_CELLS = BOARD.EXPANDED_CELLS;
const TILE_BASE_COLOR = 0x0d1f31;
const FACILITY_TYPES = Object.keys(CITY_ASSETS);
const SUPPLEMENT_TYPES = FACILITY_TYPES.filter((type) => CITY_ASSETS[type].supplement);
const ENERGY_SOURCE_TYPES = new Set(CITY_AMBIENT.ENERGY_SOURCES);
const RENEWABLE_SOURCE_TYPES = new Set(['solar', 'wind', 'tidal']);
const MAX_ENERGY_LINKS = MAX_CELLS * CITY_AMBIENT.MAX_NEIGHBORS_PER_CELL;
const MAX_AMBIENT_AGENTS = (
  MAX_CELLS * CITY_AMBIENT.RESIDENT_AGENTS_PER_CELL
  + 3
);
const MAX_BUILDING_LIGHTS = MAX_CELLS * 3;
const BIRD_POOL_SIZE = 3;

const TILE_COLORS = {
  base: new THREE.Color(TILE_BASE_COLOR),
  selected: new THREE.Color(0x123047),
  unknown: new THREE.Color(0x152233),
  problem: new THREE.Color(0x3a1520),
  ok: new THREE.Color(0x16352c),
  previewGood: new THREE.Color(0x18402f),
  previewBad: new THREE.Color(0x3a1a20),
  newLand: new THREE.Color(0x1a3a30),
};

const MARKER_COLORS = {
  selected: new THREE.Color(0x54e4ff),
  good: new THREE.Color(0x71f5b4),
  warn: new THREE.Color(0xffd166),
  problem: new THREE.Color(0xff6b7a),
  unknown: new THREE.Color(0x6e8199),
};

const _matrixObject = new THREE.Object3D();
const _color = new THREE.Color();
const _identityQuaternion = new THREE.Quaternion();

let renderer;
let scene;
let camera;
let cameraController;
let canvasEl;
let containerEl;
let cameraHintEl;
let cameraResetEl;
let resizeObserver;
let cameraInteractionReady = false;
let currentRadius = BOARD.INITIAL_RADIUS;
let currentCoords = createHexCoordinates(currentRadius);
let currentConfigs = [];
let onCellClickCb = () => {};
let raycaster;
let pointer;
let resourceRevision = 0;
let needsRender = true;
let renderCount = 0;
let ambientInstances = 0;
let currentTheme = 'dark';
let energyLinkCount = 0;
let energyPacketCount = 0;
let energyBlinkCount = 0;
let energyBlinkTimer = null;
let energyBlinkRestoreTimer = null;
let residentAgentCount = 0;
let birdCount = 0;
let birdPoolStart = 0;
let birdVisit = null;
let birdVisitController = null;
let cityEnvironment = null;
let ghostMesh;
let ghostMaterial;
let hoveredPreviewIndex = -1;
let buildPreviewMode = { enabled: false, type: null, candidateIndex: null };
let currentWorldHour = 8;
let currentSkyState = getSkyState(currentWorldHour);
let visualHourOverride = null;

let tileMesh;
let stateRingMesh;
let windRotorMesh;
let energyLines;
let energyLinePositions;
let energyLineColors;
let ambientAgentMesh;
let buildingLightMesh;
let buildingLightMaterial;
let energyLineMaterial;
let facilityMaterial;
let tileMaterial;
let stateRingMaterial;
let hemisphereLight;
let sunLight;
let rimLight;
const facilityMeshes = new Map();
const supplementMeshes = new Map();
const typeCellIndices = new Map(FACILITY_TYPES.map((type) => [type, []]));
const energyLinks = [];
let currentPowerRoutes = [];
let worldPhase = getWorldPhase(8);
const residentialIndices = [];
const greenIndices = [];
const activeMotions = new Map();
const ownedGeometries = new Set();
const ownedMaterials = new Set();

function applyWorldTheme({ theme, schema } = {}) {
  currentTheme = THEME_SCHEMAS[theme] ? theme : document.documentElement.dataset.theme || 'dark';
  const activeSchema = schema || THEME_SCHEMAS[currentTheme] || THEME_SCHEMAS.dark;
  const world = activeSchema.world;
  renderer?.setClearColor(currentSkyState.bottomColor, 0);
  TILE_COLORS.base.setHex(world.tile);
  TILE_COLORS.selected.setHex(world.selectedTile);
  if (hemisphereLight) {
    hemisphereLight.color.setHex(world.hemisphereSky);
    hemisphereLight.groundColor.setHex(world.hemisphereGround);
  }
  rimLight?.color.setHex(world.rim);
  cityEnvironment?.setTheme(currentTheme);
  applyWorldHour(currentWorldHour, true);
  if (tileMesh && currentConfigs.length) updateTileInstances(currentConfigs, currentCoords);
  needsRender = true;
}

const WORLD_LIGHTING = Object.freeze({
  dawn: { sun: 0.92, hemisphere: 0.94, rim: 0.4, sunColor: 0xffc89d },
  day: { sun: 1.22, hemisphere: 1.08, rim: 0.3, sunColor: 0xffffff },
  dusk: { sun: 0.86, hemisphere: 0.9, rim: 0.48, sunColor: 0xffaa83 },
  night: { sun: 0.34, hemisphere: 0.7, rim: 0.64, sunColor: 0x9fbdff },
});

function applyWorldPhase(nextPhase, force = false) {
  if (!force && nextPhase === worldPhase) return false;
  worldPhase = WORLD_LIGHTING[nextPhase] ? nextPhase : 'day';
  const lighting = WORLD_LIGHTING[worldPhase];
  if (sunLight) {
    sunLight.intensity = lighting.sun;
    sunLight.color.setHex(lighting.sunColor);
  }
  if (hemisphereLight) hemisphereLight.intensity = lighting.hemisphere;
  if (rimLight) rimLight.intensity = lighting.rim;
  needsRender = true;
  return true;
}

function cssHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function paintSky(state) {
  if (!canvasEl) return;
  canvasEl.style.background = `linear-gradient(${cssHex(state.topColor)} 0%, ${cssHex(state.bottomColor)} 34%, ${cssHex(state.bottomColor)} 100%)`;
}

export function applyWorldHour(hour, force = false) {
  const next = getSkyState(hour);
  if (!force && currentWorldHour === next.hour) return false;
  currentWorldHour = next.hour;
  currentSkyState = next;
  renderer?.setClearColor(next.bottomColor, 0);
  paintSky(next);
  applyWorldPhase(next.phase, force);
  updateBuildingLightInstances();
  needsRender = true;
  return true;
}

// 연속 시계는 DOM 하늘 그라데이션만 갱신한다. Three.js 조명과 창문은 정수 시간 정산 때만 갱신한다.
export function setVisualWorldHour(hour) {
  if (visualHourOverride != null) return currentSkyState;
  applyWorldHour(hour, true);
  return currentSkyState;
}

function ownGeometry(geometry) {
  ownedGeometries.add(geometry);
  return geometry;
}

function ownMaterial(material) {
  ownedMaterials.add(material);
  return material;
}

function setInstance(mesh, instanceIndex, x, y, z, scale, rotationX = 0, rotationY = 0) {
  _matrixObject.position.set(x, y, z);
  _matrixObject.rotation.set(rotationX, rotationY, 0);
  _matrixObject.scale.set(scale, scale, scale);
  _matrixObject.updateMatrix();
  mesh.setMatrixAt(instanceIndex, _matrixObject.matrix);
}

function setRotatedInstance(mesh, instanceIndex, x, y, z, scale, rotationZ) {
  _matrixObject.position.set(x, y, z);
  _matrixObject.rotation.set(0, 0, rotationZ);
  _matrixObject.scale.set(scale, scale, scale);
  _matrixObject.updateMatrix();
  mesh.setMatrixAt(instanceIndex, _matrixObject.matrix);
}

function setBoxInstance(mesh, instanceIndex, x, y, z, sx, sy, sz) {
  _matrixObject.position.set(x, y, z);
  _matrixObject.quaternion.copy(_identityQuaternion);
  _matrixObject.scale.set(sx, sy, sz);
  _matrixObject.updateMatrix();
  mesh.setMatrixAt(instanceIndex, _matrixObject.matrix);
}

function setAmbientInstance(mesh, instanceIndex, x, y, z, sx, sy, sz, rotationY = 0) {
  _matrixObject.position.set(x, y, z);
  _matrixObject.rotation.set(0, rotationY, 0);
  _matrixObject.scale.set(sx, sy, sz);
  _matrixObject.updateMatrix();
  mesh.setMatrixAt(instanceIndex, _matrixObject.matrix);
}

function finishInstances(mesh, count) {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function pixelRatioCap() {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  return coarsePointer || window.innerWidth <= 760 ? 1.25 : 1.5;
}

function makeInstancedMesh(geometry, material, capacity) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  return mesh;
}

function createRotorGeometry() {
  const vertices = [];
  const innerRadius = 0.055;
  const outerRadius = 0.29;
  const innerHalfWidth = 0.036;
  const outerHalfWidth = 0.015;
  for (let blade = 0; blade < 3; blade++) {
    const angle = (blade * Math.PI * 2) / 3;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const px = -dy;
    const py = dx;
    const ax = dx * innerRadius + px * innerHalfWidth;
    const ay = dy * innerRadius + py * innerHalfWidth;
    const bx = dx * innerRadius - px * innerHalfWidth;
    const by = dy * innerRadius - py * innerHalfWidth;
    const cx = dx * outerRadius - px * outerHalfWidth;
    const cy = dy * outerRadius - py * outerHalfWidth;
    const dx2 = dx * outerRadius + px * outerHalfWidth;
    const dy2 = dy * outerRadius + py * outerHalfWidth;
    vertices.push(
      ax, ay, 0, bx, by, 0, cx, cy, 0,
      ax, ay, 0, cx, cy, 0, dx2, dy2, 0,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCornerMarkerGeometry() {
  const vertices = [];
  const outer = 0.38;
  const inner = 0.23;
  const thickness = 0.032;
  const addQuad = (x1, y1, x2, y2) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    vertices.push(
      minX, minY, 0, maxX, minY, 0, maxX, maxY, 0,
      minX, minY, 0, maxX, maxY, 0, minX, maxY, 0,
    );
  };
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sy) => {
      addQuad(sx * outer, sy * outer - thickness, sx * inner, sy * outer + thickness);
      addQuad(sx * outer - thickness, sy * outer, sx * outer + thickness, sy * inner);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSceneLayers() {
  tileMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 }));
  tileMesh = makeInstancedMesh(
    ownGeometry(new THREE.CylinderGeometry(
      BOARD.HEX_SIZE * HEX_TILE_VISUALS.cityCoverage,
      BOARD.HEX_SIZE * HEX_TILE_VISUALS.cityCoverage,
      0.12,
      6,
    )),
    tileMaterial,
    MAX_CELLS,
  );
  tileMesh.name = 'city-tiles';

  facilityMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.08,
  }));
  FACILITY_TYPES.forEach((type) => {
    const mesh = makeInstancedMesh(getFacilityGeometry(type), facilityMaterial, MAX_CELLS);
    mesh.name = `facility-${type}`;
    facilityMeshes.set(type, mesh);
  });

  ghostMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0x71f5b4,
    emissive: 0x71f5b4,
    emissiveIntensity: 0.32,
    roughness: 0.52,
    metalness: 0.04,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  }));
  ghostMesh = new THREE.Mesh(getFacilityGeometry(FACILITY_TYPES[0]), ghostMaterial);
  ghostMesh.name = 'facility-build-ghost';
  ghostMesh.visible = false;
  ghostMesh.renderOrder = 8;
  scene.add(ghostMesh);

  const supplementPlaceholder = ownGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
  SUPPLEMENT_TYPES.forEach((type) => {
    const mesh = makeInstancedMesh(supplementPlaceholder, facilityMaterial, MAX_CELLS);
    mesh.name = `facility-${type}-supplement`;
    supplementMeshes.set(type, mesh);
  });

  stateRingMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
  }));
  stateRingMesh = makeInstancedMesh(
    ownGeometry(createCornerMarkerGeometry()),
    stateRingMaterial,
    MAX_CELLS,
  );
  stateRingMesh.name = 'cell-state-rings';

  const rotorMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0xd8f7ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.86,
  }));
  windRotorMesh = makeInstancedMesh(ownGeometry(createRotorGeometry()), rotorMaterial, MAX_CELLS);
  windRotorMesh.name = 'wind-rotors';

  buildingLightMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0xffdf8a,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  }));
  buildingLightMesh = makeInstancedMesh(
    ownGeometry(new THREE.BoxGeometry(1, 1, 1)),
    buildingLightMaterial,
    MAX_BUILDING_LIGHTS,
  );
  buildingLightMesh.name = 'building-window-lights';

  energyLinePositions = new Float32Array(MAX_ENERGY_LINKS * 2 * 3);
  energyLineColors = new Float32Array(MAX_ENERGY_LINKS * 2 * 3);
  const energyLineGeometry = ownGeometry(new THREE.BufferGeometry());
  energyLineGeometry.setAttribute('position', new THREE.BufferAttribute(energyLinePositions, 3).setUsage(THREE.DynamicDrawUsage));
  energyLineGeometry.setAttribute('color', new THREE.BufferAttribute(energyLineColors, 3).setUsage(THREE.DynamicDrawUsage));
  energyLineGeometry.setDrawRange(0, 0);
  energyLineMaterial = ownMaterial(new THREE.LineBasicMaterial({
    transparent: true,
    opacity: CITY_AMBIENT.ENERGY_LINE_BASE_OPACITY,
    vertexColors: true,
    depthWrite: false,
  }));
  energyLines = new THREE.LineSegments(energyLineGeometry, energyLineMaterial);
  energyLines.frustumCulled = false;
  energyLines.name = 'energy-links';
  scene.add(energyLines);

  const ambientAgentMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  }));
  ambientAgentMesh = makeInstancedMesh(
    ownGeometry(new THREE.BoxGeometry(1, 1, 1)),
    ambientAgentMaterial,
    MAX_AMBIENT_AGENTS,
  );
  ambientAgentMesh.name = 'living-city-agents';
  resourceRevision++;
}

function prewarmGpuBuffers() {
  const instanceLayers = [
    tileMesh,
    ...facilityMeshes.values(),
    ...supplementMeshes.values(),
    stateRingMesh,
    windRotorMesh,
    ambientAgentMesh,
    buildingLightMesh,
  ];
  instanceLayers.forEach((mesh) => {
    setInstance(mesh, 0, 100, 100, 100, 0.001);
    mesh.setColorAt(0, _color.setHex(0xffffff));
    finishInstances(mesh, 1);
  });
  energyLinePositions[0] = 100;
  energyLinePositions[1] = 100;
  energyLinePositions[2] = 100;
  energyLinePositions[3] = 101;
  energyLinePositions[4] = 100;
  energyLinePositions[5] = 100;
  energyLines.geometry.setDrawRange(0, 2);
  energyLines.geometry.attributes.position.needsUpdate = true;
  energyLines.geometry.attributes.color.needsUpdate = true;
  camera.position.set(4, 6, 6);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  instanceLayers.forEach((mesh) => { mesh.count = 0; });
  energyLines.geometry.setDrawRange(0, 0);
}

function refreshLoadedAssets() {
  FACILITY_TYPES.forEach((type) => {
    const mesh = facilityMeshes.get(type);
    mesh.geometry = getFacilityGeometry(type);
    const material = getFacilityMaterial(type);
    if (material) {
      const runtimeMaterial = material.clone();
      if (runtimeMaterial.userData?.paletteBlackLift) {
        // 원본 팔레트의 창문·지붕·배관 디테일은 유지하되 순검정 영역만 살짝 들어 올린다.
        runtimeMaterial.emissive.setHex(0x101820);
        runtimeMaterial.emissiveIntensity = 0.18;
      }
      runtimeMaterial.color.setHex(0xffffff);
      runtimeMaterial.userData.facilityPaletteMode = runtimeMaterial.map ? 'textured-tint' : 'solid-tint';
      runtimeMaterial.needsUpdate = true;
      mesh.material = ownMaterial(runtimeMaterial);
    }
  });
  SUPPLEMENT_TYPES.forEach((type) => {
    const geometry = getSupplementGeometry(type);
    if (geometry) supplementMeshes.get(type).geometry = geometry;
  });
  const texture = getCityNeutralTexture();
  if (texture) {
    facilityMaterial.map = texture;
    facilityMaterial.needsUpdate = true;
  }
  resourceRevision++;
  updateInstances(currentConfigs, currentCoords);
  updateStaticAmbientInstances();
  syncBuildGhost();
  needsRender = true;
}

function tileColorFor(config) {
  if (config.previewGood) return TILE_COLORS.previewGood;
  if (config.previewBad) return TILE_COLORS.previewBad;
  if (config.newLand) return TILE_COLORS.newLand;
  if (config.diagnosisState === 'problem') return TILE_COLORS.problem;
  if (config.diagnosisState === 'ok') return TILE_COLORS.ok;
  if (config.diagnosisState === 'unknown') return TILE_COLORS.unknown;
  if (config.selected) return TILE_COLORS.selected;
  return TILE_COLORS.base;
}

function markerColorFor(config) {
  if (config.diagnosisTarget) return MARKER_COLORS.selected;
  if (config.previewBad || config.diagnosisState === 'problem') return MARKER_COLORS.problem;
  if (config.previewGood || config.newLand || config.diagnosisState === 'ok') return MARKER_COLORS.good;
  if (config.diagnosisState === 'unknown') return MARKER_COLORS.unknown;
  if (config.selected) return MARKER_COLORS.selected;
  return null;
}

function worldPosition(index, coordinates = currentCoords) {
  const coord = coordinates[index];
  return coord ? axialToWorld(coord, BOARD.HEX_SIZE) : { x: 0, z: 0 };
}

function rebuildAmbientTopology() {
  energyLinks.length = 0;
  residentialIndices.length = 0;
  greenIndices.length = 0;

  currentConfigs.forEach((config, index) => {
    if (!config || config.empty || !config.type) return;
    if (config.type === 'residential') residentialIndices.push(index);
    if (config.type === 'green') greenIndices.push(index);
  });

  applyPowerRoutes(currentPowerRoutes);

  energyPacketCount = 0;
  residentAgentCount = residentialIndices.length * CITY_AMBIENT.RESIDENT_AGENTS_PER_CELL;
  birdCount = 0;
  birdVisit = null;
  updateStaticAmbientInstances();
}

function pushEnergySegment(sourceIndex, targetIndex, color) {
  if (energyLinks.length >= MAX_ENERGY_LINKS) return;
  const source = currentConfigs[sourceIndex];
  const target = currentConfigs[targetIndex];
  if (!source || source.empty || !target || target.empty) return;
  energyLinks.push({ sourceIndex, targetIndex, color });
}

function applyPowerRoutes(routes = []) {
  energyLinks.length = 0;
  routes.forEach((route) => {
    const source = currentConfigs[route.from];
    if (!source || !ENERGY_SOURCE_TYPES.has(source.type)) return;
    const color = RENEWABLE_SOURCE_TYPES.has(source.type)
      ? CITY_AMBIENT.COLORS.renewableEnergy
      : CITY_AMBIENT.COLORS.conventionalEnergy;
    if (route.via != null && route.via !== route.from && route.via !== route.to) {
      pushEnergySegment(route.from, route.via, color);
      pushEnergySegment(route.via, route.to, color);
    } else {
      pushEnergySegment(route.from, route.to, color);
    }
  });

  energyLinks.forEach((link, linkIndex) => {
    const offset = linkIndex * 6;
    const sourcePosition = worldPosition(link.sourceIndex);
    const targetPosition = worldPosition(link.targetIndex);
    energyLinePositions[offset] = sourcePosition.x;
    energyLinePositions[offset + 1] = CITY_AMBIENT.ENERGY_LINE_HEIGHT;
    energyLinePositions[offset + 2] = sourcePosition.z;
    energyLinePositions[offset + 3] = targetPosition.x;
    energyLinePositions[offset + 4] = CITY_AMBIENT.ENERGY_LINE_HEIGHT;
    energyLinePositions[offset + 5] = targetPosition.z;
    _color.setHex(link.color);
    for (let vertexOffset = 0; vertexOffset < 2; vertexOffset++) {
      const colorOffset = offset + vertexOffset * 3;
      energyLineColors[colorOffset] = _color.r;
      energyLineColors[colorOffset + 1] = _color.g;
      energyLineColors[colorOffset + 2] = _color.b;
    }
  });
  energyLines.geometry.setDrawRange(0, energyLinks.length * 2);
  energyLines.geometry.attributes.position.needsUpdate = true;
  energyLines.geometry.attributes.color.needsUpdate = true;

  energyLinkCount = energyLinks.length;
  syncEnergyBlinkTimer();
  needsRender = true;
}

function handleSimulationTick(payload) {
  currentPowerRoutes = Array.isArray(payload?.power?.routes) ? payload.power.routes.map((route) => ({ ...route })) : [];
  applyPowerRoutes(currentPowerRoutes);
}

function updateStaticAmbientInstances() {
  const windIndices = typeCellIndices.get('wind');
  const rotorIndices = windIndices;
  rotorIndices.forEach((cellIndex, instanceIndex) => {
    const config = visualConfigAt(currentConfigs, cellIndex);
    const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
    const position = worldPosition(cellIndex);
    setRotatedInstance(
      windRotorMesh,
      instanceIndex,
      position.x,
      0.78 * level.scale,
      position.z + 0.015,
      level.scale,
      cellIndex * 0.23,
    );
    windRotorMesh.setColorAt(instanceIndex, _color.setHex(facilityColorFor('wind', config.level)).lerp(MARKER_COLORS.good, 0.35));
  });
  finishInstances(windRotorMesh, rotorIndices.length);

  let agentCount = 0;
  residentialIndices.forEach((cellIndex) => {
    const { x: centerX, z: centerZ } = worldPosition(cellIndex);
    const personAngle = cellIndex * CITY_AMBIENT.PERSON_ANGLE_PER_CELL;
    const [personScaleX, personScaleY, personScaleZ] = CITY_AMBIENT.PERSON_SCALE;
    setAmbientInstance(
      ambientAgentMesh,
      agentCount,
      centerX + Math.cos(personAngle) * CITY_AMBIENT.PERSON_ORBIT_RADIUS,
      0.19,
      centerZ + Math.sin(personAngle) * CITY_AMBIENT.PERSON_ORBIT_RADIUS,
      personScaleX,
      personScaleY,
      personScaleZ,
      -personAngle,
    );
    ambientAgentMesh.setColorAt(agentCount, _color.setHex(CITY_AMBIENT.COLORS.person));
    agentCount++;

    const carAngle = cellIndex * CITY_AMBIENT.CAR_ANGLE_PER_CELL + Math.PI;
    const [carScaleX, carScaleY, carScaleZ] = CITY_AMBIENT.CAR_SCALE;
    setAmbientInstance(
      ambientAgentMesh,
      agentCount,
      centerX + Math.cos(carAngle) * CITY_AMBIENT.CAR_ORBIT_RADIUS,
      0.16,
      centerZ + Math.sin(carAngle) * CITY_AMBIENT.CAR_ORBIT_RADIUS,
      carScaleX,
      carScaleY,
      carScaleZ,
      -carAngle,
    );
    ambientAgentMesh.setColorAt(agentCount, _color.setHex(CITY_AMBIENT.COLORS.car));
    agentCount++;
  });

  birdPoolStart = agentCount;
  for (let bird = 0; bird < BIRD_POOL_SIZE; bird++) {
    setAmbientInstance(ambientAgentMesh, agentCount, 100, 100, 100, 0, 0, 0);
    ambientAgentMesh.setColorAt(agentCount, _color.setHex(CITY_AMBIENT.COLORS.bird));
    agentCount++;
  }
  finishInstances(ambientAgentMesh, agentCount);
  ambientInstances = rotorIndices.length + agentCount;
}

function updateBirdVisit(now) {
  if (!birdVisit) return false;
  const progress = Math.min(1, Math.max(0, (now - birdVisit.startedAt) / birdVisit.durationMs));
  const { x: centerX, z: centerZ } = worldPosition(birdVisit.greenIndex);
  const [scaleX, scaleY, scaleZ] = CITY_AMBIENT.BIRD_SCALE;
  for (let bird = 0; bird < BIRD_POOL_SIZE; bird++) {
    const instanceIndex = birdPoolStart + bird;
    if (bird >= birdVisit.birdCount) {
      setAmbientInstance(ambientAgentMesh, instanceIndex, 100, 100, 100, 0, 0, 0);
      continue;
    }
    const lane = bird - (birdVisit.birdCount - 1) / 2;
    const x = centerX - 0.7 + progress * 1.4;
    const z = centerZ + lane * 0.18 + Math.sin(progress * Math.PI * 2 + bird) * 0.08;
    const y = CITY_AMBIENT.BIRD_BASE_HEIGHT + Math.sin(progress * Math.PI) * 0.28 + bird * 0.04;
    setAmbientInstance(ambientAgentMesh, instanceIndex, x, y, z, scaleX, scaleY, scaleZ, Math.PI / 2);
  }
  ambientAgentMesh.instanceMatrix.needsUpdate = true;
  if (progress >= 1) finishBirdVisit();
  return true;
}

export function triggerBirdVisit(greenIndex, requestedBirdCount = 2, durationMs = 2000) {
  if (!greenIndices.includes(greenIndex)) return false;
  birdCount = Math.max(2, Math.min(BIRD_POOL_SIZE, requestedBirdCount));
  birdVisit = { greenIndex, birdCount, durationMs, startedAt: performance.now() };
  updateBirdVisit(birdVisit.startedAt);
  needsRender = true;
  return true;
}

export function finishBirdVisit() {
  birdVisit = null;
  birdCount = 0;
  if (!ambientAgentMesh) return;
  for (let bird = 0; bird < BIRD_POOL_SIZE; bird++) {
    setAmbientInstance(ambientAgentMesh, birdPoolStart + bird, 100, 100, 100, 0, 0, 0);
  }
  ambientAgentMesh.instanceMatrix.needsUpdate = true;
  needsRender = true;
}

function pauseBirdVisits({ pausesSimulation } = {}) {
  if (pausesSimulation) birdVisitController?.pause('modal');
}

function resumeBirdVisits({ pausesSimulation } = {}) {
  if (pausesSimulation) birdVisitController?.resume('modal');
}

function handleBirdVisibility() {
  if (document.hidden) birdVisitController?.pause('hidden');
  else birdVisitController?.resume('hidden');
}

function clearEnergyBlinkTimers() {
  if (energyBlinkTimer != null) window.clearTimeout(energyBlinkTimer);
  if (energyBlinkRestoreTimer != null) window.clearTimeout(energyBlinkRestoreTimer);
  energyBlinkTimer = null;
  energyBlinkRestoreTimer = null;
}

function syncEnergyBlinkTimer() {
  if (!energyLinkCount) {
    clearEnergyBlinkTimers();
    if (energyLineMaterial) energyLineMaterial.opacity = CITY_AMBIENT.ENERGY_LINE_BASE_OPACITY;
    return;
  }
  if (energyBlinkTimer != null) return;
  energyBlinkTimer = window.setTimeout(() => {
    energyBlinkTimer = null;
    if (!energyLinkCount || !energyLineMaterial) return;
    energyLineMaterial.opacity = CITY_AMBIENT.ENERGY_LINE_FLASH_OPACITY;
    energyBlinkCount++;
    needsRender = true;
    energyBlinkRestoreTimer = window.setTimeout(() => {
      energyBlinkRestoreTimer = null;
      if (!energyLineMaterial) return;
      energyLineMaterial.opacity = CITY_AMBIENT.ENERGY_LINE_BASE_OPACITY;
      needsRender = true;
    }, CITY_AMBIENT.ENERGY_BLINK_DURATION_MS);
    syncEnergyBlinkTimer();
  }, CITY_AMBIENT.ENERGY_BLINK_INTERVAL_MS);
}

function easeOutBack(progress) {
  const c1 = 1.35;
  const c3 = c1 + 1;
  const p = progress - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

function motionProgress(motion, now) {
  return THREE.MathUtils.clamp((now - motion.startedAt) / motion.duration, 0, 1);
}

function visualConfigAt(configs, index) {
  const current = configs[index];
  if (current && !current.empty) return current;
  const motion = activeMotions.get(index);
  return motion?.kind === 'demolish' ? motion.previous : current;
}

function visualScaleAt(index, targetScale, now) {
  const motion = activeMotions.get(index);
  if (!motion) return targetScale;
  const progress = motionProgress(motion, now);
  if (motion.kind === 'place') return targetScale * easeOutBack(progress);
  if (motion.kind === 'upgrade') {
    const fromLevel = LEVEL_VISUALS[Math.max(1, (motion.level || 2) - 1)] || LEVEL_VISUALS[1];
    return THREE.MathUtils.lerp(fromLevel.scale, targetScale, easeOutBack(progress));
  }
  if (motion.kind === 'demolish') return targetScale * (1 - progress * progress * progress);
  return targetScale;
}

function visualYAt(index, now) {
  const motion = activeMotions.get(index);
  if (!motion || motion.kind !== 'demolish') return 0.13;
  return 0.13 - motionProgress(motion, now) * 0.22;
}

function facilityRotationY(type, cellIndex) {
  const offset = CITY_BUILDING_ORIENTATION.offsets[type];
  if (offset == null) return 0;
  const turn = (cellIndex + offset) % 6;
  return turn * CITY_BUILDING_ORIENTATION.step;
}

function updateTileInstances(configs, coordinates) {
  const count = Math.min(coordinates.length, MAX_CELLS);
  for (let index = 0; index < count; index++) {
    const { x, z } = worldPosition(index, coordinates);
    setBoxInstance(tileMesh, index, x, 0.06, z, 1, 1, 1);
    tileMesh.setColorAt(index, tileColorFor(configs[index] || {}));
  }
  finishInstances(tileMesh, count);
  // GPU prewarm/보드 크기 변경 뒤에도 레이캐스터의 broad-phase 경계가 실제 타일 위치를 가리켜야 한다.
  tileMesh.computeBoundingSphere();
}

function updateFacilityInstances(configs, coordinates, now) {
  FACILITY_TYPES.forEach((type) => { typeCellIndices.get(type).length = 0; });
  for (let index = 0; index < configs.length; index++) {
    const config = visualConfigAt(configs, index);
    if (!config?.empty && typeCellIndices.has(config.type)) typeCellIndices.get(config.type).push(index);
  }

  FACILITY_TYPES.forEach((type) => {
    const mesh = facilityMeshes.get(type);
    const supplement = supplementMeshes.get(type);
    const indices = typeCellIndices.get(type);
    indices.forEach((cellIndex, instanceIndex) => {
      const config = visualConfigAt(configs, cellIndex);
      const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
      const { x, z } = worldPosition(cellIndex, coordinates);
      const visualScale = visualScaleAt(cellIndex, level.scale, now);
      const visualY = visualYAt(cellIndex, now);
      setInstance(mesh, instanceIndex, x, visualY, z, visualScale, 0, facilityRotationY(type, cellIndex));
      const facilityColor = facilityColorFor(type, config.level);
      mesh.setColorAt(instanceIndex, _color.setHex(facilityColor));

      if (supplement) {
        const offset = type === 'nuclear' ? 0.2 : 0.22;
        setInstance(supplement, instanceIndex, x + offset, visualY, z + 0.18, visualScale * 0.9);
        supplement.setColorAt(instanceIndex, _color.setHex(facilityColor));
      }
    });
    finishInstances(mesh, indices.length);
    if (supplement) finishInstances(supplement, indices.length);
  });
}

function updateBuildingLightInstances() {
  if (!buildingLightMesh || !currentConfigs.length || worldPhase !== 'night') {
    if (buildingLightMesh) finishInstances(buildingLightMesh, 0);
    return;
  }
  let lightCount = 0;
  currentConfigs.forEach((config, index) => {
    if (!config || config.empty || !config.type) return;
    const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
    const { x, z } = worldPosition(index);
    const y = 0.3 * level.scale;
    [-0.13, 0.13].forEach((offset) => {
      setBoxInstance(buildingLightMesh, lightCount, x + offset * level.scale, y, z + 0.29 * level.scale, 0.055, 0.045, 0.012);
      buildingLightMesh.setColorAt(lightCount, _color.setHex(0xffdf8a));
      lightCount++;
    });
    setBoxInstance(buildingLightMesh, lightCount, x + 0.29 * level.scale, y + 0.08, z, 0.012, 0.04, 0.05);
    buildingLightMesh.setColorAt(lightCount, _color.setHex(0xffc765));
    lightCount++;
  });
  finishInstances(buildingLightMesh, Math.min(lightCount, MAX_BUILDING_LIGHTS));
}

function updateMarkerInstances(configs, coordinates, now) {
  let ringCount = 0;
  configs.forEach((config, index) => {
    const { x, z } = worldPosition(index, coordinates);
    const markerColor = markerColorFor(config);
    if (markerColor) {
      const pulse = 1 + Math.sin((now / CITY_MOTION.SELECT_PULSE_MS) * Math.PI * 2) * 0.035;
      setInstance(stateRingMesh, ringCount, x, 0.135, z, pulse, -Math.PI / 2);
      stateRingMesh.setColorAt(ringCount, markerColor);
      ringCount++;
    }
  });
  finishInstances(stateRingMesh, ringCount);
}

function updateInstances(configs, coordinates, now = performance.now()) {
  if (!renderer) return;
  updateTileInstances(configs, coordinates);
  updateFacilityInstances(configs, coordinates, now);
  updateMarkerInstances(configs, coordinates, now);
  updateBuildingLightInstances();
}

function beginMotion(kind, payload) {
  if (!renderer || payload?.index == null) return;
  const durations = {
    place: CITY_MOTION.PLACE_MS,
    upgrade: CITY_MOTION.UPGRADE_MS,
    demolish: CITY_MOTION.DEMOLISH_MS,
  };
  const previous = currentConfigs[payload.index] ? { ...currentConfigs[payload.index] } : null;
  activeMotions.set(payload.index, {
    kind,
    index: payload.index,
    level: payload.level,
    previous,
    startedAt: performance.now(),
    duration: durations[kind],
  });
  needsRender = true;
  eventBus.emit(Events.VISUAL_MOTION_STARTED, { kind, index: payload.index });
}

function handlePlaced(payload) {
  beginMotion('place', payload);
}

function handleUpgraded(payload) {
  beginMotion('upgrade', payload);
}

function handleDemolished(payload) {
  beginMotion('demolish', payload);
}

function completeFinishedMotions(now) {
  let completed = false;
  activeMotions.forEach((motion, index) => {
    if (motionProgress(motion, now) < 1) return;
    activeMotions.delete(index);
    completed = true;
    eventBus.emit(Events.VISUAL_MOTION_COMPLETED, { kind: motion.kind, index });
  });
  return completed;
}

// 3D 씬은 한 번만 마운트되며 일반 보드와 진단 보드가 같은 GPU 자원을 공유한다.
export function initCityScene3D(container) {
  containerEl = container;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(CITY_CAMERA.FOV, 1, CITY_CAMERA.NEAR, CITY_CAMERA.FAR);

  canvasEl = document.createElement('canvas');
  canvasEl.className = 'city-scene-3d-canvas';
  container.innerHTML = '';
  container.appendChild(canvasEl);
  paintSky(currentSkyState);

  cameraHintEl = document.createElement('div');
  cameraHintEl.className = 'city-camera-hint';
  cameraHintEl.textContent = window.matchMedia?.('(pointer: coarse)').matches
    ? '한 손가락 회전 · 두 손가락 이동/확대'
    : '드래그 회전 · 우클릭 이동 · 휠 확대';
  container.appendChild(cameraHintEl);

  cameraResetEl = document.createElement('button');
  cameraResetEl.type = 'button';
  cameraResetEl.className = 'city-camera-reset';
  cameraResetEl.title = '3D 시점 초기화';
  cameraResetEl.setAttribute('aria-label', '3D 시점 초기화');
  cameraResetEl.textContent = '↺';
  container.appendChild(cameraResetEl);

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pixelRatioCap()));

  hemisphereLight = new THREE.HemisphereLight(0xc8dcff, 0x101722, 1.15);
  scene.add(hemisphereLight);
  sunLight = new THREE.DirectionalLight(0xffffff, 1.35);
  sunLight.position.set(4, 8, 5);
  scene.add(sunLight);
  rimLight = new THREE.DirectionalLight(0x54e4ff, 0.42);
  rimLight.position.set(-6, 4, -4);
  scene.add(rimLight);

  initCityAssets((loaded, total) => {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = `3D 도시 모델 ${loaded}/${total}`;
  }).then((assetStatus) => {
    refreshLoadedAssets();
    if (assetStatus.errors.length) {
      eventBus.emit(Events.TOAST_SHOW, {
        title: '일부 3D 모델 폴백 사용',
        text: '게임은 정상적으로 계속됩니다.',
      });
    }
    const scheduleIdle = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 32));
    scheduleIdle(() => cityEnvironment?.loadIdle().finally(() => { needsRender = true; }));
  });

  createSceneLayers();
  cityEnvironment = createCityEnvironment3D({ scene, assetLoader });
  applyWorldTheme({ theme: document.documentElement.dataset.theme });
  prewarmGpuBuffers();
  cameraInteractionReady = false;
  cameraController = createCameraController({
    camera,
    domElement: canvasEl,
    getBoardRadius: () => currentRadius,
    onInteraction: () => {
      needsRender = true;
      if (cameraInteractionReady) cameraHintEl?.classList.add('used');
    },
  });
  cameraInteractionReady = true;
  cameraResetEl.addEventListener('pointerdown', stopCameraButtonEvent);
  cameraResetEl.addEventListener('pointerup', stopCameraButtonEvent);
  cameraResetEl.addEventListener('click', resetCameraFromButton);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  canvasEl.addEventListener('pointerdown', capturePointer);
  canvasEl.addEventListener('pointermove', updatePointer);
  canvasEl.addEventListener('pointerup', handlePointerClick);
  canvasEl.addEventListener('pointerleave', handlePointerLeave);

  resizeObserver = new ResizeObserver(resizeToContainer);
  resizeObserver.observe(container);
  eventBus.on(Events.BOARD_EXPANDED, resetCameraForBoardExpansion);
  eventBus.on(Events.BOARD_PLACED, handlePlaced);
  eventBus.on(Events.BOARD_UPGRADED, handleUpgraded);
  eventBus.on(Events.BOARD_DEMOLISHED, handleDemolished);
  eventBus.on(Events.THEME_CHANGED, applyWorldTheme);
  eventBus.on(Events.SIMULATION_TICKED, handleSimulationTick);
  eventBus.on(Events.MODAL_OPEN, pauseBirdVisits);
  eventBus.on(Events.MODAL_CLOSE, resumeBirdVisits);
  document.addEventListener('visibilitychange', handleBirdVisibility);

  birdVisitController = createBirdVisitController({
    getGreenIndices: () => greenIndices,
    onVisit: ({ greenIndex, birdCount: count, durationMs }) => triggerBirdVisit(greenIndex, count, durationMs),
  });
  birdVisitController.start();

  window.__clickCell = (index) => {
    const config = currentConfigs[index];
    if (config?.disabled) return;
    onCellClickCb(index);
  };
  window.__getCellVisual = (index) => currentConfigs[index] ?? null;
  window.__setWorldHourForTest = (hour) => {
    visualHourOverride = hour;
    return applyWorldHour(hour, true);
  };

  window.__getHexCell = (index) => {
    const coord = currentCoords[index];
    if (!coord) return null;
    return { index, ...coord, ...worldPosition(index) };
  };

  cameraController.reset(currentRadius);
  resizeToContainer();
  needsRender = true;
  renderer.setAnimationLoop(renderFrame);
}

function capturePointer(event) {
  canvasEl.setPointerCapture(event.pointerId);
}

function stopCameraButtonEvent(event) {
  event.stopPropagation();
}

function resetCameraFromButton(event) {
  event.stopPropagation();
  cameraController?.reset(currentRadius);
  needsRender = true;
}

function resetCameraForBoardExpansion({ settled } = {}) {
  if (settled) return;
  cameraController?.reset(currentRadius);
  needsRender = true;
}

function resizeToContainer() {
  if (!containerEl || !renderer) return;
  const { width, height } = containerEl.getBoundingClientRect();
  if (width < 2 || height < 2) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pixelRatioCap()));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  cameraController?.fitAspect(camera.aspect);
  needsRender = true;
}

function updatePointer(event) {
  const rect = canvasEl.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  if (buildPreviewMode.enabled && buildPreviewMode.candidateIndex == null) {
    hoveredPreviewIndex = raycastIndex();
    syncBuildGhost();
  }
}

function handlePointerLeave() {
  if (buildPreviewMode.candidateIndex != null) return;
  hoveredPreviewIndex = -1;
  syncBuildGhost();
}

function raycastIndex() {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(tileMesh, false)[0];
  return hit?.instanceId ?? -1;
}

function syncBuildGhost() {
  if (!ghostMesh) return;
  const index = buildPreviewMode.candidateIndex ?? hoveredPreviewIndex;
  const config = currentConfigs[index];
  const type = buildPreviewMode.type;
  if (!buildPreviewMode.enabled || index == null || index < 0 || !type || !FACILITY_TYPES.includes(type) || !config?.empty) {
    ghostMesh.visible = false;
    needsRender = true;
    return;
  }
  ghostMesh.geometry = getFacilityGeometry(type);
  const { x, z } = worldPosition(index);
  const level = LEVEL_VISUALS[1];
  ghostMesh.position.set(x, 0.13, z);
  ghostMesh.rotation.set(0, facilityRotationY(type, index), 0);
  ghostMesh.scale.setScalar(level.scale);
  const color = config.placementAllowed === false ? MARKER_COLORS.problem : MARKER_COLORS.good;
  ghostMaterial.color.copy(color);
  ghostMaterial.emissive.copy(color);
  ghostMesh.visible = true;
  needsRender = true;
}

export function setBuildPreviewMode({ enabled = false, type = null, candidateIndex = null } = {}) {
  buildPreviewMode = { enabled: Boolean(enabled), type, candidateIndex };
  if (!buildPreviewMode.enabled) hoveredPreviewIndex = -1;
  syncBuildGhost();
}

function handlePointerClick(event) {
  if (!cameraController.isGestureClick(event.pointerId)) return;
  updatePointer(event);
  const index = raycastIndex();
  if (index < 0 || currentConfigs[index]?.disabled) return;
  onCellClickCb(index);
}

function renderFrame(now) {
  let shouldRender = needsRender || !!cameraController?.update();
  if (birdVisit && updateBirdVisit(now)) shouldRender = true;
  if (activeMotions.size) {
    updateInstances(currentConfigs, currentCoords, now);
    if (completeFinishedMotions(now)) updateInstances(currentConfigs, currentCoords, now);
    shouldRender = true;
  }
  if (!shouldRender || !renderer) return;
  renderer.render(scene, camera);
  renderCount++;
  needsRender = false;
}

// cellConfigs: { empty, type, level, selected, newLand, previewGood, previewBad,
// diagnosisState, linkMark, disabled } 배열이다.
export function renderCityScene3D(cellConfigs, boardRadius) {
  if (!renderer) return;
  const nextCoords = createHexCoordinates(boardRadius);
  const cellCount = Math.min(nextCoords.length, MAX_CELLS);
  currentConfigs = Array.from({ length: cellCount }, (_, index) => ({
    index,
    empty: true,
    level: 1,
    ...(cellConfigs[index] || {}),
  }));
  if (boardRadius !== currentRadius) {
    currentRadius = boardRadius;
    currentCoords = nextCoords;
    cameraController?.resize(boardRadius);
    cameraController?.reset(boardRadius);
    cityEnvironment?.setBoardRadius(boardRadius);
  } else {
    currentCoords = nextCoords;
  }
  updateInstances(currentConfigs, currentCoords);
  rebuildAmbientTopology();
  syncBuildGhost();
  needsRender = true;
}

export function setCellClickHandler(fn) {
  onCellClickCb = fn || (() => {});
}

export function getCityRendererStats() {
  const facilityInstances = [...facilityMeshes.values()].reduce((total, mesh) => total + mesh.count, 0);
  const firstTileColor = tileMesh?.count ? tileMesh.getColorAt(0, _color).getHex() : null;
  const facilityVisualSamples = {};
  const sampleMatrix = new THREE.Matrix4();
  const samplePosition = new THREE.Vector3();
  const sampleQuaternion = new THREE.Quaternion();
  const sampleScale = new THREE.Vector3();
  const sampleEuler = new THREE.Euler();
  FACILITY_TYPES.forEach((type) => {
    const mesh = facilityMeshes.get(type);
    const cellIndices = typeCellIndices.get(type);
    if (!mesh?.count) return;
    facilityVisualSamples[type] = Array.from({ length: mesh.count }, (_, instanceIndex) => {
      mesh.getMatrixAt(instanceIndex, sampleMatrix);
      sampleMatrix.decompose(samplePosition, sampleQuaternion, sampleScale);
      sampleEuler.setFromQuaternion(sampleQuaternion, 'YXZ');
      return {
        level: currentConfigs[cellIndices[instanceIndex]]?.level || 1,
        color: mesh.getColorAt(instanceIndex, _color).getHex(),
        scale: Number(sampleScale.x.toFixed(3)),
        rotationY: Number(sampleEuler.y.toFixed(3)),
      };
    });
  });
  return {
    drawCalls: renderer?.info.render.calls ?? 0,
    geometryCount: renderer?.info.memory.geometries ?? 0,
    textureCount: renderer?.info.memory.textures ?? 0,
    occupiedCells: currentConfigs.filter((config) => !config.empty && config.type).length,
    tileInstances: tileMesh?.count ?? 0,
    boardRadius: currentRadius,
    hexCellCount: currentCoords.length,
    facilityInstances,
    facilityVisualSamples,
    instancedLayers: 1 + facilityMeshes.size + supplementMeshes.size + 3,
    resourceRevision,
    activeMotions: activeMotions.size,
    motionKinds: [...activeMotions.values()].map((motion) => motion.kind),
    ambientInstances,
    energyLinkCount,
    energyPacketCount,
    energyBlinkCount,
    residentAgentCount,
    birdCount,
    birdPoolSize: BIRD_POOL_SIZE,
    windRotorCount: windRotorMesh?.count ?? 0,
    worldPhase,
    sunIntensity: sunLight?.intensity ?? 0,
    renderCount,
    pixelRatio: renderer?.getPixelRatio() ?? 0,
    theme: currentTheme,
    firstTileColor,
    environment: cityEnvironment?.getStats() ?? { state: 'idle' },
    ghostVisible: Boolean(ghostMesh?.visible),
    ghostCount: ghostMesh?.visible ? 1 : 0,
    skyHour: currentWorldHour,
    skyTopColor: currentSkyState.topColor,
    skyBottomColor: currentSkyState.bottomColor,
    buildingLightCount: buildingLightMesh?.count ?? 0,
    linkMarkerCount: 0,
    levelSegmentCount: 0,
    facilityPaletteMode: facilityMeshes.get('factory')?.material?.userData?.facilityPaletteMode || 'textured',
    facilityHasMap: Boolean(facilityMeshes.get('factory')?.material?.map),
    texturedFacilityTypes: FACILITY_TYPES.filter((type) => Boolean(facilityMeshes.get(type)?.material?.map)),
    facilityMaterialType: facilityMeshes.get('factory')?.material?.type || null,
    facilityUsesVertexColors: Boolean(facilityMeshes.get('factory')?.material?.vertexColors),
    hemisphereIntensity: hemisphereLight?.intensity ?? 0,
  };
}

export function disposeCityScene3D() {
  renderer?.setAnimationLoop(null);
  clearEnergyBlinkTimers();
  resizeObserver?.disconnect();
  resizeObserver = null;
  eventBus.off(Events.BOARD_EXPANDED, resetCameraForBoardExpansion);
  eventBus.off(Events.BOARD_PLACED, handlePlaced);
  eventBus.off(Events.BOARD_UPGRADED, handleUpgraded);
  eventBus.off(Events.BOARD_DEMOLISHED, handleDemolished);
  eventBus.off(Events.THEME_CHANGED, applyWorldTheme);
  eventBus.off(Events.SIMULATION_TICKED, handleSimulationTick);
  eventBus.off(Events.MODAL_OPEN, pauseBirdVisits);
  eventBus.off(Events.MODAL_CLOSE, resumeBirdVisits);
  document.removeEventListener('visibilitychange', handleBirdVisibility);
  birdVisitController?.dispose();
  birdVisitController = null;
  cityEnvironment?.dispose();
  cityEnvironment = null;
  cameraResetEl?.removeEventListener('pointerdown', stopCameraButtonEvent);
  cameraResetEl?.removeEventListener('pointerup', stopCameraButtonEvent);
  cameraResetEl?.removeEventListener('click', resetCameraFromButton);
  canvasEl?.removeEventListener('pointerdown', capturePointer);
  canvasEl?.removeEventListener('pointermove', updatePointer);
  canvasEl?.removeEventListener('pointerup', handlePointerClick);
  canvasEl?.removeEventListener('pointerleave', handlePointerLeave);
  cameraController?.dispose();
  ownedGeometries.forEach((geometry) => geometry.dispose());
  ownedMaterials.forEach((material) => material.dispose());
  renderer?.dispose();
  facilityMeshes.clear();
  supplementMeshes.clear();
  ownedGeometries.clear();
  ownedMaterials.clear();
  activeMotions.clear();
  energyLinks.length = 0;
  currentPowerRoutes = [];
  residentialIndices.length = 0;
  greenIndices.length = 0;
  energyLinkCount = 0;
  energyPacketCount = 0;
  energyBlinkCount = 0;
  residentAgentCount = 0;
  birdCount = 0;
  birdVisit = null;
  ambientInstances = 0;
  cameraController = null;
  ghostMesh = null;
  ghostMaterial = null;
  buildingLightMesh = null;
  buildingLightMaterial = null;
  currentWorldHour = 8;
  currentSkyState = getSkyState(currentWorldHour);
  visualHourOverride = null;
  hoveredPreviewIndex = -1;
  buildPreviewMode = { enabled: false, type: null, candidateIndex: null };
  renderer = null;
  cameraInteractionReady = false;
}

export function getCityCameraState() {
  return cameraController?.getState() ?? null;
}

export function resetCityCamera() {
  cameraController?.reset(currentRadius);
  needsRender = true;
}

export function setCityCameraOrbitForTest(azimuth, polar) {
  const state = cameraController?.setOrbitForTest(azimuth, polar) ?? null;
  needsRender = true;
  return state;
}
