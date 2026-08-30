import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function attributeSignature(attribute) {
  return [
    attribute?.constructor?.name,
    attribute?.itemSize,
    attribute?.normalized,
    attribute?.gpuType,
  ].join(':');
}

function alignAttributes(geometries) {
  const common = new Map(
    Object.entries(geometries[0].attributes)
      .map(([name, attribute]) => [name, attributeSignature(attribute)]),
  );
  geometries.slice(1).forEach((geometry) => {
    common.forEach((signature, name) => {
      if (attributeSignature(geometry.getAttribute(name)) !== signature) common.delete(name);
    });
  });
  geometries.forEach((geometry) => {
    Object.keys(geometry.attributes).forEach((name) => {
      if (!common.has(name)) geometry.deleteAttribute(name);
    });
  });
}

function ensureFloatPositions(geometry) {
  const position = geometry.getAttribute('position');
  if (!position) return geometry;
  if (position.array instanceof Float32Array && !position.normalized && !position.isInterleavedBufferAttribute) {
    return geometry;
  }
  const values = new Float32Array(position.count * position.itemSize);
  for (let index = 0; index < position.count; index++) {
    for (let component = 0; component < position.itemSize; component++) {
      values[index * position.itemSize + component] = position.getComponent(index, component);
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(values, position.itemSize, false));
  return geometry;
}

function mergePrepared(geometries) {
  const indexed = geometries.every((geometry) => geometry.index !== null);
  const nonIndexed = geometries.every((geometry) => geometry.index === null);
  const compatible = indexed || nonIndexed
    ? geometries
    : geometries.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
  alignAttributes(compatible);
  let merged = mergeGeometries(compatible, false);
  if (!merged) {
    const positionsOnly = compatible.map((geometry) => {
      const next = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      Object.keys(next.attributes).forEach((name) => {
        if (name !== 'position') next.deleteAttribute(name);
      });
      return next;
    });
    merged = mergeGeometries(positionsOnly, false);
    positionsOnly.forEach((geometry) => geometry.dispose());
    merged?.computeVertexNormals();
  }
  if (compatible !== geometries) compatible.forEach((geometry) => geometry.dispose());
  return merged;
}

/**
 * GLB 노드 변환을 적용한 뒤 모든 primitive를 한 geometry로 묶는다.
 * 나무·차량처럼 여러 mesh인 에셋도 InstancedMesh 한 레이어로 유지한다.
 */
export function mergeAssetPrimitives(primitives) {
  if (!primitives.length) throw new Error('GLB contains no mesh primitive');
  const geometries = primitives.map((primitive) => {
    // meshopt의 normalized Int16 position은 -1~1 밖의 평행이동을 다시 기록할 수 없다.
    // CPU에서 노드/월드 변환을 굽기 전에 Float32로 풀어 좌표가 중앙으로 순환하는 것을 막는다.
    const geometry = ensureFloatPositions(primitive.geometry.clone());
    geometry.applyMatrix4(primitive.matrix || new THREE.Matrix4());
    return geometry;
  });
  const merged = geometries.length === 1 ? geometries[0] : mergePrepared(geometries);
  if (geometries.length > 1) geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('GLB primitives could not be combined');
  return merged;
}

export function normalizeAssetGeometry(geometry, targetHeight, targetFootprint) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const footprint = Math.max(size.x, size.z);
  if (size.y <= 0 || footprint <= 0) throw new Error('GLB has invalid bounds');
  const scale = Math.min(targetHeight / size.y, targetFootprint / footprint);
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function prepareAssetGeometry(primitives, targetHeight, targetFootprint) {
  return normalizeAssetGeometry(mergeAssetPrimitives(primitives), targetHeight, targetFootprint);
}
