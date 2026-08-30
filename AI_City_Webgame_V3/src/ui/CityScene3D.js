import * as THREE from 'three';
import {
  CITY_AMBIENT,
  CITY_ASSETS,
  CITY_CAMERA,
  CITY_MOTION,
  LEVEL_VISUALS,
  THEME_SCHEMAS,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import {
  getCityNeutralTexture,
  getFacilityGeometry,
  getSupplementGeometry,
  initCityAssets,
} from '../level/CityAssetLoader.js';
import { createCameraController } from '../systems/CameraController.js';
import { createBirdVisitController } from '../systems/AmbientBirdSystem.js';
import { getWorldPhase } from '../systems/ClimateSystem.js';

// 모든 레이어는 씬 수명 동안 유지된다. 상태 갱신은 instance matrix/color/count만 바꾸므로
// 시설 선택 미리보기나 연속 배치 때 WebGL 버퍼를 생성·삭제하지 않는다.
const MAX_CELLS = 36;
const TILE_SIZE = 0.88;
const TILE_BASE_COLOR = 0x0d1f31;
const FACILITY_TYPES = Object.keys(CITY_ASSETS);
const SUPPLEMENT_TYPES = FACILITY_TYPES.filter((type) => CITY_ASSETS[type].supplement);
const ENERGY_SOURCE_TYPES = new Set(CITY_AMBIENT.ENERGY_SOURCES);
const RENEWABLE_SOURCE_TYPES = new Set(['solar', 'wind']);
const MAX_ENERGY_LINKS = MAX_CELLS * CITY_AMBIENT.MAX_NEIGHBORS_PER_CELL;
const MAX_AMBIENT_AGENTS = (
  MAX_CELLS * CITY_AMBIENT.RESIDENT_AGENTS_PER_CELL
  + 3
);
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
let currentSize = 5;
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

let groundMesh;
let tileMesh;
let pedestalMesh;
let stateRingMesh;
let linkMarkerMesh;
let windRotorMesh;
let energyLines;
let energyLinePositions;
let energyLineColors;
let ambientAgentMesh;
let energyLineMaterial;
let facilityMaterial;
let tileMaterial;
let pedestalMaterial;
let stateRingMaterial;
let linkMarkerMaterial;
let groundMaterial;
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
  renderer?.setClearColor(world.clear, 1);
  groundMaterial?.color.setHex(world.ground);
  TILE_COLORS.base.setHex(world.tile);
  TILE_COLORS.selected.setHex(world.selectedTile);
  if (hemisphereLight) {
    hemisphereLight.color.setHex(world.hemisphereSky);
    hemisphereLight.groundColor.setHex(world.hemisphereGround);
  }
  rimLight?.color.setHex(world.rim);
  applyWorldPhase(worldPhase, true);
  if (tileMesh && currentConfigs.length) updateTileInstances(currentConfigs, currentSize);
  needsRender = true;
}

const WORLD_LIGHTING = Object.freeze({
  dawn: { sun: 0.78, hemisphere: 0.92, rim: 0.38, sunColor: 0xffcf9c },
  day: { sun: 1.35, hemisphere: 1.15, rim: 0.28, sunColor: 0xffffff },
  dusk: { sun: 0.42, hemisphere: 0.68, rim: 0.48, sunColor: 0xff9d78 },
  night: { sun: 0.12, hemisphere: 0.42, rim: 0.58, sunColor: 0x8db6ff },
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

function ownGeometry(geometry) {
  ownedGeometries.add(geometry);
  return geometry;
}

function ownMaterial(material) {
  ownedMaterials.add(material);
  return material;
}

function setInstance(mesh, instanceIndex, x, y, z, scale, rotationX = 0) {
  _matrixObject.position.set(x, y, z);
  _matrixObject.rotation.set(rotationX, 0, 0);
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
  groundMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x030b15, roughness: 1 }));
  groundMesh = new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(60, 60)), groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.2;
  scene.add(groundMesh);

  tileMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 }));
  tileMesh = makeInstancedMesh(ownGeometry(new THREE.BoxGeometry(TILE_SIZE, 0.12, TILE_SIZE)), tileMaterial, MAX_CELLS);
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

  const supplementPlaceholder = ownGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
  SUPPLEMENT_TYPES.forEach((type) => {
    const mesh = makeInstancedMesh(supplementPlaceholder, facilityMaterial, MAX_CELLS);
    mesh.name = `facility-${type}-supplement`;
    supplementMeshes.set(type, mesh);
  });

  pedestalMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  pedestalMesh = makeInstancedMesh(ownGeometry(new THREE.BoxGeometry(1, 1, 1)), pedestalMaterial, MAX_CELLS * 3);
  pedestalMesh.name = 'level-segments';

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

  linkMarkerMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.24,
    roughness: 0.3,
  }));
  linkMarkerMesh = makeInstancedMesh(
    ownGeometry(new THREE.IcosahedronGeometry(0.1, 0)),
    linkMarkerMaterial,
    MAX_CELLS,
  );
  linkMarkerMesh.name = 'link-markers';

  const rotorMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0xd8f7ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.86,
  }));
  windRotorMesh = makeInstancedMesh(ownGeometry(createRotorGeometry()), rotorMaterial, MAX_CELLS);
  windRotorMesh.name = 'wind-rotors';

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
    pedestalMesh,
    stateRingMesh,
    linkMarkerMesh,
    windRotorMesh,
    ambientAgentMesh,
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
    facilityMeshes.get(type).geometry = getFacilityGeometry(type);
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
  updateInstances(currentConfigs, currentSize);
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
  if (config.previewBad || config.diagnosisState === 'problem') return MARKER_COLORS.problem;
  if (config.previewGood || config.newLand || config.diagnosisState === 'ok') return MARKER_COLORS.good;
  if (config.diagnosisState === 'unknown') return MARKER_COLORS.unknown;
  if (config.selected) return MARKER_COLORS.selected;
  return null;
}

function worldX(index, size) {
  return index % size - (size - 1) / 2;
}

function worldZ(index, size) {
  return Math.floor(index / size) - (size - 1) / 2;
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
    energyLinePositions[offset] = worldX(link.sourceIndex, currentSize);
    energyLinePositions[offset + 1] = CITY_AMBIENT.ENERGY_LINE_HEIGHT;
    energyLinePositions[offset + 2] = worldZ(link.sourceIndex, currentSize);
    energyLinePositions[offset + 3] = worldX(link.targetIndex, currentSize);
    energyLinePositions[offset + 4] = CITY_AMBIENT.ENERGY_LINE_HEIGHT;
    energyLinePositions[offset + 5] = worldZ(link.targetIndex, currentSize);
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
  applyWorldPhase(getWorldPhase(payload?.summary?.hour ?? 12));
}

function updateStaticAmbientInstances() {
  const windIndices = typeCellIndices.get('wind');
  windIndices.forEach((cellIndex, instanceIndex) => {
    const config = visualConfigAt(currentConfigs, cellIndex);
    const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
    setRotatedInstance(
      windRotorMesh,
      instanceIndex,
      worldX(cellIndex, currentSize),
      0.78 * level.scale,
      worldZ(cellIndex, currentSize) + 0.015,
      level.scale,
      cellIndex * 0.23,
    );
    windRotorMesh.setColorAt(instanceIndex, _color.setHex(level.color).lerp(MARKER_COLORS.good, 0.45));
  });
  finishInstances(windRotorMesh, windIndices.length);

  let agentCount = 0;
  residentialIndices.forEach((cellIndex) => {
    const centerX = worldX(cellIndex, currentSize);
    const centerZ = worldZ(cellIndex, currentSize);
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
  ambientInstances = windIndices.length + agentCount;
}

function updateBirdVisit(now) {
  if (!birdVisit) return false;
  const progress = Math.min(1, Math.max(0, (now - birdVisit.startedAt) / birdVisit.durationMs));
  const centerX = worldX(birdVisit.greenIndex, currentSize);
  const centerZ = worldZ(birdVisit.greenIndex, currentSize);
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

function pauseBirdVisits() {
  birdVisitController?.pause('modal');
}

function resumeBirdVisits() {
  birdVisitController?.resume('modal');
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

function updateTileInstances(configs, size) {
  const count = Math.min(size * size, MAX_CELLS);
  for (let index = 0; index < count; index++) {
    const x = worldX(index, size);
    const z = worldZ(index, size);
    setBoxInstance(tileMesh, index, x, 0.06, z, 1, 1, 1);
    tileMesh.setColorAt(index, tileColorFor(configs[index] || {}));
  }
  finishInstances(tileMesh, count);
  // GPU prewarm/보드 크기 변경 뒤에도 레이캐스터의 broad-phase 경계가 실제 타일 위치를 가리켜야 한다.
  tileMesh.computeBoundingSphere();
}

function updateFacilityInstances(configs, size, now) {
  FACILITY_TYPES.forEach((type) => { typeCellIndices.get(type).length = 0; });
  for (let index = 0; index < configs.length; index++) {
    const config = visualConfigAt(configs, index);
    if (!config?.empty && typeCellIndices.has(config.type)) typeCellIndices.get(config.type).push(index);
  }

  let pedestalCount = 0;
  FACILITY_TYPES.forEach((type) => {
    const mesh = facilityMeshes.get(type);
    const supplement = supplementMeshes.get(type);
    const indices = typeCellIndices.get(type);
    indices.forEach((cellIndex, instanceIndex) => {
      const config = visualConfigAt(configs, cellIndex);
      const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
      const x = worldX(cellIndex, size);
      const z = worldZ(cellIndex, size);
      const visualScale = visualScaleAt(cellIndex, level.scale, now);
      const visualY = visualYAt(cellIndex, now);
      setInstance(mesh, instanceIndex, x, visualY, z, visualScale);
      mesh.setColorAt(instanceIndex, _color.setHex(level.color));

      if (supplement) {
        const offset = type === 'nuclear' ? 0.2 : 0.22;
        setInstance(supplement, instanceIndex, x + offset, visualY, z + 0.18, visualScale * 0.9);
        supplement.setColorAt(instanceIndex, _color.setHex(level.color));
      }

      for (let segment = 0; segment < level.segments; segment++) {
        setBoxInstance(
          pedestalMesh,
          pedestalCount,
          x - 0.27 + segment * 0.09,
          visualY + 0.03 + segment * 0.065,
          z + 0.29,
          0.055 * visualScale,
          0.035,
          0.055 * visualScale,
        );
        pedestalMesh.setColorAt(pedestalCount, _color.setHex(level.color));
        pedestalCount++;
      }
    });
    finishInstances(mesh, indices.length);
    if (supplement) finishInstances(supplement, indices.length);
  });
  finishInstances(pedestalMesh, pedestalCount);
}

function updateMarkerInstances(configs, size, now) {
  let ringCount = 0;
  let linkCount = 0;
  configs.forEach((config, index) => {
    const x = worldX(index, size);
    const z = worldZ(index, size);
    const markerColor = markerColorFor(config);
    if (markerColor) {
      const pulse = 1 + Math.sin((now / CITY_MOTION.SELECT_PULSE_MS) * Math.PI * 2) * 0.035;
      setInstance(stateRingMesh, ringCount, x, 0.135, z, pulse, -Math.PI / 2);
      stateRingMesh.setColorAt(ringCount, markerColor);
      ringCount++;
    }
    if (config.linkMark && !config.empty) {
      const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
      setInstance(linkMarkerMesh, linkCount, x, 1.02 * level.scale, z, 1);
      linkMarkerMesh.setColorAt(linkCount, config.linkMark === 'good' ? MARKER_COLORS.good : MARKER_COLORS.warn);
      linkCount++;
    }
  });
  finishInstances(stateRingMesh, ringCount);
  finishInstances(linkMarkerMesh, linkCount);
}

function updateInstances(configs, size, now = performance.now()) {
  if (!renderer) return;
  updateTileInstances(configs, size);
  updateFacilityInstances(configs, size, now);
  updateMarkerInstances(configs, size, now);
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
  });

  createSceneLayers();
  applyWorldTheme({ theme: document.documentElement.dataset.theme });
  prewarmGpuBuffers();
  cameraInteractionReady = false;
  cameraController = createCameraController({
    camera,
    domElement: canvasEl,
    getBoardSize: () => currentSize,
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

  cameraController.reset(currentSize);
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
  cameraController?.reset(currentSize);
  needsRender = true;
}

function resetCameraForBoardExpansion({ settled } = {}) {
  if (settled) return;
  cameraController?.reset(currentSize);
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
}

function raycastIndex() {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(tileMesh, false)[0];
  return hit?.instanceId ?? -1;
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
    updateInstances(currentConfigs, currentSize, now);
    if (completeFinishedMotions(now)) updateInstances(currentConfigs, currentSize, now);
    shouldRender = true;
  }
  if (!shouldRender || !renderer) return;
  renderer.render(scene, camera);
  renderCount++;
  needsRender = false;
}

// cellConfigs: { empty, type, level, selected, newLand, previewGood, previewBad,
// diagnosisState, linkMark, disabled } 배열이다.
export function renderCityScene3D(cellConfigs, size) {
  if (!renderer) return;
  const cellCount = Math.min(size * size, MAX_CELLS);
  currentConfigs = Array.from({ length: cellCount }, (_, index) => ({
    index,
    empty: true,
    level: 1,
    ...(cellConfigs[index] || {}),
  }));
  if (size !== currentSize) {
    currentSize = size;
    cameraController?.resize(size);
    cameraController?.reset(size);
  }
  updateInstances(currentConfigs, size);
  rebuildAmbientTopology();
  needsRender = true;
}

export function setCellClickHandler(fn) {
  onCellClickCb = fn || (() => {});
}

export function getCityRendererStats() {
  const facilityInstances = [...facilityMeshes.values()].reduce((total, mesh) => total + mesh.count, 0);
  const firstTileColor = tileMesh?.count ? tileMesh.getColorAt(0, _color).getHex() : null;
  return {
    drawCalls: renderer?.info.render.calls ?? 0,
    geometryCount: renderer?.info.memory.geometries ?? 0,
    textureCount: renderer?.info.memory.textures ?? 0,
    occupiedCells: currentConfigs.filter((config) => !config.empty && config.type).length,
    facilityInstances,
    instancedLayers: 1 + facilityMeshes.size + supplementMeshes.size + 5,
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
    worldPhase,
    sunIntensity: sunLight?.intensity ?? 0,
    renderCount,
    pixelRatio: renderer?.getPixelRatio() ?? 0,
    theme: currentTheme,
    firstTileColor,
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
  cameraResetEl?.removeEventListener('pointerdown', stopCameraButtonEvent);
  cameraResetEl?.removeEventListener('pointerup', stopCameraButtonEvent);
  cameraResetEl?.removeEventListener('click', resetCameraFromButton);
  canvasEl?.removeEventListener('pointerdown', capturePointer);
  canvasEl?.removeEventListener('pointermove', updatePointer);
  canvasEl?.removeEventListener('pointerup', handlePointerClick);
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
  renderer = null;
  cameraInteractionReady = false;
}

export function getCityCameraState() {
  return cameraController?.getState() ?? null;
}

export function resetCityCamera() {
  cameraController?.reset(currentSize);
  needsRender = true;
}
