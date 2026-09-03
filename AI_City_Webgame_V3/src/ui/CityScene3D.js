import * as THREE from 'three';
import {
  BOARD,
  CITY_AMBIENT,
  CITY_AMBIENT_MOTION,
  CITY_ASSETS,
  CITY_BUILDING_ORIENTATION,
  CITY_CAMERA,
  CITY_MOTION,
  CITY_WORLD_OVERLAY,
  facilityColorFor,
  GREEN_VISUAL_LAYOUTS,
  HEX_TILE_VISUALS,
  LEVEL_VISUALS,
  THEME_SCHEMAS,
} from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { assetLoader } from '../assets/AssetLoader.js';
import { FACILITY_ASSET_IDS } from '../assets/assetRegistry.js';
import {
  disposeCityAssets,
  disposeReplacedFallbackGeometries,
  getFacilityGeometry,
  getFacilityMaterial,
  initCityAssets,
} from '../level/CityAssetLoader.js';
import { createCameraController } from '../systems/CameraController.js';
import { createBirdVisitController } from '../systems/AmbientBirdSystem.js';
import { ambientDurationBounds, createAmbientMotionController } from '../systems/CityAmbientMotionSystem.js';
import { getSkyState, getWorldPhase } from '../systems/ClimateSystem.js';
import { axialToWorld, createHexCoordinates } from '../systems/HexGridSystem.js';
import { projectProgress } from '../systems/ConstructionProjectSystem.js';
import { createCityEnvironment3D } from './CityEnvironment3D.js';

export { GREEN_VISUAL_LAYOUTS };

// 모든 레이어는 씬 수명 동안 유지된다. 상태 갱신은 instance matrix/color/count만 바꾸므로
// 시설 선택 미리보기나 연속 배치 때 WebGL 버퍼를 생성·삭제하지 않는다.
const MAX_CELLS = BOARD.EXPANDED_CELLS;
const TILE_BASE_COLOR = 0x0d1f31;
const FACILITY_TYPES = Object.keys(CITY_ASSETS);
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
  inactive: new THREE.Color(0x101b24),
  zoneSolar: new THREE.Color(0x3f4930),
  zoneResidential: new THREE.Color(0x244455),
  zoneWind: new THREE.Color(0x244b4d),
  zoneIndustrial: new THREE.Color(0x463b35),
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
const _worldPoint = { x: 0, z: 0 };
const _projection = new THREE.Vector3();
const _overlayPoint = { x: 0, y: 0 };
const _overlayMetrics = { offsetX: 0, offsetY: 0, width: 0, height: 0, containerWidth: 0, containerHeight: 0 };
const _ambientEffectByCell = new Map();

// 공사 진행 배지와 건설 확정 O/X 위젯은 미리보기 모형 바로 위 같은 높이에 붙는다.
const CONSTRUCTION_HUD_HEIGHT = 1.02;
const BUILD_OX_WIDGET_HEIGHT = 1.02;

let renderer;
let scene;
let camera;
let cameraController;
let canvasEl;
let containerEl;
let cameraHintEl;
let buildOxWidgetEl;
let buildOxConfirmEl;
let buildOxWidgetState = null;
let buildOxWidgetVisible = false;
const constructionHudEls = new Map();
const constructionHudPool = [];
const constructionHudIndices = new Set();
let lastTickProgress = 0;
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
let residentAgentCount = 0;
let birdCount = 0;
let birdPoolStart = 0;
let birdVisit = null;
let birdVisitController = null;
let ambientMotionController = null;
let reducedMotionQuery = null;
let cityEnvironment = null;
let ghostMesh;
let ghostMaterial;
let planGhostMaterial;
let hoveredPreviewIndex = -1;
// 포인터 없이 보드를 쓰는 경로. #cityGrid에 포커스가 있을 때만 살아 있고, 호버와 같은
// 표시 수단(무장 상태면 고스트, 아니면 선택 링)을 그대로 재사용한다.
let keyboardCursorIndex = -1;
let ghostSignature = null;
let buildPreviewMode = { enabled: false, type: null, candidateIndex: null, plannedItems: [], invalidIndices: [] };
let currentWorldHour = 8;
let currentSkyState = getSkyState(currentWorldHour);
let visualHourOverride = null;

let tileMesh;
let stateRingMesh;
let windRotorMesh;
let ambientAgentMesh;
let buildingLightMesh;
let buildingLightMaterial;
let smokeEffectMesh;
let statusLightMesh;
let constructionFoundationMesh;
let constructionScaffoldMesh;
let greenDetailMesh;
let facilityMaterial;
let tileMaterial;
let stateRingMaterial;
let hemisphereLight;
let sunLight;
let rimLight;
const facilityMeshes = new Map();
// 시설 타입의 1레벨(대표) 인스턴스드 메시. facilityMeshes는 항상 타입당 하나만 유지해
// 기존 고스트·통계 코드가 "타입 하나 = 메시 하나"를 가정한 채로 그대로 동작한다.
const extraLevelMeshes = new Map(); // key: `${type}:${level}` — 레벨마다 실제로 다른 모델을 쓰는 시설만 여기 추가된다.
const facilityCellIndexBuckets = new Map(); // key: type 또는 `${type}:${level}` — updateFacilityInstances의 렌더 버킷
const cellInstanceRef = new Map(); // cellIndex -> { mesh, instanceIndex } — 통계에서 실제로 어느 메시에 쓰였는지 찾는다.
const planGhostMeshes = new Map();
const typeCellIndices = new Map(FACILITY_TYPES.map((type) => [type, []]));
let worldPhase = getWorldPhase(8);
const residentialIndices = [];
const greenIndices = [];
let greenDetailCountsByLevel = { 1: 0, 2: 0, 3: 0 };
const activeMotions = new Map();
const activeAmbientEffects = new Map();
const ownedGeometries = new Set();
const ownedMaterials = new Set();
let ambientEffectSequence = 0;
// prewarm 렌더 직후의 texture 수는 three가 map 없는 머티리얼에 바인딩하는 내부 공용
// 빈 텍스처뿐이다(three 모듈 싱글턴이라 앱이 해제할 수 없다). 씬이 실제로 올린 텍스처는
// 이 기준선 위로 늘어난 몫이고, 해제 뒤에는 다시 기준선으로 돌아와야 한다.
let rendererBaselineTextures = 0;
let lastAmbientFrameAt = 0;
let ambientFrameUpdateCount = 0;

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

// 대부분의 시설은 레벨이 올라가도 같은 모델을 스케일만 키운다(facilityMeshes의 타입별
// 메시 하나로 충분). 화력·원자력·태양광·순환냉각·데이터센터처럼 레벨마다 실제로
// 다른 GLB를 쓰는 시설만 `${type}:${level}` 별도 버킷을 받는다.
function facilityBucketKey(type, level) {
  const ids = FACILITY_ASSET_IDS[type];
  if (!ids || level <= 1) return type;
  const assetId = ids[Math.min(2, level - 1)];
  if (!assetId || assetId === ids[0]) return type;
  return `${type}:${level}`;
}

function buildRuntimeFacilityMaterial(type, level) {
  const material = getFacilityMaterial(type, level);
  if (!material) return null;
  const runtimeMaterial = material.clone();
  if (runtimeMaterial.userData?.paletteBlackLift) {
    // 원본 팔레트의 창문·지붕·배관 디테일은 유지하되 순검정 영역만 살짝 들어 올린다.
    runtimeMaterial.emissive.setHex(0x101820);
    runtimeMaterial.emissiveIntensity = 0.18;
  }
  runtimeMaterial.color.setHex(0xffffff);
  runtimeMaterial.userData.facilityPaletteMode = runtimeMaterial.map ? 'textured-tint' : 'solid-tint';
  runtimeMaterial.needsUpdate = true;
  return ownMaterial(runtimeMaterial);
}

// 실제 보드에 그 (타입, 레벨) 조합이 처음 나타날 때만 메시를 만든다 — 안 쓰는 조합 때문에
// 드로우콜/GPU 버퍼 예산이 늘어나지 않는다. 한 번 만들면 씬 수명 동안 재사용한다.
function getOrCreateFacilityLevelMesh(type, level) {
  const key = `${type}:${level}`;
  let mesh = extraLevelMeshes.get(key);
  if (!mesh) {
    const geometry = getFacilityGeometry(type, level);
    const material = buildRuntimeFacilityMaterial(type, level) || facilityMaterial;
    mesh = makeInstancedMesh(geometry, material, MAX_CELLS);
    mesh.name = `facility-${key}`;
    extraLevelMeshes.set(key, mesh);
  }
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

  const greenDetailMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
  }));
  greenDetailMesh = makeInstancedMesh(
    ownGeometry(new THREE.ConeGeometry(1, 1, 5, 1)),
    greenDetailMaterial,
    MAX_CELLS * GREEN_VISUAL_LAYOUTS[3].length,
  );
  greenDetailMesh.name = 'green-level-details';

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

  planGhostMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x173e35,
    emissiveIntensity: 0.35,
    roughness: 0.54,
    metalness: 0.04,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  }));
  FACILITY_TYPES.forEach((type) => {
    const mesh = makeInstancedMesh(getFacilityGeometry(type), planGhostMaterial, MAX_CELLS);
    mesh.name = `facility-plan-ghost-${type}`;
    mesh.renderOrder = 7;
    planGhostMeshes.set(type, mesh);
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

  const constructionFoundationMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0x607080,
    roughness: 0.92,
    metalness: 0.02,
  }));
  constructionFoundationMesh = makeInstancedMesh(
    ownGeometry(new THREE.BoxGeometry(1, 1, 1)),
    constructionFoundationMaterial,
    MAX_CELLS,
  );
  constructionFoundationMesh.name = 'construction-foundations';

  const constructionScaffoldMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0xffbd59,
    emissive: 0x4a2d08,
    emissiveIntensity: 0.18,
    roughness: 0.58,
    metalness: 0.28,
  }));
  constructionScaffoldMesh = makeInstancedMesh(
    ownGeometry(new THREE.BoxGeometry(1, 1, 1)),
    constructionScaffoldMaterial,
    MAX_CELLS * 6,
  );
  constructionScaffoldMesh.name = 'construction-scaffolds';

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

  const smokeMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: CITY_AMBIENT_MOTION.SMOKE_OPACITY,
    depthWrite: false,
  }));
  smokeEffectMesh = makeInstancedMesh(
    ownGeometry(new THREE.SphereGeometry(1, 6, 4)),
    smokeMaterial,
    CITY_AMBIENT_MOTION.MAX_SMOKE_INSTANCES,
  );
  smokeEffectMesh.name = 'facility-ambient-smoke';

  const statusMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  }));
  statusLightMesh = makeInstancedMesh(
    ownGeometry(new THREE.BoxGeometry(1, 1, 1)),
    statusMaterial,
    CITY_AMBIENT_MOTION.MAX_STATUS_LIGHTS,
  );
  statusLightMesh.name = 'facility-ambient-status-lights';
  resourceRevision++;
}

function prewarmGpuBuffers() {
  const instanceLayers = [
    tileMesh,
    ...facilityMeshes.values(),
    ...planGhostMeshes.values(),
    stateRingMesh,
    constructionFoundationMesh,
    constructionScaffoldMesh,
    greenDetailMesh,
    windRotorMesh,
    ambientAgentMesh,
    buildingLightMesh,
    smokeEffectMesh,
    statusLightMesh,
  ];
  instanceLayers.forEach((mesh) => {
    setInstance(mesh, 0, 100, 100, 100, 0.001);
    mesh.setColorAt(0, _color.setHex(0xffffff));
    finishInstances(mesh, 1);
  });
  camera.position.set(4, 6, 6);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  instanceLayers.forEach((mesh) => { mesh.count = 0; });
}

function refreshLoadedAssets() {
  FACILITY_TYPES.forEach((type) => {
    const mesh = facilityMeshes.get(type);
    mesh.geometry = getFacilityGeometry(type, 1);
    planGhostMeshes.get(type).geometry = getFacilityGeometry(type, 1);
    const runtimeMaterial = buildRuntimeFacilityMaterial(type, 1);
    if (runtimeMaterial) mesh.material = runtimeMaterial;
  });
  // 자산이 아직 로딩 중일 때 먼저 만들어진 레벨별 버킷이 있다면(예: 저장된 도시를 바로
  // 불러온 경우) 실제 모델이 도착한 뒤 지오메트리·머티리얼을 다시 맞춘다.
  extraLevelMeshes.forEach((mesh, key) => {
    const separatorIndex = key.indexOf(':');
    const type = key.slice(0, separatorIndex);
    const level = Number(key.slice(separatorIndex + 1));
    mesh.geometry = getFacilityGeometry(type, level);
    const runtimeMaterial = buildRuntimeFacilityMaterial(type, level);
    if (runtimeMaterial) mesh.material = runtimeMaterial;
  });
  // 모든 메시가 실제 GLB로 갈아탄 뒤에 폴백 geometry를 버린다(교체 전에 버리면 다음
  // 렌더가 같은 버퍼를 다시 올린다).
  disposeReplacedFallbackGeometries();
  resourceRevision++;
  updateInstances(currentConfigs, currentCoords);
  updateStaticAmbientInstances();
  syncPlanGhosts();
  syncBuildGhost();
  needsRender = true;
}

function tileColorFor(config) {
  if (config.disabled) return TILE_COLORS.inactive;
  if (config.previewGood) return TILE_COLORS.previewGood;
  if (config.previewBad) return TILE_COLORS.previewBad;
  if (config.newLand) return TILE_COLORS.newLand;
  if (config.diagnosisState === 'problem') return TILE_COLORS.problem;
  if (config.diagnosisState === 'ok') return TILE_COLORS.ok;
  if (config.diagnosisState === 'unknown') return TILE_COLORS.unknown;
  if (config.selected) return TILE_COLORS.selected;
  if (config.zoneTrait === 'solar') return TILE_COLORS.zoneSolar;
  if (config.zoneTrait === 'residential') return TILE_COLORS.zoneResidential;
  if (config.zoneTrait === 'wind') return TILE_COLORS.zoneWind;
  if (config.zoneTrait === 'industrial') return TILE_COLORS.zoneIndustrial;
  return TILE_COLORS.base;
}

function markerColorFor(config) {
  if (config.diagnosisTarget) return MARKER_COLORS.selected;
  if (config.previewBad || config.diagnosisState === 'problem') return MARKER_COLORS.problem;
  if (config.researchWarning) return MARKER_COLORS.warn;
  if (config.previewGood || config.newLand || config.diagnosisState === 'ok') return MARKER_COLORS.good;
  if (config.diagnosisState === 'unknown') return MARKER_COLORS.unknown;
  if (config.selected) return MARKER_COLORS.selected;
  return null;
}

function worldPosition(index, coordinates = currentCoords, out = _worldPoint) {
  const coord = coordinates[index];
  if (!coord) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  return axialToWorld(coord, BOARD.HEX_SIZE, out);
}

// 캔버스/컨테이너 rect는 프레임당 한 번만 재고 두 오버레이(공사 배지, O/X 위젯)가 나눠 쓴다.
function readOverlayMetrics() {
  if (!camera || !canvasEl || !containerEl) return null;
  const rect = canvasEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  _overlayMetrics.offsetX = rect.left - containerRect.left;
  _overlayMetrics.offsetY = rect.top - containerRect.top;
  _overlayMetrics.width = rect.width;
  _overlayMetrics.height = rect.height;
  _overlayMetrics.containerWidth = containerRect.width;
  _overlayMetrics.containerHeight = containerRect.height;
  return _overlayMetrics;
}

function projectToOverlay(index, height, metrics) {
  const { x, z } = worldPosition(index);
  _projection.set(x, height, z).project(camera);
  _overlayPoint.x = metrics.offsetX + (_projection.x + 1) * metrics.width / 2;
  _overlayPoint.y = metrics.offsetY + (1 - _projection.y) * metrics.height / 2;
  return _overlayPoint;
}

// 가장자리 칸의 투영 좌표는 컨테이너 밖으로 나갈 수 있다(카메라 앵글, 먼 칸). 오버레이가
// 화면 밖에 숨어 읽히지도 눌리지도 않는 것을 막기 위해 항상 보이는 영역 안쪽에 고정한다.
function clampOverlayPoint(point, metrics, margin) {
  point.x = Math.min(Math.max(point.x, margin.x), Math.max(margin.x, metrics.containerWidth - margin.x));
  point.y = Math.min(Math.max(point.y, margin.top), Math.max(margin.top, metrics.containerHeight - margin.bottom));
  return point;
}

function createConstructionHud() {
  const root = document.createElement('div');
  root.className = 'world-construction-progress';
  root.dataset.worldConstructionProgress = '';
  root.hidden = true;
  root.innerHTML = '<div><strong>건설 중</strong><span>0%</span></div><em role="progressbar" aria-label="시설 공사 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></em>';
  containerEl.appendChild(root);
  // 자식 노드는 배지 수명 동안 바뀌지 않는다. 프레임마다 querySelector를 네 번 도는 대신
  // 한 번만 찾아 두고, 마지막으로 쓴 값도 함께 들고 있어 같은 값을 다시 쓰지 않는다.
  return {
    root,
    label: root.querySelector('strong'),
    percent: root.querySelector('span'),
    progressbar: root.querySelector('[role="progressbar"]'),
    fill: root.querySelector('[role="progressbar"] i'),
    lastProgress: null,
    lastLeft: null,
    lastTop: null,
    lastSelected: null,
    lastKind: null,
    visible: false,
  };
}

function acquireConstructionHud(config) {
  let badge = constructionHudEls.get(config.index);
  if (!badge) {
    badge = constructionHudPool.pop() || createConstructionHud();
    constructionHudEls.set(config.index, badge);
    badge.lastProgress = null;
    badge.lastLeft = null;
    badge.lastTop = null;
    badge.lastSelected = null;
    badge.lastKind = null;
    badge.root.dataset.projectIndex = String(config.index);
  }
  if (badge.lastKind !== config.project.kind) {
    badge.lastKind = config.project.kind;
    badge.root.dataset.projectKind = config.project.kind;
    // 문구('건설 중'/'강화 중')가 진행률 델타 게이트에 걸려 옛 종류로 남지 않게 한다.
    badge.lastProgress = null;
  }
  return badge;
}

function releaseInactiveConstructionHuds(activeIndices) {
  constructionHudEls.forEach((badge, index) => {
    if (activeIndices.has(index)) return;
    badge.root.hidden = true;
    badge.visible = false;
    badge.root.classList.remove('selected');
    delete badge.root.dataset.projectIndex;
    delete badge.root.dataset.projectKind;
    constructionHudEls.delete(index);
    constructionHudPool.push(badge);
  });
}

function collectConstructionIndices() {
  constructionHudIndices.clear();
  for (let index = 0; index < currentConfigs.length; index++) {
    if (currentConfigs[index]?.project) constructionHudIndices.add(index);
  }
  return constructionHudIndices;
}

function placeConstructionHuds(tickProgress, metrics) {
  constructionHudIndices.forEach((index) => {
    const config = currentConfigs[index];
    const badge = acquireConstructionHud(config);
    const point = clampOverlayPoint(
      projectToOverlay(index, CONSTRUCTION_HUD_HEIGHT, metrics),
      metrics,
      CITY_WORLD_OVERLAY.CONSTRUCTION_HUD_MARGIN,
    );
    if (point.x !== badge.lastLeft) {
      badge.lastLeft = point.x;
      badge.root.style.left = `${point.x}px`;
    }
    if (point.y !== badge.lastTop) {
      badge.lastTop = point.y;
      badge.root.style.top = `${point.y}px`;
    }
    const selected = Boolean(config.selected);
    if (selected !== badge.lastSelected) {
      badge.lastSelected = selected;
      badge.root.classList.toggle('selected', selected);
    }
    const progress = projectProgress(config.project, tickProgress);
    // 진행률이 눈에 보일 만큼 움직이지 않았으면 텍스트·aria·막대를 다시 쓰지 않는다.
    if (badge.lastProgress == null
      || Math.abs(progress - badge.lastProgress) >= CITY_WORLD_OVERLAY.CONSTRUCTION_HUD_MIN_PROGRESS_DELTA) {
      badge.lastProgress = progress;
      const percent = Math.round(progress * 100);
      const label = config.project.kind === 'build' ? '건설 중' : '강화 중';
      badge.label.textContent = label;
      badge.percent.textContent = `${percent}%`;
      badge.progressbar.setAttribute('aria-label', `${label} ${percent}%`);
      badge.progressbar.setAttribute('aria-valuenow', (progress * 100).toFixed(1));
      badge.fill.style.width = `${progress * 100}%`;
    }
    if (!badge.visible) {
      badge.visible = true;
      badge.root.hidden = false;
    }
  });
}

function placeBuildOxWidget(metrics) {
  if (!buildOxWidgetEl) return;
  if (!buildOxWidgetState || !metrics) {
    if (buildOxWidgetVisible) {
      buildOxWidgetVisible = false;
      buildOxWidgetEl.hidden = true;
    }
    return;
  }
  const { index, disabled } = buildOxWidgetState;
  const point = clampOverlayPoint(
    projectToOverlay(index, BUILD_OX_WIDGET_HEIGHT, metrics),
    metrics,
    CITY_WORLD_OVERLAY.OX_WIDGET_MARGIN,
  );
  buildOxWidgetEl.style.left = `${point.x}px`;
  buildOxWidgetEl.style.top = `${point.y}px`;
  buildOxConfirmEl.disabled = Boolean(disabled);
  if (!buildOxWidgetVisible) {
    buildOxWidgetVisible = true;
    buildOxWidgetEl.hidden = false;
  }
}

// 두 오버레이는 같은 카메라 행렬과 같은 rect 측정을 쓴다. 한 프레임에 한 번만 재고
// 그리라고 이 함수 하나로 묶는다. tickProgress를 생략하면 마지막으로 받은 값을 다시 쓴다 —
// 카메라 이동 때문에 도는 렌더 프레임이 진행률을 0으로 되돌리면 안 되기 때문이다.
function syncWorldOverlays(tickProgress = lastTickProgress) {
  lastTickProgress = tickProgress;
  const activeIndices = collectConstructionIndices();
  releaseInactiveConstructionHuds(activeIndices);
  const metrics = activeIndices.size || buildOxWidgetState ? readOverlayMetrics() : null;
  if (metrics) camera.updateMatrixWorld();
  if (metrics && activeIndices.size) placeConstructionHuds(tickProgress, metrics);
  placeBuildOxWidget(metrics);
}

export function refreshCityConstructionProgress(tickProgress = 0) {
  syncWorldOverlays(tickProgress);
}

function createBuildOxWidget() {
  const widget = document.createElement('div');
  widget.className = 'world-build-ox';
  widget.hidden = true;
  widget.innerHTML = '<button type="button" id="cancelBuildBtn" class="ox-btn ox-cancel" aria-label="건설 취소"><span aria-hidden="true">X</span></button>'
    + '<button type="button" id="confirmBuildBtn" class="ox-btn ox-confirm" aria-label="건설 확정"><span aria-hidden="true">O</span></button>';
  widget.querySelector('.ox-cancel').addEventListener('click', () => buildOxWidgetState?.onCancel?.());
  buildOxConfirmEl = widget.querySelector('.ox-confirm');
  buildOxConfirmEl.addEventListener('click', () => {
    if (buildOxWidgetState?.disabled) return;
    buildOxWidgetState?.onConfirm?.();
  });
  return widget;
}

export function setBuildOxWidget(state) {
  buildOxWidgetState = state || null;
  syncWorldOverlays();
}

function rebuildAmbientTopology() {
  residentialIndices.length = 0;
  greenIndices.length = 0;

  const staleEffectIds = [...activeAmbientEffects.values()]
    .filter((effect) => {
      const config = currentConfigs[effect.cellIndex];
      return !config || config.empty || config.type !== effect.type || config.project?.kind === 'build';
    })
    .map((effect) => effect.id);
  staleEffectIds.forEach((id) => {
    activeAmbientEffects.delete(id);
    ambientMotionController?.complete(id);
  });

  currentConfigs.forEach((config, index) => {
    if (!config || config.empty || !config.type || config.project?.kind === 'build') return;
    if (config.type === 'residential') residentialIndices.push(index);
    if (config.type === 'green') greenIndices.push(index);
  });

  residentAgentCount = residentialIndices.length * CITY_AMBIENT.RESIDENT_AGENTS_PER_CELL;
  // 정산(1배속 1초)마다 이 함수가 다시 돌기 때문에, 여기서 방문을 무조건 지우면 2초짜리
  // 새 방문 연출이 항상 중간에 끊긴다. 목적지 칸이 더 이상 녹지가 아닐 때만 취소한다.
  if (birdVisit && !greenIndices.includes(birdVisit.greenIndex)) {
    birdVisit = null;
    birdCount = 0;
  }
  updateStaticAmbientInstances();
  // updateStaticAmbientInstances가 새 풀 위치에 새를 다시 주차하므로, 살아남은 방문은
  // 즉시 현재 진행도로 다시 배치한다.
  if (birdVisit) updateBirdVisit(performance.now());
  if (staleEffectIds.length) updateAmbientEffectInstances();
}

function ambientEffectForCell(cellIndex) {
  for (const effect of activeAmbientEffects.values()) {
    if (effect.cellIndex === cellIndex) return effect;
  }
  return null;
}

function ambientProgress(effect, now) {
  return THREE.MathUtils.clamp((now - effect.startedAt) / effect.durationMs, 0, 1);
}

function updateWindRotorInstances(now = performance.now()) {
  // 로터마다 활성 효과 Map을 복사하지 않고, 프레임당 한 번만 칸 -> 효과 색인을 만든다.
  _ambientEffectByCell.clear();
  activeAmbientEffects.forEach((effect) => _ambientEffectByCell.set(effect.cellIndex, effect));
  const windCellIndices = typeCellIndices.get('wind');
  let instanceIndex = 0;
  for (const cellIndex of windCellIndices) {
    if (currentConfigs[cellIndex]?.project?.kind === 'build') continue;
    const config = visualConfigAt(currentConfigs, cellIndex);
    const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
    const position = worldPosition(cellIndex);
    const effect = _ambientEffectByCell.get(cellIndex);
    const animatedTurn = effect
      ? ambientProgress(effect, now) * Math.PI * 2 * CITY_AMBIENT_MOTION.WIND_TURNS_PER_EFFECT
      : 0;
    setRotatedInstance(
      windRotorMesh,
      instanceIndex,
      position.x,
      0.78 * level.scale,
      position.z + 0.015,
      level.scale,
      cellIndex * 0.23 + animatedTurn,
    );
    windRotorMesh.setColorAt(instanceIndex, _color.setHex(facilityColorFor('wind', config.level)).lerp(MARKER_COLORS.good, 0.35));
    instanceIndex++;
  }
  finishInstances(windRotorMesh, instanceIndex);
}

function updateStaticAmbientInstances() {
  const rotorIndices = typeCellIndices.get('wind');
  updateWindRotorInstances();

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

function updateAmbientEffectInstances(now = performance.now()) {
  let smokeCount = 0;
  let statusCount = 0;
  activeAmbientEffects.forEach((effect) => {
    const { x: centerX, z: centerZ } = worldPosition(effect.cellIndex);
    const progress = ambientProgress(effect, now);
    if (CITY_AMBIENT_MOTION.SMOKE_TYPES.includes(effect.type)) {
      const smoke = CITY_AMBIENT_MOTION.SMOKE[effect.type];
      const config = visualConfigAt(currentConfigs, effect.cellIndex);
      const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
      const rotation = facilityRotationY(effect.type, effect.cellIndex);
      const [localX, localZ] = smoke.stackOffset;
      const emitterX = localX * Math.cos(rotation) - localZ * Math.sin(rotation);
      const emitterZ = localX * Math.sin(rotation) + localZ * Math.cos(rotation);
      const stackHeight = visualYAt(effect.cellIndex, now)
        + CITY_ASSETS[effect.type].height * level.scale
        + smoke.heightPadding;
      for (let particle = 0; particle < smoke.particles; particle += 1) {
        const particleProgress = (progress + particle / smoke.particles) % 1;
        const phase = particleProgress * Math.PI * 2 + effect.cellIndex;
        const scale = smoke.baseScale + particleProgress * smoke.growth;
        const x = centerX + emitterX + Math.sin(phase) * smoke.wander;
        const y = stackHeight + particleProgress * smoke.rise;
        const z = centerZ + emitterZ + Math.cos(phase) * smoke.wander;
        setAmbientInstance(smokeEffectMesh, smokeCount, x, y, z, scale, scale, scale);
        smokeEffectMesh.setColorAt(smokeCount, _color.setHex(CITY_AMBIENT_MOTION.SMOKE_COLORS[effect.type]));
        smokeCount++;
      }
      return;
    }
    if (effect.type === 'wind') return;
    const color = CITY_AMBIENT_MOTION.STATUS_COLORS[effect.type] ?? 0xffffff;
    const [scaleX, scaleY, scaleZ] = CITY_AMBIENT_MOTION.STATUS_SCALE;
    for (let light = 0; light < CITY_AMBIENT_MOTION.STATUS_LIGHTS_PER_EFFECT; light += 1) {
      const phase = progress * Math.PI * 2 + light * Math.PI;
      const radius = CITY_AMBIENT_MOTION.STATUS_ORBIT_RADIUS;
      const pulse = 0.82 + Math.sin(phase * 2) * 0.18;
      setAmbientInstance(
        statusLightMesh,
        statusCount,
        centerX + Math.cos(phase) * radius,
        CITY_AMBIENT_MOTION.STATUS_BASE_HEIGHT + light * scaleY,
        centerZ + Math.sin(phase) * radius,
        scaleX * pulse,
        scaleY * pulse,
        scaleZ * pulse,
        -phase,
      );
      statusLightMesh.setColorAt(statusCount, _color.setHex(color));
      statusCount++;
    }
  });
  finishInstances(smokeEffectMesh, smokeCount);
  finishInstances(statusLightMesh, statusCount);
  updateWindRotorInstances(now);
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

function startFacilityAmbientEffect({ id, type, cellIndex, durationMs }) {
  const config = currentConfigs[cellIndex];
  if (
    !config
    || config.empty
    || config.type !== type
    || config.project?.kind === 'build'
    || type === 'green'
    || activeAmbientEffects.size >= CITY_AMBIENT_MOTION.MAX_ACTIVE_EFFECTS
    || ambientEffectForCell(cellIndex)
  ) return false;
  const [minimumDuration, maximumDuration] = ambientDurationBounds(type);
  const boundedDuration = THREE.MathUtils.clamp(
    Number(durationMs) || CITY_AMBIENT_MOTION.MIN_DURATION_MS,
    minimumDuration,
    maximumDuration,
  );
  const effect = {
    id: id || `city-ambient-manual-${++ambientEffectSequence}`,
    type,
    cellIndex,
    durationMs: boundedDuration,
    startedAt: performance.now(),
  };
  activeAmbientEffects.set(effect.id, effect);
  lastAmbientFrameAt = effect.startedAt;
  updateAmbientEffectInstances(effect.startedAt);
  needsRender = true;
  return true;
}

function stopFacilityAmbientEffect(id) {
  const removed = activeAmbientEffects.delete(id);
  if (!removed) return false;
  updateAmbientEffectInstances();
  needsRender = true;
  return true;
}

export function triggerFacilityAmbient(type, cellIndex, durationMs = CITY_AMBIENT_MOTION.MIN_DURATION_MS) {
  return startFacilityAmbientEffect({ type, cellIndex, durationMs });
}

export function finishFacilityAmbientEffects() {
  const effectIds = [...activeAmbientEffects.keys()];
  activeAmbientEffects.clear();
  effectIds.forEach((id) => ambientMotionController?.complete(id));
  if (smokeEffectMesh && statusLightMesh) updateAmbientEffectInstances();
  needsRender = true;
}

function updateFacilityAmbientMotion(now) {
  if (!activeAmbientEffects.size) return false;
  if (now - lastAmbientFrameAt < CITY_AMBIENT_MOTION.FRAME_INTERVAL_MS) return false;
  lastAmbientFrameAt = now;
  ambientFrameUpdateCount++;
  const completed = [];
  activeAmbientEffects.forEach((effect) => {
    if (now - effect.startedAt >= effect.durationMs) completed.push(effect.id);
  });
  completed.forEach((id) => {
    activeAmbientEffects.delete(id);
    ambientMotionController?.complete(id);
  });
  updateAmbientEffectInstances(now);
  return true;
}

function pauseBirdVisits({ pausesSimulation } = {}) {
  if (!pausesSimulation) return;
  birdVisitController?.pause('modal');
  ambientMotionController?.pause('modal');
  finishFacilityAmbientEffects();
}

function resumeBirdVisits({ pausesSimulation } = {}) {
  if (!pausesSimulation) return;
  birdVisitController?.resume('modal');
  ambientMotionController?.resume('modal');
}

function handleBirdVisibility() {
  if (document.hidden) {
    birdVisitController?.pause('hidden');
    ambientMotionController?.pause('hidden');
    finishFacilityAmbientEffects();
  } else {
    birdVisitController?.resume('hidden');
    ambientMotionController?.resume('hidden');
  }
}

function handleReducedMotion(event) {
  if (event.matches) {
    ambientMotionController?.pause('reduced-motion');
    finishFacilityAmbientEffects();
  } else {
    ambientMotionController?.resume('reduced-motion');
  }
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

function constructionStageForConfig(config) {
  const project = config?.project;
  if (!project) return null;
  const ratio = Number.isFinite(Number(project.progress))
    ? Number(project.progress)
    : (Number(project.elapsedDays) || 0) / Math.max(1, Number(project.durationDays) || 1);
  const progress = Math.max(0, Math.min(1, ratio));
  if (progress >= 0.7) return 'shell';
  if (progress >= 0.3) return 'skeleton';
  return 'foundation';
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
  facilityCellIndexBuckets.forEach((indices) => { indices.length = 0; });

  for (let index = 0; index < configs.length; index++) {
    const config = visualConfigAt(configs, index);
    const stage = constructionStageForConfig(config);
    const showFacility = config?.project?.kind !== 'build' || stage === 'shell';
    if (config?.empty || !showFacility || !typeCellIndices.has(config.type)) continue;
    typeCellIndices.get(config.type).push(index);
    const bucketKey = facilityBucketKey(config.type, config.level);
    let bucketIndices = facilityCellIndexBuckets.get(bucketKey);
    if (!bucketIndices) {
      bucketIndices = [];
      facilityCellIndexBuckets.set(bucketKey, bucketIndices);
    }
    bucketIndices.push(index);
  }

  facilityCellIndexBuckets.forEach((indices, bucketKey) => {
    const separatorIndex = bucketKey.indexOf(':');
    const type = separatorIndex === -1 ? bucketKey : bucketKey.slice(0, separatorIndex);
    const mesh = separatorIndex === -1
      ? facilityMeshes.get(type)
      : getOrCreateFacilityLevelMesh(type, Number(bucketKey.slice(separatorIndex + 1)));
    indices.forEach((cellIndex, instanceIndex) => {
      const config = visualConfigAt(configs, cellIndex);
      const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
      const { x, z } = worldPosition(cellIndex, coordinates);
      const shellScale = config.project?.kind === 'build' ? 0.82 : 1;
      const visualScale = visualScaleAt(cellIndex, level.scale * shellScale, now);
      const visualY = visualYAt(cellIndex, now);
      setInstance(mesh, instanceIndex, x, visualY, z, visualScale, 0, facilityRotationY(type, cellIndex));
      const facilityColor = facilityColorFor(type, config.level);
      mesh.setColorAt(instanceIndex, _color.setHex(facilityColor));
      cellInstanceRef.set(cellIndex, { mesh, instanceIndex });
    });
    finishInstances(mesh, indices.length);
  });
}

function updateGreenDetailInstances(configs, coordinates, now) {
  let instanceIndex = 0;
  greenDetailCountsByLevel = { 1: 0, 2: 0, 3: 0 };
  configs.forEach((rawConfig, cellIndex) => {
    const config = visualConfigAt(configs, cellIndex);
    if (!config || config.empty || config.type !== 'green') return;
    const stage = constructionStageForConfig(config);
    if (config.project?.kind === 'build' && stage !== 'shell') return;
    const levelNumber = Math.max(1, Math.min(3, Number(config.level) || 1));
    const level = LEVEL_VISUALS[levelNumber] || LEVEL_VISUALS[1];
    const shellScale = config.project?.kind === 'build' ? 0.82 : 1;
    const visualScale = visualScaleAt(cellIndex, level.scale * shellScale, now);
    const visualY = visualYAt(cellIndex, now);
    const { x, z } = worldPosition(cellIndex, coordinates);
    const cellRotation = (cellIndex * 0.73 + levelNumber * 0.31) % (Math.PI * 2);
    GREEN_VISUAL_LAYOUTS[levelNumber].forEach((item) => {
      const offsetX = item.x * Math.cos(cellRotation) - item.z * Math.sin(cellRotation);
      const offsetZ = item.x * Math.sin(cellRotation) + item.z * Math.cos(cellRotation);
      setAmbientInstance(
        greenDetailMesh,
        instanceIndex,
        x + offsetX * visualScale,
        visualY + item.height * visualScale * 0.5,
        z + offsetZ * visualScale,
        item.radius * visualScale,
        item.height * visualScale,
        item.radius * visualScale,
        cellRotation + item.rotation,
      );
      const baseColor = facilityColorFor('green', levelNumber);
      greenDetailMesh.setColorAt(
        instanceIndex,
        _color.setHex(baseColor).offsetHSL(
          item.kind === 'bush' ? -0.015 : 0.012,
          0.04,
          item.kind === 'bush' ? -0.07 : 0.04,
        ),
      );
      instanceIndex += 1;
      greenDetailCountsByLevel[levelNumber] += 1;
    });
  });
  finishInstances(greenDetailMesh, instanceIndex);
}

function updateConstructionInstances(configs, coordinates) {
  let foundationCount = 0;
  let scaffoldCount = 0;
  configs.forEach((config, cellIndex) => {
    if (!config?.project) return;
    const stage = constructionStageForConfig(config);
    const { x, z } = worldPosition(cellIndex, coordinates);
    const foundationHeight = config.project.kind === 'upgrade' ? 0.035 : 0.065;
    setBoxInstance(constructionFoundationMesh, foundationCount, x, 0.14 + foundationHeight / 2, z, 0.58, foundationHeight, 0.5);
    constructionFoundationMesh.setColorAt(foundationCount, _color.setHex(config.project.kind === 'upgrade' ? 0x557b8c : 0x66727a));
    foundationCount += 1;

    const height = stage === 'foundation' ? 0.13 : stage === 'skeleton' ? 0.55 : 0.78;
    const half = 0.38;
    [[-half, -half], [half, -half], [-half, half], [half, half]].forEach(([dx, dz]) => {
      setBoxInstance(constructionScaffoldMesh, scaffoldCount, x + dx, 0.17 + height / 2, z + dz, 0.025, height, 0.025);
      constructionScaffoldMesh.setColorAt(scaffoldCount, _color.setHex(0xffbd59));
      scaffoldCount += 1;
    });
    if (stage !== 'foundation') {
      [-half, half].forEach((dz) => {
        setBoxInstance(constructionScaffoldMesh, scaffoldCount, x, 0.17 + height, z + dz, 0.41, 0.025, 0.025);
        constructionScaffoldMesh.setColorAt(scaffoldCount, _color.setHex(0xffd27a));
        scaffoldCount += 1;
      });
    }
  });
  finishInstances(constructionFoundationMesh, foundationCount);
  finishInstances(constructionScaffoldMesh, scaffoldCount);
}

function updateBuildingLightInstances() {
  if (!buildingLightMesh || !currentConfigs.length || worldPhase !== 'night') {
    if (buildingLightMesh) finishInstances(buildingLightMesh, 0);
    return;
  }
  let lightCount = 0;
  currentConfigs.forEach((config, index) => {
    if (!config || config.empty || !config.type || config.project?.kind === 'build') return;
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
    // 키보드 커서는 어떤 진단 색보다 앞선다 — 지금 어디에 있는지가 먼저 보여야 한다.
    const markerColor = index === keyboardCursorIndex ? MARKER_COLORS.selected : markerColorFor(config);
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
  updateGreenDetailInstances(configs, coordinates, now);
  updateConstructionInstances(configs, coordinates);
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

  buildOxWidgetEl = createBuildOxWidget();
  container.appendChild(buildOxWidgetEl);

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

  // 로딩 화면 문구/막대는 main.js가 단독으로 소유한다. 여기서는 진척만 알린다.
  initCityAssets((loaded, total) => {
    eventBus.emit(Events.ASSETS_PROGRESS, { loaded, total });
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
  rendererBaselineTextures = renderer.info.memory.textures;
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
  eventBus.on(Events.MODAL_OPEN, pauseBirdVisits);
  eventBus.on(Events.MODAL_CLOSE, resumeBirdVisits);
  document.addEventListener('visibilitychange', handleBirdVisibility);

  birdVisitController = createBirdVisitController({
    getGreenIndices: () => greenIndices,
    onVisit: ({ greenIndex, birdCount: count, durationMs }) => triggerBirdVisit(greenIndex, count, durationMs),
  });
  birdVisitController.start();

  ambientMotionController = createAmbientMotionController({
    getCandidates: () => currentConfigs
      .filter((config) => config && !config.empty && config.type && config.type !== 'green' && config.project?.kind !== 'build')
      .map((config) => ({ type: config.type, cellIndex: config.index })),
    onStart: (effect) => {
      if (startFacilityAmbientEffect(effect)) return;
      queueMicrotask(() => ambientMotionController?.complete(effect.id));
    },
    onStop: (effect) => stopFacilityAmbientEffect(effect.id),
  });
  reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  if (reducedMotionQuery?.matches) ambientMotionController.pause('reduced-motion');
  reducedMotionQuery?.addEventListener?.('change', handleReducedMotion);
  ambientMotionController.start();

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
  window.__getCellScreenPosition = (index) => projectCellToScreen(index);

  cameraController.reset(currentRadius);
  resizeToContainer();
  needsRender = true;
  renderer.setAnimationLoop(renderFrame);
}

function capturePointer(event) {
  canvasEl.setPointerCapture(event.pointerId);
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

function buildGhostSignature(index, type, config) {
  // 고스트가 실제로 의존하는 값만 모은다. 같은 칸 위에서 마우스만 움직이면 이 값이 그대로라
  // 프레임마다 needsRender를 세우지 않고, 반대로 배치 가능 여부나 계획이 바뀌면 다시 그린다.
  return `${buildPreviewMode.enabled ? 1 : 0}|${index}|${type || ''}|${config?.empty ? 1 : 0}`
    + `|${config?.plannedType || ''}|${config?.placementAllowed === false ? 0 : 1}|${resourceRevision}`;
}

function syncBuildGhost() {
  if (!ghostMesh) return;
  // 포인터가 실제로 칸 위에 있으면 포인터가 이긴다. 그렇지 않을 때만 키보드 커서를 쓴다.
  const index = buildPreviewMode.candidateIndex
    ?? (hoveredPreviewIndex >= 0 ? hoveredPreviewIndex : keyboardCursorIndex);
  const config = currentConfigs[index];
  const type = buildPreviewMode.type;
  const signature = buildGhostSignature(index, type, config);
  if (signature === ghostSignature) return;
  ghostSignature = signature;
  if (!buildPreviewMode.enabled || index == null || index < 0 || !type || !FACILITY_TYPES.includes(type) || !config?.empty || config.plannedType) {
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

function syncPlanGhosts() {
  if (!planGhostMeshes.size) return;
  const plannedItems = buildPreviewMode.enabled ? buildPreviewMode.plannedItems || [] : [];
  const invalid = new Set(buildPreviewMode.invalidIndices || []);
  FACILITY_TYPES.forEach((type) => {
    const mesh = planGhostMeshes.get(type);
    const items = plannedItems.filter((item) => item.type === type);
    let count = 0;
    items.forEach(({ index }) => {
      if (!currentConfigs[index]?.empty || !currentCoords[index]) return;
      const { x, z } = worldPosition(index);
      const level = LEVEL_VISUALS[1];
      setInstance(mesh, count, x, 0.13, z, level.scale, 0, facilityRotationY(type, index));
      mesh.setColorAt(count, invalid.has(index) ? MARKER_COLORS.problem : MARKER_COLORS.good);
      count++;
    });
    finishInstances(mesh, count);
  });
  needsRender = true;
}

export function setBuildPreviewMode({ enabled = false, type = null, candidateIndex = null, plannedItems = [], invalidIndices = [] } = {}) {
  buildPreviewMode = {
    enabled: Boolean(enabled),
    type,
    candidateIndex,
    plannedItems: plannedItems.map(({ index, type: plannedType }) => ({ index, type: plannedType })),
    invalidIndices: [...invalidIndices],
  };
  if (!buildPreviewMode.enabled) hoveredPreviewIndex = -1;
  syncPlanGhosts();
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
  if (updateFacilityAmbientMotion(now)) shouldRender = true;
  if (activeMotions.size) {
    updateInstances(currentConfigs, currentCoords, now);
    if (completeFinishedMotions(now)) updateInstances(currentConfigs, currentCoords, now);
    shouldRender = true;
  }
  if (!shouldRender || !renderer) return;
  syncWorldOverlays();
  renderer.render(scene, camera);
  renderCount++;
  needsRender = false;
}

// cellConfigs: { empty, type, level, selected, newLand, previewGood, previewBad,
// diagnosisState, researchWarning, disabled } 배열이다.
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
  syncPlanGhosts();
  syncBuildGhost();
  syncWorldOverlays();
  needsRender = true;
}

export function setCellClickHandler(fn) {
  onCellClickCb = fn || (() => {});
}

// 칸 중심을 화면 좌표(뷰포트 기준)로 투영한다. 키보드 방향 이동이 "화면에서 오른쪽 칸"을
// 고르는 데 쓰고, 테스트 훅 __getCellScreenPosition도 같은 값을 돌려준다.
export function projectCellToScreen(index) {
  if (!canvasEl || !camera || !currentCoords[index]) return null;
  const { x, z } = worldPosition(index);
  camera.updateMatrixWorld();
  _projection.set(x, 0.04, z).project(camera);
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: rect.left + (_projection.x + 1) * rect.width / 2,
    y: rect.top + (1 - _projection.y) * rect.height / 2,
  };
}

export function setKeyboardCursor(index) {
  const next = Number.isInteger(index) && index >= 0 && index < currentConfigs.length ? index : -1;
  if (next === keyboardCursorIndex) return keyboardCursorIndex;
  keyboardCursorIndex = next;
  if (renderer) {
    updateInstances(currentConfigs, currentCoords);
    syncBuildGhost();
    needsRender = true;
  }
  return keyboardCursorIndex;
}

export function getCityRendererStats() {
  const facilityInstances = [...facilityMeshes.values(), ...extraLevelMeshes.values()]
    .reduce((total, mesh) => total + mesh.count, 0);
  const firstTileColor = tileMesh?.count ? tileMesh.getColorAt(0, _color).getHex() : null;
  const planGhostCount = [...planGhostMeshes.values()].reduce((total, mesh) => total + mesh.count, 0);
  const facilityVisualSamples = {};
  const sampleMatrix = new THREE.Matrix4();
  const samplePosition = new THREE.Vector3();
  const sampleQuaternion = new THREE.Quaternion();
  const sampleScale = new THREE.Vector3();
  const sampleEuler = new THREE.Euler();
  FACILITY_TYPES.forEach((type) => {
    const cellIndices = typeCellIndices.get(type);
    if (!cellIndices.length) return;
    // 레벨마다 다른 메시에 쓰일 수 있으므로(cellInstanceRef), 타입 안에서의 셀 순서는
    // 유지하되 각 칸이 실제로 기록된 메시·인스턴스 슬롯에서 값을 읽는다.
    const samples = cellIndices.map((cellIndex) => {
      const ref = cellInstanceRef.get(cellIndex);
      if (!ref) return null;
      ref.mesh.getMatrixAt(ref.instanceIndex, sampleMatrix);
      sampleMatrix.decompose(samplePosition, sampleQuaternion, sampleScale);
      sampleEuler.setFromQuaternion(sampleQuaternion, 'YXZ');
      return {
        level: currentConfigs[cellIndex]?.level || 1,
        color: ref.mesh.getColorAt(ref.instanceIndex, _color).getHex(),
        scale: Number(sampleScale.x.toFixed(3)),
        rotationY: Number(sampleEuler.y.toFixed(3)),
      };
    }).filter(Boolean);
    if (samples.length) facilityVisualSamples[type] = samples;
  });
  const smokeVisualSamples = Array.from({ length: smokeEffectMesh?.count || 0 }, (_, instanceIndex) => {
    smokeEffectMesh.getMatrixAt(instanceIndex, sampleMatrix);
    sampleMatrix.decompose(samplePosition, sampleQuaternion, sampleScale);
    return {
      x: Number(samplePosition.x.toFixed(3)),
      y: Number(samplePosition.y.toFixed(3)),
      z: Number(samplePosition.z.toFixed(3)),
      scale: Number(sampleScale.x.toFixed(3)),
    };
  });
  return {
    drawCalls: renderer?.info.render.calls ?? 0,
    geometryCount: renderer?.info.memory.geometries ?? 0,
    textureCount: renderer?.info.memory.textures ?? 0,
    occupiedCells: currentConfigs.filter((config) => !config.empty && config.type).length,
    tileInstances: tileMesh?.count ?? 0,
    inactiveTileCount: currentConfigs.filter((config) => config.disabled).length,
    zoneTileCounts: currentConfigs.reduce((counts, config) => {
      if (config.zoneTrait) counts[config.zoneTrait] = (counts[config.zoneTrait] || 0) + 1;
      return counts;
    }, {}),
    boardRadius: currentRadius,
    hexCellCount: currentCoords.length,
    facilityInstances,
    constructionSiteCount: currentConfigs.filter((config) => Boolean(config.project)).length,
    constructionStages: currentConfigs.reduce((counts, config) => {
      const stage = constructionStageForConfig(config);
      if (stage) counts[stage] = (counts[stage] || 0) + 1;
      return counts;
    }, {}),
    facilityVisualSamples,
    greenDetailInstances: greenDetailMesh?.count ?? 0,
    greenDetailCountsByLevel: { ...greenDetailCountsByLevel },
    instancedLayers: 1 + facilityMeshes.size + extraLevelMeshes.size + planGhostMeshes.size + 9,
    resourceRevision,
    activeMotions: activeMotions.size,
    motionKinds: [...activeMotions.values()].map((motion) => motion.kind),
    ambientInstances,
    energyLineLayerPresent: false,
    residentAgentCount,
    birdCount,
    birdPoolSize: BIRD_POOL_SIZE,
    windRotorCount: windRotorMesh?.count ?? 0,
    ambientEffectCount: activeAmbientEffects.size,
    ambientEffectKinds: [...activeAmbientEffects.values()].map((effect) => effect.type),
    smokeEffectCount: smokeEffectMesh?.count ?? 0,
    smokeVisualSamples,
    statusLightCount: statusLightMesh?.count ?? 0,
    ambientFrameIntervalMs: CITY_AMBIENT_MOTION.FRAME_INTERVAL_MS,
    ambientFrameUpdateCount,
    ambientMotionPaused: ambientMotionController?.getState().paused ?? false,
    ambientMotionScheduled: ambientMotionController?.getState().scheduled ?? false,
    worldPhase,
    sunIntensity: sunLight?.intensity ?? 0,
    renderCount,
    pixelRatio: renderer?.getPixelRatio() ?? 0,
    theme: currentTheme,
    firstTileColor,
    environment: cityEnvironment?.getStats() ?? { state: 'idle' },
    keyboardCursorIndex,
    ghostVisible: Boolean(ghostMesh?.visible),
    ghostCount: ghostMesh?.visible ? 1 : 0,
    planGhostCount,
    planGhostTypes: [...planGhostMeshes.entries()].filter(([, mesh]) => mesh.count > 0).map(([type]) => type).sort(),
    planGhostLayerCount: planGhostMeshes.size,
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

// InstancedMesh는 geometry/material 외에 instanceMatrix·instanceColor 버퍼도 들고 있다.
// dispose()가 그 attribute 버퍼를 지우고, 씬에서 떼어 내야 다음 렌더 리스트에도 안 남는다.
function disposeInstancedLayer(mesh) {
  if (!mesh) return;
  mesh.removeFromParent();
  mesh.dispose();
}

function disposeRuntimeMaterial(material) {
  if (!material) return;
  material.map?.dispose?.();
  material.dispose();
}

// 런타임 자원을 모두 놓아 준다. 정상 플레이 경로에서는 호출되지 않으며(씬은 한 번 마운트되어
// 페이지 수명을 함께한다) 누수 회귀 테스트가 이 경로를 검증한다.
// 반환값은 해제가 끝난 시점의 renderer.info.memory 스냅샷이다 — renderer 참조를 놓은 뒤에는
// 잴 수 없기 때문에 여기서 찍어서 돌려준다.
export async function disposeCityScene3D() {
  const disposedRenderer = renderer;
  renderer?.setAnimationLoop(null);
  resizeObserver?.disconnect();
  resizeObserver = null;
  eventBus.off(Events.BOARD_EXPANDED, resetCameraForBoardExpansion);
  eventBus.off(Events.BOARD_PLACED, handlePlaced);
  eventBus.off(Events.BOARD_UPGRADED, handleUpgraded);
  eventBus.off(Events.BOARD_DEMOLISHED, handleDemolished);
  eventBus.off(Events.THEME_CHANGED, applyWorldTheme);
  eventBus.off(Events.MODAL_OPEN, pauseBirdVisits);
  eventBus.off(Events.MODAL_CLOSE, resumeBirdVisits);
  document.removeEventListener('visibilitychange', handleBirdVisibility);
  reducedMotionQuery?.removeEventListener?.('change', handleReducedMotion);
  birdVisitController?.dispose();
  birdVisitController = null;
  ambientMotionController?.dispose();
  ambientMotionController = null;
  reducedMotionQuery = null;
  cityEnvironment?.dispose();
  cityEnvironment = null;
  constructionHudEls.forEach((badge) => badge.root.remove());
  constructionHudPool.forEach((badge) => badge.root.remove());
  constructionHudEls.clear();
  constructionHudPool.length = 0;
  constructionHudIndices.clear();
  buildOxWidgetEl?.remove();
  buildOxWidgetEl = null;
  buildOxConfirmEl = null;
  buildOxWidgetState = null;
  buildOxWidgetVisible = false;
  cameraHintEl?.remove();
  cameraHintEl = null;
  canvasEl?.removeEventListener('pointerdown', capturePointer);
  canvasEl?.removeEventListener('pointermove', updatePointer);
  canvasEl?.removeEventListener('pointerup', handlePointerClick);
  canvasEl?.removeEventListener('pointerleave', handlePointerLeave);
  cameraController?.dispose();
  [
    tileMesh,
    stateRingMesh,
    windRotorMesh,
    ambientAgentMesh,
    buildingLightMesh,
    smokeEffectMesh,
    statusLightMesh,
    constructionFoundationMesh,
    constructionScaffoldMesh,
    greenDetailMesh,
    ...facilityMeshes.values(),
    ...extraLevelMeshes.values(),
    ...planGhostMeshes.values(),
  ].forEach(disposeInstancedLayer);
  ghostMesh?.removeFromParent();
  ownedGeometries.forEach((geometry) => geometry.dispose());
  ownedMaterials.forEach(disposeRuntimeMaterial);
  scene?.clear();
  // 실제 GLB geometry/material/텍스처는 CityAssetLoader가 소유한다. 씬이 에셋 로드를
  // 시작했으니 정리도 여기서 함께 끝낸다(진행 중인 로드가 끝날 때까지 기다린다).
  await disposeCityAssets();
  const memory = {
    geometries: disposedRenderer?.info.memory.geometries ?? 0,
    textures: disposedRenderer?.info.memory.textures ?? 0,
    baselineTextures: rendererBaselineTextures,
  };
  disposedRenderer?.dispose();
  canvasEl = null;
  camera = null;
  scene = null;
  hemisphereLight = null;
  sunLight = null;
  rimLight = null;
  tileMesh = null;
  tileMaterial = null;
  stateRingMesh = null;
  stateRingMaterial = null;
  windRotorMesh = null;
  ambientAgentMesh = null;
  facilityMaterial = null;
  facilityMeshes.clear();
  extraLevelMeshes.clear();
  facilityCellIndexBuckets.clear();
  cellInstanceRef.clear();
  planGhostMeshes.clear();
  ownedGeometries.clear();
  ownedMaterials.clear();
  activeMotions.clear();
  activeAmbientEffects.clear();
  _ambientEffectByCell.clear();
  residentialIndices.length = 0;
  greenIndices.length = 0;
  typeCellIndices.forEach((indices) => { indices.length = 0; });
  currentConfigs = [];
  residentAgentCount = 0;
  birdCount = 0;
  birdVisit = null;
  ambientInstances = 0;
  cameraController = null;
  ghostMesh = null;
  ghostMaterial = null;
  ghostSignature = null;
  planGhostMaterial = null;
  buildingLightMesh = null;
  buildingLightMaterial = null;
  smokeEffectMesh = null;
  statusLightMesh = null;
  constructionFoundationMesh = null;
  constructionScaffoldMesh = null;
  greenDetailMesh = null;
  greenDetailCountsByLevel = { 1: 0, 2: 0, 3: 0 };
  currentWorldHour = 8;
  currentSkyState = getSkyState(currentWorldHour);
  visualHourOverride = null;
  hoveredPreviewIndex = -1;
  keyboardCursorIndex = -1;
  lastTickProgress = 0;
  buildPreviewMode = { enabled: false, type: null, candidateIndex: null, plannedItems: [], invalidIndices: [] };
  renderer = null;
  cameraInteractionReady = false;
  ambientEffectSequence = 0;
  lastAmbientFrameAt = 0;
  ambientFrameUpdateCount = 0;
  return memory;
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
