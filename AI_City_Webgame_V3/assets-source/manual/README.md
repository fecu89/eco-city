# User-provided 3D sources

사용자가 2026-08-30에 `/Users/fecu/game-creator/assets/`에 제공한 Quaternius 공식 배포본에서
게임에 필요한 파일만 선별한 보존 디렉터리다. 상위 원본 폴더는 삭제하거나 이동하지 않았다.

## 구조

- `quaternius-space/Original/`: 태양광 원본 glTF 2종
- `quaternius-space/Prepared/`: GLB로 패키징한 선별본
- `quaternius-farm/Original/`: 풍력 타워 원본 OBJ/MTL
- `quaternius-farm/Prepared/`: GLB 변환 및 재질 팔레트 통합본
- 각 소스 루트의 `License.txt`: 제공본에 포함된 원문 그대로 보존

각 디렉터리는 `assets-source/archives/*-user-provided.zip`에도 작고 재현 가능한 선별
아카이브로 보관한다. 해시와 용량은 `assets-source/manual-acquisition.json`에 기록한다.

## 변환

- 태양광: `gltf-transform copy`로 내장 리소스를 단일 GLB에 패키징
- 풍력: Cesium `obj2gltf` 3.2.0으로 OBJ/MTL을 GLB로 변환. MTL의 선형 diffuse 값은
  glTF base-color 텍스처에서 이중으로 어두워지지 않도록 sRGB 값으로 변환한 준비본을 사용
- 풍력 재질: `gltf-transform palette --min 2`로 평면 색상 2종을 8×4 텍스처 1개로 통합
- 풍력 메시: 작은 육각 타일에서 뭉쳐 보이는 원본 다엽 바퀴 노드를 제거하고 타워 본체만 사용.
  게임의 공용 3엽 로터 InstancedMesh 한 레이어를 얹어 실루엣을 명확하게 유지
- 런타임: 공통 `assets:optimize` 단계에서 meshopt medium, 단순화 없음, 텍스처 최대 1024px 적용

`obj2gltf`는 일회성 변환 도구로만 사용했고 런타임 및 프로젝트 의존성에는 남기지 않는다.
