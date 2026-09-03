# 기술 스택

게임 규칙과 콘텐츠는 [gameplan.md](./gameplan.md)가 기준이다. 이 문서는 그 게임이 어떤 코드 구조 위에
올라가 있는지만 다룬다.

## 엔진/빌드

- **바닐라 ES 모듈 + Vite 8**(rolldown 기반). Phaser 같은 풀 게임엔진은 쓰지 않는다 — 이 게임은 패널·
  모달·차트 중심의 UI 시뮬레이션이고, `game-architecture` 스킬의 원칙(EventBus/GameState/Constants/
  오케스트레이터/디렉터리 분리)은 엔진 중립적이라 그대로 적용된다.
- **보드는 Three.js 영구 인스턴스 씬 하나**다(`src/ui/CityScene3D.js`) — [ADR-0003](./architectural-decisions/0003-city-kit-instanced-renderer.md).
  배경 장식(`ThreeBackground.js`)은 WebGL이 아니라 CSS 레이어라 WebGL context는 게임 전체에서 1개다.
- **3D 월드는 뷰포트 전체, UI는 그 위의 고정 HUD 레이어**다(`src/ui/WorldHud.js`) —
  [ADR-0004](./architectural-decisions/0004-fullscreen-world-hud.md). 건설/퀘스트/도시 상태/설정 중
  하나만 열리고 중앙 모달이 항상 우선한다.
- **건설 모드·생활 도시·통합 테마** — [ADR-0005](./architectural-decisions/0005-living-city-feedback-and-themes.md).
- 의존성은 전부 npm 번들이다(CDN 없음): `three`, `chart.js`, `animejs`, `lucide`. 학교 네트워크의 외부
  CDN 차단 리스크를 없애기 위한 결정이다.
- **빌드 청크 분리**(`vite.config.js`의 `build.rollupOptions.output.manualChunks`): `three` / `chart` /
  `vendor`(animejs·lucide) / 앱 코드로 나눈다. `chart.js`는 `ChartView.js`가 동적 import하므로 도시 상태
  패널을 처음 열 때만 내려받는다. 계약(청크 3개 이상, 최대 700kB 미만, index.html이 chart 청크를 미리
  받지 않음)은 `tests/e2e/unit/build-chunks.spec.js`가 고정한다.

## 시간 모델

- **1틱 = 1게임일**이다. 1배속에서 게임 1일은 현실 1000ms(`TIME.BASE_DAY_MS`)이고, 배속은 0/1/2/4배다
  (`TIME.ALLOWED_SCALES`). 달력은 2040-01-01에서 시작한다(`CALENDAR`).
- 경제·전력·퀘스트 정산은 정수 일 경계에서 한 번만 돈다(`createDaySettler`). 날짜 라벨과 공사 진행
  배지는 `requestAnimationFrame` 보간으로 연속 표시하지만 WebGL 프레임을 추가하지 않는다
  (`ContinuousClockView.js`).
- 중앙 모달과 숨겨진 탭에서는 타이머가 멈추고 오프라인 시간을 따라잡지 않는다. 일시정지는 이유 집합
  기반이라 여러 원인이 겹쳐도 새지 않는다(`createSimulationController`).

## 디렉터리 구조

`find src -type f | sort` 기준이다.

```
src/
  main.js                        오케스트레이터: 부트, 시스템 연결, render_game_to_text, advanceTime, 테스트 훅
  style.css                      전체 스타일(HUD·패널·모달·3D 오버레이·라이트/다크 테마)

  core/                          규칙과 데이터. 여기서는 systems/ui를 import하지 않는다
    EventBus.js                  pub/sub 싱글턴 + Events 상수 78개(domain:action). 원시 문자열 발행은 0건
    GameState.js                 상태 싱글턴, SAVE_VERSION 9, serialize/restore, normalizeCell
    Constants.js                 모든 밸런스 수치(시설·경제·전력·기후·보고서·모션·에셋·테마)
    QuestDefinitions.js          퀘스트 19개(1~10·19 직접 정의, 11~18은 기후 캠페인에서 합성), WEST_BRANCH_QUESTS
    ClimateCampaignDefinitions.js 기후 이벤트 8종, 기후 퀘스트 11~18, 최종시험 8구간(FINAL_CLIMATE_PHASES)
    EventDefinitions.js          기후 이벤트를 이벤트 덱/스트레스 구간으로 다시 내보내고 총 시험 일수를 계산
    CampaignProgression.js       캠페인 구간 경계(CAMPAIGN_QUEST_INDEXES), Lv.3 강화 허가 퀘스트 표
    ResearchDefinitions.js       연구 11종(기간·비용·선행조건·효과·분기)
    ResearchQuizDefinitions.js   연구별 전용 퀴즈 4문항 × 11 = 44문항
    ZoneDefinitions.js           동/서 확장 방향, 지역 특성, 확장 유지비, 조력 입지 좌표
    OperationDefinitions.js      시설 운영 모드(주거 절전 요청·강제 절전·자동 수요반응, 공장 절전·증산, 데이터센터 집중 연구)
    ConstructionProject.js       공사/강화 프로젝트 순수 헬퍼(정규화·완공 판정) — core가 systems를 참조하지 않도록 분리
    Money.js                     크레딧 반올림·표기(소수 둘째 자리, -0.00 방지)
    safeStorage.js               localStorage 접근을 전부 감싸는 방어 래퍼(차단된 브라우저에서 부팅이 멈추지 않게)

  systems/                       규칙 실행. DOM을 만지지 않는다
    SimulationSystem.js          하루 정산 코어(createDaySettler)와 타이머·일시정지 컨트롤러
    SimulationForecastSystem.js  상태를 복제해 건설/강화/N일 후를 예측(미리보기 패널이 재사용)
    BoardSystem.js               배치·강화·철거, 인접·시너지·갈등 점수(calcMetrics), 배치 미리보기
    HexGridSystem.js             육각 좌표 생성·거리·이웃·반경 확장
    ZoneSystem.js                확장 방향 활성화(19→28→37칸), 지역 특성, 확장 선택 재요청 판정
    PowerNetworkSystem.js        거리 손실·급전 우선순위·배터리 허브·저탄소 우선 배분
    EconomySystem.js             세금·수입·유지비·과밀·건강·기후복구 비용 정산
    FacilityOperationSystem.js   시설별 실제 가동률과 그에 비례하는 탄소·물 산출
    FacilityPermitSystem.js      퀘스트별 시설 누적 허가(FACILITY_LIMITS_BY_QUEST)와 철거 의존성 검사
    WorkforceSystem.js           주거 노동인구와 시설 필요 인력, 전환 시 인력 검증
    ConstructionPlanSystem.js    건설 계획 검증(허가·인력·예비력·크레딧 원자적 검사)과 확정
    ConstructionProjectSystem.js 공사/강화 진행과 완공 처리(core 헬퍼를 다시 내보냄)
    ClimateSystem.js             시각별 태양광·순환 풍력·세계 위상 계산
    ClimateModifierSystem.js     기후 정의를 시설/도시 계수로 합성(물 한도·냉각 효과·고정 탄소 포함)
    ClimateQuestSystem.js        기후 퀘스트 11~18의 브리핑·연속일 판정·보상
    CityEventSystem.js           기후 이벤트 일정 생성(24일 예보·3일 휴지기)과 결과 요약
    CityModifierSystem.js        운영 모드·지역·기후를 하나의 시설 계수로 합성
    CarbonCrisisSystem.js        일일 CO₂ 초과 누적, 경고 마일스톤, 게임오버 전환
    CityFailureSystem.js         적자·필수시설 정전 누적에 따른 경고/일시정지/게임오버
    StressTestSystem.js          19단계 최종시험 구간 진행·물 기준선·통과 판정
    QuestSystem.js               퀘스트 1~10·19 조건 평가, 연속 일수, 보상 수령, 해금
    QuizSystem.js                연구 가속 퀴즈와 최종 4문항 퀴즈(결정적 셔플, 재출제 방지)
    ResearchSystem.js            데이터센터별 연구 작업 시작·진행·취소
    ResearchEffectSystem.js      완료된 연구를 실제 계수(발전 효율·저장·수요반응 등)로 변환
    ReportSystem.js              5축 성적표·퀴즈 보너스·도시 유형 분류·내보내기
    SaveSystem.js                localStorage 자동저장과 v1→v9 마이그레이션
    CalendarSystem.js            경과 게임일 → 달력 스냅샷, 배속별 틱 간격
    CameraController.js          제한된 OrbitControls(회전·팬·줌, 결정적 초기화)
    AmbientBirdSystem.js         녹지가 있을 때만 도는 새 방문 스케줄러
    CityAmbientMotionSystem.js   연기·로터 등 저빈도 ambient 모션 스케줄러

  ui/                            DOM/3D 렌더링. 규칙을 다시 계산하지 않는다
    CityScene3D.js               InstancedMesh 3D 보드, 레이캐스팅, 레벨별 메시, 고스트·O/X 위젯, 전력선
    CityEnvironment3D.js         고정 섬 지형(육지·해안·수면·바다)과 해안 장식
    WorldLightingManager.js      낮/노을/밤 고정 조명 모드와 저장
    GridView.js                  보드 입력(칸 클릭·건설 확정 흐름)과 렌더 트리거
    WorldHud.js                  데스크톱 rail·모바일 하단 바, 패널 하나만 열기, 포커스 복원, 모달 우선순위
    HudView.js                   상단 상태줄(단계·크레딧·경보)
    SimulationHudView.js         일일 정산 수치 패널(스크린리더 폭주를 막는 전용 라이브 영역 포함)
    DockView.js                  건설 독(시설 카드·잠금·허가·상세)
    QuestView.js                 현재 퀘스트 카드와 전체 퀘스트 지도, 보상 수령
    QuestPanelController.js      퀘스트 패널 드래그·고정·키보드 이동
    QuestCelebration.js          퀘스트 완료 연출
    FloatingPanelController.js   도시 상태·설정 패널의 드래그/키보드 이동/정리
    ChartView.js                 도시 상태 레이더 차트(chart.js 지연 로딩, 틱 간격 보간)
    ForecastView.js              상단 기후 예보 스트립
    EventResultView.js           기후 이벤트 종료 결과 요약
    StageModals.js               시설 상세·강화 예측·철거 확인·확장 선택·최종시험·성적표·도움말 모달
    Modal.js                     모달 셸, 우선순위 큐, lucide 아이콘 등록(PascalCase 키)
    OnboardingView.js            첫 접속 3장 스토리와 행동형 튜토리얼 하이라이트
    ResearchView.js              데이터센터 연구 목록·시작·취소
    ToastView.js                 토스트(최대 3개, textContent만 사용)
    FeedbackBridge.js            모달에 속하지 않는 이벤트 → 토스트/효과음 연결
    ThemeManager.js              다크/라이트 테마 전환과 저장
    ThreeBackground.js           CSS 그라데이션 배경 레이어(WebGL 아님)
    ContinuousClockView.js       날짜·공사 배지의 rAF 보간
    format.js                    escapeHtml, 반올림, 지표 축약 표기
    questText.js                 퀘스트 보상 문장(카드와 토스트가 공유)
    motionPreference.js          prefers-reduced-motion을 JS 애니메이션에서 조회

  level/
    CityAssetLoader.js           City Kit GLB 비동기 로더. 캐시 키는 에셋 id(레벨별 교체·공유 모두 처리)
    FacilityGeometryFactory.js   GLB 실패 시 타입별 절차형 폴백 지오메트리

  assets/
    AssetLoader.js               GLTF 로더 래퍼(텍스처까지 해제하는 dispose 포함)
    assetRegistry.js             시설·환경·차량·사람 GLB 경로 레지스트리(레벨별 매핑 포함)
    geometryUtils.js             다중 primitive 병합·정규화(드로우콜 예산 유지)

  audio/
    AudioManager.js              AudioContext 초기화, 마스터 게인, 배경음(<audio>)과 효과음 분리
    bgm.js                       배경음 재생/정지
    sfx.js                       Web Audio 원샷 효과음
```

## 테스트

```
tests/
  fixtures/game-test.js   부팅·로딩 화면·온보딩 3장을 넘긴 뒤 페이지를 넘겨주는 gamePage fixture
  helpers/playthrough.js  clickCell / buildPlanViaUi / openHudPanel / completeProjectsViaGameClock 등 진행 헬퍼
  e2e/*.spec.js           브라우저 회귀(HUD·퀘스트·연구·기후·건설·카메라·모바일·시각·성능)
  e2e/unit/*.spec.js      DOM 없이 src 모듈을 직접 import하는 순수 테스트(규칙·저장 마이그레이션·빌드 산출물)
```

- Playwright(`game-qa` 스킬 컨벤션). `window.render_game_to_text()`와 `window.advanceTime(ms)`를 노출한다.
- `playwright.config.js`는 `workers: 1`이다. 보드가 WebGL이라 브라우저를 둘만 겹쳐도 GPU 작업이 로딩·
  모션 타이머를 막아 전체가 타임아웃될 수 있다. `PW_PORT`로 dev 서버 포트를 바꿀 수 있다(기본 3000).
- 시각 회귀는 WebGL 안티앨리어싱·GPU 편차를 고려해 픽셀 허용치(`maxDiffPixels: 3000`)를 쓴다.
- 성능 계약: WebGL context 1개, 최악의 경우 draw-call 예산 49(ADR-0003), HUD 30회 전환 동안 WebGL
  buffer 생성/삭제 0/0, 유휴 시 draw 0.

## 3D 보드 테스트 훅

`src/main.js`와 `CityScene3D.js`가 `window.__*`로 노출한다. 정상 플레이 경로에서는 아무도 부르지 않는다.

- `__clickCell(index)` — 레이캐스팅 없이 칸 클릭을 시뮬레이션(카메라 각도 변화에 안전).
  좌표 기반 실제 레이캐스팅은 `__getCellScreenPosition(index)`을 쓰는 별도 테스트에서만 검증한다.
- `__getCellVisual(index)` / `__getHexCell(index)` / `__getCityLevelVisuals()` — 렌더 중인 칸의 시각 상태.
- `__getCityRendererStats()` / `__getCityAssetStatus()` — draw call·geometry·resource revision·고스트·
  생활 객체 수, GLB 로드/폴백 상태.
- `__getCityCameraState()` / `__resetCityCamera()` / `__setCityCameraOrbitForTest()` — 카메라.
- `__settleSimulationDay()` / `__getSimulationState()` / `__setTimeScale(scale)` — 하루 결정 정산과 타이머.
- `__refreshGameForTest()` / `__renderCityForTest()` / `__setBuildPreviewForTest()` — 강제 리렌더.
- `__getWorldHudState()` / `__getModalState()` / `__getOnboardingState()` / `__getTheme()` /
  `__getWorldLightingMode()` / `__getAudioState()` — UI 상태 진단.
- `__triggerBirdVisitForTest()` / `__finishBirdVisitForTest()` / `__triggerFacilityAmbientForTest()` /
  `__finishFacilityAmbientForTest()` — ambient 연출 강제 시작/종료.
- `__setWorldHourForTest(hour)` / `__openStoryForTest()` / `__renderCityConfigsForTest()` — 조명·온보딩·
  대표 도시 배치를 직접 세팅.
- `__disposeCitySceneForTest()` — 해제 경로 누수 회귀 전용.
- `__GAME_STATE__` / `__EVENT_BUS__` / `__EVENTS__` — 상태와 이벤트 버스 직접 접근.

## 에셋

- 파이프라인: `assets:fetch`(원본 아카이브 다운로드) → `assets:select`(선별) → `assets:optimize`(meshopt)
  → `assets:audit`(경로·예산 검사). 원본 아카이브 `assets-source/archives/`는 git에 추적하지 않는다
  (`assets-source/MANUAL_DOWNLOADS.md` 참고).
- 배포 대상은 `public/assets/`뿐이며 라이선스는 `public/assets/licenses/ASSET_LICENSES.md`에 기록한다.
- 시설은 레벨마다 실제로 다른 GLB를 쓸 수 있다. 타입당 대표 InstancedMesh 하나를 유지하고, 레벨 에셋이
  1레벨과 다를 때만 `${type}:${level}` 보조 메시를 지연 생성한다(ADR-0003).

## 배포

- 아직 범위 밖이다. 필요해지면 `game-deploy` 스킬로 별도 진행한다.
