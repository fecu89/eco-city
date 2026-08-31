// 모든 게임 밸런스 수치는 실제 실측값이 아니라 교수학습용 상대값이다.

export const STAGES = {
  EXECUTION: 1,
  CRISIS: 2,
  CONCEPTS: 3,
  DIAGNOSIS: 4,
  REDESIGN: 5,
  REPORT: 6,
};

export const GAME = {
  INITIAL_CREDITS: 10,
  AUTOSAVE_KEY: 'ai-city-save-v1',
  AUTOSAVE_DEBOUNCE_MS: 600,
  EVENT_SEED: 20400101,
};

export const DISPLAY_UNITS = Object.freeze({
  CREDIT: '💰',
  CARBON: 'CO₂',
});

export const WORLD_LIGHTING_STORAGE_KEY = 'ai-city-world-lighting';
export const WORLD_LIGHTING_MODES = Object.freeze({
  day: Object.freeze({ id: 'day', label: '낮', hour: 12, icon: 'sun' }),
  dusk: Object.freeze({ id: 'dusk', label: '노을', hour: 17, icon: 'cloud-sun' }),
  night: Object.freeze({ id: 'night', label: '밤', hour: 23, icon: 'moon' }),
});

export const BOARD = Object.freeze({
  INITIAL_RADIUS: 2,
  EXPANDED_RADIUS: 3,
  INITIAL_CELLS: 19,
  EXPANDED_CELLS: 37,
  HEX_SIZE: 0.56,
  MAX_CELLS: 37,
});

export const HEX_TILE_VISUALS = Object.freeze({
  cityCoverage: 1.006,
  landCoverage: 1.006,
  shoreCoverage: 1.012,
  waterCoverage: 1.03,
});

export const ISLAND_LAYER_ELEVATIONS = Object.freeze({
  land: -0.19,
  shore: -0.12,
  shoreWaterSupport: -0.22,
  water: -0.12,
  ocean: -0.16,
  ship: -0.015,
});

export const COAST_PROP_ROTATION_OFFSETS = Object.freeze({
  dock: -(Math.PI * 2) / 3,
});

export const SIMULATION = {
  HOUR_MS: 1000,
  START_HOUR: 8,
};

export const CALENDAR = Object.freeze({
  START_YEAR: 2040,
  START_MONTH: 1,
  START_DAY: 1,
  START_HOUR: 8,
  MS_PER_GAME_HOUR: 60 * 60 * 1000,
});

export const TIME = Object.freeze({
  BASE_HOUR_MS: 1000,
  ALLOWED_SCALES: Object.freeze([0, 1, 2, 4]),
  DEFAULT_SCALE: 1,
  FAST_SCALE: 4,
});

export const AUDIO = Object.freeze({
  AMBIENT_GAIN: 0.045,
  AMBIENT_FADE_IN_SECONDS: 1.2,
  AMBIENT_FADE_OUT_SECONDS: 0.6,
  AMBIENT_STOP_DELAY_MS: 700,
  AMBIENT_CHORD_STEP_MS: 4000,
  AMBIENT_CHORDS: Object.freeze([
    Object.freeze([110, 164.81, 220]),
    Object.freeze([98, 146.83, 196]),
    Object.freeze([123.47, 164.81, 246.94]),
    Object.freeze([110, 146.83, 220]),
  ]),
});

export const QUEST_REQUIREMENTS = Object.freeze({
  OPERATING_HOURS: 2,
  WATER_CYCLE_POWER_RATIO: 0.9,
  FIRST_SOLAR_LOW_CARBON_PERCENT: 30,
  TRANSITION_LOW_CARBON_PERCENT: 40,
  TRANSITION_CARBON_MAX: 12,
});

export const FACILITY_BUILD_ORDER = Object.freeze([
  'residential', 'green', 'factory', 'thermal', 'data', 'nuclear',
  'cooling', 'solar', 'battery', 'wind', 'tidal',
]);

// 각 퀘스트에서 허용되는 시설별 누적 최대치다. 빈 항목은 이전 퀘스트 값을 유지한다.
export const FACILITY_LIMITS_BY_QUEST = Object.freeze({
  1: Object.freeze({ residential: 2 }),
  2: Object.freeze({ residential: 3, factory: 1, thermal: 1 }),
  3: Object.freeze({ residential: 4, factory: 2, green: 1 }),
  4: Object.freeze({ residential: 5, thermal: 2, data: 1 }),
  5: Object.freeze({ nuclear: 1 }),
  6: Object.freeze({ residential: 6, factory: 3, data: 2, cooling: 2, green: 2 }),
  7: Object.freeze({ residential: 7, solar: 2 }),
  8: Object.freeze({ solar: 3, battery: 2 }),
  9: Object.freeze({ residential: 8, factory: 4, data: 3, cooling: 3, wind: 2, green: 3 }),
  10: Object.freeze({ nuclear: 2, solar: 4, battery: 3, wind: 3 }),
  11: Object.freeze({ residential: 9, green: 5, tidal: 1 }),
  12: Object.freeze({ factory: 5, data: 4, cooling: 4, solar: 5, wind: 4, tidal: 2 }),
  13: Object.freeze({ residential: 10, battery: 4, green: 6 }),
  14: Object.freeze({ cooling: 5, solar: 6, wind: 5, green: 7, tidal: 3 }),
  15: Object.freeze({}),
});

export const RESEARCH_RULES = Object.freeze({
  DATA_CENTER_SPEED: Object.freeze([0, 1, 1.25, 1.5]),
  POWER_THRESHOLD: 0.9,
  EXTRA_DEMAND: 2,
  CANCEL_REFUND_RATIO: 0.5,
  HOURS_PER_DAY: 24,
  GAME_HOURS_PER_REAL_MINUTE: 60,
  QUIZ_QUESTION_COUNT: 4,
  DURATION_HOURS: Object.freeze({
    STANDARD: 120,
    ADVANCED: 150,
    CAPSTONE: 180,
  }),
});

export const CARBON_CRISIS = Object.freeze({
  SAFE_HOURLY: 10,
  GAME_OVER_HOURS: 168,
  RECOVERY_PER_SAFE_HOUR: 2,
  WARNING_HOURS: Object.freeze([24, 72, 144]),
  ACTIVE_AFTER_QUEST: 5,
});

export const POWER_RULES = {
  LOSS_PER_EXTRA_TILE: 0.06,
  MIN_EFFICIENCY: 0.55,
  HUB_EFFICIENCY: 0.95,
  BATTERY_OPERATION_MIN_RATIO: 0.9,
};

export const GRID_RESERVE_RULES = Object.freeze({
  BATTERY_SUBSTITUTE_QUEST_ID: 'storage-hub',
});

export const STRESS_TEST_RULES = Object.freeze({
  PHASE_HOURS: Object.freeze({ NORMAL: 4, HEATWAVE: 8, NIGHT_PEAK: 5, LOW_WIND_NIGHT: 6, RECOVERY: 4 }),
  CONSTRUCTION_COST_MULTIPLIER: 1.2,
  PASS_ESSENTIAL_SUPPLY_PERCENT: 70,
  BANKRUPTCY_FAILURE_HOURS: 6,
  HEALTHY_ESSENTIAL_SUPPLY_PERCENT: 90,
  SAFE_CARBON_RATE: 10,
  DEFAULT_WATER_LIMIT: 10,
});

export const STORAGE_LEVELS = {
  1: { capacity: 20, throughput: 8 },
  2: { capacity: 35, throughput: 12 },
  3: { capacity: 50, throughput: 16 },
};

export const FACILITY_ECONOMY = {
  residential: { income: 0.5, upkeep: 0 },
  factory: { income: 1, upkeep: 0 },
  data: { income: 2, upkeep: 0 },
  thermal: { income: 0, upkeep: 0.5 },
  nuclear: { income: 0, upkeep: 1 },
  solar: { income: 0, upkeep: 0.1 },
  wind: { income: 0, upkeep: 0.1 },
  battery: { income: 0, upkeep: 0.2 },
  cooling: { income: 0, upkeep: 0.2 },
  green: { income: 0, upkeep: 0.1 },
  tidal: { income: 0, upkeep: 0.3 },
};

export const WORKFORCE_LEVELS = {
  residential: [0, 10, 15, 22],
  factory: [0, 4, 6, 8],
  thermal: [0, 2, 3, 4],
  data: [0, 3, 5, 7],
  nuclear: [0, 5, 7, 9],
  solar: [0, 1, 2, 3],
  wind: [0, 1, 2, 3],
  battery: [0, 1, 2, 3],
  cooling: [0, 1, 2, 3],
  green: [0, 0, 0, 0],
  tidal: [0, 2, 3, 4],
};

export const ECONOMY_RULES = {
  STOP_POWER_RATIO: 0.25,
  BASE_RESIDENTIAL_TAX_RATIO: 0.25,
  OVERCROWDING_FREE_COUNT: 3,
  OVERCROWDING_COST_RATE: 0.1,
  POLLUTION_HEALTH_COST: 0.4,
  POLLUTION_TAX_MULTIPLIER: 0.5,
  CARBON_SAFE_RATE: 10,
  CLIMATE_RECOVERY_RATE: 0.25,
  UPKEEP_LEVEL_MULTIPLIERS: [0, 1, 1.4, 1.8],
};

export const CITY_CAMERA = {
  FOV: 42,
  NEAR: 0.1,
  FAR: 100,
  DISTANCE_PER_GRID: 1.55,
  POSITION_RATIO: [0.62, 0.92, 0.78],
  MIN_DISTANCE_PER_GRID: 0.72,
  MAX_DISTANCE_PER_GRID: 2.8,
  MIN_POLAR_ANGLE: 0.32,
  MAX_POLAR_ANGLE: Math.PI / 2.08,
  DAMPING_FACTOR: 0.075,
  PAN_MARGIN: 0.75,
  DRAG_THRESHOLD_PX: 7,
  GROUND_PLANE_SIZE: 18,
  GROUND_PLANE_OFFSET: [2.25, 2.8],
};

export const CITY_MOTION = {
  PLACE_MS: 480,
  UPGRADE_MS: 520,
  DEMOLISH_MS: 320,
  SELECT_PULSE_MS: 1400,
};

export const CITY_AMBIENT = {
  RESIDENT_AGENTS_PER_CELL: 2,
  PERSON_ORBIT_RADIUS: 0.35,
  PERSON_ANGLE_PER_CELL: 0.61,
  PERSON_SCALE: [0.045, 0.16, 0.045],
  CAR_ORBIT_RADIUS: 0.39,
  CAR_ANGLE_PER_CELL: 0.37,
  CAR_SCALE: [0.12, 0.045, 0.065],
  BIRD_BASE_HEIGHT: 0.88,
  BIRD_SCALE: [0.09, 0.018, 0.035],
  COLORS: {
    person: 0x8be9fd,
    car: 0xffd166,
    bird: 0xf1fbff,
  },
};

export const CITY_AMBIENT_MOTION = Object.freeze({
  MIN_DELAY_MS: 2500,
  MAX_DELAY_MS: 5000,
  FRAME_INTERVAL_MS: 100,
  MAX_ACTIVE_EFFECTS: 3,
  MIN_DURATION_MS: 600,
  MAX_DURATION_MS: 1600,
  MAX_SMOKE_INSTANCES: 18,
  MAX_STATUS_LIGHTS: BOARD.EXPANDED_CELLS * 2,
  SMOKE_TYPES: Object.freeze(['factory', 'thermal', 'nuclear']),
  STATUS_LIGHTS_PER_EFFECT: 2,
  SMOKE_OPACITY: 0.52,
  SMOKE: Object.freeze({
    factory: Object.freeze({
      particles: 3,
      durationMs: Object.freeze([1800, 3000]),
      stackOffset: Object.freeze([0.13, -0.08]),
      heightPadding: 0.02,
      rise: 0.48,
      baseScale: 0.06,
      growth: 0.075,
      wander: 0.045,
    }),
    thermal: Object.freeze({
      particles: 6,
      durationMs: Object.freeze([2400, 4000]),
      stackOffset: Object.freeze([0, 0]),
      heightPadding: 0.04,
      rise: 0.72,
      baseScale: 0.075,
      growth: 0.12,
      wander: 0.065,
    }),
    nuclear: Object.freeze({
      particles: 3,
      durationMs: Object.freeze([1800, 3000]),
      stackOffset: Object.freeze([0, 0]),
      heightPadding: 0.03,
      rise: 0.56,
      baseScale: 0.075,
      growth: 0.09,
      wander: 0.05,
    }),
  }),
  STATUS_BASE_HEIGHT: 0.38,
  STATUS_ORBIT_RADIUS: 0.25,
  STATUS_SCALE: Object.freeze([0.035, 0.025, 0.02]),
  WIND_TURNS_PER_EFFECT: 1.25,
  SMOKE_COLORS: Object.freeze({
    factory: 0x8d9aa3,
    thermal: 0x68747c,
    nuclear: 0xd8edf2,
  }),
  STATUS_COLORS: Object.freeze({
    residential: 0xffd166,
    data: 0x54e4ff,
    solar: 0xffe08a,
    battery: 0x71f5b4,
    cooling: 0x70cfff,
    tidal: 0x64ddff,
  }),
});

export const UI_FEEDBACK = {
  TOAST_MS: 2800,
  QUEST_ALERT_MS: 7000,
  QUEST_CELEBRATION_MS: 3200,
  QUEST_BURST_PARTICLES: 12,
};

export const QUEST_PANEL_LAYOUT = Object.freeze({
  STORAGE_KEY: 'ai-city-quest-panel-layout-v2',
  MOBILE_QUERY: '(max-width: 760px)',
  EDGE_MARGIN: 8,
  SAFE_GAP: 8,
  KEYBOARD_STEP: 12,
});

export const FLOATING_PANEL_STORAGE = Object.freeze({
  STATUS: 'ai-city-status-panel-layout-v1',
  SETTINGS: 'ai-city-settings-panel-layout-v1',
});

export const THEME_STORAGE_KEY = 'ai-city-theme';
export const THEME_SCHEMAS = {
  dark: {
    id: 'dark',
    label: '다크 모드',
    world: {
      clear: 0x0a1a27,
      ground: 0x0a2232,
      tile: 0x17364c,
      selectedTile: 0x1d4d69,
      hemisphereSky: 0xd7efff,
      hemisphereGround: 0x16283a,
      rim: 0x54e4ff,
    },
  },
  light: {
    id: 'light',
    label: '라이트 모드',
    world: {
      clear: 0xdceff4,
      ground: 0xb9d2da,
      tile: 0x91b5c2,
      selectedTile: 0x59a9c0,
      hemisphereSky: 0xffffff,
      hemisphereGround: 0x7f9fac,
      rim: 0x1688a7,
    },
  },
};

export const CITY_ASSETS = {
  residential: { height: 0.68 },
  factory: { height: 0.66 },
  data: { height: 0.82 },
  thermal: { height: 0.78 },
  nuclear: { height: 0.72 },
  solar: { height: 0.55 },
  wind: { height: 0.62 },
  battery: { height: 0.58 },
  cooling: { height: 0.6 },
  green: { height: 0.5 },
  tidal: { height: 0.58 },
};

export const CITY_ASSET_FOOTPRINT = 0.68;

export const LEVEL_VISUALS = [
  null,
  { color: 0xc7d2df, scale: 0.84, segments: 1, palette: 'variation-c' },
  { color: 0xb8d4ff, scale: 1, segments: 2, palette: 'colormap' },
  { color: 0xffd28a, scale: 1.18, segments: 3, palette: 'variation-a' },
];

// 진단 상태는 타일 테두리로, 시설의 정체성과 레벨은 본체 색상·크기로 구분한다.
// 각 배열은 [미사용, Lv.1, Lv.2, Lv.3] 순서다.
export const FACILITY_LEVEL_COLORS = Object.freeze({
  residential: Object.freeze([null, 0xd9cfc9, 0xffe3d5, 0xfff0d1]),
  factory: Object.freeze([null, 0xcbd0d3, 0xe3e0d7, 0xffddb0]),
  data: Object.freeze([null, 0xc9d7e2, 0xd8ebfa, 0xe4f3ff]),
  thermal: Object.freeze([null, 0xd8cbc4, 0xf0d7c9, 0xffd0af]),
  nuclear: Object.freeze([null, 0xd2cbdf, 0xe6dcf4, 0xf0e6ff]),
  solar: Object.freeze([null, 0xdcd6bd, 0xffefb9, 0xfff4cd]),
  wind: Object.freeze([null, 0xc8d9d7, 0xd9f0eb, 0xe5fff7]),
  battery: Object.freeze([null, 0xcbd8cf, 0xdff0e1, 0xecffeb]),
  cooling: Object.freeze([null, 0xc9d9df, 0xd9eff5, 0xe8fbff]),
  green: Object.freeze([null, 0xcbd8c8, 0xe1f0da, 0xedffe5]),
  tidal: Object.freeze([null, 0xc9d7df, 0xd7edf5, 0xe3f8ff]),
});

export const CITY_BUILDING_ORIENTATION = Object.freeze({
  step: Math.PI / 3,
  offsets: Object.freeze({
    residential: 0,
    factory: 2,
    data: 4,
    nuclear: 1,
    green: 3,
  }),
});

export function facilityColorFor(type, level = 1) {
  const palette = FACILITY_LEVEL_COLORS[type] || FACILITY_LEVEL_COLORS.residential;
  return palette[level] || palette[1];
}

export const CITY_FALLBACK_PARTS = {
  residential: [
    { shape: 'box', scale: [0.56, 0.32, 0.52], position: [0, 0.16, 0] },
    { shape: 'cone', scale: [0.45, 0.24, 0.45], position: [0, 0.44, 0], rotation: [0, Math.PI / 4, 0] },
  ],
  factory: [
    { shape: 'box', scale: [0.62, 0.3, 0.52], position: [0, 0.15, 0] },
    { shape: 'cylinder', scale: [0.09, 0.42, 0.09], position: [-0.17, 0.51, 0.06] },
    { shape: 'cylinder', scale: [0.08, 0.3, 0.08], position: [0.11, 0.45, 0.06] },
  ],
  data: [
    { shape: 'box', scale: [0.54, 0.52, 0.52], position: [0, 0.26, 0] },
    { shape: 'box', scale: [0.34, 0.05, 0.34], position: [0, 0.55, 0] },
  ],
  thermal: [
    { shape: 'box', scale: [0.55, 0.26, 0.54], position: [0, 0.13, 0] },
    { shape: 'cylinder', scale: [0.13, 0.76, 0.13], position: [0.02, 0.64, 0.02] },
  ],
  nuclear: [
    { shape: 'taper', scale: [0.68, 0.58, 0.68], position: [0, 0.29, 0] },
    { shape: 'sphere', scale: [0.34, 0.22, 0.34], position: [0, 0.6, 0] },
  ],
  solar: [
    { shape: 'cylinder', scale: [0.05, 0.28, 0.05], position: [0, 0.14, 0] },
    { shape: 'box', scale: [0.62, 0.04, 0.42], position: [0, 0.34, 0], rotation: [-0.4, 0, 0] },
  ],
  wind: [
    { shape: 'cylinder', scale: [0.05, 0.72, 0.05], position: [0, 0.36, 0] },
    { shape: 'sphere', scale: [0.08, 0.08, 0.08], position: [0, 0.72, 0] },
    { shape: 'box', scale: [0.04, 0.48, 0.07], position: [0, 0.72, 0] },
    { shape: 'box', scale: [0.04, 0.48, 0.07], position: [0, 0.72, 0], rotation: [0, 0, Math.PI / 3] },
    { shape: 'box', scale: [0.04, 0.48, 0.07], position: [0, 0.72, 0], rotation: [0, 0, -Math.PI / 3] },
  ],
  battery: [
    { shape: 'box', scale: [0.38, 0.48, 0.38], position: [0, 0.24, 0] },
    { shape: 'cylinder', scale: [0.13, 0.08, 0.13], position: [0, 0.52, 0] },
  ],
  cooling: [
    { shape: 'cylinder', scale: [0.52, 0.34, 0.52], position: [0, 0.17, 0] },
    { shape: 'sphere', scale: [0.13, 0.17, 0.13], position: [0, 0.46, 0] },
  ],
  green: [
    { shape: 'cylinder', scale: [0.04, 0.18, 0.04], position: [-0.15, 0.09, -0.05] },
    { shape: 'coneRound', scale: [0.2, 0.3, 0.2], position: [-0.15, 0.34, -0.05] },
    { shape: 'cylinder', scale: [0.035, 0.15, 0.035], position: [0.14, 0.075, 0.08] },
    { shape: 'coneRound', scale: [0.17, 0.26, 0.17], position: [0.14, 0.28, 0.08] },
  ],
  tidal: [
    { shape: 'cylinder', scale: [0.55, 0.18, 0.55], position: [0, 0.09, 0] },
    { shape: 'box', scale: [0.62, 0.08, 0.22], position: [0, 0.24, 0] },
    { shape: 'cylinder', scale: [0.1, 0.32, 0.1], position: [0, 0.42, 0] },
  ],
};

// 레벨(1~3)별 배율. 인덱스 0은 미사용.
export const LEVEL_MULTIPLIERS = {
  output: [0, 1, 1.48, 1.92], // dev/supply
  demand: [0, 1, 1.24, 1.45],
  impact: [0, 1, 1.16, 1.30], // 양수 carbon/water
  negative: [0, 1, 1.35, 1.65], // 음수 carbon/water (감소 효과 강화)
};

export const FACILITIES = {
  residential: { name: '주거지', icon: '🏢', cost: 2, dev: 5, demand: 2, supply: 0, carbon: 0, water: 1, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '🌳 인접 시 생활권 +4' },
  factory: { name: '공장', icon: '🏭', cost: 4, dev: 2, demand: 4, supply: 0, carbon: 2, water: 1, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '⚡ 발전소 인접 시 생산 +7' },
  data: { name: '데이터센터', icon: '🖥️', cost: 6, dev: 10, demand: 8, supply: 0, carbon: 0, water: 5, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '연구 수행 · 순환냉각 인접 시 물 부담 감소' },
  thermal: { name: '화력발전', icon: '🔥', cost: 5, dev: 3, demand: 0, supply: 13, carbon: 8, water: 2, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '전력↑ · 탄소 부담 큼' },
  nuclear: { name: '핵발전', icon: '⚛️', cost: 8, dev: 3, demand: 0, supply: 19, carbon: 1, water: 5, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '💧 냉각시설 인접 시 물부담↓' },
  solar: { name: '태양광', icon: '☀️', cost: 5, dev: 3, demand: 0, supply: 7, carbon: 0, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 3, desc: '🔋 저장장치 인접 시 안정공급' },
  wind: { name: '풍력', icon: '🌬️', cost: 5, dev: 3, demand: 0, supply: 8, carbon: 0, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 3, desc: '🔋 저장장치 인접 시 안정공급' },
  battery: { name: '에너지저장', icon: '🔋', cost: 4, dev: 2, demand: 1, supply: 0, carbon: 0, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 3, desc: '☀️🌬️ 인접 재생에너지 안정화' },
  cooling: { name: '순환냉각', icon: '💧', cost: 4, dev: 1, demand: 1, supply: 0, carbon: 0, water: -5, unlockStage: STAGES.REDESIGN, maxLevel: 3, desc: '🖥️/⚛️ 인접 시 추가 효과' },
  green: { name: '녹지', icon: '🌳', cost: 2, dev: 1, demand: 0, supply: 0, carbon: -1, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 1, desc: '🏢 주거 인접 시 생활권 +4' },
  tidal: { name: '조력발전', icon: '🌊', cost: 7, dev: 3, demand: 0, supply: 10, carbon: 0, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 3, placement: 'outer_ring', desc: '외곽 육각에서 일정한 저탄소 전력을 공급' },
};

export const QUIZ_BANK = [
  {
    id: 'power-balance',
    title: '전력수지',
    prompt: (ctx) => `신뢰가능 공급 ${ctx.baseline.reliableSupply}, 수요 ${ctx.baseline.demand}. 전력수지는?`,
    options: (ctx) => {
      const b = Math.round((ctx.baseline.reliableSupply - ctx.baseline.demand) * 10) / 10;
      return [
        { text: `${b}; 음수면 공급 부족`, correct: true },
        { text: `${ctx.baseline.demand}; 클수록 안정`, correct: false },
        { text: `${Math.round((ctx.baseline.reliableSupply + ctx.baseline.demand) * 10) / 10}; 0이면 안정`, correct: false },
        { text: `${ctx.baseline.dev}; 발전점수와 동일`, correct: false },
      ];
    },
    explain: '전력수지 = 공급−수요. 시설 업그레이드가 수요를 함께 키울 수 있다는 점도 함께 봅니다.',
  },
  {
    id: 'spatial-design',
    title: '공간 배치',
    prompt: () => '공장이 발전소와 인접할 때 생산 보너스를 주는 규칙의 학습 의미로 가장 적절한 것은?',
    options: () => [
      { text: '시설의 기능은 종류뿐 아니라 공간적 연결과 기반시설에 좌우될 수 있음을 표현한다.', correct: true },
      { text: '실제 모든 공장은 반드시 발전소 바로 옆에 있어야 한다.', correct: false },
      { text: '발전소가 공장의 원료를 직접 생산한다.', correct: false },
      { text: '인접하면 전력 손실이 항상 0이 된다.', correct: false },
    ],
    explain: '게임의 인접 규칙은 실제 거리를 재현한 것이 아니라 기반시설·연결성을 공간적으로 사고하게 하는 모델입니다.',
  },
  {
    id: 'cooling',
    title: '데이터센터 냉각',
    prompt: () => '데이터센터를 순환냉각 시설과 연결했을 때 냉각 부담을 줄이는 이유는?',
    options: () => [
      { text: '서버 연산에서 발생한 열을 제거하는 냉각 과정이 필요하기 때문', correct: true },
      { text: '데이터센터가 전기를 생산하기 때문', correct: false },
      { text: '서버가 물을 연산 매체로 직접 사용하기 때문', correct: false },
      { text: '냉각은 전력 사용과 무관하기 때문', correct: false },
    ],
    explain: '서비스 연산 → 서버 발열 → 냉각이라는 물리적 연결을 모델링합니다.',
  },
  {
    id: 'transmission-distance',
    title: '송전 거리',
    prompt: () => '발전소와 소비 시설 사이가 멀어질 때 이 게임에서 생기는 변화는?',
    options: () => [
      { text: '육각 거리만큼 송전 손실이 커져 실제 도달 전력이 줄어든다.', correct: true },
      { text: '발전량 자체가 자동으로 늘어난다.', correct: false },
      { text: '유지비가 언제나 0이 된다.', correct: false },
      { text: '저장장치 용량이 거리만큼 커진다.', correct: false },
    ],
    explain: '전력은 멀리 보낼수록 손실이 생깁니다. 저장 허브를 소비지 가까이에 두면 손실을 줄일 수 있습니다.',
  },
  {
    id: 'renewable-storage',
    title: '재생에너지와 저장장치',
    prompt: () => '태양광·풍력을 에너지저장 시설과 인접시켰을 때 "신뢰가능 공급"이 높아지는 이유는?',
    options: () => [
      { text: '해가 없거나 바람이 없을 때도 저장된 전력을 꺼내 쓸 수 있어 공급 변동성이 줄기 때문', correct: true },
      { text: '저장장치가 태양광 패널의 발전량 자체를 늘려주기 때문', correct: false },
      { text: '저장장치가 탄소를 흡수하기 때문', correct: false },
      { text: '저장장치가 있으면 데이터센터 냉각이 필요 없어지기 때문', correct: false },
    ],
    explain: '재생에너지는 발전량이 들쭉날쭉해 그대로는 "신뢰가능 공급"으로 잡히는 비율이 낮습니다. 저장장치가 그 변동성을 완충합니다.',
  },
];

export const REPORT_TIERS = [
  { min: 85, icon: '🏆', title: '그린시티 마스터' },
  { min: 70, icon: '🥇', title: '저탄소 도시 설계자' },
  { min: 0, icon: '🧭', title: '기후 적응 운영자' },
];
