import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { REQUIRED_SECTIONS, SETTINGS, settingsRow, validateSettings } from '../../../src/core/Settings.js';
import {
  BOARD,
  BOARD_KEYBOARD,
  BOARD_TAP_COPY,
  CITY_AMBIENT_MOTION,
  CITY_CAMERA,
  DEMAND_VARIATION,
  DIRECTION_COPY,
  ECONOMY_RULES,
  FACILITIES,
  REPORT_TIERS,
  STAGES,
  STRESS_TEST_RULES,
  TIDAL_RULES,
  WEATHER_RULES,
  WORLD_DAY_LIGHTING,
} from '../../../src/core/Constants.js';
import {
  CLIMATE_EVENT_DEFINITIONS,
  CLIMATE_QUESTS,
  FINAL_CLIMATE_PHASES,
} from '../../../src/core/ClimateCampaignDefinitions.js';
import { QUESTS } from '../../../src/core/QuestDefinitions.js';
import { RESEARCH } from '../../../src/core/ResearchDefinitions.js';
import { BATTERY_POLICIES } from '../../../src/core/OperationDefinitions.js';
import { EXPANSION_SIDES, EXPANSION_UPKEEP } from '../../../src/core/ZoneDefinitions.js';
import { CAMPAIGN_QUEST_INDEXES } from '../../../src/core/CampaignProgression.js';
import { OPENING_EVENT_DECK } from '../../../src/core/EventDefinitions.js';

// 게임 규칙 수치는 프로젝트 루트 settings.json 한 파일에 모이고, Constants.js와 정의 파일은 그 값을
// 같은 이름으로 다시 내보낸다(docs/settings.md). 이 테스트는 그 계약을 고정한다.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const settingsPath = path.join(projectRoot, 'settings.json');
const coreDir = path.join(projectRoot, 'src/core');

test('(a) validateSettings(SETTINGS)는 문제를 하나도 돌려주지 않는다', () => {
  expect(validateSettings(SETTINGS)).toEqual([]);
  expect(validateSettings(SETTINGS, SETTINGS)).toEqual([]);
});

test('디스크의 settings.json은 게임이 import한 SETTINGS와 같고 필수 섹션 목록과 1:1이다', async () => {
  const raw = JSON.parse(await readFile(settingsPath, 'utf8'));
  expect(raw).toEqual(SETTINGS);
  expect(Object.keys(raw).sort()).toEqual([...REQUIRED_SECTIONS].sort());
  expect(REQUIRED_SECTIONS.length).toBe(66);
});

test('(b) settings.json의 최상위 키는 모두 src/core 어딘가에서 읽힌다 — 안 쓰는 섹션이 남지 않는다', async () => {
  const files = (await readdir(coreDir)).filter((name) => name.endsWith('.js') && name !== 'Settings.js');
  const sources = await Promise.all(files.map((name) => readFile(path.join(coreDir, name), 'utf8')));
  const combined = sources.join('\n');
  expect(files.length).toBeGreaterThan(10);

  // 직접 참조(SETTINGS.KEY) 또는 표 조회(settingsRow('KEY' / settingsRow('KEY.SUB') 둘 다 인정한다.
  const unused = Object.keys(SETTINGS).filter((key) => {
    const direct = new RegExp(`\\bSETTINGS\\.${key}\\b`).test(combined);
    const viaRow = new RegExp(`settingsRow\\(\\s*'${key}(?:\\.|')`).test(combined);
    return !direct && !viaRow;
  });
  expect(unused).toEqual([]);
});

test('(c) Constants의 데이터 export는 JSON 섹션과 같은 값이다', () => {
  expect(ECONOMY_RULES).toEqual(SETTINGS.ECONOMY_RULES);
  expect(ECONOMY_RULES).toMatchObject({
    STOP_POWER_RATIO: 0.25,
    POLLUTION_HEALTH_COST: 0.4,
    UPKEEP_LEVEL_MULTIPLIERS: [0, 1, 1.4, 1.8],
    GENERATION_IDLE_EMISSION_RATIO: 0.5,
  });
  expect(BOARD).toBe(SETTINGS.BOARD);
  expect(BOARD).toEqual({ INITIAL_RADIUS: 2, EXPANDED_RADIUS: 3, INITIAL_CELLS: 19, EXPANDED_CELLS: 37, HEX_SIZE: 0.56, MAX_CELLS: 37 });

  expect(FACILITIES.solar.supply).toBe(SETTINGS.FACILITIES.solar.supply);
  expect(FACILITIES.solar.supply).toBe(7);
  expect(Object.keys(FACILITIES)).toEqual(Object.keys(SETTINGS.FACILITIES));
  // unlockStage는 JSON에 단계 이름으로 적혀 있고 Constants가 STAGES 번호로 바꾼다. 문구는 JS가 붙인다.
  expect(SETTINGS.FACILITIES.tidal.unlockStage).toBe('REDESIGN');
  expect(FACILITIES.tidal).toEqual({
    name: '조력발전', icon: '🌊', cost: 7, dev: 3, demand: 0, supply: 10, carbon: 0, water: 0,
    maxLevel: 3, placement: 'coastal', unlockStage: STAGES.REDESIGN,
    desc: '바다와 맞닿은 해안 칸에서 일정한 저탄소 전력을 공급하며, 그 칸의 조수간만의 차가 클수록 출력이 커집니다.',
  });
  expect(FACILITIES.residential.unlockStage).toBe(STAGES.EXECUTION);
  expect(Object.hasOwn(FACILITIES.residential, 'placement')).toBe(false);

  // 데이터 + 함수 혼합 export는 JSON 부분을 그대로 품는다.
  expect(TIDAL_RULES).toMatchObject({ ...SETTINGS.TIDAL_RULES, COASTAL_RING: SETTINGS.BOARD.EXPANDED_RADIUS });
  expect(WEATHER_RULES).toMatchObject(SETTINGS.WEATHER_RULES);
  expect(DEMAND_VARIATION).toMatchObject(SETTINGS.DEMAND_VARIATION);
  expect(BOARD_KEYBOARD).toMatchObject(SETTINGS.BOARD_KEYBOARD);

  // 연출 수치는 VISUAL 하위에 있고, Math.PI 파생값·색상은 JS가 덧붙인다.
  expect(CITY_CAMERA).toMatchObject(SETTINGS.VISUAL.CITY_CAMERA);
  expect(CITY_CAMERA.MAX_POLAR_ANGLE).toBe(Math.PI / 2.08);
  expect(WORLD_DAY_LIGHTING).toMatchObject(SETTINGS.VISUAL.WORLD_DAY_LIGHTING);
  expect(WORLD_DAY_LIGHTING.SUN_COLOR).toBe(0xffffff);
  expect(CITY_AMBIENT_MOTION.MAX_STATUS_LIGHTS).toBe(SETTINGS.BOARD.EXPANDED_CELLS * 2);

  expect(REPORT_TIERS.map((tier) => tier.min)).toEqual(SETTINGS.REPORT_TIERS.map((tier) => tier.min));
  expect(REPORT_TIERS.map((tier) => [tier.min, tier.title])).toEqual([
    [85, '그린시티 마스터'], [70, '저탄소 도시 설계자'], [0, '기후 적응 운영자'],
  ]);
});

test('(c) 정의 파일의 수치는 JSON 표에서 id로 읽힌다', () => {
  expect(CLIMATE_EVENT_DEFINITIONS.heatwave.durationDays).toBe(SETTINGS.CLIMATE_EVENTS.heatwave.durationDays);
  expect(CLIMATE_EVENT_DEFINITIONS.heatwave.facilityModifiers).toEqual(SETTINGS.CLIMATE_EVENTS.heatwave.facilityModifiers);
  expect(CLIMATE_EVENT_DEFINITIONS.heatwave.facilityModifiers).toEqual({
    residential: { demand: 1.25 }, data: { water: 1.2 }, solar: { supply: 1.1 },
  });
  expect(CLIMATE_EVENT_DEFINITIONS.dryWildfire).toMatchObject({
    cityModifiers: { carbonFlat: 2 }, greenAbsorptionByLevel: [1, 0.5, 0.75, 1],
  });
  expect(CLIMATE_EVENT_DEFINITIONS.heatwave.greenAbsorptionByLevel).toBeNull();

  expect(FINAL_CLIMATE_PHASES.map((phase) => [phase.id, phase.durationDays]))
    .toEqual(FINAL_CLIMATE_PHASES.map((phase) => [phase.id, SETTINGS.FINAL_CLIMATE_PHASES[phase.id].durationDays]));

  expect(QUESTS[0].reward.credits).toBe(SETTINGS.QUESTS['first-citizens'].reward.credits);
  expect(QUESTS[0].reward).toEqual({
    credits: 4, unlockFacility: 'factory', unlockFacilities: ['factory', 'thermal'], unlockResearch: [],
    upgradePermitLevel: null, upgradePermitFacilities: [], stressTest: false,
  });
  expect(CLIMATE_QUESTS[12]).toMatchObject({
    targetDays: SETTINGS.QUESTS['monsoon-response'].targetDays,
    batteryTarget: 4,
    batteryReserveTarget: SETTINGS.QUESTS['monsoon-response'].batteryReserveTarget,
    carbonTarget: null,
  });
  expect(CLIMATE_QUESTS[18].entry).toEqual(SETTINGS.QUESTS['storm-surge'].entry);
  expect(CLIMATE_QUESTS[18].reward.stressTest).toBe(true);

  expect(RESEARCH.solar2).toMatchObject({
    durationDays: SETTINGS.RESEARCH.solar2.durationDays,
    cost: SETTINGS.RESEARCH.solar2.cost,
    prerequisites: { mode: 'all', items: ['facility:solar'] },
    outcome: { tech: ['solar', 2], effect: 'solar_efficiency' },
    realMinutesAt1x: 2,
    unlockAfterQuestId: null,
  });
  expect(RESEARCH.tidal1.unlockAfterQuestId).toBe(SETTINGS.RESEARCH.tidal1.unlockAfterQuestId);

  expect(BATTERY_POLICIES.reserve30).toEqual({ id: 'reserve30', label: '최소 30%', reserveRatio: 0.3, essentialOnlyBelowReserve: false });
  expect(EXPANSION_SIDES.east).toMatchObject(SETTINGS.ZONES.EXPANSION_SIDES.east);
  expect(EXPANSION_UPKEEP).toBe(SETTINGS.ZONES.EXPANSION_UPKEEP);
  expect(CAMPAIGN_QUEST_INDEXES).toBe(SETTINGS.CAMPAIGN.QUEST_INDEXES);
  expect(OPENING_EVENT_DECK).toBe(SETTINGS.EVENT_DECK.OPENING);
});

test('JSON 표의 id 목록은 코드가 정의한 id와 정확히 같다 — 오타·누락은 부팅에서 바로 실패한다', () => {
  expect(Object.keys(SETTINGS.CLIMATE_EVENTS).sort()).toEqual(Object.keys(CLIMATE_EVENT_DEFINITIONS).sort());
  expect(Object.keys(SETTINGS.FINAL_CLIMATE_PHASES).sort()).toEqual(FINAL_CLIMATE_PHASES.map((phase) => phase.id).sort());
  expect(Object.keys(SETTINGS.QUESTS).sort()).toEqual(QUESTS.map((quest) => quest.id).sort());
  expect(Object.keys(SETTINGS.RESEARCH).sort()).toEqual(Object.keys(RESEARCH).sort());
  expect(Object.keys(SETTINGS.OPERATION_PROFILES.BATTERY_POLICIES).sort()).toEqual(Object.keys(BATTERY_POLICIES).sort());
  expect(Object.keys(SETTINGS.ZONES.EXPANSION_SIDES).sort()).toEqual(Object.keys(EXPANSION_SIDES).sort());
  expect(() => settingsRow('QUESTS', 'no-such-quest')).toThrow('settings.json: QUESTS.no-such-quest 항목이 없습니다');
  expect(() => settingsRow('NO_SECTION', 'x')).toThrow('settings.json: NO_SECTION 섹션이 없습니다');
  expect(settingsRow('ZONES.EXPANSION_SIDES', 'west')).toBe(SETTINGS.ZONES.EXPANSION_SIDES.west);
});

test('최종시험 구간 일수의 옛 표(STRESS_TEST_RULES.PHASE_DAYS)는 FINAL_CLIMATE_PHASES와 같은 값을 유지한다', () => {
  const legacyKeyByPhase = {
    baseline: 'BASELINE', heatDome: 'HEAT_DOME', monsoonFront: 'MONSOON_FRONT', coastalSuperstorm: 'COASTAL_SUPERSTORM',
    winterDisaster: 'WINTER_DISASTER', stagnantAir: 'STAGNANT_AIR', dryEmergency: 'DRY_EMERGENCY', recovery: 'RECOVERY',
  };
  expect(FINAL_CLIMATE_PHASES.map((phase) => [phase.id, phase.durationDays]))
    .toEqual(FINAL_CLIMATE_PHASES.map((phase) => [phase.id, STRESS_TEST_RULES.PHASE_DAYS[legacyKeyByPhase[phase.id]]]));
});

test('(d) settings.json에는 함수·NaN·undefined·null이 없고 SETTINGS는 깊이 동결돼 있다', async () => {
  const raw = await readFile(settingsPath, 'utf8');
  expect(raw).not.toMatch(/\bNaN\b|\bundefined\b|\bnull\b|=>|\bfunction\b|\bInfinity\b/);

  const leafTypes = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect);
    else leafTypes.add(value === null ? 'null' : typeof value);
  };
  collect(JSON.parse(raw));
  expect([...leafTypes].sort()).toEqual(['boolean', 'number', 'string']);

  expect(Object.isFrozen(SETTINGS)).toBe(true);
  expect(Object.isFrozen(SETTINGS.FACILITIES.solar)).toBe(true);
  expect(Object.isFrozen(SETTINGS.VISUAL.GREEN_VISUAL_LAYOUTS[3][0])).toBe(true);
  expect(Object.isFrozen(SETTINGS.QUESTS['extreme-heat'].reward.unlockResearch)).toBe(true);
});

test('validateSettings는 빠진 섹션·모르는 섹션·따옴표 숫자·null·형식 불일치를 경로와 함께 잡는다', () => {
  const broken = structuredClone(SETTINGS);
  delete broken.ECONOMY_RULES;
  broken.TYPO_SECTION = { a: 1 };
  broken.FACILITIES.solar.cost = '5';
  broken.GAME.INITIAL_CREDITS = null;
  broken.BOARD.HEX_SIZE = 'big';
  broken.STORAGE_LEVELS[2].capacity = Number.NaN;

  expect(validateSettings(broken, SETTINGS).sort()).toEqual([
    'BOARD.HEX_SIZE: 숫자여야 하는데 string입니다',
    'FACILITIES.solar.cost: 숫자 "5"가 문자열로 적혀 있습니다 — 따옴표를 빼세요',
    'FACILITIES.solar.cost: 숫자여야 하는데 string입니다',
    'GAME.INITIAL_CREDITS: null은 허용되지 않습니다 (필드를 지우거나 값을 적으세요)',
    'GAME.INITIAL_CREDITS: 숫자여야 하는데 object입니다',
    'STORAGE_LEVELS.2.capacity: 유한한 숫자여야 합니다',
    '알 수 없는 섹션 TYPO_SECTION (코드가 읽지 않습니다)',
    '필수 섹션 ECONOMY_RULES이(가) 없습니다',
  ].sort());
  expect(validateSettings('not an object')).toEqual(['최상위 값이 객체가 아닙니다']);
});

test('(e) 문구 함수는 이관 전과 같은 문자열을 만든다', () => {
  expect(TIDAL_RULES.LABEL(5, 1)).toBe('조차 5m · 출력 100%');
  expect(TIDAL_RULES.LABEL(2, 0.5)).toBe('조차 2m · 출력 50%');
  expect(DIRECTION_COPY.INSPECTOR('북', 0.5, '남')).toBe('방향 북 · 출력 50% (최적 남)');
  expect(BOARD_KEYBOARD.cellAnnouncement(3, '빈 대지')).toBe('칸 3: 빈 대지');
  expect(BOARD_KEYBOARD.facilityDescription('주거지', 2)).toBe('주거지 Lv.2');
  expect(BOARD_TAP_COPY.placementHint('녹지')).toEqual({
    kicker: 'PLACEMENT', title: '빈 칸을 눌러 녹지 배치', text: '건설 버튼을 다시 누르면 다른 시설을 고를 수 있습니다.',
  });
  const weather = { label: '맑음', windSpeedMs: 7, solarFactor: 1.1, windFactor: 0.6, forcedBy: null };
  expect(WEATHER_RULES.CHIP_LABEL(weather)).toBe('맑음 · 7 m/s');
  expect(WEATHER_RULES.CHIP_TOOLTIP(weather, { label: '흐림', windSpeedMs: 9 }))
    .toBe('오늘 맑음 · 태양광 110% · 풍속 7 m/s · 풍력 60% / 내일 흐림 · 9 m/s');
  expect(WEATHER_RULES.ACTION(WEATHER_RULES.HOLD_DAYS))
    .toBe('날씨는 5일마다 바뀝니다. 흐림·눈·비가 이어지면 태양광이 줄고 풍력은 풍속만 따르니, 배터리 예비량과 다른 발전으로 대비하세요.');
  expect(DEMAND_VARIATION.CAUSE_LABEL(1.05)).toBe('오늘 수요 변동 +5%');
  expect(DEMAND_VARIATION.CAUSE_LABEL(0.95)).toBe('오늘 수요 변동 -5%');
  expect(DEMAND_VARIATION.CAUSE_LABEL(1)).toBe('오늘 수요 변동 ±0%');
  // 최종시험 퀘스트의 목표 문구는 JSON 구간 일수의 합에서 파생한다.
  expect(QUESTS[18].goal).toBe('41일 복합 기후 스트레스 테스트를 통과하세요.');
});
