// 게임 설정의 단일 출처. 프로젝트 루트 settings.json을 빌드 시 읽어 깊이 동결한 SETTINGS로 내보낸다.
// 규칙 수치·표(경제·전력·기후·퀘스트·연구…)와 연출 수치(VISUAL)는 전부 여기서 나오고, Constants.js와
// core/*Definitions.js는 이 값을 같은 이름으로 다시 내보낼 뿐이다. 값을 바꾸려면 settings.json을 고친다
// (docs/settings.md). 문구·아이콘·색상·CSS·함수처럼 JSON에 둘 수 없는 것만 JS에 남아 있다.
import settings from '../../settings.json' with { type: 'json' };

// Vite의 BASE_URL을 한 곳에서 적용한다. Lab 빌드는 BASE_URL이 "./"이므로
// 정적 파일이 /lab-content/{slug}/ 밖의 블로그 루트로 빠져나가지 않는다.
export function resolvePublicPath(filePath, baseUrl = import.meta.env?.BASE_URL || '/') {
  const base = String(baseUrl || './');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = String(filePath).replace(/^(?:\.\/|\/)+/, '');
  return `${normalizedBase}${normalizedPath}`;
}

// settings.json에 반드시 있어야 하는 최상위 섹션. Constants.js·정의 파일이 읽는 키와 1:1이다.
// 섹션을 더하거나 빼면 이 목록과 tests/e2e/unit/settings.spec.js도 함께 고친다.
export const REQUIRED_SECTIONS = Object.freeze([
  'STAGES',
  'GAME',
  'BOARD',
  'DIRECTION_RULES',
  'TIDAL_RULES',
  'BOARD_KEYBOARD',
  'CALENDAR',
  'TIME',
  'SCORING',
  'UPGRADE_COST_RATIOS',
  'DEMOLITION_REFUND_RATIO',
  'CONSTRUCTION',
  'CAMPAIGN_PACING',
  'EVENT_FORECAST_DAYS',
  'EVENT_GAP_DAYS',
  'AUDIO',
  'QUEST_REQUIREMENTS',
  'FACILITY_BUILD_ORDER',
  'FACILITY_LIMITS_BY_QUEST',
  'RESEARCH_RULES',
  'DAILY_CARBON_TARGETS',
  'CARBON_CRISIS',
  'CITY_FAILURE_RULES',
  'EMERGENCY_SUPPORT',
  'POWER_RULES',
  'GRID_RESERVE_RULES',
  'WATER_RULES',
  'STRESS_TEST_RULES',
  'STORAGE_LEVELS',
  'COOLING_RULES',
  'FACILITY_ECONOMY',
  'WORKFORCE_RULES',
  'WORKFORCE_LEVELS',
  'ECONOMY_RULES',
  'RESEARCH_TUNING',
  'LEVEL_MULTIPLIERS',
  'FACILITY_DEMAND_BY_LEVEL',
  'FACILITY_WATER_BY_LEVEL',
  'WEATHER_RULES',
  'DEMAND_VARIATION',
  'FACILITIES',
  'REPORT_TIERS',
  'REPORT_RULES',
  'VISUAL',
  'CLIMATE_EVENTS',
  'FINAL_CLIMATE_PHASES',
  'QUESTS',
  'RESEARCH',
  'ZONES',
  'CAMPAIGN',
  'OPERATION_PROFILES',
  'EVENT_DECK',
  // 2단계(B1): systems/ui 코드에 박혀 있던 게임 규칙 값
  'FACILITY_GROUPS',
  'PARTNER_RULES',
  'SPATIAL_RULES',
  'GREEN_RULES',
  'HEATWAVE_RULES',
  'SOLAR_RULES',
  'CLIMATE_QUEST_RULES',
  'EVENT_RULES',
  'FORECAST_RULES',
  'RESEARCH_EFFECTS',
  'QUIZ_RULES',
  'HUD_RULES',
  'CHART_RULES',
  'MODAL_PRIORITY',
]);

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

export const SETTINGS = deepFreeze(settings);

// 표(섹션)에서 id로 한 행을 읽는다. 'ZONES.EXPANSION_SIDES'처럼 점으로 하위 표를 가리킬 수 있다.
// 행이 없으면 어느 섹션의 무엇이 빠졌는지 바로 알 수 있게 부팅 시점에 즉시 실패한다.
export function settingsRow(sectionPath, id) {
  const table = sectionPath.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), SETTINGS);
  if (!table || typeof table !== 'object') throw new Error(`settings.json: ${sectionPath} 섹션이 없습니다`);
  const row = table[id];
  if (!row || typeof row !== 'object') throw new Error(`settings.json: ${sectionPath}.${id} 항목이 없습니다`);
  return row;
}

// "12", "0.5", "1e3"처럼 숫자를 따옴표로 감싼 문자열. 규칙 수치에 이런 값이 들어오면 비교·산술이 조용히 틀어진다.
const NUMERIC_STRING = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// 리프 값의 형식을 검사한다. 허용: 유한한 숫자·문자열·불리언·배열·객체. 금지: null·undefined·NaN·무한대·함수.
function walkLeaves(value, path, problems) {
  if (value === null) {
    problems.push(`${path}: null은 허용되지 않습니다 (필드를 지우거나 값을 적으세요)`);
  } else if (typeof value === 'undefined') {
    problems.push(`${path}: 값이 비어 있습니다`);
  } else if (typeof value === 'function') {
    problems.push(`${path}: 함수는 settings.json에 둘 수 없습니다`);
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) problems.push(`${path}: 유한한 숫자여야 합니다`);
  } else if (typeof value === 'string') {
    if (NUMERIC_STRING.test(value)) problems.push(`${path}: 숫자 "${value}"가 문자열로 적혀 있습니다 — 따옴표를 빼세요`);
  } else if (typeof value === 'boolean') {
    // 허용
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => walkLeaves(item, `${path}[${index}]`, problems));
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) walkLeaves(child, `${path}.${key}`, problems);
  } else {
    problems.push(`${path}: 지원하지 않는 값 형식(${typeof value})`);
  }
}

// 기준 설정(reference)에서 숫자였던 자리에 다른 형식이 들어오지 않았는지 같은 경로끼리 대조한다.
// 표의 선택 필드(퀘스트 목표 등)는 빠져 있어도 되므로 "있는데 형식이 다른" 경우만 잡는다.
function compareNumericShape(candidate, reference, path, problems) {
  if (typeof reference === 'number') {
    if (typeof candidate !== 'number') problems.push(`${path}: 숫자여야 하는데 ${typeof candidate}입니다`);
    return;
  }
  if (Array.isArray(reference)) {
    if (!Array.isArray(candidate)) {
      problems.push(`${path}: 배열이어야 합니다`);
      return;
    }
    reference.forEach((item, index) => {
      if (index < candidate.length) compareNumericShape(candidate[index], item, `${path}[${index}]`, problems);
    });
    return;
  }
  if (isPlainObject(reference)) {
    if (!isPlainObject(candidate)) {
      problems.push(`${path}: 객체여야 합니다`);
      return;
    }
    for (const [key, child] of Object.entries(reference)) {
      if (Object.hasOwn(candidate, key)) compareNumericShape(candidate[key], child, path ? `${path}.${key}` : key, problems);
    }
  }
}

// settings.json 후보를 검사해 문제 목록을 돌려준다(빈 배열이면 이상 없음). 부팅 때는 부르지 않고 테스트가 부른다.
// reference를 주면(보통 SETTINGS) 숫자 필드에 문자열이 들어온 자리까지 경로별로 대조한다.
export function validateSettings(candidate, reference = null) {
  if (!isPlainObject(candidate)) return ['최상위 값이 객체가 아닙니다'];
  const problems = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!Object.hasOwn(candidate, section)) problems.push(`필수 섹션 ${section}이(가) 없습니다`);
  }
  for (const key of Object.keys(candidate)) {
    if (!REQUIRED_SECTIONS.includes(key)) problems.push(`알 수 없는 섹션 ${key} (코드가 읽지 않습니다)`);
  }
  for (const [key, value] of Object.entries(candidate)) walkLeaves(value, key, problems);
  if (reference) compareNumericShape(candidate, reference, '', problems);
  return problems;
}
