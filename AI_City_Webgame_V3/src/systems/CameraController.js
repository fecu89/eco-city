import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CITY_CAMERA } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

const _ratio = new THREE.Vector3(...CITY_CAMERA.POSITION_RATIO).normalize();
const _clampedTarget = new THREE.Vector3();
const _targetDelta = new THREE.Vector3();

export function createCameraController({ camera, domElement, getBoardSize, onInteraction = () => {} }) {
  const controls = new OrbitControls(camera, domElement);
  const pointers = new Map();
  const completedGestures = new Map();
  let interacting = false;
  let multiTouch = false;
  let boardSize = getBoardSize();
  let aspectFit = 1;

  controls.enablePan = true;
  controls.enableDamping = true;
  controls.dampingFactor = CITY_CAMERA.DAMPING_FACTOR;
  controls.minPolarAngle = CITY_CAMERA.MIN_POLAR_ANGLE;
  controls.maxPolarAngle = CITY_CAMERA.MAX_POLAR_ANGLE;

  function applyDistanceBounds(size) {
    controls.minDistance = size * CITY_CAMERA.MIN_DISTANCE_PER_GRID;
    controls.maxDistance = size * CITY_CAMERA.MAX_DISTANCE_PER_GRID;
  }

  function clampTarget() {
    const extent = (boardSize - 1) / 2 + CITY_CAMERA.PAN_MARGIN;
    _clampedTarget.copy(controls.target);
    _clampedTarget.x = THREE.MathUtils.clamp(_clampedTarget.x, -extent, extent);
    _clampedTarget.y = THREE.MathUtils.clamp(_clampedTarget.y, 0, 1.25);
    _clampedTarget.z = THREE.MathUtils.clamp(_clampedTarget.z, -extent, extent);
    _targetDelta.subVectors(_clampedTarget, controls.target);
    if (_targetDelta.lengthSq() === 0) return;
    controls.target.copy(_clampedTarget);
    camera.position.add(_targetDelta);
  }

  function emitChanged() {
    clampTarget();
    onInteraction();
    eventBus.emit(Events.CAMERA_CHANGED, getState());
  }

  function onStart() {
    interacting = true;
    onInteraction();
  }

  function onEnd() {
    interacting = false;
    onInteraction();
  }

  function onPointerDown(event) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
    if (pointers.size > 1) {
      multiTouch = true;
      pointers.forEach((entry) => { entry.moved = true; });
    }
  }

  function onPointerMove(event) {
    const entry = pointers.get(event.pointerId);
    if (!entry) return;
    const dx = event.clientX - entry.x;
    const dy = event.clientY - entry.y;
    const threshold = CITY_CAMERA.DRAG_THRESHOLD_PX;
    if (dx * dx + dy * dy >= threshold * threshold) entry.moved = true;
  }

  function finishPointer(event) {
    const entry = pointers.get(event.pointerId);
    if (!entry) return;
    const click = !entry.moved && !multiTouch && pointers.size === 1;
    completedGestures.set(event.pointerId, click);
    pointers.delete(event.pointerId);
    if (pointers.size === 0) multiTouch = false;
  }

  function isGestureClick(pointerId) {
    const click = completedGestures.get(pointerId) === true;
    completedGestures.delete(pointerId);
    return click;
  }

  function reset(size = getBoardSize()) {
    boardSize = size;
    applyDistanceBounds(size);
    const distance = size * CITY_CAMERA.DISTANCE_PER_GRID * aspectFit;
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.target.set(0, 0, 0);
    camera.position.copy(_ratio).multiplyScalar(distance);
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    // 첫 update는 이전 드래그의 내부 spherical/pan delta를 소비하고 0으로 만든다.
    controls.update();
    // 잔여 delta가 지워진 뒤 목표 포즈를 한 번 더 적용해야 리셋이 결정적이다.
    controls.target.set(0, 0, 0);
    camera.position.copy(_ratio).multiplyScalar(distance);
    camera.lookAt(controls.target);
    controls.update();
    controls.enableDamping = damping;
    controls.saveState();
    eventBus.emit(Events.CAMERA_RESET, getState());
  }

  function fitAspect(aspect) {
    const nextFit = aspect < 1 ? Math.min(1.32, 1 + (1 - aspect) * 1.08) : 1;
    if (Math.abs(nextFit - aspectFit) < 0.001) return;
    const ratio = nextFit / aspectFit;
    camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
    aspectFit = nextFit;
    controls.update();
  }

  function resize(size = getBoardSize()) {
    boardSize = size;
    applyDistanceBounds(size);
    clampTarget();
  }

  function update() {
    return controls.update();
  }

  function getState() {
    const copy = (v) => [v.x, v.y, v.z].map((n) => Math.round(n * 10000) / 10000);
    return {
      position: copy(camera.position),
      target: copy(controls.target),
      distance: Math.round(camera.position.distanceTo(controls.target) * 10000) / 10000,
      interacting,
    };
  }

  function dispose() {
    controls.removeEventListener('start', onStart);
    controls.removeEventListener('change', emitChanged);
    controls.removeEventListener('end', onEnd);
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', finishPointer);
    domElement.removeEventListener('pointercancel', finishPointer);
    controls.dispose();
    pointers.clear();
    completedGestures.clear();
  }

  controls.addEventListener('start', onStart);
  controls.addEventListener('change', emitChanged);
  controls.addEventListener('end', onEnd);
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', finishPointer);
  domElement.addEventListener('pointercancel', finishPointer);
  reset(boardSize);

  return { controls, update, reset, resize, fitAspect, isGestureClick, getState, dispose };
}
