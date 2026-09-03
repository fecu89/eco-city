import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { SETTINGS } from '../../../src/core/Settings.js';
import {
  AUDIO,
  CITY_AMBIENT,
  CITY_AMBIENT_MOTION,
  CITY_BUILDING_ORIENTATION,
  CITY_CAMERA,
  CITY_WORLD_OVERLAY,
  CONSTRUCTION,
  QUEST_PANEL_LAYOUT,
  UI_FEEDBACK,
  VISUAL,
  WORLD_DAY_LIGHTING,
  settingsColor,
} from '../../../src/core/Constants.js';
import { nextBirdDelay } from '../../../src/systems/AmbientBirdSystem.js';
import { snapHexRotation } from '../../../src/ui/CityEnvironment3D.js';

// 2단계(연출 값 이관)의 계약: CityScene3D·CityEnvironment3D·카메라·새 방문·Toast/Modal 애니메이션·
// 차트 스타일·효과음·에셋 보정의 하드코딩 값은 settings.json VISUAL(효과음은 AUDIO) 아래에 있고,
// Constants.js가 "#rrggbb" 색을 0x 정수로 바꿔 VISUAL로 다시 내보낸다(docs/settings.md).
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

test('settingsColor는 "#rrggbb"만 0x 정수로 바꾸고 다른 형식은 거부한다', () => {
  expect(settingsColor('#0d1f31')).toBe(0x0d1f31);
  expect(settingsColor('#FFFFFF')).toBe(0xffffff);
  expect(settingsColor(0x54e4ff)).toBe(0x54e4ff);
  expect(() => settingsColor('0x0d1f31')).toThrow('settings.json 색상은 "#rrggbb" 형식이어야 합니다: 0x0d1f31');
  expect(() => settingsColor('#fff')).toThrow();
  expect(() => settingsColor('rgba(0,0,0,1)')).toThrow();
});

test('VISUAL은 settings.json VISUAL을 비추고, 완성본 export를 가리키며, SCENE·ISLAND·ASSET의 색만 숫자다', () => {
  expect(Object.keys(VISUAL).sort()).toEqual(Object.keys(SETTINGS.VISUAL).sort());
  expect(VISUAL.CITY_CAMERA).toBe(CITY_CAMERA);
  expect(VISUAL.CITY_AMBIENT).toBe(CITY_AMBIENT);
  expect(VISUAL.CITY_AMBIENT_MOTION).toBe(CITY_AMBIENT_MOTION);
  expect(VISUAL.CITY_BUILDING_ORIENTATION).toBe(CITY_BUILDING_ORIENTATION);
  expect(VISUAL.WORLD_DAY_LIGHTING).toBe(WORLD_DAY_LIGHTING);
  expect(VISUAL.TOAST).toBe(SETTINGS.VISUAL.TOAST);
  expect(VISUAL.CHART_STYLE).toBe(SETTINGS.VISUAL.CHART_STYLE);

  // 색표: JSON은 "#rrggbb", export는 0x 정수.
  expect(SETTINGS.VISUAL.SCENE.TILE_COLORS.base).toBe('#0d1f31');
  expect(VISUAL.SCENE.TILE_COLORS.base).toBe(0x0d1f31);
  expect(VISUAL.SCENE.MARKER_COLORS).toEqual({
    tap: 0xffffff, selected: 0x54e4ff, good: 0x71f5b4, warn: 0xffd166, problem: 0xff6b7a, unknown: 0x6e8199,
  });
  expect(VISUAL.SCENE.MATERIALS.constructionScaffold).toEqual({
    color: 0xffbd59, emissive: 0x4a2d08, emissiveIntensity: 0.18, roughness: 0.58, metalness: 0.28,
  });
  expect(VISUAL.SCENE.LIGHTS).toEqual({
    hemisphereSky: 0xc8dcff, hemisphereGround: 0x101722, sunPosition: [4, 8, 5], rimColor: 0x54e4ff, rimPosition: [-6, 4, -4],
  });
  expect(VISUAL.ISLAND.THEME).toEqual({
    dark: { envMapIntensity: 0.35, oceanColor: 0x2f86b7 },
    light: { envMapIntensity: 0.55, oceanColor: 0x65b9d6 },
  });
  expect(VISUAL.ISLAND.FALLBACK_COLORS.land).toBe(0x6fa861);
  expect(VISUAL.ASSET.PALETTE_BLACK_LIFT).toEqual({
    assetPrefixes: ['residential', 'commercial', 'industrial'], emissive: 0x243443, intensity: 0.42,
  });
  // 색이 아닌 값은 그대로다.
  expect(VISUAL.SCENE.GREEN_HSL_OFFSET).toEqual(SETTINGS.VISUAL.SCENE.GREEN_HSL_OFFSET);
  expect(VISUAL.ISLAND.COAST_INDEXES).toEqual({ dock: [3, 15], grassHill: [5, 9, 18, 22], stoneHill: [7, 20], forest: [0, 12] });
  // Chart.js에 그대로 넘기는 CSS 색 문자열은 바꾸지 않는다.
  expect(VISUAL.CHART_STYLE.LABEL_COLOR).toBe('#a8bdd0');
  expect(VISUAL.CHART_STYLE.BORDER_COLOR).toBe('rgba(84,228,255,.85)');
  expect(Object.isFrozen(VISUAL)).toBe(true);
  expect(Object.isFrozen(VISUAL.SCENE.MATERIALS.ghost)).toBe(true);
  expect(Object.isFrozen(VISUAL.ISLAND.COAST_INDEXES.dock)).toBe(true);
});

test('SCENE·ISLAND·ASSET 안의 모든 "#rrggbb"는 export에서 같은 값의 숫자가 되고 나머지는 그대로다', () => {
  const colorPairs = [];
  const walk = (raw, exported, keyPath) => {
    if (Array.isArray(raw)) {
      expect(exported).toHaveLength(raw.length);
      raw.forEach((item, index) => walk(item, exported[index], `${keyPath}[${index}]`));
      return;
    }
    if (raw !== null && typeof raw === 'object') {
      expect(Object.keys(exported).sort()).toEqual(Object.keys(raw).sort());
      for (const key of Object.keys(raw)) walk(raw[key], exported[key], `${keyPath}.${key}`);
      return;
    }
    if (typeof raw === 'string' && HEX_COLOR.test(raw)) colorPairs.push([keyPath, raw, exported]);
    else expect(exported).toBe(raw);
  };
  for (const group of ['SCENE', 'ISLAND', 'ASSET']) walk(SETTINGS.VISUAL[group], VISUAL[group], group);
  expect(colorPairs.length).toBeGreaterThanOrEqual(50);
  for (const [, raw, exported] of colorPairs) expect(exported).toBe(Number.parseInt(raw.slice(1), 16));
});

test('모바일 폭·회전 단계·공사 단계 임계·새 방문처럼 여러 곳이 쓰던 값은 한 상수에서 나온다', () => {
  expect(VISUAL.MOBILE_MAX_WIDTH_PX).toBe(760);
  expect(QUEST_PANEL_LAYOUT.MOBILE_QUERY).toBe('(max-width: 760px)');
  expect(QUEST_PANEL_LAYOUT.MOBILE_QUERY).toBe(`(max-width: ${VISUAL.MOBILE_MAX_WIDTH_PX}px)`);
  expect(CITY_BUILDING_ORIENTATION.steps).toBe(6);
  expect(CITY_BUILDING_ORIENTATION.step).toBe(Math.PI / 3);
  expect(VISUAL.ISLAND.ROTATION_STEPS).toBe(6);
  expect(snapHexRotation(Math.PI / 3 + 0.2)).toBe(Math.PI / 3);
  expect(CONSTRUCTION.STAGE_THRESHOLDS).toEqual({ SHELL: 0.7, SKELETON: 0.3 });
  expect(CITY_AMBIENT.BIRD_VISIT_MS).toBe(2000);
  expect(CITY_AMBIENT.BIRD_POOL_SIZE).toBe(3);
  expect(CITY_AMBIENT.BIRD_MIN_COUNT).toBe(2);
  expect(nextBirdDelay(() => 0)).toBe(CITY_AMBIENT.BIRD_DELAY_MIN_MS);
  expect(nextBirdDelay(() => 1)).toBe(CITY_AMBIENT.BIRD_DELAY_MAX_MS);
  expect(UI_FEEDBACK.QUEST_ALERT_MS).toBe(7000);
});

test('옮긴 연출 값은 이관 전 리터럴과 같다', () => {
  expect(CITY_CAMERA).toMatchObject({
    BOARD_SPAN_PADDING_HEX: 2, TARGET_Y_MAX: 1.25, PORTRAIT_FIT_MAX: 1.32, PORTRAIT_FIT_GAIN: 1.08, FIT_EPSILON: 0.001, DEFAULT_POSE_TOLERANCE_MIN: 0.01,
  });
  expect(CITY_WORLD_OVERLAY).toMatchObject({ CONSTRUCTION_HUD_HEIGHT: 1.02, OX_WIDGET_HEIGHT: 1.02 });
  expect(CITY_AMBIENT).toMatchObject({
    PERSON_HEIGHT: 0.19,
    CAR_HEIGHT: 0.16,
    BIRD_DELAY_MIN_MS: 10000,
    BIRD_DELAY_MAX_MS: 30000,
    BIRD_PATH: { startX: -0.7, spanX: 1.4, laneSpacing: 0.18, weave: 0.08, arcHeight: 0.28, stackHeight: 0.04 },
  });
  expect(CITY_AMBIENT_MOTION.STATUS_PULSE).toEqual({ base: 0.82, amplitude: 0.18 });
  expect(VISUAL.SCENE).toMatchObject({
    TILE_Y: 0.06,
    FACILITY_Y: 0.13,
    DEMOLISH_DROP: 0.22,
    SHELL_SCALE: 0.82,
    CELL_SCREEN_PROJECTION_Y: 0.04,
    EASE_OUT_BACK_OVERSHOOT: 1.35,
    IDLE_FALLBACK_MS: 32,
    SCAFFOLD_PER_CELL: 6,
    GREEN_DETAIL_CONE_SEGMENTS: 5,
    SMOKE_SPHERE_SEGMENTS: [6, 4],
    PIXEL_RATIO_CAP: { coarse: 1.25, fine: 1.5 },
    TILE_GEOMETRY: { thickness: 0.12, segments: 6 },
    GREEN_ROTATION_SEED: { perCell: 0.73, perLevel: 0.31 },
    GREEN_HSL_OFFSET: { tree: [0.012, 0.04, 0.04], bush: [-0.015, 0.04, -0.07] },
    CORNER_MARKER: { outer: 0.38, inner: 0.23, thickness: 0.032 },
    RING: { y: 0.135, pulseAmplitude: 0.035 },
    FACILITY_PALETTE_BLACK_LIFT: { emissive: 0x101820, intensity: 0.18 },
  });
  expect(VISUAL.SCENE.ROTOR).toEqual({
    blades: 3, innerRadius: 0.055, outerRadius: 0.29, innerHalfWidth: 0.036, outerHalfWidth: 0.015, height: 0.78, zOffset: 0.015, phasePerCell: 0.23, colorBlend: 0.35,
  });
  expect(VISUAL.SCENE.CONSTRUCTION_SITE).toEqual({
    foundationY: 0.14,
    foundationWidth: 0.58,
    foundationDepth: 0.5,
    foundationHeight: { build: 0.065, upgrade: 0.035 },
    foundationColor: { build: 0x66727a, upgrade: 0x557b8c },
    stageHeight: { foundation: 0.13, skeleton: 0.55, shell: 0.78 },
    postOffset: 0.38,
    postY: 0.17,
    postSize: 0.025,
    postColor: 0xffbd59,
    beamLength: 0.41,
    beamSize: 0.025,
    beamColor: 0xffd27a,
  });
  expect(Object.keys(VISUAL.SCENE.MATERIALS)).toEqual([
    'tile', 'facility', 'greenDetail', 'ghost', 'planGhost', 'stateRing', 'constructionFoundation', 'constructionScaffold', 'rotor', 'ambientAgent', 'smoke', 'statusLight',
  ]);
  expect(VISUAL.SCENE.MATERIALS.ghost).toEqual({ color: 0x71f5b4, emissive: 0x71f5b4, emissiveIntensity: 0.32, roughness: 0.52, metalness: 0.04, opacity: 0.42 });
  expect(VISUAL.ISLAND).toMatchObject({
    WATER_RADIUS: 8,
    PROP_FALLBACK_ROUGHNESS: 0.9,
    FALLBACK_TILE: { thickness: 0.12, segments: 6, roughness: 0.94 },
    DECOR_VARIATION: { rotationPerIndex: 1.91, scaleBase: 0.9, scaleAlternate: 0.08 },
    OCEAN_PLANE: { size: 28, roughness: 0.72, metalness: 0.04 },
    SHIP: { height: 0.14, footprint: 0.42 },
    WATER_INDEXES: { rocks: [1, 7, 13, 19, 25], island: [4, 15, 26], ship: [8, 26] },
  });
  expect(VISUAL.TOAST).toEqual({
    MAX_VISIBLE: 3, ENTER_MS: 300, EXIT_MS: 240, PRIORITY_SCALE: 0.96, SLIDE_IN_PX: 30, SLIDE_OUT_PX: 40, ENTER_EASING: 'easeOutCubic', EXIT_EASING: 'easeInCubic',
  });
  expect(VISUAL.MODAL).toEqual({ ENTER_SCALE: 0.96, ENTER_MS: 220, ENTER_EASING: 'easeOutCubic' });
  expect(VISUAL.REPORT_RANK_ANIMATION).toEqual({ SCALE_FROM: 0.4, ROTATE_FROM_DEG: -15, DURATION_MS: 500, EASING: 'easeOutElastic(1, .6)' });
  expect(VISUAL.CHART_STYLE).toEqual({
    BORDER_WIDTH: 2,
    POINT_RADIUS: 2,
    BACKGROUND_COLOR: 'rgba(84,228,255,.10)',
    BORDER_COLOR: 'rgba(84,228,255,.85)',
    POINT_COLOR: 'rgba(113,245,180,1)',
    GRID_COLOR: 'rgba(255,255,255,.08)',
    ANGLE_LINE_COLOR: 'rgba(255,255,255,.08)',
    LABEL_COLOR: '#a8bdd0',
    LABEL_FONT_SIZE: 11,
  });
  expect(VISUAL.FALLBACK_PRIMITIVES).toEqual({
    CYLINDER_SEGMENTS: 10, CONE_SEGMENTS: 4, CONE_ROUND_SEGMENTS: 8, SPHERE_SEGMENTS: [10, 7], TAPER_TOP_RADIUS: 0.34, TAPER_SEGMENTS: 12,
  });
  expect(AUDIO.SFX_GAIN).toBe(0.03);
  expect(AUDIO.SFX_RAMP_FLOOR).toBe(0.0001);
  expect(AUDIO.SFX).toEqual({
    place: { freq: 540, duration: 0.055 },
    upgrade: { freq: 820, duration: 0.08 },
    demolish: { freq: 300, duration: 0.06 },
    correct: { freq: 720, duration: 0.07 },
    wrong: { freq: 220, duration: 0.09 },
    click: { freq: 540, duration: 0.04 },
  });
});

test('연출 파일에는 옮긴 값의 리터럴이 남아 있지 않다', async () => {
  const read = (relativePath) => readFile(path.join(projectRoot, relativePath), 'utf8');
  expect(await read('src/ui/CityScene3D.js')).not.toMatch(/0x0d1f31|0x71f5b4|0xffbd59|innerWidth <= 760|c1 = 1\.35|0x101820/);
  expect(await read('src/ui/CityEnvironment3D.js')).not.toMatch(/0x2f86b7|0x6fa861|WATER_RADIUS = 8|Math\.PI \/ 3|roughness: 0\.94/);
  expect(await read('src/systems/CameraController.js')).not.toMatch(/1\.32|1\.08|0\.001|1\.25/);
  expect(await read('src/systems/AmbientBirdSystem.js')).not.toMatch(/10000|20000|durationMs: 2000/);
  expect(await read('src/audio/sfx.js')).not.toMatch(/freq: 540|0\.03\b/);
  expect(await read('src/ui/ToastView.js')).not.toMatch(/MAX_VISIBLE_TOASTS = 3|duration: entering \? 300/);
  expect(await read('src/level/CityAssetLoader.js')).not.toMatch(/0x243443|0\.42/);
  expect(await read('src/level/FacilityGeometryFactory.js')).not.toMatch(/0\.34, 0\.5, 1, 12/);
  expect(await read('src/main.js')).not.toMatch(/duration: 7000/);
});
