import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY_FALLBACK_PARTS, VISUAL } from '../core/Constants.js';

// 단위 도형(반지름 0.5·높이 1)을 CITY_FALLBACK_PARTS의 scale로 늘려 쓴다. 분할 수와 taper 윗반지름은
// settings.json VISUAL.FALLBACK_PRIMITIVES.
const PRIMITIVES = VISUAL.FALLBACK_PRIMITIVES;
const sourceGeometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, PRIMITIVES.CYLINDER_SEGMENTS),
  cone: new THREE.ConeGeometry(0.5, 1, PRIMITIVES.CONE_SEGMENTS),
  coneRound: new THREE.ConeGeometry(0.5, 1, PRIMITIVES.CONE_ROUND_SEGMENTS),
  sphere: new THREE.SphereGeometry(0.5, ...PRIMITIVES.SPHERE_SEGMENTS),
  taper: new THREE.CylinderGeometry(PRIMITIVES.TAPER_TOP_RADIUS, 0.5, 1, PRIMITIVES.TAPER_SEGMENTS),
};

const cache = new Map();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Euler();
const _quaternion = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();

function makePart({ shape, scale, position, rotation = [0, 0, 0] }) {
  const source = sourceGeometries[shape];
  if (!source) throw new Error(`Unknown fallback geometry shape: ${shape}`);
  _position.fromArray(position);
  _scale.fromArray(scale);
  _rotation.set(...rotation);
  _quaternion.setFromEuler(_rotation);
  _matrix.compose(_position, _quaternion, _scale);
  return source.clone().applyMatrix4(_matrix);
}

export function createFacilityFallbackGeometry(type) {
  if (cache.has(type)) return cache.get(type);
  const recipe = CITY_FALLBACK_PARTS[type];
  if (!recipe) throw new Error(`Unknown facility fallback type: ${type}`);
  const parts = recipe.map(makePart);
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  cache.set(type, geometry);
  return geometry;
}

// types를 주면 그 타입의 폴백만 버린다(실제 GLB로 교체된 시설). 생략하면 전부 버린다.
export function disposeFacilityFallbacks(types) {
  if (!types) {
    cache.forEach((geometry) => geometry.dispose());
    cache.clear();
    return;
  }
  types.forEach((type) => {
    cache.get(type)?.dispose();
    cache.delete(type);
  });
}
