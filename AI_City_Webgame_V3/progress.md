# Progress Log — AI 시티를 구하라!

## 원본 요청

> "지금 AI_City_Webgame_V3에 웹앱을 만들어놨어. game creator의 하네스를 보고, 이 게임을 완성시켜줘. 웹 앱의 형태였으면 해."
> (이후) "다 해줘. 그리고 단계를 6단계까지 늘렸으면 해. 교육과 함께 게임성도 추가해줘. 우리의 원래 계획도 첨부해봐. 이 게임이 우리의 계획과 적합한지, 충분히 교육적인지도 봐줘."
> (이후 정정) "여기서는 발표까지 구현하는게 아니라 수업중에 이용할 게임 그 자체를 개발하는게 목표야. 6번은 게임에서 빠지는거임. 게임성을 더 추가하자는거지."

배경: 통합과학 교사(변석환, 신장고)가 실제 4차시 수업(성취기준 10통과2-02-05/06, 10통과2-03-03/04)에 쓸 목적으로 만든 교육용 시뮬레이션. 지도안 PDF 2개(`docs/lesson-plan-source.md`, `docs/common-framework-source.md`) 참고.

## 세션 결정 사항

- 빌드 도구: **Vite로 전환** (CDN 제거, npm 번들링)
- AI 어드바이저: **결정형(규칙 기반) 유지**, 실시간 LLM API 연동 없음
- 배포: **이번 세션은 범위 밖** (로컬 완성까지)
- 범위: **게임 내 플레이(1~5단계 + 선택적 6단계 보너스)만 구현**. 지도안 4차시(발표+투표+헌장)는 오프라인 교실 활동 — 게임에 넣지 않음
- 승인된 하드닝 항목 7개 전체 반영 (재시작/터치타겟/자동저장/오디오/퀴즈확장/완성도/교사용 리포트) — 자세한 내용은 `docs/gameplan.md`

## 원본 프로토타입

`_legacy-v3/`에 원본 3개 파일(index.html/script.js/style.css) 백업 보존. 게임플레이 설계(4단계, 10개 시설, 인접 시너지, 8개 배지)는 이미 완성도 높았고 그대로 승계 — 문제는 하네스 아키텍처 부재(EventBus/GameState/Constants/테스트 전무)였음.

## TODO (구현 순서) — 전부 완료

- [x] 지도안/공통틀 원문 보관 + gameplan.md/tech.md/ADR 작성
- [x] Vite 스캐폴딩 (package.json, vite.config.js, npm 의존성 설치 — three/animejs@3.2.2/chart.js/lucide)
- [x] core/ (Constants.js, EventBus.js, GameState.js) — 기존 데이터 이식 + 신규 스테이지/에너지비교/대화록 필드
- [x] systems/ (Board/Achievement/Advisor/Stage/Crisis/Concepts/Diagnosis/Redesign/Report/Save)
- [x] ui/ (Grid/Dock/Panels/Modal/StageModals/Toast/Chart/ThreeBackground/DiagnosisView/MobileNav/FeedbackBridge)
- [x] audio/ (SFX 7종 세분화 + 선택적 배경음 토글)
- [x] main.js 오케스트레이터 + render_game_to_text + advanceTime
- [x] index.html/style.css 신규 UI(진단 스캐너, 에너지 저울, AI 말대로 짓기, 보너스 라운드) 반영
- [x] Playwright QA 스위트 (tests/e2e/game·visual·perf·mobile.spec.js, 19개 테스트)
- [x] npm run build / test 검증 + Playwright로 전체 플레이스루 확인 (1→6단계, 리셋 3회, 새로고침 자동복구)
- [x] 최종 리포트

## 검증 중 발견하고 고친 버그

- **토스트 무한루프 (심각)**: 토스트 개수 제한(`MAX_VISIBLE_TOASTS`) 로직이 애니메이션(비동기)으로 오래된 토스트를 제거하려 해서, 토스트가 빠르게 3개 이상 쌓이면 `while` 루프가 끝나지 않고 렌더러가 멈춤(Playwright "Target crashed"로 확인). 힌트 버튼을 빠르게 여러 번 누르면 실제로 재현됨 — 학생이 버튼을 연타하는 흔한 상황이라 실사용에서도 발생했을 것. `src/ui/ToastView.js`에서 초과분을 동기적으로 즉시 제거하도록 수정. `tests/e2e/game.spec.js`의 "does not crash on rapid toasts"가 회귀 테스트.
- 진단 힌트 버튼이 힌트 소진 후에도 계속 클릭 가능해 "더 이상 힌트가 없습니다" 토스트가 반복 발생 — 힌트 소진 시 버튼을 disabled 처리하도록 수정.
- 배지가 8→9개로 늘었는데 배지 그리드가 4×2(8칸)로 고정돼 9번째가 잘릴 수 있었음 — 3×3 그리드로 수정.
- **lucide 아이콘 전체가 안 보이던 버그 (2차 피드백)**: `createIcons({icons: ICONS})`에 kebab-case 키(`'circle-help'`)를 넣었는데, lucide 내부의 `replaceElement()`는 `data-lucide` 값을 PascalCase로 변환(`toPascalCase("circle-help") → "CircleHelp"`)해서 `icons[ComponentName]`으로 찾는다. 키가 안 맞아 전부 `undefined` → `console.warn`만 뜨고(에러 아님) 아이콘이 조용히 안 보이는 상태가 됨. "콘솔 에러 없음" 테스트로는 못 잡아서 별도로 lucide 관련 `console.warn`을 감시하는 회귀 테스트를 추가함. **키는 반드시 PascalCase.**
- **토스트 카운트 제한의 while 루프 재발 + 로딩 화면 CSS 트랜지션 타이밍**: 3D 보드 테스트 중 발견. `#loadingScreen.done`은 `opacity`/`visibility`를 `transition:.4s`로 바꾸는데, `visibility: hidden`으로 가는 트랜지션은 스펙상 **트랜지션이 끝나야** 실제로 hidden이 적용된다. 즉 JS가 `.done` 클래스를 붙인 시점과 화면이 실제로 클릭을 더 이상 가로채지 않는 시점 사이에 ~400ms 간극이 있다. 테스트 픽스처가 이걸 감안 안 해서 레이캐스팅 클릭이 로딩 화면(`#loadingText`)에 막혀 씹히는 것으로 오인될 뻔했음 — 실제 앱 버그는 아니고 테스트 픽스처(`tests/fixtures/game-test.js`)의 대기 시간을 늘려 해결. 사람이 쓸 땐 로딩 애니메이션 자체가 짧아 체감되지 않는 수준.

## 2차 피드백 (사용자가 직접 플레이 후) — 전부 반영

- 우상단 아이콘 안 보임 → 위 lucide 버그 수정
- 데이터센터 설명 텍스트가 잘 안 보임 → 독(dock) 설명 텍스트 제거, 대신 독에서 시설 선택 시 보드 위에 **인접 보너스(초록)/갈등(빨강) 구역을 실시간 미리보기**로 표시 (`BoardSystem.placementPreview`, 전 시설 공통)
- 인접관계가 +만 있고 -가 없음 → 원전-주거지(불안), 데이터센터-주거지(소음·발열), 화력·공장-녹지(환경 훼손) 갈등 규칙 3종 신규 추가 (`getCellSpatial`/`calcMetrics`), SSI(과학기술 사회적 쟁점) 성취기준과도 연결됨
- 근거 입력 칸이 너무 작음 → 사이드바 폼 제거, 시설 검사 모달에 "근거 기록" 버튼 추가해 넓은 전용 모달(`openEvidenceEntryModal`)로 이동
- 도시를 3D로 보고 싶음 → **보드 전체를 Three.js 3D 씬으로 교체** (`src/ui/CityScene3D.js`). 레이캐스팅으로 클릭을 칸 인덱스로 환산, OrbitControls로 드래그 회전/휠 줌(기본은 보기 좋은 고정 각도, 회전은 선택사항 — 모바일에서 필수 제스처 아님). 일반 보드(`GridView`)와 진단 스캐너(`DiagnosisView`) 둘 다 같은 3D 씬을 공유하며 클릭 핸들러만 바꿔 낀다.
- "사각형만 올리면 어떡해"(3차 피드백) → 처음엔 시설 색상만 다른 단순 박스였는데, 시설 타입별로 **기본 도형을 조합한 실루엣**으로 교체(`BUILDING_FACTORIES` in `CityScene3D.js`): 주거지=집(박스+지붕), 공장=몸체+굴뚝 2개, 데이터센터=박스+발광 안테나 4개, 화력=박스+높은 굴뚝+붉은 불빛, 원전=냉각탑 실루엣(테이퍼 원기둥)+돔, 태양광=기울어진 패널, 풍력=타워+**실제로 도는 날개**, 에너지저장=배터리 모양, 순환냉각=탱크+물방울, 녹지=미니 나무 3그루 군집. 레벨(1~3)은 부위 비율을 유지한 채 전체 크기만 키운다. 외부 3D 모델(GLB) 대신 기본 도형 조합을 쓴 이유: 학교 네트워크 의존성 없음, 번들 크기 유지, 라이선스 이슈 없음, 스타일 일관성.

## 4차 피드백 — 3D 조작·객체·성능 전면 개선

원본 요청: “3D 화면은 이동이 안 돼 드래그조차 안 됨”, “성능이 너무 떨어짐”, “assets/city-kit을 보고 레벨별로 색상을 다르게”. 사용자가 제안안 전체 적용과 막히는 부분의 권장안 선택을 승인함.

- [x] `CameraController` 분리: 마우스 드래그 회전, 우클릭 팬, 휠 줌, 터치 1손 회전/2손 이동·확대, 보드별 거리·극각·팬 경계, 44px 초기화 버튼.
- [x] `public/assets/city-kit`에 시설 주 모델 10개+보조 2개+texture/license 선별(18파일, 약 1.6MB). 비동기 GLB 정규화·캐시와 시설별 절차형 폴백 추가.
- [x] 레벨 시각 언어 확정: Lv.1 회색/0.86배/1 segment, Lv.2 파랑/1배/2 segments, Lv.3 주황/1.13배/3 segments. 빨강은 경고 전용.
- [x] 셀별 Mesh 재생성을 영구 `InstancedMesh` 레이어로 교체. 타일 레이캐스팅은 단일 instanced tile의 `instanceId`를 사용.
- [x] 배치 480ms, 업그레이드 520ms, 철거 320ms 전환. 풍력 rotor와 데이터센터·화력·냉각 particles는 30fps 공유 레이어.
- [x] 거대한 원형 상태 링을 코너 브래킷으로 교체해 객체 가독성 개선. 모바일 보드가 viewport 밖으로 넘치던 CSS 폭 버그도 회귀 테스트와 함께 수정.
- [x] 장식용 두 번째 Three.js/WebGL/RAF 제거 → CSS 배경. DPR 상한(데스크톱 1.5/모바일 1.25), GPU buffer prewarm, dirty rendering 적용.
- [x] QA를 44개로 확장: 카메라/에셋/모션/단일 context/24 draw-call 예산/0 buffer churn/idle draw/mobile touch/6종 visual snapshot.

### 최종 성능 실측 (1440×900, Chromium, DPR 2 입력)

- 6×6 혼합 도시 36시설: **21 draw calls** (예산 24), 실제 pixel ratio 1.5.
- WebGL context: **2 → 1**.
- warm-up 뒤 30회 UI redraw: WebGL buffer create/delete **0 / 0** (개선 전 같은 유형 측정 360 / 360).
- 빈 도시 안정 상태 500ms: 추가 WebGL render **0회**.
- 빌드 산출물 JS: 약 941KB, gzip 약 270KB. City Kit 정적 에셋은 별도 약 1.6MB이며 로딩 실패 시 게임을 막지 않고 폴백한다.

## 알아둘 것 (gotcha)

- 뇌 에너지(20W)는 출처 일치, AI 쪽 수치는 출처마다 10배 차이 — 게임 안에서 "출처 확인" 메시지로 활용 (수치 그대로 단정하지 않음). 출처는 gameplan.md 3단계 섹션 참고.
- "진짜 시장" 명칭은 게임에서 쓰지 않음 — 실제 교실 투표와 이름이 겹치면 혼란. 최종 등급 최상위 타이틀은 "그린시티 마스터".
- 6단계는 선택적 보너스일 뿐, 필수 진행 단계 아님 (3차시 40분 시간표 보호).
- lucide 아이콘은 전체 세트가 아니라 실제 사용하는 27개만 `src/ui/Modal.js`의 `ICONS` 맵에 등록(트리쉐이킹). 새 아이콘을 `data-lucide="..."`로 추가하면 **PascalCase 키**로 이 맵에도 추가해야 함(`circle-help`가 아니라 `CircleHelp`) — kebab-case로 넣으면 에러 없이 조용히 안 보인다.
- 번들 크기가 약 941KB(gzip 270KB)로 Vite 경고 임계값(500KB)을 넘음 — 대부분 three.js/GLTFLoader. City Kit GLB는 JS 번들 밖의 정적 파일이다. 실사용(학교 1회 로딩)에는 문제없다고 판단해 코드 스플리팅은 하지 않음. 필요해지면 그때 처리.
- **보드는 이제 DOM이 아니라 Three.js 캔버스 하나다.** `#cityGrid`에는 `.city-cell`/`.diagnosis-cell` 버튼이 더 이상 없다 — 대신 `window.__clickCell(index)`(칸 클릭 시뮬레이션)와 `window.__getCellVisual(index)`(현재 시각 상태 읽기: selected/previewGood/previewBad/diagnosisState 등)를 테스트 훅으로 노출한다. 테스트는 이 훅을 쓰고, 실제 레이캐스팅 자체는 `game.spec.js`의 좌표 클릭 테스트 한 개로만 검증한다(카메라 각도가 바뀌면 좌표 테스트만 다시 손보면 됨).
- **정리 후보(기능엔 영향 없음)**: `style.css`의 `.city-cell`/일부 옛 진단 DOM 규칙은 3D 보드 전환 뒤 더 이상 사용되지 않는다. 이번 범위에서는 관련 없는 스타일 삭제로 회귀를 만들지 않기 위해 유지했다.
- 로컬 `npm run dev`(포트 3000)가 이 세션에서 백그라운드로 계속 켜져 있음 — 새 터미널에서 이어서 확인 가능, 끄려면 `pkill -f vite` 또는 해당 프로세스 종료.
- 다음 세션에서 이어갈 것: 배포(`/game-deploy` 또는 `/monetize-game`), 콘텐츠 확장(퀴즈 문항 추가 등)은 아직 요청받지 않음.
