import * as THREE from 'three';
import { CITY_ASSETS, CITY_CAMERA, CITY_MOTION, LEVEL_VISUALS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import {
  getCityNeutralTexture,
  getFacilityGeometry,
  getSupplementGeometry,
  initCityAssets,
} from '../level/CityAssetLoader.js';
import { createCameraController } from '../systems/CameraController.js';

// 모든 레이어는 씬 수명 동안 유지된다. 상태 갱신은 instance matrix/color/count만 바꾸므로
// 시설 선택 미리보기나 연속 배치 때 WebGL 버퍼를 생성·삭제하지 않는다.
const MAX_CELLS = 36;
const TILE_SIZE = 0.88;
const TILE_BASE_COLOR = 0x0d1f31;
const FACILITY_TYPES = Object.keys(CITY_ASSETS);
const SUPPLEMENT_TYPES = FACILITY_TYPES.filter((type) => CITY_ASSETS[type].supplement);
const INFRA_TYPES = new Set(['data', 'thermal', 'cooling']);
const MAX_INFRA_PARTICLES = MAX_CELLS * CITY_MOTION.INFRA_PARTICLES_PER_CELL;

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
let ambientFrame = 0;
let ambientInstances = 0;
let ambientAngle = 0;
let lastAmbientTime = 0;

let groundMesh;
let tileMesh;
let pedestalMesh;
let stateRingMesh;
let linkMarkerMesh;
let windRotorMesh;
let infraParticles;
let infraParticlePositions;
let infraParticleColors;
let facilityMaterial;
let tileMaterial;
let pedestalMaterial;
let stateRingMaterial;
let linkMarkerMaterial;
let groundMaterial;
const facilityMeshes = new Map();
const supplementMeshes = new Map();
const typeCellIndices = new Map(FACILITY_TYPES.map((type) => [type, []]));
const activeMotions = new Map();
const ownedGeometries = new Set();
const ownedMaterials = new Set();

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

  infraParticlePositions = new Float32Array(MAX_INFRA_PARTICLES * 3);
  infraParticleColors = new Float32Array(MAX_INFRA_PARTICLES * 3);
  const particleGeometry = ownGeometry(new THREE.BufferGeometry());
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(infraParticlePositions, 3).setUsage(THREE.DynamicDrawUsage));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(infraParticleColors, 3).setUsage(THREE.DynamicDrawUsage));
  particleGeometry.setDrawRange(0, 0);
  const particleMaterial = ownMaterial(new THREE.PointsMaterial({
    size: 0.07,
    transparent: true,
    opacity: 0.74,
    vertexColors: true,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  infraParticles = new THREE.Points(particleGeometry, particleMaterial);
  infraParticles.frustumCulled = false;
  infraParticles.name = 'infrastructure-flow';
  scene.add(infraParticles);
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
  ];
  instanceLayers.forEach((mesh) => {
    setInstance(mesh, 0, 100, 100, 100, 0.001);
    mesh.setColorAt(0, _color.setHex(0xffffff));
    finishInstances(mesh, 1);
  });
  infraParticlePositions[0] = 100;
  infraParticlePositions[1] = 100;
  infraParticlePositions[2] = 100;
  infraParticles.geometry.setDrawRange(0, 1);
  infraParticles.geometry.attributes.position.needsUpdate = true;
  infraParticles.geometry.attributes.color.needsUpdate = true;
  camera.position.set(4, 6, 6);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  instanceLayers.forEach((mesh) => { mesh.count = 0; });
  infraParticles.geometry.setDrawRange(0, 0);
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

function updateAmbient(now) {
  const interval = 1000 / CITY_MOTION.AMBIENT_FPS;
  if (now - lastAmbientTime < interval) return false;
  const elapsedSeconds = lastAmbientTime
    ? Math.min((now - lastAmbientTime) / 1000, CITY_MOTION.MAX_DELTA_SECONDS)
    : interval / 1000;
  lastAmbientTime = now;
  ambientAngle += elapsedSeconds * CITY_MOTION.WIND_RADIANS_PER_SECOND;

  const windIndices = typeCellIndices.get('wind');
  windIndices.forEach((cellIndex, instanceIndex) => {
    const config = visualConfigAt(currentConfigs, cellIndex);
    const level = LEVEL_VISUALS[config.level] || LEVEL_VISUALS[1];
    const scale = visualScaleAt(cellIndex, level.scale, now);
    setRotatedInstance(
      windRotorMesh,
      instanceIndex,
      worldX(cellIndex, currentSize),
      0.78 * scale,
      worldZ(cellIndex, currentSize) + 0.015,
      scale,
      ambientAngle + cellIndex * 0.23,
    );
    windRotorMesh.setColorAt(instanceIndex, _color.setHex(level.color).lerp(MARKER_COLORS.good, 0.45));
  });
  finishInstances(windRotorMesh, windIndices.length);

  let particleCount = 0;
  for (let index = 0; index < currentConfigs.length; index++) {
    const config = visualConfigAt(currentConfigs, index);
    if (!config || config.empty || !INFRA_TYPES.has(config.type)) continue;
    const tint = config.type === 'thermal' ? 0xffa45b : config.type === 'cooling' ? 0x77d7ff : 0x54e4ff;
    _color.setHex(tint);
    for (let particle = 0; particle < CITY_MOTION.INFRA_PARTICLES_PER_CELL; particle++) {
      const offset = particleCount * 3;
      const phase = (now * 0.00028 + index * 0.173 + particle * 0.5) % 1;
      infraParticlePositions[offset] = worldX(index, currentSize) + (particle ? 0.12 : -0.12);
      infraParticlePositions[offset + 1] = 0.28 + phase * 0.7;
      infraParticlePositions[offset + 2] = worldZ(index, currentSize) + Math.sin(phase * Math.PI * 2) * 0.045;
      infraParticleColors[offset] = _color.r;
      infraParticleColors[offset + 1] = _color.g;
      infraParticleColors[offset + 2] = _color.b;
      particleCount++;
    }
  }
  infraParticles.geometry.setDrawRange(0, particleCount);
  infraParticles.geometry.attributes.position.needsUpdate = true;
  infraParticles.geometry.attributes.color.needsUpdate = true;
  ambientInstances = windIndices.length + particleCount;
  const hasAnimatedVisuals = ambientInstances > 0 || stateRingMesh.count > 0;
  if (hasAnimatedVisuals) ambientFrame++;
  return hasAnimatedVisuals;
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

  scene.add(new THREE.HemisphereLight(0xc8dcff, 0x101722, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(4, 8, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x54e4ff, 0.42);
  rim.position.set(-6, 4, -4);
  scene.add(rim);

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
  eventBus.on(Events.STAGE_CHANGED, resetCameraForStage);
  eventBus.on(Events.BOARD_PLACED, handlePlaced);
  eventBus.on(Events.BOARD_UPGRADED, handleUpgraded);
  eventBus.on(Events.BOARD_DEMOLISHED, handleDemolished);

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

function resetCameraForStage() {
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
  if (activeMotions.size) {
    updateInstances(currentConfigs, currentSize, now);
    if (completeFinishedMotions(now)) updateInstances(currentConfigs, currentSize, now);
    shouldRender = true;
  }
  if (updateAmbient(now)) {
    updateMarkerInstances(currentConfigs, currentSize, now);
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
  needsRender = true;
}

export function setCellClickHandler(fn) {
  onCellClickCb = fn || (() => {});
}

export function getCityRendererStats() {
  const facilityInstances = [...facilityMeshes.values()].reduce((total, mesh) => total + mesh.count, 0);
  return {
    drawCalls: renderer?.info.render.calls ?? 0,
    geometryCount: renderer?.info.memory.geometries ?? 0,
    textureCount: renderer?.info.memory.textures ?? 0,
    occupiedCells: currentConfigs.filter((config) => !config.empty && config.type).length,
    facilityInstances,
    instancedLayers: 1 + facilityMeshes.size + supplementMeshes.size + 4,
    resourceRevision,
    activeMotions: activeMotions.size,
    motionKinds: [...activeMotions.values()].map((motion) => motion.kind),
    ambientInstances,
    ambientFrame,
    renderCount,
    pixelRatio: renderer?.getPixelRatio() ?? 0,
  };
}

export function disposeCityScene3D() {
  renderer?.setAnimationLoop(null);
  resizeObserver?.disconnect();
  resizeObserver = null;
  eventBus.off(Events.STAGE_CHANGED, resetCameraForStage);
  eventBus.off(Events.BOARD_PLACED, handlePlaced);
  eventBus.off(Events.BOARD_UPGRADED, handleUpgraded);
  eventBus.off(Events.BOARD_DEMOLISHED, handleDemolished);
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
