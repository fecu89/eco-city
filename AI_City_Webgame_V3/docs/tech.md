# 기술 스택

## 엔진/빌드
- **바닐라 JS + Vite** (Phaser 풀 게임엔진 아님). 이유: 이 게임은 UI 기반 시뮬레이션(패널, 모달, 차트)이다. `game-architecture` 스킬의 원칙(EventBus/GameState/Constants/오케스트레이터/디렉터리 분리)은 엔진 중립적이라 그대로 적용.
- **보드(그리드)는 Three.js 영구 인스턴스 씬으로 렌더링** (`src/ui/CityScene3D.js`) — [ADR-0003](./architectural-decisions/0003-city-kit-instanced-renderer.md) 참고. 배경 장식(`ThreeBackground.js`)은 WebGL이 아닌 CSS 레이어다.
- **3D 월드는 뷰포트 전체, UI는 고정 HUD 레이어** (`src/ui/WorldHud.js`) — [ADR-0004](./architectural-decisions/0004-fullscreen-world-hud.md) 참고. 현재 퀘스트는 항상 보이고, 건설/AI/도시/성취/메뉴 중 하나만 열리며 중앙 모달이 항상 우선한다.
- **건설 모드·생활 도시·통합 테마·성취 피드백** — [ADR-0005](./architectural-decisions/0005-living-city-feedback-and-themes.md) 참고. 보이는 건설 팔레트가 입력 모드이며 CSS/Three.js 테마와 공유 ambient 레이어가 같은 도시 상태를 표현한다.
- npm 의존성으로 번들링 (CDN 제거): `three`(+ `three/examples/jsm/controls/OrbitControls.js`), `animejs`, `chart.js`, `lucide`. 이유: 학교 네트워크의 외부 CDN 차단 리스크 제거 + 하네스 표준 dev/build/test 파이프라인 사용.

## 디렉터리 구조

```
src/
  main.js                 오케스트레이터: render_game_to_text, advanceTime, 부트
  core/
    EventBus.js
    GameState.js          save v2: 15퀘스트, 시간, 전력 우선순위, 저장 전력, 운영 누계
    QuestDefinitions.js   15개 퀘스트 제목·보상·시설 해금 순서
    Constants.js          시설/경제/전력/기후/모션/ambient/테마 상수
  systems/
    CameraController.js   제한된 OrbitControls(마우스/터치 회전·팬·줌, 결정적 초기화)
    BoardSystem.js        배치/업그레이드/철거, 인접·시너지·갈등 계산(calcMetrics), 배치 미리보기(placementPreview)
    ClimateSystem.js      시간대·태양광·풍력·폭염 수요 계산
    PowerNetworkSystem.js 거리 손실·우선순위·3×3 저장 허브·저탄소 전력 배분
    EconomySystem.js      노동·수익·유지비·과밀·건강·기후복구 비용
    SimulationSystem.js   5초=1시간 단일 타이머와 중첩 일시정지
    QuestSystem.js        조건 평가·연속시간·보상·해금·내부 장면 연결
    QuizSystem.js         레벨 5/8/15 결정적 퀴즈 세션
    AmbientBirdSystem.js  10~30초 무작위 단일 새 무리 방문 스케줄러
    DiagnosisSystem.js    탄소·냉각·송전 위험 3곳 진단
    ReportSystem.js       15퀘스트 운영 성적표
    AchievementSystem.js 성취 잠금해제 (이벤트 구독)
    SaveSystem.js         localStorage v1→v2 마이그레이션·자동저장
  ui/
    CityScene3D.js         InstancedMesh 3D 보드 + 레이캐스팅 + 시간대/전력선/새 풀
    GridView.js, DiagnosisView.js, DockView.js, PanelViews.js, HudView.js,
    QuestView.js, SimulationHudView.js, Modal.js, StageModals.js, ToastView.js,
    AchievementCelebration.js, ThemeManager.js,
    ChartView.js, ThreeBackground.js,
    WorldHud.js             데스크톱 rail/drawer·모바일 하단 시트·포커스·모달 우선순위
    FeedbackBridge.js
  audio/
    AudioManager.js, sfx.js, bgm.js
  level/
    CityAssetLoader.js     City Kit GLB/texture 비동기 로더, 캐시, 오류 격리
    FacilityGeometryFactory.js  GLB 실패 시 타입별 절차형 geometry 폴백
tests/
  fixtures/game-test.js   로딩 화면 완전히 사라질 때까지 대기(CSS 트랜지션 포함)
  helpers/playthrough.js  clickCell() 등 — window.__clickCell(index)로 3D 레이캐스팅 우회
  e2e/game·camera·assets·motion·hud·quest-ui·visual·perf·mobile.spec.js
  e2e/unit/               기후·전력망·경제·퀘스트·퀴즈·저장·시뮬레이션 순수 테스트
```

## 15퀘스트 운영 시뮬레이션

- 실시간 5초가 게임 1시간이다. 중앙 모달이나 숨겨진 탭에서는 타이머를 일시정지하고 오프라인 시간은 따라잡지 않는다.
- 직송 효율은 인접 100%에서 한 칸 멀어질 때마다 6% 감소하며 최소 55%다. 저장장치는 중간 허브가 되어 주변 8방향 소비 시설에 95% 효율로 전달하고, Lv.1/2/3 용량은 20/35/50E, 처리량은 8/12/16E다.
- 전력은 필수→일반→절약 우선순위로 배분한다. 주거 노동인구와 공장·데이터센터 일자리 비율이 실제 수입을 제한하며, 과밀·오염 인접·탄소 초과에는 시간당 비용이 붙는다.
- 철거 환급은 누적 투자금의 `floor(50%)`다. 돈이 부족한 건설 버튼은 비활성화되고, 퀘스트별 긴급지원은 잔액 1C 이하에서 한 번만 쓸 수 있다.
- 저장 형식은 v2다. 기존 v1의 도시와 크레딧은 보존하면서 퀘스트·우선순위·배터리 필드를 보충하고, 삭제된 과학 근거 데이터는 진행 조건으로 이관하지 않는다.

## 3D 렌더링/에셋

- 정적 파일: `public/assets/city-kit/` 18개 파일, 약 1.6MB. Kenney City Kit Industrial(CC0) 라이선스는 같은 폴더의 `License.txt`에 보존.
- 레이어: 타일 1개 + 시설 타입별 10개 + 보조 모델 2개 + 레벨/상태/풍력 공유 레이어 + 전력선 `LineSegments` 1개 + 정적 주민/차량과 숨겨진 새 3마리 풀. 에너지 패킷과 인프라 `Points` 레이어는 없다. 셀 상태 변경은 기존 buffer의 matrix/color/count만 갱신한다.
- 레벨 인코딩: Lv.1 회색/작게/1 segment, Lv.2 파랑/기본/2 segments, Lv.3 주황/크게/3 segments. 진단 경고 빨강과 의미가 겹치지 않는다.
- GPU 정책: WebGL context 1개, 데스크톱 DPR≤1.5, 모바일 DPR≤1.25. 배치/업그레이드/철거와 2초 새 방문 외에는 dirty rendering으로 정지한다. 실제 정산 전력 경로를 공유 선 버퍼에 덮어쓰고 5초마다 밝힘/복원 최대 2프레임만 제출한다.

## 3D 보드 테스트 훅
- `window.__clickCell(index)` — 레이캐스팅 없이 칸 클릭을 직접 시뮬레이션 (카메라 각도 변경에 안전).
- `window.__getCellVisual(index)` — 현재 렌더링 중인 칸의 시각 상태(selected/previewGood/previewBad/diagnosisState 등) 조회.
- `window.__getCityCameraState()` / `window.__resetCityCamera()` — 카메라 상태/초기화.
- `window.__getCityAssetStatus()` / `window.__getCityRendererStats()` — GLB 폴백, draw/resource/motion, 테마, 에너지 링크·점멸·생활 객체 수 진단.
- `window.__getTheme()` — 현재 다크/라이트 테마 id 진단.
- `window.__getWorldHudState()` — 현재 활성 HUD, 단계 모달 잠금, 모바일 media-query 상태 진단.
- `window.__settleSimulationHour()` / `window.__getSimulationState()` — 한 시간 결정 정산과 타이머 일시정지 상태 진단.
- `window.__triggerBirdVisitForTest()` / `window.__finishBirdVisitForTest()` — 공유 새 풀 방문 시작/종료.
- 레이캐스팅 자체(화면 좌표 → 인덱스)는 `game.spec.js`의 좌표 기반 클릭 테스트 1개로 별도 검증.

## 테스트
- Playwright (`game-qa` 스킬 컨벤션). `window.render_game_to_text()` / `window.advanceTime(ms)` 노출.
- 시각 회귀는 WebGL 안티앨리어싱/GPU 편차를 고려해 픽셀 허용치를 사용한다. 기본·혼합 레벨·회전·진단, 전체 화면 HUD 기본/건설/상태/메뉴/모바일, 라이트 생활 도시, 성취 해금 장면을 각각 고정한다.
- HUD 전환은 고정 레이어에서 이뤄져 캔버스 크기를 바꾸지 않는다. 30회 패널 전환의 WebGL buffer create/delete 0/0을 회귀 테스트로 고정한다.
- 2026-08-30 현재 Playwright 107개가 재시도 없이 통과한다. 20시간 연속 정산 진단에서도 draw call 20, geometry 31, resource revision 2가 그대로 유지됐고 콘솔 오류는 0개였다.
- `playwright.config.js`의 `workers: 2` — WebGL 씬은 DOM보다 워커당 리소스 비용이 훨씬 커서 기본 병렬도로 돌리면 리소스 경합으로 전체가 타임아웃될 수 있었다.

## 배포
- 이번 세션 범위 밖. 준비되면 `game-deploy` 스킬로 here.now 등에 별도 진행.
