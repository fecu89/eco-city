# ADR-0003: City Kit 기반 영구 인스턴스 3D 렌더러

- 상태: 확정 (2026-08-29)
- [ADR-0002](./0002-3d-board-rendering.md)의 절차형 개별 Mesh 렌더러 결정을 대체한다.

## 결정

- `assets/city-kit`의 Kenney City Kit Industrial(CC0) 중 게임 시설에 맞는 주 모델 10개와 보조 모델 2개를 `public/assets/city-kit`에 선별해 제공한다. `CityAssetLoader`가 GLB를 비동기로 로드·정규화하며, 실패한 시설만 절차형 결합 geometry로 대체한다.
- 시설 레벨은 형태만 키우지 않고 세 신호를 중복 사용한다: Lv.1 중립 회색·0.86배·1칸, Lv.2 파랑·1배·2칸, Lv.3 주황·1.13배·3칸. 빨강은 레벨이 아니라 갈등/진단 경고에만 쓴다.
- 셀마다 `Mesh`/material/geometry를 생성·폐기하지 않는다. 타일 1개, 시설 종류별 1개, 보조 모델/레벨/상태 마커 레이어를 수명이 긴 `InstancedMesh`로 만들고 상태 갱신 시 `matrix`, `color`, `count`만 바꾼다.
- 배치(480ms), 업그레이드(520ms), 철거(320ms)는 짧은 상태 전환으로 표현한다. 풍력 로터와 데이터센터·화력·냉각 흐름은 공유 레이어에서 10Hz로 갱신한다(`CITY_AMBIENT_MOTION.FRAME_INTERVAL_MS = 100`).
- 카메라는 OrbitControls의 회전·팬·줌을 모두 허용하되 거리/극각/팬 범위를 보드 크기에 맞춰 제한한다. 데스크톱은 드래그/우클릭/휠, 터치는 한 손가락 회전/두 손가락 이동·확대이며 44px 초기화 버튼을 제공한다.
- 장식 배경의 두 번째 WebGL 씬은 CSS gradient 레이어로 교체한다. 게임은 WebGL context 하나만 쓰고, 빈 도시는 dirty flag가 없으면 draw를 제출하지 않는다. DPR 상한은 데스크톱 1.5, 모바일/coarse pointer 1.25다.

## 근거

- 사용자가 실제 플레이 후 “드래그조차 안 됨”, “성능이 너무 떨어짐”, “3D 객체가 아쉬움”을 지적하고 로컬 City Kit 활용과 레벨별 색상 구분을 요청했다.
- 기존 구현은 화면 갱신마다 셀별 geometry/material을 폐기하고 다시 만들었다. 측정상 시설 5개 상태에서 30회 갱신 시 WebGL buffer 생성/삭제가 각각 360회였고, 장식 배경과 보드가 별도 RAF/WebGL context를 사용했다.
- 최종 측정에서 6×6 혼합 도시(시설 36개)는 21 draw calls, WebGL context 1개다. warm-up 후 30회 갱신의 buffer 생성/삭제는 0/0, 빈 도시 500ms 동안 추가 render는 0회다.

## 테스트 영향

- `camera.spec.js`: 마우스 회전, 결정적 초기화, 44px 컨트롤.
- `assets.spec.js`: 모든 시설의 City Kit/폴백 해석과 레벨 인코딩.
- `motion.spec.js`: 배치·업그레이드·철거 모션 수명과 공유 ambient 레이어.
- `perf.spec.js`: 단일 WebGL context, 24 draw-call 예산, resource revision, 0 buffer churn, idle draw 정지.
- `mobile.spec.js`: viewport 내부 캔버스, 실제 touch drag 회전, 모바일 DPR 상한.
- `visual.spec.js`: 기본/혼합 레벨/회전/진단/모바일 시각 회귀.

## 대안 검토

- **모든 City Kit 모델을 한 씬 graph로 복제**: 구현은 단순하지만 셀 수만큼 draw call과 object 수가 늘어 6×6 보드에 부적합해 기각.
- **모든 시설을 하나의 atlas/merged geometry draw로 통합**: draw call은 더 줄지만 타입별 비동기 폴백, 선택적 보조 모델, 유지보수가 복잡해진다. 현재 21 calls가 예산 24 이하여서 종류별 인스턴싱을 선택했다.
- **모든 모션을 60fps로 계속 렌더링**: 빈 화면에서도 GPU를 계속 사용하므로 기각. 상호작용/전환이 없으면 정지하고 ambient가 있을 때만 10Hz로 렌더링한다.

## 2026-09-02 갱신 — 레벨별 실제 모델 교체와 예산 상향

- 화력·원자력·태양광·순환냉각·데이터센터·에너지저장 6개 시설은 레벨마다 색상/스케일만 바꾸는 대신 실제로 다른 GLB를 쓰도록 바꿨다(`docs/superpowers/plans/2026-08-30-cc0-asset-pipeline.md`가 명시적으로 보류했던 `Map<type:level, InstancedMesh>` 방식). 타입당 메시 하나(`facilityMeshes`)는 그대로 두고, 레벨별 모델이 1레벨과 실제로 다를 때만 `${type}:${level}` 보조 메시를 지연 생성한다(`extraLevelMeshes`) — 안 쓰는 조합은 draw call을 늘리지 않는다.
- 37칸 대표 도시에서 레벨마다 실제 모델을 바꾸는 시설(화력·원자력·태양광·순환냉각·데이터센터, 이후 주거지·조력·풍력 추가, 반대로 에너지저장은 단일 모델로 되돌아감)이 동시에 모든 레벨을 갖는 최악의 경우 실측 33 → 35 → 38 draw calls로 기존 24 예산을 초과해, `perf.spec.js`의 예산을 24 → 36 → 40으로 올렸다. 이 저사양 기준 대신 실제 기기 체감을 우선하기로 사용자와 확인 후 진행했다.

## 2026-09-02 갱신 — 최악의 경우 draw-call 실측과 예산

- 기존 37칸 예산(40)은 공사 기초·비계, 연기·상태등 ambient, 호버 고스트, 계획 고스트가 빠진 값이었다. 이 레이어들이 한 프레임에 동시에 켜지는 실제 최악의 경우를 `perf.spec.js`가 직접 구성해 측정하도록 바꿨다.
- **최악의 경우 시나리오**: 보드 반지름 3(37칸) — 0~32번 칸이 시설 11종 × 레벨 1~3의 조합 전부(레벨마다 실제 GLB가 다른 시설은 조합마다 `${type}:${level}` InstancedMesh를 하나씩 더 쓴다) + 33번 칸 건설 현장(`build`, 기초·비계) + 34번 칸 강화 현장(`upgrade`) + 화력 연기 ambient + 데이터센터 상태등 ambient + 풍력 로터 + 녹지 디테일 + 주민/차량 에이전트 + 선택 마커 + 호버 고스트 + 계획 고스트 + 섬 환경 레이어 전체.
- **실측 47 draw calls**(3회 반복 동일). 예산은 실측 + 2인 **49**로 잡고 `perf.spec.js`의 `WORST_CASE_DRAW_CALL_BUDGET`에 둔다. 예산이 조용히 헐거워지지 않도록 같은 테스트가 각 레이어가 실제로 켜졌는지(`smokeEffectCount`, `statusLightCount`, `ghostVisible`, `planGhostCount` 등) 먼저 확인한다.
- 레이어를 합치는 대안(예: 시설 메시 통합)은 채택하지 않았다. 타입·레벨별 비동기 폴백과 지연 생성이 사라져 유지보수가 나빠지는 데 비해, 46~47 calls는 목표 기기에서 문제가 되는 수준이 아니다.
- 기존 "대표 37칸" 테스트(예산 40, 실측 38)는 더 좁은 계약으로 그대로 남긴다.

## 2026-09-02 갱신 — 해제 경로

- `disposeCityScene3D()`는 리스너·DOM 오버레이 풀뿐 아니라 InstancedMesh(`dispose()`로 `instanceMatrix`/`instanceColor` 버퍼까지), 소유 geometry/material과 그 텍스처, 레벨별 보조 메시, 섬 환경, `CityAssetLoader`의 GLB 캐시(진행 중인 로드가 끝날 때까지 await)를 모두 해제하고 해제 직후의 `renderer.info.memory` 스냅샷을 돌려준다.
- 정상 런타임 경로에서는 호출하지 않는다(씬은 한 번 마운트되어 페이지 수명을 함께한다). 누수 회귀는 `window.__disposeCitySceneForTest`를 쓰는 `dispose.spec.js`가 지킨다: 해제 뒤 `geometries === 0`, `textures`는 three가 소유한 내부 공용 빈 텍스처(모듈 싱글턴이라 앱이 해제할 수 없다) 기준선으로 복귀.
- 실제 GLB로 교체된 시설의 폴백 geometry는 메시 교체가 끝난 뒤 `disposeReplacedFallbackGeometries()`가 버린다(교체 전에 버리면 다음 렌더가 같은 버퍼를 다시 올린다).

## 2026-09-03 갱신 — 도시 조명(낮/노을/밤) 제거

- 설정 패널의 "도시 조명"(낮·노을·밤)과 그것만 구동하던 낮/밤 장치를 없앴다. 씬은 항상 낮(sun 1.22 / hemisphere 1.08 / rim 0.3, `Constants.js`의 `WORLD_DAY_LIGHTING`)으로 렌더한다. 밝은/어두운 도시 **테마** 토글(`ThemeManager`)은 별개 기능이라 그대로 둔다.
- 밤에만 켜지던 창문 조명 InstancedMesh(`building-window-lights`) 레이어 하나가 사라져 최악의 경우 **실측 47 -> 46 draw calls**(3회 반복 동일)가 됐다. 예산은 **49**를 그대로 두어 여유를 남긴다.
