# ADR-0003: City Kit 기반 영구 인스턴스 3D 렌더러

- 상태: 확정 (2026-08-29)
- [ADR-0002](./0002-3d-board-rendering.md)의 절차형 개별 Mesh 렌더러 결정을 대체한다.

## 결정

- `assets/city-kit`의 Kenney City Kit Industrial(CC0) 중 게임 시설에 맞는 주 모델 10개와 보조 모델 2개를 `public/assets/city-kit`에 선별해 제공한다. `CityAssetLoader`가 GLB를 비동기로 로드·정규화하며, 실패한 시설만 절차형 결합 geometry로 대체한다.
- 시설 레벨은 형태만 키우지 않고 세 신호를 중복 사용한다: Lv.1 중립 회색·0.86배·1칸, Lv.2 파랑·1배·2칸, Lv.3 주황·1.13배·3칸. 빨강은 레벨이 아니라 갈등/진단 경고에만 쓴다.
- 셀마다 `Mesh`/material/geometry를 생성·폐기하지 않는다. 타일 1개, 시설 종류별 1개, 보조 모델/레벨/상태 마커 레이어를 수명이 긴 `InstancedMesh`로 만들고 상태 갱신 시 `matrix`, `color`, `count`만 바꾼다.
- 배치(480ms), 업그레이드(520ms), 철거(320ms)는 짧은 상태 전환으로 표현한다. 풍력 로터와 데이터센터·화력·냉각 흐름은 공유 레이어에서 30fps로 갱신한다.
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
- **모든 모션을 60fps로 계속 렌더링**: 빈 화면에서도 GPU를 계속 사용하므로 기각. 상호작용/전환이 없으면 정지하고 ambient가 있을 때만 30fps로 렌더링한다.
