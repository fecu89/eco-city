// 모든 게임 밸런스 수치는 실제 실측값이 아니라 교수학습용 상대값이다.
//
// 규칙 수치·표와 연출 수치는 프로젝트 루트 settings.json이 소유한다(docs/settings.md). 이 파일은 그 값을
// 예전과 같은 이름으로 다시 내보내고, JSON에 둘 수 없는 것 — 화면 문구·아이콘 이름·색상(0x…)·CSS 값·
// 문구 함수·Math.PI 파생값 — 만 직접 정의한다. 소비 코드는 import 경로·이름을 바꾸지 않아도 된다.
import { SETTINGS } from './Settings.js';

// 값은 저장 파일에 그대로 들어가므로 남은 단계의 번호를 다시 매기지 않는다.
// DIAGNOSIS(4)는 옛 저장을 되살리는 hydrate 보정에서만 쓰인다.
export const STAGES = SETTINGS.STAGES;

export const GAME = SETTINGS.GAME;

export const DISPLAY_UNITS = Object.freeze({
  CREDIT: '💰',
  CARBON: 'CO₂',
});

// 월드는 항상 낮 한 가지로 렌더한다. 시간대 전환은 제거했고, 밝기와 하늘색은 테마와 무관하게 고정이다.
// 밝기(강도)는 settings.json VISUAL.WORLD_DAY_LIGHTING, 색은 여기.
export const WORLD_DAY_LIGHTING = Object.freeze({
  ...SETTINGS.VISUAL.WORLD_DAY_LIGHTING,
  SUN_COLOR: 0xffffff,
  SKY_TOP: 0x5aaee8,
  SKY_BOTTOM: 0xcbeaff,
});

export const BOARD = SETTINGS.BOARD;

// 시설은 건설할 때만 방향을 고른다(45° 8방위). rotation은 이 배열의 인덱스(0~7)다.
// 인덱스가 곧 저장값(rotation)이고 angle은 DIRECTION_RULES.STEP_DEGREES의 배수라 JSON으로 옮기지 않는다.
export const FACILITY_DIRECTIONS = Object.freeze([
  Object.freeze({ id: 'N', label: '북', angle: 0 }),
  Object.freeze({ id: 'NE', label: '북동', angle: 45 }),
  Object.freeze({ id: 'E', label: '동', angle: 90 }),
  Object.freeze({ id: 'SE', label: '남동', angle: 135 }),
  Object.freeze({ id: 'S', label: '남', angle: 180 }),
  Object.freeze({ id: 'SW', label: '남서', angle: 225 }),
  Object.freeze({ id: 'W', label: '서', angle: 270 }),
  Object.freeze({ id: 'NW', label: '북서', angle: 315 }),
]);

export const DIRECTION_RULES = SETTINGS.DIRECTION_RULES;

export const TIDAL_RULES = Object.freeze({
  COASTAL_RING: SETTINGS.BOARD.EXPANDED_RADIUS, // 37칸 섬의 3링이 바다와 맞닿는다
  ...SETTINGS.TIDAL_RULES,
  LABEL: (range, factor) => `조차 ${range}m · 출력 ${Math.round(factor * 100)}%`,
});

// 방향(회전)·풍향·조차를 설명하는 화면 문구. 시설 방향은 건설할 때만 고를 수 있으므로
// 여기 문구는 건설 위젯·방향 모달·건설 확정 바·시설 창에서만 쓰인다.
export const DIRECTION_COPY = Object.freeze({
  ROTATE_LABEL: '건물 회전',
  ROTATE_TITLE: '45° 회전',
  ROTATE_ICON: 'rotate-cw',
  INFO_LABEL: '방향별 발전량',
  INFO_ICON: 'compass',
  MODAL_EYEBROW: 'FACILITY DIRECTION',
  MODAL_TITLE: (facilityName) => `${facilityName} 방향별 발전량`,
  MODAL_INTRO: '방향을 고르면 건설 계획에 바로 반영됩니다. 완공한 뒤에는 방향을 바꿀 수 없습니다.',
  BEST_BADGE: '최적',
  OUTPUT: (factor) => `출력 ${Math.round(factor * 100)}%`,
  SUMMARY: (label, factor) => `방향 ${label} · 출력 ${Math.round(factor * 100)}%`,
  INSPECTOR: (label, factor, bestLabel) => `방향 ${label} · 출력 ${Math.round(factor * 100)}% (최적 ${bestLabel})`,
  WIND_HINT: (label) => `이 칸의 바람: ${label}`,
  SOLAR_HINT: '태양은 남쪽에 있습니다',
  COASTAL_BLOCKED_TITLE: '해안 칸이 필요합니다',
});

// 3D 보드는 포인터로만 조작할 수 있었다. 키 이름·이동 벡터·내적 임계는 settings.json BOARD_KEYBOARD에,
// 화면 낭독 문구(#cityGrid 포커스 상태)는 여기에 있다.
export const BOARD_KEYBOARD = Object.freeze({
  ...SETTINGS.BOARD_KEYBOARD,
  ROLE: 'application',
  ARIA_LABEL: '육각 도시 건설 대지. 화살표 키로 칸을 옮기고 Enter 또는 Space로 선택합니다. Home은 중앙 칸, Escape는 선택 해제, R은 건설 계획 방향 회전입니다.',
  EMPTY_CELL_TEXT: '빈 대지',
  cellAnnouncement: (index, description) => `칸 ${index}: ${description}`,
  facilityDescription: (name, level) => `${name} Lv.${level}`,
});

export const HEX_TILE_VISUALS = SETTINGS.VISUAL.HEX_TILE_VISUALS;

export const ISLAND_LAYER_ELEVATIONS = SETTINGS.VISUAL.ISLAND_LAYER_ELEVATIONS;

export const COAST_PROP_ROTATION_OFFSETS = Object.freeze({
  dock: -(Math.PI * 2) / 3,
});

export const CHART_MOTION = SETTINGS.VISUAL.CHART_MOTION;

export const CALENDAR = SETTINGS.CALENDAR;

export const TIME = SETTINGS.TIME;

// 보드 점수(BoardSystem.calcMetrics) 가중치.
export const SCORING = SETTINGS.SCORING;

// 강화 비용 배수(현재 레벨 기준)와 철거 환급률.
export const UPGRADE_COST_RATIOS = SETTINGS.UPGRADE_COST_RATIOS;
export const DEMOLITION_REFUND_RATIO = SETTINGS.DEMOLITION_REFUND_RATIO;

// 확장 연출(새 대지 하이라이트)이 가라앉기를 기다리는 시간.
export const GRID_EXPANSION_SETTLE_MS = SETTINGS.VISUAL.GRID_EXPANSION_SETTLE_MS;

export const CONSTRUCTION = SETTINGS.CONSTRUCTION;

// 실제 플레이는 숙고·배치 검토·모달 확인 시간을 포함해 15~30분을 목표로 한다.
// 자동화 테스트는 게임 시간을 가속하므로 이 계약을 별도 검증한다.
export const CAMPAIGN_PACING = SETTINGS.CAMPAIGN_PACING;

// 한 게임일이 현실 1초이므로 퀘스트 시작 후 EVENT_FORECAST_DAYS만큼의 운영·재정 준비 구간을 보장한다.
// 준비 구간은 자동으로 일시정지하지 않으며, 실제 재해가 활성화될 때만 상단 상태를 표시한다.
// core/*Definitions.js도 순환 없이 읽을 수 있도록 상수는 여기에 둔다.
export const EVENT_FORECAST_DAYS = SETTINGS.EVENT_FORECAST_DAYS;
export const EVENT_GAP_DAYS = SETTINGS.EVENT_GAP_DAYS;

export const AUDIO = SETTINGS.AUDIO;

export const QUEST_REQUIREMENTS = SETTINGS.QUEST_REQUIREMENTS;

export const FACILITY_BUILD_ORDER = SETTINGS.FACILITY_BUILD_ORDER;

// 각 퀘스트에서 허용되는 시설별 누적 최대치다. 빈 항목은 이전 퀘스트 값을 유지한다.
// 7행은 동·서 분기 공용이다. 서부 분기는 풍력이 먼저 해금되므로 두 발전원을 함께 연다.
export const FACILITY_LIMITS_BY_QUEST = SETTINGS.FACILITY_LIMITS_BY_QUEST;

export const RESEARCH_RULES = SETTINGS.RESEARCH_RULES;

// 캠페인 구간별 일일 CO₂ 목표. 기초는 전환선, 준비 단계는 도시 안전선, 기후전부터는 강화 기준이다.
export const DAILY_CARBON_TARGETS = SETTINGS.DAILY_CARBON_TARGETS;

export const CARBON_CRISIS = SETTINGS.CARBON_CRISIS;

export const CITY_FAILURE_RULES = SETTINGS.CITY_FAILURE_RULES;

// 캠페인 전체에서 한 번만 받을 수 있는 파산 직전 구제금. 받으면 최종 운영 점수에서 차감된다.
export const EMERGENCY_SUPPORT = SETTINGS.EMERGENCY_SUPPORT;

export const POWER_RULES = SETTINGS.POWER_RULES;

export const GRID_RESERVE_RULES = SETTINGS.GRID_RESERVE_RULES;

// 물 한도는 언제나 "그 시점 도시의 실제 사용량"을 기준으로 잡는다. 기준을 아직 측정하지
// 못한 저장·초기 상태에서만 DEFAULT_BASELINE을 쓴다.
export const WATER_RULES = SETTINGS.WATER_RULES;

export const STRESS_TEST_RULES = SETTINGS.STRESS_TEST_RULES;

export const STORAGE_LEVELS = SETTINGS.STORAGE_LEVELS;

export const COOLING_RULES = SETTINGS.COOLING_RULES;

export const FACILITY_ECONOMY = SETTINGS.FACILITY_ECONOMY;

// REBALANCE_GRACE_DAYS: 인력이 모자란 상태로 넘어온 도시가 바로 실패하지 않도록 주는 재배치 유예 기간(일).
export const WORKFORCE_RULES = SETTINGS.WORKFORCE_RULES;

export const WORKFORCE_LEVELS = SETTINGS.WORKFORCE_LEVELS;

// GENERATION_IDLE_EMISSION_RATIO: 발전 시설은 급전량이 0이어도 대기 운전만큼의 탄소와 냉각수를 계속 쓴다.
// 0.25는 화력을 켜 둔 채 저탄소로 수요를 덮기만 해도 탄소 기준을 맞추게 해 게임을 너무 쉽게 만들었다.
// 켜 둔 화력은 절반은 태운다 — 탄소를 줄이려면 실제로 철거하거나 줄여야 한다.
export const ECONOMY_RULES = SETTINGS.ECONOMY_RULES;

// 바람을 깎는 재난에서 풍력이 유지하는 출력 비율. 연구 전이 기준값이고 wind2가 이를 끌어올린다.
export const RESEARCH_TUNING = SETTINGS.RESEARCH_TUNING;

export const SAVE_MESSAGES = Object.freeze({
  AUTOSAVE_FAILED_LOG: '자동저장 실패',
  STORAGE_BLOCKED_TITLE: '자동저장을 할 수 없습니다',
  STORAGE_BLOCKED_TEXT: '브라우저 저장 공간이 막혀 있어 새로고침하면 도시가 사라집니다.',
});

// 카메라 수치는 settings.json VISUAL.CITY_CAMERA에 있다. MAX_POLAR_ANGLE만 Math.PI 파생값이라 여기서 계산한다.
export const CITY_CAMERA = Object.freeze({
  ...SETTINGS.VISUAL.CITY_CAMERA,
  MAX_POLAR_ANGLE: Math.PI / 2.08,
});

export const CAMERA_UI = Object.freeze({
  RECENTER_GLYPH: '⌖',
  RECENTER_LABEL: '시점 초기화',
});

export const CITY_MOTION = SETTINGS.VISUAL.CITY_MOTION;

// MAX_WAIT_MS: 에셋 상태 이벤트가 끝내 오지 않아도(3D 씬 자체가 못 뜨는 기기) 게임을 막지 않는다.
// 이 값 + DONE_DELAY_MS는 테스트 fixture의 `#loadingScreen.done` 대기(5초)보다 짧아야 한다.
export const LOADING_SCREEN = SETTINGS.VISUAL.LOADING_SCREEN;

// 3D 씬 위에 투영되는 DOM 오버레이(공사 진행 배지, 건설 확정 O/X 위젯) 규칙.
export const CITY_WORLD_OVERLAY = SETTINGS.VISUAL.CITY_WORLD_OVERLAY;

export const CITY_AMBIENT = Object.freeze({
  ...SETTINGS.VISUAL.CITY_AMBIENT,
  COLORS: Object.freeze({
    person: 0x8be9fd,
    car: 0xffd166,
    bird: 0xf1fbff,
  }),
});

export const GREEN_VISUAL_LAYOUTS = SETTINGS.VISUAL.GREEN_VISUAL_LAYOUTS;

export const CITY_AMBIENT_MOTION = Object.freeze({
  ...SETTINGS.VISUAL.CITY_AMBIENT_MOTION,
  MAX_STATUS_LIGHTS: SETTINGS.BOARD.EXPANDED_CELLS * 2,
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

export const UI_FEEDBACK = SETTINGS.VISUAL.UI_FEEDBACK;

// 보드를 눌렀을 때의 안내 문구. 잔소리는 세션당 한 번만 나온다.
export const BOARD_TAP_COPY = Object.freeze({
  BUILD_MENU: Object.freeze({
    title: '건설 메뉴를 먼저 여세요',
    text: '건설 버튼을 누르고 시설을 고른 뒤 빈 대지를 누르면 지을 수 있습니다.',
  }),
  PICK_FACILITY: Object.freeze({
    title: '시설을 먼저 고르세요',
    text: '건설 패널에서 시설 카드를 누르면 빈 대지에 배치할 수 있습니다.',
  }),
  // 돈·허가가 아니라 대지 규칙 자체가 막는 칸을 눌렀을 때(조력의 해안 칸 등).
  BLOCKED_SITE_TITLE: '이 칸에는 지을 수 없습니다',
  placementHint: (facilityName) => ({
    kicker: 'PLACEMENT',
    title: `빈 칸을 눌러 ${facilityName} 배치`,
    text: '건설 버튼을 다시 누르면 다른 시설을 고를 수 있습니다.',
  }),
});

// 패널 레이아웃(CSS px·localStorage 키)은 화면 규격이라 JSON으로 옮기지 않는다.
// 모바일 브레이크포인트 폭만 settings.json VISUAL.MOBILE_MAX_WIDTH_PX에서 읽어 미디어쿼리 문자열을 만든다.
export const QUEST_PANEL_LAYOUT = Object.freeze({
  STORAGE_KEY: 'ai-city-quest-panel-layout-v2',
  MOBILE_QUERY: `(max-width: ${SETTINGS.VISUAL.MOBILE_MAX_WIDTH_PX}px)`,
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

export const CITY_ASSETS = SETTINGS.VISUAL.CITY_ASSETS;

export const CITY_ASSET_FOOTPRINT = SETTINGS.VISUAL.CITY_ASSET_FOOTPRINT;

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

// steps는 한 바퀴를 몇 단계로 나누는가(육각형이라 6 = 60°). step은 그 Math.PI 파생값이라 여기서 계산한다.
export const CITY_BUILDING_ORIENTATION = Object.freeze({
  steps: SETTINGS.VISUAL.CITY_BUILDING_ORIENTATION.steps,
  step: (Math.PI * 2) / SETTINGS.VISUAL.CITY_BUILDING_ORIENTATION.steps,
  offsets: SETTINGS.VISUAL.CITY_BUILDING_ORIENTATION.offsets,
});

export function facilityColorFor(type, level = 1) {
  const palette = FACILITY_LEVEL_COLORS[type] || FACILITY_LEVEL_COLORS.residential;
  return palette[level] || palette[1];
}

// GLB를 못 불러올 때의 폴백 도형 표. 회전에 Math.PI 파생값이 섞여 있어 JSON으로 옮기지 않는다.
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

// settings.json의 색은 "#rrggbb" 문자열이다. Three.js에는 0x 정수로 넘겨야 하므로 여기서 한 번만 바꾼다.
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function settingsColor(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) {
    throw new Error(`settings.json 색상은 "#rrggbb" 형식이어야 합니다: ${String(value)}`);
  }
  return Number.parseInt(value.slice(1), 16);
}

// 묶음 안의 "#rrggbb" 문자열을 전부 0x 정수로 바꾼 동결 사본을 만든다(숫자·불리언·그 밖의 문자열은 그대로).
function withNumericColors(node) {
  if (Array.isArray(node)) return Object.freeze(node.map(withNumericColors));
  if (node !== null && typeof node === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(node).map(([key, value]) => [key, withNumericColors(value)])));
  }
  return typeof node === 'string' && HEX_COLOR_PATTERN.test(node) ? settingsColor(node) : node;
}

// 연출 값 전체. settings.json VISUAL을 그대로 비추되, 위에서 Math.PI 파생값·색을 덧붙여 완성한 export
// (CITY_CAMERA 등)는 그 완성본을 다시 가리키고, 코드에서 옮겨 온 묶음 가운데 Three.js 색을 담은
// SCENE(3D 보드 씬: 타일·마커 색표, 머티리얼, 지오메트리 치수, 높이, 공사 현장 연출, 조명)·
// ISLAND(섬 환경: 물 반지름, 장식 배치 인덱스, 폴백 지형·색, 바다 평면, 테마별 바다색)·
// ASSET(GLB 팔레트 검정 보정)은 "#rrggbb"를 0x 정수로 바꾼다.
// MOBILE_MAX_WIDTH_PX(모바일 폭)·TOAST·MODAL·REPORT_RANK_ANIMATION(anime.js 연출)·FALLBACK_PRIMITIVES(폴백 도형 해상도)는
// 숫자·이징 이름 그대로이고, CHART_STYLE은 Chart.js에 그대로 넘기는 CSS 색 문자열(알파 포함)이라 바꾸지 않는다.
export const VISUAL = Object.freeze({
  ...SETTINGS.VISUAL,
  WORLD_DAY_LIGHTING,
  CITY_CAMERA,
  CITY_AMBIENT,
  CITY_AMBIENT_MOTION,
  CITY_BUILDING_ORIENTATION,
  SCENE: withNumericColors(SETTINGS.VISUAL.SCENE),
  ISLAND: withNumericColors(SETTINGS.VISUAL.ISLAND),
  ASSET: withNumericColors(SETTINGS.VISUAL.ASSET),
});

// 레벨(1~3)별 배율. 인덱스 0은 미사용. output은 dev/supply, impact는 양수 carbon/water,
// negative는 음수 carbon/water(감소 효과 강화)에 곱한다.
export const LEVEL_MULTIPLIERS = SETTINGS.LEVEL_MULTIPLIERS;

// 소비 시설의 레벨별 전력 수요(E/일). 일반 배율(LEVEL_MULTIPLIERS.demand)로는 주거지를
// Lv.2로 올려 인구가 6→10으로 늘어도 수요는 2.0→2.48에 그쳐, 강화가 전력 계획을 전혀
// 흔들지 않았다. 소비 시설만 종류마다 표를 직접 갖고, 표가 있으면 배율 대신 이 값을 쓴다.
// 인덱스 0은 미사용(Lv.1~3). Lv.1 값은 FACILITIES[type].demand와 반드시 같아야 한다 —
// 건설 카드가 Lv.1 기준으로 수요를 보여 주기 때문이다.
// 발전 시설(화력·핵·태양광·풍력·조력)과 녹지는 표가 없고 수요 0을 유지한다.
export const FACILITY_DEMAND_BY_LEVEL = SETTINGS.FACILITY_DEMAND_BY_LEVEL;

// 레벨별 물 사용(단위/일). 수요 표와 같은 규칙으로, 표가 있으면 impact 배율 대신 이 값을 쓴다.
export const FACILITY_WATER_BY_LEVEL = SETTINGS.FACILITY_WATER_BY_LEVEL;

// 도시의 하루 소비 전력은 날마다 조금씩 흔들린다. 판의 씨앗에서 결정론적으로 뽑으므로
// 날씨. 수요 변동처럼 판의 씨앗과 게임일만으로 정해지므로 저장하지 않고, 예보와 정산이 같은 값을 본다.
// 계산식은 core/Weather.js, 상태(이벤트·최종시험 단계) 반영은 systems/WeatherSystem.js에 있다.
//  - 조력: 날씨와 무관.
//  - 태양광: 맑음 100~120%, 흐림 10~90%(그날 한 번 뽑음), 눈·비 0%.
//  - 풍력: 날씨 종류와 무관하고 풍속(m/s)만 따른다.
// 날씨 문구 조각. 칩 툴팁이 같은 조각을 한 줄로 잇기 때문에 WEATHER_RULES 밖에서 한 번만 정의한다.
const weatherSolarLabel = (weather) => `태양광 ${Math.round(weather.solarFactor * 100)}%`;
const weatherWindLabel = (weather) => `풍속 ${weather.windSpeedMs} m/s · 풍력 ${Math.round(weather.windFactor * 100)}%`;
const weatherForcedLabel = (weather) => (weather.forcedBy ? `${weather.forcedBy} 영향` : '');
const weatherTomorrowLabel = (weather) => `내일 ${weather.label} · ${weather.windSpeedMs} m/s`;

// 규칙 수치(HOLD_DAYS·전이 확률·태양광 범위·풍력 곡선·이벤트별 강제 날씨)는 settings.json WEATHER_RULES에 있다.
// 여기에는 종류별 표시(라벨·아이콘)와 화면 문구·문구 함수만 남긴다.
export const WEATHER_RULES = Object.freeze({
  ...SETTINGS.WEATHER_RULES,
  DISPLAY: Object.freeze({
    clear: Object.freeze({ label: '맑음', icon: 'sun' }),
    cloudy: Object.freeze({ label: '흐림', icon: 'cloud' }),
    rain: Object.freeze({ label: '비', icon: 'cloud-rain' }),
    snow: Object.freeze({ label: '눈', icon: 'snowflake' }),
  }),
  // 화면 문구. 상단 칩·툴팁·전력 원인 창·날씨 창이 함께 쓴다.
  CHIP_LABEL: (weather) => `${weather.label} · ${weather.windSpeedMs} m/s`,
  SOLAR_LABEL: weatherSolarLabel,
  WIND_LABEL: weatherWindLabel,
  SOLAR_CAUSE_LABEL: (weather) => `오늘 날씨 ${weather.label} · ${weatherSolarLabel(weather)}`,
  WIND_CAUSE_LABEL: weatherWindLabel,
  FORCED_LABEL: weatherForcedLabel,
  TOMORROW_LABEL: weatherTomorrowLabel,
  TITLE: '오늘의 날씨',
  // 상단 칩의 툴팁·접근성 라벨 — 오늘(종류·태양광·풍속·풍력), 강제 출처, 내일 예보를 ' / '로 한 줄에 잇는다.
  CHIP_TOOLTIP: (weather, tomorrow) => [
    `오늘 ${weather.label} · ${weatherSolarLabel(weather)} · ${weatherWindLabel(weather)}`,
    weatherForcedLabel(weather),
    tomorrow ? weatherTomorrowLabel(tomorrow) : '',
  ].filter(Boolean).join(' / '),
  // 날씨 창(칩 클릭). 전력 원인 창과 같은 틀을 쓰므로 머리말·오늘 줄·닫기 라벨을 따로 둔다.
  EYEBROW: 'TODAY WEATHER',
  TODAY_LABEL: '오늘',
  CLOSE_LABEL: '날씨 창 닫기',
  TODAY_KIND_LABEL: (weather) => (weather.forcedBy ? `${weather.label} · ${weatherForcedLabel(weather)}` : weather.label),
  TIDAL_NOTE: '조력은 날씨와 무관합니다 — 해안 칸의 조차만 따릅니다.',
  ACTION_TITLE: '대비',
  ACTION: (holdDays) => `날씨는 ${holdDays}일마다 바뀝니다. 흐림·눈·비가 이어지면 태양광이 줄고 풍력은 풍속만 따르니, 배터리 예비량과 다른 발전으로 대비하세요.`,
});

// 같은 도시를 다시 돌리면 같은 날에 같은 값이 나오고, 예보와 실제 정산이 어긋나지 않는다.
// 계산식은 core/Environment.js의 demandVariationFactor에 있다. 진폭·주기는 settings.json DEMAND_VARIATION.
export const DEMAND_VARIATION = Object.freeze({
  ...SETTINGS.DEMAND_VARIATION,
  // 전력 원인 창에 한 줄로 붙는 문구. 0%도 "오늘은 평년 수준"이라는 정보라 그대로 보여 준다.
  CAUSE_LABEL: (factor) => {
    const percent = Math.round(((Number(factor) || 1) - 1) * 100);
    return `오늘 수요 변동 ${percent > 0 ? '+' : percent < 0 ? '' : '±'}${percent}%`;
  },
});

// 시설 문구(이름·아이콘·설명). 비용·수요·공급·탄소·물·해금 단계·최대 레벨·배치 규칙은 settings.json FACILITIES.
const FACILITY_COPY = Object.freeze({
  residential: { name: '주거지', icon: '🏢', desc: '인구와 기본 세금을 공급합니다. 전력·고용이 좋을수록 세금이 늘고 녹지 인접 시 추가 보너스를 받습니다.' },
  factory: { name: '공장', icon: '🏭', desc: '전력과 인력이 충족될 때 수입을 만듭니다. 주거지 인접 시 오염 비용이 생깁니다.' },
  data: { name: '데이터센터', icon: '🖥️', desc: '수입과 연구를 제공합니다. 순환냉각 인접 시 실제 물 사용량이 줄어듭니다.' },
  thermal: { name: '화력발전', icon: '🔥', desc: '안정적인 전력을 만들지만 고정 운영비와 큰 탄소 부담이 있습니다.' },
  nuclear: { name: '핵발전', icon: '⚛️', desc: '큰 저탄소 전력을 만들지만 운영비와 물을 사용합니다. 순환냉각으로 물을 줄일 수 있습니다.' },
  solar: { name: '태양광', icon: '☀️', desc: '게임 시각에 따라 출력이 달라지는 저탄소 발전입니다. 저장장치로 변동을 보완할 수 있습니다.' },
  wind: { name: '풍력', icon: '🌬️', desc: '풍황에 따라 출력이 달라지는 저탄소 발전입니다. 저장장치로 변동을 보완할 수 있습니다.' },
  battery: { name: '에너지저장', icon: '🔋', desc: '보조전력을 사용해 잉여 전력을 저장하고, 인접 소비지의 송전 손실을 줄입니다.' },
  cooling: { name: '순환냉각', icon: '💧', desc: '자체 물 감축 시설이 아닙니다. 전력이 공급되면 인접 데이터센터·핵발전의 물 사용을 줄입니다.' },
  green: { name: '녹지', icon: '🌳', desc: '도시 탄소를 줄이고 인접 주거지의 세금과 폭염 대응력을 높입니다. 연구로 수관과 생태축을 강화할 수 있습니다.' },
  tidal: { name: '조력발전', icon: '🌊', desc: '바다와 맞닿은 해안 칸에서 일정한 저탄소 전력을 공급하며, 그 칸의 조수간만의 차가 클수록 출력이 커집니다.' },
});

// 시설 표의 행 순서는 settings.json FACILITIES의 순서를 따른다(건설 독 카드 기본 순서).
// unlockStage는 JSON에 단계 이름("EXECUTION"/"REDESIGN")으로 적혀 있고 여기서 STAGES 번호로 바꾼다.
export const FACILITIES = Object.freeze(Object.fromEntries(Object.entries(SETTINGS.FACILITIES).map(([type, row]) => {
  const copy = FACILITY_COPY[type];
  if (!copy) throw new Error(`settings.json FACILITIES.${type}: Constants.js FACILITY_COPY에 문구가 없습니다`);
  const { unlockStage, ...numbers } = row;
  if (!(unlockStage in STAGES)) throw new Error(`settings.json FACILITIES.${type}.unlockStage: 알 수 없는 단계 이름 ${unlockStage}`);
  return [type, Object.freeze({ name: copy.name, icon: copy.icon, ...numbers, unlockStage: STAGES[unlockStage], desc: copy.desc })];
})));

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

// 성적표 등급의 문구(아이콘·칭호). 등급 하한 점수(min)는 settings.json REPORT_TIERS와 같은 순서로 짝을 맞춘다.
const REPORT_TIER_COPY = [
  { icon: '🏆', title: '그린시티 마스터' },
  { icon: '🥇', title: '저탄소 도시 설계자' },
  { icon: '🧭', title: '기후 적응 운영자' },
];
if (SETTINGS.REPORT_TIERS.length !== REPORT_TIER_COPY.length) {
  throw new Error(`settings.json REPORT_TIERS: 등급 수(${SETTINGS.REPORT_TIERS.length})가 Constants.js 문구 수(${REPORT_TIER_COPY.length})와 다릅니다`);
}
export const REPORT_TIERS = SETTINGS.REPORT_TIERS.map((tier, index) => ({ min: tier.min, ...REPORT_TIER_COPY[index] }));

export const REPORT_RULES = SETTINGS.REPORT_RULES;

// ---- 2단계(B1): systems/·ui/ 코드에 박혀 있던 게임 규칙 값. settings.json의 같은 이름 섹션에서 읽는다. ----

// 시설 종류 묶음 — 발전원·저탄소·재생·변동 재생(허브 필요)·필수시설 기본값·배터리 허브 소비지·기술 레벨 필요 시설·
// 가동률 비례 배출 시설·오염 시설. 여러 시스템이 같은 목록을 따로 적던 것을 하나로 모았다.
export const FACILITY_GROUPS = SETTINGS.FACILITY_GROUPS;

// 건설 독 미리보기용 인접 관계표(good/bad). BoardSystem.placementPreview가 읽는다.
export const PARTNER_RULES = SETTINGS.PARTNER_RULES;

// 시설 창의 공간 시너지/갈등 판정표(배열 순서대로 평가). self: 이 시설, neighbors: 인접 시설,
// mode: positive(있으면 장점) / warning(있으면 갈등) / either(있으면 장점, 없으면 경고).
// 저장 허브 두 규칙(renewable_hub·battery_hub)은 "소비지와 맞닿은 배터리"라는 두 칸 건너 판정이라
// BoardSystem 코드에 남아 있고, 문구만 SPATIAL_LABELS에 있다.
export const SPATIAL_RULES = SETTINGS.SPATIAL_RULES;
export const SPATIAL_LABELS = Object.freeze({
  factory_power: '발전소 인접',
  data_cooling: '순환냉각 인접',
  residential_green: '녹지 생활권',
  renewable_hub: '소비지 저장 허브 연결',
  battery_hub: '소비지 저장 허브',
  nuclear_cooling: '냉각 보조',
  cooling_demand: '냉각 수요 연결',
  heavy_residential: '주거지 오염 갈등',
  nuclear_residential: '원전 인접 불안',
  data_residential: '소음·발열 민원',
  heavy_green: '녹지 훼손 갈등',
  residential_polluters: '오염·불안 시설 인접',
  green_polluters: '오염 시설 인접',
});
SPATIAL_RULES.forEach((rule) => {
  if (!SPATIAL_LABELS[rule.id]) throw new Error(`settings.json SPATIAL_RULES.${rule.id}: Constants.js SPATIAL_LABELS에 문구가 없습니다`);
});

// 녹지 효과: 군집 최소 칸 수, 인접 녹지 레벨별 주거 수입 배수(인덱스 0 미사용), 거리 2 녹지 보너스가 열리는 레벨과 수입 배수,
// 녹지 인접 공장의 오염 건강비 배수.
export const GREEN_RULES = SETTINGS.GREEN_RULES;

// 폭염 수요: 기본 배수(ClimateSystem·CityModifierSystem 공용), 영향 시설, 녹지 인접 완화 배수(레벨별·거리 2 Lv.3).
export const HEATWAVE_RULES = SETTINGS.HEATWAVE_RULES;

// 태양광 시간대 배율 경계(밤 0 · 새벽/저녁 DUSK_MULTIPLIER · 낮 1)와 일평균 유효 시간(11/24).
export const SOLAR_RULES = SETTINGS.SOLAR_RULES;

// 기후 퀘스트 공통: 필수시설 공급률 목표(%).
export const CLIMATE_QUEST_RULES = SETTINGS.CLIMATE_QUEST_RULES;

// 도시 이벤트: 가뭄 추가 삽입 조건(완료 이벤트 수), 정전일 판정 %, 사후 진단 우선순위 가중치.
export const EVENT_RULES = SETTINGS.EVENT_RULES;

// 건설 예보: 전력 부족 판정 부동소수 여유(E), 위험도 정렬 가중치.
export const FORECAST_RULES = SETTINGS.FORECAST_RULES;

// 연구 완료 효과 배수(solar2·wind2·battery2)와 smartGrid 송전 손실/칸. 연구 전 손실은 POWER_RULES.LOSS_PER_EXTRA_TILE.
export const RESEARCH_EFFECTS = SETTINGS.RESEARCH_EFFECTS;

// 최종 개념 퀴즈 구성(QUIZ_BANK 문항 id)과 통과선. 문항 수는 RESEARCH_RULES.QUIZ_QUESTION_COUNT.
export const QUIZ_RULES = SETTINGS.QUIZ_RULES;
QUIZ_RULES.FINAL.QUESTION_IDS.forEach((id) => {
  if (!QUIZ_BANK.some((question) => question.id === id)) throw new Error(`settings.json QUIZ_RULES.FINAL.QUESTION_IDS: QUIZ_BANK에 없는 문항 ${id}`);
});

// 상단 HUD 배터리 경고/위험 임계(E).
export const HUD_RULES = SETTINGS.HUD_RULES;

// 레이더 차트 축 환산 계수(탄소·물·시너지 링크 → 0~100).
export const CHART_RULES = SETTINGS.CHART_RULES;

// 모달 우선순위 열거. CRITICAL: 도시가 멈춘 상태(게임오버·운영중단·최종시험 결과) /
// IMPORTANT: 진행을 막는 선택(확장 방향 등) / NORMAL: 플레이어가 직접 연 창.
export const MODAL_PRIORITY = SETTINGS.MODAL_PRIORITY;
