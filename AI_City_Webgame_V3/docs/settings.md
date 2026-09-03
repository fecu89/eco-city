# settings.json — 게임 설정 파일

게임 규칙 수치와 연출 수치는 **프로젝트 루트의 `settings.json` 한 파일**에 모여 있다. 코드는 이 값을 읽기만 한다.

- 위치: `AI_City_Webgame_V3/settings.json`
- 읽는 곳: `src/core/Settings.js`가 빌드 시 import해 깊이 동결한 `SETTINGS`로 내보낸다.
  `src/core/Constants.js`와 `src/core/*Definitions.js`는 그 값을 **예전과 같은 이름으로 다시 export**하므로
  나머지 코드(`systems/`, `ui/`)는 `settings.json`의 존재를 모른다.
- JSON에 둘 수 없는 것 — 화면 문구, 아이콘 이름, CSS 값, 문구 함수, `Math.PI` 파생값 — 만 JS에 남아 있다.
  색은 `VISUAL.SCENE`·`ISLAND`·`ASSET`·`CHART_STYLE`에 `"#rrggbb"` 문자열로 적고(아래 연출 절), 1단계가 JS에 둔 색(테마·시설 레벨 색 등)은 그대로 JS에 있다.

## 값을 바꾸는 방법

1. `settings.json`을 텍스트 편집기로 연다(JSON이라 주석은 쓸 수 없다. 마지막 항목 뒤에 쉼표를 남기지 않는다).
2. 숫자는 따옴표 없이 적는다. `"cost": "5"`처럼 따옴표로 감싸면 검증 테스트가 잡는다.
3. 개발 서버(`npm run dev`)는 저장 즉시 반영된다. 배포본은 다시 빌드해야 한다(`npm run build` → `dist/`).
4. 바꾼 뒤 `PW_PORT=3177 npx playwright test tests/e2e/unit/settings.spec.js`로 파일 형식을 검사하고,
   가능하면 `tests/e2e/unit` 전체를 돌려 규칙 테스트도 확인한다(기대값을 리터럴로 고정한 테스트는 값을 바꾸면
   당연히 실패한다 — 그 실패는 "값이 바뀌었다"는 알림이지 버그가 아니다).

## 바꾸면 안 되는 것

다음은 코드·저장 파일과 맞물려 있어 **값만 바꿔서는 안 되고** 코드를 함께 고쳐야 한다.

| 항목 | 이유 |
|---|---|
| 섹션 이름(최상위 키)과 그 안의 키 이름 | 코드가 이름으로 읽는다. `Settings.js`의 `REQUIRED_SECTIONS`와 `settings.spec.js`가 목록을 고정한다 |
| 표의 id(`QUESTS`, `RESEARCH`, `CLIMATE_EVENTS`, `FINAL_CLIMATE_PHASES`, `FACILITIES`, `OPERATION_PROFILES.BATTERY_POLICIES`, `ZONES.EXPANSION_SIDES`의 키) | JS 쪽 문구·순서 정의가 같은 id로 조회한다. id가 빠지면 부팅 시 `settings.json: QUESTS.xxx 항목이 없습니다`로 즉시 실패한다. 행을 더해도 코드가 읽지 않는다 |
| `STAGES` 번호 | 저장 파일에 그대로 들어간다. 번호를 다시 매기면 옛 저장이 깨진다 |
| `GAME.AUTOSAVE_KEY` | localStorage 키. 바꾸면 기존 저장을 못 찾는다 |
| 배열 길이가 레벨·인덱스와 맞물린 표: `WORKFORCE_LEVELS`, `LEVEL_MULTIPLIERS`, `FACILITY_DEMAND_BY_LEVEL`, `FACILITY_WATER_BY_LEVEL`, `ECONOMY_RULES.UPKEEP_LEVEL_MULTIPLIERS`, `RESEARCH_RULES.DATA_CENTER_SPEED`, `CLIMATE_EVENTS.*.greenAbsorptionByLevel` | 인덱스 = 레벨(0은 미사용, 1~3). 길이 4를 유지한다 |
| `DIRECTION_RULES.SOLAR_FACTORS_BY_DEVIATION` / `WIND_FACTORS_BY_DEVIATION` | 인덱스 = 최적 방향에서 45° 몇 칸 벗어났는가(0~4). 길이 5 |
| `DIRECTION_RULES.DEFAULT_ROTATION` | 값은 `FACILITY_DIRECTIONS`(JS) 인덱스 0~7 |
| `FACILITY_LIMITS_BY_QUEST` 의 키 | 퀘스트 번호 1~19. 빈 행은 이전 값을 유지한다 |
| `STORAGE_LEVELS`, `CONSTRUCTION.UPGRADE_DAYS`, `CONSTRUCTION.UPGRADE_RATIOS`, `ZONES.EXPANSION_UPKEEP` 의 키 | 레벨/확장 단계 번호 |
| `FACILITIES.*.demand` (Lv.1) | `FACILITY_DEMAND_BY_LEVEL[type][1]`과 반드시 같아야 한다(건설 카드가 Lv.1 수요를 보여 준다) |
| `FACILITIES.*.unlockStage` | 값은 `STAGES`의 키 이름(`"EXECUTION"`, `"REDESIGN"`). 숫자가 아니다 |
| `STRESS_TEST_RULES.PHASE_DAYS` | `FINAL_CLIMATE_PHASES.*.durationDays`의 옛 사본. 둘을 같이 바꾼다(`settings.spec.js`가 같음을 검사한다). 통과 판정의 총 일수는 `FINAL_CLIMATE_PHASES` 합에서 파생한다 |
| `WEATHER_RULES.TRANSITIONS` | 각 행의 확률 합이 1이어야 한다 |
| `CAMPAIGN.QUEST_INDEXES` | 퀘스트 배열(JS `QUESTS`) 순서와 맞물린 구간 경계 번호 |
| `EVENT_DECK.OPENING`, `GRID_RESERVE_RULES.BATTERY_SUBSTITUTE_QUEST_ID`, `CITY_FAILURE_RULES.ACTIVE_AFTER_QUEST_ID`, `RESEARCH.*.unlockAfterQuestId`, `RESEARCH.*.prerequisites.items`, `QUESTS.*.entry` | 다른 표의 id를 가리킨다 |
| `FACILITY_GROUPS.*`, `PARTNER_RULES`, `SPATIAL_RULES[].self/neighbors`, `HEATWAVE_RULES.AFFECTED_TYPES`, `GAME.INITIAL_TECH_LEVELS`의 키 | `FACILITIES`의 시설 id. `SPATIAL_RULES[].id`는 JS `SPATIAL_LABELS`와, `QUIZ_RULES.FINAL.QUESTION_IDS`는 JS `QUIZ_BANK`와 1:1이라 새 id를 더하면 부팅에서 실패한다 |
| `GREEN_RULES.ADJACENT_INCOME_BY_LEVEL`, `HEATWAVE_RULES.GREEN_RELIEF.ADJACENT_DEMAND_BY_LEVEL` | 인덱스 = 녹지 레벨(0은 미사용). 길이 4 |
| `CARBON_CRISIS.TIERS`, `CONSTRUCTION.UPGRADE_PROFILE`, `REPORT_RULES.AXIS_MIX`, `POWER_RULES.PRIORITY_ORDER`, `MODAL_PRIORITY`의 키 | 코드가 단계 이름·시설 종류·축 이름·우선순위 이름으로 읽는다. 값만 바꾼다 |
| `VISUAL.*` | 3D 씬·카메라·연출 수치. 바꿔도 규칙은 안 변하지만 시각 회귀 테스트(스크린샷)가 달라질 수 있다 |

## 섹션 목록

키 이름은 `Constants.js`의 export 이름과 1:1이다(정의 파일에서 온 표와 `VISUAL`만 예외).

### 게임·보드

| 섹션 | 뜻 |
|---|---|
| `STAGES` | 캠페인 단계 번호(EXECUTION 1 · DIAGNOSIS 4 · REDESIGN 5 · REPORT 6). 저장 호환용 — 바꾸지 않는다 |
| `GAME` | 초기 크레딧, 자동저장 키·지연(ms)·시뮬레이션 저장 간격(ms), 이벤트 씨앗, 기술 레벨 초기값(`INITIAL_TECH_LEVELS`), 스토리 버전(`ONBOARDING_VERSION` — 올리면 모든 플레이어에게 도입 스토리를 다시 보여 준다) |
| `BOARD` | 육각 보드 반지름(2→3), 칸 수(19→37), 육각 크기, 최대 칸 수 |
| `DIRECTION_RULES` | 시설 방향 45° 8방위 규칙: 방향을 타는 시설, 태양광 최적 방향, 편차별 출력 배율, 기본 회전, 칸별 풍향이 주풍향에서 벗어나는 폭(`WIND_LOCAL_SPREAD`, ±칸) |
| `TIDAL_RULES` | 조차 범위(m)·기준 조차·출력 배율 하한/상한. `COASTAL_RING`은 `BOARD.EXPANDED_RADIUS`에서 파생(JS) |
| `BOARD_KEYBOARD` | 키보드 커서: 화살표 이동 벡터, 투영 불가 시 축좌표 대체, Home/Escape/활성/회전 키, 내적 임계 |
| `CALENDAR` | 달력 시작(2040-01-01), 게임일 1일의 ms, 하루 시간 수(`HOURS_PER_DAY`) |
| `TIME` | 1배속 게임일 길이(ms), 허용 배속, 기본·빠른 배속 |

### 점수·건설·경제

| 섹션 | 뜻 |
|---|---|
| `SCORING` | 보드 점수 가중치: 시너지 인접, 갈등 감점, 재생에너지 할인, 지속가능성, 신뢰도 |
| `UPGRADE_COST_RATIOS` | 강화 비용 배수(Lv.1에서 / Lv.2 이상에서) |
| `DEMOLITION_REFUND_RATIO` | 철거 환급률 |
| `CONSTRUCTION` | 시설별 공사 일수, 레벨별 강화 일수·비용 비율, 공사 중 취소 환급률(초·중·후반), 공사 단계 진행률 임계(`STAGE_THRESHOLDS`: 골조·외장), 환급 구간 경계(`REFUND_BOUNDARIES`: 진행률 25%·75%), 강화 중 제한 가동 프로필(`UPGRADE_PROFILE`: 주거·데이터센터·배터리 — 시설 창 문구의 %도 여기서 만든다) |
| `CAMPAIGN_PACING` | 실제 플레이 목표 시간(분)과 구간별 분 배분, 대표 결정 창 |
| `EVENT_FORECAST_DAYS` / `EVENT_GAP_DAYS` | 기후 이벤트 예보 일수와 이벤트 사이 휴지 일수 |
| `AUDIO` | 배경음 파일 경로와 음량, 효과음(`SFX`) 6종의 주파수(Hz)·길이(초), 효과음 음량(`SFX_GAIN`)·감쇠 하한 |
| `QUEST_REQUIREMENTS` | 기초 퀘스트 판정: 연속 운영 일수, 첫 주거·녹지 수, 물순환 공급률, 전환선 저탄소 %·CO₂ 상한, 공장 가동 연계 기준(`FACTORY_LINK_MIN_RATIO`), 데이터센터 현대화 레벨(`MODERNIZATION_LEVEL`)과 진행률 가중치 |
| `FACILITY_BUILD_ORDER` | 건설 독 카드 정렬 순서 |
| `FACILITY_LIMITS_BY_QUEST` | 퀘스트 번호별 시설 누적 허가 한도(빈 행은 이전 값 유지) |
| `RESEARCH_RULES` | 데이터센터 레벨별 연구 속도, 연구 전력 기준·추가 수요, 취소 환급, 1분당 게임일, 최종 퀴즈 문항 수, 표준 기간, Lv.3 데이터센터의 저탄소 잉여 연구 가속(`DATA_CENTER_SURPLUS_BONUS`) |
| `DAILY_CARBON_TARGETS` | 캠페인 구간별 일일 CO₂ 목표(기초·준비·기후전) |
| `CARBON_CRISIS` | CO₂ 안전선, 누적 게임오버 일수, 회복 속도, 경고 마일스톤, 활성 시작 퀘스트, 단계별 배수 표(`TIERS`: normal/watch/danger/severe/extreme의 건강비·주거 수입·물 배수와 성적표 감점) |
| `CITY_FAILURE_RULES` | 적자·필수시설 정전 누적에 따른 경고/일시정지/게임오버 일수, 정전 판정 % |
| `EMERGENCY_SUPPORT` | 파산 직전 구제금: 기준 크레딧, 지급액, 점수 차감 |
| `POWER_RULES` | 송전 손실/칸, 최저 효율, 배터리 허브 효율, 배터리 가동 기준, 소비 시설 급전 순서, 실제 공급 판정 하한(`DELIVERY_EPSILON_E`), 가동 판정 공급률(`OUTAGE_RATIO` — 이 아래면 정전), 우선순위 정렬 순서(`PRIORITY_ORDER`) |
| `GRID_RESERVE_RULES` | 배터리 대체 조건이 열리는 퀘스트 id |
| `WATER_RULES` | 물 기준선을 아직 못 잰 상태의 기본값 |
| `STRESS_TEST_RULES` | 최종시험 구간 일수(옛 사본), 공사비 배수, 통과 조건(공급률·파산·탄소·물·복구·조력) |
| `STORAGE_LEVELS` | 배터리 레벨별 용량·일일 출력 |
| `COOLING_RULES` | 순환냉각의 시설별 물 감축량(행이 있는 시설만 냉각 혜택을 받는다), Lv.2 배수와 그 배수가 켜지는 레벨(`BONUS_LEVEL`), Lv.3 원거리 범위·배수 |
| `FACILITY_ECONOMY` | 시설별 수입·유지비 |
| `WORKFORCE_RULES` / `WORKFORCE_LEVELS` | 인력 재배치 유예 일수, 시설·레벨별 인구(주거)/필요 인력 |
| `ECONOMY_RULES` | 정지 전력 비율, 주거 세율, 과밀 무료 수·비용, 오염 건강비·세금 배수, 탄소 안전선, 기후복구 비용, 레벨별 유지비 배수, 발전 대기 배출 비율 |
| `RESEARCH_TUNING` | 저풍 재난에서 풍력이 유지하는 출력(연구 전/후) |
| `LEVEL_MULTIPLIERS` | 레벨별 출력·수요·양수 영향·음수 영향 배율 |
| `FACILITY_DEMAND_BY_LEVEL` / `FACILITY_WATER_BY_LEVEL` | 소비 시설의 레벨별 전력 수요·물 사용 표(표가 있으면 배율 대신 사용) |
| `WEATHER_RULES` | 날씨 묶음 일수, 종류·초기값, 마르코프 전이 확률, 눈 표시 월, 태양광 배율 범위, 풍속 범위·풍력 곡선, 이벤트별 강제 날씨 |
| `DEMAND_VARIATION` | 일일 수요 변동 진폭·묶음 일수·평활 일수 |
| `FACILITIES` | 시설별 비용·발전점수·수요·공급·탄소·물·해금 단계 이름·최대 레벨·배치 규칙(`placement`) |
| `REPORT_TIERS` | 성적표 등급 하한 점수(높은 순). 칭호·아이콘은 JS |
| `REPORT_RULES` | 5축 가중치, 퀴즈 배점·상한, 도시 유형 분류 임계, 축 안의 혼합 비율(`AXIS_MIX`), 정규화 기준(`NORMALIZE`: 수익 오프셋·범위, 크레딧 회복 만점, 사회비용 만점, 직접 운영 횟수, 복구일 상한·범위, 배터리 대응 E, 시험 기록이 없을 때의 복구일) |

### 연출(`VISUAL`)

카메라·3D 높이·애니메이션 ms·조명 강도 등 규칙과 무관한 수치. 1단계 하위 키는 Constants export 이름과 같고,
2단계에서 코드(CityScene3D·CityEnvironment3D 등)에서 옮겨 온 묶음은 `Constants.VISUAL.<하위 키>`로 읽는다.
**색은 `"#rrggbb"` 문자열로 적는다** — `SCENE`·`ISLAND`·`ASSET` 안의 색은 Constants가 Three.js용 0x 정수로 바꾸고,
`CHART_STYLE`의 색은 Chart.js에 그대로 넘기는 CSS 문자열이라 `rgba(…)`도 쓸 수 있다. `VISUAL.*`를 바꾸면
시각 회귀 스크린샷(`tests/e2e/visual.spec.js`)이 달라질 수 있다.

| 하위 키 | 뜻 |
|---|---|
| `WORLD_DAY_LIGHTING` | 태양·반구·림 광원 강도(색은 JS) |
| `HEX_TILE_VISUALS` | 타일 종류별 덮임 비율 |
| `ISLAND_LAYER_ELEVATIONS` | 섬 지형 레이어 고도 |
| `CHART_MOTION` | 레이더 차트 보간 비율·이징 |
| `GRID_EXPANSION_SETTLE_MS` | 확장 연출 대기 시간 |
| `CITY_CAMERA` | 시야각·거리 계수·극각 하한·감쇠·팬 여백·드래그/탭 임계·더블탭·바닥면, 보드 여백 계수(`BOARD_SPAN_PADDING_HEX`)·타깃 높이 상한·세로 화면 맞춤 상한/계수·맞춤 무시 임계·기본 시점 허용 오차 하한(`MAX_POLAR_ANGLE`은 JS의 `Math.PI` 파생) |
| `CITY_MOTION` | 배치·강화·철거·선택 펄스 시간(ms) |
| `LOADING_SCREEN` | 로딩 화면 최대 대기·완료 지연(ms) |
| `CITY_WORLD_OVERLAY` | 공사 배지 갱신 임계, O/X 위젯·배지 여백, 두 오버레이의 투영 높이 |
| `CITY_AMBIENT` | 생활 객체(사람·차·새) 수·궤도·크기·높이, 새 방문(풀 크기·최소 마리 수·지속 ms·방문 간격 ms 범위·비행 경로)(색은 JS) |
| `GREEN_VISUAL_LAYOUTS` | 녹지 레벨별 나무·덤불 배치 |
| `CITY_AMBIENT_MOTION` | 연기·상태등·로터 연출 주기·수·크기, 상태등 펄스(`STATUS_PULSE`)(색과 `MAX_STATUS_LIGHTS`는 JS) |
| `UI_FEEDBACK` | 토스트·퀘스트 알림(기후 예보 토스트도 같은 값)·축하·탭 피드백·배치 힌트 시간 |
| `CITY_ASSETS` / `CITY_ASSET_FOOTPRINT` | 시설별 3D 높이, 바닥 점유 비율 |
| `CITY_BUILDING_ORIENTATION` | 한 바퀴 회전 단계 수(`steps`, 육각 6)와 시설별 회전 오프셋(`step`은 JS가 `2π/steps`로 계산) |
| `MOBILE_MAX_WIDTH_PX` | 모바일로 보는 화면 폭 상한(px). 패널 미디어쿼리(`QUEST_PANEL_LAYOUT.MOBILE_QUERY`)와 3D 픽셀비 상한 판정이 함께 쓴다 |
| `SCENE` | 3D 보드 씬(CityScene3D): 타일 상태별 색표·마커 색표, 픽셀비 상한, 시설 팔레트 검정 보정, 타일 두께/분할·높이, 시설 기준 높이·철거 하강, 외장 단계 축소, 화면 투영 높이, easeOutBack 계수, idle 폴백 ms, 비계 인스턴스/칸, 녹지 디테일·연기 분할, 녹지 회전 시드·HSL 변주, 로터 치수·배치, 코너 마커 치수, 선택 링 높이·펄스, 공사 현장 치수·색, 조명 초기 색·위치, 머티리얼별 색·거칠기·금속성·발광·불투명도(`MATERIALS`) |
| `ISLAND` | 섬 환경(CityEnvironment3D): 바깥 물 반지름, 회전 단계 수, 해안/수면 장식 배치 인덱스, 프롭·지형 폴백 거칠기/두께/분할, 장식 회전·크기 변주, 바다 평면 크기·재질, 배 크기, 지형/장식 폴백 색, 테마별 envMap 세기·바다색 |
| `TOAST` | 토스트 동시 표시 상한, 등장/퇴장 ms·이징, 우선 토스트 축소 비율, 밀어 넣기/내보내기 px |
| `MODAL` | 모달 등장 축소 비율·ms·이징 |
| `REPORT_RANK_ANIMATION` | 성적표 등급 아이콘 연출(시작 축소·회전 각도·ms·이징) |
| `CHART_STYLE` | 레이더 차트 선 굵기·점 크기·채움/선/점/격자/축선/라벨 색(CSS 문자열)·라벨 글자 크기 |
| `ASSET` | GLB 팔레트 검정 보정: 적용 에셋 id 접두사, 발광색, 세기 |
| `FALLBACK_PRIMITIVES` | GLB를 못 불러올 때 쓰는 폴백 도형의 분할 수와 taper 윗반지름 |

### 정의 파일에서 온 표

| 섹션 | 뜻 | 문구가 있는 JS 파일 |
|---|---|---|
| `CLIMATE_EVENTS` | 기후 이벤트 8종: 지속 일수, 시설별 계수(supply/demand/water/carbon/effectiveness), 도시 계수(waterLimitRatio/carbonFlat), 녹지 레벨별 흡수 | `ClimateCampaignDefinitions.js` |
| `FINAL_CLIMATE_PHASES` | 최종시험 8구간의 같은 항목. 구간 순서는 JS 배열이 정한다 | `ClimateCampaignDefinitions.js` |
| `QUESTS` | 퀘스트 19개(id 키): 보상(`credits`, `unlockFacilities`, `unlockResearch`, `upgradePermitLevel`, `upgradePermitFacilities`, `stressTest`)과 기후 퀘스트 목표(`targetDays`, `carbonTarget`, `batteryTarget`, `batteryReserveTarget`, `generationTypeTarget`, `tidalEnergyTarget`, `entry`). 비어 있는 항목은 생략한다 | `QuestDefinitions.js`, `ClimateCampaignDefinitions.js` |
| `RESEARCH` | 연구 10종: 기간(일)·비용·선행조건(`{mode, items}`)·효과(`outcome`)·해금 퀘스트 | `ResearchDefinitions.js` |
| `ZONES` | 확장 단계별 유지비, 우수 입지 출력 배수, 확장 방향별 해금 시설·지역 특성, 지역 특성 배율(`TRAIT_MODIFIERS`: 생활지역 주거 수입·오염 시설 건설비, 산업지역 공장 건설비·주거 건강비 — 지역 설명 문구의 %도 여기서 만든다) | `ZoneDefinitions.js` |
| `CAMPAIGN` | 캠페인 구간 경계 퀘스트 번호, 시설별 Lv.3 허가 퀘스트, 기본 허가 퀘스트 | `CampaignProgression.js` |
| `OPERATION_PROFILES` | 배터리 정책별 예비율·필수시설 전용 여부 | `OperationDefinitions.js` |
| `EVENT_DECK` | 첫 세 기후 이벤트 순서 | `EventDefinitions.js` |

### 코드에서 옮긴 규칙 값(2단계)

`systems/`·`ui/`에 리터럴로 박혀 있던 규칙 값. Constants export 이름과 1:1이다.

| 섹션 | 뜻 | 읽는 곳 |
|---|---|---|
| `FACILITY_GROUPS` | 시설 종류 묶음: 발전원(`GENERATION`), 저탄소(`LOW_CARBON`), 재생(`RENEWABLE`), 저장 허브가 필요한 변동 재생(`VARIABLE_RENEWABLE`), 필수시설 기본값(`ESSENTIAL_DEFAULT`), 배터리 허브 소비지(`BATTERY_CONSUMERS`), 기술 레벨이 필요한 시설(`TECH_GATED`), 가동률에 비례해 배출하는 시설(`OUTPUT_LINKED_CARBON`), 오염 시설(`HEAVY_POLLUTERS`). 값은 `FACILITIES`의 시설 id | PowerNetwork·Simulation·Board·Economy·Zone·FacilityOperation·ClimateQuest·GameState·DockView |
| `PARTNER_RULES` | 건설 독 미리보기의 시설별 좋은/나쁜 인접(good/bad) 표 | `BoardSystem.placementPreview` |
| `SPATIAL_RULES` | 시설 창의 공간 시너지/갈등 표(배열 순서대로 평가): `id`·`self`(이 시설)·`neighbors`(인접 시설)·`mode`(positive/warning/either). 문구는 JS `SPATIAL_LABELS`가 id로 붙이고, 저장 허브 두 규칙은 JS에 있다 | `BoardSystem.getCellSpatial` |
| `GREEN_RULES` | 녹지 군집 최소 칸 수, 인접 녹지 레벨별 주거 수입 배수(길이 4, 인덱스 0 미사용), 거리 2 녹지 보너스가 열리는 레벨·수입 배수, 녹지 인접 공장의 오염 건강비 배수 | `CityModifierSystem` |
| `HEATWAVE_RULES` | 폭염 수요 배수, 영향 시설, 녹지 인접 완화 배수(`GREEN_RELIEF`: 레벨별·거리 2) | `ClimateSystem`·`CityModifierSystem` |
| `SOLAR_RULES` | 태양광 시간대 경계(밤·새벽/저녁 시각)와 새벽/저녁 배율, 일평균 유효 일조 시간(÷ `CALENDAR.HOURS_PER_DAY`) | `ClimateSystem` |
| `CLIMATE_QUEST_RULES` | 기후 퀘스트 필수시설 공급률 목표(%) | `ClimateQuestSystem`·`QuestView` |
| `EVENT_RULES` | 가뭄 이벤트 추가 삽입 조건(완료 이벤트 수), 이벤트 정전일 판정 %, 사후 진단 가중치 | `CityEventSystem` |
| `FORECAST_RULES` | 건설 예보의 전력 부족 판정 여유(E), 위험도 정렬 가중치 | `SimulationForecastSystem` |
| `RESEARCH_EFFECTS` | 연구 완료 효과: 태양광·풍력 공급 배수, 배터리 용량 배수(저장 파일 정규화 상한도 같은 값), 스마트그리드 송전 손실/칸 | `ResearchEffectSystem`·`GameState` |
| `QUIZ_RULES` | 최종 개념 퀴즈 문항 id(`QUIZ_BANK`의 id, 부팅 시 검사)와 통과선 | `QuizSystem` |
| `HUD_RULES` | 상단 HUD 배터리 경고/위험 임계(E) | `SimulationHudView` |
| `CHART_RULES` | 레이더 차트 축 환산 계수(탄소·물·시너지 링크) | `ChartView` |
| `MODAL_PRIORITY` | 모달 우선순위 열거(NORMAL < IMPORTANT < CRITICAL 순서를 유지한다) | `Modal.js`(다시 내보냄) |

## JSON으로 옮기지 않은 것

- 화면 문구·아이콘·설명: `DISPLAY_UNITS`, `DIRECTION_COPY`, `SAVE_MESSAGES`, `CAMERA_UI`, `BOARD_TAP_COPY`, `WEATHER_RULES.DISPLAY`와 문구 함수, `FACILITIES`의 name/icon/desc, `QUIZ_BANK`, 연구 퀴즈(`ResearchQuizDefinitions.js` — 수치가 없고 정답은 항상 0번), `ZONE_TRAITS`, `ENERGY_SITE_LABELS`, 퀘스트 제목·목표·세부.
- 색상(0x…)·CSS: `THEME_SCHEMAS`, `FACILITY_LEVEL_COLORS`, `LEVEL_VISUALS`, `CITY_FALLBACK_PARTS`, `QUEST_PANEL_LAYOUT`, `FLOATING_PANEL_STORAGE`, `THEME_STORAGE_KEY`.
- 구조·파생: `FACILITY_DIRECTIONS`(인덱스가 저장값), `COAST_PROP_ROTATION_OFFSETS`·`CITY_BUILDING_ORIENTATION.step`·`CITY_CAMERA.MAX_POLAR_ANGLE`(`Math.PI` 파생), `CLIMATE_QUEST_ORDER`, `PREPARATION_QUEST_IDS`, `realMinutesAt1x`, `WEST_BRANCH_QUESTS`.
- 다른 값에서 파생해 JS가 계산하는 것: 시설·레벨 → 연구 id 표(`TECH_RESEARCH_BY_FACILITY`, `RESEARCH.*.outcome.tech`에서), 확장 한 방향 칸 수(`EXPANSION_CELLS_PER_SIDE` = (37−19)/2), 기후 퀘스트 수(`CLIMATE_QUEST_COUNT` = CLIMATE_END−CLIMATE_START+1), 순환냉각 수혜 시설(`COOLING_RULES.TARGET_WATER_REDUCTION_PER_LEVEL`의 키).
- 규칙에 따라 JS에 남긴 것: 저장 스키마 버전(`GameState.SAVE_VERSION`), `SaveSystem`의 레거시 저장 마이그레이션 매핑, PRNG 시드·해시 상수, 동/서·특성 존의 기하 분할식, 퍼센트 상한(100) 같은 경계값.

## 검증

- `tests/e2e/unit/settings.spec.js`
  - `validateSettings(SETTINGS)`가 빈 배열을 돌려준다(필수 섹션·모르는 섹션·null/NaN/함수·따옴표 숫자·숫자 자리 형식).
  - 최상위 키마다 `src/core/*.js`에서 `SETTINGS.<키>` 또는 `settingsRow('<키>…')`로 읽힌다.
  - Constants·정의 파일의 export가 JSON 섹션과 같은 값이고, 표의 id 목록이 코드와 같다.
  - JSON에 함수·NaN·null이 없고 `SETTINGS`는 깊이 동결돼 있다.
  - 문구 함수 출력이 이관 전과 같다.
- `src/core/Settings.js`의 `validateSettings(candidate, reference?)`는 부팅 때 호출하지 않는다(테스트 전용).
