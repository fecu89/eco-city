import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY_FALLBACK_PARTS } from '../core/Constants.js';

const sourceGeometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 4),
  coneRound: new THREE.ConeGeometry(0.5, 1, 8),
  sphere: new THREE.SphereGeometry(0.5, 10, 7),
  taper: new THREE.CylinderGeometry(0.34, 0.5, 1, 12),
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

export function disposeFacilityFallbacks() {
  cache.forEach((geometry) => geometry.dispose());
  cache.clear();
}
