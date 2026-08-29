# 기술 스택

## 엔진/빌드
- **바닐라 JS + Vite** (Phaser 풀 게임엔진 아님). 이유: 이 게임은 UI 기반 시뮬레이션(패널, 모달, 차트)이다. `game-architecture` 스킬의 원칙(EventBus/GameState/Constants/오케스트레이터/디렉터리 분리)은 엔진 중립적이라 그대로 적용.
- **보드(그리드)는 Three.js 영구 인스턴스 씬으로 렌더링** (`src/ui/CityScene3D.js`) — [ADR-0003](./architectural-decisions/0003-city-kit-instanced-renderer.md) 참고. 배경 장식(`ThreeBackground.js`)은 WebGL이 아닌 CSS 레이어다.
- npm 의존성으로 번들링 (CDN 제거): `three`(+ `three/examples/jsm/controls/OrbitControls.js`), `animejs`, `chart.js`, `lucide`. 이유: 학교 네트워크의 외부 CDN 차단 리스크 제거 + 하네스 표준 dev/build/test 파이프라인 사용.

## 디렉터리 구조

```
src/
  main.js                 오케스트레이터: render_game_to_text, advanceTime, 부트
  core/
    EventBus.js
    GameState.js          stage(1-6), grid, credits, badges, evidence, transcripts, reflections
    Constants.js          FACILITIES, BADGES, QUIZ_BANK, ENERGY_COMPARISON, PARTNER_RULES, STAGE_INFO
  systems/
    CameraController.js    제한된 OrbitControls(마우스/터치 회전·팬·줌, 결정적 초기화)
    BoardSystem.js        배치/업그레이드/철거, 인접·시너지·갈등 계산(calcMetrics), 배치 미리보기(placementPreview)
    AdvisorSystem.js       어드바이저 응답 + 대화록 기록 (stage1/stage5)
    StageSystem.js          단계 전환 + STAGE_CHANGED 이벤트 발행
    CrisisSystem.js/ConceptsSystem.js/DiagnosisSystem.js/RedesignSystem.js/ReportSystem.js
    AchievementSystem.js    배지 잠금해제 (이벤트 구독)
    SaveSystem.js            localStorage 자동저장/복구
  ui/
    CityScene3D.js         InstancedMesh 3D 보드 + 레이캐스팅 + 상태/ambient 모션
    GridView.js, DiagnosisView.js, DockView.js, PanelViews.js, HudView.js,
    Modal.js, StageModals.js, ToastView.js, ChartView.js, ThreeBackground.js,
    MobileNav.js, FeedbackBridge.js
  audio/
    AudioManager.js, sfx.js, bgm.js
  level/
    CityAssetLoader.js     City Kit GLB/texture 비동기 로더, 캐시, 오류 격리
    FacilityGeometryFactory.js  GLB 실패 시 타입별 절차형 geometry 폴백
tests/
  fixtures/game-test.js   로딩 화면 완전히 사라질 때까지 대기(CSS 트랜지션 포함)
  helpers/playthrough.js  clickCell() 등 — window.__clickCell(index)로 3D 레이캐스팅 우회
  e2e/game·camera·assets·motion·visual·perf·mobile.spec.js  (44 테스트)
```

## 3D 렌더링/에셋

- 정적 파일: `public/assets/city-kit/` 18개 파일, 약 1.6MB. Kenney City Kit Industrial(CC0) 라이선스는 같은 폴더의 `License.txt`에 보존.
- 레이어: 타일 1개 + 시설 타입별 10개 + 보조 모델 2개 + 레벨/상태/풍력 공유 레이어. 셀 상태 변경은 인스턴스 buffer의 matrix/color/count만 갱신한다.
- 레벨 인코딩: Lv.1 회색/작게/1 segment, Lv.2 파랑/기본/2 segments, Lv.3 주황/크게/3 segments. 진단 경고 빨강과 의미가 겹치지 않는다.
- GPU 정책: WebGL context 1개, 데스크톱 DPR≤1.5, 모바일 DPR≤1.25. 빈 도시는 dirty rendering으로 정지하며 풍력/인프라가 있을 때만 30fps 공유 ambient를 갱신한다.

## 3D 보드 테스트 훅
- `window.__clickCell(index)` — 레이캐스팅 없이 칸 클릭을 직접 시뮬레이션 (카메라 각도 변경에 안전).
- `window.__getCellVisual(index)` — 현재 렌더링 중인 칸의 시각 상태(selected/previewGood/previewBad/diagnosisState 등) 조회.
- `window.__getCityCameraState()` / `window.__resetCityCamera()` — 카메라 상태/초기화.
- `window.__getCityAssetStatus()` / `window.__getCityRendererStats()` — GLB 폴백과 draw/resource/motion 진단.
- 레이캐스팅 자체(화면 좌표 → 인덱스)는 `game.spec.js`의 좌표 기반 클릭 테스트 1개로 별도 검증.

## 테스트
- Playwright (`game-qa` 스킬 컨벤션). `window.render_game_to_text()` / `window.advanceTime(ms)` 노출.
- 시각 회귀는 WebGL 안티앨리어싱/GPU 편차를 고려해 픽셀 허용치를 사용한다. 기본·혼합 레벨·회전·진단·모바일 장면을 각각 고정한다.
- `playwright.config.js`의 `workers: 2` — WebGL 씬은 DOM보다 워커당 리소스 비용이 훨씬 커서 기본 병렬도로 돌리면 리소스 경합으로 전체가 타임아웃될 수 있었다.

## 배포
- 이번 세션 범위 밖. 준비되면 `game-deploy` 스킬로 here.now 등에 별도 진행.
