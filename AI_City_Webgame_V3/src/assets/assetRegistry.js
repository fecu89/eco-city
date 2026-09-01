const OFFICIAL = Object.freeze({
  hexagon: { creator: 'Kenney', pack: 'Hexagon Kit', officialUrl: 'https://kenney.nl/assets/hexagon-kit' },
  roads: { creator: 'Kenney', pack: 'City Kit Roads', officialUrl: 'https://kenney.nl/assets/city-kit-roads' },
  suburban: { creator: 'Kenney', pack: 'City Kit Suburban', officialUrl: 'https://kenney.nl/assets/city-kit-suburban' },
  commercial: { creator: 'Kenney', pack: 'City Kit Commercial', officialUrl: 'https://kenney.nl/assets/city-kit-commercial' },
  industrial: { creator: 'Kenney', pack: 'City Kit Industrial', officialUrl: 'https://kenney.nl/assets/city-kit-industrial' },
  nature: { creator: 'Kenney', pack: 'Nature Kit', officialUrl: 'https://kenney.nl/assets/nature-kit' },
  car: { creator: 'Kenney', pack: 'Car Kit', officialUrl: 'https://kenney.nl/assets/car-kit' },
  people: { creator: 'Kenney', pack: 'Blocky Characters', officialUrl: 'https://kenney.nl/assets/blocky-characters' },
  space: { creator: 'Quaternius', pack: 'Ultimate Space Kit', officialUrl: 'https://quaternius.com/packs/ultimatespacekit.html' },
  farm: { creator: 'Quaternius', pack: 'Farm Buildings Pack', officialUrl: 'https://quaternius.com/packs/farmbuildings.html' },
  spaceBits: { creator: 'Kay Lousberg', pack: 'Space Bits', officialUrl: 'https://kaylousberg.itch.io/space-bits' },
});

function external(id, path, source, options = {}) {
  return Object.freeze({
    kind: 'glb',
    id,
    path,
    creator: OFFICIAL[source].creator,
    pack: OFFICIAL[source].pack,
    officialUrl: OFFICIAL[source].officialUrl,
    license: 'CC0-1.0',
    scale: options.scale ?? 1,
    rotationY: options.rotationY ?? 0,
    yOffset: options.yOffset ?? 0,
    footprint: options.footprint ?? 1,
    static: options.static ?? true,
    instanced: options.instanced ?? true,
    phase: options.phase || 'idle',
    fallback: options.fallback || null,
  });
}

function procedural(id, source, fallback, options = {}) {
  return Object.freeze({
    kind: 'procedural',
    id,
    path: null,
    creator: source ? OFFICIAL[source].creator : 'AI City project',
    pack: source ? OFFICIAL[source].pack : 'Three.js procedural geometry',
    officialUrl: source ? OFFICIAL[source].officialUrl : null,
    license: source ? 'CC0-1.0' : 'project-code',
    scale: 1,
    rotationY: 0,
    yOffset: 0,
    footprint: 1,
    static: true,
    instanced: options.instanced ?? true,
    phase: options.phase || 'unlock',
    fallback,
  });
}

export const ASSETS = Object.freeze({
  terrain: Object.freeze({
    hexGrass: external('terrain.hexGrass', '/assets/environment/terrain/hex-grass.glb', 'hexagon', { phase: 'critical', fallback: 'hex' }),
    hexDirt: external('terrain.hexDirt', '/assets/environment/terrain/hex-dirt.glb', 'hexagon', { fallback: 'hex' }),
    hexWater: external('terrain.hexWater', '/assets/environment/terrain/hex-water.glb', 'hexagon', { fallback: 'hex' }),
  }),
  roads: Object.freeze({
    straight: external('roads.straight', '/assets/roads/road-straight.glb', 'roads'),
    curve: external('roads.curve', '/assets/roads/road-curve.glb', 'roads'),
    tee: external('roads.tee', '/assets/roads/road-tee.glb', 'roads'),
    cross: external('roads.cross', '/assets/roads/road-cross.glb', 'roads'),
    sidewalk: external('roads.sidewalk', '/assets/roads/sidewalk.glb', 'roads'),
  }),
  residential: Object.freeze({
    house1: external('residential.house1', '/assets/buildings/residential/house-01.glb', 'suburban', { phase: 'critical', fallback: 'residential' }),
    house3: external('residential.house3', '/assets/buildings/residential/house-03.glb', 'suburban', { phase: 'unlock', fallback: 'residential' }),
    house4: external('residential.house4', '/assets/buildings/residential/house-04.glb', 'suburban', { phase: 'unlock', fallback: 'residential' }),
  }),
  commercial: Object.freeze({
    medium1: external('commercial.medium1', '/assets/buildings/commercial/commercial-01.glb', 'commercial'),
    skyscraperC: external('commercial.skyscraperC', '/assets/buildings/commercial/skyscraper-c.glb', 'commercial', { fallback: 'data' }),
    skyscraperE: external('commercial.skyscraperE', '/assets/buildings/commercial/skyscraper-e.glb', 'commercial', { fallback: 'data' }),
  }),
  industrial: Object.freeze({
    factorySmall: external('industrial.factorySmall', '/assets/buildings/industrial/factory-small.glb', 'industrial', { phase: 'critical', fallback: 'factory' }),
    storageTank: external('industrial.storageTank', '/assets/buildings/industrial/storage-tank.glb', 'industrial', { phase: 'unlock' }),
    thermalSmall: external('industrial.thermalSmall', '/assets/buildings/industrial/thermal-n.glb', 'industrial', { phase: 'unlock', fallback: 'thermal' }),
    thermalMedium: external('industrial.thermalMedium', '/assets/buildings/industrial/thermal-m.glb', 'industrial', { phase: 'unlock', fallback: 'thermal' }),
    thermalLarge: external('industrial.thermalLarge', '/assets/buildings/industrial/thermal-l.glb', 'industrial', { phase: 'unlock', fallback: 'thermal' }),
    nuclearSmall: external('industrial.nuclearSmall', '/assets/buildings/industrial/chimney-small.glb', 'industrial', { phase: 'unlock', fallback: 'nuclear' }),
    nuclearMedium: external('industrial.nuclearMedium', '/assets/buildings/industrial/chimney-medium.glb', 'industrial', { phase: 'unlock', fallback: 'nuclear' }),
    nuclearLarge: external('industrial.nuclearLarge', '/assets/buildings/industrial/chimney-large-2.glb', 'industrial', { phase: 'unlock', fallback: 'nuclear' }),
    solarPanelPortrait: external('industrial.solarPanelPortrait', '/assets/buildings/industrial/solar-panel-portrait.glb', 'industrial', { phase: 'unlock', fallback: 'solar' }),
    solarPanelLandscape: external('industrial.solarPanelLandscape', '/assets/buildings/industrial/solar-panel-landscape.glb', 'industrial', { phase: 'unlock', fallback: 'solar' }),
    solarPanelLandscapeGroup: external('industrial.solarPanelLandscapeGroup', '/assets/buildings/industrial/solar-panel-landscape-group.glb', 'industrial', { phase: 'unlock', fallback: 'solar' }),
    detailTankLarge: external('industrial.detailTankLarge', '/assets/buildings/industrial/detail-tank-large.glb', 'industrial', { phase: 'unlock', fallback: 'cooling' }),
    batteryContainer: external('industrial.batteryContainer', '/assets/buildings/industrial/battery-container-b.glb', 'industrial', { phase: 'unlock', fallback: 'battery' }),
    windmillLow: external('industrial.windmillLow', '/assets/buildings/industrial/windmill-low.glb', 'industrial', { phase: 'unlock', fallback: 'wind' }),
    windmill: external('industrial.windmill', '/assets/buildings/industrial/windmill.glb', 'industrial', { phase: 'unlock', fallback: 'wind' }),
  }),
  tidal: Object.freeze({
    cargo: external('tidal.cargo', '/assets/buildings/tidal/cargo.glb', 'spaceBits', { phase: 'unlock', fallback: 'tidal' }),
    cargoDepotA: external('tidal.cargoDepotA', '/assets/buildings/tidal/cargo-depot-a.glb', 'spaceBits', { phase: 'unlock', fallback: 'tidal' }),
    cargoDepotAlt: external('tidal.cargoDepotAlt', '/assets/buildings/tidal/cargo-depot-alt.glb', 'spaceBits', { phase: 'unlock', fallback: 'tidal' }),
  }),
  environment: Object.freeze({
    coast: Object.freeze({
      dock: external('environment.coast.dock', '/assets/environment/coast/building-dock.glb', 'hexagon'),
      grassHill: external('environment.coast.grassHill', '/assets/environment/coast/grass-hill.glb', 'hexagon'),
      stoneHill: external('environment.coast.stoneHill', '/assets/environment/coast/stone-hill.glb', 'hexagon'),
      forest: external('environment.coast.forest', '/assets/environment/coast/grass-forest.glb', 'hexagon'),
    }),
    water: Object.freeze({
      rocks: external('environment.water.rocks', '/assets/environment/water/water-rocks.glb', 'hexagon'),
      island: external('environment.water.island', '/assets/environment/water/water-island.glb', 'hexagon'),
      ship: external('environment.water.ship', '/assets/environment/water/ship.glb', 'hexagon'),
    }),
    trees: Object.freeze({
      tree1: external('environment.tree1', '/assets/environment/trees/tree-01.glb', 'nature'),
      tree2: external('environment.tree2', '/assets/environment/trees/tree-02.glb', 'nature'),
      tree3: external('environment.tree3', '/assets/environment/trees/tree-03.glb', 'nature'),
      tree4: external('environment.tree4', '/assets/environment/trees/tree-04.glb', 'nature'),
      bush1: external('environment.bush1', '/assets/environment/trees/bush-01.glb', 'nature'),
    }),
    rocks: Object.freeze({
      rock1: external('environment.rock1', '/assets/environment/rocks/rock-01.glb', 'nature'),
      rock2: external('environment.rock2', '/assets/environment/rocks/rock-02.glb', 'nature'),
      rock3: external('environment.rock3', '/assets/environment/rocks/rock-03.glb', 'nature'),
    }),
  }),
  vehicles: Object.freeze({
    car1: external('vehicles.car1', '/assets/vehicles/car-01.glb', 'car'),
    car2: external('vehicles.car2', '/assets/vehicles/car-02.glb', 'car'),
    truck1: external('vehicles.truck1', '/assets/vehicles/truck-01.glb', 'car'),
  }),
  people: Object.freeze({
    citizen1: external('people.citizen1', '/assets/people/citizen-01.glb', 'people', { instanced: false }),
    citizen2: external('people.citizen2', '/assets/people/citizen-02.glb', 'people', { instanced: false }),
  }),
  animals: Object.freeze({ birds: procedural('animals.birds', null, 'birds', { instanced: false }) }),
});

function collect(node, result = []) {
  if (node?.kind) result.push(node);
  else Object.values(node || {}).forEach((value) => collect(value, result));
  return result;
}

const FLAT_ASSETS = Object.freeze(collect(ASSETS));
const BY_ID = new Map(FLAT_ASSETS.map((asset) => [asset.id, asset]));

export function flattenAssets() {
  return [...FLAT_ASSETS];
}

export function getAsset(id) {
  const asset = BY_ID.get(id);
  if (!asset) throw new Error(`Unknown asset: ${id}`);
  return asset;
}

export function assetIdsByPhase(phase) {
  return FLAT_ASSETS.filter((asset) => asset.phase === phase).map((asset) => asset.id);
}

// 세 값이 모두 같으면 레벨이 올라가도 같은 모델을 스케일만 키워서 쓴다(factory/green처럼
// 단일 모델을 스케일만 다르게 쓰기로 한 시설 포함). 세 값 중 일부가 다르면 그 레벨은
// 실제로 다른 GLB를 쓴다(순환냉각·풍력은 1·2단계만 공유하고 3단계에서 바뀐다).
export const FACILITY_ASSET_IDS = Object.freeze({
  residential: Object.freeze(['residential.house1', 'residential.house3', 'residential.house4']),
  factory: Object.freeze(['industrial.factorySmall', 'industrial.factorySmall', 'industrial.factorySmall']),
  data: Object.freeze(['commercial.medium1', 'commercial.skyscraperC', 'commercial.skyscraperE']),
  thermal: Object.freeze(['industrial.thermalSmall', 'industrial.thermalMedium', 'industrial.thermalLarge']),
  nuclear: Object.freeze(['industrial.nuclearSmall', 'industrial.nuclearMedium', 'industrial.nuclearLarge']),
  solar: Object.freeze(['industrial.solarPanelPortrait', 'industrial.solarPanelLandscape', 'industrial.solarPanelLandscapeGroup']),
  wind: Object.freeze(['industrial.windmillLow', 'industrial.windmillLow', 'industrial.windmill']),
  battery: Object.freeze(['industrial.batteryContainer', 'industrial.batteryContainer', 'industrial.batteryContainer']),
  cooling: Object.freeze(['industrial.storageTank', 'industrial.storageTank', 'industrial.detailTankLarge']),
  green: Object.freeze(['environment.coast.forest', 'environment.coast.forest', 'environment.coast.forest']),
  tidal: Object.freeze(['tidal.cargo', 'tidal.cargoDepotA', 'tidal.cargoDepotAlt']),
});
