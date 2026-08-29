# AI City 전체화면 월드 HUD 재설계

- 날짜: 2026-08-29
- 상태: 사용자 승인 설계
- 대상: `AI_City_Webgame_V3`

## 목표

3D 도시를 레이아웃 안의 한 패널이 아니라 게임 화면 전체의 주 무대로 만든다. 평상시에는 도시, 최소 상태 정보, 기능 진입 버튼만 보이고 시설 선택·보좌관·도시 상태·성취·설정은 필요할 때만 HUD drawer 또는 mobile bottom sheet로 연다.

게임 규칙, EventBus/GameState 계약, 단계별 stage modal, 3D 렌더러와 레이캐스팅은 유지한다. 이번 변경의 중심은 DOM 정보 계층과 입력 동선이다.

## 설계 방향

순수 모달형은 도시를 가장 넓게 보여주지만 반복 건설 흐름이 느리고, 모든 항목을 항상 띄우는 방식은 기존 대시보드형 문제를 되풀이한다. 따라서 전체화면 도시 위에 접이식 도구를 얹는 하이브리드 방식을 사용한다.

- 화면 전체: 3D 캔버스.
- 항상 보이는 정보: 얇은 단계/자원 HUD, 우측 도구 레일, 카메라 초기화.
- 필요할 때만 보이는 정보: 건설 팔레트, 시장 보좌관, 도시 상태 차트, 성취·근거, 메뉴.
- stage modal: 위기, 퀴즈, 시설 검사, 보고서 등 기존 진행 모달. HUD drawer보다 항상 높은 우선순위다.

## 데스크톱 레이아웃

```text
┌────────────────────────────── 3D CITY ──────────────────────────────┐
│ [단계 · 자원 HUD]                                  [건설]          │
│                                                     [AI]            │
│                                                     [도시]          │
│                                                     [성취]          │
│                                                     [메뉴]          │
│                                                                      │
│                          전체화면 도시                               │
│                                                                      │
│ [시점 초기화]                [선택 시설] [접이식 건설 팔레트]       │
└──────────────────────────────────────────────────────────────────────┘
```

### 월드와 HUD

- `game-shell`, `left-panel`, `board-stage`, `board-wrap`, `board-grid`는 viewport 전체를 채우는 월드 레이어로 재구성한다.
- 3D canvas는 panel padding/aspect-ratio 제한을 제거하고 `inset: 0`으로 확장한다.
- 단계/자원 HUD는 좌상단의 얇은 반투명 계기판이다. 단계명, 크레딧, 발전, 전력, 탄소, 물, 행동 수를 표시한다. 전체 미션 문장과 교사 안내는 메뉴 안으로 이동한다.
- 도시 배경을 가리는 큰 glass panel은 사용하지 않는다. HUD는 계기판처럼 얇고 각진 형태를 사용한다.

### 우측 도구 레일

우측 중앙에 다음 다섯 버튼을 수직 배치한다.

1. 건설
2. AI 보좌관
3. 도시 상태
4. 성취·근거
5. 메뉴

버튼은 아이콘과 짧은 라벨을 가지며 최소 44px pointer target을 지킨다. 한 번에 하나의 HUD panel만 열린다. 같은 버튼을 다시 누르거나, 패널 밖을 클릭하거나, `Escape`를 누르면 닫힌다.

### 건설 팔레트

- 기본 상태에서는 `건설` 버튼과 현재 선택 시설을 나타내는 작은 chip만 보인다.
- 열면 화면 하단 중앙에 가로형 floating palette가 나타난다.
- 시설 선택 후에도 팔레트는 유지해 연속 건설을 지원한다.
- 해금 전 시설은 기존처럼 렌더링하지 않고, 편집 불가 단계에서는 버튼을 disabled 처리한다.
- 진단 단계에서는 건설 진입 버튼을 숨기고 같은 위치에 `스캔/힌트` 컨텍스트 버튼을 표시한다.

### AI 보좌관

- 우측 drawer로 연다.
- 기존 대화 로그, 프롬프트 chip, `AI 말대로 짓기`를 그대로 포함한다.
- 새 답변이 도착하면 레일 버튼에 짧은 notification pulse를 표시하되 패널을 강제로 열지 않는다.

### 도시 상태

- 우측 하단에 열리는 반투명 floating instrument panel이다.
- 항상 보이는 자원 HUD보다 상세한 chart와 모델 지표를 표시한다.
- 도시 조작을 막지 않도록 backdrop을 만들지 않고, panel 외부의 canvas는 계속 드래그할 수 있다.
- panel을 열거나 viewport가 변하면 Chart.js resize를 요청한다.

### 성취·근거

- 한 drawer 안에서 `성취`와 `근거` 두 탭을 제공한다.
- 근거 탭은 재설계 단계 전에는 잠금 상태와 해금 조건을 보여준다.
- 기존 시설 검사 모달의 근거 작성 흐름은 유지하며 이 drawer는 기록 조회만 담당한다.

### 메뉴

기존 `top-actions`와 `main-buttons`를 하나의 command drawer에 통합한다.

- 현재 미션과 교사 안내
- `AI 조언`
- 단계 진행 primary action
- 도움말
- 배경음 toggle
- 효과음 toggle
- 게임 초기화

단계 진행 버튼은 기존 활성화 조건과 label을 그대로 사용한다. 메뉴 버튼에는 진행 가능 상태를 알리는 작은 accent dot을 표시해 핵심 행동이 숨겨졌다는 문제를 완화한다.

## 모바일 레이아웃

- viewport 전체를 3D canvas로 사용한다.
- 하단 safe area 위에 5칸 고정 bar를 둔다: `건설 · AI · 도시 · 성취 · 메뉴`.
- 각 기능은 화면 높이의 최대 56%인 bottom sheet로 열린다.
- bottom sheet 위쪽 drag handle과 닫기 버튼을 제공하고, 같은 탭 재선택/바깥 탭/Escape로 닫는다.
- 건설 팔레트는 가로 스크롤, AI는 대화 중심, 도시는 압축 chart, 성취는 탭, 메뉴는 미션/진행/설정 순서로 구성한다.
- sheet가 열려도 뒤 도시를 일부 볼 수 있고, 닫으면 canvas가 즉시 전체 입력을 받는다.
- 모바일 자원 HUD는 숫자 5개를 모두 펼치지 않고 핵심 3개를 우선 표시한다. 숨겨진 지표는 도시 sheet에서 확인한다.

## 시각 언어

기존 교육용 sci-fi 도시 정체성을 유지한다.

- `Night Asphalt #06101d`: 월드와 panel 바탕.
- `Instrument Navy #0b182a`: drawer/sheet.
- `Signal Cyan #54e4ff`: 선택, 조작, 발전.
- `Grid Mint #71f5b4`: 성공, 지속가능성.
- `Caution Amber #ffd166`: 진행 가능, 주의.
- `Conflict Coral #ff6b7a`: 오류, 갈등, 위험.

큰 둥근 glass card의 반복 대신 얇은 선, 절제된 10–14px radius, 계기판 notch/rail 형태를 사용한다. 기억에 남는 요소는 도시 우측의 세로형 `CITY CONTROL` rail이다. backdrop blur는 drawer에만 제한하고 canvas 위 HUD는 반투명 solid fill을 사용해 GPU/compositing 비용을 억제한다.

외부 web font는 추가하지 않는다. 기존 Pretendard/Noto/system stack을 유지하되 미션과 숫자 HUD의 weight·letter spacing으로 역할을 분리한다.

## 컴포넌트와 상태

새 `WorldHud.js`가 panel shell과 상호배제 상태를 담당한다.

- `openPanel(name)`: build/advisor/status/achievements/menu 중 하나를 연다.
- `closePanel()`: 현재 panel을 닫는다.
- `togglePanel(name)`: 같은 panel이면 닫고 다르면 교체한다.
- `syncStage()`: 진단/재설계 단계에 맞춰 건설·근거 진입 상태를 갱신한다.

콘텐츠 렌더링은 기존 `DockView`, `PanelViews`, `HudView`, `ChartView`가 계속 담당한다. 모듈 간 직접 상태 공유를 새로 만들지 않고, stage 변화는 기존 EventBus를 사용한다.

`Modal.js`의 전역 stage modal은 `WorldHud`와 분리한다. stage modal이 열리면 HUD panel은 닫고 레일 입력을 일시적으로 비활성화한다. modal이 닫히면 레일만 복구하며 이전 drawer를 자동 재개하지 않는다.

## 접근성과 입력

- 모든 rail/bar 버튼에 `aria-label`, `aria-expanded`, `aria-controls`를 제공한다.
- drawer/sheet는 의미 있는 heading과 닫기 버튼을 가진다.
- panel이 열릴 때 첫 heading 또는 첫 action으로 focus를 옮기고, 닫을 때 opener로 focus를 돌린다.
- `Escape`는 HUD panel을 먼저 닫고, stage modal이 열려 있으면 기존 modal 동작을 우선한다.
- `prefers-reduced-motion`에서는 drawer 이동과 notification pulse를 제거한다.
- canvas drag 중 HUD 버튼이 오작동하지 않도록 panel/rail 영역만 pointer event를 받고 나머지 overlay는 통과시킨다.

## 반응형 기준

- `> 760px`: 우측 rail + 우측 drawer/하단 건설 palette.
- `≤ 760px`: 하단 bar + bottom sheet.
- 매우 낮은 desktop viewport에서는 drawer 내부만 scroll되며 canvas 크기를 줄이지 않는다.
- safe area inset을 하단 bar와 sheet padding에 반영한다.

## 테스트와 완료 조건

### 기능 회귀

- 기존 단계 1→6 플레이스루, 배치, 업그레이드, 철거, 진단, 근거, 자동 저장을 유지한다.
- 기존 DOM id는 가능한 한 유지해 게임 로직 연결을 보존한다.

### HUD 테스트

- 초기 화면에서 canvas가 viewport 대부분을 차지하고 고정 좌우 panel이 없다.
- 한 번에 HUD panel 하나만 열린다.
- 건설/AI/도시/성취/메뉴가 각각 올바른 panel을 연다.
- 메뉴 안에서 도움말, 음향, AI 조언, 단계 진행, 초기화가 동작한다.
- `Escape`, 바깥 클릭, 동일 버튼 재클릭이 panel을 닫는다.
- stage modal을 열면 HUD panel이 닫힌다.

### 모바일 테스트

- 하단 bar가 safe area 안에 있고 각 target이 44px 이상이다.
- bottom sheet 높이는 viewport 56% 이하이고 canvas가 viewport 밖으로 넘치지 않는다.
- sheet를 닫은 뒤 touch drag가 다시 카메라를 회전한다.

### 시각/성능

- 데스크톱 기본, 건설 palette, 도시 상태 float, 메뉴 drawer, 모바일 기본/bottom sheet snapshot을 갱신한다.
- 전체화면 전환 뒤에도 WebGL context 1개, 6×6 도시 24 draw calls 이하, 30회 HUD toggle 뒤 WebGL buffer churn 0/0을 유지한다.

## 범위 밖

- 게임 규칙과 교육 콘텐츠 변경.
- 3D 에셋/카메라/시설 모션 재설계.
- 배포와 Play.fun 연동.
- HUD panel drag-resize 또는 사용자별 위치 저장.
