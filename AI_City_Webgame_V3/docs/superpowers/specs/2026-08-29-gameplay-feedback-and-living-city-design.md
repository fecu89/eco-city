# 게임플레이 피드백·살아있는 도시 설계

## 목표

전체 화면 도시 HUD 위에서 건설 모드의 규칙을 명확히 하고, 진행/성취 피드백과 살아있는 도시 ambient를 추가하며, 다크/라이트 색상 스키마를 제공한다. 기존 게임 단계·점수·저장·3D 성능 계약은 유지한다.

## 결정

### 건설 모드

- `buildPanel`이 열려 있는 상태만 건설 모드다. 시설 선택은 패널을 닫지 않는다.
- 빈 대지 클릭은 건설 모드에서만 `placeFacility`로 전달한다. 패널이 닫혀 있으면 선택만 표시하지 않고 “건설 메뉴를 먼저 여세요” 안내를 1회 표시한다.
- 기존 건축물 클릭은 건설 패널 여부와 무관하게 검사 모달을 연다. 검사 모달 때문에 건설 패널이 잠시 닫혔다면 모달 종료 후 건설 패널을 복원한다.

### 진행 준비 알림

- `HudView`가 진행 버튼의 `disabled → enabled` 전환을 감지해 `STAGE_READY`를 한 번 발행한다.
- 화면 토스트와 메뉴 버튼의 unread 점을 함께 표시한다. 메뉴를 열면 unread가 해제된다.
- 첫 렌더나 저장 게임 복원은 새로 조건을 달성한 순간이 아니므로 알림을 발행하지 않는다.

### AI 기능 정리

- 메뉴의 `AI 조언` 버튼을 제거한다. AI 질문, 프롬프트 칩, AI 자동 건설은 시장 보좌관 패널 하나에서만 제공한다.
- 메뉴는 미션/진행/도움말/오디오/테마/초기화에 집중한다.

### 살아있는 도시

- 에너지 생산 시설(`thermal`, `nuclear`, `solar`, `wind`)과 인접 수요 시설(`residential`, `factory`, `data`, `cooling`, `battery`) 사이에는 공유 `LineSegments` 전력선만 표시한다. 이동 패킷 객체는 만들지 않는다.
- 전력선은 평소 희미하게 유지하고 5초마다 180ms 동안 한 번만 밝힌다. 점멸 한 번은 밝힘/복원 최대 2프레임만 제출한다.
- 주거지마다 보행자 1명과 소형 차량 1대, 녹지마다 새 2마리를 하나의 공유 `InstancedMesh`에 정적 소품으로 배치한다.
- 정착 도시에는 연속 ambient 렌더가 없다. 통계 훅에 `energyLinkCount`, `energyPacketCount(항상 0)`, `energyBlinkCount`, `residentAgentCount`, `birdCount`를 노출한다.

### 색상 스키마

- 첫 실행은 기존 게임 인상을 보존하는 다크 모드이며, 사용자가 메뉴에서 다크/라이트를 직접 선택하면 `localStorage`에 저장한다.
- CSS semantic token(`--bg`, `--surface`, `--panel`, `--text`, `--muted`, `--line`, `--accent`)과 Three.js 월드 색(`clear`, `ground`, `tile`, 조명)을 같은 테마 id로 묶는다.
- 테마 변경은 `THEME_CHANGED` 이벤트로 3D 재질과 CSS를 동시에 갱신하며 WebGL context나 geometry를 다시 만들지 않는다.

### 성취 피드백

- 기존 `BADGE_UNLOCKED` 이벤트마다 중앙 상단 성취 배너, 짧은 radial particle burst, 효과음, 토스트를 표시한다.
- 레일/모바일의 성취 버튼에 unread 점과 pulse를 표시하고 성취 패널을 열면 해제한다.
- reduced-motion에서는 particle 이동을 없애고 배너 fade만 사용한다.

## 검증

- 건설 패널 닫힘/열림, 모달 뒤 복원, 단계 준비 1회 알림, AI 버튼 단일 소유권.
- 테마 전환·저장·3D 테마 동기화.
- 에너지 링크/생활 agent 개수, 5초 점멸, 정착 도시의 비연속 렌더, 대표 6×6 draw call 예산.
- 성취 배너/unread/해제와 reduced-motion.
- 데스크톱·모바일 다크 스냅샷과 라이트 생활 도시·성취 해금 스냅샷, 빌드, 55개 기존 회귀를 포함한 전체 무재시도 실행.
