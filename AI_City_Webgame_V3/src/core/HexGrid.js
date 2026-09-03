// 육각 격자의 순수 기하 계산. core에 두어 GameState 같은 코어 모듈이 systems를 import하지 않게 한다.
export const HEX_DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

const coordinateCache = new Map();

export function coordKey({ q, r }) {
  return `${q},${r}`;
}

export function createHexCoordinates(radius) {
  if (!Number.isInteger(radius) || radius < 0) throw new Error(`Invalid hex radius: ${radius}`);
  if (coordinateCache.has(radius)) return coordinateCache.get(radius);
  const coordinates = [{ q: 0, r: 0 }];
  for (let ring = 1; ring <= radius; ring++) {
    let current = { q: -ring, r: ring };
    for (const direction of HEX_DIRECTIONS) {
      for (let step = 0; step < ring; step++) {
        coordinates.push(Object.freeze({ ...current }));
        current = { q: current.q + direction.q, r: current.r + direction.r };
      }
    }
  }
  const frozen = Object.freeze(coordinates);
  coordinateCache.set(radius, frozen);
  return frozen;
}

export function buildHexIndex(coords) {
  return new Map(coords.map((coord, index) => [coordKey(coord), index]));
}

export function neighborIndices(index, coords, indexByCoord = buildHexIndex(coords)) {
  const coordinate = coords[index];
  if (!coordinate) return [];
  return HEX_DIRECTIONS
    .map((direction) => indexByCoord.get(coordKey({
      q: coordinate.q + direction.q,
      r: coordinate.r + direction.r,
    })))
    .filter((neighbor) => neighbor !== undefined);
}

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// 렌더러는 이 함수를 프레임마다 칸 수만큼 부른다. out을 주면 그 객체에 채워 넣어
// 프레임당 수십 개의 임시 객체 할당을 없앤다(주지 않으면 새 객체를 만들어 돌려준다).
export function axialToWorld({ q, r }, size, out = { x: 0, z: 0 }) {
  if (!Number.isFinite(size) || size <= 0) throw new Error(`Invalid hex size: ${size}`);
  out.x = Math.sqrt(3) * size * (q + r / 2);
  out.z = 1.5 * size * r;
  return out;
}

export function isOuterRing(index, coords, radius) {
  const coordinate = coords[index];
  return Boolean(coordinate) && hexDistance(coordinate, { q: 0, r: 0 }) === radius;
}

export function expandHexGrid(grid, fromRadius, toRadius) {
  if (toRadius < fromRadius) throw new Error('Hex grid cannot shrink through expandHexGrid');
  const oldCount = createHexCoordinates(fromRadius).length;
  const newCount = createHexCoordinates(toRadius).length;
  if (grid.length !== oldCount) throw new Error(`Expected ${oldCount} cells, received ${grid.length}`);
  return [...grid, ...Array(newCount - oldCount).fill(null)];
}
